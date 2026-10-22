#pragma once
#include "observation-chain.hpp"
#include "../common/bootstrap.hpp"
#include "../common/token-profile.hpp"
#include "rundown.hpp"
#include <evntrace.h>
#include <evntcons.h>
#include <tdh.h>
#include <thread>
#include <atomic>
#pragma comment(lib,"tdh.lib")

namespace q {
inline DWORD etw_u32(EVENT_RECORD& event,const wchar_t* name){
  PROPERTY_DATA_DESCRIPTOR property{};property.PropertyName=reinterpret_cast<ULONGLONG>(name);property.ArrayIndex=ULONG_MAX;
  ULONG bytes=0;require(TdhGetPropertySize(&event,0,nullptr,1,&property,&bytes)==ERROR_SUCCESS&&bytes==4,ERROR_NOT_SUPPORTED);
  DWORD result=0;require(TdhGetProperty(&event,0,nullptr,1,&property,4,reinterpret_cast<PBYTE>(&result))==ERROR_SUCCESS);return result;
}
class etw_reader {
  observation_chain& chain_;const deployment& fixed_;std::mutex& mutex_;
  TRACEHANDLE session_=0,reader_=INVALID_PROCESSTRACE_HANDLE;std::thread worker_;
  std::vector<uint8_t> properties_;EVENT_TRACE_LOGFILEW logfile_{};
  std::map<DWORD,process_evidence> live_;std::map<DWORD,thread_evidence> threads_;
  std::unique_ptr<target_rundown> rundown_;
  bool stopped_=false;std::atomic<ULONG> process_status_{ERROR_IO_PENDING};
  static constexpr GUID process_guid{0x3d6fa8d0,0xfe05,0x11d0,{0x9d,0xda,0x00,0xc0,0x4f,0xd7,0xba,0x7c}};
  static constexpr GUID thread_guid{0x3d6fa8d1,0xfe05,0x11d0,{0x9d,0xda,0x00,0xc0,0x4f,0xd7,0xba,0x7c}};
  static constexpr GUID session_guid{0x44554642,0xf271,0x4fc2,{0x9a,0xef,0x75,0x91,0x37,0x8a,0xa9,0x07}};
  static constexpr wchar_t session_name[]=L"EduFlow.Qualification.Observation.v2";
  const Q_BOUND_PROCESS* expected(DWORD pid)const{for(uint32_t i=0;i<fixed_.inspection.process_count;i++)if(fixed_.inspection.processes[i].pid==pid)return &fixed_.inspection.processes[i];return nullptr;}
  static void WINAPI callback(EVENT_RECORD* event)noexcept{
    auto self=static_cast<etw_reader*>(event->UserContext);if(!self)return;
    std::lock_guard lock(self->mutex_);try{self->ingest(*event);}catch(...){self->chain_.fail();}
  }
  process_evidence identify(const Q_BOUND_PROCESS& fixed,uint64_t time){
    auto process=bound_process(fixed);HANDLE raw=nullptr;require(OpenProcessToken(process,TOKEN_QUERY,&raw));handle token(raw);
    auto statistics=token_info(token,TokenStatistics);const auto stats=reinterpret_cast<const TOKEN_STATISTICS*>(statistics.data());
    process_evidence p{};p.pid=fixed.pid;p.created=fixed.created;p.start=time;p.image=process_image(process);p.primary_profile=token_profile(token);
    auto session=token_info(token,TokenSessionId);memcpy(&p.session,session.data(),4);memcpy(&p.primary_token,&stats->TokenId,8);memcpy(&p.primary_modified,&stats->ModifiedId,8);
    require(alive(process)&&created(process)==fixed.created);return p;
  }
  void query_session(){
    auto p=reinterpret_cast<EVENT_TRACE_PROPERTIES*>(properties_.data());
    require(session_&&ControlTraceW(session_,session_name,p,EVENT_TRACE_CONTROL_QUERY)==ERROR_SUCCESS);
    require(IsEqualGUID(p->Wnode.Guid,session_guid)&&p->Wnode.ClientContext==2&&p->BufferSize==64
      &&p->LogFileMode==(EVENT_TRACE_REAL_TIME_MODE|EVENT_TRACE_SYSTEM_LOGGER_MODE)
      &&p->EnableFlags==(EVENT_TRACE_FLAG_PROCESS|EVENT_TRACE_FLAG_THREAD)&&!p->EventsLost&&!p->LogBuffersLost&&!p->RealTimeBuffersLost,ERROR_NOT_SUPPORTED);
  }
  void ingest(EVENT_RECORD& e){
    require(!stopped_&&e.EventHeader.TimeStamp.QuadPart>0&&!(e.EventHeader.Flags&EVENT_HEADER_FLAG_32_BIT_HEADER),ERROR_NOT_SUPPORTED);
    const auto opcode=e.EventHeader.EventDescriptor.Opcode;const uint64_t time=static_cast<uint64_t>(e.EventHeader.TimeStamp.QuadPart);
    if(IsEqualGUID(e.EventHeader.ProviderId,process_guid)){
      require(e.EventHeader.EventDescriptor.Version==2&&(opcode>=1&&opcode<=4),ERROR_NOT_SUPPORTED);
      const auto pid=etw_u32(e,L"ProcessId");const auto binding=expected(pid);if(!binding)return;
      if(opcode==1||opcode==3){
        require(!live_.count(pid));
        auto p=identify(*binding,time);chain_.process_start(p);live_.emplace(pid,p);
        if(!rundown_->ready()){require(opcode==3);rundown_->process(pid,p.created);}
      }else{require(live_.count(pid));auto& p=live_.at(pid);
        // Rundown end is not a process exit; the final stop/drain supplies the
        // capture horizon. Only a real End closes the process lifetime.
        if(opcode==2){if(!rundown_->ready())rundown_->fail();chain_.process_end(pid,p.created,time);live_.erase(pid);}
      }
    }else if(IsEqualGUID(e.EventHeader.ProviderId,thread_guid)){
      require(e.EventHeader.EventDescriptor.Version==2&&(opcode>=1&&opcode<=4),ERROR_NOT_SUPPORTED);
      const auto pid=etw_u32(e,L"ProcessId"),tid=etw_u32(e,L"TThreadId");if(!expected(pid))return;require(live_.count(pid));
      if(opcode==1||opcode==3){
        require(!threads_.count(tid));
        handle thread(OpenThread(THREAD_QUERY_LIMITED_INFORMATION,FALSE,tid));require(thread.value&&GetProcessIdOfThread(thread)==pid);
        FILETIME createdTime{},exit{},kernel{},user{};require(GetThreadTimes(thread,&createdTime,&exit,&kernel,&user));
        require(time_value(createdTime)<=time);thread_evidence t{pid,live_.at(pid).created,tid,time,0};chain_.thread_start(t);threads_.emplace(tid,t);
        if(!rundown_->ready()){require(opcode==3);rundown_->thread({pid,t.created,tid,time_value(createdTime)});}
      }else if(opcode==2){if(!rundown_->ready())rundown_->fail();require(threads_.count(tid)&&threads_.at(tid).pid==pid);chain_.thread_end(pid,live_.at(pid).created,tid,time);threads_.erase(tid);}
    }else{
      // Real-time consumers do not receive EventTraceEvent log-header events.
      // Session controls are queried through the owned native session handle;
      // unknown event providers/versions still have no blanket exemption.
      throw error{ERROR_NOT_SUPPORTED};
    }
  }
public:
  bool rundown_ready()const noexcept{return rundown_&&rundown_->ready();}
  rundown_evidence target_evidence(){std::lock_guard lock(mutex_);require(!chain_.blocked());return rundown_->evidence();}
  void await_target_rundown(){
    const auto deadline=GetTickCount64()+5000;
    try{while(GetTickCount64()<deadline){
      {std::lock_guard lock(mutex_);require(!chain_.blocked());
        if(rundown_->covered()){query_session();rundown_->confirm(acquire_rundown_inventory(fixed_));return;}}
      SwitchToThread();
    }}catch(...){std::lock_guard lock(mutex_);rundown_->fail();chain_.fail();throw;}
    std::lock_guard lock(mutex_);rundown_->fail();chain_.fail();throw error{ERROR_TIMEOUT};
  }
  etw_reader(observation_chain& chain,const deployment& fixed,std::mutex& mutex):chain_(chain),fixed_(fixed),mutex_(mutex),properties_(sizeof(EVENT_TRACE_PROPERTIES)+sizeof(session_name)){
    require(allowed_environment());require(fixed.inspection.process_count>0&&fixed.inspection.process_count<=Q_MAX_TOKENS);
    rundown_=std::make_unique<target_rundown>(acquire_rundown_inventory(fixed));
    auto p=reinterpret_cast<EVENT_TRACE_PROPERTIES*>(properties_.data());p->Wnode.BufferSize=static_cast<ULONG>(properties_.size());p->Wnode.Flags=WNODE_FLAG_TRACED_GUID;
    p->Wnode.ClientContext=2;p->Wnode.Guid=session_guid;p->LogFileMode=EVENT_TRACE_REAL_TIME_MODE|EVENT_TRACE_SYSTEM_LOGGER_MODE;
    p->EnableFlags=EVENT_TRACE_FLAG_PROCESS|EVENT_TRACE_FLAG_THREAD;p->LoggerNameOffset=sizeof(*p);p->BufferSize=64;p->MinimumBuffers=16;p->MaximumBuffers=64;p->FlushTimer=1;
    require(StartTraceW(&session_,session_name,p)==ERROR_SUCCESS,ERROR_ACCESS_DENIED);
    try{
      query_session();rundown_->session_observed();
      logfile_.LoggerName=const_cast<LPWSTR>(session_name);logfile_.ProcessTraceMode=PROCESS_TRACE_MODE_REAL_TIME|PROCESS_TRACE_MODE_EVENT_RECORD;
      logfile_.EventRecordCallback=callback;logfile_.Context=this;reader_=OpenTraceW(&logfile_);require(reader_!=INVALID_PROCESSTRACE_HANDLE);
      worker_=std::thread([this]{process_status_=ProcessTrace(&reader_,1,nullptr,nullptr);});
    }catch(...){ControlTraceW(session_,session_name,p,EVENT_TRACE_CONTROL_STOP);if(reader_!=INVALID_PROCESSTRACE_HANDLE)CloseTrace(reader_);session_=0;throw;}
  }
  etw_reader(const etw_reader&)=delete;
  ~etw_reader(){if(session_){try{finish();}catch(...){chain_.fail();}}}
  void finish(){
    require(session_&&!stopped_);auto p=reinterpret_cast<EVENT_TRACE_PROPERTIES*>(properties_.data());
    const auto stopped=ControlTraceW(session_,session_name,p,EVENT_TRACE_CONTROL_STOP);session_=0;
    if(stopped!=ERROR_SUCCESS)CloseTrace(reader_);
    if(worker_.joinable())worker_.join();CloseTrace(reader_);reader_=INVALID_PROCESSTRACE_HANDLE;
    std::lock_guard lock(mutex_);stopped_=true;
    if(stopped!=ERROR_SUCCESS||process_status_!=ERROR_SUCCESS||logfile_.EventsLost){chain_.fail();throw error{ERROR_INVALID_DATA};}
    chain_.etw_finish(p->EventsLost,p->LogBuffersLost,p->RealTimeBuffersLost,true);
  }
};
}
