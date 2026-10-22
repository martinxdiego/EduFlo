#include "../protocol-tests/fixtures.hpp"
#include "../observer-service/stream.hpp"
#include "../common/ipc.hpp"
#include "../common/controller-rpc.hpp"
#include "../common/token-profile.hpp"
#include "../common/module-binding.hpp"
#include "../common/composite-access.hpp"
#include "../common/storage-profile.hpp"
#include "../broker/launcher.hpp"
#include "../cleanup/protocol.hpp"
#include <cstdio>
#include <functional>

int main(int argc,char** argv){
  using namespace q;size_t checks=0;
  try{
    if(argc==2&&strcmp(argv[1],"--exit-259-fixture")==0)return 259;
    auto fixture=synthetic_observation();
    if(argc==2&&strcmp(argv[1],"--fixture")==0){DWORD written=0;require(WriteFile(GetStdHandle(STD_OUTPUT_HANDLE),fixture.data(),static_cast<DWORD>(fixture.size()),&written,nullptr)&&written==fixture.size());return 0;}
    require(argc==1);require(validate_observation(fixture.data(),fixture.size()));checks++;
    for(size_t n=0;n<fixture.size();n++){bool rejected=false;try{validate_observation(fixture.data(),n);}catch(const error&){rejected=true;}require(rejected);checks++;}
    auto reject=[&](const std::vector<uint8_t>& bytes){bool rejected=false;try{validate_observation(bytes.data(),bytes.size());}catch(const error&){rejected=true;}require(rejected);checks++;};
    for(const size_t offset:{size_t(0),size_t(4),size_t(8),size_t(12),offsetof(Q_HEADER,object_count),offsetof(Q_HEADER,token_count),offsetof(Q_HEADER,payload_bytes),offsetof(Q_HEADER,fact_count)}){
      auto bytes=fixture;uint32_t value=UINT32_MAX;memcpy(bytes.data()+offset,&value,4);reject(bytes);
    }
    auto extra=fixture;extra.push_back(0);reject(extra);
    // Independent serialized composite-field attacks, including tuples whose
    // internal arithmetic is valid but whose source bindings are not.
    const size_t accessStart=fixture.size()-148;
    const std::array<uint32_t,18> invalidAccess{2,76,1,1,1,2,1,1,2,1,1,0x80000000,4096,4096,1,0,8,1};
    for(size_t field=0;field<invalidAccess.size();field++){
      auto bytes=fixture;for(const size_t base:{size_t(4),size_t(76)})memcpy(bytes.data()+accessStart+base+4*field,&invalidAccess[field],4);reject(bytes);
    }
    {auto bytes=fixture;for(const size_t base:{size_t(4),size_t(76)}){const uint32_t parent=0x40,yes=1,current=DELETE;
      memcpy(bytes.data()+accessStart+base+20,&parent,4);memcpy(bytes.data()+accessStart+base+24,&yes,4);memcpy(bytes.data()+accessStart+base+16,&current,4);}reject(bytes);}
    {auto bytes=fixture;const uint32_t value=1;memcpy(bytes.data()+accessStart+76+64,&value,4);reject(bytes);}
    // Native bridge validation without registry access, protected provisioning,
    // real peers or a privileged endpoint. These fixtures grant no provenance.
    auto rejects=[&](const std::function<void()>& operation){bool denied=false;try{operation();}catch(const error&){denied=true;}require(denied);checks++;};
    auto fixed=std::make_unique<deployment>();Q_HEADER header{};memcpy(&header,fixture.data(),sizeof(header));
    fixed->inspection.object_count=1;fixed->inspection.process_count=1;memcpy(fixed->collector.image,header.collector_image,32);
    auto token=std::make_unique<Q_TOKEN>();memcpy(token.get(),fixture.data()+sizeof(header),offsetof(Q_TOKEN,groups));
    auto& observedProcess=fixed->inspection.processes[0];observedProcess.role=token->role;observedProcess.pid=token->pid;observedProcess.tid=token->tid;observedProcess.created=token->process_created;memcpy(observedProcess.image,token->image,32);wcscpy_s(observedProcess.sid,token->user);
    Q_OBJECT object{};memcpy(&object,fixture.data()+sizeof(header)+offsetof(Q_TOKEN,groups),sizeof(object));
    fixed->inspection.objects[0].volume=object.volume;memcpy(fixed->inspection.objects[0].file_id,object.file_id,16);
    verify_reply(fixture,header.request,*fixed);checks++;
    for(unsigned index=0;index<9;index++){
      auto mutated=std::make_unique<deployment>(*fixed);
      switch(index){case 0:mutated->collector.image[0]^=1;break;case 1:mutated->inspection.processes[0].pid++;break;
        case 2:mutated->inspection.processes[0].tid++;break;case 3:mutated->inspection.processes[0].created++;break;
        case 4:mutated->inspection.processes[0].image[0]^=1;break;case 5:mutated->inspection.processes[0].sid[6]=L'9';break;
        case 6:mutated->inspection.objects[0].volume++;break;case 7:mutated->inspection.objects[0].file_id[0]^=1;break;
        case 8:mutated->inspection.processes[0].role++;break;}
      rejects([&]{verify_reply(fixture,header.request,*mutated);});
    }
    auto wrongChallenge=header.request;wrongChallenge.challenge[0]^=1;rejects([&]{verify_reply(fixture,wrongChallenge,*fixed);});
    {
      // Ephemeral unit-test signing key only. No real verifier identity, key
      // provisioning, private-key serialization, external service or lab run.
      BCRYPT_ALG_HANDLE algorithm=nullptr;require(BCryptOpenAlgorithmProvider(&algorithm,BCRYPT_ECDSA_P256_ALGORITHM,nullptr,0)>=0);
      struct algorithm_guard{BCRYPT_ALG_HANDLE value;~algorithm_guard(){BCryptCloseAlgorithmProvider(value,0);}} algorithmCleanup{algorithm};
      BCRYPT_KEY_HANDLE key=nullptr;require(BCryptGenerateKeyPair(algorithm,&key,256,0)>=0&&BCryptFinalizeKeyPair(key,0)>=0);
      struct key_guard{BCRYPT_KEY_HANDLE value;~key_guard(){BCryptDestroyKey(value);}} keyCleanup{key};
      std::array<uint8_t,72> publicKey{};ULONG bytes=0;require(BCryptExportKey(key,nullptr,BCRYPT_ECCPUBLIC_BLOB,publicKey.data(),static_cast<ULONG>(publicKey.size()),&bytes,0)>=0&&bytes==publicKey.size());
      release_proof proof{};auto& b=proof.body;b.phase=b.state=2;b.verifier_pid=7;b.verifier_created=8;b.start_sequence=1;b.end_sequence=9;
      Q_BOUND_PROCESS verifier{};verifier.pid=7;verifier.created=8;memset(verifier.image,3,32);
      uint8_t verifierToken[32]{},runtime[32]{};memset(verifierToken,4,32);memset(runtime,5,32);
      memcpy(b.verifier_image,verifier.image,32);memcpy(b.verifier_token,verifierToken,32);memcpy(b.runtime_closure,runtime,32);
      memcpy(b.epoch,header.request.epoch,32);memcpy(b.profile,header.request.profile,32);b.handle_lifetime[0]=b.coverage[0]=1;
      const auto requestDigest=byte_hash(&header.request,sizeof(header.request));memcpy(b.request,requestDigest.data(),32);
      const auto digest=release_proof_digest(b);require(BCryptSignHash(key,nullptr,const_cast<PUCHAR>(digest.data()),32,proof.signature,64,&bytes,0)>=0&&bytes==64);
      validate_release_binding(proof,&header.request,sizeof(header.request),2,verifier,verifierToken,runtime,header.request);verify_release_signature(proof,publicKey);checks++;
      for(size_t i=0;i<sizeof(proof);i++){auto forged=proof;reinterpret_cast<uint8_t*>(&forged)[i]^=1;rejects([&]{verify_release_signature(forged,publicKey);});}
      for(unsigned i=0;i<8;i++){
        auto forged=proof;switch(i){case 0:forged.body.losses=1;break;case 1:forged.body.unknowns=1;break;case 2:forged.body.verifier_created++;break;
          case 3:forged.body.runtime_closure[0]^=1;break;case 4:forged.body.state=1;break;case 5:forged.body.end_sequence=0;break;case 6:forged.body.profile[0]^=1;break;case 7:forged.body.request[0]^=1;break;}
        rejects([&]{validate_release_binding(forged,&header.request,sizeof(header.request),2,verifier,verifierToken,runtime,header.request);});
      }
      for(const uint32_t target:{1u,2u}){
        storage_profile storage{};storage.target_kind=target;storage.count=target==1?9:15;storage.volume=1;
        memcpy(storage.profile,header.request.profile,32);memcpy(storage.epoch,header.request.epoch,32);memcpy(storage.fixture,header.request.fixture,32);memcpy(storage.boot,header.request.boot,32);
        for(uint32_t i=0;i<storage.count;i++){
          auto& n=storage.nodes[i];n.kind=i+1;n.parent=i?0:UINT32_MAX;
          const bool local=n.kind==storage_volume||n.kind==storage_filesystem||n.kind==storage_cache||n.kind==storage_filters
            ||(target==1&&(n.kind==storage_device||n.kind==storage_firmware))||(target==2&&n.kind==storage_virtual_controller);
          n.source=local?local_query:(n.kind==storage_power_contract?storage_contract:host_verifier);
          memset(n.identity,1,32);memset(n.version,2,32);memset(n.configuration,3,32);memset(n.evidence,4,32);
        }
        validate_storage_profile(storage,header.request);checks++;
        const auto hash=storage_profile_digest(storage);require(BCryptSignHash(key,nullptr,const_cast<PUCHAR>(hash.data()),32,storage.signature,64,&bytes,0)>=0&&bytes==64);
        verify_storage_signature(storage,publicKey);checks++;
        for(size_t i=0;i<sizeof(storage);i++){auto forged=storage;reinterpret_cast<uint8_t*>(&forged)[i]^=1;rejects([&]{verify_storage_signature(forged,publicKey);});}
        for(uint32_t i=0;i<storage.count;i++)for(uint32_t field=0;field<6;field++){
          auto bad=storage;auto& n=bad.nodes[i];
          switch(field){case 0:n.source=99;break;case 1:n.parent=i;break;case 2:memset(n.identity,0,32);break;
            case 3:memset(n.version,0,32);break;case 4:memset(n.configuration,0,32);break;case 5:memset(n.evidence,0,32);break;}
          rejects([&]{validate_storage_profile(bad,header.request);});
        }
        for(unsigned i=0;i<9;i++){auto bad=storage;switch(i){case 0:bad.version++;break;case 1:bad.size--;break;case 2:bad.target_kind=3;break;
          case 3:bad.nodes[1].kind=storage_host;break;case 4:bad.count--;break;case 5:bad.nodes[bad.count].identity[0]=1;break;
          case 6:bad.fixture[0]^=1;break;case 7:bad.boot[0]^=1;break;case 8:bad.volume=0;break;}
          rejects([&]{validate_storage_profile(bad,header.request);});}
        Q_VOLUME_FACT local{};local.volume=1;local.bus=1;local.cache_type=local.cache_enabled=local.cache_changeable=local.write_through=1;
        memset(local.volume_name,5,32);memset(local.device_descriptor,6,32);memset(local.firmware,7,32);memset(local.extents,8,32);
        const std::array<uint8_t,4> filterCount{};
        auto anchor=[&](uint32_t kind,const uint8_t* identity){for(uint32_t i=0;i<storage.count;i++)if(storage.nodes[i].kind==kind)memcpy(storage.nodes[i].identity,identity,32);};
        anchor(storage_volume,local.volume_name);anchor(target==1?storage_device:storage_virtual_controller,local.device_descriptor);
        if(target==1)anchor(storage_firmware,local.firmware);
        anchor(storage_filesystem,byte_hash(&local.filesystem_flags,4).data());anchor(storage_cache,byte_hash(&local.cache_type,28).data());anchor(storage_filters,byte_hash(filterCount.data(),filterCount.size()).data());
        memcpy(storage.nodes[1].configuration,local.extents,32);verify_storage_local_anchors(storage,local,filterCount);checks++;
        for(unsigned i=0;i<8;i++){auto bad=local;switch(i){case 0:bad.volume++;break;case 1:bad.removable=1;break;case 2:bad.cache_enabled=0;break;
          case 3:bad.volume_name[0]^=1;break;case 4:bad.device_descriptor[0]^=1;break;case 5:bad.filesystem_flags++;break;case 6:bad.power_protection++;break;case 7:bad.extents[0]^=1;break;}
          rejects([&]{verify_storage_local_anchors(storage,bad,filterCount);});}
      }
      publicKey[0]^=1;rejects([&]{verify_release_signature(proof,publicKey);});
    }
    {
      require(mic_denials(4096,8192,1,1)==0x000d0156);checks++;
      require(mic_denials(4096,8192,0,7)==0);checks++;
      require(mic_denials(4096,8192,2,7)==0);checks++;
      require(mic_denials(8192,8192,1,7)==0);checks++;
      require(mic_denials(4096,8192,3,7)==0x000f01ff);checks++;
      rejects([&]{mic_denials(4096,8192,4,1);});rejects([&]{mic_denials(4096,8192,1,8);});
      PSECURITY_DESCRIPTOR childDescriptor=nullptr,parent=nullptr;
      require(ConvertStringSecurityDescriptorToSecurityDescriptorW(L"O:SYG:SYD:(D;;SD;;;WD)(A;;FA;;;WD)S:(ML;;NW;;;S-1-16-0)",SDDL_REVISION_1,&childDescriptor,nullptr));local_memory freeObject{childDescriptor};
      require(ConvertStringSecurityDescriptorToSecurityDescriptorW(L"O:SYG:SYD:(A;;0x40;;;WD)S:(ML;;NW;;;S-1-16-0)",SDDL_REVISION_1,&parent,nullptr));local_memory freeParent{parent};
      HANDLE raw=nullptr;require(OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY|TOKEN_DUPLICATE,&raw));handle primary(raw);
      require(DuplicateToken(primary,SecurityImpersonation,&raw));handle localToken(raw);
      const auto withParent=evaluate_composite_access(localToken,childDescriptor,parent,0),without=evaluate_composite_access(localToken,childDescriptor,nullptr,0);
      require(!(withParent.dac&DELETE)&&withParent.parent_delete_child&&(withParent.current&DELETE));checks++;
      require(!without.parent_delete_child&&!(without.current&DELETE));checks++;
      const auto special=evaluate_composite_access(localToken,childDescriptor,parent,FILE_ATTRIBUTE_REPARSE_POINT);require(special.unresolved&unsupported_object_policy);checks++;
      PSECURITY_DESCRIPTOR ownerRights=nullptr;require(ConvertStringSecurityDescriptorToSecurityDescriptorW(L"O:SYG:SYD:(A;;RC;;;S-1-3-4)",SDDL_REVISION_1,&ownerRights,nullptr));local_memory freeOwnerRights{ownerRights};
      require(access_descriptor(ownerRights).owner_rights);checks++;
      require(access_descriptor(ownerRights).integrity==8192);checks++;
      PACL acl=nullptr;BOOL present=FALSE,flag=FALSE;require(GetSecurityDescriptorDacl(ownerRights,&present,&acl,&flag));void* ace=nullptr;require(GetAce(acl,0,&ace));
      static_cast<ACE_HEADER*>(ace)->AceType=ACCESS_ALLOWED_CALLBACK_ACE_TYPE;rejects([&]{access_descriptor(ownerRights);});
    }
    {
      for(const uint8_t value:{uint8_t{0},uint8_t{1}}){std::vector<uint8_t> bytes{value,0,0,0};fixed_token_length(TokenHasRestrictions,bytes,1);checks++;}
      rejects([&]{fixed_token_length(TokenHasRestrictions,{2,0,0,0},1);});
      rejects([&]{fixed_token_length(TokenHasRestrictions,{1,1,0,0},1);});
      rejects([&]{fixed_token_length(TokenHasRestrictions,{1,0,0,0},2);});
      rejects([&]{fixed_token_length(TokenElevation,{1,0,0,0},1);});
      rejects([&]{fixed_token_length(TokenHasRestrictions,{1,0,0,0},0);});
    }
    {
      TOKEN_PRIVILEGES profile{};restricted_privileges(profile);checks++;
      profile.PrivilegeCount=1;require(LookupPrivilegeValueW(nullptr,SE_CHANGE_NOTIFY_NAME,&profile.Privileges[0].Luid));
      restricted_privileges(profile);checks++;
      profile.Privileges[0].Attributes=SE_PRIVILEGE_ENABLED;restricted_privileges(profile);checks++;
      for(const wchar_t* name:{SE_BACKUP_NAME,SE_RESTORE_NAME,SE_TAKE_OWNERSHIP_NAME,SE_DEBUG_NAME,SE_IMPERSONATE_NAME,SE_ASSIGNPRIMARYTOKEN_NAME,SE_TCB_NAME}){
        require(LookupPrivilegeValueW(nullptr,name,&profile.Privileges[0].Luid));
        for(const DWORD attributes:std::array<DWORD,2>{0,SE_PRIVILEGE_ENABLED}){
          profile.Privileges[0].Attributes=attributes;rejects([&]{restricted_privileges(profile);});
        }
      }
      profile.PrivilegeCount=Q_MAX_PRIVILEGES+1;rejects([&]{restricted_privileges(profile);});
    }
    {
      auto manifest=std::make_unique<deployment>();manifest->sealed_count=1;
      wcscpy_s(manifest->sealed[0].path,L"C:\\qualification\\fixed.dll");manifest->sealed[0].digest[0]=1;
      const wchar_t fixedModule[]=L"C:\\qualification\\fixed.dll";
      require(&sealed_module(*manifest,fixedModule)==&manifest->sealed[0]);checks++;
      const wchar_t unknown[]=L"C:\\qualification\\unlisted.dll";rejects([&]{sealed_module(*manifest,unknown);});
      manifest->sealed_count=2;manifest->sealed[1]=manifest->sealed[0];
      wcscpy_s(manifest->sealed[1].path,L"C:\\QUALIFICATION\\FIXED.DLL");rejects([&]{sealed_module(*manifest,fixedModule);});
      manifest->sealed_count=129;rejects([&]{sealed_module(*manifest,fixedModule);});
      manifest->sealed_count=0;rejects([&]{sealed_module(*manifest,fixedModule);});
      for(const unsigned mutation:{0u,1u,2u}){
        HANDLE r=nullptr,w=nullptr;require(CreatePipe(&r,&w,nullptr,0));handle input(r),output(w);
        auto receipt=header.request;if(mutation==1)receipt.challenge[0]^=1;
        const DWORD size=sizeof(receipt)-(mutation==2?1:0);DWORD written=0;
        require(WriteFile(output,&receipt,size,&written,nullptr)&&written==size);
        if(mutation)rejects([&]{await_receipt(input,&header.request,sizeof(header.request));});
        else {await_receipt(input,&header.request,sizeof(header.request));checks++;}
      }
    }
    {
      Q_HANDLE_FACT read{};read.handle=7;read.access=FILE_READ_ATTRIBUTES|READ_CONTROL|SYNCHRONIZE;
      const auto type=byte_hash(L"File",8);memcpy(read.type_name,type.data(),32);
      validate_inherited_file_policy(read,0,fixed->inspection);checks++;
      for(const DWORD access:std::array<DWORD,10>{FILE_WRITE_DATA,FILE_APPEND_DATA,FILE_WRITE_EA,FILE_WRITE_ATTRIBUTES,FILE_DELETE_CHILD,WRITE_DAC,WRITE_OWNER,DELETE,GENERIC_ALL,MAXIMUM_ALLOWED}){
        auto dangerous=read;dangerous.access|=access;rejects([&]{validate_inherited_file_policy(dangerous,0,fixed->inspection);});
      }
      for(uint32_t kind=1;kind<=6;kind++){auto dangerous=read;dangerous.kind=kind;rejects([&]{validate_inherited_file_policy(dangerous,0,fixed->inspection);});}
      for(unsigned i=0;i<5;i++){
        auto dangerous=read;switch(i){case 0:dangerous.target_pid=42;break;case 1:dangerous.target_created=1;break;
          case 2:dangerous.type_name[0]^=1;break;case 3:dangerous.attributes=1;break;case 4:dangerous.access=0;break;}
        rejects([&]{validate_inherited_file_policy(dangerous,0,fixed->inspection);});
      }
      rejects([&]{validate_inherited_file_policy(read,UINT32_MAX,fixed->inspection);});
      auto changed=read;changed.attributes=2;require(!same_handle_authority(read,changed));checks++;
      // Inspect this fixed test executable read-only. No protected fixture,
      // account, qualification actor or destructive primitive is exercised.
      std::array<wchar_t,Q_MAX_NAME> image{};require(GetModuleFileNameW(nullptr,image.data(),Q_MAX_NAME)>0);
      handle source(CreateFileW(image.data(),read.access,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr));require(source.value!=INVALID_HANDLE_VALUE);
      FILE_ID_INFO id{};require(GetFileInformationByHandleEx(source,FileIdInfo,&id,sizeof(id)));
      auto local=std::make_unique<Q_CONFIG>();local->object_count=1;local->objects[0].volume=id.VolumeSerialNumber;memcpy(local->objects[0].file_id,id.FileId.Identifier,16);
      HANDLE raw=nullptr;require(DuplicateHandle(GetCurrentProcess(),source,GetCurrentProcess(),&raw,0,TRUE,DUPLICATE_SAME_ACCESS));handle duplicate(raw);
      validate_inherited_duplicate(duplicate,read,0,*local);checks++;
      auto wrongAccess=read;wrongAccess.access=FILE_READ_ATTRIBUTES;rejects([&]{validate_inherited_duplicate(duplicate,wrongAccess,0,*local);});
      local->objects[0].file_id[0]^=1;rejects([&]{validate_inherited_duplicate(duplicate,read,0,*local);});local->objects[0].file_id[0]^=1;
      require(SetHandleInformation(duplicate,HANDLE_FLAG_INHERIT,0));rejects([&]{validate_inherited_duplicate(duplicate,read,0,*local);});
    }
    {
      auto policy=std::make_unique<deployment>();policy->inspection=fixed->inspection;
      memcpy(policy->inspection.profile,header.request.profile,32);memcpy(policy->inspection.epoch,header.request.epoch,32);
      memcpy(policy->inspection.fixture,header.request.fixture,32);memcpy(policy->inspection.boot,header.request.boot,32);
      launch_request start{};start.binding=header.request;start.binding.verb=2;start.role=5;start.ticket[0]=1;
      validate_launch_request(*policy,start);checks++;
      // Valid request reaches the incomplete-closure gate before any protected
      // bootstrap, external endpoint or child creation. No actual role launch.
      const DWORD previousLength=GetEnvironmentVariableW(L"NODE_ENV",nullptr,0);std::vector<wchar_t> previousEnvironment(previousLength);
      if(previousLength)require(GetEnvironmentVariableW(L"NODE_ENV",previousEnvironment.data(),previousLength)>0);
      require(SetEnvironmentVariableW(L"NODE_ENV",L"test"));
      bool closureBlocked=false;try{launch_fixed_role(*policy,start);}catch(const error& e){closureBlocked=e.code==ERROR_NOT_SUPPORTED;}
      require(SetEnvironmentVariableW(L"NODE_ENV",previousLength?previousEnvironment.data():nullptr));require(closureBlocked);checks++;
      for(unsigned n=0;n<12;n++){
        auto invalid=start;switch(n){case 0:invalid.role=1;break;case 1:invalid.role=4;break;case 2:invalid.role=7;break;case 3:invalid.ticket[0]=0;break;
          case 4:invalid.binding.epoch[0]^=1;break;case 5:invalid.binding.profile[0]^=1;break;case 6:invalid.binding.fixture[0]^=1;break;case 7:invalid.binding.boot[0]^=1;break;case 8:invalid.reserved=1;break;
          case 9:invalid.binding.magic=0;break;case 10:invalid.binding.verb=1;break;case 11:memset(invalid.binding.challenge,0,32);break;}
        rejects([&]{validate_launch_request(*policy,invalid);});
      }
      launch_outcome exited{};exited.request=start;exited.status=1;exited.role=5;exited.exit_code=259;exited.pid=2;exited.created=3;
      memcpy(exited.profile,start.binding.profile,32);memcpy(exited.ticket,start.ticket,32);exited.image[0]=exited.token[0]=exited.handles[0]=1;
      validate_launch_outcome(start,exited);checks++;
      for(unsigned n=0;n<10;n++){
        auto invalid=exited;switch(n){case 0:invalid.paid_authority=1;break;case 1:invalid.provider_calls=1;break;case 2:invalid.qualification_only=0;break;
          case 3:invalid.image[0]=0;break;case 4:invalid.token[0]=0;break;case 5:invalid.handles[0]=0;break;case 6:invalid.created=0;break;
          case 7:invalid.request.binding.challenge[0]^=1;break;case 8:invalid.request.ticket[0]^=1;break;case 9:invalid.role=4;break;}
        rejects([&]{validate_launch_outcome(start,invalid);});
      }
      rejects([&]{token_info(nullptr,TokenUser);});rejects([&]{handle_snapshot(nullptr);});
    }
    for(const wchar_t* sddl:{L"O:SYG:SYD:(A;;GA;;;SY)",L"O:BAG:BAD:(A;;GA;;;BA)(A;;GR;;;WD)"}){
      PSECURITY_DESCRIPTOR sd=nullptr;require(ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl,SDDL_REVISION_1,&sd,nullptr));local_memory release{sd};
      protected_descriptor(sd,SE_FILE_OBJECT);protected_descriptor(sd,SE_REGISTRY_KEY);checks+=2;
    }
    for(const wchar_t* sddl:{L"O:SYG:SYD:(A;;GW;;;WD)",L"O:SYG:SYD:(A;;WD;;;BU)",L"O:BUG:SYD:(A;;GA;;;SY)",L"O:SYG:SYD:NO_ACCESS_CONTROL"}){
      PSECURITY_DESCRIPTOR sd=nullptr;require(ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl,SDDL_REVISION_1,&sd,nullptr));local_memory release{sd};
      rejects([&]{protected_descriptor(sd,SE_FILE_OBJECT);});rejects([&]{protected_descriptor(sd,SE_REGISTRY_KEY);});
    }
    const wchar_t canonical[]=L"C:\\qualification\\sealed";require(canonical_local(canonical)==canonical);checks++;
    for(const wchar_t* value:{L"relative",L"\\\\server\\share",L"C:\\qualification\\..\\escape",L"C:\\qualification:stream",L"C:/qualification"}){
      std::array<wchar_t,Q_MAX_NAME> text{};wcscpy_s(text.data(),text.size(),value);rejects([&]{canonical_local(text);});
    }
    std::array<wchar_t,3> missingTerminator{L'C',L':',L'\\'};rejects([&]{canonical_local(missingTerminator);});
    const wchar_t validSid[]=L"S-1-5-18";canonical_sid(validSid);checks++;
    const wchar_t injectedSid[]=L"S-1-5-18)(A;;GA;;;WD";rejects([&]{canonical_sid(injectedSid);});
    {
      auto disposable=std::make_unique<deployment>();auto& policy=disposable->cleanup;auto& objects=disposable->inspection;
      objects.object_count=3;policy.count=2;policy.root_object=1;policy.volume.volume=1;policy.ticket[0]=1;policy.evidence[0]=1;
      wcscpy_s(objects.objects[0].path,L"C:\\");wcscpy_s(objects.objects[1].path,L"C:\\qualification-disposable-cleanup");wcscpy_s(objects.objects[2].path,L"C:\\qualification-disposable-cleanup\\fixed.synthetic");
      for(uint32_t i=0;i<3;i++){objects.objects[i].volume=1;objects.objects[i].file_id[0]=static_cast<uint8_t>(i+1);}
      policy.entries[0].object=2;policy.entries[0].parent=1;wcscpy_s(policy.entries[0].name,L"fixed.synthetic");
      policy.entries[1].object=1;policy.entries[1].parent=0;policy.entries[1].attributes=FILE_ATTRIBUTE_DIRECTORY;wcscpy_s(policy.entries[1].name,L"qualification-disposable-cleanup");
      require(validate_cleanup_plan(*disposable).selected.size()==2);checks++;
      for(unsigned n=0;n<13;n++){
        auto invalid=std::make_unique<deployment>(*disposable);
        switch(n){case 0:invalid->cleanup.count=129;break;case 1:invalid->cleanup.count=0;break;case 2:invalid->cleanup.root_object=0;break;
          case 3:invalid->cleanup.ticket[0]=0;break;case 4:invalid->cleanup.evidence[0]=0;break;case 5:invalid->cleanup.entries[0].parent=0;break;
          case 6:invalid->cleanup.entries[0].object=0;break;case 7:wcscpy_s(invalid->cleanup.entries[0].name,L"..\\escape");break;
          case 8:invalid->cleanup.entries[1].attributes|=FILE_ATTRIBUTE_REPARSE_POINT;break;case 9:invalid->cleanup.entries[0].attributes=FILE_ATTRIBUTE_HIDDEN;break;
          case 10:std::swap(invalid->cleanup.entries[0],invalid->cleanup.entries[1]);break;case 11:invalid->inspection.objects[2].volume=2;break;
          case 12:wcscpy_s(invalid->inspection.objects[1].path,L"C:\\tutor-paid-evaluation-v9-r1-r2-run-1-v1");break;}
        rejects([&]{validate_cleanup_plan(*invalid);});
      }
      cleanup_request request{};request.phase=cleanup_begin;request.pid=1;request.created=2;
      for(auto bytes:{std::span<uint8_t>(request.nonce),std::span<uint8_t>(request.fixture),std::span<uint8_t>(request.epoch),std::span<uint8_t>(request.profile),std::span<uint8_t>(request.boot),std::span<uint8_t>(request.ticket),std::span<uint8_t>(request.evidence),std::span<uint8_t>(request.manifest)})bytes[0]=1;
      cleanup_response reply{};reply.request=request;reply.decision=1;reply.journal_sequence=1;reply.journal_head[0]=1;reply.evidence_sealed=reply.consumption_persisted=reply.actors_quiescent=reply.handles_accounted=1;
      validate_cleanup_reply(request,reply);checks++;
      for(unsigned n=0;n<10;n++){
        auto invalid=reply;switch(n){case 0:invalid.evidence_sealed=0;break;case 1:invalid.consumption_persisted=0;break;case 2:invalid.actors_quiescent=0;break;
          case 3:invalid.handles_accounted=0;break;case 4:invalid.synthetic=1;break;case 5:invalid.request.nonce[0]^=1;break;case 6:invalid.request.manifest[0]^=1;break;
          case 7:invalid.request.evidence[0]^=1;break;case 8:invalid.journal_sequence=0;break;case 9:invalid.request.pid++;break;}
        rejects([&]{validate_cleanup_reply(request,invalid);});
      }
    }
    controller_request online{};online.phase=consume_launch;online.role=2;online.broker_pid=7;online.broker_created=8;
    for(auto bytes:{std::span<uint8_t>(online.nonce),std::span<uint8_t>(online.fixture),std::span<uint8_t>(online.epoch),std::span<uint8_t>(online.profile),std::span<uint8_t>(online.boot),std::span<uint8_t>(online.ticket)})std::fill(bytes.begin(),bytes.end(),uint8_t{1});
    controller_response accepted{};accepted.request=online;accepted.decision=1;accepted.journal_sequence=1;accepted.journal_head[0]=1;accepted.observer_epoch[0]=1;accepted.consumed=accepted.redeemed=accepted.observer_ready=1;
    accepted.persistence_contract[0]=accepted.durable_consumption[0]=1;
    validate_controller_reply(online,accepted);checks++;
    for(unsigned i=0;i<12;i++){
      auto invalid=accepted;
      switch(i){case 0:invalid.magic=0;break;case 1:invalid.version++;break;case 2:invalid.size++;break;case 3:invalid.decision=0;break;
        case 4:invalid.request.nonce[0]^=1;break;case 5:invalid.request.broker_created++;break;case 6:invalid.request.profile[0]^=1;break;
        case 7:invalid.journal_sequence=0;break;case 8:invalid.consumed=0;break;case 9:invalid.redeemed=0;break;case 10:invalid.observer_ready=0;break;case 11:invalid.synthetic=1;break;}
      rejects([&]{validate_controller_reply(online,invalid);});
    }
    // A nonprivileged, fixed helper exits with Windows' STILL_ACTIVE number.
    // This is a process-state unit fixture, not a qualified role/target launch.
    {
      std::array<wchar_t,Q_MAX_NAME> ownImage{};const auto imageLength=GetModuleFileNameW(nullptr,ownImage.data(),Q_MAX_NAME);require(imageLength&&imageLength<Q_MAX_NAME);
      std::wstring command=L"\""+std::wstring(ownImage.data())+L"\" --exit-259-fixture";
      STARTUPINFOW startup{};startup.cb=sizeof(startup);PROCESS_INFORMATION process{};
      require(CreateProcessW(ownImage.data(),command.data(),nullptr,nullptr,FALSE,CREATE_NO_WINDOW|CREATE_SUSPENDED,nullptr,nullptr,&startup,&process));
      handle child(process.hProcess),thread(process.hThread);
      struct end_child{HANDLE process;~end_child(){if(WaitForSingleObject(process,0)==WAIT_TIMEOUT){TerminateProcess(process,ERROR_PROCESS_ABORTED);WaitForSingleObject(process,5000);}}} cleanup{child};
      require(alive(child));checks++;
      HANDLE rawToken=nullptr;require(OpenProcessToken(child,TOKEN_QUERY,&rawToken));handle observedToken(rawToken);
      for(const auto kind:{TokenStatistics,TokenUser,TokenOwner,TokenPrimaryGroup,TokenGroups,TokenRestrictedSids,TokenPrivileges,TokenIntegrityLevel,TokenType,TokenSessionId,TokenElevationType,TokenElevation,TokenSandBoxInert,TokenHasRestrictions,TokenVirtualizationAllowed,TokenVirtualizationEnabled,TokenUIAccess,TokenMandatoryPolicy,TokenIsAppContainer,TokenDefaultDacl}){
        try{token_info(observedToken,kind);}catch(const error& e){DWORD buffer=0,length=0;const BOOL ok=GetTokenInformation(observedToken,kind,&buffer,sizeof(buffer),&length);
          std::fprintf(stderr,"token query class %u failed with %lu; direct success=%d length=%lu\n",static_cast<unsigned>(kind),e.code,ok,length);throw;}
      }
      const auto profile=token_profile(observedToken);verify_child_token(child,thread,profile);checks++;
      auto wrongProfile=profile;wrongProfile[0]^=1;rejects([&]{verify_child_token(child,thread,wrongProfile);});
      Q_BOUND_PROCESS incorrect{};incorrect.pid=process.dwProcessId;incorrect.created=created(child)+1;wcscpy_s(incorrect.sid,L"S-1-5-18");
      rejects([&]{bound_process(incorrect);}); // generation mismatch before any protected-path query
      require(ResumeThread(thread)==1&&WaitForSingleObject(child,5000)==WAIT_OBJECT_0);
      DWORD exit=0;require(GetExitCodeProcess(child,&exit)&&exit==259&&!alive(child));checks++;
    }
    auto event=[](){Q_EVENT e{};e.magic=Q_MAGIC;e.version=Q_VERSION;e.size=sizeof(e);e.epoch=1;e.sequence=1;e.operation=1;e.kind=Q_WRITE;e.phase=1;e.pid=2;e.tid=5;e.process_created=3;e.object_key=6;e.volume_key=4;return e;};
    auto health=[](){Q_HEALTH h{};h.magic=Q_MAGIC;h.version=Q_VERSION;h.size=sizeof(h);h.epoch=1;h.sequence=2;h.attachments=1;h.drained=1;return h;};
    auto rejects_stream=[&](const std::function<void(capture_stream&)>& operation){
      capture_stream s(1,{{2,3}},{4});bool denied=false;try{operation(s);}catch(const error&){denied=true;}require(denied);
      bool latched=false;try{s.etw_loss(0,0,0);s.finish(health());}catch(const error&){latched=true;}require(latched);checks++;
    };
    const std::vector<std::function<void(Q_EVENT&)>> mutations={
      [](auto& e){e.magic=0;},[](auto& e){e.version=1;},[](auto& e){e.size++;},[](auto& e){e.epoch=2;},
      [](auto& e){e.sequence=0;},[](auto& e){e.sequence=UINT64_MAX;},[](auto& e){e.sequence=2;},[](auto& e){e.operation=0;},
      [](auto& e){e.kind=8;},[](auto& e){e.phase=3;},[](auto& e){e.flags=1;},[](auto& e){e.pid=8;},
      [](auto& e){e.process_created=9;},[](auto& e){e.tid=0;},[](auto& e){e.object_key=0;},[](auto& e){e.volume_key=0;},
      [](auto& e){e.name_bytes=sizeof(e.name);},[](auto& e){e.destination_bytes=1;},[](auto& e){e.name[3]=L'x';},
      [](auto& e){e.destination[3]=L'x';},[](auto& e){e.status=5;}
    };
    for(const auto& mutate:mutations)rejects_stream([&](auto& s){auto e=event();mutate(e);s.event(e);});
    for(size_t size=0;size<sizeof(Q_EVENT);size++)rejects_stream([&](auto& s){auto e=event();s.record(&e,size);});
    rejects_stream([&](auto& s){auto e=event();s.record(&e,sizeof(e)+1);});
    rejects_stream([&](auto& s){s.record(nullptr,sizeof(Q_EVENT));});
    rejects_stream([&](auto& s){auto e=event();s.event(e);e.sequence++;s.event(e);}); // duplicate operation
    rejects_stream([&](auto& s){auto e=event();e.phase=2;s.event(e);}); // missing pre
    rejects_stream([&](auto& s){s.event(event());s.etw_loss(0,0,0);s.finish(health());}); // missing post
    rejects_stream([&](auto& s){auto e=event();s.event(e);e.phase=2;e.sequence=2;e.requested_bytes=1;s.event(e);});
    rejects_stream([&](auto& s){auto e=event();s.event(e);e.phase=2;e.sequence=2;e.destination[0]=L'x';e.destination_bytes=2;s.event(e);});
    rejects_stream([&](auto& s){s.disconnect();s.event(event());});
    for(unsigned i=0;i<3;i++)rejects_stream([&](auto& s){s.etw_loss(i==0?1:0,i==1?1:0,i==2?1:0);});
    auto pair=[&](auto& s){auto e=event();s.event(e);e.phase=2;e.sequence=2;s.event(e);};
    rejects_stream([&](auto& s){pair(s);s.finish(health());}); // missing ETW observation
    rejects_stream([&](auto& s){s.etw_loss(0,0,0);pair(s);s.finish(health());}); // stale zero-loss observation
    for(unsigned i=0;i<10;i++)rejects_stream([&](auto& s){pair(s);s.etw_loss(0,0,0);auto h=health();
      switch(i){case 0:h.drops=1;break;case 1:h.overflows=1;break;case 2:h.allocation_failures=1;break;case 3:h.disconnects=1;break;
        case 4:h.unloads=1;break;case 5:h.detachments=1;break;case 6:h.queued=1;break;case 7:h.pending=1;break;case 8:h.drained=2;break;case 9:h.epoch=2;break;}
      s.finish(h);
    });
    {capture_stream s(1,{{2,3}},{4});pair(s);s.etw_loss(0,0,0);require(s.finish(health()));checks++;
      bool replay=false;try{s.event(event());}catch(const error&){replay=true;}require(replay);checks++;}
    // Deterministic mutation fuzzing: acceptance is permitted only for valid
    // changed metadata, never a memory error or read beyond the supplied frame.
    uint32_t seed=0x51464932;
    for(size_t i=0;i<10000;i++){
      auto bytes=fixture;seed=1664525u*seed+1013904223u;size_t offset=seed%bytes.size();seed=1664525u*seed+1013904223u;bytes[offset]^=static_cast<uint8_t>((seed>>24)|1u);
      try{validate_observation(bytes.data(),bytes.size());}catch(const error&){}checks++;
    }
    std::printf("native security checks: %zu passed, 0 failed; wire truncations: %zu; event truncations: %zu; mutation fuzz iterations: 10000; real component lab NOT_PERFORMED\n",checks,fixture.size(),sizeof(Q_EVENT));return 0;
  }catch(const error& failure){std::fprintf(stderr,"native security check failed after %zu checks: code %lu, %s:%u\n",checks,failure.code,failure.file?failure.file:"unspecified",failure.line);return ERROR_INVALID_DATA;}
  catch(...){std::fprintf(stderr,"native security check failed after %zu checks\n",checks);return ERROR_INVALID_DATA;}
}
