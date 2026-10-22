#pragma once
#include "windows.hpp"
#include <tuple>

namespace q {
inline void token_sid_bytes(std::vector<uint8_t>& out,PSID sid) {
  require(sid&&IsValidSid(sid));const DWORD bytes=GetLengthSid(sid);require(bytes>=8&&bytes<=68);append(out,&bytes,sizeof(bytes));append(out,sid,bytes);
}
inline std::array<uint8_t,32> token_profile(HANDLE token,bool primary=true) {
  std::vector<uint8_t> out;const auto before=token_info(token,TokenStatistics);const auto stats=reinterpret_cast<const TOKEN_STATISTICS*>(before.data());
  const auto user=token_info(token,TokenUser);token_sid_bytes(out,reinterpret_cast<const TOKEN_USER*>(user.data())->User.Sid);
  const auto owner=token_info(token,TokenOwner);token_sid_bytes(out,reinterpret_cast<const TOKEN_OWNER*>(owner.data())->Owner);
  const auto primaryGroup=token_info(token,TokenPrimaryGroup);token_sid_bytes(out,reinterpret_cast<const TOKEN_PRIMARY_GROUP*>(primaryGroup.data())->PrimaryGroup);
  for(const auto kind:{TokenGroups,TokenRestrictedSids}){
    const auto bytes=token_info(token,kind);const auto groups=reinterpret_cast<const TOKEN_GROUPS*>(bytes.data());require(groups->GroupCount<=Q_MAX_MEMBERS);
    std::vector<std::pair<std::vector<uint8_t>,DWORD>> ordered;
    for(DWORD i=0;i<groups->GroupCount;i++){std::vector<uint8_t> sid;token_sid_bytes(sid,groups->Groups[i].Sid);ordered.emplace_back(sid,groups->Groups[i].Attributes);}
    std::sort(ordered.begin(),ordered.end());append(out,&groups->GroupCount,sizeof(DWORD));
    for(size_t i=0;i<ordered.size();i++){
      if(i)require(ordered[i-1].first!=ordered[i].first);
      append(out,ordered[i].first.data(),ordered[i].first.size());append(out,&ordered[i].second,sizeof(DWORD));
    }
  }
  const auto privilegeBytes=token_info(token,TokenPrivileges);const auto privileges=reinterpret_cast<const TOKEN_PRIVILEGES*>(privilegeBytes.data());require(privileges->PrivilegeCount<=Q_MAX_PRIVILEGES);
  std::vector<Q_PRIVILEGE> ordered;
  for(DWORD i=0;i<privileges->PrivilegeCount;i++)ordered.push_back({privileges->Privileges[i].Luid.LowPart,privileges->Privileges[i].Luid.HighPart,privileges->Privileges[i].Attributes});
  std::sort(ordered.begin(),ordered.end(),[](const auto& a,const auto& b){return std::tie(a.high,a.low)<std::tie(b.high,b.low);});
  append(out,&privileges->PrivilegeCount,sizeof(DWORD));
  for(size_t i=0;i<ordered.size();i++){
    if(i)require(ordered[i-1].high!=ordered[i].high||ordered[i-1].low!=ordered[i].low);
    append(out,&ordered[i],sizeof(Q_PRIVILEGE));
  }
  const auto integrity=token_info(token,TokenIntegrityLevel);const auto label=reinterpret_cast<const TOKEN_MANDATORY_LABEL*>(integrity.data());
  token_sid_bytes(out,label->Label.Sid);append(out,&label->Label.Attributes,sizeof(DWORD));
  for(const auto kind:{TokenType,TokenSessionId,TokenElevationType,TokenElevation,TokenSandBoxInert,TokenHasRestrictions,
    TokenVirtualizationAllowed,TokenVirtualizationEnabled,TokenUIAccess,TokenMandatoryPolicy,TokenIsAppContainer}){
    const auto bytes=token_info(token,kind);require(bytes.size()==sizeof(DWORD));append(out,bytes.data(),bytes.size());
    if(kind==TokenType)require(*reinterpret_cast<const DWORD*>(bytes.data())==static_cast<DWORD>(primary?TokenPrimary:TokenImpersonation),ERROR_NOT_SUPPORTED);
    if(kind==TokenIsAppContainer)require(*reinterpret_cast<const DWORD*>(bytes.data())==0,ERROR_NOT_SUPPORTED);
  }
  if(!primary){const auto level=token_info(token,TokenImpersonationLevel);require(level.size()==sizeof(DWORD));append(out,level.data(),level.size());}
  const auto defaults=token_info(token,TokenDefaultDacl);const auto acl=reinterpret_cast<const TOKEN_DEFAULT_DACL*>(defaults.data())->DefaultDacl;
  DWORD aclSize=0;
  if(acl){require(IsValidAcl(acl)&&acl->AclSize<=Q_MAX_DESCRIPTOR);aclSize=acl->AclSize;
    for(DWORD i=0;i<acl->AceCount;i++){void* raw=nullptr;require(GetAce(acl,i,&raw));const auto ace=static_cast<const ACE_HEADER*>(raw);require(ace->AceType==ACCESS_ALLOWED_ACE_TYPE||ace->AceType==ACCESS_DENIED_ACE_TYPE,ERROR_NOT_SUPPORTED);}}
  append(out,&aclSize,sizeof(aclSize));if(aclSize)append(out,acl,aclSize);
  append(out,&stats->AuthenticationId,sizeof(LUID));
  const auto after=token_info(token,TokenStatistics);const auto final=reinterpret_cast<const TOKEN_STATISTICS*>(after.data());
  require(memcmp(&stats->TokenId,&final->TokenId,sizeof(LUID))==0&&memcmp(&stats->ModifiedId,&final->ModifiedId,sizeof(LUID))==0,ERROR_RETRY);
  return byte_hash(out.data(),out.size());
}
}
