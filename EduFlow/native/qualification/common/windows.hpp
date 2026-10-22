#pragma once
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <aclapi.h>
#include <sddl.h>
#include <bcrypt.h>
#include <vector>
#include <string>
#include <array>
#include <algorithm>
#include <stdexcept>
#include <cstring>
#include <memory>
#include <source_location>
#include "protocol.h"
#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "bcrypt.lib")

namespace q {
struct error { DWORD code;const char* file=nullptr;uint_least32_t line=0; };
inline void require(bool ok, DWORD reason = ERROR_INVALID_DATA,const std::source_location location=std::source_location::current()) { if (!ok) throw error{reason,location.file_name(),location.line()}; }
struct handle {
  HANDLE value = INVALID_HANDLE_VALUE;
  handle() = default;
  explicit handle(HANDLE h) : value(h) {}
  handle(const handle&) = delete; handle& operator=(const handle&) = delete;
  handle(handle&& h) noexcept : value(h.value) { h.value = INVALID_HANDLE_VALUE; }
  ~handle() { if (value != INVALID_HANDLE_VALUE && value != nullptr) CloseHandle(value); }
  operator HANDLE() const { return value; }
};
struct local_memory { HLOCAL value = nullptr; ~local_memory() { if (value) LocalFree(value); } };
inline bool allowed_environment() {
  wchar_t env[32]{}; const DWORD n = GetEnvironmentVariableW(L"NODE_ENV", env, 32);
  return n > 0 && n < 32 && (wcscmp(env, L"test") == 0 || wcscmp(env, L"development") == 0);
}
inline uint64_t time_value(FILETIME t) { return (uint64_t(t.dwHighDateTime) << 32) | t.dwLowDateTime; }
inline uint64_t created(HANDLE process) { FILETIME c{}, e{}, k{}, u{}; require(GetProcessTimes(process, &c, &e, &k, &u)); return time_value(c); }
inline void sid_text(PSID sid, wchar_t (&out)[Q_MAX_SID]) {
  require(sid && IsValidSid(sid)); LPWSTR s = nullptr; require(ConvertSidToStringSidW(sid, &s)); local_memory cleanup{ s };
  require(wcslen(s) < Q_MAX_SID); wcscpy_s(out, s);
}
inline void fixed_token_length(TOKEN_INFORMATION_CLASS kind,const std::vector<uint8_t>& bytes,DWORD returned) {
  if(kind==TokenHasRestrictions&&returned==sizeof(BOOLEAN)){
    // Windows returns a BOOLEAN-length HasRestrictions result on this supported
    // API path, despite documenting a DWORD. Normalize only this boolean class
    // in an already zero-initialized DWORD; no generic short-result fallback.
    require(bytes.size()==sizeof(DWORD)&&bytes[0]<=1&&bytes[1]==0&&bytes[2]==0&&bytes[3]==0);return;
  }
  require(returned==bytes.size());
}
inline std::vector<uint8_t> token_info(HANDLE token, TOKEN_INFORMATION_CLASS kind) {
  // Fixed-size token classes are queried directly. In particular Windows can
  // return ERROR_BAD_LENGTH (without the allocation-size negotiation) for a
  // zero-length TokenElevation query. Do not turn that into a missing fact.
  DWORD fixed=0;
  switch(kind){
    case TokenType:case TokenImpersonationLevel:case TokenSessionId:case TokenElevationType:
    case TokenElevation:case TokenSandBoxInert:case TokenHasRestrictions:case TokenVirtualizationAllowed:
    case TokenVirtualizationEnabled:case TokenUIAccess:case TokenMandatoryPolicy:case TokenIsAppContainer:fixed=sizeof(DWORD);break;
    case TokenStatistics:fixed=sizeof(TOKEN_STATISTICS);break;
    default:break;
  }
  if(fixed){
    std::vector<uint8_t> bytes(fixed);DWORD returned=0;
    const BOOL read=GetTokenInformation(token,kind,bytes.data(),fixed,&returned);const DWORD code=GetLastError();
    require(read,code?code:ERROR_INVALID_DATA);
    fixed_token_length(kind,bytes,returned);return bytes;
  }
  DWORD count = 0; const BOOL sized=GetTokenInformation(token, kind, nullptr, 0, &count);const DWORD code=GetLastError();
  require(!sized&&code==ERROR_INSUFFICIENT_BUFFER,code?code:ERROR_INVALID_DATA);
  require(count > 0 && count <= Q_MAX_MESSAGE);
  std::vector<uint8_t> bytes(count); require(GetTokenInformation(token, kind, bytes.data(), count, &count)); return bytes;
}
inline std::array<uint8_t,32> file_hash(HANDLE file) {
  BCRYPT_ALG_HANDLE algorithm = nullptr; BCRYPT_HASH_HANDLE hash = nullptr;
  require(BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) >= 0);
  struct cleanup { BCRYPT_ALG_HANDLE a; BCRYPT_HASH_HANDLE* h; ~cleanup() { if (*h) BCryptDestroyHash(*h); BCryptCloseAlgorithmProvider(a,0); } } guard{algorithm,&hash};
  require(BCryptCreateHash(algorithm, &hash, nullptr, 0, nullptr, 0, 0) >= 0);
  LARGE_INTEGER zero{}; require(SetFilePointerEx(file, zero, nullptr, FILE_BEGIN));
  std::array<uint8_t,65536> block{}; DWORD read = 0; uint64_t total = 0;
  while (true) { require(ReadFile(file, block.data(), DWORD(block.size()), &read, nullptr)); if (!read) break; total += read; require(total <= 512ull*1024*1024); require(BCryptHashData(hash, block.data(), read, 0) >= 0); }
  std::array<uint8_t,32> out{}; require(BCryptFinishHash(hash, out.data(), DWORD(out.size()), 0) >= 0); return out;
}
inline std::array<uint8_t,32> byte_hash(const void* data,size_t length) {
  require(length<=Q_MAX_MESSAGE); std::array<uint8_t,32> out{};
  require(BCryptHash(BCRYPT_SHA256_ALG_HANDLE,nullptr,0,const_cast<PUCHAR>(static_cast<const UCHAR*>(data)),
    static_cast<ULONG>(length),out.data(),static_cast<ULONG>(out.size()))>=0); return out;
}
inline bool alive(HANDLE process) {
  // An exited process may itself return 259 (STILL_ACTIVE). The synchronization
  // state is decisive; a handle without SYNCHRONIZE cannot prove liveness.
  DWORD code=0;return WaitForSingleObject(process,0)==WAIT_TIMEOUT&&GetExitCodeProcess(process,&code)&&code==STILL_ACTIVE;
}
inline std::array<uint8_t,32> process_image(HANDLE process) {
  wchar_t name[32768]{}; DWORD count = 32768; require(QueryFullProcessImageNameW(process, 0, name, &count));
  handle file(CreateFileW(name, GENERIC_READ, FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE, nullptr, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
  require(file.value != INVALID_HANDLE_VALUE); return file_hash(file);
}
inline void append(std::vector<uint8_t>& out, const void* value, size_t size) {
  require(size <= Q_MAX_MESSAGE && out.size() <= Q_MAX_MESSAGE-size, ERROR_BUFFER_OVERFLOW);
  const auto bytes = static_cast<const uint8_t*>(value); out.insert(out.end(), bytes, bytes+size);
}
inline bool valid_request(const Q_REQUEST& r) {
  return r.magic == Q_MAGIC && r.version == Q_COLLECTOR_VERSION && r.size == sizeof(r) && r.verb == 1
    && std::any_of(std::begin(r.challenge),std::end(r.challenge),[](uint8_t b){return b!=0;})
    && std::any_of(std::begin(r.profile),std::end(r.profile),[](uint8_t b){return b!=0;})
    && std::any_of(std::begin(r.epoch),std::end(r.epoch),[](uint8_t b){return b!=0;})
    && std::any_of(std::begin(r.fixture),std::end(r.fixture),[](uint8_t b){return b!=0;})
    && std::any_of(std::begin(r.boot),std::end(r.boot),[](uint8_t b){return b!=0;});
}
inline bool fixed_string(const wchar_t* p, size_t max) {
  const auto end=wmemchr(p,L'\0',max);
  return end && std::all_of(end,p+max,[](wchar_t c){return c==0;});
}
}
