#pragma once
#include "release-proof.hpp"
#include <set>

namespace q {
// A2 bounded external-evidence integration contract only. This type is not yet
// emitted by the collector, accepted by JS, or wired into protected bootstrap.
// A valid signature authenticates a package; opaque component digests alone
// do not prove the physical/VM topology or power-loss semantics. No authority.
enum storage_kind:uint32_t { storage_host=1,storage_volume,storage_filesystem,storage_device,storage_controller,storage_firmware,storage_cache,
  storage_filters,storage_power_contract,storage_hypervisor,storage_virtual_disk,storage_virtual_controller,storage_backing,storage_host_cache,storage_host_filters };
enum storage_source:uint32_t { local_query=1,host_verifier=2,storage_contract=3 };
struct storage_node {uint32_t kind=0,source=0,parent=0,reserved=0;uint8_t identity[32]{},version[32]{},configuration[32]{},evidence[32]{};};
struct storage_profile {
  uint32_t version=1,size=sizeof(storage_profile),target_kind=0,count=0;
  uint64_t volume=0;uint8_t profile[32]{},epoch[32]{},fixture[32]{},boot[32]{};
  storage_node nodes[32];uint8_t signature[64]{};
};
static_assert(sizeof(storage_node)==144&&sizeof(storage_profile)==4824);
inline std::array<uint8_t,32> storage_profile_digest(const storage_profile& profile) {
  constexpr char domain[]="EduFlow qualification typed storage profile v1";std::vector<uint8_t> bytes;
  append(bytes,domain,sizeof(domain));append(bytes,&profile,offsetof(storage_profile,signature));return byte_hash(bytes.data(),bytes.size());
}
inline const storage_node& storage_component(const storage_profile& profile,uint32_t kind) {
  require(profile.count>0&&profile.count<=32,ERROR_NOT_SUPPORTED);
  const storage_node* found=nullptr;for(uint32_t i=0;i<profile.count;i++)if(profile.nodes[i].kind==kind){require(found==nullptr);found=&profile.nodes[i];}
  require(found!=nullptr,ERROR_NOT_SUPPORTED);return *found;
}
inline void validate_storage_profile(const storage_profile& profile,const Q_REQUEST& binding) {
  require(profile.version==1&&profile.size==sizeof(profile)&&(profile.target_kind==1||profile.target_kind==2)&&profile.count>=9&&profile.count<=32&&profile.volume,ERROR_NOT_SUPPORTED);
  require(memcmp(profile.profile,binding.profile,32)==0&&memcmp(profile.epoch,binding.epoch,32)==0&&memcmp(profile.fixture,binding.fixture,32)==0&&memcmp(profile.boot,binding.boot,32)==0,ERROR_ACCESS_DENIED);
  std::set<uint32_t> kinds;
  for(uint32_t i=0;i<profile.count;i++){
    const auto& node=profile.nodes[i];require(node.kind>=1&&node.kind<=15&&kinds.insert(node.kind).second&&!node.reserved
      &&(i==0?(node.kind==storage_host&&node.parent==UINT32_MAX):node.parent<i),ERROR_NOT_SUPPORTED);
    for(auto field:{std::span<const uint8_t>(node.identity),std::span<const uint8_t>(node.version),std::span<const uint8_t>(node.configuration),std::span<const uint8_t>(node.evidence)})
      require(std::any_of(field.begin(),field.end(),[](uint8_t b){return b!=0;}),ERROR_NOT_SUPPORTED);
    const bool local=node.kind==storage_volume||node.kind==storage_filesystem||node.kind==storage_cache||node.kind==storage_filters
      ||(profile.target_kind==1&&(node.kind==storage_device||node.kind==storage_firmware))||(profile.target_kind==2&&node.kind==storage_virtual_controller);
    require(node.source==(local?local_query:(node.kind==storage_power_contract?storage_contract:host_verifier)),ERROR_NOT_SUPPORTED);
  }
  for(uint32_t kind=1;kind<=(profile.target_kind==1?9u:15u);kind++)require(kinds.count(kind)==1,ERROR_NOT_SUPPORTED);
  require(profile.count==(profile.target_kind==1?9u:15u),ERROR_NOT_SUPPORTED);
  for(uint32_t i=profile.count;i<32;i++){const storage_node zero{};require(memcmp(&zero,&profile.nodes[i],sizeof(zero))==0);}
}
inline void verify_storage_local_anchors(const storage_profile& profile,const Q_VOLUME_FACT& local,std::span<const uint8_t> filters) {
  require(profile.target_kind==1||profile.target_kind==2,ERROR_NOT_SUPPORTED);
  require(filters.size()>=4&&filters.size()<=4+32*32);uint32_t count=0;memcpy(&count,filters.data(),4);require(count<=32&&filters.size()==4+32*count);
  require(profile.volume==local.volume&&local.bus&&local.removable==0&&local.cache_type>=1&&local.cache_type<=3
    &&local.cache_enabled>=1&&local.cache_enabled<=2&&local.cache_changeable>=1&&local.cache_changeable<=2&&local.write_through>=1&&local.write_through<=2
    &&local.flush_supported<=1&&local.power_protection<=1&&local.nv_cache<=1,ERROR_NOT_SUPPORTED);
  require(memcmp(storage_component(profile,storage_volume).identity,local.volume_name,32)==0,ERROR_ACCESS_DENIED);
  require(memcmp(storage_component(profile,profile.target_kind==1?storage_device:storage_virtual_controller).identity,local.device_descriptor,32)==0,ERROR_ACCESS_DENIED);
  if(profile.target_kind==1)require(memcmp(storage_component(profile,storage_firmware).identity,local.firmware,32)==0,ERROR_ACCESS_DENIED);
  const auto fs=byte_hash(&local.filesystem_flags,sizeof(local.filesystem_flags)),cache=byte_hash(&local.cache_type,7*sizeof(uint32_t)),filter=byte_hash(filters.data(),filters.size());
  require(memcmp(storage_component(profile,storage_filesystem).identity,fs.data(),32)==0&&memcmp(storage_component(profile,storage_cache).identity,cache.data(),32)==0
    &&memcmp(storage_component(profile,storage_filters).identity,filter.data(),32)==0,ERROR_ACCESS_DENIED);
  require(memcmp(storage_component(profile,storage_volume).configuration,local.extents,32)==0,ERROR_ACCESS_DENIED);
}
inline void verify_storage_signature(const storage_profile& profile,std::span<const uint8_t> key){verify_p256(storage_profile_digest(profile),profile.signature,key);}
}
