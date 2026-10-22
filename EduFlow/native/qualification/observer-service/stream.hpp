#pragma once
#include "../common/windows.hpp"
#include <map>
#include <set>

namespace q {
class capture_stream {
  uint64_t epoch_, sequence_=0, bytes_=0;
  bool invalid_=false, drained_=false, etw_checked_=false;
  std::map<uint64_t,Q_EVENT> pending_;
  std::set<uint64_t> used_;
  std::map<uint64_t,uint64_t> processes_;
  std::set<uint64_t> volumes_;
  void check(bool condition) { if(!condition){invalid_=true;throw error{ERROR_INVALID_DATA};} }
public:
  capture_stream(uint64_t epoch,std::map<uint64_t,uint64_t> processes,std::set<uint64_t> volumes)
    : epoch_(epoch),processes_(std::move(processes)),volumes_(std::move(volumes)) {
    require(epoch_!=0&&!processes_.empty()&&processes_.size()<=Q_MAX_TOKENS&&!volumes_.empty()&&volumes_.size()<=Q_MAX_OBJECTS);
    for(const auto& process:processes_)require(process.first&&process.second);
    require(!volumes_.count(0));
  }
  void record(const void* bytes,size_t length) {
    check(bytes&&length==sizeof(Q_EVENT));Q_EVENT value{};memcpy(&value,bytes,length);event(value);
  }
  void event(const Q_EVENT& e) {
    check(!invalid_&&!drained_&&e.magic==Q_MAGIC&&e.version==Q_VERSION&&e.size==sizeof(e)&&e.epoch==epoch_);
    etw_checked_=false; // A prior zero-loss sample cannot cover later records.
    check(sequence_!=UINT64_MAX&&e.sequence==sequence_+1 && e.operation && e.kind>=Q_CREATE && e.kind<=Q_CLOSE && e.flags==0);
    check(e.name_bytes<sizeof(e.name)&&e.name_bytes%2==0&&e.destination_bytes<sizeof(e.destination)&&e.destination_bytes%2==0);
    check(e.name[e.name_bytes/2]==0&&e.destination[e.destination_bytes/2]==0&&fixed_string(e.name,Q_MAX_NAME)&&fixed_string(e.destination,Q_MAX_NAME));
    check(wcslen(e.name)*sizeof(wchar_t)==e.name_bytes&&wcslen(e.destination)*sizeof(wchar_t)==e.destination_bytes);
    check(processes_.count(e.pid)&&processes_.at(e.pid)==e.process_created&&e.tid&&e.object_key&&volumes_.count(e.volume_key));
    bytes_+=sizeof(e);check(bytes_<=4294967296ull&&used_.size()<1000000);sequence_=e.sequence;
    if(e.phase==1){check(!e.status&&!e.information&&pending_.size()<Q_QUEUE_CAPACITY&&!used_.count(e.operation));used_.insert(e.operation);pending_.emplace(e.operation,e);}
    else {
      check(e.phase==2&&pending_.count(e.operation));const auto& pre=pending_.at(e.operation);
      check(pre.kind==e.kind&&pre.pid==e.pid&&pre.tid==e.tid&&pre.process_created==e.process_created&&pre.object_key==e.object_key&&pre.volume_key==e.volume_key);
      check(pre.major==e.major&&pre.minor==e.minor&&pre.information_class==e.information_class&&pre.control_code==e.control_code
        &&pre.security_information==e.security_information&&pre.requested_access==e.requested_access&&pre.requested_bytes==e.requested_bytes
        &&pre.name_bytes==e.name_bytes&&pre.destination_bytes==e.destination_bytes
        &&memcmp(pre.name,e.name,sizeof(e.name))==0&&memcmp(pre.destination,e.destination,sizeof(e.destination))==0);
      pending_.erase(e.operation);
    }
  }
  void etw_loss(uint64_t events,uint64_t buffers,uint64_t realtime) { check(!invalid_&&!drained_&&events==0&&buffers==0&&realtime==0);etw_checked_=true; }
  void disconnect() noexcept { invalid_=true; }
  bool finish(const Q_HEALTH& h) {
    check(!invalid_&&!drained_&&h.magic==Q_MAGIC&&h.version==Q_VERSION&&h.size==sizeof(h)&&h.epoch==epoch_);
    check(!h.blocked&&!h.drops&&!h.allocation_failures&&!h.overflows&&!h.detachments&&!h.disconnects&&!h.unloads);
    check(etw_checked_&&h.attachments>0&&h.sequence==sequence_&&h.pending==0&&h.queued==0&&h.drained==1&&h.active==0&&pending_.empty());
    drained_=true;return true;
  }
};
}
