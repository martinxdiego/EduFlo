import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  TUTOR_FALLBACK_REGISTRY_VERSION,
  TUTOR_MODEL,
  TUTOR_PROMPT_VERSION,
  TUTOR_PROMPT_VERSION_V1,
  TUTOR_PROMPT_VERSION_V2,
  TUTOR_PROVIDER_SCHEMA_VERSION,
} from '../../contracts/phase3.js'
import { TUTOR_SYNTHETIC_FIXTURE_SET_VERSION } from '../eval-fixtures.js'
import { TUTOR_PROMPT_V2_DIGEST, TUTOR_PROMPT_V3_DIGEST } from '../prompt-registry.js'
import {
  TUTOR_HUMAN_REVIEW_CRITERIA,
  TUTOR_HUMAN_REVIEW_RUBRIC_REF,
  TUTOR_HUMAN_REVIEW_WORKFLOW_REF,
  TUTOR_HUMAN_REVIEWER_ROLE,
} from '../governance/human-review-workflow.js'
import {
  TUTOR_FROZEN_TOKEN_PRICING,
  TUTOR_PRICING_CONTRACT_VERSION,
  TUTOR_PRICING_REF,
  TUTOR_STANDARD_SERVICE_TIER,
} from './pricing-contract.js'
import {
  TUTOR_EVALUATION_RESULT_CONTRACT_VERSION,
  TUTOR_EVALUATOR_CONTRACT_VERSION,
  TUTOR_LEAKAGE_CONTRACT_VERSION,
  TUTOR_LEAKAGE_POLICY,
} from './evaluation-evidence-contract.js'
import {
  TUTOR_FALLBACK_RATE_THRESHOLD_STATUS,
  TUTOR_SYSTEM_SAFETY_EVALUATION_SEMANTICS,
  TUTOR_SYSTEM_SAFETY_EVALUATION_SEMANTICS_V5,
  TUTOR_SYSTEM_SAFETY_EVALUATOR_VERSION,
  TUTOR_SYSTEM_SAFETY_EVALUATOR_VERSION_V5,
  TUTOR_SYSTEM_SAFETY_RESULT_CONTRACT_VERSION,
  TUTOR_SYSTEM_SAFETY_RESULT_CONTRACT_VERSION_V3,
} from './system-safety-evaluation-contract.js'
import { TUTOR_EVALUATION_ACCOUNTING_CONTRACT_VERSION } from './evaluation-accounting-contract.js'
import { TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION } from '../canonical-safety-gates.js'

export const TUTOR_EVAL_MANIFEST_VERSION_V3 = 'tutor-paid-evaluation-v3'
export const TUTOR_EVAL_MANIFEST_VERSION_V4 = 'tutor-paid-evaluation-v4'
export const TUTOR_EVAL_MANIFEST_VERSION_V5 = 'tutor-paid-evaluation-v5'
export const TUTOR_EVAL_MANIFEST_VERSION_V6 = 'tutor-paid-evaluation-v6'
export const TUTOR_EVAL_MANIFEST_VERSION_V7 = 'tutor-paid-evaluation-v7'
export const TUTOR_EVAL_MANIFEST_VERSION = 'tutor-paid-evaluation-v8'
export const TUTOR_EVALUATOR_VERSION_V1 = 'tutor-paid-evaluator-v1'
export const TUTOR_EVALUATOR_VERSION_V3 = 'tutor-paid-evaluator-v3'
export const TUTOR_EVALUATOR_VERSION_V4 = TUTOR_EVALUATOR_CONTRACT_VERSION
export const TUTOR_EVALUATOR_VERSION = TUTOR_SYSTEM_SAFETY_EVALUATOR_VERSION
export const TUTOR_EVALUATION_MAX_COST = 10
export const TUTOR_EVALUATION_CURRENCY = 'USD'

const fixtureSetHash = 'sha256:07b1d7ce1d9e0d4dfd6d18ac1850f5e0185964dd6e9a2d4818b1186763395905'

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

export function tutorFixtureSetHash(fixtures) {
  return `sha256:${createHash('sha256').update(JSON.stringify(fixtures)).digest('hex')}`
}

const humanReviewSchema = z.object({
  rubric_ref: z.literal(TUTOR_HUMAN_REVIEW_RUBRIC_REF),
  workflow_ref: z.literal(TUTOR_HUMAN_REVIEW_WORKFLOW_REF),
  required_reviewer_role: z.literal(TUTOR_HUMAN_REVIEWER_ROLE),
  criteria: z.array(z.enum([
    'clarity',
    'pedagogical_appropriateness',
    'hint_level_discipline',
    'cognitive_work_preservation',
    'factual_correctness',
    'no_solution_leakage',
    'locale_and_tone',
  ])).length(7),
  reviewer_ref: z.null(),
  review_ref: z.null(),
  review_status: z.literal('NOT_REVIEWED'),
}).strict()

const frozenPricingSchema = z.object({
  pricing_contract_version: z.string().trim().min(1).max(160),
  pricing_ref: z.string().trim().min(1).max(200),
  pricing_mode: z.string().trim().min(1).max(40),
  provider_request_service_tier: z.string().trim().min(1).max(40),
  input_pricing_basis: z.string().trim().min(1).max(40),
  cached_input_discount_applied: z.boolean(),
  input_per_million: z.number().nonnegative(),
  output_per_million: z.number().nonnegative(),
  currency: z.string().trim().length(3),
}).strict().nullable()

const commonManifestFields = {
  fixture_set_version: z.string().trim().min(1).max(120),
  fixture_set_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  fixture_count: z.number().int().positive(),
  provider_id: z.literal('openai'),
  model_id: z.literal(TUTOR_MODEL),
  schema_version: z.literal(TUTOR_PROVIDER_SCHEMA_VERSION),
  repetition_count: z.number().int().positive(),
  max_http_calls: z.number().int().positive(),
  max_input_tokens: z.number().int().positive(),
  max_output_tokens: z.number().int().positive(),
  max_total_tokens: z.number().int().positive(),
  max_input_tokens_per_call: z.number().int().positive(),
  max_output_tokens_per_call: z.number().int().positive(),
  max_cost: z.number().nonnegative().nullable(),
  currency: z.string().trim().length(3).nullable(),
  frozen_token_pricing: frozenPricingSchema,
  automated_criteria: z.array(z.enum([
    'strict_schema', 'hidden_answer_leakage', 'forbidden_authority', 'hint_level',
    'full_solution', 'locale_de_ch', 'bounded_output', 'local_fallback_independent',
  ])).length(8),
  local_fallback_comparison: z.object({
    registry_version: z.string().trim().min(1).max(120),
    must_remain_independently_valid: z.literal(true),
  }).strict(),
  human_review: humanReviewSchema,
  result_status: z.enum(['NOT_RUN', 'BLOCKED', 'PASS_TECHNICAL', 'FAIL']),
}

const historicalManifestV3Schema = z.object({
  eval_manifest_version: z.literal(TUTOR_EVAL_MANIFEST_VERSION_V3),
  evaluator_version: z.literal(TUTOR_EVALUATOR_VERSION_V1),
  ...commonManifestFields,
  prompt_version: z.literal(TUTOR_PROMPT_VERSION_V1),
  evaluation_authorization: z.object({
    scope: z.literal('PAID_SYNTHETIC_EVALUATION_ONLY'),
    status: z.literal('READY_FOR_CONTROLLED_PAID_EVALUATION'),
    synthetic_data_only: z.literal(true),
    runtime_approval_effect: z.literal('NONE'),
  }).strict(),
}).strict()

const historicalManifestV4Schema = z.object({
  eval_manifest_version: z.literal(TUTOR_EVAL_MANIFEST_VERSION_V4),
  evaluator_version: z.literal(TUTOR_EVALUATOR_VERSION_V3),
  supersedes_manifest_version: z.literal(TUTOR_EVAL_MANIFEST_VERSION_V3),
  revision_reason: z.literal('LOCALE_DE_CH_PROMPT_ALIGNMENT'),
  ...commonManifestFields,
  prompt_version: z.literal(TUTOR_PROMPT_VERSION_V2),
  prompt_digest: z.literal(TUTOR_PROMPT_V2_DIGEST),
  scope_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  evaluation_authorization: z.object({
    scope: z.literal('SYNTHETIC_EVALUATION_CONFIGURATION_ONLY'),
    status: z.literal('NOT_AUTHORIZED'),
    synthetic_data_only: z.literal(true),
    runtime_approval_effect: z.literal('NONE'),
  }).strict(),
}).strict()

const historicalManifestV5Schema = z.object({
  eval_manifest_version: z.literal(TUTOR_EVAL_MANIFEST_VERSION_V5),
  evaluator_version: z.literal(TUTOR_EVALUATOR_VERSION_V4),
  result_contract_version: z.literal(TUTOR_EVALUATION_RESULT_CONTRACT_VERSION),
  leakage_contract_version: z.literal(TUTOR_LEAKAGE_CONTRACT_VERSION),
  leakage_policy: z.literal(TUTOR_LEAKAGE_POLICY),
  supersedes_manifest_version: z.literal(TUTOR_EVAL_MANIFEST_VERSION_V4),
  revision_reason: z.literal('STRICT_VALUE_MENTION_EVIDENCE_HARDENING'),
  ...commonManifestFields,
  prompt_version: z.literal(TUTOR_PROMPT_VERSION_V2),
  prompt_digest: z.literal(TUTOR_PROMPT_V2_DIGEST),
  scope_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  evaluation_authorization: z.object({
    scope: z.literal('SYNTHETIC_EVALUATION_CONFIGURATION_ONLY'),
    status: z.literal('NOT_AUTHORIZED'),
    synthetic_data_only: z.literal(true),
    runtime_approval_effect: z.literal('NONE'),
  }).strict(),
}).strict()

const historicalManifestV6Schema = z.object({
  eval_manifest_version: z.literal(TUTOR_EVAL_MANIFEST_VERSION_V6),
  evaluator_version: z.literal(TUTOR_EVALUATOR_VERSION_V4),
  result_contract_version: z.literal(TUTOR_EVALUATION_RESULT_CONTRACT_VERSION),
  leakage_contract_version: z.literal(TUTOR_LEAKAGE_CONTRACT_VERSION),
  leakage_policy: z.literal(TUTOR_LEAKAGE_POLICY),
  supersedes_manifest_version: z.literal(TUTOR_EVAL_MANIFEST_VERSION_V5),
  revision_reason: z.literal('ANSWER_OPTION_TEXT_AVOIDANCE_ALIGNMENT'),
  ...commonManifestFields,
  prompt_version: z.literal(TUTOR_PROMPT_VERSION),
  prompt_digest: z.literal(TUTOR_PROMPT_V3_DIGEST),
  scope_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  evaluation_authorization: z.object({
    scope: z.literal('SYNTHETIC_EVALUATION_CONFIGURATION_ONLY'),
    status: z.literal('NOT_AUTHORIZED'),
    synthetic_data_only: z.literal(true),
    runtime_approval_effect: z.literal('NONE'),
  }).strict(),
}).strict()

const historicalManifestV7Schema = z.object({
  eval_manifest_version: z.literal(TUTOR_EVAL_MANIFEST_VERSION_V7),
  evaluator_version: z.literal(TUTOR_SYSTEM_SAFETY_EVALUATOR_VERSION_V5),
  result_contract_version: z.literal(TUTOR_SYSTEM_SAFETY_RESULT_CONTRACT_VERSION_V3),
  canonical_safety_contract_version: z.literal(TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION),
  leakage_contract_version: z.literal(TUTOR_LEAKAGE_CONTRACT_VERSION),
  leakage_policy: z.literal(TUTOR_LEAKAGE_POLICY),
  evaluation_semantics: z.object({
    contract_version: z.literal(TUTOR_SYSTEM_SAFETY_RESULT_CONTRACT_VERSION_V3),
    canonical_safety_contract_version: z.literal(TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION),
    provider_candidate_metric: z.literal('R1_PROVIDER_CANDIDATE_QUALITY'),
    final_outcome_metric: z.literal('R2_FINAL_TUTOR_SYSTEM_SAFETY'),
    system_safety_pass_rule: z.literal('ALL_EXPECTED_FINAL_OUTCOMES_PASS_CANONICAL_SAFETY_GATES'),
    provider_candidate_failure_can_use_local_fallback: z.literal(true),
    fallback_rate_threshold_status: z.literal(TUTOR_FALLBACK_RATE_THRESHOLD_STATUS),
    runtime_approval_effect: z.literal('NONE'),
    human_approval_effect: z.literal('NONE'),
    production_approval_effect: z.literal('NONE'),
  }).strict(),
  supersedes_manifest_version: z.literal(TUTOR_EVAL_MANIFEST_VERSION_V6),
  revision_reason: z.literal('SAFE_FALLBACK_RUNTIME_SEMANTICS'),
  ...commonManifestFields,
  prompt_version: z.literal(TUTOR_PROMPT_VERSION),
  prompt_digest: z.literal(TUTOR_PROMPT_V3_DIGEST),
  scope_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  evaluation_authorization: z.object({
    scope: z.literal('SYNTHETIC_EVALUATION_CONFIGURATION_ONLY'),
    status: z.literal('NOT_AUTHORIZED'),
    synthetic_data_only: z.literal(true),
    runtime_approval_effect: z.literal('NONE'),
  }).strict(),
}).strict()

export const tutorEvaluationManifestSchema = z.object({
  eval_manifest_version: z.literal(TUTOR_EVAL_MANIFEST_VERSION),
  evaluator_version: z.literal(TUTOR_EVALUATOR_VERSION),
  result_contract_version: z.literal(TUTOR_SYSTEM_SAFETY_RESULT_CONTRACT_VERSION),
  canonical_safety_contract_version: z.literal(TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION),
  leakage_contract_version: z.literal(TUTOR_LEAKAGE_CONTRACT_VERSION),
  leakage_policy: z.literal(TUTOR_LEAKAGE_POLICY),
  accounting_contract_version: z.literal(TUTOR_EVALUATION_ACCOUNTING_CONTRACT_VERSION),
  evaluation_semantics: z.object({
    contract_version: z.literal(TUTOR_SYSTEM_SAFETY_RESULT_CONTRACT_VERSION),
    canonical_safety_contract_version: z.literal(TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION),
    provider_candidate_metric: z.literal('R1_PROVIDER_CANDIDATE_QUALITY'),
    final_outcome_metric: z.literal('R2_FINAL_TUTOR_SYSTEM_SAFETY'),
    system_safety_pass_rule: z.literal('ALL_EXPECTED_FINAL_OUTCOMES_PASS_CANONICAL_SAFETY_GATES'),
    provider_candidate_failure_can_use_local_fallback: z.literal(true),
    unknown_provider_usage_policy: z.literal('MAX_PER_CALL_RESERVATION_CONTINUES_WHILE_CAP_PROVEN'),
    actual_cost_statuses: z.tuple([z.literal('COMPLETE'), z.literal('PARTIAL_UNKNOWN')]),
    fallback_rate_threshold_status: z.literal(TUTOR_FALLBACK_RATE_THRESHOLD_STATUS),
    runtime_approval_effect: z.literal('NONE'),
    human_approval_effect: z.literal('NONE'),
    production_approval_effect: z.literal('NONE'),
  }).strict(),
  supersedes_manifest_version: z.literal(TUTOR_EVAL_MANIFEST_VERSION_V7),
  revision_reason: z.literal('UNKNOWN_USAGE_CONSERVATIVE_BUDGET_ACCOUNTING'),
  ...commonManifestFields,
  prompt_version: z.literal(TUTOR_PROMPT_VERSION),
  prompt_digest: z.literal(TUTOR_PROMPT_V3_DIGEST),
  scope_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  evaluation_authorization: z.object({
    scope: z.literal('SYNTHETIC_EVALUATION_CONFIGURATION_ONLY'),
    status: z.literal('NOT_AUTHORIZED'),
    synthetic_data_only: z.literal(true),
    runtime_approval_effect: z.literal('NONE'),
  }).strict(),
}).strict()

const commonManifest = {
  fixture_set_version: TUTOR_SYNTHETIC_FIXTURE_SET_VERSION,
  fixture_set_hash: fixtureSetHash,
  fixture_count: 120,
  provider_id: 'openai',
  model_id: TUTOR_MODEL,
  schema_version: TUTOR_PROVIDER_SCHEMA_VERSION,
  repetition_count: 1,
  max_http_calls: 120,
  // The runtime context is bounded by characters, not a provider tokenizer.
  // This byte-level upper bound remains conservative without guessing tokens.
  max_input_tokens: 4_800_000,
  max_output_tokens: 19_200,
  max_total_tokens: 4_819_200,
  max_input_tokens_per_call: 40_000,
  max_output_tokens_per_call: 160,
  max_cost: TUTOR_EVALUATION_MAX_COST,
  currency: TUTOR_EVALUATION_CURRENCY,
  frozen_token_pricing: TUTOR_FROZEN_TOKEN_PRICING,
  automated_criteria: [
    'strict_schema', 'hidden_answer_leakage', 'forbidden_authority', 'hint_level',
    'full_solution', 'locale_de_ch', 'bounded_output', 'local_fallback_independent',
  ],
  local_fallback_comparison: {
    registry_version: TUTOR_FALLBACK_REGISTRY_VERSION,
    must_remain_independently_valid: true,
  },
  human_review: {
    rubric_ref: TUTOR_HUMAN_REVIEW_RUBRIC_REF,
    workflow_ref: TUTOR_HUMAN_REVIEW_WORKFLOW_REF,
    required_reviewer_role: TUTOR_HUMAN_REVIEWER_ROLE,
    criteria: TUTOR_HUMAN_REVIEW_CRITERIA,
    reviewer_ref: null,
    review_ref: null,
    review_status: 'NOT_REVIEWED',
  },
  result_status: 'NOT_RUN',
}

// Historical v3 remains addressable for the immutable partial run, diagnostic
// probe and Run 2 records. It is never accepted by the current paid runner.
export const TUTOR_PAID_EVALUATION_MANIFEST_V3 = deepFreeze(historicalManifestV3Schema.parse({
  eval_manifest_version: TUTOR_EVAL_MANIFEST_VERSION_V3,
  evaluator_version: TUTOR_EVALUATOR_VERSION_V1,
  ...commonManifest,
  prompt_version: TUTOR_PROMPT_VERSION_V1,
  evaluation_authorization: {
    scope: 'PAID_SYNTHETIC_EVALUATION_ONLY',
    status: 'READY_FOR_CONTROLLED_PAID_EVALUATION',
    synthetic_data_only: true,
    runtime_approval_effect: 'NONE',
  },
}))

const historicalManifestV4WithoutFingerprint = {
  eval_manifest_version: TUTOR_EVAL_MANIFEST_VERSION_V4,
  evaluator_version: TUTOR_EVALUATOR_VERSION_V3,
  supersedes_manifest_version: TUTOR_EVAL_MANIFEST_VERSION_V3,
  revision_reason: 'LOCALE_DE_CH_PROMPT_ALIGNMENT',
  ...commonManifest,
  prompt_version: TUTOR_PROMPT_VERSION_V2,
  prompt_digest: TUTOR_PROMPT_V2_DIGEST,
  evaluation_authorization: {
    scope: 'SYNTHETIC_EVALUATION_CONFIGURATION_ONLY',
    status: 'NOT_AUTHORIZED',
    synthetic_data_only: true,
    runtime_approval_effect: 'NONE',
  },
}

export function tutorEvaluationScopeFingerprint(manifest) {
  const scope = {
    eval_manifest_version: manifest.eval_manifest_version,
    evaluator_version: manifest.evaluator_version,
    result_contract_version: manifest.result_contract_version,
    accounting_contract_version: manifest.accounting_contract_version,
    leakage_contract_version: manifest.leakage_contract_version,
    leakage_policy: manifest.leakage_policy,
    canonical_safety_contract_version: manifest.canonical_safety_contract_version,
    evaluation_semantics: manifest.evaluation_semantics,
    supersedes_manifest_version: manifest.supersedes_manifest_version,
    revision_reason: manifest.revision_reason,
    fixture_set_version: manifest.fixture_set_version,
    fixture_set_hash: manifest.fixture_set_hash,
    fixture_count: manifest.fixture_count,
    repetition_count: manifest.repetition_count,
    provider_id: manifest.provider_id,
    model_id: manifest.model_id,
    prompt_version: manifest.prompt_version,
    prompt_digest: manifest.prompt_digest,
    schema_version: manifest.schema_version,
    max_http_calls: manifest.max_http_calls,
    max_input_tokens: manifest.max_input_tokens,
    max_output_tokens: manifest.max_output_tokens,
    max_total_tokens: manifest.max_total_tokens,
    max_input_tokens_per_call: manifest.max_input_tokens_per_call,
    max_output_tokens_per_call: manifest.max_output_tokens_per_call,
    max_cost: manifest.max_cost,
    currency: manifest.currency,
    frozen_token_pricing: manifest.frozen_token_pricing,
    evaluation_authorization: manifest.evaluation_authorization,
  }
  return `sha256:${createHash('sha256').update(JSON.stringify(scope)).digest('hex')}`
}

// Prompt-v2 Run 1 is consumed historical evidence and stays bound to this
// byte-equivalent v4 source tuple.
export const TUTOR_PAID_EVALUATION_MANIFEST_V4 = deepFreeze(historicalManifestV4Schema.parse({
  ...historicalManifestV4WithoutFingerprint,
  scope_fingerprint: tutorEvaluationScopeFingerprint(historicalManifestV4WithoutFingerprint),
}))

const historicalManifestV5WithoutFingerprint = {
  eval_manifest_version: TUTOR_EVAL_MANIFEST_VERSION_V5,
  evaluator_version: TUTOR_EVALUATOR_VERSION_V4,
  result_contract_version: TUTOR_EVALUATION_RESULT_CONTRACT_VERSION,
  leakage_contract_version: TUTOR_LEAKAGE_CONTRACT_VERSION,
  leakage_policy: TUTOR_LEAKAGE_POLICY,
  supersedes_manifest_version: TUTOR_EVAL_MANIFEST_VERSION_V4,
  revision_reason: 'STRICT_VALUE_MENTION_EVIDENCE_HARDENING',
  ...commonManifest,
  prompt_version: TUTOR_PROMPT_VERSION_V2,
  prompt_digest: TUTOR_PROMPT_V2_DIGEST,
  evaluation_authorization: {
    scope: 'SYNTHETIC_EVALUATION_CONFIGURATION_ONLY',
    status: 'NOT_AUTHORIZED',
    synthetic_data_only: true,
    runtime_approval_effect: 'NONE',
  },
}

// Evidence-hardened Run 1 is consumed historical evidence and stays bound to
// this byte-equivalent v5 source tuple.
export const TUTOR_PAID_EVALUATION_MANIFEST_V5 = deepFreeze(historicalManifestV5Schema.parse({
  ...historicalManifestV5WithoutFingerprint,
  scope_fingerprint: tutorEvaluationScopeFingerprint(historicalManifestV5WithoutFingerprint),
}))

const historicalManifestV6WithoutFingerprint = {
  eval_manifest_version: TUTOR_EVAL_MANIFEST_VERSION_V6,
  evaluator_version: TUTOR_EVALUATOR_VERSION_V4,
  result_contract_version: TUTOR_EVALUATION_RESULT_CONTRACT_VERSION,
  leakage_contract_version: TUTOR_LEAKAGE_CONTRACT_VERSION,
  leakage_policy: TUTOR_LEAKAGE_POLICY,
  supersedes_manifest_version: TUTOR_EVAL_MANIFEST_VERSION_V5,
  revision_reason: 'ANSWER_OPTION_TEXT_AVOIDANCE_ALIGNMENT',
  ...commonManifest,
  prompt_version: TUTOR_PROMPT_VERSION,
  prompt_digest: TUTOR_PROMPT_V3_DIGEST,
  evaluation_authorization: {
    scope: 'SYNTHETIC_EVALUATION_CONFIGURATION_ONLY',
    status: 'NOT_AUTHORIZED',
    synthetic_data_only: true,
    runtime_approval_effect: 'NONE',
  },
}
// The consumed Prompt-v3 targeted probe stays bound to this byte-equivalent v6
// source tuple and its original scope fingerprint.
export const TUTOR_PAID_EVALUATION_MANIFEST_V6 = deepFreeze(historicalManifestV6Schema.parse({
  ...historicalManifestV6WithoutFingerprint,
  scope_fingerprint: tutorEvaluationScopeFingerprint(historicalManifestV6WithoutFingerprint),
}))

const historicalManifestV7WithoutFingerprint = {
  eval_manifest_version: TUTOR_EVAL_MANIFEST_VERSION_V7,
  evaluator_version: TUTOR_SYSTEM_SAFETY_EVALUATOR_VERSION_V5,
  result_contract_version: TUTOR_SYSTEM_SAFETY_RESULT_CONTRACT_VERSION_V3,
  canonical_safety_contract_version: TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
  leakage_contract_version: TUTOR_LEAKAGE_CONTRACT_VERSION,
  leakage_policy: TUTOR_LEAKAGE_POLICY,
  evaluation_semantics: TUTOR_SYSTEM_SAFETY_EVALUATION_SEMANTICS_V5,
  supersedes_manifest_version: TUTOR_EVAL_MANIFEST_VERSION_V6,
  revision_reason: 'SAFE_FALLBACK_RUNTIME_SEMANTICS',
  ...commonManifest,
  prompt_version: TUTOR_PROMPT_VERSION,
  prompt_digest: TUTOR_PROMPT_V3_DIGEST,
  evaluation_authorization: {
    scope: 'SYNTHETIC_EVALUATION_CONFIGURATION_ONLY',
    status: 'NOT_AUTHORIZED',
    synthetic_data_only: true,
    runtime_approval_effect: 'NONE',
  },
}

// v7 remains byte-equivalent and addressable for the consumed v7 R1/R2 Run 1.
export const TUTOR_PAID_EVALUATION_MANIFEST_V7 = deepFreeze(historicalManifestV7Schema.parse({
  ...historicalManifestV7WithoutFingerprint,
  scope_fingerprint: tutorEvaluationScopeFingerprint(historicalManifestV7WithoutFingerprint),
}))

const currentManifestWithoutFingerprint = {
  eval_manifest_version: TUTOR_EVAL_MANIFEST_VERSION,
  evaluator_version: TUTOR_EVALUATOR_VERSION,
  result_contract_version: TUTOR_SYSTEM_SAFETY_RESULT_CONTRACT_VERSION,
  accounting_contract_version: TUTOR_EVALUATION_ACCOUNTING_CONTRACT_VERSION,
  canonical_safety_contract_version: TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
  leakage_contract_version: TUTOR_LEAKAGE_CONTRACT_VERSION,
  leakage_policy: TUTOR_LEAKAGE_POLICY,
  evaluation_semantics: TUTOR_SYSTEM_SAFETY_EVALUATION_SEMANTICS,
  supersedes_manifest_version: TUTOR_EVAL_MANIFEST_VERSION_V7,
  revision_reason: 'UNKNOWN_USAGE_CONSERVATIVE_BUDGET_ACCOUNTING',
  ...commonManifest,
  prompt_version: TUTOR_PROMPT_VERSION,
  prompt_digest: TUTOR_PROMPT_V3_DIGEST,
  evaluation_authorization: {
    scope: 'SYNTHETIC_EVALUATION_CONFIGURATION_ONLY',
    status: 'NOT_AUTHORIZED',
    synthetic_data_only: true,
    runtime_approval_effect: 'NONE',
  },
}
export const TUTOR_PAID_EVALUATION_MANIFEST = deepFreeze(tutorEvaluationManifestSchema.parse({
  ...currentManifestWithoutFingerprint,
  scope_fingerprint: tutorEvaluationScopeFingerprint(currentManifestWithoutFingerprint),
}))

function readiness(runnable, status, reasonCode, values = {}) {
  return Object.freeze({ runnable, status, reasonCode, ...values })
}

export function conservativeMaximumEvaluationCost(manifest = TUTOR_PAID_EVALUATION_MANIFEST) {
  const pricing = manifest?.frozen_token_pricing
  if (!pricing) throw new TypeError('Frozen token pricing is required for maximum-cost proof')
  const inputCost = manifest.max_input_tokens * pricing.input_per_million / 1_000_000
  const outputCost = manifest.max_output_tokens * pricing.output_per_million / 1_000_000
  return Number((inputCost + outputCost).toFixed(10))
}

export function paidEvaluationReadiness(environment = process.env, manifest = TUTOR_PAID_EVALUATION_MANIFEST) {
  if (environment.RUN_TUTOR_PROVIDER_EVALS !== '1') return readiness(false, 'NOT RUN', 'OPT_IN_REQUIRED')
  if (!['development', 'test'].includes(environment.NODE_ENV)) {
    return readiness(false, 'BLOCKED', 'EVALUATION_ENVIRONMENT_NOT_ALLOWED')
  }
  if (!environment.OPENAI_API_KEY) return readiness(false, 'BLOCKED', 'PROVIDER_CREDENTIALS_REQUIRED')
  if (!manifest?.frozen_token_pricing) return readiness(false, 'BLOCKED', 'FROZEN_PRICING_REQUIRED')
  if (manifest.max_cost === null || manifest.max_cost === undefined) return readiness(false, 'BLOCKED', 'MAX_COST_REQUIRED')
  if (manifest.currency === null || manifest.currency === undefined) return readiness(false, 'BLOCKED', 'CURRENCY_REQUIRED')
  if (manifest.model_id !== TUTOR_MODEL || manifest.provider_id !== 'openai'
    || manifest.prompt_version !== TUTOR_PROMPT_VERSION || manifest.prompt_digest !== TUTOR_PROMPT_V3_DIGEST
    || manifest.schema_version !== TUTOR_PROVIDER_SCHEMA_VERSION) {
    return readiness(false, 'BLOCKED', 'EVALUATION_TARGET_MISMATCH')
  }
  if (manifest.eval_manifest_version !== TUTOR_EVAL_MANIFEST_VERSION
    || manifest.evaluator_version !== TUTOR_EVALUATOR_VERSION) {
    return readiness(false, 'BLOCKED', 'EVALUATION_MANIFEST_VERSION_MISMATCH')
  }
  if (manifest.frozen_token_pricing.pricing_ref !== TUTOR_PRICING_REF) {
    return readiness(false, 'BLOCKED', 'PRICING_REF_VERSION_MISMATCH')
  }
  if (manifest.frozen_token_pricing.pricing_mode !== 'STANDARD_API') {
    return readiness(false, 'BLOCKED', 'STANDARD_PRICING_MODE_REQUIRED')
  }
  if (manifest.frozen_token_pricing.provider_request_service_tier !== TUTOR_STANDARD_SERVICE_TIER) {
    return readiness(false, 'BLOCKED', 'STANDARD_SERVICE_TIER_REQUIRED')
  }
  if (manifest.frozen_token_pricing.input_pricing_basis !== 'UNCACHED_INPUT'
    || manifest.frozen_token_pricing.cached_input_discount_applied !== false) {
    return readiness(false, 'BLOCKED', 'UNCACHED_INPUT_PRICING_REQUIRED')
  }
  const expectedPricing = TUTOR_FROZEN_TOKEN_PRICING
  if (manifest.frozen_token_pricing.pricing_contract_version !== TUTOR_PRICING_CONTRACT_VERSION
    || manifest.frozen_token_pricing.input_per_million !== expectedPricing.input_per_million
    || manifest.frozen_token_pricing.output_per_million !== expectedPricing.output_per_million
    || manifest.frozen_token_pricing.currency !== expectedPricing.currency) {
    return readiness(false, 'BLOCKED', 'FROZEN_PRICING_TUPLE_MISMATCH')
  }
  const parsedResult = tutorEvaluationManifestSchema.safeParse(manifest)
  if (!parsedResult.success) return readiness(false, 'BLOCKED', 'EVALUATION_MANIFEST_CONTRACT_INVALID')
  const parsed = parsedResult.data
  if (parsed.frozen_token_pricing.currency !== parsed.currency) {
    return readiness(false, 'BLOCKED', 'PRICING_CURRENCY_MISMATCH')
  }
  const maximumCost = conservativeMaximumEvaluationCost(parsed)
  if (maximumCost > parsed.max_cost) {
    return readiness(false, 'BLOCKED', 'MAXIMUM_COST_EXCEEDS_CAP', { maximum_cost: maximumCost, max_cost: parsed.max_cost, currency: parsed.currency })
  }
  if (tutorEvaluationScopeFingerprint(parsed) !== parsed.scope_fingerprint
    || parsed.scope_fingerprint !== TUTOR_PAID_EVALUATION_MANIFEST.scope_fingerprint) {
    return readiness(false, 'BLOCKED', 'EVALUATION_SCOPE_FINGERPRINT_MISMATCH')
  }
  if (!parsed.human_review.workflow_ref) return readiness(false, 'BLOCKED', 'HUMAN_REVIEW_WORKFLOW_REQUIRED')
  if (parsed.result_status !== 'NOT_RUN') return readiness(false, 'BLOCKED', 'MANIFEST_RESULT_STATUS_MUST_START_NOT_RUN')
  return readiness(false, 'BLOCKED', 'PAID_EVALUATION_AUTHORIZATION_REQUIRED', {
    maximum_cost: maximumCost,
    max_cost: parsed.max_cost,
    currency: parsed.currency,
  })
}
