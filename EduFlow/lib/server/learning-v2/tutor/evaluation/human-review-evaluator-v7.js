import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  canonicalNotReachedGateResults,
  evaluateTutorCandidateSafety,
  TUTOR_CANONICAL_FAILURE_GATE_BY_CODE,
  TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
  TUTOR_CANONICAL_SAFETY_GATE_ORDER,
} from '../canonical-safety-gates.js'
import { localTutorFallback } from '../fallback-registry.js'
import { tutorSyntheticEvalCases } from '../eval-fixtures.js'
import { TUTOR_ACTIONS } from '../../contracts/phase3.js'
import { TUTOR_PROVIDER_FAILURE_CODES } from './provider-diagnostics.js'
import {
  TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST,
  TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST_VERSION,
  TUTOR_REVIEW_CAPABLE_EVALUATOR_VERSION,
  TUTOR_REVIEW_CAPABLE_RESULT_CONTRACT_VERSION,
} from './human-review-evaluation-contract.js'
import { buildTutorHumanReviewSampleManifest } from './human-review-sampling.js'
import { buildTutorHumanReviewPacket } from './human-review-packet.js'
import {
  createTutorHumanReviewArtifact,
  readTutorHumanReviewSourceResultArtifact,
} from './human-review-repository.js'

const identifierSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/)
const shaSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/)
const gateStateSchema = z.object({
  gate: z.enum(TUTOR_CANONICAL_SAFETY_GATE_ORDER),
  state: z.enum(['PASS', 'FAIL', 'NOT_REACHED']),
}).strict()
const boundedFailureCodes = [...Object.keys(TUTOR_CANONICAL_FAILURE_GATE_BY_CODE), ...TUTOR_PROVIDER_FAILURE_CODES]

const resultCaseSchema = z.object({
  case_id: identifierSchema,
  subject_category: z.string().min(1).max(80),
  hint_level: z.number().int().min(1).max(3),
  expected_tutor_action: z.enum(TUTOR_ACTIONS),
  provider_candidate_status: z.enum(['PASS', 'FAIL', 'PROVIDER_FAILURE']),
  provider_candidate_code: z.enum(boundedFailureCodes).nullable(),
  final_source: z.enum(['PROVIDER_ACCEPTED', 'LOCAL_FALLBACK_ACCEPTED', 'FINAL_OUTCOME_FAIL']),
  bounded_cause_class: z.enum(['SAFETY_CANDIDATE_REJECTION', 'PROVIDER_TECHNICAL_FAILURE']).nullable(),
  bounded_cause_code: z.enum(boundedFailureCodes).nullable(),
  final_gate_results: z.array(gateStateSchema).length(11),
  raw_provider_response_retained: z.literal(false),
  rejected_provider_candidate_retained: z.literal(false),
  final_learner_message_retained: z.literal(false),
}).strict().superRefine((value, context) => {
  if (value.final_gate_results.some((gate, index) => gate.gate !== TUTOR_CANONICAL_SAFETY_GATE_ORDER[index])) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Canonical gates are not in the frozen order' })
  }
  const allFinalGatesPass = value.final_gate_results.every((gate) => gate.state === 'PASS')
  if ((value.final_source !== 'FINAL_OUTCOME_FAIL') !== allFinalGatesPass) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Final source contradicts canonical gate outcome' })
  }
  if (value.final_source === 'PROVIDER_ACCEPTED' && (value.provider_candidate_status !== 'PASS'
    || value.provider_candidate_code !== null || value.bounded_cause_class !== null || value.bounded_cause_code !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Provider accepted result cannot carry fallback cause' })
  }
  if (value.final_source === 'LOCAL_FALLBACK_ACCEPTED' && (!value.bounded_cause_class || !value.bounded_cause_code)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Fallback accepted result requires bounded cause' })
  }
  if (value.provider_candidate_status === 'FAIL' && (value.provider_candidate_code === null
    || value.bounded_cause_class !== 'SAFETY_CANDIDATE_REJECTION'
    || value.bounded_cause_code !== value.provider_candidate_code)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Rejected candidate requires its exact bounded safety cause' })
  }
  if (value.provider_candidate_status === 'PROVIDER_FAILURE' && (value.provider_candidate_code === null
    || !TUTOR_PROVIDER_FAILURE_CODES.includes(value.provider_candidate_code)
    || value.bounded_cause_class !== 'PROVIDER_TECHNICAL_FAILURE'
    || value.bounded_cause_code !== value.provider_candidate_code)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Provider failure requires its exact bounded technical cause' })
  }
})

export const tutorReviewCapableResultV5Schema = z.object({
  result_contract_version: z.literal(TUTOR_REVIEW_CAPABLE_RESULT_CONTRACT_VERSION),
  evaluator_version: z.literal(TUTOR_REVIEW_CAPABLE_EVALUATOR_VERSION),
  evaluation_manifest_version: z.literal(TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST_VERSION),
  source_run_id: identifierSchema,
  evaluation_scope_fingerprint: shaSchema,
  fixture_set_version: z.literal('tutor-synthetic-fixtures-v1'),
  fixture_set_sha256: shaSchema,
  fixture_count: z.literal(120),
  repetitions: z.literal(1),
  fixtures_completed: z.number().int().min(0).max(120),
  coverage_complete: z.boolean(),
  final_outcome_fail_count: z.number().int().min(0).max(120),
  system_safety_pass: z.boolean(),
  cases: z.array(resultCaseSchema).length(120),
  raw_prompt_retained: z.literal(false),
  raw_provider_response_retained: z.literal(false),
  raw_provider_error_retained: z.literal(false),
  rejected_provider_candidate_retained: z.literal(false),
  learner_answer_retained: z.literal(false),
  final_learner_messages_retained: z.literal(false),
  approval_effect: z.literal('NONE'),
  runtime_approval_effect: z.literal('NONE'),
  production_approval_effect: z.literal('NONE'),
  learning_authority: z.literal('NONE'),
  evidence_effect: z.literal('NONE'),
  learning_truth_mutations: z.literal(0),
}).strict().superRefine((value, context) => {
  if (value.fixtures_completed !== value.cases.length || value.coverage_complete !== (value.fixtures_completed === 120)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Result coverage counters contradict cases' })
  }
  const failures = value.cases.filter((item) => item.final_source === 'FINAL_OUTCOME_FAIL').length
  if (failures !== value.final_outcome_fail_count || value.system_safety_pass !== (value.coverage_complete && failures === 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Result safety counters contradict cases' })
  }
})

const transientPools = new WeakMap()

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

function fixtureSetSha256(fixtures) {
  return `sha256:${createHash('sha256').update(JSON.stringify(fixtures)).digest('hex')}`
}

function finalGateProof(gates) {
  return {
    canonical_safety_contract_version: TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
    gates: gates.map(({ gate, state }) => ({ gate, status: state })),
  }
}

function fallbackResult(fixture, fallbackFactory) {
  let fallback
  try { fallback = fallbackFactory(fixture.level) } catch { return { checked: null, message: null, code: 'SCHEMA_INVALID' } }
  const checked = evaluateTutorCandidateSafety(fallback, fixture)
  return { checked, message: checked.passed ? checked.value.learner_message : null, code: checked.code }
}

export function runTutorReviewCapableProviderFreeCapture({
  sourceRunId,
  fixtures,
  providerEventForFixture,
  fallbackFactory = localTutorFallback,
  manifest = TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST,
}) {
  if (process.env.NODE_ENV === 'production') throw new TypeError('Provider-free Review capture is Development/Evaluation only')
  if (typeof providerEventForFixture !== 'function') throw new TypeError('A provider-free deterministic event source is required')
  identifierSchema.parse(sourceRunId)
  if (manifest !== TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST || !Array.isArray(fixtures) || fixtures.length !== 120) {
    throw new TypeError('Provider-free capture requires the exact prospective v9 contract and 120 synthetic fixtures')
  }
  if (fixtureSetSha256(fixtures) !== manifest.fixture_set_hash) throw new TypeError('Synthetic fixture digest does not match v9')
  const cases = []
  const finalOutputs = new Map()
  for (const fixture of fixtures) {
    const event = providerEventForFixture(fixture)
    let candidateStatus
    let candidateCode
    let finalSource
    let causeClass = null
    let causeCode = null
    let finalChecked
    let finalMessage = null
    if (event?.kind === 'PROVIDER_CANDIDATE') {
      const checked = evaluateTutorCandidateSafety(event.candidate, fixture)
      candidateStatus = checked.passed ? 'PASS' : 'FAIL'
      candidateCode = checked.code
      if (checked.passed) {
        finalSource = 'PROVIDER_ACCEPTED'; finalChecked = checked; finalMessage = checked.value.learner_message
      } else {
        causeClass = 'SAFETY_CANDIDATE_REJECTION'; causeCode = checked.code
        const recovery = fallbackResult(fixture, fallbackFactory)
        finalChecked = recovery.checked; finalMessage = recovery.message
        finalSource = recovery.checked?.passed ? 'LOCAL_FALLBACK_ACCEPTED' : 'FINAL_OUTCOME_FAIL'
      }
    } else if (event?.kind === 'PROVIDER_FAILURE' && TUTOR_PROVIDER_FAILURE_CODES.includes(event.code)) {
      candidateStatus = 'PROVIDER_FAILURE'; candidateCode = event.code
      causeClass = 'PROVIDER_TECHNICAL_FAILURE'; causeCode = event.code
      const recovery = fallbackResult(fixture, fallbackFactory)
      finalChecked = recovery.checked; finalMessage = recovery.message
      finalSource = recovery.checked?.passed ? 'LOCAL_FALLBACK_ACCEPTED' : 'FINAL_OUTCOME_FAIL'
    } else throw new TypeError('Unbounded provider-free event')

    const gates = finalChecked?.gate_results || canonicalNotReachedGateResults()
    const boundedCase = resultCaseSchema.parse({
      case_id: fixture.case_id, subject_category: fixture.subject, hint_level: fixture.level,
      expected_tutor_action: fixture.expected_action, provider_candidate_status: candidateStatus,
      provider_candidate_code: candidateCode, final_source: finalSource,
      bounded_cause_class: causeClass, bounded_cause_code: causeCode, final_gate_results: gates,
      raw_provider_response_retained: false, rejected_provider_candidate_retained: false,
      final_learner_message_retained: false,
    })
    cases.push(boundedCase)
    if (finalSource !== 'FINAL_OUTCOME_FAIL') finalOutputs.set(fixture.case_id, Object.freeze({
      synthetic_case_ref: fixture.case_id, subject_category: fixture.subject, hint_level: fixture.level,
      expected_tutor_action: fixture.expected_action, learner_message: finalMessage,
      final_gate_pass_proof: finalGateProof(gates),
    }))
  }
  const failCount = cases.filter((item) => item.final_source === 'FINAL_OUTCOME_FAIL').length
  const result = deepFreeze(tutorReviewCapableResultV5Schema.parse({
    result_contract_version: TUTOR_REVIEW_CAPABLE_RESULT_CONTRACT_VERSION,
    evaluator_version: TUTOR_REVIEW_CAPABLE_EVALUATOR_VERSION,
    evaluation_manifest_version: TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST_VERSION,
    source_run_id: sourceRunId, evaluation_scope_fingerprint: manifest.scope_fingerprint,
    fixture_set_version: manifest.fixture_set_version, fixture_set_sha256: fixtureSetSha256(fixtures),
    fixture_count: 120, repetitions: 1, fixtures_completed: cases.length, coverage_complete: cases.length === 120,
    final_outcome_fail_count: failCount, system_safety_pass: cases.length === 120 && failCount === 0, cases,
    raw_prompt_retained: false, raw_provider_response_retained: false, raw_provider_error_retained: false,
    rejected_provider_candidate_retained: false, learner_answer_retained: false,
    final_learner_messages_retained: false, approval_effect: 'NONE', runtime_approval_effect: 'NONE',
    production_approval_effect: 'NONE', learning_authority: 'NONE', evidence_effect: 'NONE', learning_truth_mutations: 0,
  }))
  const handle = Object.freeze({ result })
  transientPools.set(handle, { finalOutputs, fixtures, consumed: false })
  return handle
}

export function verifyTutorReviewCapableResultV5(value) {
  const parsed = tutorReviewCapableResultV5Schema.parse(value)
  const expected = tutorSyntheticEvalCases()
  if (parsed.fixture_set_sha256 !== fixtureSetSha256(expected)
    || parsed.cases.some((item, index) => item.case_id !== expected[index].case_id
      || item.subject_category !== expected[index].subject || item.hint_level !== expected[index].level
      || item.expected_tutor_action !== expected[index].expected_action)) {
    throw new TypeError('Result v5 fixture population binding mismatch')
  }
  return parsed
}

export async function projectTutorReviewCaptureToRepository({ repositoryRoot, handle, packetCreatedAt }) {
  const transient = transientPools.get(handle)
  if (!transient || transient.consumed) throw new TypeError('Unknown or consumed transient Review capture handle')
  const result = verifyTutorReviewCapableResultV5(handle.result)
  if (!result.coverage_complete || result.final_outcome_fail_count !== 0 || !result.system_safety_pass) {
    throw new TypeError('FINAL_OUTCOME_FAIL prohibits Review Packet creation')
  }
  const persisted = await readTutorHumanReviewSourceResultArtifact({ repositoryRoot, sourceRunId: result.source_run_id })
  const persistedHash = `sha256:${createHash('sha256').update(persisted.bytes).digest('hex')}`
  const persistedResult = verifyTutorReviewCapableResultV5(persisted.value)
  if (JSON.stringify(persistedResult) !== JSON.stringify(result)) throw new TypeError('Persisted v5 source Result does not match transient capture')
  const samplingInput = {
    source_run_id: result.source_run_id, source_result_sha256: persistedHash,
    fixture_set_version: result.fixture_set_version, fixture_set_sha256: result.fixture_set_sha256,
    cases: result.cases.map((item) => ({
      case_id: item.case_id,
      final_source: item.final_source,
      subject_category: item.subject_category,
      hint_level: item.hint_level,
      bounded_cause_class: item.bounded_cause_class,
      bounded_cause_code: item.bounded_cause_code,
    })),
  }
  const sample = buildTutorHumanReviewSampleManifest(samplingInput)
  const selectedIds = new Set(sample.selected_cases.map((item) => item.case_id))
  const selected = [...transient.finalOutputs.entries()].filter(([caseId]) => selectedIds.has(caseId)).map(([, output]) => output)
  const packet = buildTutorHumanReviewPacket({
    source: {
      source_run_id: result.source_run_id, source_result_sha256: persistedHash,
      source_evaluation_manifest_version: result.evaluation_manifest_version,
      source_evaluator_version: result.evaluator_version, source_result_contract_version: result.result_contract_version,
      fixture_set_version: result.fixture_set_version, fixture_set_sha256: result.fixture_set_sha256,
      fixtures_expected: 120, fixtures_completed: result.fixtures_completed, coverage_complete: result.coverage_complete,
      final_outcome_fail_count: result.final_outcome_fail_count, system_safety_pass: result.system_safety_pass,
      source_result_persisted: true, source_result_hash_verified: true,
    },
    source_result_bytes: persisted.bytes, sample_manifest: sample, sampling_input: samplingInput,
    selected_final_outputs: selected, packet_created_at: packetCreatedAt,
  })
  await createTutorHumanReviewArtifact({ repositoryRoot, sourceRunId: result.source_run_id,
    artifactName: 'sample-manifest.json', value: sample })
  await createTutorHumanReviewArtifact({ repositoryRoot, sourceRunId: result.source_run_id,
    artifactName: 'review-packet.json', value: packet })
  transient.consumed = true
  transient.finalOutputs.clear()
  return Object.freeze({ sample_manifest_sha256: sample.sample_manifest_sha256,
    packet_sha256: packet.packet_sha256, selected_case_count: sample.selected_case_count })
}
