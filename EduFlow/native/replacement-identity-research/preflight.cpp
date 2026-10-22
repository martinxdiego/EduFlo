#include "acquisition.hpp"
#include "actor-contract.hpp"
#include <cstdio>
#include <string_view>

// This executable cannot run actors, open a fixture/volume, or start capture.
// Only pure deterministic tests are reachable. Acquisition functions above are
// compiled to check SDK contracts, not exercised on the developer host.
int wmain(int argc,wchar_t** argv) {
  using namespace replacement_research;
  if(argc!=2 || std::wstring_view(argv[1])!=L"--self-test") {
    std::puts("EXPERIMENT_EXECUTION=NOT_PERFORMED; execution entry point unavailable");return 3;
  }
  unsigned checks=0;
  const auto check=[&](bool ok){++checks;need(ok,"deterministic assertion failed");};
  try {
    check(watch_policy.access==1 && watch_policy.share==7 && watch_policy.flags==0x42200000);
    check(identity_policy.access==0x80 && identity_policy.share==7 && identity_policy.flags==0x02200000);
    check(journal_policy.access==GENERIC_READ && journal_policy.share==7 && journal_policy.disposition==OPEN_EXISTING);
    for(const auto kind:{fixture_case::rename,fixture_case::posix_rename,fixture_case::link_alias,fixture_case::concurrent_rename}) {
      const auto request=prepare_actor(kind,reinterpret_cast<HANDLE>(static_cast<uintptr_t>(1)));
      check(request.information_class==(kind==fixture_case::link_alias?11u:kind==fixture_case::posix_rename?65u:10u) && request.flags==(kind==fixture_case::posix_rename?3u:1u) && std::memcmp(request.bytes.data()+offsetof(native_namespace_information,name),L"target",12)==0);
    }
    USN_JOURNAL_DATA_V0 a{};a.UsnJournalID=7;a.FirstUsn=10;a.LowestValidUsn=10;a.NextUsn=20;
    check(continuous(a,a,20));auto b=a;b.UsnJournalID=8;check(!continuous(a,b,20));
    b=a;b.FirstUsn=21;b.NextUsn=30;check(!continuous(a,b,20));
    b=a;b.LowestValidUsn=21;b.NextUsn=30;check(!continuous(a,b,20));
    b=a;b.NextUsn=19;check(!continuous(a,b,20));
    raw_capture raw;const std::array<uint8_t,4> bytes{1,2,3,4};raw.append(raw_kind::notify_completion,0,bytes.data(),bytes.size());
    check(raw.frames.size()==1 && raw.frames[0].sequence==1 && raw.total==4 && raw.frames[0].bytes[3]==4);
    bool rejected=false;try{raw.append(raw_kind::notify_completion,0,nullptr,raw_capture::max_bytes);}catch(...){rejected=true;}
    check(rejected && raw.lost && raw.frames.size()==1);
    raw_capture bounded;for(size_t i=0;i<raw_capture::max_frames;++i)bounded.append(raw_kind::journal_query,0,nullptr,0);
    rejected=false;try{bounded.append(raw_kind::journal_query,0,nullptr,0);}catch(...){rejected=true;}
    check(rejected && bounded.lost && bounded.frames.size()==raw_capture::max_frames);
    static_assert(offsetof(FILE_NOTIFY_EXTENDED_INFORMATION,FileName)==84);
    static_assert(offsetof(USN_RECORD_V2,FileName)==60);
    static_assert(offsetof(USN_RECORD_V3,FileName)==76);
    std::printf("replacement preflight native: pass=%u fail=0 skip=0; capture_calls=0 actor_calls=0\n",checks);return 0;
  } catch(const std::exception& e){std::fprintf(stderr,"FAIL: %s after %u checks\n",e.what(),checks);return 1;}
}
