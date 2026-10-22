#include "launcher.hpp"
#include "../common/module-binding.hpp"

int wmain(int argc,wchar_t**) {
  using namespace q;if(argc!=1||!allowed_environment())return ERROR_ACCESS_DENIED;
  try {
    const auto fixed=load_deployment();const auto broker=broker_binding(*fixed);
    require(GetCurrentProcessId()==broker.pid);auto own=bound_process(broker);
    verify_loaded_modules(*fixed,broker);
    auto peer=accept_fixed_pipe(broker_pipe,fixed->verifier);
    const auto requestBytes=receive_message(peer,sizeof(launch_request));
    require(requestBytes.size()==sizeof(Q_REQUEST)||requestBytes.size()==sizeof(launch_request));
    if(requestBytes.size()==sizeof(launch_request)){
      launch_request start{};memcpy(&start,requestBytes.data(),sizeof(start));validate_launch_request(*fixed,start);
      auto verifier=authenticate_pipe_peer(peer,fixed->verifier,false);require(alive(verifier));
      verify_loaded_modules(*fixed,fixed->verifier);
      const auto result=launch_fixed_role(*fixed,start);
      auto finalVerifier=authenticate_pipe_peer(peer,fixed->verifier,false);require(alive(own)&&alive(finalVerifier));
      send_message(peer,&result,sizeof(result));await_receipt(peer,requestBytes.data(),requestBytes.size());
      auto receiptPeer=authenticate_pipe_peer(peer,fixed->verifier,false);require(alive(receiptPeer));return 0;
    }
    Q_REQUEST request{};memcpy(&request,requestBytes.data(),sizeof(request));bound_request(request,fixed->inspection);
    // This process handles exactly one request. Every uncertain operation exits;
    // no loop/retry or reusable observation permission survives this generation.
    auto collector=connect_fixed_pipe(collector_pipe,fixed->collector);
    send_message(collector,&request,sizeof(request));auto reply=receive_message(collector,Q_MAX_MESSAGE);
    auto observedCollector=authenticate_pipe_peer(collector,fixed->collector,true);verify_reply(reply,request,*fixed);
    verify_loaded_modules(*fixed,fixed->collector);verify_loaded_modules(*fixed,broker);
    auto observedVerifier=authenticate_pipe_peer(peer,fixed->verifier,false);
    require(alive(own)&&alive(observedCollector)&&alive(observedVerifier));send_message(collector,&request,sizeof(request));
    send_message(peer,reply.data(),reply.size());await_receipt(peer,&request,sizeof(request));
    auto receiptPeer=authenticate_pipe_peer(peer,fixed->verifier,false);require(alive(receiptPeer));return 0;
  }catch(const error& e){return static_cast<int>(e.code?e.code:ERROR_INVALID_DATA);}catch(...){return ERROR_INVALID_DATA;}
}
