#include "protocol.hpp"
#include "../collector/facts.hpp"

namespace q {
inline void cleanup_identity(HANDLE file,const Q_BOUND_OBJECT& expected,bool parent) {
  FILE_ID_INFO id{};FILE_ATTRIBUTE_TAG_INFO tag{};
  require(GetFileInformationByHandleEx(file,FileIdInfo,&id,sizeof(id))&&GetFileInformationByHandleEx(file,FileAttributeTagInfo,&tag,sizeof(tag)));
  require(id.VolumeSerialNumber==expected.volume&&memcmp(id.FileId.Identifier,expected.file_id,16)==0,ERROR_ACCESS_DENIED);
  if(parent)require((tag.FileAttributes&FILE_ATTRIBUTE_DIRECTORY)&&!(tag.FileAttributes&FILE_ATTRIBUTE_REPARSE_POINT),ERROR_ACCESS_DENIED);
}
inline handle cleanup_relative(HANDLE parent,const std::wstring& leaf,bool selected) {
  require(leaf.size()>0&&leaf.size()<256&&leaf.find_first_of(L"\\/:")==std::wstring::npos);
  using create_file=NTSTATUS(NTAPI*)(PHANDLE,ACCESS_MASK,POBJECT_ATTRIBUTES,PIO_STATUS_BLOCK,PLARGE_INTEGER,ULONG,ULONG,ULONG,ULONG,PVOID,ULONG);
  auto create=reinterpret_cast<create_file>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"),"NtCreateFile"));require(create!=nullptr);
  UNICODE_STRING name{};name.Buffer=const_cast<wchar_t*>(leaf.data());name.Length=static_cast<USHORT>(leaf.size()*2);name.MaximumLength=name.Length;
  OBJECT_ATTRIBUTES attributes{};attributes.Length=sizeof(attributes);attributes.RootDirectory=parent;attributes.ObjectName=&name;attributes.Attributes=OBJ_CASE_INSENSITIVE;
  HANDLE file=nullptr;IO_STATUS_BLOCK io{};const NTSTATUS status=create(&file,READ_CONTROL|FILE_READ_ATTRIBUTES|SYNCHRONIZE|(selected?DELETE:0),&attributes,&io,nullptr,0,
    selected?0:(FILE_SHARE_READ|FILE_SHARE_WRITE),FILE_OPEN,FILE_OPEN_REPARSE_POINT|FILE_SYNCHRONOUS_IO_NONALERT,nullptr,0);
  require(status>=0&&file&&io.Information==FILE_OPENED,ERROR_ACCESS_DENIED);return handle(file);
}
class cleanup_handles {
  const deployment& fixed_;const cleanup_plan& plan_;std::map<uint32_t,std::unique_ptr<handle>> held_;std::set<uint32_t> opening_;
public:
  cleanup_handles(const deployment& fixed,const cleanup_plan& plan):fixed_(fixed),plan_(plan){}
  HANDLE open(uint32_t index,bool parent=false){
    require(index<plan_.paths.size());if(held_.contains(index)){cleanup_identity(*held_.at(index),fixed_.inspection.objects[index],parent);return *held_.at(index);}
    require(opening_.insert(index).second&&opening_.size()<=Q_MAX_OBJECTS);const auto& path=plan_.paths[index];std::unique_ptr<handle> file;
    if(path.size()==3){require(!plan_.selected.contains(index));file=std::make_unique<handle>(CreateFileW(path.c_str(),READ_CONTROL|FILE_READ_ATTRIBUTES|SYNCHRONIZE,
      FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));require(file->value!=INVALID_HANDLE_VALUE);}
    else{
      const auto split=path.find_last_of(L'\\');auto parentPath=path.substr(0,split);if(parentPath.size()==2)parentPath+=L'\\';
      const auto found=std::find(plan_.paths.begin(),plan_.paths.end(),parentPath);require(found!=plan_.paths.end());
      const auto parentIndex=static_cast<uint32_t>(found-plan_.paths.begin());const auto parentHandle=open(parentIndex,true);
      file=std::make_unique<handle>(cleanup_relative(parentHandle,path.substr(split+1),plan_.selected.contains(index)));
    }
    cleanup_identity(*file,fixed_.inspection.objects[index],parent);const auto result=file->value;held_.emplace(index,std::move(file));opening_.erase(index);return result;
  }
  std::array<uint8_t,32> digest()const{
    std::vector<uint8_t> bytes;for(const auto& [index,file]:held_){append(bytes,&index,4);const uint64_t value=reinterpret_cast<uint64_t>(file->value);append(bytes,&value,8);}
    return byte_hash(bytes.data(),bytes.size());
  }
  void close_deleted(uint32_t index){auto found=held_.find(index);require(found!=held_.end());const BOOL closed=CloseHandle(found->second->value);
    if(closed){found->second->value=INVALID_HANDLE_VALUE;held_.erase(found);}require(closed);}
};
int clean_disposable(const deployment& fixed) {
  const auto plan=validate_cleanup_plan(fixed);cleanup_request request{};request.phase=cleanup_begin;
  request.pid=GetCurrentProcessId();request.created=created(GetCurrentProcess());
  const auto& c=fixed.inspection;memcpy(request.fixture,c.fixture,32);memcpy(request.epoch,c.epoch,32);memcpy(request.profile,c.profile,32);memcpy(request.boot,c.boot,32);
  memcpy(request.ticket,fixed.cleanup.ticket,32);memcpy(request.evidence,fixed.cleanup.evidence,32);memcpy(request.manifest,plan.digest.data(),32);
  // No target opens with DELETE and no destructive API occur before the external
  // controller durably records this consumed, evidence-sealed cleanup intent.
  auto acknowledgement=cleanup_exchange(fixed,request);uint64_t sequence=acknowledgement.journal_sequence;
  cleanup_handles handles(fixed,plan);for(uint32_t i=0;i<fixed.cleanup.count;i++)handles.open(fixed.cleanup.entries[i].object);
  const auto volume=volume_facts(handles.open(fixed.cleanup.root_object,true));require(memcmp(&volume,&fixed.cleanup.volume,sizeof(volume))==0,ERROR_ACCESS_DENIED);
  for(uint32_t i=0;i<fixed.cleanup.count;i++){
    const auto& entry=fixed.cleanup.entries[i];const auto file=handles.open(entry.object);handles.open(entry.parent,true);
    FILE_ATTRIBUTE_TAG_INFO tag{};require(GetFileInformationByHandleEx(file,FileAttributeTagInfo,&tag,sizeof(tag)));
    require((tag.FileAttributes&(FILE_ATTRIBUTE_DIRECTORY|FILE_ATTRIBUTE_REPARSE_POINT))==entry.attributes,ERROR_ACCESS_DENIED);
    const auto handleHash=handles.digest();memcpy(request.handles,handleHash.data(),32);request.phase=cleanup_step_intent;request.ordinal=i+1;
    acknowledgement=cleanup_exchange(fixed,request);require(acknowledgement.journal_sequence>sequence);sequence=acknowledgement.journal_sequence;
    cleanup_identity(file,c.objects[entry.object],false);FILE_DISPOSITION_INFO disposition{TRUE};
    const BOOL marked=SetFileInformationByHandle(file,FileDispositionInfo,&disposition,sizeof(disposition));const DWORD code=marked?0:GetLastError();
    if(marked)handles.close_deleted(entry.object);
    request.phase=cleanup_step_outcome;request.error=code;request.completed+=marked?1:0;
    acknowledgement=cleanup_exchange(fixed,request);require(acknowledgement.journal_sequence>sequence);sequence=acknowledgement.journal_sequence;
    require(marked,code?code:ERROR_INVALID_DATA);
  }
  request.phase=cleanup_finish;acknowledgement=cleanup_exchange(fixed,request);require(acknowledgement.journal_sequence>sequence);return 0;
}
}
int wmain(int argc,wchar_t**) {
  using namespace q;if(argc!=1||!allowed_environment())return ERROR_ACCESS_DENIED;
  try{
    const auto fixed=load_deployment();require(GetCurrentProcessId()==fixed->cleaner.pid);auto own=bound_process(fixed->cleaner);
    require(alive(own)&&wcscmp(fixed->cleaner.sid,fixed->verifier.sid)==0,ERROR_ACCESS_DENIED);
    return clean_disposable(*fixed);
  }catch(const error& failure){return static_cast<int>(failure.code?failure.code:ERROR_INVALID_DATA);}catch(...){return ERROR_INVALID_DATA;}
}
