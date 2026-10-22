#pragma once
#include "windows.hpp"
#include <set>
#include <cwctype>
#include <span>

namespace q {
// Machine bootstrap only. No API in this package creates or edits this key/file.
// Dedicated provisioned infrastructure must satisfy the conservative supported
// SYSTEM/Administrators ownership policy. Other semantics are unsupported.
constexpr wchar_t bootstrap_key[]=L"SOFTWARE\\EduFlow\\QualificationBootstrap";
constexpr wchar_t broker_pipe[]=L"\\\\.\\pipe\\EduFlow.Qualification.Broker.v2";
constexpr wchar_t collector_pipe[]=L"\\\\.\\pipe\\EduFlow.Qualification.Collector.v2";
struct sealed_file { wchar_t path[Q_MAX_NAME];uint8_t digest[32]; };
struct launch_policy {
  uint32_t role,handle_count;
  wchar_t image[Q_MAX_NAME],working_directory[Q_MAX_NAME];
  uint8_t image_digest[32],token_digest[32];
  Q_HANDLE_FACT handles[32];
  uint32_t handle_object_indices[32];
};
struct cleanup_entry { uint32_t object,parent,attributes,reserved;wchar_t name[256]; };
struct cleanup_policy {
  uint32_t count,root_object,reserved[2];uint8_t ticket[32],evidence[32];
  Q_VOLUME_FACT volume;cleanup_entry entries[128];
};
struct deployment {
  uint32_t magic,version,size,sealed_count;
  Q_CONFIG inspection;
  Q_BOUND_PROCESS collector,verifier;
  wchar_t bridge_path[Q_MAX_NAME],client_command[Q_MAX_NAME],client_cwd[Q_MAX_NAME];
  uint8_t bridge_digest[32];
  sealed_file sealed[128];
  wchar_t controller_host[256];
  uint8_t controller_certificate[32],client_certificate[32];
  uint32_t launch_count,reserved;
  launch_policy launches[4];
  Q_BOUND_PROCESS cleaner;cleanup_policy cleanup;
  Q_BOUND_PROCESS release_verifier;
  uint8_t release_verifier_token[32],release_public_key[72],runtime_closure[32],persistence_contract[32];
};
static_assert(sizeof(deployment)<Q_MAX_MESSAGE);

inline bool machine_principal(PSID sid) {
  return sid&&IsValidSid(sid)&&(IsWellKnownSid(sid,WinLocalSystemSid)||IsWellKnownSid(sid,WinBuiltinAdministratorsSid));
}
inline void protected_descriptor(PSECURITY_DESCRIPTOR sd,SE_OBJECT_TYPE kind) {
  require(kind==SE_FILE_OBJECT||kind==SE_REGISTRY_KEY,ERROR_NOT_SUPPORTED);
  require(sd&&IsValidSecurityDescriptor(sd),ERROR_ACCESS_DENIED);
  PSID owner=nullptr;BOOL defaulted=FALSE,present=FALSE;PACL acl=nullptr;
  require(GetSecurityDescriptorOwner(sd,&owner,&defaulted)&&machine_principal(owner),ERROR_ACCESS_DENIED);
  require(GetSecurityDescriptorDacl(sd,&present,&acl,&defaulted)&&present&&acl&&IsValidAcl(acl),ERROR_ACCESS_DENIED);
  const DWORD mutation=kind==SE_REGISTRY_KEY?(KEY_SET_VALUE|KEY_CREATE_SUB_KEY|KEY_CREATE_LINK|WRITE_DAC|WRITE_OWNER|DELETE|GENERIC_WRITE|GENERIC_ALL):
    (FILE_WRITE_DATA|FILE_APPEND_DATA|FILE_WRITE_EA|FILE_WRITE_ATTRIBUTES|FILE_DELETE_CHILD|WRITE_DAC|WRITE_OWNER|DELETE|GENERIC_WRITE|GENERIC_ALL);
  for(DWORD i=0;i<acl->AceCount;i++){
    void* raw=nullptr;require(GetAce(acl,i,&raw));auto header=static_cast<ACE_HEADER*>(raw);
    require(header->AceType==ACCESS_ALLOWED_ACE_TYPE||header->AceType==ACCESS_DENIED_ACE_TYPE,ERROR_NOT_SUPPORTED);
    require((header->AceFlags&~VALID_INHERIT_FLAGS)==0,ERROR_NOT_SUPPORTED);
    if(header->AceType==ACCESS_ALLOWED_ACE_TYPE&&!(header->AceFlags&INHERIT_ONLY_ACE)){
      auto ace=static_cast<ACCESS_ALLOWED_ACE*>(raw);require(!(ace->Mask&mutation)||machine_principal(&ace->SidStart),ERROR_ACCESS_DENIED);
    }
  }
}
inline void protected_object(HANDLE value,SE_OBJECT_TYPE kind) {
  PSECURITY_DESCRIPTOR sd=nullptr;
  require(GetSecurityInfo(value,kind,OWNER_SECURITY_INFORMATION|DACL_SECURITY_INFORMATION,nullptr,nullptr,nullptr,nullptr,&sd)==ERROR_SUCCESS,ERROR_ACCESS_DENIED);
  local_memory release{sd};protected_descriptor(sd,kind);
}
inline std::wstring canonical_local(std::span<const wchar_t> input) {
  require(input.size()>0&&input.size()<=Q_MAX_NAME);const auto value=input.data();
  require(fixed_string(value,input.size())&&wcslen(value)>=3&&iswalpha(value[0])&&value[1]==L':'&&value[2]==L'\\',ERROR_ACCESS_DENIED);
  require(!wcschr(value+2,L':')&&!wcschr(value,L'/')&&!wcschr(value,L'*')&&!wcschr(value,L'?'),ERROR_ACCESS_DENIED);
  std::array<wchar_t,Q_MAX_NAME> normalized{};DWORD size=GetFullPathNameW(value,Q_MAX_NAME,normalized.data(),nullptr);
  require(size>0&&size<Q_MAX_NAME&&wcscmp(value,normalized.data())==0,ERROR_ACCESS_DENIED);
  std::wstring result(value);require(result.size()==3||result.back()!=L'\\');return result;
}
inline handle protected_path(std::span<const wchar_t> path,bool directory=false) {
  const auto name=canonical_local(path);std::vector<handle> ancestors;
  for(size_t end=3;;){
    const auto part=name.substr(0,end);const bool last=end==name.size();
    handle item(CreateFileW(part.c_str(),READ_CONTROL|FILE_READ_ATTRIBUTES|(last&&!directory?GENERIC_READ:0),
      FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
    require(item.value!=INVALID_HANDLE_VALUE,ERROR_ACCESS_DENIED);FILE_ATTRIBUTE_TAG_INFO tag{};
    require(GetFileInformationByHandleEx(item,FileAttributeTagInfo,&tag,sizeof(tag))&&!(tag.FileAttributes&FILE_ATTRIBUTE_REPARSE_POINT),ERROR_ACCESS_DENIED);
    require(((tag.FileAttributes&FILE_ATTRIBUTE_DIRECTORY)!=0)==(!last||directory),ERROR_ACCESS_DENIED);
    protected_object(item,SE_FILE_OBJECT);
    if(last)return item;
    ancestors.push_back(std::move(item));const auto next=name.find(L'\\',end==3?3:end+1);end=next==std::wstring::npos?name.size():next;
  }
}
inline void protected_file_digest(std::span<const wchar_t> path,const uint8_t (&expected)[32]) {
  require(std::any_of(std::begin(expected),std::end(expected),[](uint8_t n){return n!=0;}));
  auto file=protected_path(path);auto observed=file_hash(file);require(memcmp(expected,observed.data(),32)==0,ERROR_ACCESS_DENIED);
}
inline handle bound_process(const Q_BOUND_PROCESS& fixed) {
  require(fixed.pid&&fixed.created&&fixed_string(fixed.sid,Q_MAX_SID)&&fixed.sid[0]);
  handle process(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION|SYNCHRONIZE,FALSE,fixed.pid));require(process.value&&alive(process)&&created(process)==fixed.created,ERROR_ACCESS_DENIED);
  std::array<wchar_t,Q_MAX_NAME> image{};DWORD size=Q_MAX_NAME;require(QueryFullProcessImageNameW(process,0,image.data(),&size));
  protected_file_digest(image,fixed.image);
  HANDLE raw=nullptr;require(OpenProcessToken(process,TOKEN_QUERY,&raw));handle token(raw);auto user=token_info(token,TokenUser);
  wchar_t sid[Q_MAX_SID]{};sid_text(reinterpret_cast<TOKEN_USER*>(user.data())->User.Sid,sid);require(wcscmp(sid,fixed.sid)==0,ERROR_ACCESS_DENIED);
  require(alive(process)&&created(process)==fixed.created,ERROR_ACCESS_DENIED);return process;
}
inline std::unique_ptr<deployment> load_deployment() {
  require(allowed_environment(),ERROR_ACCESS_DENIED);
  HKEY raw=nullptr;std::vector<HKEY> keys;
  struct close_keys { std::vector<HKEY>& keys;~close_keys(){for(auto key:keys)RegCloseKey(key);} } cleanup{keys};
  for(const wchar_t* part:{L"SOFTWARE",L"SOFTWARE\\EduFlow",bootstrap_key}){
    require(RegOpenKeyExW(HKEY_LOCAL_MACHINE,part,0,KEY_READ|KEY_WOW64_64KEY,&raw)==ERROR_SUCCESS,ERROR_ACCESS_DENIED);
    keys.push_back(raw);protected_object(raw,SE_REGISTRY_KEY);
  }
  std::array<wchar_t,Q_MAX_NAME> path{};DWORD bytes=sizeof(path),type=0;
  require(RegQueryValueExW(raw,L"Configuration",nullptr,&type,reinterpret_cast<BYTE*>(path.data()),&bytes)==ERROR_SUCCESS&&type==REG_SZ&&bytes>=4&&bytes<=sizeof(path)&&bytes%2==0,ERROR_ACCESS_DENIED);
  require(path[bytes/2-1]==0&&wcslen(path.data())+1==bytes/2,ERROR_ACCESS_DENIED);
  auto file=protected_path(path);LARGE_INTEGER length{};require(GetFileSizeEx(file,&length)&&length.QuadPart==sizeof(deployment));
  auto value=std::make_unique<deployment>();DWORD read=0;require(ReadFile(file,value.get(),sizeof(deployment),&read,nullptr)&&read==sizeof(deployment));
  require(value->magic==Q_MAGIC&&value->version==2&&value->size==sizeof(deployment)&&value->sealed_count>0&&value->sealed_count<=128);
  const auto& c=value->inspection;
  require(c.magic==Q_MAGIC&&c.version==Q_COLLECTOR_VERSION&&c.size==sizeof(Q_CONFIG)&&c.object_count>0&&c.object_count<=Q_MAX_OBJECTS&&c.process_count>0&&c.process_count<=Q_MAX_TOKENS);
  require(c.broker_pid&&c.broker_created&&fixed_string(c.broker_sid,Q_MAX_SID)&&c.broker_sid[0]);
  require(fixed_string(value->bridge_path,Q_MAX_NAME)&&fixed_string(value->client_command,Q_MAX_NAME)&&value->client_command[0]&&fixed_string(value->client_cwd,Q_MAX_NAME));
  std::set<std::wstring> names;
  for(uint32_t i=0;i<value->sealed_count;i++){
    require(names.insert(canonical_local(value->sealed[i].path)).second);protected_file_digest(value->sealed[i].path,value->sealed[i].digest);
  }
  protected_file_digest(value->bridge_path,value->bridge_digest);
  for(uint32_t i=0;i<c.object_count;i++)require(fixed_string(c.objects[i].path,Q_MAX_NAME)&&c.objects[i].path[0]);
  for(uint32_t i=0;i<c.process_count;i++)require(fixed_string(c.processes[i].sid,Q_MAX_SID)&&c.processes[i].sid[0]);
  return value;
}
inline Q_BOUND_PROCESS broker_binding(const deployment& d) {
  Q_BOUND_PROCESS p{};p.pid=d.inspection.broker_pid;p.created=d.inspection.broker_created;
  memcpy(p.image,d.inspection.broker_image,32);wcscpy_s(p.sid,d.inspection.broker_sid);return p;
}
inline void bound_request(const Q_REQUEST& request,const Q_CONFIG& fixed) {
  require(valid_request(request)&&memcmp(request.profile,fixed.profile,32)==0&&memcmp(request.epoch,fixed.epoch,32)==0
    &&memcmp(request.fixture,fixed.fixture,32)==0&&memcmp(request.boot,fixed.boot,32)==0,ERROR_ACCESS_DENIED);
}
}
