import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { resolveLearningV2Capabilities } from '../../feature-flags/learning-v2.js'
import { tutorSyntheticEvalCases } from '../eval-fixtures.js'
import { TUTOR_PROMPT_REGISTRY } from '../prompt-registry.js'
import { TUTOR_RUNTIME_APPROVAL_CONTRACT, TutorRuntimeApprovalGate } from '../governance/runtime-approval.js'
import {
  conservativeMaximumEvaluationCost,
  tutorEvaluationScopeFingerprint,
  tutorFixtureSetHash,
  TUTOR_PAID_EVALUATION_MANIFEST_V5,
} from './evaluation-manifest.js'
import { TUTOR_FROZEN_TOKEN_PRICING } from './pricing-contract.js'

export const EVIDENCE_HARDENED_RUN_1_OPT_IN = 'RUN_TUTOR_PROVIDER_EVAL_V5_RUN_1'
export const EVIDENCE_HARDENED_RUN_1_MANIFEST_VERSION = 'tutor-paid-evaluation-v5-run-1-v1'
export const EVIDENCE_HARDENED_RUN_1_AUTHORIZATION = 'PAID_SYNTHETIC_EVALUATION_V5_RUN_1_ONLY'

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

export const TUTOR_EVIDENCE_HARDENED_RUN_1_MANIFEST = deepFreeze({
  run_manifest_version: EVIDENCE_HARDENED_RUN_1_MANIFEST_VERSION,
  evaluator_version: 'tutor-paid-evaluator-v4',
  result_contract_version: 'tutor-paid-evaluation-result-v2',
  leakage_contract_version: 'tutor-direct-answer-leakage-v1',
  leakage_policy: 'STRICT_VALUE_MENTION',
  source_evaluation_manifest_version: 'tutor-paid-evaluation-v5',
  source_evaluation_scope_fingerprint: 'sha256:2774461222995a1c6433e426a2e8d12bd9d0cfa4cf7ecf615b57cb3bf79f21ce',
  authorization: EVIDENCE_HARDENED_RUN_1_AUTHORIZATION,
  runtime_approval_effect: 'NONE',
  synthetic_data_only: true,
  fixture_set_version: 'tutor-synthetic-fixtures-v1',
  fixture_set_hash: 'sha256:07b1d7ce1d9e0d4dfd6d18ac1850f5e0185964dd6e9a2d4818b1186763395905',
  fixture_count: 120,
  repetition_count: 1,
  provider_id: 'openai',
  model_id: 'gpt-5.6-terra',
  prompt_version: 'tutor-guidance-v2',
  prompt_digest: 'sha256:0332e4f354c8b495e5592f30bf3c41150810528864ac453837f74ce0b1d95c2b',
  schema_version: 'tutor-provider-response-v1',
  pricing_contract_version: 'openai-gpt-5.6-terra-standard-pricing-v1',
  pricing_ref: 'openai:gpt-5.6-terra:standard-api:2026-07-30:v1',
  pricing_mode: 'STANDARD_API',
  service_tier: 'default',
  frozen_token_pricing: structuredClone(TUTOR_FROZEN_TOKEN_PRICING),
  max_http_calls: 120,
  max_retries: 0,
  provider_failover: false,
  timeout_ms: 6_000,
  max_input_tokens_per_call: 40_000,
  max_output_tokens_per_call: 160,
  max_input_tokens: 4_800_000,
  max_output_tokens: 19_200,
  max_total_tokens: 4_819_200,
  max_cost: 10,
  currency: 'USD',
})

export function evidenceHardenedRun1ContractHash(manifest = TUTOR_EVIDENCE_HARDENED_RUN_1_MANIFEST) {
  return `sha256:${createHash('sha256').update(JSON.stringify(manifest)).digest('hex')}`
}

export function evidenceHardenedRun1Governance(environment = process.env, approval = TUTOR_RUNTIME_APPROVAL_CONTRACT) {
  const allRequested = Object.fromEntries([
    'LEARNING_V2_ENABLED', 'LEARNING_V2_PHASE_2_ENABLED', 'LEARNING_V2_PHASE_3_ENABLED',
    'LEARNING_V2_PHASE_3B_ENABLED', 'LEARNING_V2_PHASE_4_ENABLED', 'LEARNING_V2_PHASE_5_ENABLED',
  ].map((name) => [name, '1']))
  const production = resolveLearningV2Capabilities({ ...allRequested, NODE_ENV: 'production' })
  const gate = new TutorRuntimeApprovalGate({ environment, contract: approval })
  return Object.freeze({
    approved_for_runtime: approval.approved_for_runtime,
    human_review_status: approval.human_review.status,
    reviewer_ref: approval.human_review.reviewer_ref,
    review_ref: approval.human_review.review_ref,
    approved_at: approval.human_review.approved_at,
    runtime_gate_allowed: gate.evaluate(gate.configuration()).allowed,
    production_capabilities_all_off: Object.values(production).every((value) => value === false),
  })
}

export function evidenceHardenedRun1Readiness({
  environment = process.env,
  manifest = TUTOR_EVIDENCE_HARDENED_RUN_1_MANIFEST,
  fixtures = tutorSyntheticEvalCases(),
  approval = TUTOR_RUNTIME_APPROVAL_CONTRACT,
} = {}) {
  const blocked = (reason_code) => Object.freeze({ status: 'BLOCKED', runnable: false, reason_code, http_calls: 0 })
  if (environment.RUN_TUTOR_PROVIDER_EVALS !== '1' || environment[EVIDENCE_HARDENED_RUN_1_OPT_IN] !== '1') {
    return blocked('EVIDENCE_HARDENED_RUN_1_EXPLICIT_OPT_IN_REQUIRED')
  }
  if (!['development', 'test'].includes(environment.NODE_ENV)) return blocked('EVIDENCE_HARDENED_RUN_1_ENVIRONMENT_NOT_ALLOWED')
  if (!environment.OPENAI_API_KEY?.trim()) return blocked('PROVIDER_CREDENTIALS_REQUIRED')
  if (['RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE', 'RUN_TUTOR_PROVIDER_EVAL_RUN_2', 'RUN_TUTOR_PROVIDER_EVAL_V2_PROMPT_RUN_1']
    .some((name) => environment[name] === '1')) return blocked('OTHER_PAID_EVALUATION_OPT_IN_MUST_BE_OFF')
  if (environment.LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED === '1') return blocked('RUNTIME_GATE_MUST_BE_OFF')
  if (!isDeepStrictEqual(manifest, TUTOR_EVIDENCE_HARDENED_RUN_1_MANIFEST)) {
    return blocked('EVIDENCE_HARDENED_RUN_1_CONTRACT_MISMATCH')
  }
  if (!isDeepStrictEqual(manifest.frozen_token_pricing, TUTOR_FROZEN_TOKEN_PRICING)) {
    return blocked('FROZEN_PRICING_CONTRACT_MISMATCH')
  }

  const source = TUTOR_PAID_EVALUATION_MANIFEST_V5
  if (source.eval_manifest_version !== manifest.source_evaluation_manifest_version
    || source.evaluator_version !== manifest.evaluator_version
    || source.result_contract_version !== manifest.result_contract_version
    || source.leakage_contract_version !== manifest.leakage_contract_version
    || source.leakage_policy !== manifest.leakage_policy
    || source.scope_fingerprint !== manifest.source_evaluation_scope_fingerprint
    || tutorEvaluationScopeFingerprint(source) !== manifest.source_evaluation_scope_fingerprint
    || source.fixture_set_version !== manifest.fixture_set_version
    || source.fixture_set_hash !== manifest.fixture_set_hash
    || source.fixture_count !== manifest.fixture_count
    || source.repetition_count !== manifest.repetition_count
    || ['provider_id', 'model_id', 'prompt_version', 'prompt_digest', 'schema_version', 'currency'].some((field) => source[field] !== manifest[field])
    || source.frozen_token_pricing.pricing_contract_version !== manifest.pricing_contract_version
    || source.frozen_token_pricing.pricing_ref !== manifest.pricing_ref
    || source.frozen_token_pricing.pricing_mode !== manifest.pricing_mode
    || source.frozen_token_pricing.provider_request_service_tier !== manifest.service_tier
    || source.evaluation_authorization.scope !== 'SYNTHETIC_EVALUATION_CONFIGURATION_ONLY'
    || source.evaluation_authorization.status !== 'NOT_AUTHORIZED'
    || source.evaluation_authorization.runtime_approval_effect !== 'NONE') {
    return blocked('SOURCE_EVALUATION_CONTRACT_MISMATCH')
  }
  for (const field of ['max_http_calls', 'max_input_tokens', 'max_output_tokens', 'max_total_tokens',
    'max_input_tokens_per_call', 'max_output_tokens_per_call', 'max_cost']) {
    if (source[field] !== manifest[field]) return blocked('SOURCE_EVALUATION_LIMIT_MISMATCH')
  }

  const prompt = TUTOR_PROMPT_REGISTRY[manifest.prompt_version]
  if (!prompt || prompt.model !== manifest.model_id || prompt.digest !== manifest.prompt_digest) {
    return blocked('PROMPT_CONTRACT_MISMATCH')
  }
  if (!Array.isArray(fixtures) || fixtures.length !== 120 || tutorFixtureSetHash(fixtures) !== manifest.fixture_set_hash
    || new Set(fixtures.map((fixture) => fixture.case_id)).size !== 120) {
    return blocked('FROZEN_FIXTURE_SET_MISMATCH')
  }

  let governance
  try { governance = evidenceHardenedRun1Governance(environment, approval) } catch { return blocked('GOVERNANCE_NOT_CLOSED') }
  if (governance.approved_for_runtime !== false || governance.human_review_status !== 'NOT_REVIEWED'
    || governance.reviewer_ref !== null || governance.review_ref !== null || governance.approved_at !== null
    || governance.runtime_gate_allowed !== false || !governance.production_capabilities_all_off) {
    return blocked('GOVERNANCE_NOT_CLOSED')
  }
  const maximum_cost = conservativeMaximumEvaluationCost(manifest)
  if (maximum_cost !== 9.8304 || maximum_cost > manifest.max_cost) return blocked('MAXIMUM_COST_EXCEEDS_CAP')
  return Object.freeze({
    status: 'READY',
    runnable: true,
    reason_code: null,
    maximum_cost,
    max_cost: manifest.max_cost,
    currency: manifest.currency,
    run_contract_hash: evidenceHardenedRun1ContractHash(manifest),
    governance,
  })
}
