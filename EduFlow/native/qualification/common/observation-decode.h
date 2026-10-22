#pragma once
#include "observation-protocol.h"
#include <stddef.h>
// Bounds-checked decoders shared by the kernel and deterministic user-mode
// tests. Input must already be a safely readable, stable private copy. No OS
// pointer/handle from a subject buffer is dereferenced by these functions.
static inline uint16_t QBRead16(const uint8_t* p){return (uint16_t)(p[0]|((uint16_t)p[1]<<8));}
static inline uint32_t QBRead32(const uint8_t* p){return (uint32_t)p[0]|((uint32_t)p[1]<<8)|((uint32_t)p[2]<<16)|((uint32_t)p[3]<<24);}
static inline uint64_t QBRead64(const uint8_t* p){return (uint64_t)QBRead32(p)|((uint64_t)QBRead32(p+4)<<32);}
static inline int QBText(const uint8_t* p,size_t bytes){
  size_t i;if(bytes&1)return 0;
  for(i=0;i<bytes;i+=2){uint16_t c=QBRead16(p+i);if(!c)return 0;
    if(c>=0xd800&&c<=0xdbff){i+=2;if(i>=bytes)return 0;c=QBRead16(p+i);if(c<0xdc00||c>0xdfff)return 0;}
    else if(c>=0xdc00&&c<=0xdfff)return 0;}
  return 1;
}
static inline int QBRenameClass(uint32_t c){return c==10||c==56||c==65||c==66;}
static inline int QBLinkClass(uint32_t c){return c==11||c==57||c==72||c==73;}
static inline int QBExtendedNameClass(uint32_t c){return c==65||c==66||c==72||c==73;}
static inline int QBNameFlags(uint32_t c,uint32_t flags){
  if(!QBRenameClass(c)&&!QBLinkClass(c))return 0;
  if(!QBExtendedNameClass(c))return flags<=1;
  // All documented Windows 10/11 rename/link flags through 0x100. Unknown
  // future semantics are rejected; parsing a known flag is not an access proof.
  return (flags&~0x1ffu)==0;
}
typedef struct QB_NAME_INPUT {uint64_t root;uint32_t flags,name_bytes,name_offset;} QB_NAME_INPUT;
static inline int QBDecodeName(uint32_t c,const void* data,size_t bytes,uint32_t pointer_bytes,QB_NAME_INPUT* out){
  const uint8_t* p=(const uint8_t*)data;size_t root_offset,length_offset,name_offset;uint32_t length,flags;
  if(!p||!out||(!QBRenameClass(c)&&!QBLinkClass(c))||(pointer_bytes!=4&&pointer_bytes!=8))return 0;
  root_offset=pointer_bytes;length_offset=root_offset+pointer_bytes;name_offset=length_offset+4;
  if(bytes<name_offset)return 0;length=QBRead32(p+length_offset);
  if(!length||length>=QB_NAME*2||length!=bytes-name_offset||!QBText(p+name_offset,length))return 0;
  flags=QBExtendedNameClass(c)?QBRead32(p):p[0];if(!QBNameFlags(c,flags))return 0;
  out->root=pointer_bytes==8?QBRead64(p+root_offset):QBRead32(p+root_offset);
  out->flags=flags;out->name_bytes=length;out->name_offset=(uint32_t)name_offset;return 1;
}
static inline int QBDispositionFlags(uint32_t c,uint32_t flags){return c==13?flags<=1:(c==64&&(flags&~0x1fu)==0);}
static inline int QBDecodeDisposition(uint32_t c,const void* data,size_t bytes,uint32_t* flags){
  const uint8_t* p=(const uint8_t*)data;uint32_t value;
  if(!p||!flags||!((c==13&&bytes==1)||(c==64&&bytes==4)))return 0;
  value=c==13?p[0]:QBRead32(p);if(!QBDispositionFlags(c,value))return 0;*flags=value;return 1;
}
// Only the required Microsoft mount-point and symbolic-link formats are
// supported here. Unknown/GUID/vendor/EX semantics remain explicit BLOCKED.
static inline int QBDecodeReparse(uint32_t code,const void* data,size_t bytes,QB_EVENT* out){
  const uint8_t* p=(const uint8_t*)data;uint32_t tag,length,base,sub,subbytes,print,printbytes,flags=0,i;
  if(!p||!out||bytes<8||bytes>16384)return 0;tag=QBRead32(p);length=QBRead16(p+4);
  if(QBRead16(p+6)||length!=bytes-8||(tag!=0xa0000003u&&tag!=0xa000000cu))return 0;
  if(code==0x900acu){if(length)return 0;out->reparse_tag=tag;out->disposition_flags=0;out->destination_bytes=0;return 1;}
  if(code!=0x900a4u)return 0;base=tag==0xa000000cu?20:16;if(bytes<base)return 0;
  sub=QBRead16(p+8);subbytes=QBRead16(p+10);print=QBRead16(p+12);printbytes=QBRead16(p+14);
  if(tag==0xa000000cu){flags=QBRead32(p+16);if(flags>1)return 0;}
  if((sub|subbytes|print|printbytes)&1)return 0;
  if(!subbytes||subbytes>=QB_NAME*2||sub>bytes-base||subbytes>bytes-base-sub||print>bytes-base||printbytes>bytes-base-print)return 0;
  if(!QBText(p+base+sub,subbytes)||!QBText(p+base+print,printbytes))return 0;
  // Copy only the substitute name that controls resolution; the print-name
  // range is validated but never confused with the resolution target.
  for(i=0;i<QB_NAME;i++)out->destination[i]=0;
  for(i=0;i<subbytes/2;i++)out->destination[i]=QBRead16(p+base+sub+i*2);
  out->destination_bytes=subbytes;out->reparse_tag=tag;out->disposition_flags=flags;return 1;
}
