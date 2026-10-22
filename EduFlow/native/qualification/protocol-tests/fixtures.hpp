#pragma once
#include "../common/reader.hpp"
#include "../collector/facts.hpp"
namespace q {
inline std::vector<uint8_t> synthetic_observation(){
  Q_HEADER h{};h.request={};h.request.magic=Q_MAGIC;h.request.version=Q_COLLECTOR_VERSION;h.request.size=sizeof(Q_REQUEST);h.request.verb=1;
  memset(h.request.challenge,1,32);memset(h.request.profile,2,32);memset(h.request.epoch,3,32);memset(h.request.fixture,4,32);memset(h.request.boot,5,32);
  h.status=1;h.object_count=1;h.token_count=1;h.fact_count=8;memset(h.collector_image,6,32);
  std::vector<uint8_t> payload;
  auto t=std::make_unique<Q_TOKEN>();t->role=1;t->pid=1;t->tid=1;t->token_type=1;t->elevation=3;t->process_created=1;t->token_id=1;t->modified_id=1;
  wcscpy_s(t->user,L"S-1-5-18");wcscpy_s(t->owner,L"S-1-5-18");wcscpy_s(t->integrity,L"S-1-16-8192");memset(t->image,7,32);append(payload,t.get(),offsetof(Q_TOKEN,groups));
  Q_OBJECT o{};o.volume=1;o.attributes=FILE_ATTRIBUTE_DIRECTORY;o.descriptor_control=SE_SELF_RELATIVE|SE_DACL_PRESENT;o.descriptor_bytes=40;memset(o.file_id,8,16);wcscpy_s(o.owner,L"S-1-5-18");append(payload,&o,sizeof(o));
  std::array<uint8_t,40> sd{};SECURITY_DESCRIPTOR_RELATIVE header{};header.Revision=1;header.Control=SE_SELF_RELATIVE|SE_DACL_PRESENT;header.Dacl=20;header.Owner=28;memcpy(sd.data(),&header,20);
  ACL acl{};acl.AclRevision=ACL_REVISION;acl.AclSize=8;memcpy(sd.data()+20,&acl,8);sd[28]=1;sd[29]=1;sd[35]=5;sd[36]=18;append(payload,sd.data(),sd.size());
  Q_RESOLUTION resolution{};resolution.parent_index=UINT32_MAX;resolution.root=1;memset(resolution.final_name,9,32);fact(payload,Q_FACT_RESOLUTION,0,&resolution,sizeof(resolution));
  Q_VOLUME_FACT volume{};volume.volume=1;volume.bus=1;volume.cache_type=1;volume.cache_enabled=1;volume.cache_changeable=1;volume.write_through=1;fact(payload,Q_FACT_VOLUME,0,&volume,sizeof(volume));
  Q_MANDATORY_FACT mandatory{};fact(payload,Q_FACT_MANDATORY,0,&mandatory,sizeof(mandatory));
  uint32_t count=0;fact(payload,Q_FACT_HANDLES,0,&count,4);fact(payload,Q_FACT_FILTERS,0,&count,4);
  fact(payload,Q_FACT_PRIMARY_TOKEN,0,t.get(),offsetof(Q_TOKEN,groups));Q_TOKEN_CONTEXT context{};
  memset(context.primary_profile,10,32);memset(context.effective_profile,10,32);fact(payload,Q_FACT_TOKEN_CONTEXT,0,&context,sizeof(context));
  std::vector<uint8_t> access;uint32_t tokenCount=1;append(access,&tokenCount,4);Q_COMPOSITE_ACCESS a{};a.version=1;a.size=sizeof(a);a.owner_member=1;a.token_integrity=8192;a.object_integrity=8192;a.object_policy=1;
  append(access,&a,sizeof(a));append(access,&a,sizeof(a));fact(payload,Q_FACT_COMPOSITE_ACCESS,0,access.data(),access.size());
  h.payload_bytes=static_cast<uint32_t>(payload.size());std::vector<uint8_t> out;append(out,&h,sizeof(h));append(out,payload.data(),payload.size());return out;
}
}
