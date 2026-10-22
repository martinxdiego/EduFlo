#pragma once
#include "bootstrap.hpp"
#include "ipc.hpp"
#include "release-proof.hpp"
#include <winhttp.h>
#include <wincrypt.h>
#include <atomic>
#pragma comment(lib,"winhttp.lib")
#pragma comment(lib,"crypt32.lib")

namespace q {
enum controller_phase:uint32_t { consume_launch=1,release_child=2,record_exit=3 };
struct controller_request {
  uint32_t magic=Q_MAGIC,version=2,size=sizeof(controller_request),phase=0,role=0,reserved=0;
  uint64_t broker_pid=0,broker_created=0,child_pid=0,child_created=0;
  uint32_t exit_code=0,reserved2=0;
  uint8_t nonce[32]{},fixture[32]{},epoch[32]{},profile[32]{},boot[32]{},ticket[32]{},token[32]{},image[32]{},handles[32]{};
};
struct controller_response {
  uint32_t magic=Q_MAGIC,version=2,size=sizeof(controller_response),decision=0;
  controller_request request;
  uint64_t journal_sequence=0;
  uint8_t journal_head[32]{},observer_epoch[32]{};
  uint32_t consumed=0,redeemed=0,observer_ready=0,synthetic=0;
  uint8_t persistence_contract[32]{},durable_consumption[32]{};
  release_proof independently_observed;
};
inline bool nonzero(std::span<const uint8_t> bytes){return std::any_of(bytes.begin(),bytes.end(),[](uint8_t n){return n!=0;});}
inline void validate_controller_reply(const controller_request& request,const controller_response& response) {
  require(request.magic==Q_MAGIC&&request.version==2&&request.size==sizeof(request)&&request.phase>=consume_launch&&request.phase<=record_exit
    &&(request.role==2||request.role==3||request.role==5||request.role==6)&&!request.reserved&&!request.reserved2&&request.broker_pid&&request.broker_created&&nonzero(request.nonce)
    &&nonzero(request.fixture)&&nonzero(request.epoch)&&nonzero(request.profile)&&nonzero(request.boot)&&nonzero(request.ticket));
  require(request.phase==consume_launch?(!request.child_pid&&!request.child_created):(request.child_pid&&request.child_created&&nonzero(request.image)&&nonzero(request.token)&&nonzero(request.handles)));
  require(request.phase==record_exit||request.exit_code==0);
  require(response.magic==Q_MAGIC&&response.version==2&&response.size==sizeof(response)&&response.decision==1
    &&memcmp(&response.request,&request,sizeof(request))==0&&response.journal_sequence&&nonzero(response.journal_head)
    &&nonzero(response.observer_epoch)&&response.consumed==1&&response.redeemed==1&&response.observer_ready==1&&!response.synthetic
    &&nonzero(response.persistence_contract)&&nonzero(response.durable_consumption),ERROR_ACCESS_DENIED);
}
struct internet_handle {
  HINTERNET value=nullptr;explicit internet_handle(HINTERNET h):value(h){require(h!=nullptr);}
  internet_handle(const internet_handle&)=delete;~internet_handle(){if(value)WinHttpCloseHandle(value);}operator HINTERNET()const{return value;}
};
struct certificate { PCCERT_CONTEXT value=nullptr;explicit certificate(PCCERT_CONTEXT c):value(c){}certificate(const certificate&)=delete;~certificate(){if(value)CertFreeCertificateContext(value);} };
inline certificate controller_client_certificate(const uint8_t (&digest)[32]) {
  require(nonzero(digest));HCERTSTORE store=CertOpenStore(CERT_STORE_PROV_SYSTEM_W,0,0,CERT_SYSTEM_STORE_LOCAL_MACHINE|CERT_STORE_READONLY_FLAG|CERT_STORE_OPEN_EXISTING_FLAG,L"MY");
  require(store!=nullptr,ERROR_ACCESS_DENIED);struct close_store{HCERTSTORE value;~close_store(){CertCloseStore(value,0);}} cleanup{store};
  PCCERT_CONTEXT current=nullptr;size_t count=0;
  while((current=CertEnumCertificatesInStore(store,current))!=nullptr){
    if(++count>512){CertFreeCertificateContext(current);throw error{ERROR_BUFFER_OVERFLOW};}
    if(current->cbCertEncoded>65536)continue;
    auto hash=byte_hash(current->pbCertEncoded,current->cbCertEncoded);
    if(memcmp(hash.data(),digest,32)==0){auto copy=CertDuplicateCertificateContext(current);CertFreeCertificateContext(current);require(copy!=nullptr);return certificate(copy);}
  }throw error{ERROR_NOT_FOUND};
}
// Context lives through HANDLE_CLOSING, including a close in an informational
// SENDING_REQUEST callback. Caller and WinHTTP each hold one reference.
struct pinned_http_state {
  std::atomic<unsigned> references{1};std::atomic<HINTERNET> request{nullptr};
  std::atomic<bool> verified{false},failed{false};std::array<uint8_t,32> expected{};
  void release(){if(references.fetch_sub(1)==1)delete this;}
  void close(){if(auto handle=request.exchange(nullptr))WinHttpCloseHandle(handle);}
  static void CALLBACK callback(HINTERNET handle,DWORD_PTR context,DWORD status,void*,DWORD) noexcept {
    auto self=reinterpret_cast<pinned_http_state*>(context);if(!self)return;
    if(status==WINHTTP_CALLBACK_STATUS_HANDLE_CLOSING){self->release();return;}
    if(status!=WINHTTP_CALLBACK_STATUS_SENDING_REQUEST)return;
    try {
      require(self->request.load()==handle&&!self->failed.load());PCCERT_CONTEXT raw=nullptr;DWORD size=sizeof(raw);
      require(WinHttpQueryOption(handle,WINHTTP_OPTION_SERVER_CERT_CONTEXT,&raw,&size)&&size==sizeof(raw)&&raw);
      certificate cert(raw);require(cert.value->cbCertEncoded<=65536);auto digest=byte_hash(cert.value->pbCertEncoded,cert.value->cbCertEncoded);
      require(memcmp(digest.data(),self->expected.data(),32)==0,ERROR_ACCESS_DENIED);self->verified=true;
    }catch(...){self->failed=true;self->close();}
  }
};
class pinned_http_request {
  pinned_http_state* state_;
public:
  pinned_http_request(HINTERNET request,const uint8_t (&pin)[32]):state_(new pinned_http_state){
    state_->request=request;memcpy(state_->expected.data(),pin,32);
    try {
      require(request&&nonzero(pin));DWORD_PTR context=reinterpret_cast<DWORD_PTR>(state_);
      require(WinHttpSetOption(request,WINHTTP_OPTION_CONTEXT_VALUE,&context,sizeof(context)));
      state_->references++;
      if(WinHttpSetStatusCallback(request,pinned_http_state::callback,WINHTTP_CALLBACK_STATUS_SENDING_REQUEST|WINHTTP_CALLBACK_FLAG_HANDLES,0)==WINHTTP_INVALID_STATUS_CALLBACK){state_->release();throw error{ERROR_NOT_SUPPORTED};}
    }catch(...){state_->close();state_->release();throw;}
  }
  pinned_http_request(const pinned_http_request&)=delete;
  ~pinned_http_request(){state_->close();state_->release();}
  HINTERNET get()const{auto value=state_->request.load();require(value&&!state_->failed.load(),ERROR_ACCESS_DENIED);return value;}
  DWORD_PTR context()const{return reinterpret_cast<DWORD_PTR>(state_);}
  void authenticated()const{require(state_->verified.load()&&!state_->failed.load()&&state_->request.load(),ERROR_ACCESS_DENIED);}
};
// This transport has a fixed verb/path, pinned TLS peer, preconfigured machine
// client certificate, no proxies/redirects/default credentials or retry loop.
// It is never called by the collector and grants no paid/Provider capability.
template<class Request,class Response>
inline Response controller_http(const deployment& fixed,Request& request,const wchar_t* endpoint) {
  require(allowed_environment(),ERROR_ACCESS_DENIED);
  require(wcscmp(endpoint,L"/qualification/v1/launcher")==0||wcscmp(endpoint,L"/qualification/v1/cleanup")==0);
  require(fixed_string(fixed.controller_host,256)&&wcslen(fixed.controller_host)>0&&wcslen(fixed.controller_host)<=253);
  for(const wchar_t* p=fixed.controller_host;*p;p++)require((*p>=L'a'&&*p<=L'z')||(*p>=L'0'&&*p<=L'9')||*p==L'.'||*p==L'-');
  require(wcschr(fixed.controller_host,L'.')&&wcscmp(fixed.controller_host,L"localhost")!=0&&wcsncmp(fixed.controller_host,L"127.",4)!=0,ERROR_ACCESS_DENIED);
  require(BCryptGenRandom(nullptr,request.nonce,32,BCRYPT_USE_SYSTEM_PREFERRED_RNG)>=0);
  const uint64_t started=GetTickCount64();
  internet_handle session(WinHttpOpen(L"EduFlowQualification/1",WINHTTP_ACCESS_TYPE_NO_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0));
  require(WinHttpSetTimeouts(session,5000,5000,5000,5000));DWORD protocols=WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2|WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_3;
  require(WinHttpSetOption(session,WINHTTP_OPTION_SECURE_PROTOCOLS,&protocols,sizeof(protocols)));
  DWORD retries=0;require(WinHttpSetOption(session,WINHTTP_OPTION_CONNECT_RETRIES,&retries,sizeof(retries)));
  internet_handle connection(WinHttpConnect(session,fixed.controller_host,INTERNET_DEFAULT_HTTPS_PORT,0));
  pinned_http_request http(WinHttpOpenRequest(connection,L"POST",endpoint,nullptr,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,WINHTTP_FLAG_SECURE),fixed.controller_certificate);
  DWORD redirect=WINHTTP_OPTION_REDIRECT_POLICY_NEVER,disabled=WINHTTP_DISABLE_COOKIES|WINHTTP_DISABLE_AUTHENTICATION;
  require(WinHttpSetOption(http.get(),WINHTTP_OPTION_REDIRECT_POLICY,&redirect,sizeof(redirect))&&WinHttpSetOption(http.get(),WINHTTP_OPTION_DISABLE_FEATURE,&disabled,sizeof(disabled)));
  auto cert=controller_client_certificate(fixed.client_certificate);
  require(WinHttpSetOption(http.get(),WINHTTP_OPTION_CLIENT_CERT_CONTEXT,const_cast<CERT_CONTEXT*>(cert.value),sizeof(CERT_CONTEXT)));
  constexpr wchar_t headers[]=L"Content-Type: application/octet-stream\r\n";
  require(WinHttpSendRequest(http.get(),headers,static_cast<DWORD>(wcslen(headers)),&request,static_cast<DWORD>(sizeof(request)),static_cast<DWORD>(sizeof(request)),http.context()));http.authenticated();
  require(WinHttpReceiveResponse(http.get(),nullptr));http.authenticated();DWORD status=0,size=sizeof(status);
  require(WinHttpQueryHeaders(http.get(),WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,WINHTTP_HEADER_NAME_BY_INDEX,&status,&size,WINHTTP_NO_HEADER_INDEX)&&status==200);
  DWORD length=0;size=sizeof(length);require(WinHttpQueryHeaders(http.get(),WINHTTP_QUERY_CONTENT_LENGTH|WINHTTP_QUERY_FLAG_NUMBER,WINHTTP_HEADER_NAME_BY_INDEX,&length,&size,WINHTTP_NO_HEADER_INDEX)&&length==sizeof(Response));
  Response response{};size_t offset=0;
  while(offset<sizeof(response)){DWORD got=0;require(WinHttpReadData(http.get(),reinterpret_cast<uint8_t*>(&response)+offset,static_cast<DWORD>(sizeof(response)-offset),&got)&&got&&got<=sizeof(response)-offset);offset+=got;}
  uint8_t extra=0;DWORD got=0;require(WinHttpReadData(http.get(),&extra,1,&got)&&got==0);http.authenticated();
  require(GetTickCount64()-started<=20000,ERROR_TIMEOUT);return response;
}
inline controller_response controller_exchange(const deployment& fixed,controller_request request) {
  canonical_sid(fixed.release_verifier.sid);
  require(fixed.release_verifier.role==4&&fixed.release_verifier.pid&&fixed.release_verifier.created
    &&fixed.release_verifier.pid!=fixed.inspection.broker_pid&&wcscmp(fixed.release_verifier.sid,fixed.inspection.broker_sid)!=0,ERROR_ACCESS_DENIED);
  require(fixed.inspection.process_count>0&&fixed.inspection.process_count<=Q_MAX_TOKENS);
  for(uint32_t i=0;i<fixed.inspection.process_count;i++){
    const auto& actor=fixed.inspection.processes[i];canonical_sid(actor.sid);
    if(actor.role!=4)require(actor.pid!=fixed.release_verifier.pid&&wcscmp(actor.sid,fixed.release_verifier.sid)!=0,ERROR_ACCESS_DENIED);
  }
  require(nonzero(fixed.release_verifier.image)&&nonzero(fixed.release_verifier_token)&&nonzero(fixed.release_public_key)
    &&nonzero(fixed.runtime_closure)&&nonzero(fixed.persistence_contract),ERROR_ACCESS_DENIED);
  const auto response=controller_http<controller_request,controller_response>(fixed,request,L"/qualification/v1/launcher");
  validate_controller_reply(request,response);
  require(memcmp(response.persistence_contract,fixed.persistence_contract,32)==0,ERROR_ACCESS_DENIED);
  Q_REQUEST binding{};memcpy(binding.epoch,request.epoch,32);memcpy(binding.profile,request.profile,32);
  validate_release_binding(response.independently_observed,&request,sizeof(request),request.phase,fixed.release_verifier,fixed.release_verifier_token,fixed.runtime_closure,binding);
  verify_release_signature(response.independently_observed,fixed.release_public_key);return response;
}
}
