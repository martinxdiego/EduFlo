#pragma once
#include <stdint.h>

// Fixed-width wire format; never transmit pointers, credentials or file contents.
#define Q_VERSION 3u
#define Q_COLLECTOR_VERSION 4u
#define Q_MAGIC 0x51464445u
#define Q_MAX_MESSAGE 1048576u
#define Q_MAX_OBJECTS 256u
#define Q_MAX_TOKENS 16u
#define Q_MAX_SID 184u
#define Q_MAX_DESCRIPTOR 65536u
#define Q_MAX_MEMBERS 256u
#define Q_MAX_PRIVILEGES 128u
#define Q_MAX_NAME 1024u
#define Q_QUEUE_CAPACITY 4096u
#define Q_OPAQUE 64u

typedef struct Q_REQUEST {
  uint32_t magic, version, size, verb;
  uint8_t challenge[32], profile[32], epoch[32], fixture[32], boot[32];
} Q_REQUEST;
typedef struct Q_HEADER {
  Q_REQUEST request;
  uint32_t status, reason, object_count, token_count, payload_bytes;
  uint8_t collector_image[32];
  uint32_t fact_count;
} Q_HEADER;
typedef struct Q_OBJECT {
  uint32_t index, attributes, reparse_tag, descriptor_bytes, descriptor_control;
  uint64_t volume;
  uint8_t file_id[16];
  wchar_t owner[Q_MAX_SID];
  uint32_t effective_access[Q_MAX_TOKENS];
  uint32_t primary_access[Q_MAX_TOKENS];
} Q_OBJECT;
typedef struct Q_GROUP { wchar_t sid[Q_MAX_SID]; uint32_t attributes; } Q_GROUP;
typedef struct Q_PRIVILEGE { uint32_t low; int32_t high; uint32_t attributes; } Q_PRIVILEGE;
typedef struct Q_TOKEN {
  uint32_t role, pid, tid, token_type, elevation, impersonation, group_count, restricted_count, privilege_count;
  uint64_t process_created, token_id, authentication_id, modified_id;
  wchar_t user[Q_MAX_SID], owner[Q_MAX_SID], integrity[Q_MAX_SID];
  uint8_t image[32];
  Q_GROUP groups[Q_MAX_MEMBERS], restricted[Q_MAX_MEMBERS];
  Q_PRIVILEGE privileges[Q_MAX_PRIVILEGES];
} Q_TOKEN;
typedef struct Q_BOUND_OBJECT { wchar_t path[Q_MAX_NAME]; uint64_t volume; uint8_t file_id[16]; } Q_BOUND_OBJECT;
typedef struct Q_BOUND_PROCESS { uint32_t role, pid, tid; uint64_t created; uint8_t image[32]; wchar_t sid[Q_MAX_SID]; } Q_BOUND_PROCESS;
typedef struct Q_CONFIG {
  uint32_t magic, version, size, object_count, process_count, broker_pid;
  uint64_t broker_created;
  wchar_t broker_sid[Q_MAX_SID];
  uint8_t broker_image[32], profile[32], epoch[32], fixture[32], boot[32];
  Q_BOUND_OBJECT objects[Q_MAX_OBJECTS];
  Q_BOUND_PROCESS processes[Q_MAX_TOKENS];
} Q_CONFIG;

enum Q_CAPTURE_KIND { Q_CREATE=1, Q_WRITE, Q_SET_INFORMATION, Q_SET_SECURITY, Q_FILE_CONTROL, Q_CLEANUP, Q_CLOSE };
typedef struct Q_EVENT {
  uint32_t magic, version, size, kind, phase, major, minor, flags;
  uint64_t sequence, operation, epoch, pid, tid, process_created, object_key, volume_key;
  int32_t status;
  uint32_t information_class, control_code, security_information, requested_access;
  uint64_t information, requested_bytes;
  uint32_t name_bytes, destination_bytes;
  wchar_t name[Q_MAX_NAME], destination[Q_MAX_NAME];
} Q_EVENT;
typedef struct Q_HEALTH {
  uint32_t magic, version, size, blocked;
  uint64_t epoch, sequence, drops, allocation_failures, overflows, attachments, detachments, disconnects, unloads, pending, queued;
  uint32_t drained, active;
} Q_HEALTH;
typedef struct Q_PORT_REQUEST { uint32_t magic, version, size, verb; uint64_t epoch; } Q_PORT_REQUEST;
enum { Q_POLL=1, Q_HEALTH_QUERY=2, Q_DRAIN=3 };

// Version 3 requires distinct primary/effective token observations and context.
enum Q_FACT_KIND { Q_FACT_RESOLUTION=1, Q_FACT_VOLUME=2, Q_FACT_MANDATORY=3, Q_FACT_HANDLES=4, Q_FACT_FILTERS=5, Q_FACT_PRIMARY_TOKEN=6, Q_FACT_TOKEN_CONTEXT=7, Q_FACT_COMPOSITE_ACCESS=8 };
typedef struct Q_COMPOSITE_ACCESS {
  uint32_t version,size,dac,mic_denied,current,parent_current,parent_delete_child,parent_read_attributes;
  uint32_t owner_member,owner_rights_ace,privilege_current,privilege_potential,token_integrity,object_integrity,token_policy,object_policy,unresolved,reserved;
} Q_COMPOSITE_ACCESS;
typedef struct Q_TOKEN_CONTEXT {
  uint32_t primary_session,effective_session,primary_mandatory,effective_mandatory;
  uint32_t primary_ui_access,effective_ui_access,primary_app_container,effective_app_container;
  uint32_t primary_virtualization_allowed,effective_virtualization_allowed,primary_virtualization_enabled,effective_virtualization_enabled;
  uint8_t primary_profile[32],effective_profile[32];
} Q_TOKEN_CONTEXT;
typedef struct Q_FACT { uint32_t kind, index, bytes, reserved; } Q_FACT;
typedef struct Q_RESOLUTION { uint32_t parent_index, root, reparse_bytes, reserved; uint8_t final_name[32], reparse[32]; } Q_RESOLUTION;
typedef struct Q_VOLUME_FACT {
  uint64_t volume;
  uint32_t filesystem_flags, device_type, device_number, partition, bus, removable;
  uint32_t cache_type, cache_enabled, cache_changeable, write_through, flush_supported, power_protection, nv_cache;
  uint8_t volume_name[32], device_descriptor[32], firmware[32], extents[32];
} Q_VOLUME_FACT;
typedef struct Q_MANDATORY_FACT { uint32_t mask, present; wchar_t integrity[Q_MAX_SID]; } Q_MANDATORY_FACT;
typedef struct Q_HANDLE_FACT {
  uint64_t handle;
  uint32_t attributes, access, kind, target_pid;
  uint64_t target_created;
  uint8_t type_name[32], object_name[32];
} Q_HANDLE_FACT;
