#include "../common/windows.hpp"
#include <winioctl.h>
#include "facts.hpp"
#include "../common/composite-access.hpp"
#include "../common/reader.hpp"
#include "../common/ipc.hpp"
#include "../common/token-profile.hpp"
#include "../common/module-binding.hpp"

using namespace q;
namespace {
void observe_token(HANDLE token,const Q_BOUND_PROCESS& bound,Q_TOKEN& out,bool impersonating) {
  out.role=bound.role;out.pid=bound.pid;out.tid=bound.tid;out.process_created=bound.created;memcpy(out.image,bound.image,32);
  const auto statsBytes=token_info(token,TokenStatistics);const auto stats=reinterpret_cast<const TOKEN_STATISTICS*>(statsBytes.data());
  const auto user=token_info(token,TokenUser); sid_text(reinterpret_cast<const TOKEN_USER*>(user.data())->User.Sid,out.user);
  const auto owner=token_info(token,TokenOwner); sid_text(reinterpret_cast<const TOKEN_OWNER*>(owner.data())->Owner,out.owner);
  const auto integrity=token_info(token,TokenIntegrityLevel); sid_text(reinterpret_cast<const TOKEN_MANDATORY_LABEL*>(integrity.data())->Label.Sid,out.integrity);
  const auto type=token_info(token,TokenType); out.token_type=*reinterpret_cast<const DWORD*>(type.data());
  const auto elevation=token_info(token,TokenElevationType); out.elevation=*reinterpret_cast<const DWORD*>(elevation.data());
  if(impersonating) { const auto level=token_info(token,TokenImpersonationLevel); out.impersonation=1+*reinterpret_cast<const DWORD*>(level.data()); }
  memcpy(&out.token_id,&stats->TokenId,8); memcpy(&out.authentication_id,&stats->AuthenticationId,8);
  memcpy(&out.modified_id,&stats->ModifiedId,8);
  const auto groups=token_info(token,TokenGroups); const auto g=reinterpret_cast<const TOKEN_GROUPS*>(groups.data()); require(g->GroupCount<=Q_MAX_MEMBERS);
  out.group_count=g->GroupCount; for(DWORD i=0;i<g->GroupCount;i++){sid_text(g->Groups[i].Sid,out.groups[i].sid);out.groups[i].attributes=g->Groups[i].Attributes;}
  const auto restrictions=token_info(token,TokenRestrictedSids); const auto r=reinterpret_cast<const TOKEN_GROUPS*>(restrictions.data()); require(r->GroupCount<=Q_MAX_MEMBERS);
  out.restricted_count=r->GroupCount; for(DWORD i=0;i<r->GroupCount;i++){sid_text(r->Groups[i].Sid,out.restricted[i].sid);out.restricted[i].attributes=r->Groups[i].Attributes;}
  const auto privileges=token_info(token,TokenPrivileges); const auto p=reinterpret_cast<const TOKEN_PRIVILEGES*>(privileges.data()); require(p->PrivilegeCount<=Q_MAX_PRIVILEGES);
  out.privilege_count=p->PrivilegeCount; for(DWORD i=0;i<p->PrivilegeCount;i++) out.privileges[i]={p->Privileges[i].Luid.LowPart,p->Privileges[i].Luid.HighPart,p->Privileges[i].Attributes};
  const auto after=token_info(token,TokenStatistics);const auto final=reinterpret_cast<const TOKEN_STATISTICS*>(after.data());
  require(memcmp(&final->TokenId,&stats->TokenId,sizeof(LUID))==0&&memcmp(&final->ModifiedId,&stats->ModifiedId,sizeof(LUID))==0,ERROR_RETRY);
}
void encode_token(std::vector<uint8_t>& bytes,const Q_TOKEN& token) {
  append(bytes,&token,offsetof(Q_TOKEN,groups));append(bytes,token.groups,token.group_count*sizeof(Q_GROUP));
  append(bytes,token.restricted,token.restricted_count*sizeof(Q_GROUP));append(bytes,token.privileges,token.privilege_count*sizeof(Q_PRIVILEGE));
}
struct token_pair { handle primary,effective;std::array<uint8_t,32> primary_profile,effective_profile;bool impersonating;std::array<uint64_t,4> identities; };
token_pair inspect_token(const Q_BOUND_PROCESS& bound,Q_TOKEN& out,std::vector<uint8_t>& facts,uint32_t index) {
  require(bound.role>=1&&bound.role<=6&&bound.pid&&bound.tid);
  auto boundProcess=bound_process(bound);
  handle process(OpenProcess(PROCESS_QUERY_INFORMATION|PROCESS_VM_READ|PROCESS_DUP_HANDLE|SYNCHRONIZE,FALSE,bound.pid));require(process.value&&alive(process)&&created(process)==bound.created);
  handle thread(OpenThread(THREAD_QUERY_INFORMATION,FALSE,bound.tid));require(thread.value&&GetProcessIdOfThread(thread)==bound.pid);
  HANDLE raw=nullptr;require(OpenProcessToken(process,TOKEN_QUERY|TOKEN_DUPLICATE,&raw));handle primary(raw);
  const bool impersonating=OpenThreadToken(thread,TOKEN_QUERY|TOKEN_DUPLICATE,TRUE,&raw)!=0;
  if(!impersonating){require(GetLastError()==ERROR_NO_TOKEN);require(OpenProcessToken(process,TOKEN_QUERY|TOKEN_DUPLICATE,&raw));}
  handle effective(raw);const auto primaryProfile=token_profile(primary),effectiveProfile=token_profile(effective,!impersonating);
  auto primaryOut=std::make_unique<Q_TOKEN>();observe_token(primary,bound,*primaryOut,false);observe_token(effective,bound,out,impersonating);
  require(wcscmp(primaryOut->user,bound.sid)==0);
  std::vector<uint8_t> primaryBytes;encode_token(primaryBytes,*primaryOut);fact(facts,Q_FACT_PRIMARY_TOKEN,index,primaryBytes.data(),primaryBytes.size());
  Q_TOKEN_CONTEXT context{};
  auto field=[](HANDLE token,TOKEN_INFORMATION_CLASS kind){const auto bytes=token_info(token,kind);require(bytes.size()==sizeof(DWORD));DWORD value=0;memcpy(&value,bytes.data(),4);return value;};
  context.primary_session=field(primary,TokenSessionId);context.effective_session=field(effective,TokenSessionId);
  context.primary_mandatory=field(primary,TokenMandatoryPolicy);context.effective_mandatory=field(effective,TokenMandatoryPolicy);
  context.primary_ui_access=field(primary,TokenUIAccess);context.effective_ui_access=field(effective,TokenUIAccess);
  context.primary_app_container=field(primary,TokenIsAppContainer);context.effective_app_container=field(effective,TokenIsAppContainer);
  context.primary_virtualization_allowed=field(primary,TokenVirtualizationAllowed);context.effective_virtualization_allowed=field(effective,TokenVirtualizationAllowed);
  context.primary_virtualization_enabled=field(primary,TokenVirtualizationEnabled);context.effective_virtualization_enabled=field(effective,TokenVirtualizationEnabled);
  memcpy(context.primary_profile,primaryProfile.data(),32);memcpy(context.effective_profile,effectiveProfile.data(),32);
  fact(facts,Q_FACT_TOKEN_CONTEXT,index,&context,sizeof(context));
  const auto handles=stable_handles(process);std::vector<uint8_t> records;uint32_t count=static_cast<uint32_t>(handles.size());append(records,&count,4);
  for(const auto& h:handles)append(records,&h,sizeof(h));fact(facts,Q_FACT_HANDLES,index,records.data(),records.size());
  require(primaryProfile==token_profile(primary)&&effectiveProfile==token_profile(effective,!impersonating)&&alive(process)&&created(process)==bound.created,ERROR_RETRY);
  HANDLE currentRaw=nullptr;const bool currentImpersonating=OpenThreadToken(thread,TOKEN_QUERY,TRUE,&currentRaw)!=0;
  if(!currentImpersonating){require(GetLastError()==ERROR_NO_TOKEN);require(OpenProcessToken(process,TOKEN_QUERY,&currentRaw));}
  handle currentToken(currentRaw);auto currentStats=token_info(currentToken,TokenStatistics);
  require(currentImpersonating==impersonating&&memcmp(&reinterpret_cast<const TOKEN_STATISTICS*>(currentStats.data())->TokenId,&out.token_id,sizeof(LUID))==0,ERROR_RETRY);
  HANDLE p=nullptr,e=nullptr;require(DuplicateToken(primary,SecurityImpersonation,&p));handle primaryCopy(p);
  require(DuplicateToken(effective,SecurityImpersonation,&e));handle effectiveCopy(e);
  return {std::move(primaryCopy),std::move(effectiveCopy),primaryProfile,effectiveProfile,impersonating,{primaryOut->token_id,primaryOut->modified_id,out.token_id,out.modified_id}};
}
void inspect_object(const Q_BOUND_OBJECT& bound,uint32_t index,const std::vector<token_pair>& tokens,std::vector<uint8_t>& payload,
  std::vector<uint8_t>& facts,std::vector<std::wstring>& names,std::vector<std::vector<uint8_t>>& descriptors,std::vector<DWORD>& objectAttributes) {
  handle file(CreateFileW(bound.path,FILE_READ_ATTRIBUTES|READ_CONTROL,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr)); require(file.value!=INVALID_HANDLE_VALUE,ERROR_ACCESS_DENIED);
  FILE_ID_INFO identity{}; FILE_ATTRIBUTE_TAG_INFO attributes{};
  require(GetFileInformationByHandleEx(file,FileIdInfo,&identity,sizeof(identity))); require(GetFileInformationByHandleEx(file,FileAttributeTagInfo,&attributes,sizeof(attributes)));
  require(identity.VolumeSerialNumber==bound.volume && memcmp(identity.FileId.Identifier,bound.file_id,16)==0);
  Q_OBJECT out{}; out.index=index; out.volume=identity.VolumeSerialNumber; memcpy(out.file_id,identity.FileId.Identifier,16); out.attributes=attributes.FileAttributes; out.reparse_tag=attributes.ReparseTag;
  PSID owner=nullptr; PACL dacl=nullptr,sacl=nullptr; PSECURITY_DESCRIPTOR descriptor=nullptr;
  constexpr DWORD securityParts=OWNER_SECURITY_INFORMATION|GROUP_SECURITY_INFORMATION|DACL_SECURITY_INFORMATION|LABEL_SECURITY_INFORMATION|ATTRIBUTE_SECURITY_INFORMATION|SCOPE_SECURITY_INFORMATION;
  require(GetSecurityInfo(file,SE_FILE_OBJECT,securityParts,&owner,nullptr,&dacl,&sacl,&descriptor)==ERROR_SUCCESS);
  local_memory freeDescriptor{descriptor}; require(IsValidSecurityDescriptor(descriptor) && dacl != nullptr); sid_text(owner,out.owner);
  SECURITY_DESCRIPTOR_CONTROL control{}; DWORD revision=0; require(GetSecurityDescriptorControl(descriptor,&control,&revision)); out.descriptor_control=control;
  // Conditional/object-specific ACE evaluation is not silently flattened into allow bits.
  for(DWORD i=0;i<dacl->AceCount;i++){ void* ace=nullptr; require(GetAce(dacl,i,&ace)); const BYTE type=static_cast<ACE_HEADER*>(ace)->AceType;
    require(type==ACCESS_ALLOWED_ACE_TYPE || type==ACCESS_DENIED_ACE_TYPE,ERROR_NOT_SUPPORTED); }
  out.descriptor_bytes=GetSecurityDescriptorLength(descriptor); require(out.descriptor_bytes<=Q_MAX_DESCRIPTOR);
  Q_MANDATORY_FACT mandatory{};
  if(sacl){require(IsValidAcl(sacl));for(DWORD i=0;i<sacl->AceCount;i++){
    void* raw=nullptr;require(GetAce(sacl,i,&raw));const auto ace=static_cast<SYSTEM_MANDATORY_LABEL_ACE*>(raw);
    require(ace->Header.AceType==SYSTEM_MANDATORY_LABEL_ACE_TYPE&&!(ace->Header.AceFlags&~VALID_INHERIT_FLAGS),ERROR_NOT_SUPPORTED);
    if(ace->Header.AceFlags&INHERIT_ONLY_ACE)continue;
    require(mandatory.present==0,ERROR_NOT_SUPPORTED);
    require((ace->Mask&~SYSTEM_MANDATORY_LABEL_VALID_MASK)==0);mandatory.present=1;mandatory.mask=ace->Mask;sid_text(&ace->SidStart,mandatory.integrity);
  }}
  fact(facts,Q_FACT_MANDATORY,index,&mandatory,sizeof(mandatory));
  GENERIC_MAPPING mapping{FILE_GENERIC_READ,FILE_GENERIC_WRITE,FILE_GENERIC_EXECUTE,FILE_ALL_ACCESS};
  for(size_t i=0;i<tokens.size();i++)for(const bool primary:{false,true}){
    DWORD length=4096,granted=0;BOOL allowed=FALSE;std::vector<uint8_t> privilegeBuffer(length);
    require(AccessCheck(descriptor,primary?tokens[i].primary.value:tokens[i].effective.value,MAXIMUM_ALLOWED,&mapping,reinterpret_cast<PRIVILEGE_SET*>(privilegeBuffer.data()),&length,&granted,&allowed));
    (primary?out.primary_access:out.effective_access)[i]=allowed?granted:0;
  }
  append(payload,&out,sizeof(out)); append(payload,descriptor,out.descriptor_bytes);
  descriptors.emplace_back(static_cast<uint8_t*>(descriptor),static_cast<uint8_t*>(descriptor)+out.descriptor_bytes);objectAttributes.push_back(out.attributes);
  names.push_back(final_name(file));const auto volume=volume_facts(file);fact(facts,Q_FACT_VOLUME,index,&volume,sizeof(volume));
  const auto filters=filter_facts(file);fact(facts,Q_FACT_FILTERS,index,filters.data(),filters.size());
  FILE_ID_INFO after{};require(GetFileInformationByHandleEx(file,FileIdInfo,&after,sizeof(after))&&memcmp(&after,&identity,sizeof(after))==0&&names.back()==final_name(file),ERROR_RETRY);
  PSECURITY_DESCRIPTOR currentDescriptor=nullptr;
  require(GetSecurityInfo(file,SE_FILE_OBJECT,securityParts,nullptr,nullptr,nullptr,nullptr,&currentDescriptor)==ERROR_SUCCESS);
  local_memory releaseCurrent{currentDescriptor};require(IsValidSecurityDescriptor(currentDescriptor));
  require(GetSecurityDescriptorLength(currentDescriptor)==out.descriptor_bytes
    &&memcmp(currentDescriptor,descriptor,out.descriptor_bytes)==0,ERROR_RETRY);
  FILE_ATTRIBUTE_TAG_INFO currentAttributes{};
  require(GetFileInformationByHandleEx(file,FileAttributeTagInfo,&currentAttributes,sizeof(currentAttributes))
    &&memcmp(&currentAttributes,&attributes,sizeof(attributes))==0,ERROR_RETRY);
}
}
int wmain(int argc,wchar_t**) {
  if(argc!=1 || !allowed_environment()) return ERROR_ACCESS_DENIED;
  try {
    const auto fixed=load_deployment();const auto& config=fixed->inspection;
    require(GetCurrentProcessId()==fixed->collector.pid);auto own=bound_process(fixed->collector);
    verify_loaded_modules(*fixed,fixed->collector);verify_loaded_modules(*fixed,broker_binding(*fixed));
    auto pipe=accept_fixed_pipe(collector_pipe,broker_binding(*fixed));
    const auto received=receive_message(pipe,sizeof(Q_REQUEST));require(received.size()==sizeof(Q_REQUEST));
    Q_REQUEST request{};memcpy(&request,received.data(),sizeof(request));bound_request(request,config);
    Q_HEADER header{}; header.request=request; header.status=1; header.object_count=config.object_count; header.token_count=config.process_count;
    auto ownImage=process_image(GetCurrentProcess()); memcpy(header.collector_image,ownImage.data(),32);
    std::vector<uint8_t> payload,facts; std::vector<token_pair> tokens;std::vector<std::wstring> names;
    std::vector<std::vector<uint8_t>> descriptors;std::vector<DWORD> objectAttributes;std::vector<uint32_t> parents(config.object_count,UINT32_MAX);
    for(uint32_t i=0;i<config.process_count;i++){
      auto out=std::make_unique<Q_TOKEN>(); tokens.push_back(inspect_token(config.processes[i],*out,facts,i));
      encode_token(payload,*out);
    }
    for(uint32_t i=0;i<config.object_count;i++) inspect_object(config.objects[i],i,tokens,payload,facts,names,descriptors,objectAttributes);
    require(std::set<std::wstring>(names.begin(),names.end()).size()==names.size());
    for(uint32_t i=0;i<config.object_count;i++){
      const auto& name=names[i];Q_RESOLUTION resolution{};resolution.parent_index=UINT32_MAX;
      const auto volumeEnd=name.find(L"}\\");require(volumeEnd!=std::wstring::npos);
      resolution.root=(name.size()==volumeEnd+2)?1:0;
      if(!resolution.root){auto parent=name.substr(0,name.find_last_of(L'\\'));if(parent.size()==volumeEnd+1)parent+=L'\\';
        const auto found=std::find(names.begin(),names.end(),parent);require(found!=names.end(),ERROR_NOT_SUPPORTED);resolution.parent_index=static_cast<uint32_t>(found-names.begin());}
      const auto nameHash=byte_hash(name.data(),name.size()*2);memcpy(resolution.final_name,nameHash.data(),32);
      handle file(CreateFileW(config.objects[i].path,FILE_READ_ATTRIBUTES,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));require(file.value!=INVALID_HANDLE_VALUE);
      FILE_ATTRIBUTE_TAG_INFO attr{};require(GetFileInformationByHandleEx(file,FileAttributeTagInfo,&attr,sizeof(attr)));
      FILE_ID_INFO currentIdentity{};require(GetFileInformationByHandleEx(file,FileIdInfo,&currentIdentity,sizeof(currentIdentity)));
      require(currentIdentity.VolumeSerialNumber==config.objects[i].volume&&memcmp(currentIdentity.FileId.Identifier,config.objects[i].file_id,16)==0,ERROR_RETRY);
      if(attr.FileAttributes&FILE_ATTRIBUTE_REPARSE_POINT){std::array<uint8_t,MAXIMUM_REPARSE_DATA_BUFFER_SIZE> buffer{};DWORD count=0;
        require(DeviceIoControl(file,FSCTL_GET_REPARSE_POINT,nullptr,0,buffer.data(),static_cast<DWORD>(buffer.size()),&count,nullptr)&&count>=8);
        resolution.reparse_bytes=count;auto hash=byte_hash(buffer.data(),count);memcpy(resolution.reparse,hash.data(),32);}
      require(name==final_name(file),ERROR_RETRY);fact(facts,Q_FACT_RESOLUTION,i,&resolution,sizeof(resolution));
      parents[i]=resolution.parent_index;
    }
    for(uint32_t i=0;i<config.object_count;i++){
      std::vector<uint8_t> access;append(access,&config.process_count,sizeof(config.process_count));
      PSECURITY_DESCRIPTOR parent=parents[i]==UINT32_MAX?nullptr:descriptors[parents[i]].data();
      for(const auto& token:tokens)for(const bool primary:{true,false}){
        const auto record=evaluate_composite_access(primary?token.primary.value:token.effective.value,descriptors[i].data(),parent,objectAttributes[i]);
        append(access,&record,sizeof(record));
      }
      fact(facts,Q_FACT_COMPOSITE_ACCESS,i,access.data(),access.size());
    }
    // Reject a primary/effective token replacement or modification during the object pass.
    for(uint32_t i=0;i<config.process_count;i++){
      const auto& bound=config.processes[i];auto process=bound_process(bound);handle thread(OpenThread(THREAD_QUERY_INFORMATION,FALSE,bound.tid));require(thread.value&&GetProcessIdOfThread(thread)==bound.pid);
      HANDLE p=nullptr,e=nullptr;require(OpenProcessToken(process,TOKEN_QUERY,&p));handle primary(p);
      const bool impersonating=OpenThreadToken(thread,TOKEN_QUERY,TRUE,&e)!=0;
      if(!impersonating){require(GetLastError()==ERROR_NO_TOKEN);require(OpenProcessToken(process,TOKEN_QUERY,&e));}handle effective(e);
      require(impersonating==tokens[i].impersonating&&token_profile(primary)==tokens[i].primary_profile&&token_profile(effective,!impersonating)==tokens[i].effective_profile,ERROR_RETRY);
      const auto primaryStats=token_info(primary,TokenStatistics),effectiveStats=token_info(effective,TokenStatistics);
      std::array<uint64_t,4> identities{};const auto pStats=reinterpret_cast<const TOKEN_STATISTICS*>(primaryStats.data()),eStats=reinterpret_cast<const TOKEN_STATISTICS*>(effectiveStats.data());
      memcpy(&identities[0],&pStats->TokenId,8);memcpy(&identities[1],&pStats->ModifiedId,8);memcpy(&identities[2],&eStats->TokenId,8);memcpy(&identities[3],&eStats->ModifiedId,8);require(identities==tokens[i].identities,ERROR_RETRY);
    }
    header.fact_count=3*config.process_count+5*config.object_count;append(payload,facts.data(),facts.size());
    require(payload.size()<=Q_MAX_MESSAGE-sizeof(header)); header.payload_bytes=static_cast<uint32_t>(payload.size());
    std::vector<uint8_t> reply; append(reply,&header,sizeof(header)); append(reply,payload.data(),payload.size());
    require(validate_observation(reply.data(),reply.size()));
    auto peer=authenticate_pipe_peer(pipe,broker_binding(*fixed),false);require(alive(peer)&&alive(own));
    verify_loaded_modules(*fixed,fixed->collector);
    send_message(pipe,reply.data(),reply.size());await_receipt(pipe,&request,sizeof(request));
    auto receiptPeer=authenticate_pipe_peer(pipe,broker_binding(*fixed),false);require(alive(receiptPeer));return 0;
  } catch(const error& e) { return static_cast<int>(e.code); } catch(...) { return ERROR_INVALID_DATA; }
}
