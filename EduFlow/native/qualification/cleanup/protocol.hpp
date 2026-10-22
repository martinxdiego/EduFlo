#pragma once
#include "../common/controller-rpc.hpp"
#include <map>

namespace q {
enum cleanup_phase:uint32_t { cleanup_begin=1,cleanup_step_intent=2,cleanup_step_outcome=3,cleanup_finish=4 };
struct cleanup_request {
  uint32_t magic=Q_MAGIC,version=1,size=sizeof(cleanup_request),phase=0,ordinal=0,completed=0,error=0,reserved=0;
  uint64_t pid=0,created=0;
  uint8_t nonce[32]{},fixture[32]{},epoch[32]{},profile[32]{},boot[32]{},ticket[32]{},evidence[32]{},manifest[32]{},handles[32]{};
};
struct cleanup_response {
  uint32_t magic=Q_MAGIC,version=1,size=sizeof(cleanup_response),decision=0;cleanup_request request;
  uint64_t journal_sequence=0;uint8_t journal_head[32]{};
  uint32_t evidence_sealed=0,consumption_persisted=0,actors_quiescent=0,handles_accounted=0,synthetic=0,reserved=0;
};
inline void validate_cleanup_reply(const cleanup_request& request,const cleanup_response& reply) {
  require(request.magic==Q_MAGIC&&request.version==1&&request.size==sizeof(request)&&request.phase>=cleanup_begin&&request.phase<=cleanup_finish
    &&request.ordinal<=128&&request.completed<=128&&!request.reserved&&request.pid&&request.created);
  for(auto bytes:{std::span<const uint8_t>(request.nonce),std::span<const uint8_t>(request.fixture),std::span<const uint8_t>(request.epoch),std::span<const uint8_t>(request.profile),std::span<const uint8_t>(request.boot),std::span<const uint8_t>(request.ticket),std::span<const uint8_t>(request.evidence),std::span<const uint8_t>(request.manifest)})require(nonzero(bytes));
  require(request.phase==cleanup_step_outcome||!request.error);
  require(request.phase==cleanup_begin?(!request.ordinal&&!request.completed&&!nonzero(request.handles)):nonzero(request.handles));
  if(request.phase==cleanup_step_intent)require(request.ordinal==request.completed+1);
  if(request.phase==cleanup_step_outcome)require(request.ordinal>0&&(request.error?request.ordinal==request.completed+1:request.ordinal==request.completed));
  if(request.phase==cleanup_finish)require(request.ordinal>0&&request.ordinal==request.completed);
  require(reply.magic==Q_MAGIC&&reply.version==1&&reply.size==sizeof(reply)&&reply.decision==1&&memcmp(&request,&reply.request,sizeof(request))==0
    &&reply.journal_sequence&&nonzero(reply.journal_head)&&reply.evidence_sealed==1&&reply.consumption_persisted==1&&reply.actors_quiescent==1
    &&reply.handles_accounted==1&&!reply.synthetic&&!reply.reserved,ERROR_ACCESS_DENIED);
}
inline cleanup_response cleanup_exchange(const deployment& fixed,cleanup_request request) {
  const auto reply=controller_http<cleanup_request,cleanup_response>(fixed,request,L"/qualification/v1/cleanup");validate_cleanup_reply(request,reply);return reply;
}
inline std::wstring cleanup_name(const wchar_t (&input)[256]) {
  require(fixed_string(input,256));const std::wstring name(input);require(!name.empty()&&name!=L"."&&name!=L".."&&name.back()!=L'.'&&name.back()!=L' ');
  for(const auto c:name)require((c>=L'a'&&c<=L'z')||(c>=L'0'&&c<=L'9')||c==L'-'||c==L'_'||c==L'.');
  return name;
}
struct cleanup_plan { std::vector<std::wstring> paths;std::map<uint32_t,uint32_t> selected;std::array<uint8_t,32> digest; };
inline cleanup_plan validate_cleanup_plan(const deployment& fixed) {
  const auto& policy=fixed.cleanup;const auto& objects=fixed.inspection;
  require(objects.object_count>0&&objects.object_count<=Q_MAX_OBJECTS&&policy.count>0&&policy.count<=128&&policy.root_object<objects.object_count
    &&!policy.reserved[0]&&!policy.reserved[1]&&nonzero(policy.ticket)&&nonzero(policy.evidence));
  cleanup_plan plan{};std::set<std::wstring> unique;
  for(uint32_t i=0;i<objects.object_count;i++){auto name=canonical_local(objects.objects[i].path);require(unique.insert(name).second&&objects.objects[i].volume&&nonzero(objects.objects[i].file_id));plan.paths.push_back(name);}
  const auto& root=plan.paths[policy.root_object];const auto rootName=root.substr(root.find_last_of(L'\\')+1);
  require(rootName.starts_with(L"qualification-")&&rootName.size()>14&&rootName.size()<=128,ERROR_ACCESS_DENIED);
  for(const auto c:rootName)require((c>=L'a'&&c<=L'z')||(c>=L'0'&&c<=L'9')||c==L'-');
  for(uint32_t i=0;i<policy.count;i++){
    const auto& entry=policy.entries[i];require(!entry.reserved&&entry.object<objects.object_count&&entry.parent<objects.object_count&&entry.object!=entry.parent);
    require(plan.selected.emplace(entry.object,i).second);const auto name=cleanup_name(entry.name);
    const auto& path=plan.paths[entry.object];const auto& parent=plan.paths[entry.parent];
    require(path==parent+(parent.size()==3?L"":L"\\")+name&&(entry.object==policy.root_object||path.starts_with(root+L"\\")));
    require(objects.objects[entry.object].volume==objects.objects[entry.parent].volume&&objects.objects[entry.object].volume==policy.volume.volume);
    require((entry.attributes&~(FILE_ATTRIBUTE_DIRECTORY|FILE_ATTRIBUTE_REPARSE_POINT))==0);
  }
  for(uint32_t i=policy.count;i<128;i++){const auto bytes=std::as_bytes(std::span(&policy.entries[i],1));require(std::all_of(bytes.begin(),bytes.end(),[](std::byte b){return b==std::byte{0};}));}
  require(plan.selected.contains(policy.root_object)&&policy.entries[policy.count-1].object==policy.root_object);
  require(policy.entries[policy.count-1].attributes==FILE_ATTRIBUTE_DIRECTORY);
  for(uint32_t i=0;i<policy.count;i++){
    const auto& entry=policy.entries[i];if(entry.object==policy.root_object)continue;
    const auto parent=plan.selected.find(entry.parent);require(parent!=plan.selected.end()&&parent->second>i);
    require(policy.entries[parent->second].attributes==FILE_ATTRIBUTE_DIRECTORY); // Never descend through a reparse leaf.
  }
  // The controller must match this digest to its own sealed enrollment record;
  // computing it locally is not authentication or permission to delete.
  std::vector<uint8_t> encoded;append(encoded,&policy,sizeof(policy));
  append(encoded,objects.objects,objects.object_count*sizeof(Q_BOUND_OBJECT));plan.digest=byte_hash(encoded.data(),encoded.size());return plan;
}
}
