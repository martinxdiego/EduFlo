#pragma once
#include "windows.hpp"

// Minimal declarations of the stable Node-API C ABI used by this Windows addon.
// Resolve exported functions from the actual host; no V8 ABI or node.lib needed.
// https://nodejs.org/api/n-api.html
namespace q::node {
struct env__;struct value__;struct info__;
using env=env__*;using value=value__*;using info=info__*;using status=int;
using callback=value(__cdecl*)(env,info);
template<class T>T symbol(const char* name){auto p=GetProcAddress(GetModuleHandleW(nullptr),name);require(p!=nullptr,ERROR_NOT_SUPPORTED);return reinterpret_cast<T>(p);}
struct api {
  status(__cdecl*create_function)(env,const char*,size_t,callback,void*,value*)=symbol<decltype(create_function)>("napi_create_function");
  status(__cdecl*set_named_property)(env,value,const char*,value)=symbol<decltype(set_named_property)>("napi_set_named_property");
  status(__cdecl*get_cb_info)(env,info,size_t*,value*,value*,void**)=symbol<decltype(get_cb_info)>("napi_get_cb_info");
  status(__cdecl*is_buffer)(env,value,bool*)=symbol<decltype(is_buffer)>("napi_is_buffer");
  status(__cdecl*get_buffer_info)(env,value,void**,size_t*)=symbol<decltype(get_buffer_info)>("napi_get_buffer_info");
  status(__cdecl*create_buffer_copy)(env,size_t,const void*,void**,value*)=symbol<decltype(create_buffer_copy)>("napi_create_buffer_copy");
  status(__cdecl*throw_error)(env,const char*,const char*)=symbol<decltype(throw_error)>("napi_throw_error");
  status(__cdecl*freeze)(env,value)=symbol<decltype(freeze)>("napi_object_freeze");
};
inline api& host(){static api value;return value;}
inline void ok(status value){require(value==0);}
}
