#include "service-contract.hpp"
#include "etw-reader.hpp"
#include "../common/ipc.hpp"
#include "../common/module-binding.hpp"
#include <fltuser.h>
#pragma comment(lib,"fltlib.lib")

namespace {
using namespace q;
// Separate fixed endpoint: no extension to the A broker's route allowlist.
handle accept_observer(const Q_BOUND_PROCESS& peer){
  canonical_sid(peer.sid);const auto sddl=L"D:P(A;;GA;;;"+std::wstring(peer.sid)+L")";PSECURITY_DESCRIPTOR raw=nullptr;
  require(ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.c_str(),SDDL_REVISION_1,&raw,nullptr));local_memory sd{raw};
  SECURITY_ATTRIBUTES security{sizeof(security),raw,FALSE};
  handle pipe(CreateNamedPipeW(observation_pipe,PIPE_ACCESS_DUPLEX|FILE_FLAG_OVERLAPPED|FILE_FLAG_FIRST_PIPE_INSTANCE,
    PIPE_TYPE_MESSAGE|PIPE_READMODE_MESSAGE|PIPE_WAIT|PIPE_REJECT_REMOTE_CLIENTS,1,Q_MAX_MESSAGE,Q_MAX_MESSAGE,5000,&security));
  require(pipe.value!=INVALID_HANDLE_VALUE);handle event(CreateEventW(nullptr,TRUE,FALSE,nullptr));require(event.value!=nullptr);
  OVERLAPPED operation{};operation.hEvent=event;const BOOL immediate=ConnectNamedPipe(pipe,&operation);const DWORD code=GetLastError();
  if(!immediate&&code!=ERROR_PIPE_CONNECTED)complete_io(pipe,operation,FALSE,code);
  auto process=authenticate_pipe_peer(pipe,peer,false);return pipe;
}
void recheck(HANDLE pipe,const deployment& fixed){
  auto peer=authenticate_pipe_peer(pipe,fixed.verifier,false);auto own=bound_process(fixed.release_verifier);
  verify_loaded_modules(fixed,fixed.release_verifier);verify_loaded_modules(fixed,fixed.verifier);require(alive(peer)&&alive(own));
}
class kernel_reader {
  handle port_;QB_CONNECT binding_{};
public:
  kernel_reader(const Q_REQUEST& request,const Q_BOUND_PROCESS& self){
    binding_.magic=QB_MAGIC;binding_.version=QB_VERSION;binding_.size=sizeof(binding_);binding_.epoch=observation_epoch(request);
    binding_.pid=self.pid;binding_.created=self.created;memcpy(binding_.challenge,request.challenge,32);
    memcpy(binding_.profile,request.profile,32);memcpy(binding_.fixture,request.fixture,32);memcpy(binding_.boot,request.boot,32);
    HANDLE raw=nullptr;const auto status=FilterConnectCommunicationPort(observation_port,0,&binding_,sizeof(binding_),nullptr,&raw);
    port_.value=raw;require(SUCCEEDED(status)&&raw&&raw!=INVALID_HANDLE_VALUE,ERROR_ACCESS_DENIED);
  }
  observation_frame receive(uint32_t verb,observation_chain& chain,std::mutex& mutex){
    QB_COMMAND command{QB_MAGIC,QB_VERSION,sizeof(QB_COMMAND),verb,binding_.epoch,{}};memcpy(command.challenge,binding_.challenge,32);
    std::array<uint8_t,sizeof(QB_EVENT)> bytes{};DWORD returned=0;
    const auto status=FilterSendMessage(port_,&command,sizeof(command),bytes.data(),static_cast<DWORD>(bytes.size()),&returned);
    std::lock_guard lock(mutex);if(FAILED(status)){chain.fail();throw error{ERROR_BROKEN_PIPE};}
    observation_frame frame{};
    if(returned==sizeof(QB_EVENT)){frame.kind=1;memcpy(&frame.event,bytes.data(),returned);chain.record(&frame.event,sizeof(frame.event));}
    else if(returned==sizeof(QB_HEALTH)){frame.kind=2;memcpy(&frame.health,bytes.data(),returned);
      if(!health_shape(frame.health,binding_.epoch)||!health_clean(frame.health)){chain.fail();throw error{ERROR_INVALID_DATA};}}
    else {chain.fail();throw error{ERROR_INVALID_DATA};}return frame;
  }
};
}
int wmain(int argc,wchar_t**){
  using namespace q;if(argc!=1||!allowed_environment())return ERROR_ACCESS_DENIED;
  try{
    const auto fixed=load_deployment();require(GetCurrentProcessId()==fixed->release_verifier.pid);
    auto own=bound_process(fixed->release_verifier);verify_loaded_modules(*fixed,fixed->release_verifier);
    auto pipe=accept_observer(fixed->verifier);observation_session session;
    auto bytes=receive_message(pipe,sizeof(observation_command));session.accept(bytes.data(),bytes.size(),fixed->inspection);
    observation_command first{};memcpy(&first,bytes.data(),sizeof(first));recheck(pipe,*fixed);
    observation_chain chain(observation_epoch(first.request));std::mutex mutex;
    // Starting a trace is runtime code only. This implementation task never
    // launches the service, loads a filter, installs services or provisions it.
    etw_reader trace(chain,*fixed,mutex);kernel_reader kernel(first.request,fixed->release_verifier);
    auto initial=kernel.receive(QB_HEALTH_QUERY,chain,mutex);
    require(initial.kind==2&&initial.health.state==QB_CAPTURING);
    // The kernel currently reports unsupported global volume coverage here;
    // that error exits before any start acknowledgement or final receipt.
    // The target barrier uses native censuses, observed DCStart records and
    // owned-session checks. It does not substitute for global kernel coverage.
    trace.await_target_rundown();
    {std::lock_guard lock(mutex);require(trace.rundown_ready(),ERROR_NOT_READY);}
    initial.sequence=first.sequence;initial.request=first.request;recheck(pipe,*fixed);send_message(pipe,&initial,sizeof(initial));
    for(uint64_t requestCount=1;requestCount<65536;requestCount++){
      bytes=receive_message(pipe,sizeof(observation_command));recheck(pipe,*fixed);session.accept(bytes.data(),bytes.size(),fixed->inspection);
      observation_command command{};memcpy(&command,bytes.data(),sizeof(command));
      if(command.verb==observation_poll){auto frame=kernel.receive(QB_POLL,chain,mutex);frame.sequence=command.sequence;frame.request=first.request;
        recheck(pipe,*fixed);send_message(pipe,&frame,sizeof(frame));continue;}
      auto drain=kernel.receive(QB_DRAIN_REQUEST,chain,mutex);require(drain.kind==2&&drain.health.state==QB_DRAINING);
      const auto deadline=GetTickCount64()+5000;bool drained=false;
      while(GetTickCount64()<deadline){auto frame=kernel.receive(QB_POLL,chain,mutex);
        if(frame.kind==1){frame.sequence=command.sequence;frame.request=first.request;recheck(pipe,*fixed);send_message(pipe,&frame,sizeof(frame));}
        else if(!frame.health.pending&&!frame.health.queued){drained=true;break;}
        else SwitchToThread();}
      require(drained,ERROR_TIMEOUT);kernel.receive(QB_SEAL_REQUEST,chain,mutex);
      auto end=kernel.receive(QB_POLL,chain,mutex);require(end.kind==1&&end.event.kind==QB_END);
      end.sequence=command.sequence;end.request=first.request;recheck(pipe,*fixed);send_message(pipe,&end,sizeof(end));
      // Stop/join ETW before the final kernel health read. Reusing an earlier
      // health snapshot could hide unload/disconnect/loss during the ETW drain.
      trace.finish();auto final=kernel.receive(QB_HEALTH_QUERY,chain,mutex);require(final.kind==2);
      {std::lock_guard lock(mutex);final.receipt=chain.finish(final.health);}
      const auto targets=trace.target_evidence();final.receipt.target_processes=targets.processes;final.receipt.target_threads=targets.threads;
      memcpy(final.receipt.target_rundown_digest,targets.digest.data(),32);
      final.kind=3;final.receipt.complete=0;final.sequence=command.sequence;final.request=first.request;recheck(pipe,*fixed);send_message(pipe,&final,sizeof(final));
      // Kind 3 is provisional. Only kind 4 records the authenticated kernel
      // EOS acknowledgement; an ordinary disconnect before that burns capture.
      await_receipt(pipe,&command,sizeof(command));recheck(pipe,*fixed);
      auto ended=kernel.receive(QB_END_SESSION,chain,mutex);require(ended.kind==2&&end_receipt_matches(final.health,ended.health));
      final.kind=4;final.receipt.complete=1;final.health=ended.health;recheck(pipe,*fixed);send_message(pipe,&final,sizeof(final));
      await_receipt(pipe,&final,sizeof(final));recheck(pipe,*fixed);return 0;
    }
    return ERROR_BUFFER_OVERFLOW;
  }catch(const error& e){return static_cast<int>(e.code?e.code:ERROR_INVALID_DATA);}catch(...){return ERROR_INVALID_DATA;}
}
