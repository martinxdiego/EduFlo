#include <fltKernel.h>
#include <ntstrsafe.h>
#include "../common/observation-protocol.h"
#include "../common/observation-decode.h"

// Audit only. No callback changes IoStatus, requests completion, reparses an
// operation, or opens/locks a subject file to make an attack fail.
// Installation/loading and ObservationPeer provisioning are external tasks.
#define Q_TAG 'BfdE'
typedef struct Q_NODE {LIST_ENTRY link;QB_EVENT event;} Q_NODE;
typedef struct Q_VOLUME {LIST_ENTRY link;PFLT_INSTANCE instance;QB_EVENT identity;} Q_VOLUME;
typedef struct Q_OPEN {LIST_ENTRY link;PFILE_OBJECT object;QB_EVENT identity;USHORT stream[256];USHORT stream_bytes;} Q_OPEN;
typedef struct Q_OPERATION {QB_EVENT event;PFLT_FILE_NAME_INFORMATION source,destination;} Q_OPERATION;
static PFLT_FILTER gFilter;
static PFLT_PORT gServer,gClient;
static PEPROCESS gPeerProcess;
static KSPIN_LOCK gLock;
static LIST_ENTRY gQueue,gVolumes,gOpens;
static QB_HEALTH gHealth;
static QB_PEER gPeer;
static QB_CONNECT gConnection;
static LONG64 gIdentity,gOperation;
static LONG gUsed;
static ULONG gOpenCount;

static ULONGLONG QTime(VOID){LARGE_INTEGER t;KeQuerySystemTimePrecise(&t);return (ULONGLONG)t.QuadPart;}
static VOID QFail(ULONG reason){KIRQL irql;KeAcquireSpinLock(&gLock,&irql);QBFail(&gHealth,reason);KeReleaseSpinLock(&gLock,irql);}
static VOID QInvalid(QB_EVENT* e){e->flags|=1;QFail(QB_UNSUPPORTED);}
static VOID QHeader(QB_EVENT* e,ULONG kind){RtlZeroMemory(e,sizeof(*e));e->magic=QB_MAGIC;e->version=QB_VERSION;e->size=sizeof(*e);e->kind=kind;}
// Caller holds gLock. Timestamp and sequence describe enqueue order together.
static VOID QQueueLocked(const QB_EVENT* e){
  Q_NODE* n=(Q_NODE*)ExAllocatePool2(POOL_FLAG_NON_PAGED,sizeof(Q_NODE),Q_TAG);
  if(!n){QBFail(&gHealth,QB_ALLOCATION);return;}n->event=*e;n->event.epoch=gHealth.epoch;
  if(!QBSequence(&gHealth,&n->event.sequence)){ExFreePoolWithTag(n,Q_TAG);return;}
  n->event.time=QTime();InsertTailList(&gQueue,&n->link);
}
static VOID QQueue(const QB_EVENT* e){KIRQL irql;KeAcquireSpinLock(&gLock,&irql);QQueueLocked(e);KeReleaseSpinLock(&gLock,irql);}
static BOOLEAN QName(PUNICODE_STRING name,USHORT* out,ULONG* bytes){
  if(!name||!name->Buffer||!name->Length||(name->Length&1)||name->Length>=QB_NAME*2)return FALSE;
  RtlZeroMemory(out,QB_NAME*2);RtlCopyMemory(out,name->Buffer,name->Length);*bytes=name->Length;return TRUE;
}
static BOOLEAN QSafe(VOID){return KeGetCurrentIrql()==PASSIVE_LEVEL&&!KeAreAllApcsDisabled()&&IoGetTopLevelIrp()==NULL;}
static PVOID QCopyInput(const VOID* input,ULONG bytes,ULONG bound){
  PVOID copy;if(!QSafe()||!input||!bytes||bytes>bound)return NULL;
  copy=ExAllocatePool2(POOL_FLAG_NON_PAGED,bytes,Q_TAG);if(!copy){QFail(QB_ALLOCATION);return NULL;}
  __try{RtlCopyMemory(copy,input,bytes);}__except(EXCEPTION_EXECUTE_HANDLER){ExFreePoolWithTag(copy,Q_TAG);return NULL;}
  return copy;
}
static BOOLEAN QVolumeIdentity(PFLT_INSTANCE instance,QB_EVENT* e){
  KIRQL irql;PLIST_ENTRY p;BOOLEAN found=FALSE;KeAcquireSpinLock(&gLock,&irql);
  for(p=gVolumes.Flink;p!=&gVolumes;p=p->Flink){Q_VOLUME* v=CONTAINING_RECORD(p,Q_VOLUME,link);
    if(v->instance==instance){e->volume=v->identity.volume;e->serial=v->identity.serial;found=TRUE;break;}}
  KeReleaseSpinLock(&gLock,irql);return found;
}
static BOOLEAN QOpenIdentity(PFILE_OBJECT object,QB_EVENT* e,BOOLEAN remove){
  KIRQL irql;PLIST_ENTRY p;Q_OPEN* found=NULL;KeAcquireSpinLock(&gLock,&irql);
  for(p=gOpens.Flink;p!=&gOpens;p=p->Flink){Q_OPEN* item=CONTAINING_RECORD(p,Q_OPEN,link);if(item->object==object){found=item;
    e->open_id=item->identity.open_id;e->stream_id=item->identity.stream_id;RtlCopyMemory(e->file_id,item->identity.file_id,16);
    e->name_bytes=item->identity.name_bytes;RtlCopyMemory(e->name,item->identity.name,sizeof(e->name));
    if(e->volume!=item->identity.volume||e->serial!=item->identity.serial)QBFail(&gHealth,QB_CORRELATION);
    if(remove){RemoveEntryList(p);gOpenCount--;}break;}}
  KeReleaseSpinLock(&gLock,irql);if(found&&remove)ExFreePoolWithTag(found,Q_TAG);return found!=NULL;
}
static VOID QOrigin(PFLT_CALLBACK_DATA data,QB_EVENT* e){
  PEPROCESS process;PACCESS_TOKEN token;PTOKEN_STATISTICS stats=NULL;NTSTATUS status;
  BOOLEAN copy=FALSE,effective=FALSE;SECURITY_IMPERSONATION_LEVEL level;
  if(!QSafe()||!data->Thread){QInvalid(e);return;}
  process=FltGetRequestorProcess(data);if(!process){QInvalid(e);return;}
  e->pid=HandleToULong(PsGetProcessId(process));e->tid=HandleToULong(PsGetThreadId(data->Thread));e->process_created=PsGetProcessCreateTimeQuadPart(process);
  token=PsReferenceImpersonationToken(data->Thread,&copy,&effective,&level);
  if(token){PsDereferenceImpersonationToken(token);QInvalid(e);return;}
  token=PsReferencePrimaryToken(process);if(!token){QInvalid(e);return;}
  status=SeQueryInformationToken(token,TokenStatistics,(PVOID*)&stats);
  if(NT_SUCCESS(status)&&stats){RtlCopyMemory(&e->token_id,&stats->TokenId,8);RtlCopyMemory(&e->token_modified,&stats->ModifiedId,8);}
  else QInvalid(e);if(stats)ExFreePool(stats);PsDereferencePrimaryToken(token);
}
static VOID QDestination(PFLT_CALLBACK_DATA data,PCFLT_RELATED_OBJECTS objects,Q_OPERATION* op){
  const ULONG length=data->Iopb->Parameters.SetFileInformation.Length;QB_NAME_INPUT decoded;NTSTATUS status;PVOID copy;
  C_ASSERT(FIELD_OFFSET(FILE_RENAME_INFORMATION,RootDirectory)==sizeof(HANDLE));
  C_ASSERT(FIELD_OFFSET(FILE_RENAME_INFORMATION,FileName)==sizeof(HANDLE)*2+4);
  copy=QCopyInput(data->Iopb->Parameters.SetFileInformation.InfoBuffer,length,QB_NAME*2+32);
  if(!copy){QInvalid(&op->event);return;}
  if(!QBDecodeName(op->event.information_class,copy,length,sizeof(HANDLE),&decoded)){ExFreePoolWithTag(copy,Q_TAG);QInvalid(&op->event);return;}
  status=FltGetDestinationFileNameInformation(objects->Instance,objects->FileObject,(HANDLE)(ULONG_PTR)decoded.root,
      (PWSTR)((PUCHAR)copy+decoded.name_offset),decoded.name_bytes,
      FLT_FILE_NAME_NORMALIZED|FLT_FILE_NAME_QUERY_DEFAULT,&op->destination);
  ExFreePoolWithTag(copy,Q_TAG);
  if(!NT_SUCCESS(status)||!op->destination||!QName(&op->destination->Name,op->event.destination,&op->event.destination_bytes))QInvalid(&op->event);
  // Only the copied bounded name is needed later. Set-information POST may
  // execute above APC_LEVEL; release this metadata now in the safe PRE path.
  if(op->destination){FltReleaseFileNameInformation(op->destination);op->destination=NULL;}
  op->event.disposition_flags=decoded.flags;
}
static VOID QBind(PFLT_CALLBACK_DATA data,PCFLT_RELATED_OBJECTS objects,Q_OPERATION* op){
  FILE_ID_INFORMATION id;ULONG returned=0;NTSTATUS status;Q_OPEN* item;QB_EVENT bound;KIRQL irql;PLIST_ENTRY p;
  PFLT_FILE_NAME_INFORMATION name=NULL,tunneled=NULL;
  if(!QSafe()||!objects->Instance||!objects->FileObject){QInvalid(&op->event);return;}
  status=FltGetFileNameInformation(data,FLT_FILE_NAME_NORMALIZED|FLT_FILE_NAME_QUERY_DEFAULT,&name);
  if(!NT_SUCCESS(status)||!name){QInvalid(&op->event);return;}
  status=FltParseFileNameInformation(name);
  if(!NT_SUCCESS(status)||name->Stream.Length>=512){FltReleaseFileNameInformation(name);QInvalid(&op->event);return;}
  status=FltQueryInformationFile(objects->Instance,objects->FileObject,&id,sizeof(id),FileIdInformation,&returned);
  if(!NT_SUCCESS(status)||returned<sizeof(id)){FltReleaseFileNameInformation(name);QInvalid(&op->event);return;}
  // A tunneled/changed name requires a separately typed resolution record; it
  // cannot silently replace the PRE request or become outside-root evidence.
  if(op->source){status=FltGetTunneledName(data,op->source,&tunneled);
    if(!NT_SUCCESS(status)||(tunneled&&!RtlEqualUnicodeString(&tunneled->Name,&op->source->Name,FALSE)))QInvalid(&op->event);
    if(tunneled)FltReleaseFileNameInformation(tunneled);}
  if(name->Name.Length!=op->event.name_bytes||RtlCompareMemory(name->Name.Buffer,op->event.name,op->event.name_bytes)!=op->event.name_bytes)QInvalid(&op->event);
  item=(Q_OPEN*)ExAllocatePool2(POOL_FLAG_NON_PAGED,sizeof(Q_OPEN),Q_TAG);
  if(!item){FltReleaseFileNameInformation(name);QFail(QB_ALLOCATION);QInvalid(&op->event);return;}
  RtlZeroMemory(item,sizeof(*item));item->object=objects->FileObject;item->stream_bytes=name->Stream.Length;
  if(name->Stream.Length)RtlCopyMemory(item->stream,name->Stream.Buffer,name->Stream.Length);FltReleaseFileNameInformation(name);
  RtlCopyMemory(op->event.file_id,&id.FileId,16);op->event.stream_id=(ULONGLONG)InterlockedIncrement64(&gIdentity);
  KeAcquireSpinLock(&gLock,&irql);
  if(gOpenCount>=QB_BOUND){QBFail(&gHealth,QB_OVERFLOW);KeReleaseSpinLock(&gLock,irql);ExFreePoolWithTag(item,Q_TAG);QInvalid(&op->event);return;}
  for(p=gOpens.Flink;p!=&gOpens;p=p->Flink){Q_OPEN* old=CONTAINING_RECORD(p,Q_OPEN,link);
    if(old->object==objects->FileObject){QBFail(&gHealth,QB_CORRELATION);op->event.flags|=1;}
    if(old->identity.volume==op->event.volume&&RtlCompareMemory(old->identity.file_id,op->event.file_id,16)==16
      &&old->stream_bytes==item->stream_bytes&&RtlCompareMemory(old->stream,item->stream,item->stream_bytes)==item->stream_bytes)op->event.stream_id=old->identity.stream_id;}
  item->identity=op->event;InsertTailList(&gOpens,&item->link);gOpenCount++;
  bound=op->event;bound.kind=QB_OPEN_BIND;bound.status=0;bound.information=0;QQueueLocked(&bound);
  KeReleaseSpinLock(&gLock,irql);
}
static FLT_PREOP_CALLBACK_STATUS QPre(PFLT_CALLBACK_DATA data,PCFLT_RELATED_OBJECTS objects,PVOID* completion){
  Q_OPERATION* op;KIRQL irql;BOOLEAN enter;UCHAR major=data->Iopb->MajorFunction;*completion=NULL;
  KeAcquireSpinLock(&gLock,&irql);enter=(BOOLEAN)QBEnter(&gHealth);KeReleaseSpinLock(&gLock,irql);
  if(!enter)return FLT_PREOP_SUCCESS_NO_CALLBACK;
  op=(Q_OPERATION*)ExAllocatePool2(POOL_FLAG_NON_PAGED,sizeof(*op),Q_TAG);
  if(!op){KeAcquireSpinLock(&gLock,&irql);QBFail(&gHealth,QB_ALLOCATION);QBLeave(&gHealth);KeReleaseSpinLock(&gLock,irql);return FLT_PREOP_SUCCESS_NO_CALLBACK;}
  RtlZeroMemory(op,sizeof(*op));QHeader(&op->event,QB_PRE);op->event.operation=(ULONGLONG)InterlockedIncrement64(&gOperation);
  if(!op->event.operation||!QVolumeIdentity(objects->Instance,&op->event))QInvalid(&op->event);QOrigin(data,&op->event);
  if(major!=IRP_MJ_CREATE&&!QOpenIdentity(objects->FileObject,&op->event,FALSE))QInvalid(&op->event);
  switch(major){
    case IRP_MJ_CREATE:
      op->event.operation_kind=QB_CREATE;op->event.open_id=(ULONGLONG)InterlockedIncrement64(&gIdentity);
      op->event.create_options=data->Iopb->Parameters.Create.Options;op->event.create_attributes=data->Iopb->Parameters.Create.FileAttributes;
      op->event.share_access=data->Iopb->Parameters.Create.ShareAccess;
      if(data->Iopb->Parameters.Create.SecurityContext)op->event.desired_access=data->Iopb->Parameters.Create.SecurityContext->DesiredAccess;else QInvalid(&op->event);
      if(!QSafe()||!NT_SUCCESS(FltGetFileNameInformation(data,FLT_FILE_NAME_NORMALIZED|FLT_FILE_NAME_QUERY_DEFAULT,&op->source))
        ||!QName(&op->source->Name,op->event.name,&op->event.name_bytes))QInvalid(&op->event);break;
    case IRP_MJ_WRITE:op->event.operation_kind=QB_WRITE;op->event.requested_bytes=data->Iopb->Parameters.Write.Length;
      op->event.offset=(ULONGLONG)data->Iopb->Parameters.Write.ByteOffset.QuadPart;break;
    case IRP_MJ_SET_INFORMATION:
      op->event.information_class=data->Iopb->Parameters.SetFileInformation.FileInformationClass;
      switch(op->event.information_class){
        case FileRenameInformation:case 56:case 65:case 66:op->event.operation_kind=QB_RENAME;QDestination(data,objects,op);break;
        case FileLinkInformation:case 57:case 72:case 73:op->event.operation_kind=QB_LINK;QDestination(data,objects,op);break;
        case FileEndOfFileInformation:case FileAllocationInformation:
          op->event.operation_kind=QB_TRUNCATE;
          __try{if(!QSafe()||data->Iopb->Parameters.SetFileInformation.Length!=sizeof(LARGE_INTEGER))ExRaiseStatus(STATUS_INVALID_PARAMETER);
            RtlCopyMemory(&op->event.requested_bytes,data->Iopb->Parameters.SetFileInformation.InfoBuffer,8);}
          __except(EXCEPTION_EXECUTE_HANDLER){QInvalid(&op->event);}break;
        case FileDispositionInformation:case 64:{
          ULONG length=data->Iopb->Parameters.SetFileInformation.Length;PVOID copy=QCopyInput(data->Iopb->Parameters.SetFileInformation.InfoBuffer,length,4);
          op->event.operation_kind=QB_DISPOSITION;
          if(!copy||!QBDecodeDisposition(op->event.information_class,copy,length,&op->event.disposition_flags))QInvalid(&op->event);
          if(copy)ExFreePoolWithTag(copy,Q_TAG);break;}
        default:QInvalid(&op->event);break;
      }break;
    case IRP_MJ_SET_SECURITY:op->event.operation_kind=QB_SECURITY;op->event.security_information=data->Iopb->Parameters.SetSecurity.SecurityInformation;break;
    case IRP_MJ_FILE_SYSTEM_CONTROL:
      op->event.control_code=data->Iopb->Parameters.FileSystemControl.Common.FsControlCode;
      if(op->event.control_code==FSCTL_SET_REPARSE_POINT)op->event.operation_kind=QB_REPARSE_SET;
      else if(op->event.control_code==FSCTL_DELETE_REPARSE_POINT)op->event.operation_kind=QB_REPARSE_REMOVE;
      if(op->event.operation_kind&&(data->Iopb->MinorFunction==IRP_MN_USER_FS_REQUEST||data->Iopb->MinorFunction==IRP_MN_KERNEL_CALL)){
        ULONG length=data->Iopb->Parameters.FileSystemControl.Buffered.InputBufferLength;
        PVOID copy=QCopyInput(data->Iopb->Parameters.FileSystemControl.Buffered.SystemBuffer,length,16384);
        if(!copy||!QBDecodeReparse(op->event.control_code,copy,length,&op->event))QInvalid(&op->event);
        if(copy)ExFreePoolWithTag(copy,Q_TAG);
      }else QInvalid(&op->event);break;
    case IRP_MJ_CLEANUP:op->event.operation_kind=QB_CLEANUP;break;
    case IRP_MJ_CLOSE:op->event.operation_kind=QB_CLOSE;break;
    default:QInvalid(&op->event);break;
  }
  QQueue(&op->event);*completion=op;return FLT_PREOP_SUCCESS_WITH_CALLBACK;
}
static FLT_POSTOP_CALLBACK_STATUS QPost(PFLT_CALLBACK_DATA data,PCFLT_RELATED_OBJECTS objects,PVOID completion,FLT_POST_OPERATION_FLAGS flags){
  Q_OPERATION* op=(Q_OPERATION*)completion;KIRQL irql;
  if(!op){QFail(QB_CORRELATION);return FLT_POSTOP_FINISHED_PROCESSING;}
  op->event.kind=QB_POST;op->event.status=data->IoStatus.Status;op->event.information=data->IoStatus.Information;
  if(flags&FLTFL_POST_OPERATION_DRAINING)QInvalid(&op->event);
  else if(op->event.operation_kind==QB_CREATE&&NT_SUCCESS(data->IoStatus.Status))QBind(data,objects,op);
  // A successful rename may affect other open names and directory descendants.
  // Until those aliases are resolved, preserving a cached old path is unsafe.
  if((op->event.operation_kind==QB_RENAME||op->event.operation_kind==QB_LINK)&&NT_SUCCESS(data->IoStatus.Status))QInvalid(&op->event);
  QQueue(&op->event);
  if(op->event.operation_kind==QB_CLOSE){op->event.kind=QB_OPEN_RELEASE;op->event.status=0;op->event.information=0;
    if(!QOpenIdentity(objects->FileObject,&op->event,TRUE))QInvalid(&op->event);QQueue(&op->event);}
  if(op->source)FltReleaseFileNameInformation(op->source);if(op->destination)FltReleaseFileNameInformation(op->destination);
  ExFreePoolWithTag(op,Q_TAG);KeAcquireSpinLock(&gLock,&irql);QBLeave(&gHealth);KeReleaseSpinLock(&gLock,irql);
  return FLT_POSTOP_FINISHED_PROCESSING;
}
static NTSTATUS QReadPeer(PUNICODE_STRING registry){
  OBJECT_ATTRIBUTES attr;HANDLE key=NULL;UNICODE_STRING name=RTL_CONSTANT_STRING(L"ObservationPeer");NTSTATUS status;ULONG returned=0;
  UCHAR bytes[sizeof(KEY_VALUE_PARTIAL_INFORMATION)+sizeof(QB_PEER)];PKEY_VALUE_PARTIAL_INFORMATION value=(PKEY_VALUE_PARTIAL_INFORMATION)bytes;
  InitializeObjectAttributes(&attr,registry,OBJ_KERNEL_HANDLE|OBJ_CASE_INSENSITIVE,NULL,NULL);
  status=ZwOpenKey(&key,KEY_QUERY_VALUE,&attr);if(!NT_SUCCESS(status))return status;
  status=ZwQueryValueKey(key,&name,KeyValuePartialInformation,value,sizeof(bytes),&returned);ZwClose(key);
  if(!NT_SUCCESS(status)||value->Type!=REG_BINARY||value->DataLength!=sizeof(gPeer))return STATUS_ACCESS_DENIED;
  RtlCopyMemory(&gPeer,value->Data,sizeof(gPeer));
  if(gPeer.magic!=QB_MAGIC||gPeer.version!=QB_VERSION||gPeer.size!=sizeof(gPeer)||!gPeer.pid||!gPeer.created
    ||gPeer.sid_bytes<8||gPeer.sid_bytes>sizeof(gPeer.sid)||!RtlValidSid(gPeer.sid)||RtlLengthSid(gPeer.sid)!=gPeer.sid_bytes
    ||!gPeer.image[0]||gPeer.image[QB_NAME-1])return STATUS_ACCESS_DENIED;
  return STATUS_SUCCESS;
}
static NTSTATUS QConnect(PFLT_PORT port,PVOID cookie,PVOID context,ULONG bytes,PVOID* connection){
  QB_CONNECT request;PACCESS_TOKEN token;PTOKEN_USER user=NULL;PUNICODE_STRING image=NULL;NTSTATUS status;KIRQL irql;QB_EVENT begin;PLIST_ENTRY p;
  UNREFERENCED_PARAMETER(cookie);*connection=NULL;
  if(bytes!=sizeof(request)||!context||!QSafe())return STATUS_ACCESS_DENIED;
  __try{RtlCopyMemory(&request,context,sizeof(request));}__except(EXCEPTION_EXECUTE_HANDLER){return STATUS_ACCESS_DENIED;}
  if(request.magic!=QB_MAGIC||request.version!=QB_VERSION||request.size!=sizeof(request)||request.reserved||!request.epoch
    ||request.pid!=gPeer.pid||request.created!=gPeer.created||HandleToULong(PsGetCurrentProcessId())!=gPeer.pid
    ||PsGetProcessCreateTimeQuadPart(PsGetCurrentProcess())!=gPeer.created
    ||RtlCompareMemory(request.profile,gPeer.profile,32)!=32||RtlCompareMemory(request.fixture,gPeer.fixture,32)!=32||RtlCompareMemory(request.boot,gPeer.boot,32)!=32)return STATUS_ACCESS_DENIED;
  token=PsReferencePrimaryToken(PsGetCurrentProcess());status=SeQueryInformationToken(token,TokenUser,(PVOID*)&user);PsDereferencePrimaryToken(token);
  if(!NT_SUCCESS(status)||!user)return STATUS_ACCESS_DENIED;
  status=RtlEqualSid(user->User.Sid,gPeer.sid)?STATUS_SUCCESS:STATUS_ACCESS_DENIED;ExFreePool(user);if(!NT_SUCCESS(status))return status;
  status=SeLocateProcessImageName(PsGetCurrentProcess(),&image);
  if(NT_SUCCESS(status)&&image){UNICODE_STRING expected;RtlInitUnicodeString(&expected,(PCWSTR)gPeer.image);
    status=RtlEqualUnicodeString(image,&expected,FALSE)?STATUS_SUCCESS:STATUS_ACCESS_DENIED;ExFreePool(image);}
  else return STATUS_ACCESS_DENIED;if(!NT_SUCCESS(status))return status;
  if(InterlockedCompareExchange(&gUsed,1,0)!=0)return STATUS_ACCESS_DENIED;
  KeAcquireSpinLock(&gLock,&irql);
  if(!QBStart(&gHealth,request.epoch,QTime())){KeReleaseSpinLock(&gLock,irql);return STATUS_ACCESS_DENIED;}
  gConnection=request;gPeerProcess=PsGetCurrentProcess();ObReferenceObject(gPeerProcess);gClient=port;
  QHeader(&begin,QB_BEGIN);QQueueLocked(&begin);
  if(!IsListEmpty(&gQueue))gHealth.start_time=CONTAINING_RECORD(gQueue.Flink,Q_NODE,link)->event.time;
  for(p=gVolumes.Flink;p!=&gVolumes;p=p->Flink)QQueueLocked(&CONTAINING_RECORD(p,Q_VOLUME,link)->identity);
  // No independently sealed all-reachable-volume census yet. A nonempty local
  // attachment list is not proof of global coverage; never issue completeness.
  QBFail(&gHealth,QB_UNSUPPORTED);KeReleaseSpinLock(&gLock,irql);return STATUS_SUCCESS;
}
static VOID QDisconnect(PVOID cookie){KIRQL irql;UNREFERENCED_PARAMETER(cookie);FltCloseClientPort(gFilter,&gClient);
  KeAcquireSpinLock(&gLock,&irql);QBDisconnected(&gHealth);KeReleaseSpinLock(&gLock,irql);
  if(gPeerProcess){ObDereferenceObject(gPeerProcess);gPeerProcess=NULL;}}
static NTSTATUS QMessage(PVOID cookie,PVOID input,ULONG inputBytes,PVOID output,ULONG outputBytes,PULONG returned){
  QB_COMMAND request;QB_HEALTH health;Q_NODE* node=NULL;KIRQL irql;QB_EVENT end;UNREFERENCED_PARAMETER(cookie);*returned=0;
  if(inputBytes!=sizeof(request)||PsGetCurrentProcess()!=gPeerProcess)return STATUS_ACCESS_DENIED;
  __try{RtlCopyMemory(&request,input,sizeof(request));}__except(EXCEPTION_EXECUTE_HANDLER){return STATUS_INVALID_USER_BUFFER;}
  if(request.magic!=QB_MAGIC||request.version!=QB_VERSION||request.size!=sizeof(request)||request.epoch!=gConnection.epoch
    ||RtlCompareMemory(request.challenge,gConnection.challenge,32)!=32||request.verb<QB_POLL||request.verb>QB_END_SESSION)return STATUS_ACCESS_DENIED;
  if(outputBytes<sizeof(QB_EVENT))return STATUS_BUFFER_TOO_SMALL;
  KeAcquireSpinLock(&gLock,&irql);
  if(request.verb==QB_DRAIN_REQUEST)QBDrain(&gHealth);
  if(request.verb==QB_SEAL_REQUEST&&QBSeal(&gHealth,QTime())){
    QHeader(&end,QB_END);QQueueLocked(&end);
    if(!IsListEmpty(&gQueue))gHealth.end_time=CONTAINING_RECORD(gQueue.Blink,Q_NODE,link)->event.time;
  }
  if(request.verb==QB_END_SESSION)QBEndSession(&gHealth);
  if(request.verb==QB_POLL&&!IsListEmpty(&gQueue)){node=CONTAINING_RECORD(RemoveHeadList(&gQueue),Q_NODE,link);gHealth.queued--;}
  health=gHealth;KeReleaseSpinLock(&gLock,irql);
  __try{if(node){RtlCopyMemory(output,&node->event,sizeof(node->event));*returned=sizeof(node->event);}
    else {RtlCopyMemory(output,&health,sizeof(health));*returned=sizeof(health);}}
  __except(EXCEPTION_EXECUTE_HANDLER){if(node)ExFreePoolWithTag(node,Q_TAG);QFail(QB_DROP);return STATUS_INVALID_USER_BUFFER;}
  if(node)ExFreePoolWithTag(node,Q_TAG);return STATUS_SUCCESS;
}
static NTSTATUS QInstance(PCFLT_RELATED_OBJECTS objects,FLT_INSTANCE_SETUP_FLAGS flags,DEVICE_TYPE device,FLT_FILESYSTEM_TYPE fs){
  Q_VOLUME* v;UNICODE_STRING name;IO_STATUS_BLOCK iosb;ULONG needed=0;NTSTATUS status;KIRQL irql;
  UCHAR info[sizeof(FILE_FS_VOLUME_INFORMATION)+512];UNREFERENCED_PARAMETER(flags);
  v=(Q_VOLUME*)ExAllocatePool2(POOL_FLAG_NON_PAGED,sizeof(*v),Q_TAG);if(!v){QFail(QB_ALLOCATION);return STATUS_SUCCESS;}
  RtlZeroMemory(v,sizeof(*v));v->instance=objects->Instance;QHeader(&v->identity,QB_VOLUME_ATTACH);v->identity.volume=(ULONGLONG)InterlockedIncrement64(&gIdentity);
  name.Buffer=(PWSTR)v->identity.name;name.Length=0;name.MaximumLength=sizeof(v->identity.name)-2;
  status=FltGetVolumeGuidName(objects->Volume,&name,&needed);v->identity.name_bytes=name.Length;
  if(!NT_SUCCESS(status)||device!=FILE_DEVICE_DISK_FILE_SYSTEM||fs!=FLT_FSTYPE_NTFS){v->identity.flags|=1;QFail(QB_UNSUPPORTED);}
  status=FltQueryVolumeInformation(objects->Instance,&iosb,info,sizeof(info),FileFsVolumeInformation);
  if(NT_SUCCESS(status))v->identity.serial=((PFILE_FS_VOLUME_INFORMATION)info)->VolumeSerialNumber;
  else {v->identity.flags|=1;QFail(QB_UNSUPPORTED);}
  KeAcquireSpinLock(&gLock,&irql);
  if(gHealth.volumes>=256){QBFail(&gHealth,QB_OVERFLOW);KeReleaseSpinLock(&gLock,irql);ExFreePoolWithTag(v,Q_TAG);return STATUS_SUCCESS;}
  InsertTailList(&gVolumes,&v->link);gHealth.volumes++;
  if(gHealth.state!=QB_COLD){QQueueLocked(&v->identity);QBFail(&gHealth,QB_CORRELATION);}KeReleaseSpinLock(&gLock,irql);return STATUS_SUCCESS;
}
static VOID QTeardown(PCFLT_RELATED_OBJECTS objects,FLT_INSTANCE_TEARDOWN_FLAGS flags){
  KIRQL irql;PLIST_ENTRY p;Q_VOLUME* found=NULL;UNREFERENCED_PARAMETER(flags);KeAcquireSpinLock(&gLock,&irql);
  for(p=gVolumes.Flink;p!=&gVolumes;p=p->Flink){Q_VOLUME* v=CONTAINING_RECORD(p,Q_VOLUME,link);if(v->instance==objects->Instance){found=v;RemoveEntryList(p);gHealth.volumes--;
    v->identity.kind=QB_VOLUME_DETACH;if(gHealth.state!=QB_COLD)QQueueLocked(&v->identity);break;}}
  QBFail(&gHealth,QB_CORRELATION);KeReleaseSpinLock(&gLock,irql);if(found)ExFreePoolWithTag(found,Q_TAG);
}
static NTSTATUS QUnload(FLT_FILTER_UNLOAD_FLAGS flags){
  KIRQL irql;UNREFERENCED_PARAMETER(flags);KeAcquireSpinLock(&gLock,&irql);QBFail(&gHealth,QB_UNLOAD);gHealth.state=QB_DRAINING;KeReleaseSpinLock(&gLock,irql);
  FltCloseCommunicationPort(gServer);FltUnregisterFilter(gFilter);
  while(!IsListEmpty(&gQueue))ExFreePoolWithTag(CONTAINING_RECORD(RemoveHeadList(&gQueue),Q_NODE,link),Q_TAG);
  while(!IsListEmpty(&gOpens))ExFreePoolWithTag(CONTAINING_RECORD(RemoveHeadList(&gOpens),Q_OPEN,link),Q_TAG);
  while(!IsListEmpty(&gVolumes))ExFreePoolWithTag(CONTAINING_RECORD(RemoveHeadList(&gVolumes),Q_VOLUME,link),Q_TAG);return STATUS_SUCCESS;
}
static const FLT_OPERATION_REGISTRATION gOperations[]={
  {IRP_MJ_CREATE,0,QPre,QPost},{IRP_MJ_WRITE,0,QPre,QPost},{IRP_MJ_SET_INFORMATION,0,QPre,QPost},
  {IRP_MJ_SET_SECURITY,0,QPre,QPost},{IRP_MJ_FILE_SYSTEM_CONTROL,0,QPre,QPost},{IRP_MJ_CLEANUP,0,QPre,QPost},{IRP_MJ_CLOSE,0,QPre,QPost},{IRP_MJ_OPERATION_END}
};
static const FLT_REGISTRATION gRegistration={sizeof(FLT_REGISTRATION),FLT_REGISTRATION_VERSION,0,NULL,gOperations,QUnload,QInstance,NULL,QTeardown,NULL,NULL,NULL,NULL};
NTSTATUS DriverEntry(PDRIVER_OBJECT driver,PUNICODE_STRING registry){
  NTSTATUS status;PSECURITY_DESCRIPTOR security=NULL;OBJECT_ATTRIBUTES attributes;UNICODE_STRING name=RTL_CONSTANT_STRING(L"\\EduFlowQualificationAuditB");
  KeInitializeSpinLock(&gLock);InitializeListHead(&gQueue);InitializeListHead(&gVolumes);InitializeListHead(&gOpens);
  RtlZeroMemory(&gHealth,sizeof(gHealth));gHealth.magic=QB_MAGIC;gHealth.version=QB_VERSION;gHealth.size=sizeof(gHealth);
  status=QReadPeer(registry);if(!NT_SUCCESS(status))return status;
  status=FltRegisterFilter(driver,&gRegistration,&gFilter);if(!NT_SUCCESS(status))return status;
  status=FltBuildDefaultSecurityDescriptor(&security,FLT_PORT_ALL_ACCESS);
  if(NT_SUCCESS(status)){InitializeObjectAttributes(&attributes,&name,OBJ_CASE_INSENSITIVE|OBJ_KERNEL_HANDLE,NULL,security);
    status=FltCreateCommunicationPort(gFilter,&gServer,&attributes,NULL,QConnect,QDisconnect,QMessage,1);FltFreeSecurityDescriptor(security);}
  if(NT_SUCCESS(status))status=FltStartFiltering(gFilter);
  if(!NT_SUCCESS(status)){if(gServer)FltCloseCommunicationPort(gServer);FltUnregisterFilter(gFilter);}return status;
}
