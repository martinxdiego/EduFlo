import { createHash } from 'node:crypto'
import { z } from 'zod'
import { jcsUtf8Bytes, domainSeparatedJcsSha256 } from './human-review-canonical.js'
import { TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST as manifest } from './human-review-evaluation-contract.js'
import { TUTOR_PROVIDER_FAILURE_CODES } from './provider-diagnostics.js'

export const PAID_EXECUTION_VERSION = 'tutor-paid-execution-record-v1'
export const PAID_EXECUTION_DOMAIN = 'EDUFLOW\0H14B\0PAID_EXECUTION_RECORD\0v1\0'
export const PAID_EXECUTION_NO_RESUME = 'NO_RESUME_AFTER_PROCESS_FAILURE'
export const PAID_EXECUTION_CAUSES = Object.freeze(['COMPLETED', 'BUDGET_LIMIT', 'CALL_LIMIT', 'TOKEN_LIMIT',
  'FINAL_FALLBACK_SAFETY_FAILURE', 'ARTIFACT_WRITE_FAILURE', 'ARTIFACT_READBACK_FAILURE', 'DIGEST_MISMATCH',
  'OPERATIONS_NOT_READY', 'AUTHORIZATION_INVALID', 'CLAIM_CONFLICT', 'EXECUTION_DRIFT', 'PROCESS_FAILURE',
  'PROVIDER_PRETRANSPORT_FAILURE', 'REVIEW_MATERIAL_UNAVAILABLE', 'EXECUTION_INTERNAL_FAILURE'])
export const PAID_EXECUTION_PHASES = Object.freeze(['AUTHORIZATION', 'CLAIM', 'PRETRANSPORT', 'TRANSPORT',
  'FINAL_GATES', 'CASE_CHECKPOINT', 'RESULT', 'REVIEW_MATERIAL', 'FINAL_RECORD', 'RECONCILIATION'])
export const PAID_PROOF_NAMES = Object.freeze(['private_repository_attested', 'protected_authoritative_branch_attested',
  'single_designated_coordinator_attested', 'reviewer_no_direct_repository_access_attested'])
export const PAID_LIMITS = Object.freeze({ input_rate_usd_micros_per_million: 2000000,
  output_rate_usd_micros_per_million: 12000000, budget_cap_usd_micros: 10000000,
  unknown_call_reservation_usd_micros: 81920, full_run_conservative_max_usd_micros: 9830400,
  max_transports: 120, max_input_tokens_per_call: 40000, max_output_tokens_per_call: 160,
  max_input_tokens: 4800000, max_output_tokens: 19200, max_total_tokens: 4819200 })
export const PAID_GOVERNANCE = Object.freeze({ synthetic_only: true, learning_authority: 'NONE', evidence_effect: 'NONE',
  approval_effect: 'NONE', runtime_approval_effect: 'NONE', production_approval_effect: 'NONE', learning_truth_mutations: 0 })
export const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/)
export const sha = z.string().regex(/^sha256:[0-9a-f]{64}$/)
export const integer = z.number().int().safe().nonnegative()
export const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v)
const revision = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/)
const literals = object => Object.fromEntries(Object.entries(object).map(([k, v]) => [k, z.literal(v)]))
const governance = literals(PAID_GOVERNANCE)
const base = { execution_contract_version: z.literal(PAID_EXECUTION_VERSION), run_id: id, run_contract_hash: sha,
  artifact_digest: sha }
export const paidLimitsSchema = z.object(literals(PAID_LIMITS)).strict()
const pathRef = z.string().max(320).regex(/^docs\/evaluation-results\/[a-z0-9/.-]+$/)
const proof = z.object({ value: z.literal(true), attested_by: id, attested_at: timestamp,
  run_id: id, run_contract_hash: sha, evidence_ref: id }).strict()
const attestation = z.object({ ...base, artifact_kind: z.literal('OPERATIONS_ATTESTATION'), attestation_ref: id,
  repository_ref: id, authoritative_branch_ref: id, execution_revision: revision, coordinator_ref: id,
  ...Object.fromEntries(PAID_PROOF_NAMES.map(k => [k, proof])), external_properties_technically_proven: z.literal(false) }).strict()
const authorization = z.object({ ...base, ...governance, artifact_kind: z.literal('AUTHORIZATION'), authorization_ref: id,
  provider: z.literal('openai'), model: z.literal('gpt-5.6-terra'), prompt_version: z.literal('tutor-guidance-v3'),
  prompt_digest: z.literal(manifest.prompt_digest), response_schema: z.literal('tutor-provider-response-v1'),
  evaluation_version: z.literal('tutor-paid-evaluation-v9'), evaluator_version: z.literal('tutor-paid-evaluator-v7'),
  result_version: z.literal('tutor-paid-evaluation-result-v5'), evaluation_scope_fingerprint: z.literal(manifest.scope_fingerprint),
  fixture_version: z.literal(manifest.fixture_set_version), fixture_digest: z.literal(manifest.fixture_set_hash),
  sampling_contract: z.literal('tutor-human-review-sampling-v1'), packet_contract: z.literal('tutor-human-review-packet-v1'),
  pricing_contract: z.literal('openai-gpt-5.6-terra-standard-pricing-v1'),
  pricing_ref: z.literal('openai:gpt-5.6-terra:standard-api:2026-07-30:v1'),
  accounting_contract: z.literal('tutor-paid-evaluation-accounting-v1'), limits: paidLimitsSchema, repetitions: z.literal(1),
  external_provider_calls_allowed: z.literal(true), review_capture_required: z.literal(true), max_retries: z.literal(0),
  provider_failover: z.literal(false), replay_allowed: z.literal(false), resume_policy: z.literal(PAID_EXECUTION_NO_RESUME),
  operations_attestation_ref: id, operations_attestation_sha256: sha, approved_by: id, operator_authority_ref: id,
  authorized_at: timestamp, execution_revision: revision, coordinator_ref: id,
  claim_ref: pathRef, result_ref: pathRef, execution_ref: pathRef,
  single_use: z.literal(true), create_once: z.literal(true), consumed_on_claim: z.literal(true) }).strict()
const binding = { ...base, claim_ref: pathRef, claim_sha256: sha, authorization_ref: id, authorization_sha256: sha,
  execution_owner_ref: id }
const claim = z.object({ ...base, ...governance, artifact_kind: z.literal('CLAIM'), authorization_ref: id,
  authorization_sha256: sha, operations_attestation_ref: id, operations_attestation_sha256: sha,
  coordinator_ref: id, execution_owner_ref: id, claimed_at: timestamp, authorization_consumed: z.literal(true),
  execution_ref: pathRef, checkpoint_ref: pathRef, result_ref: pathRef }).strict()
const checkpoint = { ...binding, sequence: integer.min(1).max(244), previous_checkpoint_sha256: sha, created_at: timestamp }
const reservation = z.object({ input_tokens: z.literal(40000), output_tokens: z.literal(160), total_tokens: z.literal(40160),
  cost_usd_micros: z.literal(81920), max_invocations: z.literal(1) }).strict()
const caseFields = { case_ordinal: integer.min(1).max(120), case_id: id }
export const paidCaseFactsSchema = z.object({
  transport_started: z.boolean().nullable(),
  transport_outcome: z.enum(['NOT_STARTED', 'RESPONSE_RECEIVED', 'TIMEOUT', 'HTTP_FAILURE', 'NETWORK_FAILURE',
    'SCHEMA_PARSE_FAILURE', 'OTHER_PROVIDER_FAILURE', 'UNKNOWN_AFTER_PROCESS_FAILURE']),
  usage_status: z.enum(['NOT_APPLICABLE', 'KNOWN', 'UNKNOWN']), known_input_tokens: integer.nullable(),
  known_output_tokens: integer.nullable(), known_total_tokens: integer.nullable(), known_actual_cost_usd_micros: integer.nullable(),
  unknown_reservation_applied: z.boolean(), provider_technical_cause: z.enum(TUTOR_PROVIDER_FAILURE_CODES).nullable(),
  fallback_used: z.boolean().nullable(), final_outcome_status: z.enum(['PROVIDER_ACCEPTED', 'LOCAL_FALLBACK_ACCEPTED',
    'FINAL_OUTCOME_FAIL', 'NOT_COMPLETED']), case_completed: z.boolean(),
}).strict().superRefine((v, c) => {
  const fail = () => c.addIssue({ code: z.ZodIssueCode.custom, message: 'Paid case facts contradict durable outcome' })
  const amounts = [v.known_input_tokens, v.known_output_tokens, v.known_total_tokens, v.known_actual_cost_usd_micros]
  if (v.case_completed !== (v.final_outcome_status !== 'NOT_COMPLETED')) fail()
  if (v.case_completed && (v.transport_started !== true || v.fallback_used === null)) fail()
  if (v.transport_started === null && (v.transport_outcome !== 'UNKNOWN_AFTER_PROCESS_FAILURE' || v.usage_status !== 'UNKNOWN'
    || v.provider_technical_cause !== null || v.fallback_used !== null || v.case_completed)) fail()
  if (v.transport_started === false && (v.transport_outcome !== 'NOT_STARTED' || v.usage_status !== 'NOT_APPLICABLE'
    || v.provider_technical_cause !== null || v.fallback_used !== false || v.case_completed)) fail()
  if (v.transport_started === true && ['NOT_STARTED', 'UNKNOWN_AFTER_PROCESS_FAILURE'].includes(v.transport_outcome)) fail()
  if (v.usage_status === 'UNKNOWN') { if (!v.unknown_reservation_applied || amounts.some(x => x !== null)) fail() }
  else {
    if (v.unknown_reservation_applied || amounts.some(x => x === null)) return fail()
    if (BigInt(v.known_input_tokens) + BigInt(v.known_output_tokens) !== BigInt(v.known_total_tokens)
      || 2n * BigInt(v.known_input_tokens) + 12n * BigInt(v.known_output_tokens) !== BigInt(v.known_actual_cost_usd_micros)) fail()
    if (v.usage_status === 'NOT_APPLICABLE' && (v.transport_started !== false || amounts.some(x => x !== 0))) fail()
    if (v.usage_status === 'KNOWN' && v.transport_started !== true) fail()
  }
  if (v.final_outcome_status === 'PROVIDER_ACCEPTED' && (v.fallback_used !== false || v.provider_technical_cause !== null)) fail()
  if (['LOCAL_FALLBACK_ACCEPTED', 'FINAL_OUTCOME_FAIL'].includes(v.final_outcome_status) && v.fallback_used !== true) fail()
  const codes = { TIMEOUT: ['PROVIDER_TIMEOUT'], HTTP_FAILURE: ['PROVIDER_HTTP_429', 'PROVIDER_HTTP_5XX', 'PROVIDER_HTTP_4XX'],
    NETWORK_FAILURE: ['PROVIDER_NETWORK_ERROR'], SCHEMA_PARSE_FAILURE: ['PROVIDER_SCHEMA_PARSE_ERROR'],
    OTHER_PROVIDER_FAILURE: ['PROVIDER_UNKNOWN_ERROR'] }
  if (codes[v.transport_outcome] && !codes[v.transport_outcome].includes(v.provider_technical_cause)) fail()
  if (v.transport_outcome === 'RESPONSE_RECEIVED' && v.provider_technical_cause !== null && v.provider_technical_cause !== 'PROVIDER_USAGE_MISSING') fail()
})
const prepared = z.object({ ...checkpoint, ...caseFields, artifact_kind: z.literal('CASE_PREPARED'), reservation }).strict()
const settled = z.object({ ...checkpoint, ...caseFields, artifact_kind: z.literal('CASE_SETTLED'), prepared_sha256: sha,
  facts: paidCaseFactsSchema }).strict()
const resultFields = { result_ref: pathRef, result_sha256: sha }
const resultPrepared = z.object({ ...checkpoint, artifact_kind: z.literal('RESULT_PREPARED'), ...resultFields }).strict()
const resultVerified = z.object({ ...checkpoint, artifact_kind: z.literal('RESULT_VERIFIED'), ...resultFields }).strict()
const materialFields = { ...resultFields, sample_ref: pathRef, sample_sha256: sha, packet_ref: pathRef, packet_sha256: sha }
const materialPrepared = z.object({ ...checkpoint, artifact_kind: z.literal('REVIEW_MATERIAL_PREPARED'), ...materialFields,
  review_material_eligible: z.literal(true), attempt_committed: z.literal(true), packet_created_at: timestamp }).strict()
const failure = z.enum(['ARTIFACT_WRITE_FAILURE', 'ARTIFACT_READBACK_FAILURE', 'DIGEST_MISMATCH'])
const materialSettled = z.object({ ...checkpoint, artifact_kind: z.literal('REVIEW_MATERIAL_SETTLED'), ...materialFields,
  material_state: z.enum(['REVIEW_MATERIAL_READY', 'BLOCKED']), failure_cause: failure.nullable() }).strict()
export const paidAccountingSchema = z.object({
  known_usage_call_count: integer, known_input_tokens: integer, known_output_tokens: integer, known_total_tokens: integer,
  known_actual_cost_usd_micros: integer, unknown_usage_call_count: integer, unknown_reserved_input_tokens: integer,
  unknown_reserved_output_tokens: integer, unknown_reserved_total_tokens: integer, conservative_unknown_usage_cost_usd_micros: integer,
  actual_cost_status: z.enum(['KNOWN', 'PARTIAL_UNKNOWN']), actual_cost_usd_micros: integer.nullable(),
  conservative_total_cost_upper_bound_usd_micros: integer.nullable(),
  remaining_budget_upper_bound_usd_micros: z.number().int().safe().nullable(),
  conservative_input_tokens: integer, conservative_output_tokens: integer, conservative_total_tokens: integer,
  bounds_status: z.enum(['PROVEN', 'UNPROVABLE']), confirmed_started_transport_count: integer.max(120),
  possibly_started_transport_count: integer.max(120), started_transport_count: integer.max(120).nullable(),
  completed_case_count: integer.max(120), unattempted_case_count: integer.max(120),
}).strict()
const summary = z.object({ ...caseFields, prepared_ref: pathRef, prepared_sha256: sha,
  settled_ref: pathRef.nullable(), settled_sha256: sha.nullable(), facts: paidCaseFactsSchema }).strict()
const reconciliation = z.object({ operator_ref: id, evidence_ref: id, original_owner_stopped: z.literal(true),
  exclusive_coordinator_attested: z.literal(true), verified_at: timestamp }).strict()
const terminal = z.object({ ...binding, ...governance, artifact_kind: z.literal('TERMINAL_RECORD'), record_state: z.literal('TERMINAL'),
  terminalization_mode: z.enum(['LIVE_OWNER', 'POST_FAILURE_RECONCILIATION']), reconciliation_authority: reconciliation.nullable(),
  execution_completion: z.enum(['NOT_STARTED', 'PARTIAL', 'COMPLETE']), evaluation_state: z.enum(['INCOMPLETE', 'EVALUATION_COMPLETE']),
  result_state: z.enum(['NOT_ELIGIBLE', 'BLOCKED', 'PERSISTED_VERIFIED']), review_material_eligible: z.boolean(),
  review_material_attempted: z.boolean(), review_material_state: z.enum(['NOT_ELIGIBLE', 'BLOCKED', 'REVIEW_MATERIAL_READY']),
  terminal_cause: z.enum(PAID_EXECUTION_CAUSES), terminal_phase: z.enum(PAID_EXECUTION_PHASES), terminal_case_id: id.nullable(),
  secondary_failure_cause: failure.nullable(), checkpoint_count: integer.max(244), checkpoint_head: sha,
  case_accounting: z.array(summary).max(120), accounting: paidAccountingSchema,
  result_ref: pathRef.nullable(), result_sha256: sha.nullable(), sample_ref: pathRef.nullable(), sample_sha256: sha.nullable(),
  packet_ref: pathRef.nullable(), packet_sha256: sha.nullable(), terminalized_at: timestamp }).strict()

export const paidArtifactSchemas = Object.freeze(Object.fromEntries([authorization, attestation, claim, prepared, settled,
  resultPrepared, resultVerified, materialPrepared, materialSettled, terminal].map(s => [s.shape.artifact_kind.value, s])))
export function paidBlocked(reason = 'EXECUTION_DRIFT') { return Object.assign(new Error(reason), { code: 'BLOCKED', reason_code: reason }) }
export function assertPaidNonProduction() { if (!['test', 'development'].includes(process.env.NODE_ENV)) throw paidBlocked('OPERATIONS_NOT_READY') }
export function paidPaths(runId) {
  id.parse(runId)
  const root = 'docs/evaluation-results', run = `${root}/${runId}`
  return Object.freeze({ authorization: `${run}.authorization.json`, attestation: `${run}.operations-attestation.json`,
    claim: `${run}.claim.json`, execution: `${run}.execution.json`, result: `${run}.result.json`,
    checkpoints: `${root}/execution-checkpoints/${runId}`, sample: `${root}/human-review/${runId}/sample-manifest.json`,
    packet: `${root}/human-review/${runId}/review-packet.json` })
}
export const paidFileHash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
export function paidArtifactLimit(kind) { return kind === 'TERMINAL_RECORD' ? 262144 : ['AUTHORIZATION', 'OPERATIONS_ATTESTATION', 'CLAIM'].includes(kind) ? 16384 : 8192 }
export function verifyPaidArtifact(value) {
  const s = paidArtifactSchemas[value?.artifact_kind]
  if (!s) throw paidBlocked('EXECUTION_DRIFT')
  const v = s.parse(value), { artifact_digest, ...body } = v
  if (artifact_digest !== domainSeparatedJcsSha256(PAID_EXECUTION_DOMAIN, body)) throw paidBlocked('DIGEST_MISMATCH')
  const paths = paidPaths(v.run_id)
  for (const [key, name] of Object.entries({ claim_ref: 'claim', execution_ref: 'execution', checkpoint_ref: 'checkpoints',
    result_ref: 'result', sample_ref: 'sample', packet_ref: 'packet' })) {
    if (v[key] != null && v[key] !== paths[name]) throw paidBlocked('EXECUTION_DRIFT')
  }
  if (v.artifact_kind === 'OPERATIONS_ATTESTATION') for (const name of PAID_PROOF_NAMES) {
    if (v[name].run_id !== v.run_id || v[name].run_contract_hash !== v.run_contract_hash) throw paidBlocked('AUTHORIZATION_INVALID')
  }
  if (v.artifact_kind === 'REVIEW_MATERIAL_SETTLED' && ((v.material_state === 'BLOCKED') !== (v.failure_cause !== null))) throw paidBlocked()
  if (jcsUtf8Bytes(v).length > paidArtifactLimit(v.artifact_kind)) throw paidBlocked('ARTIFACT_WRITE_FAILURE')
  return deepFreeze(v)
}
export function sealPaidArtifact(body) {
  if ('artifact_digest' in body) throw paidBlocked()
  return verifyPaidArtifact({ ...body, artifact_digest: domainSeparatedJcsSha256(PAID_EXECUTION_DOMAIN, body) })
}
export function verifyPaidArtifactBytes(bytes, expectedHash) {
  if (expectedHash && paidFileHash(bytes) !== expectedHash) throw paidBlocked('DIGEST_MISMATCH')
  let v
  try { v = verifyPaidArtifact(JSON.parse(Buffer.from(bytes).toString('utf8'))) } catch (e) { throw e.code === 'BLOCKED' ? e : paidBlocked('DIGEST_MISMATCH') }
  if (!jcsUtf8Bytes(v).equals(Buffer.from(bytes))) throw paidBlocked('DIGEST_MISMATCH')
  return v
}
export function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(deepFreeze); Object.freeze(value) } return value }
export function exactInput(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length
    || keys.some(k => !Object.hasOwn(value, k))) throw paidBlocked('EXECUTION_DRIFT')
  return value
}
