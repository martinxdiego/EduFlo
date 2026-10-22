import { isDeepStrictEqual } from 'node:util'
import { tutorSyntheticEvalCases } from '../eval-fixtures.js'
import { TUTOR_PAID_EVALUATION_MANIFEST_V3, tutorFixtureSetHash, conservativeMaximumEvaluationCost } from './evaluation-manifest.js'
import { TUTOR_FROZEN_TOKEN_PRICING } from './pricing-contract.js'
import { TUTOR_RUNTIME_APPROVAL_CONTRACT, TutorRuntimeApprovalGate } from '../governance/runtime-approval.js'
import { resolveLearningV2Capabilities } from '../../feature-flags/learning-v2.js'

export const DIAGNOSTIC_PROBE_OPT_IN = 'RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE'
export const TUTOR_DIAGNOSTIC_PROBE_MANIFEST = Object.freeze({
  diagnostic_manifest_version: 'tutor-paid-diagnostic-probe-v1',
  evaluator_version: 'tutor-paid-diagnostic-probe-runner-v1',
  authorization: 'PAID_SYNTHETIC_DIAGNOSTIC_PROBE_ONLY',
  runtime_approval_effect: 'NONE',
  synthetic_data_only: true,
  source_manifest_version: 'tutor-paid-evaluation-v3',
  fixture_set_version: 'tutor-synthetic-fixtures-v1',
  fixture_set_hash: 'sha256:07b1d7ce1d9e0d4dfd6d18ac1850f5e0185964dd6e9a2d4818b1186763395905',
  source_fixture_count: 120,
  case_id: 'tutor-synthetic-003',
  case_hash: 'sha256:865816da8309f6f9b34bb9eab6915ef696405ce7483b476c5300c26591f75c27',
  fixture_count: 1,
  repetition_count: 1,
  provider_id: 'openai',
  model_id: 'gpt-5.6-terra',
  prompt_version: 'tutor-guidance-v1',
  schema_version: 'tutor-provider-response-v1',
  service_tier: 'default',
  max_http_calls: 1,
  max_retries: 0,
  provider_failover: false,
  timeout_ms: 6_000,
  max_input_tokens: 40_000,
  max_output_tokens: 160,
  max_total_tokens: 40_160,
  max_cost: 0.10,
  currency: 'USD',
  frozen_token_pricing: Object.freeze({
    pricing_contract_version: 'openai-gpt-5.6-terra-standard-pricing-v1',
    pricing_ref: 'openai:gpt-5.6-terra:standard-api:2026-07-30:v1',
    pricing_mode: 'STANDARD_API',
    provider_request_service_tier: 'default',
    input_pricing_basis: 'UNCACHED_INPUT',
    cached_input_discount_applied: false,
    input_per_million: 2,
    output_per_million: 12,
    currency: 'USD',
  }),
})

export function diagnosticGovernanceSnapshot(environment = process.env, approval = TUTOR_RUNTIME_APPROVAL_CONTRACT) {
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

export function diagnosticProbeReadiness({ environment = process.env, manifest = TUTOR_DIAGNOSTIC_PROBE_MANIFEST,
  fixtures = tutorSyntheticEvalCases(), approval = TUTOR_RUNTIME_APPROVAL_CONTRACT } = {}) {
  const blocked = (reason_code) => Object.freeze({ status: 'BLOCKED', runnable: false, reason_code, http_calls: 0 })
  if (environment[DIAGNOSTIC_PROBE_OPT_IN] !== '1') return blocked('DIAGNOSTIC_OPT_IN_REQUIRED')
  if (!['development', 'test'].includes(environment.NODE_ENV)) return blocked('PROBE_ENVIRONMENT_NOT_ALLOWED')
  if (!environment.OPENAI_API_KEY?.trim()) return blocked('PROVIDER_CREDENTIALS_REQUIRED')
  if (environment.RUN_TUTOR_PROVIDER_EVALS === '1') return blocked('FULL_EVALUATION_OPT_IN_MUST_BE_OFF')
  if (environment.LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED === '1') return blocked('RUNTIME_GATE_MUST_BE_OFF')
  if (!isDeepStrictEqual(manifest, TUTOR_DIAGNOSTIC_PROBE_MANIFEST)) return blocked('FROZEN_PROBE_CONTRACT_MISMATCH')
  if (!isDeepStrictEqual(manifest.frozen_token_pricing, TUTOR_FROZEN_TOKEN_PRICING)) return blocked('FROZEN_PRICING_CONTRACT_MISMATCH')
  const source = TUTOR_PAID_EVALUATION_MANIFEST_V3
  if (source.eval_manifest_version !== manifest.source_manifest_version
    || source.fixture_set_version !== manifest.fixture_set_version || source.fixture_set_hash !== manifest.fixture_set_hash
    || ['provider_id', 'model_id', 'prompt_version', 'schema_version'].some((field) => source[field] !== manifest[field])) {
    return blocked('SOURCE_MANIFEST_MISMATCH')
  }
  if (!Array.isArray(fixtures) || fixtures.length !== manifest.source_fixture_count
    || tutorFixtureSetHash(fixtures) !== manifest.fixture_set_hash
    || tutorFixtureSetHash(fixtures.filter((fixture) => fixture.case_id === manifest.case_id)) !== manifest.case_hash) {
    return blocked('FROZEN_FIXTURE_MISMATCH')
  }
  let governance
  try { governance = diagnosticGovernanceSnapshot(environment, approval) } catch { return blocked('GOVERNANCE_NOT_CLOSED') }
  if (governance.approved_for_runtime !== false || governance.human_review_status !== 'NOT_REVIEWED'
    || governance.reviewer_ref !== null || governance.review_ref !== null || governance.approved_at !== null
    || governance.runtime_gate_allowed !== false || !governance.production_capabilities_all_off) return blocked('GOVERNANCE_NOT_CLOSED')
  const maximum_cost = conservativeMaximumEvaluationCost(manifest)
  if (maximum_cost !== 0.08192 || maximum_cost > manifest.max_cost) return blocked('MAXIMUM_COST_EXCEEDS_CAP')
  return Object.freeze({ status: 'READY', runnable: true, reason_code: null, maximum_cost, max_cost: manifest.max_cost, currency: manifest.currency, governance })
}
