#pragma once
#include "../common/windows.hpp"
#include <processsnapshot.h>
#include <winternl.h>
#include <winioctl.h>
#include <fltuser.h>
#include <set>
#pragma comment(lib,"fltlib.lib")

namespace q {
inline void fact(std::vector<uint8_t>& out,uint32_t kind,uint32_t index,const void* data,size_t size) {
  require(kind>=Q_FACT_RESOLUTION&&kind<=Q_FACT_COMPOSITE_ACCESS&&size<=Q_MAX_MESSAGE);
  Q_FACT header{kind,index,static_cast<uint32_t>(size),0};append(out,&header,sizeof(header));append(out,data,size);
}
inline std::wstring final_name(HANDLE file) {
  std::array<wchar_t,Q_MAX_NAME> name{};DWORD size=GetFinalPathNameByHandleW(file,name.data(),Q_MAX_NAME,FILE_NAME_NORMALIZED|VOLUME_NAME_GUID);
  require(size>0&&size<Q_MAX_NAME&&wcsncmp(name.data(),L"\\\\?\\Volume{",11)==0,ERROR_NOT_SUPPORTED);
  return std::wstring(name.data(),size);
}
inline std::vector<Q_HANDLE_FACT> handle_snapshot(HANDLE process,std::vector<handle>* retained=nullptr) {
  require(alive(process),ERROR_PROCESS_ABORTED);
  HPSS snapshot=nullptr; require(PssCaptureSnapshot(process,PSS_CAPTURE_HANDLES|PSS_CAPTURE_HANDLE_NAME_INFORMATION|
    PSS_CAPTURE_HANDLE_BASIC_INFORMATION|PSS_CAPTURE_HANDLE_TYPE_SPECIFIC_INFORMATION,0,&snapshot)==ERROR_SUCCESS);
  struct release { HANDLE process;HPSS snapshot;~release(){PssFreeSnapshot(process,snapshot);} } cleanup{process,snapshot};
  HPSSWALK marker=nullptr; require(PssWalkMarkerCreate(nullptr,&marker)==ERROR_SUCCESS);
  struct marker_release { HPSSWALK marker;~marker_release(){PssWalkMarkerFree(marker);} } walk{marker};
  PSS_HANDLE_INFORMATION info{};require(PssQuerySnapshot(snapshot,PSS_QUERY_HANDLE_INFORMATION,&info,sizeof(info))==ERROR_SUCCESS&&info.HandlesCaptured<=256,ERROR_NOT_SUPPORTED);
  std::vector<Q_HANDLE_FACT> handles;
  for(;;){
    PSS_HANDLE_ENTRY entry{};const DWORD status=PssWalkSnapshot(snapshot,PSS_WALK_HANDLES,marker,&entry,sizeof(entry));
    if(status==ERROR_NO_MORE_ITEMS)break;
    require(status==ERROR_SUCCESS&&handles.size()<256);
    require((entry.Flags&PSS_HANDLE_HAVE_BASIC_INFORMATION)&&(entry.Flags&PSS_HANDLE_HAVE_TYPE));
    require(entry.TypeName&&entry.TypeNameLength>0&&entry.TypeNameLength<=512&&entry.TypeNameLength%2==0);
    require(entry.ObjectNameLength<=2048&&entry.ObjectNameLength%2==0&&(!entry.ObjectNameLength||entry.ObjectName));
    Q_HANDLE_FACT value{};value.handle=reinterpret_cast<uint64_t>(entry.Handle);value.attributes=entry.Attributes;
    // PSS GrantedAccess is reserved in the published structure contract. Query
    // the documented object-basic record on a same-access duplicate instead.
    HANDLE rawDuplicate=nullptr;require(DuplicateHandle(process,entry.Handle,GetCurrentProcess(),&rawDuplicate,0,FALSE,DUPLICATE_SAME_ACCESS));handle duplicate(rawDuplicate);
    using query_object=NTSTATUS(NTAPI*)(HANDLE,OBJECT_INFORMATION_CLASS,PVOID,ULONG,PULONG);
    auto query=reinterpret_cast<query_object>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"),"NtQueryObject"));require(query!=nullptr);
    PUBLIC_OBJECT_BASIC_INFORMATION basic{};ULONG returned=0;require(query(duplicate,ObjectBasicInformation,&basic,sizeof(basic),&returned)>=0&&returned==sizeof(basic));
    value.access=basic.GrantedAccess;
    value.kind=entry.ObjectType;auto type=byte_hash(entry.TypeName,entry.TypeNameLength);memcpy(value.type_name,type.data(),32);
    auto name=byte_hash(entry.ObjectName,entry.ObjectNameLength);memcpy(value.object_name,name.data(),32);
    if(entry.ObjectType==PSS_OBJECT_TYPE_PROCESS||entry.ObjectType==PSS_OBJECT_TYPE_THREAD){
      require(entry.Flags&PSS_HANDLE_HAVE_TYPE_SPECIFIC_INFORMATION);
      value.target_pid=entry.ObjectType==PSS_OBJECT_TYPE_PROCESS?entry.TypeSpecificInformation.Process.ProcessId:entry.TypeSpecificInformation.Thread.ProcessId;
      handle target(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION|SYNCHRONIZE,FALSE,value.target_pid));require(target.value&&alive(target));value.target_created=created(target);
      if(entry.ObjectType==PSS_OBJECT_TYPE_PROCESS)
        require(GetProcessId(duplicate)==value.target_pid&&alive(duplicate)&&created(duplicate)==value.target_created,ERROR_RETRY);
      else require(GetProcessIdOfThread(duplicate)==value.target_pid&&GetThreadId(duplicate)==entry.TypeSpecificInformation.Thread.ThreadId,ERROR_RETRY);
    }
    handles.push_back(value);
    if(retained)retained->push_back(std::move(duplicate));
  }
  require(handles.size()==info.HandlesCaptured&&alive(process));
  // PSS order is not a contract. Sort records and their retained object pins together.
  if(retained){
    require(retained->size()==handles.size());std::vector<size_t> order(handles.size());
    for(size_t i=0;i<order.size();i++)order[i]=i;
    std::sort(order.begin(),order.end(),[&](size_t a,size_t b){return handles[a].handle<handles[b].handle;});
    std::vector<Q_HANDLE_FACT> sorted;std::vector<handle> pins;
    for(const auto index:order){sorted.push_back(handles[index]);pins.push_back(std::move((*retained)[index]));}
    handles=std::move(sorted);*retained=std::move(pins);
  }else std::sort(handles.begin(),handles.end(),[](const auto& a,const auto& b){return a.handle<b.handle;});
  for(size_t i=1;i<handles.size();i++)require(handles[i-1].handle!=handles[i].handle);
  return handles;
}
inline std::vector<Q_HANDLE_FACT> stable_handles(HANDLE process) {
  std::vector<handle> firstPins,secondPins;
  const auto before=created(process);auto a=handle_snapshot(process,&firstPins),b=handle_snapshot(process,&secondPins);
  require(created(process)==before&&a.size()==b.size()&&(a.empty()||memcmp(a.data(),b.data(),a.size()*sizeof(Q_HANDLE_FACT))==0),ERROR_RETRY);
  using compare_objects=BOOL(WINAPI*)(HANDLE,HANDLE);
  const auto compare=reinterpret_cast<compare_objects>(GetProcAddress(GetModuleHandleW(L"kernelbase.dll"),"CompareObjectHandles"));
  require(compare!=nullptr,ERROR_NOT_SUPPORTED);
  for(size_t i=0;i<a.size();i++)require(compare(firstPins[i],secondPins[i]),ERROR_RETRY);
  // Pins close before returning. This is a bounded point observation, not a
  // proof of continuous handle coverage or of authority after the last sample.
  return a;
}
inline std::vector<uint8_t> storage_property(HANDLE volume,STORAGE_PROPERTY_ID id,size_t minimum) {
  STORAGE_PROPERTY_QUERY query{};query.PropertyId=id;query.QueryType=PropertyStandardQuery;
  STORAGE_DESCRIPTOR_HEADER header{};DWORD returned=0;
  require(DeviceIoControl(volume,IOCTL_STORAGE_QUERY_PROPERTY,&query,sizeof(query),&header,sizeof(header),&returned,nullptr));
  require(returned==sizeof(header)&&header.Size>=minimum&&header.Size<=65536);
  std::vector<uint8_t> bytes(header.Size);require(DeviceIoControl(volume,IOCTL_STORAGE_QUERY_PROPERTY,&query,sizeof(query),bytes.data(),header.Size,&returned,nullptr));
  require(returned==header.Size);return bytes;
}
inline Q_VOLUME_FACT volume_facts(HANDLE file) {
  Q_VOLUME_FACT result{};FILE_ID_INFO id{};require(GetFileInformationByHandleEx(file,FileIdInfo,&id,sizeof(id)));result.volume=id.VolumeSerialNumber;
  auto name=final_name(file);const auto end=name.find(L"}\\");require(end!=std::wstring::npos);name.resize(end+2);
  wchar_t fs[64]{};DWORD serial=0,maxName=0,flags=0;require(GetVolumeInformationW(name.c_str(),nullptr,0,&serial,&maxName,&flags,fs,64));result.filesystem_flags=flags;
  require(wcscmp(fs,L"NTFS")==0&&GetDriveTypeW(name.c_str())==DRIVE_FIXED,ERROR_NOT_SUPPORTED);
  auto volumeName=byte_hash(name.data(),name.size()*2);memcpy(result.volume_name,volumeName.data(),32);name.pop_back();
  handle volume(CreateFileW(name.c_str(),GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr));require(volume.value!=INVALID_HANDLE_VALUE);
  STORAGE_DEVICE_NUMBER number{};DWORD returned=0;require(DeviceIoControl(volume,IOCTL_STORAGE_GET_DEVICE_NUMBER,nullptr,0,&number,sizeof(number),&returned,nullptr)&&returned==sizeof(number));
  result.device_type=number.DeviceType;result.device_number=number.DeviceNumber;result.partition=number.PartitionNumber;
  auto descriptor=storage_property(volume,StorageDeviceProperty,sizeof(STORAGE_DEVICE_DESCRIPTOR));const auto d=reinterpret_cast<const STORAGE_DEVICE_DESCRIPTOR*>(descriptor.data());
  require(d->Size==descriptor.size()&&d->RawPropertiesLength<=descriptor.size()-offsetof(STORAGE_DEVICE_DESCRIPTOR,RawDeviceProperties));
  result.bus=d->BusType;result.removable=d->RemovableMedia?1:0;require(!result.removable&&result.bus>BusTypeUnknown&&result.bus<BusTypeMax,ERROR_NOT_SUPPORTED);
  auto descriptorHash=byte_hash(descriptor.data(),descriptor.size());memcpy(result.device_descriptor,descriptorHash.data(),32);
  require(d->ProductRevisionOffset>0&&d->ProductRevisionOffset<descriptor.size());const char* revision=reinterpret_cast<const char*>(descriptor.data()+d->ProductRevisionOffset);
  const size_t bound=std::min<size_t>(256,descriptor.size()-d->ProductRevisionOffset);const void* terminator=memchr(revision,0,bound);require(terminator!=nullptr);
  require(terminator!=revision,ERROR_NOT_SUPPORTED);
  auto firmware=byte_hash(revision,static_cast<const char*>(terminator)-revision);memcpy(result.firmware,firmware.data(),32);
  auto cacheBytes=storage_property(volume,StorageDeviceWriteCacheProperty,sizeof(STORAGE_WRITE_CACHE_PROPERTY));auto c=reinterpret_cast<const STORAGE_WRITE_CACHE_PROPERTY*>(cacheBytes.data());
  require(c->Size==sizeof(*c)&&c->Version==sizeof(*c)
    &&c->WriteCacheType>=WriteCacheTypeNone&&c->WriteCacheType<=WriteCacheTypeWriteThrough
    &&c->WriteCacheEnabled>=WriteCacheDisabled&&c->WriteCacheEnabled<=WriteCacheEnabled
    &&c->WriteCacheChangeable>=WriteCacheNotChangeable&&c->WriteCacheChangeable<=WriteCacheChangeable
    &&c->WriteThroughSupported>=WriteThroughNotSupported&&c->WriteThroughSupported<=WriteThroughSupported
    &&c->FlushCacheSupported<=1&&c->UserDefinedPowerProtection<=1&&c->NVCacheEnabled<=1,ERROR_NOT_SUPPORTED);
  result.cache_type=c->WriteCacheType;result.cache_enabled=c->WriteCacheEnabled;result.cache_changeable=c->WriteCacheChangeable;result.write_through=c->WriteThroughSupported;
  result.flush_supported=c->FlushCacheSupported;result.power_protection=c->UserDefinedPowerProtection;result.nv_cache=c->NVCacheEnabled;
  std::array<uint8_t,4096> extents{};require(DeviceIoControl(volume,IOCTL_VOLUME_GET_VOLUME_DISK_EXTENTS,nullptr,0,extents.data(),static_cast<DWORD>(extents.size()),&returned,nullptr));
  require(returned>=offsetof(VOLUME_DISK_EXTENTS,Extents));const auto e=reinterpret_cast<const VOLUME_DISK_EXTENTS*>(extents.data());
  require(e->NumberOfDiskExtents>0&&e->NumberOfDiskExtents<=32&&returned==offsetof(VOLUME_DISK_EXTENTS,Extents)+e->NumberOfDiskExtents*sizeof(DISK_EXTENT));
  for(DWORD i=0;i<e->NumberOfDiskExtents;i++){
    const auto& extent=e->Extents[i];require(extent.StartingOffset.QuadPart>=0&&extent.ExtentLength.QuadPart>0
      &&extent.StartingOffset.QuadPart<=INT64_MAX-extent.ExtentLength.QuadPart,ERROR_NOT_SUPPORTED);
    for(DWORD j=0;j<i;j++)if(e->Extents[j].DiskNumber==extent.DiskNumber){const auto& other=e->Extents[j];
      require(extent.StartingOffset.QuadPart>=other.StartingOffset.QuadPart+other.ExtentLength.QuadPart
        ||other.StartingOffset.QuadPart>=extent.StartingOffset.QuadPart+extent.ExtentLength.QuadPart,ERROR_NOT_SUPPORTED);}
  }
  auto extentHash=byte_hash(extents.data(),returned);memcpy(result.extents,extentHash.data(),32);return result;
}
inline std::vector<uint8_t> filter_facts(HANDLE file) {
  auto volume=final_name(file);volume.resize(volume.find(L"}\\")+2);
  std::array<uint8_t,65536> buffer{};DWORD returned=0;HANDLE find=INVALID_HANDLE_VALUE;
  HRESULT status=FilterVolumeInstanceFindFirst(volume.c_str(),InstanceAggregateStandardInformation,buffer.data(),static_cast<DWORD>(buffer.size()),&returned,&find);
  require(SUCCEEDED(status));struct close_find{HANDLE value;~close_find(){FilterVolumeInstanceFindClose(value);}} cleanup{find};
  std::vector<std::array<uint8_t,32>> records;
  while(SUCCEEDED(status)){
    require(returned>0&&returned<=buffer.size()&&records.size()<32);records.push_back(byte_hash(buffer.data(),returned));
    buffer.fill(0);status=FilterVolumeInstanceFindNext(find,InstanceAggregateStandardInformation,buffer.data(),static_cast<DWORD>(buffer.size()),&returned);
  }
  require(status==HRESULT_FROM_WIN32(ERROR_NO_MORE_ITEMS));std::sort(records.begin(),records.end());
  std::vector<uint8_t> result;uint32_t count=static_cast<uint32_t>(records.size());append(result,&count,4);for(const auto& item:records)append(result,item.data(),32);return result;
}
}
