#include "../observer-service/observation-chain.hpp"
#include "../observer-service/etw-reader.hpp"
#include "../observer-service/service-contract.hpp"
#include <cstdio>
#include <functional>
#include <barrier>
using namespace q;
namespace {
QB_EVENT event(uint32_t kind,uint64_t sequence){QB_EVENT e{};e.magic=QB_MAGIC;e.version=QB_VERSION;e.size=sizeof(e);e.kind=kind;e.epoch=11;e.sequence=sequence;e.time=100+sequence;return e;}
std::vector<QB_EVENT> fixture(uint32_t operation=QB_CREATE){
  std::vector<QB_EVENT> events;events.push_back(event(QB_BEGIN,1));
  auto volume=event(QB_VOLUME_ATTACH,2);volume.volume=7;volume.serial=8;volume.name[0]='V';volume.name_bytes=2;events.push_back(volume);
  auto pre=event(QB_PRE,3);pre.operation_kind=QB_CREATE;pre.operation=1;pre.pid=2;pre.tid=3;pre.process_created=50;pre.token_id=4;pre.token_modified=5;
  pre.volume=7;pre.serial=8;pre.open_id=9;pre.name[0]='F';pre.name_bytes=2;events.push_back(pre);
  auto bind=pre;bind.kind=QB_OPEN_BIND;bind.sequence=4;bind.time=104;bind.stream_id=10;bind.file_id[0]=1;events.push_back(bind);
  auto post=bind;post.kind=QB_POST;post.sequence=5;post.time=105;post.information=2;events.push_back(post);
  if(operation!=QB_CREATE){pre=post;pre.kind=QB_PRE;pre.operation_kind=operation;pre.operation=2;pre.sequence=6;pre.time=106;pre.information=0;
    if(operation==QB_RENAME||operation==QB_LINK){pre.destination[0]='D';pre.destination_bytes=2;}
    if(operation==QB_RENAME)pre.information_class=10;if(operation==QB_LINK)pre.information_class=11;
    if(operation==QB_TRUNCATE)pre.information_class=20;if(operation==QB_DISPOSITION)pre.information_class=13;
    if(operation==QB_SECURITY)pre.security_information=4;
    if(operation==QB_REPARSE_SET||operation==QB_REPARSE_REMOVE){pre.control_code=operation==QB_REPARSE_SET?0x900a4:0x900ac;pre.reparse_tag=0xa0000003;
      if(operation==QB_REPARSE_SET){pre.destination[0]='R';pre.destination_bytes=2;}}
    if(operation==QB_WRITE)pre.requested_bytes=12;events.push_back(pre);
    post=pre;post.kind=QB_POST;post.sequence=7;post.time=107;if(operation==QB_WRITE)post.information=6;events.push_back(post);
    if(operation==QB_CLOSE){auto release=post;release.kind=QB_OPEN_RELEASE;release.sequence=8;release.time=108;events.push_back(release);}
  }
  events.push_back(event(QB_END,events.size()+1));return events;
}
void etw(observation_chain& chain){process_evidence p{};p.pid=2;p.created=50;p.start=90;p.primary_token=4;p.primary_modified=5;p.image[0]=p.primary_profile[0]=1;chain.process_start(p);chain.thread_start({2,50,3,91,0});}
QB_HEALTH health(const std::vector<QB_EVENT>& events){QB_HEALTH h{};h.magic=QB_MAGIC;h.version=QB_VERSION;h.size=sizeof(h);h.epoch=11;h.state=QB_SEALED;h.volumes=1;h.start_time=101;h.end_time=events.back().time;h.sequence=events.size();return h;}
}
#include "b2-cases.hpp"
int main(){size_t checks=0;try{
  auto reject=[&](const std::function<void()>& f){bool failed=false;try{f();}catch(const error&){failed=true;}require(failed);checks++;};
  for(uint32_t kind=QB_CREATE;kind<QB_DIRECTORY;kind++){
    observation_chain chain(11);etw(chain);auto events=fixture(kind);
    if(kind==QB_RENAME||kind==QB_LINK){reject([&]{for(const auto& e:events)chain.record(&e,sizeof(e));});require(chain.blocked());reject([&]{chain.finish(health(events));});continue;}
    for(const auto& e:events)chain.record(&e,sizeof(e));chain.etw_finish(0,0,0,true);
    auto receipt=chain.finish(health(events));require(receipt.complete==1&&receipt.operations==(kind==QB_CREATE?1u:2u)&&!receipt.paid_authority&&!receipt.platform_qualified);checks++;
    reject([&]{chain.finish(health(events));});
  }
  const auto base=fixture(QB_WRITE);
  for(size_t length=0;length<sizeof(QB_EVENT);length++){observation_chain chain(11);reject([&]{chain.record(&base[0],length);});require(chain.blocked());}
  const std::vector<std::function<void(QB_EVENT&)>> mutations={
    [](auto& e){e.magic=0;},[](auto& e){e.version++;},[](auto& e){e.size--;},[](auto& e){e.epoch++;},[](auto& e){e.sequence++;},
    [](auto& e){e.flags=1;},[](auto& e){e.reserved[0]=1;},[](auto& e){e.volume++;},[](auto& e){e.open_id++;},
    [](auto& e){e.serial++;},[](auto& e){e.token_id++;},[](auto& e){e.token_modified++;},[](auto& e){e.pid++;},
    [](auto& e){e.process_created++;},[](auto& e){e.tid++;},[](auto& e){e.operation++;},[](auto& e){e.time=1;},
    [](auto& e){e.file_id[0]++;},[](auto& e){e.name_bytes=QB_NAME*2;},[](auto& e){e.destination_bytes=2;},
  };
  for(const auto& mutate:mutations){observation_chain chain(11);etw(chain);auto events=base;mutate(events[5]);reject([&]{for(const auto& e:events)chain.event(e);chain.etw_finish(0,0,0,true);chain.finish(health(events));});require(chain.blocked());}
  for(unsigned reason=0;reason<13;reason++){observation_chain chain(11);etw(chain);for(const auto& e:base)chain.event(e);chain.etw_finish(0,0,0,true);auto h=health(base);
    switch(reason){case 0:h.blocked=1;break;case 1:h.allocations=1;break;case 2:h.drops=1;break;case 3:h.overflows=1;break;case 4:h.unsupported=1;break;
      case 5:h.disconnects=1;break;case 6:h.unloads=1;break;case 7:h.late_io=1;break;case 8:h.correlation=1;break;case 9:h.pending=1;break;
      case 10:h.queued=1;break;case 11:h.volumes=2;break;case 12:h.state=QB_DRAINING;break;}
    reject([&]{chain.finish(h);});require(chain.blocked());
  }
  for(unsigned loss=0;loss<4;loss++){observation_chain chain(11);etw(chain);reject([&]{chain.etw_finish(loss==0,loss==1,loss==2,loss!=3);});}
  {observation_chain chain(11);etw(chain);auto events=base;events[6].status=static_cast<int32_t>(0xc0000001);for(const auto& e:events)chain.event(e);chain.etw_finish(0,0,0,true);require(chain.finish(health(events)).mutations==2);checks++;}
  {observation_chain chain(11);etw(chain);auto events=fixture();events[4].information=1;for(const auto& e:events)chain.event(e);chain.etw_finish(0,0,0,true);require(chain.finish(health(events)).mutations==0);checks++;}
  {observation_chain chain(11);etw(chain);reject([&]{chain.thread_start({2,51,4,92,0});});}
  {observation_chain chain(11);etw(chain);reject([&]{chain.thread_start({2,50,3,92,0});});}
  {observation_chain chain(11);etw(chain);reject([&]{chain.process_end(2,50,95);});}
  {observation_chain chain(11);etw(chain);chain.thread_end(2,50,3,108);chain.process_end(2,50,109);for(const auto& e:base)chain.event(e);chain.etw_finish(0,0,0,true);require(chain.finish(health(base)).complete);checks++;}
  for(unsigned reason=QB_ALLOCATION;reason<=QB_CORRELATION;reason++){QB_HEALTH h{};require(QBStart(&h,11,1));QBFail(&h,reason);require(h.blocked&&!QBStart(&h,12,2));checks++;}
  {QB_HEALTH h{};require(QBStart(&h,11,1)&&QBEnter(&h));require(QBDrain(&h)&&!QBEnter(&h)&&h.late_io==1);QBLeave(&h);require(!QBSeal(&h,2));checks++;}
  {QB_HEALTH h{};require(QBStart(&h,11,1));h.volumes=1;require(QBDrain(&h)&&QBSeal(&h,2)&&!QBStart(&h,12,3));checks++;}
  {QB_HEALTH h{};h.sequence=UINT64_MAX;uint64_t sequence=0;require(!QBSequence(&h,&sequence)&&h.blocked&&h.sequence==UINT64_MAX);checks++;}
  for(unsigned attack=0;attack<8;attack++){
    auto events=fixture(QB_CLOSE);observation_chain chain(11);etw(chain);
    switch(attack){case 0:events[0].token_id=1;break;case 1:events[1].file_id[0]=1;break;case 2:events[3].desired_access=1;break;
      case 3:events[7].operation++;break;case 4:events[7].status=1;break;case 5:events[6].kind=QB_OPEN_RELEASE;break;
      case 6:events[8].pid=1;break;case 7:events[5].operation_kind=QB_DIRECTORY;break;}
    reject([&]{for(const auto& e:events)chain.event(e);});require(chain.blocked());
  }
  {observation_chain chain(11);etw(chain);auto events=base;events[6].information=13;reject([&]{for(const auto& e:events)chain.event(e);});}
  {observation_chain chain(11);etw(chain);auto events=fixture(QB_CLOSE);for(const auto& e:events)chain.event(e);chain.etw_finish(0,0,0,true);require(chain.finish(health(events)).retained_opens==0);checks++;}
  {observation_chain chain(11);etw(chain);for(const auto& e:base)chain.event(e);chain.etw_finish(0,0,0,true);require(chain.finish(health(base)).retained_opens==1);checks++;}
  // Fixed binding/one-shot receipt state is tested without opening a pipe,
  // reading protected bootstrap, starting ETW, or launching a native service.
  Q_CONFIG fixed{};fixed.profile[0]=1;fixed.epoch[0]=2;fixed.fixture[0]=3;fixed.boot[0]=4;
  observation_command start{};start.verb=observation_start;start.sequence=1;start.request.magic=Q_MAGIC;start.request.version=Q_COLLECTOR_VERSION;
  start.request.size=sizeof(Q_REQUEST);start.request.verb=1;start.request.challenge[0]=5;
  memcpy(start.request.profile,fixed.profile,32);memcpy(start.request.epoch,fixed.epoch,32);memcpy(start.request.fixture,fixed.fixture,32);memcpy(start.request.boot,fixed.boot,32);
  for(size_t length=0;length<sizeof(start);length++){observation_session session;reject([&]{session.accept(&start,length,fixed);});require(session.blocked());reject([&]{session.accept(&start,sizeof(start),fixed);});}
  for(unsigned attack=0;attack<15;attack++){observation_session session;auto c=start;
    switch(attack){case 0:c.magic++;break;case 1:c.version++;break;case 2:c.size--;break;case 3:c.sequence++;break;case 4:c.verb=observation_poll;break;
      case 5:c.request.magic++;break;case 6:c.request.version++;break;case 7:c.request.size--;break;case 8:c.request.verb++;break;
      case 9:c.request.challenge[0]=0;break;case 10:c.request.profile[0]++;break;case 11:c.request.fixture[0]++;break;case 12:c.request.epoch[0]++;break;
      case 13:c.request.boot[0]++;break;case 14:c.sequence=UINT64_MAX;break;}
    reject([&]{session.accept(&c,sizeof(c),fixed);});require(session.blocked());reject([&]{session.accept(&start,sizeof(start),fixed);});}
  for(unsigned attack=0;attack<6;attack++){observation_session session;session.accept(&start,sizeof(start),fixed);require(session.consumed());auto c=start;c.verb=observation_poll;c.sequence=2;
    switch(attack){case 0:c.verb=observation_start;break;case 1:c.sequence=1;break;case 2:c.request.challenge[0]++;break;case 3:c.request.fixture[0]++;break;
      case 4:session.fail();break;case 5:c.verb=observation_stop;session.accept(&c,sizeof(c),fixed);c.sequence=3;break;}
    reject([&]{session.accept(&c,sizeof(c),fixed);});require(session.blocked());}
  {observation_session session;session.accept(&start,sizeof(start),fixed);auto c=start;c.verb=observation_poll;c.sequence=2;session.accept(&c,sizeof(c),fixed);
    c.verb=observation_stop;c.sequence=3;session.accept(&c,sizeof(c),fixed);require(session.consumed()&&!session.blocked());checks++;}
  // Real mutex contention over the SAME production transition functions. Only
  // one start may win. Losers burn the health; no retry/reset makes it clean.
  for(unsigned round=0;round<32;round++){QB_HEALTH h{};std::mutex mutex;std::barrier gate(4);std::atomic<unsigned> winners=0;std::vector<std::thread> workers;
    for(unsigned i=0;i<4;i++)workers.emplace_back([&]{gate.arrive_and_wait();std::lock_guard lock(mutex);if(QBStart(&h,11,1))winners++;});
    for(auto& worker:workers)worker.join();require(winners==1&&h.blocked&&!QBStart(&h,12,2));checks++;}
  checks+=b2_cases();std::printf("observation deterministic checks: %zu passed, 0 failed; kernel execution NOT_PERFORMED\n",checks);return 0;
}catch(const error& e){std::fprintf(stderr,"observation test failed after %zu: %lu %s:%u\n",checks,e.code,e.file?e.file:"",e.line);return 1;}catch(...){return 2;}}
