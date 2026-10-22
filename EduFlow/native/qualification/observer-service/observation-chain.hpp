#pragma once
#include "../common/windows.hpp"
#include "../common/observation-protocol.h"
#include "../common/observation-decode.h"
#include <map>
#include <set>
#include <mutex>

namespace q {
struct process_evidence {
  uint64_t pid=0,created=0,start=0,end=0,session=0;
  std::array<uint8_t,32> image{},primary_profile{};
  uint64_t primary_token=0,primary_modified=0;
};
struct thread_evidence {uint64_t pid=0,created=0,tid=0,start=0,end=0;};
struct observation_receipt {
  uint32_t version=QB_VERSION,size=sizeof(observation_receipt),complete=0,qualification_only=1;
  uint64_t epoch=0,start=0,end=0,events=0,operations=0,mutations=0,etw_events=0,retained_opens=0;
  uint8_t stream_digest[32]{},process_digest[32]{};
  uint64_t target_processes=0,target_threads=0;uint8_t target_rundown_digest[32]{};
  uint32_t paid_authority=0,provider_calls=0,platform_qualified=0,reserved=0;
};
// In-memory reducer is NOT authentication. Only the protected native service
// can bind its output to a peer/request. Synthetic callers get no capability.
class observation_chain {
  bool failed_=false,sealed_=false,etw_final_=false,begun_=false,ended_=false;
  uint64_t epoch_,sequence_=0,etw_count_=0,operations_=0,mutations_=0,last_time_=0;
  std::map<uint64_t,QB_EVENT> pending_,opens_,volumes_,closing_;
  std::set<uint64_t> used_operations_,used_opens_;
  std::vector<QB_EVENT> events_;
  std::vector<process_evidence> processes_;
  std::vector<thread_evidence> threads_;
  void check(bool ok){if(!ok){failed_=true;throw error{ERROR_INVALID_DATA};}}
  static bool nonzero(const void* bytes,size_t length){const auto p=static_cast<const uint8_t*>(bytes);return std::any_of(p,p+length,[](auto b){return b!=0;});}
  static bool name_valid(const uint16_t* text,uint32_t bytes){
    if(bytes>=QB_NAME*2||bytes%2||text[bytes/2])return false;
    for(size_t i=0;i<bytes/2;i++){if(!text[i])return false;if(text[i]>=0xd800&&text[i]<=0xdbff){if(++i>=bytes/2||text[i]<0xdc00||text[i]>0xdfff)return false;}else if(text[i]>=0xdc00&&text[i]<=0xdfff)return false;}
    for(size_t i=bytes/2;i<QB_NAME;i++)if(text[i])return false;return true;
  }
  static bool same_open(const QB_EVENT& a,const QB_EVENT& b){return a.volume==b.volume&&a.serial==b.serial&&a.stream_id==b.stream_id&&memcmp(a.file_id,b.file_id,16)==0;}
  static bool operation_shape(const QB_EVENT& e){
    auto c=e;c.information_class=c.control_code=c.security_information=0;c.create_options=c.create_attributes=c.desired_access=c.share_access=0;
    c.requested_bytes=c.offset=0;c.disposition_flags=c.reparse_tag=0;
    switch(e.operation_kind){
      case QB_CREATE:c.create_options=e.create_options;c.create_attributes=e.create_attributes;c.desired_access=e.desired_access;c.share_access=e.share_access;
        if((e.create_options>>24)>5||(e.share_access&~7u))return false;break;
      case QB_WRITE:c.requested_bytes=e.requested_bytes;c.offset=e.offset;break;
      case QB_TRUNCATE:if(e.information_class!=19&&e.information_class!=20)return false;c.information_class=e.information_class;c.requested_bytes=e.requested_bytes;
        if(e.requested_bytes>INT64_MAX)return false;break;
      case QB_RENAME:case QB_LINK:if(!(e.operation_kind==QB_RENAME?QBRenameClass(e.information_class):QBLinkClass(e.information_class))||!QBNameFlags(e.information_class,e.disposition_flags))return false;
        c.information_class=e.information_class;c.disposition_flags=e.disposition_flags;break;
      case QB_DISPOSITION:if(!QBDispositionFlags(e.information_class,e.disposition_flags))return false;c.information_class=e.information_class;c.disposition_flags=e.disposition_flags;break;
      case QB_SECURITY:if(!e.security_information)return false;c.security_information=e.security_information;break;
      case QB_REPARSE_SET:case QB_REPARSE_REMOVE:if(e.control_code!=(e.operation_kind==QB_REPARSE_SET?0x900a4u:0x900acu)
          ||(e.reparse_tag!=0xa0000003u&&e.reparse_tag!=0xa000000cu)||e.disposition_flags>1
          ||(e.disposition_flags&&(e.reparse_tag!=0xa000000cu||e.operation_kind==QB_REPARSE_REMOVE)))return false;
        c.control_code=e.control_code;c.reparse_tag=e.reparse_tag;c.disposition_flags=e.disposition_flags;break;
      case QB_CLEANUP:case QB_CLOSE:break;
      default:return false; // No untyped directory/unknown operation exemption.
    }
    return memcmp(&c,&e,sizeof(e))==0;
  }
  const process_evidence* process(const QB_EVENT& e) {
    const process_evidence* found=nullptr;
    for(const auto& p:processes_)if(p.pid==e.pid&&p.created==e.process_created&&p.start<=e.time&&(!p.end||e.time<=p.end)){check(!found);found=&p;}
    return found;
  }
public:
  explicit observation_chain(uint64_t epoch):epoch_(epoch){require(epoch!=0);}
  void fail() noexcept{failed_=true;}
  bool blocked()const noexcept{return failed_;}
  void process_start(const process_evidence& p){
    check(!failed_&&!sealed_&&!etw_final_&&processes_.size()<4096&&p.pid&&p.created&&p.start&&p.start>=p.created&&!p.end&&p.primary_token
      &&nonzero(p.image.data(),32)&&nonzero(p.primary_profile.data(),32));
    for(const auto& prior:processes_)if(prior.pid==p.pid)check(prior.created!=p.created&&prior.end&&prior.end<p.start);
    processes_.push_back(p);etw_count_++;
  }
  void process_end(uint64_t pid,uint64_t created,uint64_t time){
    check(!failed_&&!sealed_&&!etw_final_);process_evidence* found=nullptr;
    for(auto& p:processes_)if(p.pid==pid&&p.created==created&&!p.end){check(!found&&time>=p.start);found=&p;}
    check(found!=nullptr);for(const auto& t:threads_)if(t.pid==pid&&t.created==created)check(t.end&&t.end<=time);
    found->end=time;etw_count_++;
  }
  void thread_start(const thread_evidence& t){
    check(!failed_&&!sealed_&&!etw_final_&&threads_.size()<65536&&t.pid&&t.created&&t.tid&&t.start&&!t.end);
    bool owner=false;for(const auto& p:processes_)if(p.pid==t.pid&&p.created==t.created&&p.start<=t.start&&!p.end)owner=true;check(owner);
    for(const auto& old:threads_)if(old.tid==t.tid)check(old.end&&old.end<t.start);
    threads_.push_back(t);etw_count_++;
  }
  void thread_end(uint64_t pid,uint64_t created,uint64_t tid,uint64_t time){
    check(!failed_&&!sealed_&&!etw_final_);thread_evidence* found=nullptr;
    for(auto& t:threads_)if(t.pid==pid&&t.created==created&&t.tid==tid&&!t.end){check(!found&&time>=t.start);found=&t;}
    check(found!=nullptr);found->end=time;etw_count_++;
  }
  void record(const void* data,size_t size){
    check(data&&size==sizeof(QB_EVENT));QB_EVENT e{};memcpy(&e,data,sizeof(e));event(e);
  }
  void event(const QB_EVENT& e){
    check(!failed_&&!sealed_&&!ended_&&e.magic==QB_MAGIC&&e.version==QB_VERSION&&e.size==sizeof(e)&&e.epoch==epoch_
      &&sequence_!=UINT64_MAX&&e.sequence==sequence_+1&&!e.flags&&!e.reserved[0]&&!e.reserved[1]&&e.time&&e.time>=last_time_
      &&name_valid(e.name,e.name_bytes)&&name_valid(e.destination,e.destination_bytes)&&events_.size()<65536);
    check(e.kind>=QB_BEGIN&&e.kind<=QB_FAULT);sequence_=e.sequence;last_time_=e.time;
    if(!begun_){check(e.kind==QB_BEGIN&&sequence_==1);begun_=true;}
    else check(e.kind!=QB_BEGIN);
    if(e.kind==QB_FAULT||e.kind==QB_VOLUME_DETACH){failed_=true;throw error{ERROR_INVALID_DATA};}
    if(e.kind==QB_BEGIN||e.kind==QB_END||e.kind==QB_VOLUME_ATTACH){
      auto canonical=QB_EVENT{};canonical.magic=e.magic;canonical.version=e.version;canonical.size=e.size;
      canonical.kind=e.kind;canonical.epoch=e.epoch;canonical.sequence=e.sequence;canonical.time=e.time;
      if(e.kind==QB_VOLUME_ATTACH){canonical.volume=e.volume;canonical.serial=e.serial;canonical.name_bytes=e.name_bytes;memcpy(canonical.name,e.name,sizeof(e.name));}
      check(memcmp(&canonical,&e,sizeof(e))==0);
    }
    if(e.kind==QB_VOLUME_ATTACH){check(e.volume&&e.serial&&e.name_bytes&&volumes_.size()<256&&!volumes_.count(e.volume));volumes_.emplace(e.volume,e);}
    if(e.kind==QB_OPEN_BIND){
      check(e.open_id&&e.stream_id&&nonzero(e.file_id,16)&&volumes_.count(e.volume)&&volumes_.at(e.volume).serial==e.serial
        &&opens_.size()<QB_BOUND&&!used_opens_.count(e.open_id));
      check(e.operation&&pending_.count(e.operation)&&pending_.at(e.operation).operation_kind==QB_CREATE);
      const auto& pre=pending_.at(e.operation);check(pre.open_id==e.open_id&&pre.volume==e.volume&&pre.pid==e.pid&&pre.process_created==e.process_created);
      auto normalized=e;normalized.kind=pre.kind;normalized.sequence=pre.sequence;normalized.time=pre.time;normalized.stream_id=pre.stream_id;
      memcpy(normalized.file_id,pre.file_id,16);check(memcmp(&normalized,&pre,sizeof(pre))==0);
      used_opens_.insert(e.open_id);opens_.emplace(e.open_id,e);
    }
    if(e.kind==QB_OPEN_RELEASE){
      check(opens_.count(e.open_id)&&same_open(opens_.at(e.open_id),e)&&closing_.count(e.open_id));
      const auto& post=closing_.at(e.open_id);auto normalized=e;normalized.kind=post.kind;normalized.sequence=post.sequence;normalized.time=post.time;
      check(!e.status&&!e.information);normalized.status=post.status;normalized.information=post.information;
      check(memcmp(&normalized,&post,sizeof(post))==0);opens_.erase(e.open_id);closing_.erase(e.open_id);
    }
    if(e.kind==QB_PRE||e.kind==QB_POST){
      check(e.operation&&e.operation_kind>=QB_CREATE&&e.operation_kind<=QB_DIRECTORY&&e.pid&&e.tid&&e.process_created&&e.token_id
        &&volumes_.count(e.volume)&&volumes_.at(e.volume).serial==e.serial&&e.name_bytes&&operation_shape(e));
      const bool destination=e.operation_kind==QB_RENAME||e.operation_kind==QB_LINK||e.operation_kind==QB_REPARSE_SET;
      check(destination?e.destination_bytes>0:e.destination_bytes==0);
      if(e.operation_kind!=QB_CREATE)check(opens_.count(e.open_id)&&same_open(opens_.at(e.open_id),e));
      if(e.kind==QB_PRE){
        check(!e.status&&!e.information&&pending_.size()<QB_BOUND&&used_operations_.size()<65536&&!used_operations_.count(e.operation));
        check(!closing_.count(e.open_id));
        if(e.operation_kind==QB_CREATE)check(e.open_id&&!used_opens_.count(e.open_id)&&!nonzero(e.file_id,16));
        used_operations_.insert(e.operation);pending_.emplace(e.operation,e);
      }else{
        check(pending_.count(e.operation));const auto& pre=pending_.at(e.operation);
        auto normalized=e;normalized.kind=pre.kind;normalized.sequence=pre.sequence;normalized.time=pre.time;normalized.status=0;normalized.information=0;
        if(e.operation_kind==QB_CREATE){
          if(e.status>=0){check(e.information<=3&&opens_.count(e.open_id)&&same_open(opens_.at(e.open_id),e));}
          else check(!opens_.count(e.open_id)&&!nonzero(e.file_id,16)&&!e.stream_id);
          normalized.stream_id=pre.stream_id;memcpy(normalized.file_id,pre.file_id,16);
        }
        check(memcmp(&normalized,&pre,sizeof(pre))==0);pending_.erase(e.operation);operations_++;
        // PRE destination text plus POST success cannot identify an overwritten
        // object or resolve tunneled names/aliases. No such independent outcome
        // record exists in this dialect yet. Even a correctly authenticated
        // source must not turn that missing identity into a complete receipt.
        if(e.status>=0&&(e.operation_kind==QB_RENAME||e.operation_kind==QB_LINK))check(false);
        if(e.operation_kind==QB_WRITE)check(e.information<=e.requested_bytes);
        if(e.operation_kind==QB_CLOSE){for(const auto& [id,other]:pending_){(void)id;check(other.open_id!=e.open_id);}check(!closing_.count(e.open_id));closing_.emplace(e.open_id,e);}
        // Successful zero-byte creation and partial write evidence are retained.
        if((e.operation_kind==QB_CREATE&&e.status>=0&&(e.information==0||e.information==2||e.information==3))
          ||(e.operation_kind==QB_WRITE&&e.information>0)
          ||(e.status>=0&&e.operation_kind!=QB_CREATE&&e.operation_kind!=QB_CLEANUP&&e.operation_kind!=QB_CLOSE))mutations_++;
      }
    }
    if(e.kind==QB_END){check(pending_.empty()&&closing_.empty());ended_=true;}
    events_.push_back(e);
  }
  void etw_finish(uint64_t eventsLost,uint64_t buffersLost,uint64_t realtimeLost,bool processingEnded){
    check(!failed_&&!sealed_&&!etw_final_&&processingEnded&&!eventsLost&&!buffersLost&&!realtimeLost&&etw_count_>0);etw_final_=true;
  }
  observation_receipt finish(const QB_HEALTH& h){
    check(!failed_&&!sealed_&&begun_&&ended_&&etw_final_&&h.magic==QB_MAGIC&&h.version==QB_VERSION&&h.size==sizeof(h)&&h.state==QB_SEALED
      &&h.epoch==epoch_&&h.sequence==sequence_&&h.start_time==events_.front().time&&h.end_time==events_.back().time&&h.end_time>=h.start_time
      &&!h.pending&&!h.queued&&!h.blocked&&!h.reserved&&h.volumes==volumes_.size()&&!volumes_.empty()
      &&!h.allocations&&!h.drops&&!h.overflows&&!h.unsupported&&!h.disconnects&&!h.unloads&&!h.late_io&&!h.correlation);
    for(const auto& e:events_)if(e.kind==QB_PRE){
      const auto p=process(e);check(p&&p->primary_token==e.token_id&&p->primary_modified==e.token_modified);
      size_t count=0;for(const auto& t:threads_)if(t.pid==e.pid&&t.created==e.process_created&&t.tid==e.tid&&t.start<=e.time&&(!t.end||e.time<=t.end))count++;check(count==1);
    }
    // This supported profile observes primary-token I/O. Impersonation or token
    // changes need distinct proven records; mismatches block, never disappear.
    auto hash=byte_hash(events_.data(),events_.size()*sizeof(QB_EVENT));
    std::vector<uint8_t> identities;for(const auto& p:processes_)append(identities,&p,sizeof(p));for(const auto& t:threads_)append(identities,&t,sizeof(t));
    auto processHash=byte_hash(identities.data(),identities.size());
    observation_receipt result{};result.complete=1;result.epoch=epoch_;result.start=h.start_time;result.end=h.end_time;
    result.events=events_.size();result.operations=operations_;result.mutations=mutations_;result.etw_events=etw_count_;result.retained_opens=opens_.size();
    memcpy(result.stream_digest,hash.data(),32);memcpy(result.process_digest,processHash.data(),32);sealed_=true;return result;
  }
};
}
