import { z } from 'zod'
import { VERSION, LIMITS, ref, digest, bindingSchema, parse, integer, immutable, nonProduction, blocked, hash } from './contracts.mjs'
import { observedTrace } from './observer-client.mjs'

const sealedPackages = new WeakSet()
export const evidenceSchema = z.object({ version: z.literal(VERSION), id: ref, binding: bindingSchema,
  host_profile: digest, collector_image: digest, observer_image: digest, launcher_image: digest,
  token_evidence: digest, object_evidence: digest, descriptor_evidence: digest, matrix: digest, positive_controls: digest,
  trace: digest, loss_status: z.literal('COMPLETE'), outside_root_mutations: integer, durability: z.enum(['FAILED', 'BLOCKED', 'NOT_PERFORMED']),
  ledger: digest, cleanup: z.enum(['PENDING', 'COMPLETE', 'BLOCKED']), verifier: ref,
  exceptions: z.array(z.enum(['UNSUPPORTED', 'INCOMPLETE', 'FAULT_ADAPTER_MISSING'])).max(32),
  items: z.array(z.object({ ref, digest, bytes: integer.max(LIMITS.trace), kind: z.enum(['TRACE', 'OBJECTS', 'TOKENS', 'DESCRIPTORS', 'CONTROL', 'FAULT', 'LEDGER', 'CLEANUP']) }).strict()).max(LIMITS.refs),
  scope: z.literal('SYNTHETIC_TEST_ONLY'), real_component_lab_verification: z.literal('NOT_PERFORMED'), actual_platform_qualification: z.literal('NOT_PERFORMED'),
  paid_authority: z.literal(false), external_properties_technically_proven: z.literal(false) }).strict()
export function sealSyntheticEvidence(input, traceReceipt) {
  nonProduction()
  if (process.env.NODE_ENV !== 'test') throw blocked('SYNTHETIC_ONLY')
  const evidence = parse(evidenceSchema, input), trace = observedTrace(traceReceipt)
  if (hash(evidence.binding) !== hash(trace.binding) || evidence.outside_root_mutations !== trace.outside_root_mutations
    || new Set(evidence.items.map(i => i.ref)).size !== evidence.items.length
    || evidence.items.filter(i => i.kind === 'TRACE').reduce((n, i) => n + i.bytes, 0) > LIMITS.trace) throw blocked('EVIDENCE_BINDING_OR_BOUND')
  const sealed = immutable({ evidence, digest: hash(evidence) }); sealedPackages.add(sealed); return sealed
}
export function verifiedSyntheticPackage(value) {
  nonProduction()
  if (process.env.NODE_ENV !== 'test' || !sealedPackages.has(value)) throw blocked('SEALED_EVIDENCE_REQUIRED')
  return value
}
const retentionSchema = z.object({ active: z.boolean(), hold: z.boolean(), closed_at: integer.nullable(), revoked_at: integer.nullable(),
  outcome: z.enum(['ACTIVE', 'FAILED', 'SUPERSEDED']), minimal_history: z.boolean() }).strict()
export function retentionDisposition(input, now) {
  nonProduction(); const r = parse(retentionSchema, input); parse(integer, now)
  if (r.minimal_history) return 'RETAIN_SYSTEM_LIFETIME'
  if (r.active || r.hold || r.outcome === 'ACTIVE') return 'RETAIN'
  const start = r.outcome === 'FAILED' ? r.closed_at : r.revoked_at
  if (start === null || now < start || now - start < 90 * 86400000) return 'RETAIN'
  return 'ELIGIBLE_FOR_INDEPENDENT_APPROVAL'
}
