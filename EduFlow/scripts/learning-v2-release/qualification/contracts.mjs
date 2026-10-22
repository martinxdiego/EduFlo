import { z } from 'zod'
import { createHash } from 'node:crypto'

export const VERSION = 'windows-qualification-integration-v1'
export const LIMITS = Object.freeze({ message: 1048576, refs: 512, objects: 256, tokens: 16, ref: 256, trace: 4294967296 })
export function blocked(reason = 'QUALIFICATION_NOT_READY') { return Object.assign(new Error(reason), { code: 'BLOCKED' }) }
export function nonProduction() { if (process.env.NODE_ENV === 'production') throw blocked('PRODUCTION_ISOLATED') }
export function testOnly() { nonProduction(); if (process.env.NODE_ENV !== 'test') throw blocked('SYNTHETIC_AUTHORITY_REQUIRED') }
export const ref = z.string().min(1).max(LIMITS.ref).regex(/^(?:test-paid|qualification)-[a-z0-9-]+$/)
export const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const integer = z.number().int().nonnegative().safe()
export const sid = z.string().max(184).regex(/^S-1-(?:\d+-)+\d+$/)
export const role = z.enum(['PROVISIONER', 'RUNNER', 'COORDINATOR', 'VERIFIER', 'ATTACKER_DEVELOPER', 'ATTACKER_SERVICE'])
export const outcome = z.enum(['PASS', 'FAILED', 'BLOCKED', 'NOT_PERFORMED'])
export const authority = Object.freeze({ paid_authority: false, provider_calls: 0, learning_truth_mutations: 0,
  runtime_approval: false, production_approval: false, actual_platform_qualification: 'NOT_PERFORMED' })
const literalVersion = z.literal(VERSION)
export const bindingSchema = z.object({ fixture: ref, profile: digest, epoch: ref, boot: ref, reservation: digest }).strict()
export const objectSchema = z.object({ ref, volume: ref, file_id: digest, parent: ref.nullable(), type: z.enum(['DIRECTORY', 'GUARD', 'FILE']),
  attributes: integer, reparse_tag: integer, owner: sid, descriptor: z.string().max(65536).regex(/^[A-Za-z0-9+/=]*$/),
  descriptor_hash: digest, inherited: z.boolean(), effective_denied: z.array(z.enum(['DELETE', 'DELETE_CHILD', 'ADD_SUBDIRECTORY', 'WRITE_DAC', 'WRITE_OWNER', 'REPARSE', 'GUARD_WRITE'])).max(7),
  guard_digest: digest.nullable() }).strict()
export const tokenSchema = z.object({ role, sid, pid: integer.positive(), tid: integer.positive(), process_start: ref,
  image: digest, groups: z.array(z.object({ sid, attributes: integer }).strict()).max(256),
  restricted: z.array(sid).max(256), privileges: z.array(z.object({ luid: z.string().regex(/^[a-f0-9]{16}$/), attributes: integer }).strict()).max(128),
  integrity: sid, elevation: z.enum(['DEFAULT', 'FULL', 'LIMITED']), impersonation: z.enum(['NONE', 'ANONYMOUS', 'IDENTIFICATION', 'IMPERSONATION', 'DELEGATION']),
  token_id: digest, inherited_handles: z.array(ref).max(32) }).strict()
export const collectorRequestSchema = z.object({ version: literalVersion, binding: bindingSchema, challenge: digest, verb: z.literal('INSPECT') }).strict()
export const collectorResponseSchema = z.object({ version: literalVersion, binding: bindingSchema, challenge: digest,
  collector_image: digest, status: z.enum(['OBSERVED', 'BLOCKED']), objects: z.array(objectSchema).max(LIMITS.objects),
  tokens: z.array(tokenSchema).max(LIMITS.tokens), device_profile: digest, complete: z.boolean(),
  reason: z.enum(['NONE', 'ACCESS_DENIED', 'UNSUPPORTED', 'PARTIAL', 'INVALID']) }).strict()
export const storageSchema = z.object({ version: literalVersion, id: ref, kind: z.enum(['PHYSICAL', 'VM']), filesystem: z.literal('NTFS'),
  device: ref, controller: ref, firmware: ref, cache_policy: z.enum(['WRITE_THROUGH', 'POWER_LOSS_PROTECTED', 'QUALIFIED_FLUSH']),
  host: ref, hypervisor: ref.nullable(), virtual_controller: ref.nullable(), backing_storage: ref.nullable(),
  filters: z.array(ref).max(32), assumptions: z.array(ref).min(1).max(32), fault_method: ref,
  persistence_documents: z.array(z.object({ ref, digest }).strict()).min(1).max(32),
  namespace_contract: ref, data_contract: ref, binding_contract: ref }).strict().superRefine((v, ctx) => {
  const vm = [v.hypervisor, v.virtual_controller, v.backing_storage]
  if (v.kind === 'VM' ? vm.some(x => x === null) : vm.some(x => x !== null)) ctx.addIssue({ code: 'custom', message: 'STORAGE_CLASS_BINDING' })
})
export const eventSchema = z.object({ version: literalVersion, epoch: ref, sequence: integer.positive(), operation: integer.positive(),
  phase: z.enum(['PRE', 'POST']), kind: z.enum(['CREATE', 'WRITE', 'TRUNCATE', 'RENAME', 'LINK', 'DELETE', 'DIRECTORY', 'SECURITY', 'OWNER', 'REPARSE_SET', 'REPARSE_REMOVE', 'CLEANUP', 'CLOSE', 'DEVICE']),
  pid: integer.positive(), tid: integer.positive(), process_start: ref, object: digest, volume: ref, path: ref,
  destination: ref.nullable(), status: z.enum(['PENDING', 'SUCCESS', 'DENIED', 'UNSUPPORTED', 'ERROR']),
  effect: z.enum(['NONE', 'CREATED', 'MODIFIED', 'RENAMED', 'DELETED', 'PARTIAL']), bytes: integer.max(LIMITS.trace),
  outside: z.boolean() }).strict()
export const healthSchema = z.object({ epoch: ref, drops: integer, allocation_failures: integer, overflows: integer,
  etw_events_lost: integer, etw_buffers_lost: integer, etw_realtime_lost: integer,
  attached: z.boolean(), disconnected: z.boolean(), unloaded: z.boolean(), drained: z.boolean(), last_sequence: integer }).strict()

// Reject before parsing. A bounded re-serialization also protects direct object callers.
export function parse(schema, input, limit = LIMITS.message) {
  try {
    if (Buffer.isBuffer(input) || (typeof input === 'string' && !(schema instanceof z.ZodString) && !(schema instanceof z.ZodEnum))) {
      if (Buffer.byteLength(input) > limit) throw blocked('MESSAGE_BOUND')
      input = JSON.parse(Buffer.isBuffer(input) ? input.toString('utf8') : input)
    }
    if (Buffer.byteLength(JSON.stringify(input)) > limit) throw blocked('MESSAGE_BOUND')
    return schema.parse(input)
  } catch { throw blocked('INVALID_QUALIFICATION_MESSAGE') }
}
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  return JSON.stringify(v)
}
export function hash(v) { return createHash('sha256').update(Buffer.isBuffer(v) ? v : canonical(v)).digest('hex') }
export function equal(a, b) { return canonical(a) === canonical(b) }
export function immutable(v) { if (v && typeof v === 'object') { Object.values(v).forEach(immutable); Object.freeze(v) } return v }
export function result(status, reason) { return immutable({ status, reason, ...authority }) }
