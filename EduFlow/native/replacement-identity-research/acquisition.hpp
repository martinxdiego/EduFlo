#pragma once
// Isolated research adapters. Compile checked; never called by --self-test.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <winioctl.h>
#include <array>
#include <vector>
#include <string>
#include <stdexcept>
#include <cstdint>
#include <cstring>
#include <algorithm>

namespace replacement_research {
inline void need(bool ok, const char* reason) { if (!ok) throw std::runtime_error(reason); }
struct handle {
  HANDLE value = INVALID_HANDLE_VALUE;
  explicit handle(HANDLE h = INVALID_HANDLE_VALUE) : value(h) {}
  handle(const handle&) = delete; handle& operator=(const handle&) = delete;
  ~handle() { if (value != INVALID_HANDLE_VALUE && value != nullptr) CloseHandle(value); }
};
enum class raw_kind : uint32_t { open_request=1, open_result, identity128, identity64, notify_request, notify_completion, journal_query, journal_request, journal_completion, cancel_request, cancel_completion, close_request, close_result };
struct raw_frame { uint64_t sequence; raw_kind kind; DWORD status; std::vector<uint8_t> bytes; };
struct raw_capture {
  static constexpr size_t max_bytes = 16u * 1024u * 1024u, max_frames = 4096;
  std::vector<raw_frame> frames; size_t total = 0; bool lost = false;
  void append(raw_kind kind, DWORD status, const void* bytes, size_t length) {
    if (frames.size() >= max_frames || length > max_bytes - total) { lost = true; throw std::runtime_error("OBSERVATION_LOSS: raw evidence bound"); }
    raw_frame f{frames.size()+1,kind,status,{}};
    try { if(length) { need(bytes!=nullptr,"missing raw bytes"); const auto p=static_cast<const uint8_t*>(bytes); f.bytes.assign(p,p+length); } frames.push_back(std::move(f)); total+=length; }
    catch (...) { lost=true; throw; }
  }
};
struct open_request { DWORD access, share, disposition, flags; };
inline constexpr open_request watch_policy{FILE_LIST_DIRECTORY,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT|FILE_FLAG_OVERLAPPED};
inline constexpr open_request identity_policy{FILE_READ_ATTRIBUTES,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT};
inline constexpr open_request journal_policy{GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,OPEN_EXISTING,0};
inline HANDLE observed_open(raw_capture& capture, const std::wstring& name, open_request policy) {
  need(!name.empty() && name.size()<=512,"bounded prebound name required");
  // The future coordinator must supply a verified fixture/volume binding. These
  // adapters deliberately do not treat a path or this call as target approval.
  std::vector<uint8_t> request(sizeof(policy)+(name.size()+1)*sizeof(wchar_t));
  std::memcpy(request.data(),&policy,sizeof(policy)); std::memcpy(request.data()+sizeof(policy),name.c_str(),(name.size()+1)*sizeof(wchar_t));
  capture.append(raw_kind::open_request,0,request.data(),request.size());
  HANDLE h=CreateFileW(name.c_str(),policy.access,policy.share,nullptr,policy.disposition,policy.flags,nullptr);
  const DWORD error=h==INVALID_HANDLE_VALUE?GetLastError():ERROR_SUCCESS;
  try { capture.append(raw_kind::open_result,error,&h,sizeof(h)); } catch (...) { if(h!=INVALID_HANDLE_VALUE)CloseHandle(h); throw; }
  need(h!=INVALID_HANDLE_VALUE,"UNSUPPORTED: observation open failed"); return h;
}
inline void observed_close(raw_capture& c,HANDLE& h) {
  if(h==INVALID_HANDLE_VALUE || !h)return;
  c.append(raw_kind::close_request,0,&h,sizeof(h));
  const BOOL ok=CloseHandle(h); const DWORD error=ok?0:GetLastError(); h=INVALID_HANDLE_VALUE;
  c.append(raw_kind::close_result,error,nullptr,0); need(ok!=FALSE,"OBSERVATION_LOSS: close failed");
}
struct file_identity { FILE_ID_INFO full{}; BY_HANDLE_FILE_INFORMATION legacy{}; };
inline file_identity read_identity(raw_capture& capture,HANDLE subject_or_metadata_handle) {
  file_identity id{};
  BOOL ok=GetFileInformationByHandleEx(subject_or_metadata_handle,FileIdInfo,&id.full,sizeof(id.full));
  DWORD error=ok?0:GetLastError(); capture.append(raw_kind::identity128,error,ok?&id.full:nullptr,ok?sizeof(id.full):0);
  need(ok!=FALSE,"UNSUPPORTED: full file identity");
  ok=GetFileInformationByHandle(subject_or_metadata_handle,&id.legacy); error=ok?0:GetLastError();
  capture.append(raw_kind::identity64,error,ok?&id.legacy:nullptr,ok?sizeof(id.legacy):0);
  need(ok!=FALSE,"UNSUPPORTED: legacy file identity");
  // Both widths are independently observed on the same handle, never truncated.
  return id;
}

class directory_capture {
  raw_capture& raw_; handle directory_,event_; OVERLAPPED overlapped_{};
  alignas(DWORD) std::array<uint8_t,65536> buffer_{}; bool pending_=false;
public:
  static constexpr DWORD filter=FILE_NOTIFY_CHANGE_FILE_NAME|FILE_NOTIFY_CHANGE_DIR_NAME|FILE_NOTIFY_CHANGE_ATTRIBUTES|FILE_NOTIFY_CHANGE_SIZE|FILE_NOTIFY_CHANGE_LAST_WRITE|FILE_NOTIFY_CHANGE_CREATION|FILE_NOTIFY_CHANGE_SECURITY;
  directory_capture(raw_capture& raw,const std::wstring& directory):raw_(raw),directory_(observed_open(raw,directory,watch_policy)),event_(CreateEventW(nullptr,TRUE,FALSE,nullptr)) {
    need(event_.value!=nullptr,"UNSUPPORTED: notify event"); overlapped_.hEvent=event_.value;
  }
  directory_capture(const directory_capture&)=delete;
  ~directory_capture() {
    // Do not free OVERLAPPED/buffer while the kernel may still reference them.
    // Runtime integration must isolate this adapter in a bounded worker; hung
    // cancellation is loss, never an excuse to reuse storage or seal evidence.
    if(pending_){CancelIoEx(directory_.value,&overlapped_);DWORD bytes=0;GetOverlappedResult(directory_.value,&overlapped_,&bytes,TRUE);raw_.lost=true;}
  }
  void arm() {
    need(!pending_,"duplicate notify arm"); need(ResetEvent(event_.value)!=FALSE,"event reset failed");
    const std::array<DWORD,3> request{static_cast<DWORD>(buffer_.size()),filter,ReadDirectoryNotifyExtendedInformation};
    raw_.append(raw_kind::notify_request,0,request.data(),sizeof(request));
    const BOOL ok=ReadDirectoryChangesExW(directory_.value,buffer_.data(),static_cast<DWORD>(buffer_.size()),TRUE,filter,nullptr,&overlapped_,nullptr,ReadDirectoryNotifyExtendedInformation);
    const DWORD error=ok?0:GetLastError();
    pending_=ok!=FALSE || error==ERROR_IO_PENDING;
    if(!pending_){raw_.append(raw_kind::notify_completion,error,nullptr,0);raw_.lost=true;throw std::runtime_error("UNSUPPORTED: extended notifications");}
  }
  bool poll(DWORD milliseconds) {
    need(pending_ && milliseconds<=1000,"notify poll contract");
    const DWORD wait=WaitForSingleObject(event_.value,milliseconds);
    if(wait==WAIT_TIMEOUT)return false;
    need(wait==WAIT_OBJECT_0,"OBSERVATION_LOSS: notification wait");
    DWORD bytes=0;const BOOL ok=GetOverlappedResult(directory_.value,&overlapped_,&bytes,FALSE);const DWORD error=ok?0:GetLastError();
    if(!ok && error==ERROR_IO_INCOMPLETE){raw_.lost=true;throw std::runtime_error("OBSERVATION_LOSS: incomplete completion");}
    pending_=false;
    need(bytes<=buffer_.size(),"notify byte count");
    raw_.append(raw_kind::notify_completion,error,buffer_.data(),ok?bytes:0);
    if(!ok || bytes==0){raw_.lost=true;throw std::runtime_error("OBSERVATION_LOSS: notify error/overflow");}
    return true; // Caller drains/records before explicitly rearming same handle.
  }
  void cancel_and_record() {
    need(pending_,"notify must be pending at cancellation");
    const BOOL cancelled=CancelIoEx(directory_.value,&overlapped_);const DWORD error=cancelled?0:GetLastError();
    raw_.append(raw_kind::cancel_request,error,nullptr,0);
    need(cancelled!=FALSE || error==ERROR_NOT_FOUND,"OBSERVATION_LOSS: cancel request");
    need(WaitForSingleObject(event_.value,1000)==WAIT_OBJECT_0,"OBSERVATION_LOSS: cancel timeout");
    DWORD bytes=0;const BOOL ok=GetOverlappedResult(directory_.value,&overlapped_,&bytes,FALSE);const DWORD finish=ok?0:GetLastError();
    if(!ok && finish==ERROR_IO_INCOMPLETE){raw_.lost=true;throw std::runtime_error("OBSERVATION_LOSS: cancellation incomplete");}
    pending_=false;need(bytes<=buffer_.size(),"cancel byte count");
    raw_.append(raw_kind::cancel_completion,finish,buffer_.data(),ok?bytes:0);
    if((ok&&bytes==0)||(!ok&&finish!=ERROR_OPERATION_ABORTED)){raw_.lost=true;throw std::runtime_error("OBSERVATION_LOSS: cancel completion");}
    observed_close(raw_,directory_.value);
    // No 'complete' receipt: cancelled pending I/O is not a notification EOS.
  }
};

inline USN_JOURNAL_DATA_V0 journal_metadata(raw_capture& raw,HANDLE volume) {
  USN_JOURNAL_DATA_V0 info{};DWORD bytes=0;
  const BOOL ok=DeviceIoControl(volume,FSCTL_QUERY_USN_JOURNAL,nullptr,0,&info,sizeof(info),&bytes,nullptr);
  raw.append(raw_kind::journal_query,ok?0:GetLastError(),&info,std::min<size_t>(bytes,sizeof(info)));
  need(ok!=FALSE && bytes==sizeof(info),"UNSUPPORTED: existing journal unavailable");
  need(info.FirstUsn>=0 && info.LowestValidUsn>=0 && info.NextUsn>=info.FirstUsn && info.NextUsn>=info.LowestValidUsn,"OBSERVATION_LOSS: journal range");
  return info;
}
inline bool continuous(const USN_JOURNAL_DATA_V0& a,const USN_JOURNAL_DATA_V0& b,USN cursor) {
  return a.UsnJournalID==b.UsnJournalID && b.NextUsn>=a.NextUsn && cursor>=a.FirstUsn && cursor>=a.LowestValidUsn && cursor>=b.FirstUsn && cursor>=b.LowestValidUsn;
}
inline USN read_journal_chunk(raw_capture& raw,HANDLE volume,const USN_JOURNAL_DATA_V0& start,USN cursor) {
  const auto before=journal_metadata(raw,volume);need(continuous(start,before,cursor),"OBSERVATION_LOSS: journal discontinuity");
  READ_USN_JOURNAL_DATA_V1 request{};request.StartUsn=cursor;request.ReasonMask=0xffffffff;request.ReturnOnlyOnClose=FALSE;request.Timeout=0;request.BytesToWaitFor=0;request.UsnJournalID=start.UsnJournalID;request.MinMajorVersion=2;request.MaxMajorVersion=3;
  raw.append(raw_kind::journal_request,0,&request,sizeof(request));
  std::array<uint8_t,65536> buffer{};DWORD bytes=0;
  const BOOL ok=DeviceIoControl(volume,FSCTL_READ_USN_JOURNAL,&request,sizeof(request),buffer.data(),static_cast<DWORD>(buffer.size()),&bytes,nullptr);
  const DWORD error=ok?0:GetLastError();need(bytes<=buffer.size(),"journal buffer count");
  raw.append(raw_kind::journal_completion,error,buffer.data(),bytes);
  need(ok!=FALSE && bytes>=sizeof(USN),"OBSERVATION_LOSS: journal read");
  USN next=0;std::memcpy(&next,buffer.data(),sizeof(next));need(next>=cursor,"OBSERVATION_LOSS: journal cursor regression");
  const auto after=journal_metadata(raw,volume);need(continuous(before,after,cursor),"OBSERVATION_LOSS: journal changed during read");
  return next;
}
} // namespace replacement_research
