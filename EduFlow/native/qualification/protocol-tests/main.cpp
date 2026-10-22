#include "../observer-service/stream.hpp"
#include <cstdio>
int main() {
  using namespace q;int passed=0;
  auto check=[&](bool value){if(!value)throw error{ERROR_INVALID_DATA};passed++;};
  try {
    Q_REQUEST r{};r.magic=Q_MAGIC;r.version=Q_COLLECTOR_VERSION;r.size=sizeof(r);r.verb=1;r.challenge[0]=r.profile[0]=r.epoch[0]=r.fixture[0]=r.boot[0]=1;
    check(valid_request(r));r.size++;check(!valid_request(r));r.size--;r.verb=2;check(!valid_request(r));r.verb=1;r.version++;check(!valid_request(r));
    auto run=[&](bool gap,bool wrongPid,bool loss){
      capture_stream s(1,{{2,3}},{4});Q_EVENT e{};e.magic=Q_MAGIC;e.version=Q_VERSION;e.size=sizeof(e);e.epoch=1;e.operation=1;e.sequence=gap?2:1;
      e.kind=Q_CREATE;e.phase=1;e.pid=wrongPid?3:2;e.tid=5;e.process_created=3;e.object_key=6;e.volume_key=4;
      s.event(e);e.sequence=2;e.phase=2;s.event(e);s.etw_loss(loss?1:0,0,0);
      Q_HEALTH h{};h.magic=Q_MAGIC;h.version=Q_VERSION;h.size=sizeof(h);h.epoch=1;h.sequence=2;h.attachments=1;h.drained=1;return s.finish(h);
    };
    check(run(false,false,false));
    for(int i=0;i<3;i++){bool rejected=false;try{run(i==0,i==1,i==2);}catch(const error&){rejected=true;}check(rejected);}
    bool overflow=false;try{std::vector<uint8_t> b(Q_MAX_MESSAGE);uint8_t byte=0;append(b,&byte,1);}catch(const error&){overflow=true;}check(overflow);
    std::printf("native protocol tests: %d passed, 0 failed; kernel observation NOT_PERFORMED\n",passed);return 0;
  }catch(...){return ERROR_INVALID_DATA;}
}
