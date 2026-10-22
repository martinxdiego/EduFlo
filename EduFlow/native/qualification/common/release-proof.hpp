#pragma once
#include "windows.hpp"
#include <span>

namespace q {
// Only the independent verifier possesses the signing key. The native broker
// accepts a preconfigured public key and never creates or signs real receipts.
struct release_proof_body {
  uint32_t version=1,size=sizeof(release_proof_body),phase=0,state=0;
  uint64_t verifier_pid=0,verifier_created=0,start_sequence=0,end_sequence=0,losses=0,unknowns=0;
  uint8_t request[32]{},epoch[32]{},profile[32]{},verifier_image[32]{},verifier_token[32]{};
  uint8_t runtime_closure[32]{},handle_lifetime[32]{},coverage[32]{};
};
struct release_proof { release_proof_body body;uint8_t signature[64]{}; };
static_assert(sizeof(release_proof_body)==320&&sizeof(release_proof)==384);
inline std::array<uint8_t,32> release_proof_digest(const release_proof_body& body) {
  constexpr char domain[]="EduFlow qualification independent user-mode release proof v1";
  std::vector<uint8_t> bytes;append(bytes,domain,sizeof(domain));append(bytes,&body,sizeof(body));return byte_hash(bytes.data(),bytes.size());
}
inline void verify_p256(const std::array<uint8_t,32>& digest,std::span<const uint8_t> signature,std::span<const uint8_t> publicKey) {
  require(signature.size()==64,ERROR_ACCESS_DENIED);
  require(publicKey.size()==sizeof(BCRYPT_ECCKEY_BLOB)+64,ERROR_ACCESS_DENIED);
  BCRYPT_ECCKEY_BLOB header{};memcpy(&header,publicKey.data(),sizeof(header));
  require(header.dwMagic==BCRYPT_ECDSA_PUBLIC_P256_MAGIC&&header.cbKey==32,ERROR_ACCESS_DENIED);
  BCRYPT_ALG_HANDLE algorithm=nullptr;require(BCryptOpenAlgorithmProvider(&algorithm,BCRYPT_ECDSA_P256_ALGORITHM,nullptr,0)>=0);
  struct close_algorithm{BCRYPT_ALG_HANDLE value;~close_algorithm(){BCryptCloseAlgorithmProvider(value,0);}} close{algorithm};
  BCRYPT_KEY_HANDLE key=nullptr;
  require(BCryptImportKeyPair(algorithm,nullptr,BCRYPT_ECCPUBLIC_BLOB,&key,const_cast<PUCHAR>(publicKey.data()),static_cast<ULONG>(publicKey.size()),0)>=0,ERROR_ACCESS_DENIED);
  struct close_key{BCRYPT_KEY_HANDLE value;~close_key(){BCryptDestroyKey(value);}} destroy{key};
  require(BCryptVerifySignature(key,nullptr,const_cast<PUCHAR>(digest.data()),32,const_cast<PUCHAR>(signature.data()),64,0)>=0,ERROR_ACCESS_DENIED);
}
inline void verify_release_signature(const release_proof& proof,std::span<const uint8_t> publicKey) {verify_p256(release_proof_digest(proof.body),proof.signature,publicKey);}
inline void validate_release_binding(const release_proof& proof,const void* request,size_t bytes,uint32_t phase,
  const Q_BOUND_PROCESS& verifier,const uint8_t (&verifierToken)[32],const uint8_t (&runtime)[32],const Q_REQUEST& binding) {
  const auto digest=byte_hash(request,bytes);const auto& b=proof.body;
  require(b.version==1&&b.size==sizeof(b)&&b.phase==phase&&phase>=1&&phase<=3&&b.state==phase
    &&b.verifier_pid==verifier.pid&&b.verifier_created==verifier.created&&b.verifier_pid&&b.verifier_created
    &&b.start_sequence&&b.end_sequence>=b.start_sequence&&!b.losses&&!b.unknowns
    &&memcmp(b.request,digest.data(),32)==0&&memcmp(b.epoch,binding.epoch,32)==0&&memcmp(b.profile,binding.profile,32)==0
    &&memcmp(b.verifier_image,verifier.image,32)==0&&memcmp(b.verifier_token,verifierToken,32)==0&&memcmp(b.runtime_closure,runtime,32)==0,ERROR_ACCESS_DENIED);
  for(auto value:{std::span<const uint8_t>(b.verifier_image),std::span<const uint8_t>(b.verifier_token),std::span<const uint8_t>(b.runtime_closure),std::span<const uint8_t>(b.handle_lifetime),std::span<const uint8_t>(b.coverage)})
    require(std::any_of(value.begin(),value.end(),[](uint8_t n){return n!=0;}),ERROR_ACCESS_DENIED);
}
}
