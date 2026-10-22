#pragma once
#include "bootstrap.hpp"
#include "reader.hpp"

namespace q {
inline void canonical_sid(std::span<const wchar_t> input) {
  require(input.size()>0&&input.size()<=Q_MAX_SID);const auto text=input.data();
  require(fixed_string(text,input.size())&&wcslen(text)>=4&&wcsncmp(text,L"S-1-",4)==0,ERROR_ACCESS_DENIED);
  PSID raw=nullptr;require(ConvertStringSidToSidW(text,&raw),ERROR_ACCESS_DENIED);local_memory release{raw};
  wchar_t canonical[Q_MAX_SID]{};sid_text(raw,canonical);require(wcscmp(text,canonical)==0,ERROR_ACCESS_DENIED);
}
inline DWORD complete_io(HANDLE pipe,OVERLAPPED& operation,BOOL immediate,DWORD immediateError,DWORD initial=0,DWORD timeout=5000) {
  require(timeout==5000||timeout==90000);
  if(immediate)return initial;
  require(immediateError==ERROR_IO_PENDING,immediateError);
  const auto state=WaitForSingleObject(operation.hEvent,timeout);
  if(state!=WAIT_OBJECT_0){
    CancelIoEx(pipe,&operation);DWORD discarded=0;GetOverlappedResult(pipe,&operation,&discarded,TRUE);
    throw error{ERROR_TIMEOUT};
  }
  DWORD bytes=0;const BOOL done=GetOverlappedResult(pipe,&operation,&bytes,FALSE);const DWORD code=GetLastError();
  require(done,code?code:ERROR_INVALID_DATA);return bytes;
}
inline std::vector<uint8_t> receive_message(HANDLE pipe,size_t bound,DWORD timeout=5000) {
  require(bound&&bound<=Q_MAX_MESSAGE);std::vector<uint8_t> bytes(bound);
  handle event(CreateEventW(nullptr,TRUE,FALSE,nullptr));require(event.value!=nullptr);OVERLAPPED operation{};operation.hEvent=event;
  DWORD count=0;BOOL immediate=ReadFile(pipe,bytes.data(),static_cast<DWORD>(bytes.size()),&count,&operation);const auto code=GetLastError();
  count=complete_io(pipe,operation,immediate,code,count,timeout);require(count>0&&count<=bound);bytes.resize(count);return bytes;
}
inline void send_message(HANDLE pipe,const void* data,size_t length) {
  require(data&&length&&length<=Q_MAX_MESSAGE);handle event(CreateEventW(nullptr,TRUE,FALSE,nullptr));require(event.value!=nullptr);
  OVERLAPPED operation{};operation.hEvent=event;DWORD count=0;
  BOOL immediate=WriteFile(pipe,data,static_cast<DWORD>(length),&count,&operation);const auto code=GetLastError();
  require(complete_io(pipe,operation,immediate,code,count)==length);
}
// One-shot receipt only: the sender remains alive until its authenticated peer
// has finished checking the response. It never issues another inspect/launch.
inline void await_receipt(HANDLE pipe,const void* request,size_t length) {
  const auto receipt=receive_message(pipe,length);
  require(receipt.size()==length&&memcmp(receipt.data(),request,length)==0,ERROR_ACCESS_DENIED);
}
inline handle authenticate_pipe_peer(HANDLE pipe,const Q_BOUND_PROCESS& binding,bool peerIsServer) {
  require(GetFileType(pipe)==FILE_TYPE_PIPE);ULONG pid=0;
  require(peerIsServer?GetNamedPipeServerProcessId(pipe,&pid):GetNamedPipeClientProcessId(pipe,&pid),ERROR_ACCESS_DENIED);
  require(pid==binding.pid,ERROR_ACCESS_DENIED);return bound_process(binding);
}
inline handle connect_fixed_pipe(const wchar_t* name,const Q_BOUND_PROCESS& peer) {
  require(wcscmp(name,broker_pipe)==0||wcscmp(name,collector_pipe)==0);
  handle pipe(CreateFileW(name,GENERIC_READ|GENERIC_WRITE,0,nullptr,OPEN_EXISTING,
    FILE_FLAG_OVERLAPPED|SECURITY_SQOS_PRESENT|SECURITY_IDENTIFICATION,nullptr));require(pipe.value!=INVALID_HANDLE_VALUE,ERROR_ACCESS_DENIED);
  DWORD mode=PIPE_READMODE_MESSAGE;require(SetNamedPipeHandleState(pipe,&mode,nullptr,nullptr));
  auto process=authenticate_pipe_peer(pipe,peer,true);return pipe;
}
inline handle accept_fixed_pipe(const wchar_t* name,const Q_BOUND_PROCESS& peer) {
  require(wcscmp(name,broker_pipe)==0||wcscmp(name,collector_pipe)==0);canonical_sid(peer.sid);
  const std::wstring sddl=L"D:P(A;;GA;;;"+std::wstring(peer.sid)+L")";PSECURITY_DESCRIPTOR sd=nullptr;
  require(ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.c_str(),SDDL_REVISION_1,&sd,nullptr));local_memory release{sd};
  SECURITY_ATTRIBUTES security{sizeof(security),sd,FALSE};
  handle pipe(CreateNamedPipeW(name,PIPE_ACCESS_DUPLEX|FILE_FLAG_OVERLAPPED|FILE_FLAG_FIRST_PIPE_INSTANCE,
    PIPE_TYPE_MESSAGE|PIPE_READMODE_MESSAGE|PIPE_WAIT|PIPE_REJECT_REMOTE_CLIENTS,1,Q_MAX_MESSAGE,Q_MAX_MESSAGE,5000,&security));
  require(pipe.value!=INVALID_HANDLE_VALUE,ERROR_ACCESS_DENIED);
  handle event(CreateEventW(nullptr,TRUE,FALSE,nullptr));require(event.value!=nullptr);OVERLAPPED operation{};operation.hEvent=event;
  const BOOL immediate=ConnectNamedPipe(pipe,&operation);const DWORD code=GetLastError();
  if(!immediate&&code!=ERROR_PIPE_CONNECTED)complete_io(pipe,operation,FALSE,code);
  auto process=authenticate_pipe_peer(pipe,peer,false);return pipe;
}
inline void verify_reply(const std::vector<uint8_t>& bytes,const Q_REQUEST& request,const deployment& d) {
  require(validate_observation(bytes.data(),bytes.size()));Q_HEADER header{};memcpy(&header,bytes.data(),sizeof(header));
  require(memcmp(&header.request,&request,sizeof(request))==0&&memcmp(header.collector_image,d.collector.image,32)==0
    &&header.object_count==d.inspection.object_count&&header.token_count==d.inspection.process_count,ERROR_ACCESS_DENIED);
  reader in(bytes.data()+sizeof(header),bytes.size()-sizeof(header));
  for(uint32_t i=0;i<header.token_count;i++){
    auto token=std::make_unique<Q_TOKEN>();memcpy(token.get(),in.take(offsetof(Q_TOKEN,groups)),offsetof(Q_TOKEN,groups));
    const auto& bound=d.inspection.processes[i];require(token->role==bound.role&&token->pid==bound.pid&&token->tid==bound.tid
      &&token->process_created==bound.created&&memcmp(token->image,bound.image,32)==0,ERROR_ACCESS_DENIED);
    in.take((static_cast<size_t>(token->group_count)+token->restricted_count)*sizeof(Q_GROUP)+static_cast<size_t>(token->privilege_count)*sizeof(Q_PRIVILEGE));
  }
  for(uint32_t i=0;i<header.object_count;i++){
    auto object=in.record<Q_OBJECT>();const auto& bound=d.inspection.objects[i];
    require(object.volume==bound.volume&&memcmp(object.file_id,bound.file_id,16)==0,ERROR_ACCESS_DENIED);in.take(object.descriptor_bytes);
  }
  for(uint32_t i=0;i<header.fact_count;i++){
    const auto frame=in.record<Q_FACT>();reader fact(in.take(frame.bytes),frame.bytes);
    if(frame.kind==Q_FACT_PRIMARY_TOKEN){const auto token=read_wire_token(fact);require(wcscmp(token->user,d.inspection.processes[frame.index].sid)==0,ERROR_ACCESS_DENIED);}
  }
}
}
