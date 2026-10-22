#include "../common/node_api.hpp"
#include "../common/ipc.hpp"
#include "../common/module-binding.hpp"
#include "../broker/launcher.hpp"
#include <atomic>

namespace {
std::atomic<bool> consumed{false};
void absent_variable(const wchar_t* name){wchar_t value[2]{};SetLastError(ERROR_SUCCESS);const auto count=GetEnvironmentVariableW(name,value,2);q::require(count==0&&GetLastError()==ERROR_ENVVAR_NOT_FOUND,ERROR_ACCESS_DENIED);}
q::node::value exchange(q::node::env env,q::node::info info) {
  using namespace q;auto& api=node::host();
  try {
    require(allowed_environment(),ERROR_ACCESS_DENIED);
    require(!consumed.exchange(true),ERROR_ACCESS_DENIED);
    size_t argc=2;node::value args[2]{};node::ok(api.get_cb_info(env,info,&argc,args,nullptr,nullptr));require(argc==1);
    bool buffer=false;node::ok(api.is_buffer(env,args[0],&buffer));require(buffer);
    void* data=nullptr;size_t bytes=0;node::ok(api.get_buffer_info(env,args[0],&data,&bytes));require(data&&(bytes==sizeof(Q_REQUEST)||bytes==sizeof(launch_request)));
    // Copy before IPC. Caller Buffer mutations cannot change the request that is verified.
    std::vector<uint8_t> input(static_cast<uint8_t*>(data),static_cast<uint8_t*>(data)+bytes);
    Q_REQUEST request{};memcpy(&request,input.data(),sizeof(request));
    launch_request start{};
    if(bytes==sizeof(start)){memcpy(&start,input.data(),sizeof(start));validate_launch_shape(start);}
    else require(valid_request(request));
    const auto fixed=load_deployment();
    if(bytes==sizeof(start))validate_launch_request(*fixed,start);
    else bound_request(request,fixed->inspection);
    require(GetCurrentProcessId()==fixed->verifier.pid);auto own=bound_process(fixed->verifier);
    verify_loaded_modules(*fixed,fixed->verifier);
    absent_variable(L"NODE_OPTIONS");absent_variable(L"NODE_PATH");
    require(wcscmp(GetCommandLineW(),fixed->client_command)==0,ERROR_ACCESS_DENIED);
    std::array<wchar_t,Q_MAX_NAME> cwd{};const DWORD cwdLength=GetCurrentDirectoryW(Q_MAX_NAME,cwd.data());
    require(cwdLength>0&&cwdLength<Q_MAX_NAME&&wcscmp(cwd.data(),fixed->client_cwd)==0,ERROR_ACCESS_DENIED);
    auto directory=protected_path(fixed->client_cwd,true);
    HMODULE module=nullptr;require(GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS|GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,reinterpret_cast<LPCWSTR>(&exchange),&module));
    std::array<wchar_t,Q_MAX_NAME> filename{};const auto size=GetModuleFileNameW(module,filename.data(),Q_MAX_NAME);
    require(size&&size<Q_MAX_NAME&&wcscmp(filename.data(),fixed->bridge_path)==0,ERROR_ACCESS_DENIED);
    protected_file_digest(filename,fixed->bridge_digest);
    auto pipe=connect_fixed_pipe(broker_pipe,broker_binding(*fixed));send_message(pipe,input.data(),input.size());
    auto reply=receive_message(pipe,Q_MAX_MESSAGE,bytes==sizeof(start)?90000:5000);auto peer=authenticate_pipe_peer(pipe,broker_binding(*fixed),true);
    require(alive(own)&&alive(peer));
    verify_loaded_modules(*fixed,fixed->verifier);verify_loaded_modules(*fixed,broker_binding(*fixed));
    if(bytes==sizeof(start)){require(reply.size()==sizeof(launch_outcome));launch_outcome outcome{};memcpy(&outcome,reply.data(),sizeof(outcome));validate_launch_outcome(start,outcome);}
    else verify_reply(reply,request,*fixed);
    send_message(pipe,input.data(),input.size());
    node::value result=nullptr;node::ok(api.create_buffer_copy(env,reply.size(),reply.data(),nullptr,&result));return result;
  }catch(...){api.throw_error(env,"BLOCKED","NATIVE_BROKER_EVIDENCE_UNAVAILABLE");return nullptr;}
}
}
extern "C" __declspec(dllexport) q::node::value __cdecl napi_register_module_v1(q::node::env env,q::node::value exports) {
  try{auto& api=q::node::host();q::node::value function=nullptr;q::node::ok(api.create_function(env,"exchange",8,exchange,nullptr,&function));
    q::node::ok(api.freeze(env,function));q::node::ok(api.set_named_property(env,exports,"exchange",function));q::node::ok(api.freeze(env,exports));return exports;
  }catch(...){
    using throw_type=q::node::status(__cdecl*)(q::node::env,const char*,const char*);
    auto raise=reinterpret_cast<throw_type>(GetProcAddress(GetModuleHandleW(nullptr),"napi_throw_error"));
    if(raise)raise(env,"BLOCKED","NATIVE_BRIDGE_ABI_UNAVAILABLE");return nullptr;
  }
}
extern "C" __declspec(dllexport) int32_t __cdecl node_api_module_get_api_version_v1(){return 8;}
