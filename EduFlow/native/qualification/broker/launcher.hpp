#pragma once
#include "../common/ipc.hpp"
#include "../common/controller-rpc.hpp"
#include "../common/token-profile.hpp"
#include "../collector/facts.hpp"

namespace q {
struct launch_request { Q_REQUEST binding;uint32_t role,reserved;uint8_t ticket[32]; };
struct launch_outcome {
  uint32_t magic=Q_MAGIC,version=1,size=sizeof(launch_outcome),status=0,role=0,exit_code=0;
  uint64_t pid=0,created=0;uint8_t profile[32]{},ticket[32]{},image[32]{},token[32]{},handles[32]{};
  uint32_t qualification_only=1,paid_authority=0,provider_calls=0,reserved=0;
  launch_request request{};
};
static_assert(sizeof(launch_request)==216&&sizeof(launch_outcome)==432);
inline Q_REQUEST validate_launch_shape(const launch_request& start) {
  auto binding=start.binding;
  require(binding.verb==2&&!start.reserved&&nonzero(start.ticket));binding.verb=1;require(valid_request(binding));
  require(start.role==2||start.role==3||start.role==5||start.role==6,ERROR_ACCESS_DENIED);
  return binding;
}
inline Q_REQUEST validate_launch_request(const deployment& fixed,const launch_request& start) {
  auto binding=validate_launch_shape(start);bound_request(binding,fixed.inspection);return binding;
}
inline void validate_launch_outcome(const launch_request& start,const launch_outcome& result) {
  require(result.magic==Q_MAGIC&&result.version==1&&result.size==sizeof(result)&&result.status==1&&result.role==start.role
    &&result.pid&&result.created&&result.qualification_only==1&&!result.paid_authority&&!result.provider_calls&&!result.reserved
    &&memcmp(&result.request,&start,sizeof(start))==0&&memcmp(result.profile,start.binding.profile,32)==0&&memcmp(result.ticket,start.ticket,32)==0
    &&nonzero(result.image)&&nonzero(result.token)&&nonzero(result.handles),ERROR_ACCESS_DENIED);
}
inline const Q_BOUND_PROCESS& role_process(const Q_CONFIG& config,uint32_t role) {
  const Q_BOUND_PROCESS* result=nullptr;std::set<uint32_t> roles;
  for(uint32_t i=0;i<config.process_count;i++){require(roles.insert(config.processes[i].role).second);if(config.processes[i].role==role)result=&config.processes[i];}
  require(result!=nullptr,ERROR_ACCESS_DENIED);return *result;
}
inline void handle_object_binding(HANDLE handle,uint32_t index,const Q_CONFIG& config) {
  if(GetFileType(handle)==FILE_TYPE_DISK){
    require(index<config.object_count);FILE_ID_INFO identity{};require(GetFileInformationByHandleEx(handle,FileIdInfo,&identity,sizeof(identity)));
    require(identity.VolumeSerialNumber==config.objects[index].volume&&memcmp(identity.FileId.Identifier,config.objects[index].file_id,16)==0,ERROR_ACCESS_DENIED);
  }else require(index==UINT32_MAX,ERROR_ACCESS_DENIED);
}
inline bool same_handle_authority(const Q_HANDLE_FACT& a,const Q_HANDLE_FACT& b) {
  return a.attributes==b.attributes&&a.access==b.access&&a.kind==b.kind&&a.target_pid==b.target_pid&&a.target_created==b.target_created
    &&memcmp(a.type_name,b.type_name,32)==0&&memcmp(a.object_name,b.object_name,32)==0;
}
inline void validate_inherited_file_policy(const Q_HANDLE_FACT& wanted,uint32_t object,const Q_CONFIG& config) {
  // No process/thread/token/section/registry/pipe/event authority is inherited.
  // A future primitive that needs another kind requires a reviewed adapter.
  constexpr DWORD readOnly=FILE_READ_DATA|FILE_READ_EA|FILE_READ_ATTRIBUTES|READ_CONTROL|SYNCHRONIZE;
  const auto fileType=byte_hash(L"File",8);
  require(wanted.handle&&wanted.kind==PSS_OBJECT_TYPE_UNKNOWN&&memcmp(wanted.type_name,fileType.data(),32)==0&&!wanted.target_pid&&!wanted.target_created
    &&wanted.access&&!(wanted.access&~readOnly)&&object<config.object_count,ERROR_ACCESS_DENIED);
  // PSS attributes are native object attributes (OBJ_INHERIT=2), not the
  // differently numbered Win32 HANDLE_FLAG_INHERIT. Protect-from-close blocks.
  require((wanted.attributes&~2u)==0,ERROR_NOT_SUPPORTED);
}
inline void validate_inherited_duplicate(HANDLE duplicate,const Q_HANDLE_FACT& wanted,uint32_t object,const Q_CONFIG& config) {
  validate_inherited_file_policy(wanted,object,config);
  require(GetFileType(duplicate)==FILE_TYPE_DISK,ERROR_ACCESS_DENIED);handle_object_binding(duplicate,object,config);
  FILE_ATTRIBUTE_TAG_INFO attributes{};require(GetFileInformationByHandleEx(duplicate,FileAttributeTagInfo,&attributes,sizeof(attributes))
    &&!(attributes.FileAttributes&FILE_ATTRIBUTE_REPARSE_POINT),ERROR_ACCESS_DENIED);
  using query_object=NTSTATUS(NTAPI*)(HANDLE,OBJECT_INFORMATION_CLASS,PVOID,ULONG,PULONG);
  const auto query=reinterpret_cast<query_object>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"),"NtQueryObject"));require(query!=nullptr);
  PUBLIC_OBJECT_BASIC_INFORMATION basic{};ULONG returned=0;
  require(query(duplicate,ObjectBasicInformation,&basic,sizeof(basic),&returned)>=0&&returned==sizeof(basic)&&basic.GrantedAccess==wanted.access,ERROR_ACCESS_DENIED);
  DWORD flags=0;require(GetHandleInformation(duplicate,&flags)&&flags==HANDLE_FLAG_INHERIT,ERROR_ACCESS_DENIED);
}
inline void verify_child_token(HANDLE process,HANDLE thread,const std::array<uint8_t,32>& expected) {
  HANDLE raw=nullptr;require(OpenProcessToken(process,TOKEN_QUERY,&raw));handle current(raw);
  require(token_profile(current)==expected,ERROR_ACCESS_DENIED);
  HANDLE effective=nullptr;const BOOL impersonating=OpenThreadToken(thread,TOKEN_QUERY,TRUE,&effective);const DWORD code=GetLastError();handle release(effective);
  require(!impersonating&&code==ERROR_NO_TOKEN,ERROR_ACCESS_DENIED);
}
inline void restricted_privileges(const TOKEN_PRIVILEGES& privileges) {
  require(privileges.PrivilegeCount<=Q_MAX_PRIVILEGES);
  LUID traverse{};require(LookupPrivilegeValueW(nullptr,SE_CHANGE_NOTIFY_NAME,&traverse));
  for(DWORD i=0;i<privileges.PrivilegeCount;i++){
    const auto& p=privileges.Privileges[i];
    // Disabled-but-enableable privileges are authority too. This supported
    // restricted launch profile permits only the traverse-check privilege.
    require(p.Luid.LowPart==traverse.LowPart&&p.Luid.HighPart==traverse.HighPart,ERROR_NOT_SUPPORTED);
    require(!(p.Attributes&~(SE_PRIVILEGE_ENABLED_BY_DEFAULT|SE_PRIVILEGE_ENABLED|SE_PRIVILEGE_USED_FOR_ACCESS)),ERROR_NOT_SUPPORTED);
  }
}
inline void restricted_launch_token(HANDLE token) {
  for(const auto kind:{TokenElevation,TokenUIAccess,TokenVirtualizationEnabled,TokenIsAppContainer}){
    const auto bytes=token_info(token,kind);require(bytes.size()==sizeof(DWORD));DWORD value=0;memcpy(&value,bytes.data(),4);require(!value,ERROR_ACCESS_DENIED);
  }
  const auto groupsBytes=token_info(token,TokenGroups);const auto groups=reinterpret_cast<const TOKEN_GROUPS*>(groupsBytes.data());require(groups->GroupCount<=Q_MAX_MEMBERS);
  for(DWORD i=0;i<groups->GroupCount;i++){
    const auto& g=groups->Groups[i];require(!((g.Attributes&SE_GROUP_ENABLED)&&!(g.Attributes&SE_GROUP_USE_FOR_DENY_ONLY)&&machine_principal(g.Sid)),ERROR_ACCESS_DENIED);
  }
  const auto userBytes=token_info(token,TokenUser);require(!machine_principal(reinterpret_cast<const TOKEN_USER*>(userBytes.data())->User.Sid),ERROR_ACCESS_DENIED);
  const auto bytes=token_info(token,TokenPrivileges);restricted_privileges(*reinterpret_cast<const TOKEN_PRIVILEGES*>(bytes.data()));
}
inline launch_outcome launch_fixed_role(const deployment& fixed,const launch_request& start) {
  require(allowed_environment(),ERROR_ACCESS_DENIED);const auto binding=validate_launch_request(fixed,start);
  // A2: this build cannot verify the complete dependency and handle lifetime
  // closure across release. A signed opaque reference is not that proof. Burned
  // external tickets remain burned; do not redeem, start a child or retry here.
  // There is deliberately no configuration flag/caller override for this gate.
  require(false,ERROR_NOT_SUPPORTED);
  require(fixed.launch_count>0&&fixed.launch_count<=4&&!fixed.reserved);
  const launch_policy* policy=nullptr;std::set<uint32_t> roles;
  for(uint32_t i=0;i<fixed.launch_count;i++){require(roles.insert(fixed.launches[i].role).second);if(fixed.launches[i].role==start.role)policy=&fixed.launches[i];}
  require(policy&&policy->handle_count<=32,ERROR_ACCESS_DENIED);
  // Tickets are durably consumed before the external controller delivers them.
  // This online step redeems that consumed ticket once; no offline launch exists.
  controller_request request{};request.phase=consume_launch;request.role=start.role;request.broker_pid=GetCurrentProcessId();request.broker_created=created(GetCurrentProcess());
  memcpy(request.fixture,binding.fixture,32);memcpy(request.epoch,binding.epoch,32);memcpy(request.profile,binding.profile,32);memcpy(request.boot,binding.boot,32);memcpy(request.ticket,start.ticket,32);
  const auto consumed=controller_exchange(fixed,request);
  const auto& sourceBinding=role_process(fixed.inspection,start.role);canonical_sid(sourceBinding.sid);canonical_sid(fixed.inspection.broker_sid);canonical_sid(fixed.verifier.sid);
  require(wcscmp(sourceBinding.sid,fixed.inspection.broker_sid)!=0&&wcscmp(sourceBinding.sid,fixed.verifier.sid)!=0,ERROR_ACCESS_DENIED);
  require(wcscmp(role_process(fixed.inspection,2).sid,role_process(fixed.inspection,3).sid)!=0,ERROR_ACCESS_DENIED);
  const auto& provisioner=role_process(fixed.inspection,1);require(wcscmp(sourceBinding.sid,provisioner.sid)!=0,ERROR_ACCESS_DENIED);
  auto observedSource=bound_process(sourceBinding);protected_file_digest(policy->image,policy->image_digest);auto workingDirectory=protected_path(policy->working_directory,true);
  handle source(OpenProcess(PROCESS_QUERY_INFORMATION|PROCESS_VM_READ|PROCESS_DUP_HANDLE|SYNCHRONIZE,FALSE,sourceBinding.pid));require(source.value&&alive(source)&&created(source)==sourceBinding.created);
  handle sourceThread(OpenThread(THREAD_QUERY_INFORMATION,FALSE,sourceBinding.tid));require(sourceThread.value&&GetProcessIdOfThread(sourceThread)==sourceBinding.pid);
  HANDLE threadToken=nullptr;const BOOL impersonating=OpenThreadToken(sourceThread,TOKEN_QUERY,TRUE,&threadToken);handle closeThreadToken(threadToken);
  require(!impersonating&&GetLastError()==ERROR_NO_TOKEN,ERROR_ACCESS_DENIED);
  HANDLE raw=nullptr;require(OpenProcessToken(source,TOKEN_QUERY|TOKEN_DUPLICATE|TOKEN_ASSIGN_PRIMARY,&raw));handle original(raw);
  const auto originalProfile=token_profile(original);require(memcmp(originalProfile.data(),policy->token_digest,32)==0,ERROR_ACCESS_DENIED);
  restricted_launch_token(original);
  require(DuplicateTokenEx(original,TOKEN_QUERY|TOKEN_DUPLICATE|TOKEN_ASSIGN_PRIMARY,nullptr,SecurityImpersonation,TokenPrimary,&raw));handle primary(raw);
  auto clonedProfile=token_profile(primary);require(clonedProfile==originalProfile);
  auto sourceHandles=stable_handles(source);std::vector<handle> inherited;std::vector<HANDLE> handleList;std::vector<Q_HANDLE_FACT> allowed;
  std::set<uint64_t> used;
  for(uint32_t i=0;i<policy->handle_count;i++){
    const auto& wanted=policy->handles[i];require(used.insert(wanted.handle).second);
    validate_inherited_file_policy(wanted,policy->handle_object_indices[i],fixed.inspection);
    const auto found=std::find_if(sourceHandles.begin(),sourceHandles.end(),[&](const auto& h){return h.handle==wanted.handle;});
    require(found!=sourceHandles.end()&&memcmp(&*found,&wanted,sizeof(wanted))==0,ERROR_ACCESS_DENIED);
    // Never transfer a handle to a protected controller/helper identity.
    require(!wanted.target_pid||(wanted.target_pid!=fixed.inspection.broker_pid&&wanted.target_pid!=fixed.verifier.pid&&wanted.target_pid!=provisioner.pid),ERROR_ACCESS_DENIED);
    HANDLE duplicate=nullptr;require(DuplicateHandle(source,reinterpret_cast<HANDLE>(wanted.handle),GetCurrentProcess(),&duplicate,0,TRUE,DUPLICATE_SAME_ACCESS));
    inherited.emplace_back(duplicate);handleList.push_back(duplicate);
    validate_inherited_duplicate(duplicate,wanted,policy->handle_object_indices[i],fixed.inspection);
    auto expected=wanted;expected.handle=reinterpret_cast<uint64_t>(duplicate);expected.attributes=2;allowed.push_back(expected);
  }
  const auto secondProfile=token_profile(primary);require(secondProfile==originalProfile&&alive(source)&&created(source)==sourceBinding.created,ERROR_RETRY);
  const std::wstring descriptor=L"O:"+std::wstring(fixed.inspection.broker_sid)+L"D:P(A;;GA;;;"+fixed.inspection.broker_sid+L")";
  PSECURITY_DESCRIPTOR sd=nullptr;require(ConvertStringSecurityDescriptorToSecurityDescriptorW(descriptor.c_str(),SDDL_REVISION_1,&sd,nullptr));local_memory freeDescriptor{sd};
  SECURITY_ATTRIBUTES processSecurity{sizeof(processSecurity),sd,FALSE};
  STARTUPINFOEXW startup{};startup.StartupInfo.cb=sizeof(startup);startup.StartupInfo.dwFlags=STARTF_USESTDHANDLES;
  startup.StartupInfo.hStdInput=startup.StartupInfo.hStdOutput=startup.StartupInfo.hStdError=INVALID_HANDLE_VALUE;
  SIZE_T attributeBytes=0;InitializeProcThreadAttributeList(nullptr,1,0,&attributeBytes);require(attributeBytes>0&&attributeBytes<65536);
  std::vector<uint8_t> attributes(attributeBytes);startup.lpAttributeList=reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(attributes.data());
  require(InitializeProcThreadAttributeList(startup.lpAttributeList,1,0,&attributeBytes));struct delete_attributes{LPPROC_THREAD_ATTRIBUTE_LIST value;~delete_attributes(){DeleteProcThreadAttributeList(value);}} attributeCleanup{startup.lpAttributeList};
  if(!handleList.empty())require(UpdateProcThreadAttribute(startup.lpAttributeList,0,PROC_THREAD_ATTRIBUTE_HANDLE_LIST,handleList.data(),handleList.size()*sizeof(HANDLE),nullptr,nullptr));
  std::array<wchar_t,Q_MAX_NAME> systemRoot{};DWORD systemLength=GetSystemWindowsDirectoryW(systemRoot.data(),Q_MAX_NAME);require(systemLength&&systemLength<Q_MAX_NAME);
  std::wstring environment=L"NODE_ENV=development";environment.push_back(0);environment+=L"SystemRoot=";environment+=systemRoot.data();environment.push_back(0);environment.push_back(0);
  std::wstring command=L"\""+std::wstring(policy->image)+L"\"";
  handle job(CreateJobObjectW(nullptr,nullptr));require(job.value);JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};limits.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  require(SetInformationJobObject(job,JobObjectExtendedLimitInformation,&limits,sizeof(limits)));
  PROCESS_INFORMATION child{};require(CreateProcessAsUserW(primary,policy->image,command.data(),&processSecurity,&processSecurity,!handleList.empty(),
    CREATE_SUSPENDED|CREATE_NO_WINDOW|CREATE_UNICODE_ENVIRONMENT|EXTENDED_STARTUPINFO_PRESENT,environment.data(),policy->working_directory,&startup.StartupInfo,&child));
  handle process(child.hProcess),thread(child.hThread);
  struct stop_child{HANDLE process;~stop_child(){if(WaitForSingleObject(process,0)==WAIT_TIMEOUT){TerminateProcess(process,ERROR_PROCESS_ABORTED);WaitForSingleObject(process,5000);}}} childCleanup{process};
  require(AssignProcessToJobObject(job,process));require(alive(process));const auto childCreated=created(process);
  const auto childImage=process_image(process);require(memcmp(childImage.data(),policy->image_digest,32)==0,ERROR_ACCESS_DENIED);
  require(OpenProcessToken(process,TOKEN_QUERY,&raw));handle childToken(raw);const auto childProfile=token_profile(childToken);require(childProfile==originalProfile,ERROR_ACCESS_DENIED);
  restricted_launch_token(childToken);
  HANDLE effective=nullptr;const BOOL childImpersonating=OpenThreadToken(thread,TOKEN_QUERY,TRUE,&effective);handle closeEffective(effective);
  require(!childImpersonating&&GetLastError()==ERROR_NO_TOKEN,ERROR_ACCESS_DENIED);
  const auto observedHandles=stable_handles(process);require(observedHandles.size()==allowed.size(),ERROR_ACCESS_DENIED);
  for(const auto& observed:observedHandles){
    const auto expected=std::find_if(allowed.begin(),allowed.end(),[&](const auto& h){return h.handle==observed.handle;});require(expected!=allowed.end()&&same_handle_authority(*expected,observed),ERROR_ACCESS_DENIED);
  }
  const auto handleDigest=byte_hash(observedHandles.data(),observedHandles.size()*sizeof(Q_HANDLE_FACT));
  request.phase=release_child;request.child_pid=child.dwProcessId;request.child_created=childCreated;memcpy(request.image,childImage.data(),32);memcpy(request.token,childProfile.data(),32);memcpy(request.handles,handleDigest.data(),32);
  const auto release=controller_exchange(fixed,request);require(release.journal_sequence>consumed.journal_sequence&&memcmp(release.observer_epoch,consumed.observer_epoch,32)==0,ERROR_ACCESS_DENIED);
  require(memcmp(release.durable_consumption,consumed.durable_consumption,32)==0
    &&release.independently_observed.body.start_sequence==consumed.independently_observed.body.start_sequence
    &&release.independently_observed.body.end_sequence>consumed.independently_observed.body.end_sequence,ERROR_ACCESS_DENIED);
  require(alive(process)&&created(process)==childCreated&&process_image(process)==childImage);
  // Reopen the process token: querying the old token handle would miss token
  // replacement while the controller acknowledgement was pending.
  verify_child_token(process,thread,childProfile);
  const auto releaseHandles=stable_handles(process);
  require(releaseHandles.size()==observedHandles.size()
    &&(releaseHandles.empty()||memcmp(releaseHandles.data(),observedHandles.data(),releaseHandles.size()*sizeof(Q_HANDLE_FACT))==0),ERROR_RETRY);
  for(uint32_t i=0;i<policy->handle_count;i++){
    HANDLE rawChild=nullptr;require(DuplicateHandle(process,handleList[i],GetCurrentProcess(),&rawChild,0,TRUE,DUPLICATE_SAME_ACCESS));handle childCopy(rawChild);
    validate_inherited_duplicate(childCopy,policy->handles[i],policy->handle_object_indices[i],fixed.inspection);
    using compare_objects=BOOL(WINAPI*)(HANDLE,HANDLE);
    const auto compare=reinterpret_cast<compare_objects>(GetProcAddress(GetModuleHandleW(L"kernelbase.dll"),"CompareObjectHandles"));
    require(compare&&compare(childCopy,inherited[i]),ERROR_RETRY);
  }
  require(ResumeThread(thread)==1,ERROR_ACCESS_DENIED);require(WaitForSingleObject(process,20000)==WAIT_OBJECT_0,ERROR_TIMEOUT);
  DWORD exitCode=0;require(GetExitCodeProcess(process,&exitCode));JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};
  require(QueryInformationJobObject(job,JobObjectBasicAccountingInformation,&accounting,sizeof(accounting),nullptr)&&accounting.ActiveProcesses==0,ERROR_ACCESS_DENIED);
  request.phase=record_exit;request.exit_code=exitCode;const auto recorded=controller_exchange(fixed,request);
  require(recorded.journal_sequence>release.journal_sequence&&memcmp(recorded.observer_epoch,release.observer_epoch,32)==0,ERROR_ACCESS_DENIED);
  require(memcmp(recorded.durable_consumption,consumed.durable_consumption,32)==0
    &&recorded.independently_observed.body.start_sequence==release.independently_observed.body.start_sequence
    &&recorded.independently_observed.body.end_sequence>release.independently_observed.body.end_sequence,ERROR_ACCESS_DENIED);
  launch_outcome result{};result.status=1;result.role=start.role;result.exit_code=exitCode;result.pid=child.dwProcessId;result.created=childCreated;
  result.request=start;
  memcpy(result.profile,binding.profile,32);memcpy(result.ticket,start.ticket,32);memcpy(result.image,childImage.data(),32);memcpy(result.token,childProfile.data(),32);memcpy(result.handles,handleDigest.data(),32);
  validate_launch_outcome(start,result);return result;
}
}
