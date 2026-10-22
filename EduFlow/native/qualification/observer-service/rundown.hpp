#pragma once
#include "../common/bootstrap.hpp"
#include "../common/observation-protocol.h"
#include <tlhelp32.h>
#include <map>
#include <set>
namespace q {
struct rundown_thread {uint64_t pid,process_created,tid,thread_created;auto operator<=>(const rundown_thread&)const=default;};
using rundown_inventory=std::map<uint64_t,rundown_thread>;
struct rundown_evidence {uint64_t processes=0,threads=0;std::array<uint8_t,32> digest{};};
// Inventory is acquired internally from the fixed process bindings. It is not
// a caller-provided completeness flag. No thread is suspended or held open.
inline rundown_inventory acquire_rundown_inventory(const deployment& fixed){
  std::map<DWORD,uint64_t> processes;std::set<DWORD> populated;
  for(uint32_t i=0;i<fixed.inspection.process_count;i++){const auto& p=fixed.inspection.processes[i];auto process=bound_process(p);
    require(processes.emplace(p.pid,p.created).second);}
  require(!processes.empty());handle snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD,0));require(snapshot.value!=INVALID_HANDLE_VALUE);
  THREADENTRY32 entry{};entry.dwSize=sizeof(entry);require(Thread32First(snapshot,&entry));rundown_inventory inventory;
  do{
    require(entry.dwSize>=offsetof(THREADENTRY32,th32OwnerProcessID)+sizeof(entry.th32OwnerProcessID));
    if(processes.count(entry.th32OwnerProcessID)){
      handle thread(OpenThread(THREAD_QUERY_LIMITED_INFORMATION,FALSE,entry.th32ThreadID));require(thread.value&&GetProcessIdOfThread(thread)==entry.th32OwnerProcessID);
      FILETIME born{},end{},kernel{},user{};require(GetThreadTimes(thread,&born,&end,&kernel,&user)&&!time_value(end));
      rundown_thread row{entry.th32OwnerProcessID,processes.at(entry.th32OwnerProcessID),entry.th32ThreadID,time_value(born)};
      require(row.thread_created>=row.process_created&&inventory.size()<QB_BOUND&&inventory.emplace(row.tid,row).second);populated.insert(entry.th32OwnerProcessID);
    }
    entry.dwSize=sizeof(entry);
  }while(Thread32Next(snapshot,&entry));
  require(GetLastError()==ERROR_NO_MORE_FILES&&populated.size()==processes.size());
  for(uint32_t i=0;i<fixed.inspection.process_count;i++){auto process=bound_process(fixed.inspection.processes[i]);}
  return inventory;
}
// Establishes coverage of the FIXED target census, not all Windows processes
// or retained kernel objects. Global observation coverage remains a separate
// mandatory gate. Missing DCStart, census drift and any early exit burn it.
class target_rundown {
  rundown_inventory initial_;std::map<uint64_t,uint64_t> processes_;std::set<uint64_t> seen_processes_,seen_threads_;
  bool failed_=false,ready_=false,session_=false;
  void check(bool ok){if(!ok){failed_=true;throw error{ERROR_INVALID_DATA};}}
public:
  explicit target_rundown(rundown_inventory inventory):initial_(std::move(inventory)){
    check(!initial_.empty()&&initial_.size()<=QB_BOUND);
    for(const auto& [tid,row]:initial_){check(tid&&tid==row.tid&&row.pid&&row.process_created&&row.thread_created>=row.process_created);
      auto [p,inserted]=processes_.emplace(row.pid,row.process_created);check(inserted||p->second==row.process_created);}
  }
  void session_observed(){check(!failed_&&!ready_&&!session_);session_=true;}
  void process(uint64_t pid,uint64_t created){check(!failed_&&!ready_&&processes_.count(pid)&&processes_.at(pid)==created&&seen_processes_.insert(pid).second);}
  void thread(const rundown_thread& row){check(!failed_&&!ready_&&initial_.count(row.tid)&&initial_.at(row.tid)==row&&seen_threads_.insert(row.tid).second);}
  void fail()noexcept{failed_=true;}
  bool covered()const noexcept{return !failed_&&session_&&seen_processes_.size()==processes_.size()&&seen_threads_.size()==initial_.size();}
  bool ready()const noexcept{return ready_&&!failed_;}
  void confirm(const rundown_inventory& current){check(covered()&&!ready_&&current==initial_);ready_=true;}
  rundown_evidence evidence(){
    check(ready());std::vector<uint8_t> bytes;
    for(const auto& [tid,row]:initial_){(void)tid;append(bytes,&row,sizeof(row));}
    return {processes_.size(),initial_.size(),byte_hash(bytes.data(),bytes.size())};
  }
};
}
