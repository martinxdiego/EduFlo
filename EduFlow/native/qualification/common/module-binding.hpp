#pragma once
#include "bootstrap.hpp"
#include <psapi.h>
#pragma comment(lib,"psapi.lib")

namespace q {
inline const sealed_file& sealed_module(const deployment& fixed,std::span<const wchar_t> path) {
  require(fixed.sealed_count>0&&fixed.sealed_count<=128);
  const auto name=canonical_local(path);const sealed_file* match=nullptr;std::set<std::wstring> seen;
  for(uint32_t i=0;i<fixed.sealed_count;i++){
    auto candidate=canonical_local(fixed.sealed[i].path);
    std::transform(candidate.begin(),candidate.end(),candidate.begin(),[](wchar_t c){return static_cast<wchar_t>(towupper(c));});
    require(seen.insert(candidate).second,ERROR_ACCESS_DENIED);
    if(_wcsicmp(name.c_str(),candidate.c_str())==0){require(match==nullptr);match=&fixed.sealed[i];}
  }
  require(match!=nullptr,ERROR_ACCESS_DENIED);return *match;
}
inline std::vector<HMODULE> module_sample(HANDLE process) {
  std::array<HMODULE,128> modules{};DWORD bytes=0;
  require(EnumProcessModulesEx(process,modules.data(),sizeof(modules),&bytes,LIST_MODULES_ALL)
    &&bytes&&bytes<=sizeof(modules)&&bytes%sizeof(HMODULE)==0,ERROR_NOT_SUPPORTED);
  std::vector<HMODULE> values(modules.begin(),modules.begin()+bytes/sizeof(HMODULE));
  std::sort(values.begin(),values.end(),[](HMODULE a,HMODULE b){return reinterpret_cast<uintptr_t>(a)<reinterpret_cast<uintptr_t>(b);});
  require(std::adjacent_find(values.begin(),values.end())==values.end());return values;
}
inline void verify_loaded_modules(const deployment& fixed,const Q_BOUND_PROCESS& binding) {
  auto identity=bound_process(binding);
  handle process(OpenProcess(PROCESS_QUERY_INFORMATION|PROCESS_VM_READ|SYNCHRONIZE,FALSE,binding.pid));
  require(process.value&&alive(process)&&created(process)==binding.created,ERROR_ACCESS_DENIED);
  const auto before=module_sample(process);
  for(const auto module:before){
    std::array<wchar_t,Q_MAX_NAME> path{};const auto length=GetModuleFileNameExW(process,module,path.data(),Q_MAX_NAME);
    require(length&&length<Q_MAX_NAME,ERROR_NOT_SUPPORTED);
    const auto& sealed=sealed_module(fixed,path);protected_file_digest(path,sealed.digest);
    std::array<wchar_t,Q_MAX_NAME> after{};require(GetModuleFileNameExW(process,module,after.data(),Q_MAX_NAME)==length
      &&wcscmp(path.data(),after.data())==0,ERROR_RETRY);
  }
  require(before==module_sample(process)&&alive(process)&&alive(identity)&&created(process)==binding.created,ERROR_RETRY);
  // Loader enumeration does not prove all executable mappings, datafile-loaded
  // code, JIT/JS/package resolution, or absence of transient modules. Never use
  // this sampled check to satisfy SEALED_RUNTIME_DEPENDENCY_CLOSURE by itself.
}
}
