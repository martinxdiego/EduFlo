import { z } from 'zod'
import {
  canonicalNotReachedGateResults,
  evaluateTutorCandidateSafety,
  TUTOR_CANONICAL_FAILURE_GATE_BY_CODE,
  TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
  TUTOR_CANONICAL_SAFETY_GATE_ORDER,
  TUTOR_STRICT_VALUE_MENTION_CONTRACT_VERSION,
  TUTOR_STRICT_VALUE_MENTION_POLICY,
} from '../canonical-safety-gates.js'
import { localTutorFallback } from '../fallback-registry.js'
import { TUTOR_FALLBACK_REGISTRY_VERSION } from '../../contracts/phase3.js'
import { tutorLeakageEvidenceSchema } from './evaluation-evidence-contract.js'
import { TUTOR_PROVIDER_FAILURE_CODES } from './provider-diagnostics.js'

export const TUTOR_SYSTEM_SAFETY_EVALUATOR_VERSION_V5 = 'tutor-paid-evaluator-v5'
export const TUTOR_SYSTEM_SAFETY_RESULT_CONTRACT_VERSION_V3 = 'tutor-paid-evaluation-result-v3'
export const TUTOR_SYSTEM_SAFETY_EVALUATOR_VERSION = 'tutor-paid-evaluator-v6'
export const TUTOR_SYSTEM_SAFETY_RESULT_CONTRACT_VERSION = 'tutor-paid-evaluation-result-v4'
export const TUTOR_FALLBACK_RATE_THRESHOLD_STATUS = 'PRODUCT_DECISION_PENDING'

export const TUTOR_SYSTEM_SAFETY_CONTRACT_V5 = Object.freeze({
  evaluator_version: TUTOR_SYSTEM_SAFETY_EVALUATOR_VERSION_V5,
  result_contract_version: TUTOR_SYSTEM_SAFETY_RESULT_CONTRACT_VERSION_V3,
})
export const TUTOR_SYSTEM_SAFETY_CONTRACT = Object.freeze({
  evaluator_version: TUTOR_SYSTEM_SAFETY_EVALUATOR_VERSION,
  result_contract_version: TUTOR_SYSTEM_SAFETY_RESULT_CONTRACT_VERSION,
})

export const TUTOR_SYSTEM_SAFETY_EVALUATION_SEMANTICS_V5 = Object.freeze({
  contract_version: TUTOR_SYSTEM_SAFETY_RESULT_CONTRACT_VERSION_V3,
  canonical_safety_contract_version: TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
  provider_candidate_metric: 'R1_PROVIDER_CANDIDATE_QUALITY',
  final_outcome_metric: 'R2_FINAL_TUTOR_SYSTEM_SAFETY',
  system_safety_pass_rule: 'ALL_EXPECTED_FINAL_OUTCOMES_PASS_CANONICAL_SAFETY_GATES',
  provider_candidate_failure_can_use_local_fallback: true,
  fallback_rate_threshold_status: TUTOR_FALLBACK_RATE_THRESHOLD_STATUS,
  runtime_approval_effect: 'NONE',
  human_approval_effect: 'NONE',
  production_approval_effect: 'NONE',
})

export const TUTOR_SYSTEM_SAFETY_EVALUATION_SEMANTICS = Object.freeze({
  contract_version: TUTOR_SYSTEM_SAFETY_RESULT_CONTRACT_VERSION,
  canonical_safety_contract_version: TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
  provider_candidate_metric: 'R1_PROVIDER_CANDIDATE_QUALITY',
  final_outcome_metric: 'R2_FINAL_TUTOR_SYSTEM_SAFETY',
  system_safety_pass_rule: 'ALL_EXPECTED_FINAL_OUTCOMES_PASS_CANONICAL_SAFETY_GATES',
  provider_candidate_failure_can_use_local_fallback: true,
  unknown_provider_usage_policy: 'MAX_PER_CALL_RESERVATION_CONTINUES_WHILE_CAP_PROVEN',
  actual_cost_statuses: Object.freeze(['COMPLETE', 'PARTIAL_UNKNOWN']),
  fallback_rate_threshold_status: TUTOR_FALLBACK_RATE_THRESHOLD_STATUS,
  runtime_approval_effect: 'NONE',
  human_approval_effect: 'NONE',
  production_approval_effect: 'NONE',
})

const canonicalCodes = Object.keys(TUTOR_CANONICAL_FAILURE_GATE_BY_CODE)
const localFallbackCodes = canonicalCodes.map((code) => `LOCAL_FALLBACK_${code}`)
const gateResultSchema = z.object({
  gate: z.enum(TUTOR_CANONICAL_SAFETY_GATE_ORDER),
  state: z.enum(['PASS', 'FAIL', 'NOT_REACHED']),
}).strict()

const providerCandidateSchema = z.object({
  status: z.enum(['PASS', 'FAIL', 'PROVIDER_FAILURE']),
  code: z.enum([...canonicalCodes, ...TUTOR_PROVIDER_FAILURE_CODES]).nullable(),
  gate_results: z.array(gateResultSchema).length(TUTOR_CANONICAL_SAFETY_GATE_ORDER.length),
  leakage_evidence: tutorLeakageEvidenceSchema.nullable(),
  raw_provider_response_retained: z.literal(false),
}).strict()

const finalOutcomeSchema = z.object({
  status: z.enum(['PROVIDER_ACCEPTED', 'LOCAL_FALLBACK_ACCEPTED', 'FINAL_OUTCOME_FAIL']),
  source: z.enum(['openai', 'local', 'none']),
  code: z.enum(localFallbackCodes).nullable(),
  gate_results: z.array(gateResultSchema).length(TUTOR_CANONICAL_SAFETY_GATE_ORDER.length),
  raw_output_retained: z.literal(false),
}).strict()

function caseResultSchema(contract) {
  return z.object({
  evaluator_contract_version: z.literal(contract.evaluator_version),
  result_contract_version: z.literal(contract.result_contract_version),
  canonical_safety_contract_version: z.literal(TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION),
  leakage_contract_version: z.literal(TUTOR_STRICT_VALUE_MENTION_CONTRACT_VERSION),
  leakage_policy: z.literal(TUTOR_STRICT_VALUE_MENTION_POLICY),
  case_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/),
  repetition: z.number().int().positive(),
  provider_candidate: providerCandidateSchema,
  final_outcome: finalOutcomeSchema,
  fallback: z.object({
    used: z.boolean(),
    registry_version: z.literal(TUTOR_FALLBACK_REGISTRY_VERSION),
  }).strict(),
  raw_prompt_retained: z.literal(false),
  raw_answer_retained: z.literal(false),
  }).strict()
}

export const tutorSystemSafetyCaseResultSchemaV5 = caseResultSchema(TUTOR_SYSTEM_SAFETY_CONTRACT_V5)
export const tutorSystemSafetyCaseResultSchema = caseResultSchema(TUTOR_SYSTEM_SAFETY_CONTRACT)
const anyCaseResultSchema = z.union([tutorSystemSafetyCaseResultSchema, tutorSystemSafetyCaseResultSchemaV5])

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

function boundedCandidate(checked) {
  return {
    status: checked.passed ? 'PASS' : 'FAIL',
    code: checked.code,
    gate_results: checked.gate_results,
    leakage_evidence: checked.code === 'DIRECT_ANSWER_LEAKAGE' ? checked.failure_detail : null,
    raw_provider_response_retained: false,
  }
}

function fallbackOutcome(fixture, fallbackFactory) {
  let fallback
  try { fallback = fallbackFactory(fixture.level) } catch { return { checked: null, code: 'LOCAL_FALLBACK_SCHEMA_INVALID' } }
  const checked = evaluateTutorCandidateSafety(fallback, fixture)
  return { checked, code: checked.passed ? null : `LOCAL_FALLBACK_${checked.code}` }
}

function caseResult({ fixture, repetition, providerCandidate, finalOutcome, fallbackUsed, contract }) {
  return deepFreeze(anyCaseResultSchema.parse({
    evaluator_contract_version: contract.evaluator_version,
    result_contract_version: contract.result_contract_version,
    canonical_safety_contract_version: TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
    leakage_contract_version: TUTOR_STRICT_VALUE_MENTION_CONTRACT_VERSION,
    leakage_policy: TUTOR_STRICT_VALUE_MENTION_POLICY,
    case_id: fixture.case_id,
    repetition,
    provider_candidate: providerCandidate,
    final_outcome: finalOutcome,
    fallback: { used: fallbackUsed, registry_version: TUTOR_FALLBACK_REGISTRY_VERSION },
    raw_prompt_retained: false,
    raw_answer_retained: false,
  }))
}

export function evaluateTutorInteraction(candidate, fixture, {
  repetition = 1,
  fallbackFactory = localTutorFallback,
  contract = TUTOR_SYSTEM_SAFETY_CONTRACT,
} = {}) {
  const checked = evaluateTutorCandidateSafety(candidate, fixture)
  if (checked.passed) {
    return caseResult({
      fixture,
      repetition,
      providerCandidate: boundedCandidate(checked),
      finalOutcome: { status: 'PROVIDER_ACCEPTED', source: 'openai', code: null, gate_results: checked.gate_results, raw_output_retained: false },
      fallbackUsed: false,
      contract,
    })
  }
  const recovery = fallbackOutcome(fixture, fallbackFactory)
  return caseResult({
    fixture,
    repetition,
    providerCandidate: boundedCandidate(checked),
    finalOutcome: recovery.checked?.passed
      ? { status: 'LOCAL_FALLBACK_ACCEPTED', source: 'local', code: null, gate_results: recovery.checked.gate_results, raw_output_retained: false }
      : { status: 'FINAL_OUTCOME_FAIL', source: 'none', code: recovery.code, gate_results: recovery.checked?.gate_results || canonicalNotReachedGateResults(), raw_output_retained: false },
    fallbackUsed: true,
    contract,
  })
}

export function evaluateTutorProviderFailure(fixture, reasonCode, {
  repetition = 1,
  fallbackFactory = localTutorFallback,
  contract = TUTOR_SYSTEM_SAFETY_CONTRACT,
} = {}) {
  if (!TUTOR_PROVIDER_FAILURE_CODES.includes(reasonCode)) throw new Error('UNBOUNDED_PROVIDER_FAILURE_CODE')
  const recovery = fallbackOutcome(fixture, fallbackFactory)
  return caseResult({
    fixture,
    repetition,
    providerCandidate: {
      status: 'PROVIDER_FAILURE', code: reasonCode, gate_results: canonicalNotReachedGateResults(),
      leakage_evidence: null, raw_provider_response_retained: false,
    },
    finalOutcome: recovery.checked?.passed
      ? { status: 'LOCAL_FALLBACK_ACCEPTED', source: 'local', code: null, gate_results: recovery.checked.gate_results, raw_output_retained: false }
      : { status: 'FINAL_OUTCOME_FAIL', source: 'none', code: recovery.code, gate_results: recovery.checked?.gate_results || canonicalNotReachedGateResults(), raw_output_retained: false },
    fallbackUsed: true,
    contract,
  })
}

export function aggregateTutorSystemSafety(caseResults, expectedCount, { contract = null } = {}) {
  const results = caseResults.map((item) => anyCaseResultSchema.parse(item))
  const effectiveContract = contract || (results.length ? Object.freeze({
    evaluator_version: results[0].evaluator_contract_version,
    result_contract_version: results[0].result_contract_version,
  }) : TUTOR_SYSTEM_SAFETY_CONTRACT)
  if (results.some((item) => item.evaluator_contract_version !== effectiveContract.evaluator_version
    || item.result_contract_version !== effectiveContract.result_contract_version)) {
    throw new Error('MIXED_EVALUATION_RESULT_CONTRACTS')
  }
  const rejectionReasons = {}
  for (const item of results) {
    if (item.provider_candidate.status !== 'PASS') {
      rejectionReasons[item.provider_candidate.code] = (rejectionReasons[item.provider_candidate.code] || 0) + 1
    }
  }
  const fallbackCount = results.filter((item) => item.fallback.used).length
  const finalSafeCount = results.filter((item) => item.final_outcome.status !== 'FINAL_OUTCOME_FAIL').length
  return deepFreeze({
    evaluator_contract_version: effectiveContract.evaluator_version,
    result_contract_version: effectiveContract.result_contract_version,
    canonical_safety_contract_version: TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
    expected_case_count: expectedCount,
    completed_case_count: results.length,
    r1_provider_candidate_quality: {
      provider_candidate_pass_count: results.filter((item) => item.provider_candidate.status === 'PASS').length,
      provider_candidate_fail_count: results.filter((item) => item.provider_candidate.status === 'FAIL').length,
      provider_failure_count: results.filter((item) => item.provider_candidate.status === 'PROVIDER_FAILURE').length,
      rejection_reason_distribution: rejectionReasons,
      fallback_count: fallbackCount,
      fallback_rate: results.length ? fallbackCount / results.length : 0,
      fallback_rate_threshold_status: TUTOR_FALLBACK_RATE_THRESHOLD_STATUS,
    },
    r2_final_tutor_system_safety: {
      final_safe_count: finalSafeCount,
      final_outcome_fail_count: results.length - finalSafeCount,
      system_safety_pass: results.length === expectedCount && finalSafeCount === expectedCount,
    },
    runtime_approval_effect: 'NONE',
    human_approval_effect: 'NONE',
    production_approval_effect: 'NONE',
  })
}
