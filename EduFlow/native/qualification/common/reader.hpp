#pragma once
#include "windows.hpp"
#include "composite-access.hpp"
#include <set>
namespace q {
class reader {
  const uint8_t* data_;size_t remaining_;
public:
  reader(const void* data,size_t size):data_(static_cast<const uint8_t*>(data)),remaining_(size){require(size<=Q_MAX_MESSAGE&&(!size||data));}
  const uint8_t* take(size_t size){require(size<=remaining_);auto p=data_;data_+=size;remaining_-=size;return p;}
  template<class T>T record(){T result{};memcpy(&result,take(sizeof(T)),sizeof(T));return result;}
  size_t remaining()const{return remaining_;}
};
inline void wire_sid(const uint8_t* data,size_t size,uint32_t offset){
  if(!offset)return;require(offset>=20&&offset%4==0&&offset<=size&&size-offset>=8);require(data[offset]==SID_REVISION&&data[offset+1]<=15);
  require(8+static_cast<size_t>(data[offset+1])*4<=size-offset);
}
inline void wire_acl(const uint8_t* data,size_t size,uint32_t offset,bool sacl){
  if(!offset)return;require(offset>=20&&offset%4==0&&offset<=size&&size-offset>=8);
  ACL acl{};memcpy(&acl,data+offset,sizeof(acl));require(acl.AclSize>=8&&acl.AclSize%4==0&&acl.AclSize<=size-offset&&(acl.AclRevision==ACL_REVISION||acl.AclRevision==ACL_REVISION_DS));
  size_t current=8;for(uint32_t i=0;i<acl.AceCount;i++){
    require(current+8<=acl.AclSize);ACE_HEADER ace{};memcpy(&ace,data+offset+current,sizeof(ace));
    require(ace.AceSize>=16&&ace.AceSize%4==0&&ace.AceSize<=acl.AclSize-current);
    require(sacl?ace.AceType==SYSTEM_MANDATORY_LABEL_ACE_TYPE:(ace.AceType==ACCESS_ALLOWED_ACE_TYPE||ace.AceType==ACCESS_DENIED_ACE_TYPE),ERROR_NOT_SUPPORTED);
    const auto sid=data+offset+current+8;require(sid[0]==SID_REVISION&&sid[1]<=15&&8+static_cast<size_t>(sid[1])*4==ace.AceSize-8);
    current+=ace.AceSize;
  }require(current==acl.AclSize);
}
inline void wire_descriptor(const uint8_t* data,size_t size){
  require(size>=20&&size<=Q_MAX_DESCRIPTOR);SECURITY_DESCRIPTOR_RELATIVE sd{};memcpy(&sd,data,20);
  require(sd.Revision==SECURITY_DESCRIPTOR_REVISION&&!sd.Sbz1&&(sd.Control&SE_SELF_RELATIVE)&&(sd.Control&SE_DACL_PRESENT)&&sd.Dacl&&sd.Owner);
  wire_sid(data,size,sd.Owner);wire_sid(data,size,sd.Group);wire_acl(data,size,sd.Dacl,false);wire_acl(data,size,sd.Sacl,true);
  std::vector<std::pair<size_t,size_t>> ranges;
  auto add=[&](size_t start,size_t length){for(const auto& r:ranges)require(start>=r.second||r.first>=start+length);ranges.emplace_back(start,start+length);};
  for(const auto at:{sd.Owner,sd.Group})if(at)add(at,8+size_t(data[at+1])*4);
  for(const auto at:{sd.Sacl,sd.Dacl})if(at){uint16_t length=0;memcpy(&length,data+at+2,2);add(at,length);}
}
inline void wire_text_sid(const wchar_t (&value)[Q_MAX_SID]) {
  require(fixed_string(value,Q_MAX_SID)&&value[0]);PSID sid=nullptr;require(ConvertStringSidToSidW(value,&sid));local_memory release{sid};
  wchar_t canonical[Q_MAX_SID]{};sid_text(sid,canonical);require(wcscmp(value,canonical)==0);
}
inline std::unique_ptr<Q_TOKEN> read_wire_token(reader& in) {
  auto t=std::make_unique<Q_TOKEN>();memcpy(t.get(),in.take(offsetof(Q_TOKEN,groups)),offsetof(Q_TOKEN,groups));
  uint32_t padding=0;memcpy(&padding,reinterpret_cast<const uint8_t*>(t.get())+36,4);require(!padding);
  require(t->role>=1&&t->role<=6&&t->pid&&t->tid&&t->process_created&&t->token_id);
  require((t->token_type==1?t->impersonation==0:(t->token_type==2&&t->impersonation>=1&&t->impersonation<=4))&&t->elevation>=1&&t->elevation<=3);
  wire_text_sid(t->user);wire_text_sid(t->owner);wire_text_sid(t->integrity);
  require(t->group_count<=Q_MAX_MEMBERS&&t->restricted_count<=Q_MAX_MEMBERS&&t->privilege_count<=Q_MAX_PRIVILEGES);
  for(const bool restricted:{false,true}){
    const auto count=restricted?t->restricted_count:t->group_count;auto groups=restricted?t->restricted:t->groups;std::set<std::wstring> sids;
    for(uint32_t n=0;n<count;n++){groups[n]=in.record<Q_GROUP>();wire_text_sid(groups[n].sid);require(sids.insert(groups[n].sid).second);}
  }
  std::set<uint64_t> privileges;
  for(uint32_t n=0;n<t->privilege_count;n++){auto p=in.record<Q_PRIVILEGE>();require(privileges.insert((uint64_t(static_cast<uint32_t>(p.high))<<32)|p.low).second);t->privileges[n]=p;}
  return t;
}
inline bool validate_observation(const void* data,size_t size){
  reader in(data,size);const auto h=in.record<Q_HEADER>();
  require(valid_request(h.request)&&h.status==1&&h.reason==0&&h.payload_bytes==in.remaining());
  require(h.token_count>0&&h.token_count<=Q_MAX_TOKENS&&h.object_count>0&&h.object_count<=Q_MAX_OBJECTS&&h.fact_count==3*h.token_count+5*h.object_count);
  std::set<uint32_t> roles;
  std::vector<std::unique_ptr<Q_TOKEN>> tokens,primary(h.token_count);std::vector<Q_TOKEN_CONTEXT> contexts(h.token_count);
  for(uint32_t i=0;i<h.token_count;i++){
    auto t=read_wire_token(in);require(roles.insert(t->role).second);tokens.push_back(std::move(t));
  }
  std::vector<Q_OBJECT> objects;std::vector<object_security> security;
  for(uint32_t i=0;i<h.object_count;i++){
    auto o=in.record<Q_OBJECT>();require(o.index==i&&o.volume&&fixed_string(o.owner,Q_MAX_SID));
    for(uint32_t slot=h.token_count;slot<Q_MAX_TOKENS;slot++)require(o.effective_access[slot]==0&&o.primary_access[slot]==0);
    auto sd=in.take(o.descriptor_bytes);wire_descriptor(sd,o.descriptor_bytes);SECURITY_DESCRIPTOR_RELATIVE header{};memcpy(&header,sd,20);
    require(o.descriptor_control==header.Control);wchar_t owner[Q_MAX_SID]{};sid_text(const_cast<uint8_t*>(sd+header.Owner),owner);require(wcscmp(o.owner,owner)==0);
    objects.push_back(o);security.push_back(access_descriptor(const_cast<uint8_t*>(sd)));
  }
  std::set<uint64_t> facts;
  std::vector<Q_RESOLUTION> resolutions(h.object_count);
  std::vector<Q_MANDATORY_FACT> labels(h.object_count);
  std::vector<std::vector<Q_COMPOSITE_ACCESS>> composites(h.object_count);
  for(uint32_t i=0;i<h.fact_count;i++){
    auto f=in.record<Q_FACT>();require(f.kind>=Q_FACT_RESOLUTION&&f.kind<=Q_FACT_COMPOSITE_ACCESS&&!f.reserved);
    require(f.index<(f.kind==Q_FACT_HANDLES||f.kind==Q_FACT_PRIMARY_TOKEN||f.kind==Q_FACT_TOKEN_CONTEXT?h.token_count:h.object_count)&&facts.insert((uint64_t(f.kind)<<32)|f.index).second);
    reader value(in.take(f.bytes),f.bytes);
    if(f.kind==Q_FACT_RESOLUTION){auto v=value.record<Q_RESOLUTION>();require(v.root<=1&&!v.reserved&&v.reparse_bytes<=MAXIMUM_REPARSE_DATA_BUFFER_SIZE);require(v.root?v.parent_index==UINT32_MAX:(v.parent_index<h.object_count&&v.parent_index!=f.index));resolutions[f.index]=v;}
    if(f.kind==Q_FACT_VOLUME){auto v=value.record<Q_VOLUME_FACT>();require(v.volume==objects[f.index].volume&&v.flush_supported<=1&&v.power_protection<=1&&v.nv_cache<=1&&!v.removable);}
    if(f.kind==Q_FACT_MANDATORY){auto v=value.record<Q_MANDATORY_FACT>();require(v.present<=1&&(v.mask&~SYSTEM_MANDATORY_LABEL_VALID_MASK)==0&&fixed_string(v.integrity,Q_MAX_SID));labels[f.index]=v;}
    if(f.kind==Q_FACT_HANDLES){auto count=value.record<uint32_t>();require(count<=256);uint64_t previous=0;for(uint32_t n=0;n<count;n++){auto v=value.record<Q_HANDLE_FACT>();require(v.handle>previous&&v.kind<=6);previous=v.handle;}}
    if(f.kind==Q_FACT_FILTERS){auto count=value.record<uint32_t>();require(count<=32);value.take(static_cast<size_t>(count)*32);}
    if(f.kind==Q_FACT_PRIMARY_TOKEN){auto t=read_wire_token(value);const auto& effective=*tokens[f.index];
      require(t->token_type==TokenPrimary&&!t->impersonation&&t->role==effective.role&&t->pid==effective.pid&&t->tid==effective.tid&&t->process_created==effective.process_created&&memcmp(t->image,effective.image,32)==0);
      if(!effective.impersonation)require(memcmp(t.get(),&effective,sizeof(Q_TOKEN))==0);primary[f.index]=std::move(t);
    }
    if(f.kind==Q_FACT_TOKEN_CONTEXT){auto c=value.record<Q_TOKEN_CONTEXT>();
      require(!(c.primary_mandatory&~TOKEN_MANDATORY_POLICY_VALID_MASK)&&!(c.effective_mandatory&~TOKEN_MANDATORY_POLICY_VALID_MASK)
        &&c.primary_ui_access<=1&&c.effective_ui_access<=1&&!c.primary_app_container&&!c.effective_app_container
        &&c.primary_virtualization_allowed<=1&&c.effective_virtualization_allowed<=1&&c.primary_virtualization_enabled<=1&&c.effective_virtualization_enabled<=1);
      require(std::any_of(std::begin(c.primary_profile),std::end(c.primary_profile),[](uint8_t b){return b!=0;})&&std::any_of(std::begin(c.effective_profile),std::end(c.effective_profile),[](uint8_t b){return b!=0;}));
      if(!tokens[f.index]->impersonation){std::array<uint32_t,12> words{};memcpy(words.data(),&c,sizeof(words));for(size_t n=0;n<12;n+=2)require(words[n]==words[n+1]);require(memcmp(c.primary_profile,c.effective_profile,32)==0);}
      contexts[f.index]=c;
    }
    if(f.kind==Q_FACT_COMPOSITE_ACCESS){require(value.record<uint32_t>()==h.token_count);
      for(uint32_t token=0;token<h.token_count;token++)for(const bool primaryToken:{true,false}){
        const auto access=value.record<Q_COMPOSITE_ACCESS>();
        require(access.version==1&&access.size==sizeof(access)&&!access.reserved&&!(access.unresolved&~7u)
          &&access.parent_delete_child<=1&&access.parent_read_attributes<=1&&access.owner_member<=1&&access.owner_rights_ace<=1
          &&!(access.token_policy&~3u)&&!(access.object_policy&~7u));
        require(access.dac==(primaryToken?objects[f.index].primary_access[token]:objects[f.index].effective_access[token]));
        require(access.parent_delete_child==((access.parent_current&FILE_DELETE_CHILD)?1u:0u)
          &&access.parent_read_attributes==((access.parent_current&FILE_LIST_DIRECTORY)?1u:0u));
        require(access.current==((access.dac&~access.mic_denied)|(access.parent_delete_child?DELETE:0)|(access.parent_read_attributes?FILE_READ_ATTRIBUTES:0)));
        require(!(access.privilege_current&~access.privilege_potential));
        constexpr DWORD supported=FILE_ALL_ACCESS|ACCESS_SYSTEM_SECURITY;
        require(!((access.dac|access.current|access.parent_current|access.privilege_potential)&~supported));
        composites[f.index].push_back(access);
      }
    }
    require(value.remaining()==0);
  }
  for(uint32_t i=0;i<h.token_count;i++){
    require(primary[i]!=nullptr);if(!tokens[i]->impersonation)for(const auto& object:objects)require(object.primary_access[i]==object.effective_access[i]);
  }
  for(uint32_t i=0;i<h.object_count;i++){
    std::set<uint32_t> visited;uint32_t cursor=i;
    while(true){require(visited.insert(cursor).second);const auto& r=resolutions[cursor];if(r.root)break;require(objects[cursor].volume==objects[r.parent_index].volume);cursor=r.parent_index;}
    const auto& descriptor=security[i];const auto& label=labels[i];
    require(static_cast<bool>(label.present)==descriptor.label_present);
    if(label.present){PSID sid=nullptr;require(ConvertStringSidToSidW(label.integrity,&sid));local_memory release{sid};require(integrity_rid(sid)==descriptor.integrity&&label.mask==descriptor.policy);}
    else require(!label.mask&&!label.integrity[0]&&descriptor.integrity==8192&&descriptor.policy==1);
    require(composites[i].size()==2*h.token_count);
    for(uint32_t t=0;t<h.token_count;t++)for(uint32_t p=0;p<2;p++){
      const auto& c=composites[i][2*t+p];const auto& tok=p?*tokens[t]:*primary[t];
      PSID sid=nullptr;require(ConvertStringSidToSidW(tok.integrity,&sid));local_memory release{sid};
      require(c.token_integrity==integrity_rid(sid)&&c.token_policy==(p?contexts[t].effective_mandatory:contexts[t].primary_mandatory)
        &&c.object_integrity==descriptor.integrity&&c.object_policy==descriptor.policy&&c.owner_rights_ace==static_cast<uint32_t>(descriptor.owner_rights));
      require(c.mic_denied==mic_denials(c.token_integrity,c.object_integrity,c.token_policy,c.object_policy));
      const auto parent=resolutions[i].parent_index;
      if(parent==UINT32_MAX)require(c.parent_current==0);
      else {const auto& pc=composites[parent][2*t+p];require(c.parent_current==(pc.dac&~pc.mic_denied));}
      if(!tokens[t]->impersonation)require(memcmp(&c,&composites[i][2*t],sizeof(c))==0);
    }
  }
  require(in.remaining()==0);return true;
}
}
