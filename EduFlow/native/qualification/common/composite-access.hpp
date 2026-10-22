#pragma once
#include "windows.hpp"

namespace q {
// A bounded native upper-bound assessment. A nonzero unresolved field blocks
// acceptance; a grant mask never proves the absence of retained-handle power.
enum access_uncertainty:uint32_t { unknown_privilege=1,unsupported_token_policy=2,unsupported_object_policy=4 };
using composite_access=Q_COMPOSITE_ACCESS;
static_assert(sizeof(composite_access)==72);
inline DWORD integrity_rid(PSID sid) {
  require(sid&&IsValidSid(sid)&&*GetSidSubAuthorityCount(sid)==1,ERROR_NOT_SUPPORTED);
  const SID_IDENTIFIER_AUTHORITY authority=SECURITY_MANDATORY_LABEL_AUTHORITY;
  require(memcmp(GetSidIdentifierAuthority(sid),&authority,sizeof(authority))==0,ERROR_NOT_SUPPORTED);
  return *GetSidSubAuthority(sid,0);
}
struct object_security { PSID owner=nullptr;bool owner_rights=false,label_present=false;DWORD integrity=SECURITY_MANDATORY_MEDIUM_RID,policy=SYSTEM_MANDATORY_LABEL_NO_WRITE_UP; };
inline object_security access_descriptor(PSECURITY_DESCRIPTOR sd) {
  require(sd&&IsValidSecurityDescriptor(sd));object_security value{};BOOL flag=FALSE,present=FALSE;PACL dacl=nullptr,sacl=nullptr;
  require(GetSecurityDescriptorOwner(sd,&value.owner,&flag)&&value.owner&&GetSecurityDescriptorDacl(sd,&present,&dacl,&flag)&&present&&dacl&&IsValidAcl(dacl));
  for(DWORD i=0;i<dacl->AceCount;i++){
    void* raw=nullptr;require(GetAce(dacl,i,&raw));const auto header=static_cast<ACE_HEADER*>(raw);
    require((header->AceType==ACCESS_ALLOWED_ACE_TYPE||header->AceType==ACCESS_DENIED_ACE_TYPE)&&!(header->AceFlags&~VALID_INHERIT_FLAGS),ERROR_NOT_SUPPORTED);
    const auto ace=static_cast<ACCESS_ALLOWED_ACE*>(raw);
    if(!(header->AceFlags&INHERIT_ONLY_ACE)&&IsWellKnownSid(&ace->SidStart,WinCreatorOwnerRightsSid))value.owner_rights=true;
  }
  require(GetSecurityDescriptorSacl(sd,&present,&sacl,&flag));
  if(present&&sacl){require(IsValidAcl(sacl));bool found=false;
    for(DWORD i=0;i<sacl->AceCount;i++){
      void* raw=nullptr;require(GetAce(sacl,i,&raw));const auto ace=static_cast<SYSTEM_MANDATORY_LABEL_ACE*>(raw);
      require(ace->Header.AceType==SYSTEM_MANDATORY_LABEL_ACE_TYPE&&!(ace->Header.AceFlags&~VALID_INHERIT_FLAGS),ERROR_NOT_SUPPORTED);
      if(ace->Header.AceFlags&INHERIT_ONLY_ACE)continue;
      require(!found&&!(ace->Mask&~SYSTEM_MANDATORY_LABEL_VALID_MASK),ERROR_NOT_SUPPORTED);found=true;value.label_present=true;
      value.integrity=integrity_rid(const_cast<DWORD*>(&ace->SidStart));value.policy=ace->Mask;
    }
  }
  return value;
}
inline DWORD mic_denials(DWORD tokenLevel,DWORD objectLevel,DWORD tokenPolicy,DWORD objectPolicy) {
  require(!(tokenPolicy&~TOKEN_MANDATORY_POLICY_VALID_MASK)&&!(objectPolicy&~SYSTEM_MANDATORY_LABEL_VALID_MASK),ERROR_NOT_SUPPORTED);
  if(tokenLevel>=objectLevel||!(tokenPolicy&TOKEN_MANDATORY_POLICY_NO_WRITE_UP))return 0;
  constexpr DWORD write=FILE_WRITE_DATA|FILE_APPEND_DATA|FILE_WRITE_EA|FILE_WRITE_ATTRIBUTES|FILE_DELETE_CHILD|DELETE|WRITE_DAC|WRITE_OWNER;
  constexpr DWORD read=FILE_READ_DATA|FILE_READ_EA|FILE_READ_ATTRIBUTES|READ_CONTROL;
  DWORD denied=0;
  if((tokenPolicy&TOKEN_MANDATORY_POLICY_NO_WRITE_UP)||(objectPolicy&SYSTEM_MANDATORY_LABEL_NO_WRITE_UP))denied|=write;
  if(objectPolicy&SYSTEM_MANDATORY_LABEL_NO_READ_UP)denied|=read;
  if(objectPolicy&SYSTEM_MANDATORY_LABEL_NO_EXECUTE_UP)denied|=FILE_EXECUTE;
  return denied;
}
inline DWORD dac_access(HANDLE token,PSECURITY_DESCRIPTOR descriptor) {
  GENERIC_MAPPING mapping{FILE_GENERIC_READ,FILE_GENERIC_WRITE,FILE_GENERIC_EXECUTE,FILE_ALL_ACCESS};
  std::array<uint8_t,4096> privileges{};DWORD bytes=static_cast<DWORD>(privileges.size()),granted=0;BOOL allowed=FALSE;
  require(AccessCheck(descriptor,token,MAXIMUM_ALLOWED,&mapping,reinterpret_cast<PRIVILEGE_SET*>(privileges.data()),&bytes,&granted,&allowed));
  require(bytes<=privileges.size()&&!(granted&~(FILE_ALL_ACCESS|ACCESS_SYSTEM_SECURITY)));return allowed?granted:0;
}
inline void privilege_access(HANDLE token,composite_access& value) {
  const auto bytes=token_info(token,TokenPrivileges);const auto privileges=reinterpret_cast<const TOKEN_PRIVILEGES*>(bytes.data());
  require(privileges->PrivilegeCount<=Q_MAX_PRIVILEGES);
  struct privilege { const wchar_t* name;DWORD mask; };
  const std::array<privilege,5> known{{{SE_CHANGE_NOTIFY_NAME,0},{SE_INC_WORKING_SET_NAME,0},
    {SE_BACKUP_NAME,FILE_GENERIC_READ|ACCESS_SYSTEM_SECURITY},{SE_RESTORE_NAME,FILE_GENERIC_WRITE|WRITE_DAC|WRITE_OWNER|DELETE|ACCESS_SYSTEM_SECURITY},{SE_TAKE_OWNERSHIP_NAME,WRITE_OWNER}}};
  std::array<LUID,5> ids{};for(size_t i=0;i<known.size();i++)require(LookupPrivilegeValueW(nullptr,known[i].name,&ids[i]));
  for(DWORD n=0;n<privileges->PrivilegeCount;n++){
    const auto& p=privileges->Privileges[n];require(!(p.Attributes&~(SE_PRIVILEGE_ENABLED_BY_DEFAULT|SE_PRIVILEGE_ENABLED|SE_PRIVILEGE_REMOVED|SE_PRIVILEGE_USED_FOR_ACCESS)),ERROR_NOT_SUPPORTED);
    if(p.Attributes&SE_PRIVILEGE_REMOVED)continue;
    size_t i=0;for(;i<ids.size();i++)if(memcmp(&p.Luid,&ids[i],sizeof(LUID))==0)break;
    if(i==ids.size()){value.unresolved|=unknown_privilege;continue;}
    value.privilege_potential|=known[i].mask;
    if(p.Attributes&SE_PRIVILEGE_ENABLED)value.privilege_current|=known[i].mask;
  }
}
inline composite_access evaluate_composite_access(HANDLE token,PSECURITY_DESCRIPTOR sd,PSECURITY_DESCRIPTOR parent,DWORD attributes) {
  composite_access result{};result.version=1;result.size=sizeof(result);const auto object=access_descriptor(sd);object_security parentObject{};if(parent)parentObject=access_descriptor(parent);
  const auto tokenLabel=token_info(token,TokenIntegrityLevel);result.token_integrity=integrity_rid(reinterpret_cast<const TOKEN_MANDATORY_LABEL*>(tokenLabel.data())->Label.Sid);
  const auto mandatory=token_info(token,TokenMandatoryPolicy);memcpy(&result.token_policy,mandatory.data(),4);
  result.object_integrity=object.integrity;result.object_policy=object.policy;result.owner_rights_ace=object.owner_rights?1:0;
  BOOL member=FALSE;require(CheckTokenMembership(token,object.owner,&member));result.owner_member=member?1:0;
  result.dac=dac_access(token,sd);result.mic_denied=mic_denials(result.token_integrity,object.integrity,result.token_policy,object.policy);
  result.current=result.dac&~result.mic_denied;privilege_access(token,result);
  // Backup-intent and enableable privilege routes are explicit potential power,
  // not silently added to ordinary-open current access or removed by the DACL.
  if(parent){result.parent_current=dac_access(token,parent)&~mic_denials(result.token_integrity,parentObject.integrity,result.token_policy,parentObject.policy);
    result.parent_delete_child=(result.parent_current&FILE_DELETE_CHILD)?1:0;
    result.parent_read_attributes=(result.parent_current&FILE_LIST_DIRECTORY)?1:0;
    if(result.parent_delete_child)result.current|=DELETE;
    if(result.parent_read_attributes)result.current|=FILE_READ_ATTRIBUTES;
  }
  // This is access authority, not a promise an I/O succeeds: sharing, read-only
  // media and special filesystem semantics need separately verified facts.
  if(attributes&(FILE_ATTRIBUTE_REPARSE_POINT|FILE_ATTRIBUTE_ENCRYPTED|FILE_ATTRIBUTE_OFFLINE))result.unresolved|=unsupported_object_policy;
  for(const auto kind:{TokenUIAccess,TokenVirtualizationEnabled,TokenIsAppContainer}){const auto bytes=token_info(token,kind);DWORD flag=0;memcpy(&flag,bytes.data(),4);if(flag)result.unresolved|=unsupported_token_policy;}
  return result;
}
}
