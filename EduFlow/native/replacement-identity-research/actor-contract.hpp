#pragma once
#include "acquisition.hpp"

namespace replacement_research {
enum class fixture_case { rename, posix_rename, link_alias, concurrent_rename };
struct native_namespace_information {
  union { BOOLEAN replace; ULONG flags; } mode;
  HANDLE parent;
  ULONG name_bytes;
  WCHAR name[1];
};
static_assert(offsetof(native_namespace_information,name)==offsetof(FILE_RENAME_INFO,FileName));
struct actor_request { ULONG information_class, flags; std::vector<uint8_t> bytes; };
inline actor_request prepare_actor(fixture_case kind,HANDLE prebound_parent) {
  // Encoding only. The parent must later be an actor-owned handle whose identity
  // was independently bound. No path, arbitrary flags or command line input.
  need(prebound_parent!=nullptr && prebound_parent!=INVALID_HANDLE_VALUE,"actor parent required");
  need(kind==fixture_case::rename || kind==fixture_case::posix_rename || kind==fixture_case::link_alias || kind==fixture_case::concurrent_rename,"unsupported actor case");
  const bool posix=kind==fixture_case::posix_rename;
  actor_request out{kind==fixture_case::link_alias?11u:posix?65u:10u,posix?3u:1u,{}};
  native_namespace_information info{};
  if(posix)info.mode.flags=out.flags;else info.mode.replace=TRUE;
  info.parent=prebound_parent;info.name_bytes=12;
  out.bytes.resize(sizeof(info)+12);std::memcpy(out.bytes.data(),&info,sizeof(info));
  std::memcpy(out.bytes.data()+offsetof(native_namespace_information,name),L"target",12);
  return out;
}
struct actor_completion {
  DWORD pid,tid; uint64_t process_creation,thread_creation;
  ULONG information_class,flags;
  LONG call_status,io_status;
  ULONG_PTR information;
  // Native caller must log both status values. Pending/unknown termination is
  // unresolved; no conversion to model NO_EFFECT_FAILURE without independent
  // native result and final-graph evidence. No timestamps select a victim.
};
}
