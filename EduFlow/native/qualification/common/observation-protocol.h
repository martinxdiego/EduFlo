#pragma once
#include <stdint.h>
// B observation is a separate dialect. Collector v4 and legacy event v3 do not
// become interchangeable with this stream. No pointers or subject buffers.
#define QB_MAGIC 0x42464445u
#define QB_VERSION 2u
#define QB_BOUND 4096u
#define QB_NAME 1024u
enum QB_KIND { QB_BEGIN=1,QB_VOLUME_ATTACH,QB_VOLUME_DETACH,QB_OPEN_BIND,QB_OPEN_RELEASE,QB_PRE,QB_POST,QB_END,QB_FAULT };
enum QB_OP { QB_CREATE=1,QB_WRITE,QB_TRUNCATE,QB_RENAME,QB_LINK,QB_DISPOSITION,QB_SECURITY,QB_REPARSE_SET,QB_REPARSE_REMOVE,QB_CLEANUP,QB_CLOSE,QB_DIRECTORY };
enum QB_STATE { QB_COLD=0,QB_CAPTURING,QB_DRAINING,QB_SEALED,QB_ENDED };
enum QB_REASON { QB_ALLOCATION=1,QB_DROP,QB_OVERFLOW,QB_UNSUPPORTED,QB_DISCONNECT,QB_UNLOAD,QB_LATE_IO,QB_CORRELATION };
enum QB_VERB { QB_POLL=1,QB_HEALTH_QUERY,QB_DRAIN_REQUEST,QB_SEAL_REQUEST,QB_END_SESSION };
typedef struct QB_CONNECT {
  uint32_t magic,version,size,reserved;
  uint64_t epoch,pid,created;
  uint8_t challenge[32],profile[32],fixture[32],boot[32];
} QB_CONNECT;
typedef struct QB_COMMAND {uint32_t magic,version,size,verb;uint64_t epoch;uint8_t challenge[32];} QB_COMMAND;
// Read-only machine provisioning input, never supplied by a port caller.
// Kernel path is the native image path, not a Win32 alias. The user-mode peer
// additionally checks the sealed binary digest and loaded module closure.
typedef struct QB_PEER {
  uint32_t magic,version,size,sid_bytes;
  uint64_t pid,created;
  uint8_t sid[68],profile[32],fixture[32],boot[32];
  uint16_t image[QB_NAME];
} QB_PEER;
typedef struct QB_EVENT {
  uint32_t magic,version,size,kind,operation_kind,flags,reserved[2];
  uint64_t epoch,sequence,operation,time,pid,tid,process_created;
  uint64_t volume,open_id,stream_id,serial,token_id,token_modified;
  uint8_t file_id[16];
  int32_t status;uint32_t information_class,control_code,security_information;
  uint32_t create_options,create_attributes,desired_access,share_access;
  uint64_t requested_bytes,offset,information;
  uint32_t disposition_flags,reparse_tag,name_bytes,destination_bytes;
  uint16_t name[QB_NAME],destination[QB_NAME];
} QB_EVENT;
typedef struct QB_HEALTH {
  uint32_t magic,version,size,state;
  uint64_t epoch,sequence,start_time,end_time,pending,queued,volumes;
  uint64_t allocations,drops,overflows,unsupported,disconnects,unloads,late_io,correlation;
  uint32_t blocked,reserved;
} QB_HEALTH;
// Shared state transitions run under the kernel/service caller's lock. They
// never decide an I/O result. Failure is sticky; no reset/repair operation.
static inline void QBFail(QB_HEALTH* h,uint32_t reason) {
  uint64_t* counter=0;h->blocked=1;
  switch(reason){case QB_ALLOCATION:counter=&h->allocations;break;case QB_DROP:counter=&h->drops;break;
    case QB_OVERFLOW:counter=&h->overflows;break;case QB_UNSUPPORTED:counter=&h->unsupported;break;
    case QB_DISCONNECT:counter=&h->disconnects;break;case QB_UNLOAD:counter=&h->unloads;break;
    case QB_LATE_IO:counter=&h->late_io;break;default:counter=&h->correlation;break;}
  if(*counter!=UINT64_MAX)(*counter)++;
}
static inline int QBStart(QB_HEALTH* h,uint64_t epoch,uint64_t now) {
  if(h->state!=QB_COLD||h->epoch||h->blocked||!epoch||!now){QBFail(h,QB_CORRELATION);return 0;}
  h->magic=QB_MAGIC;h->version=QB_VERSION;h->size=sizeof(*h);h->epoch=epoch;h->start_time=now;h->state=QB_CAPTURING;return 1;
}
static inline int QBEnter(QB_HEALTH* h) {
  if(h->state!=QB_CAPTURING){if(h->state==QB_DRAINING)QBFail(h,QB_LATE_IO);return 0;}
  if(h->pending>=QB_BOUND){QBFail(h,QB_OVERFLOW);return 0;}h->pending++;return 1;
}
static inline void QBLeave(QB_HEALTH* h) {if(!h->pending)QBFail(h,QB_CORRELATION);else h->pending--;}
static inline int QBSequence(QB_HEALTH* h,uint64_t* sequence) {
  if(h->sequence==UINT64_MAX||h->queued>=QB_BOUND){QBFail(h,QB_OVERFLOW);return 0;}
  *sequence=++h->sequence;h->queued++;return 1;
}
static inline int QBDrain(QB_HEALTH* h) {
  if(h->state!=QB_CAPTURING){QBFail(h,QB_CORRELATION);return 0;}h->state=QB_DRAINING;return 1;
}
static inline int QBSeal(QB_HEALTH* h,uint64_t now) {
  if(h->state!=QB_DRAINING||h->pending||h->queued||!h->volumes||now<h->start_time||h->blocked){QBFail(h,QB_CORRELATION);return 0;}
  h->end_time=now;h->state=QB_SEALED;return 1;
}
static inline int QBEndSession(QB_HEALTH* h){
  if(h->state!=QB_SEALED||h->pending||h->queued||h->blocked||!h->end_time){QBFail(h,QB_CORRELATION);return 0;}
  h->state=QB_ENDED;return 1;
}
static inline void QBDisconnected(QB_HEALTH* h){if(h->state!=QB_ENDED)QBFail(h,QB_DISCONNECT);}
