#pragma once
#include "observation-chain.hpp"
#include "../common/bootstrap.hpp"

namespace q {
constexpr wchar_t observation_pipe[]=L"\\\\.\\pipe\\EduFlow.Qualification.Observation.v2";
constexpr wchar_t observation_port[]=L"\\EduFlowQualificationAuditB";
enum observation_verb:uint32_t {observation_start=1,observation_poll=2,observation_stop=3};
struct observation_command {
  uint32_t magic=QB_MAGIC,version=QB_VERSION,size=sizeof(observation_command),verb=0;
  uint64_t sequence=0;
  Q_REQUEST request{};
};
struct observation_frame {
  uint32_t magic=QB_MAGIC,version=QB_VERSION,size=sizeof(observation_frame),kind=0;
  uint64_t sequence=0;
  Q_REQUEST request{};
  QB_EVENT event{};
  QB_HEALTH health{};
  observation_receipt receipt{};
  // B receipt is bounded observation evidence, never authorization or an
  // assertion about outside-root absence. C must independently resolve it.
  uint32_t outside_root_proven=0,paid_authority=0,platform_qualified=0,reserved=0;
};
static_assert(sizeof(observation_frame)<Q_MAX_MESSAGE);
class observation_session {
  Q_REQUEST request_{};uint64_t sequence_=0;bool used_=false,ended_=false,failed_=false;
  void check(bool ok){if(!ok){failed_=true;throw error{ERROR_ACCESS_DENIED};}}
public:
  bool consumed()const noexcept{return used_;}
  bool blocked()const noexcept{return failed_;}
  void fail()noexcept{failed_=true;}
  void accept(const void* bytes,size_t length,const Q_CONFIG& fixed){
    check(!failed_&&!ended_&&bytes&&length==sizeof(observation_command));observation_command c{};memcpy(&c,bytes,sizeof(c));
    check(c.magic==QB_MAGIC&&c.version==QB_VERSION&&c.size==sizeof(c)&&sequence_!=UINT64_MAX&&c.sequence==sequence_+1);
    if(!used_){
      // Consume even if binding/verb validation subsequently throws. No retry
      // through an invalid first request; the native process also exits once.
      used_=true;check(c.verb==observation_start);
      try{bound_request(c.request,fixed);}catch(...){failed_=true;throw;}
      request_=c.request;
    }else check((c.verb==observation_poll||c.verb==observation_stop)&&memcmp(&c.request,&request_,sizeof(request_))==0);
    sequence_=c.sequence;if(c.verb==observation_stop)ended_=true;
  }
};
inline uint64_t observation_epoch(const Q_REQUEST& request){
  // Compact kernel epoch is always accompanied by the full request binding in
  // the authenticated service envelope, never used as a hash-equivalent key.
  auto digest=byte_hash(&request,sizeof(request));uint64_t epoch=0;memcpy(&epoch,digest.data(),8);require(epoch!=0);return epoch;
}
inline bool health_shape(const QB_HEALTH& h,uint64_t epoch){
  return h.magic==QB_MAGIC&&h.version==QB_VERSION&&h.size==sizeof(h)&&h.epoch==epoch&&h.state>=QB_CAPTURING&&h.state<=QB_ENDED
    &&!h.reserved&&h.blocked<=1&&h.volumes<=256&&h.pending<=QB_BOUND&&h.queued<=QB_BOUND&&h.start_time>0;
}
inline bool health_clean(const QB_HEALTH& h){return !h.blocked&&!h.allocations&&!h.drops&&!h.overflows&&!h.unsupported
  &&!h.disconnects&&!h.unloads&&!h.late_io&&!h.correlation;}
inline bool end_receipt_matches(const QB_HEALTH& sealed,const QB_HEALTH& ended){
  if(!health_shape(sealed,sealed.epoch)||!health_clean(sealed)||sealed.state!=QB_SEALED||!sealed.end_time||sealed.pending||sealed.queued)return false;
  if(!health_shape(ended,sealed.epoch)||!health_clean(ended)||ended.state!=QB_ENDED)return false;
  auto normalized=ended;normalized.state=QB_SEALED;return memcmp(&sealed,&normalized,sizeof(sealed))==0;
}
}
