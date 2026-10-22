import { localHostingEnvironment } from './helpers/local-hosting-environment.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { resolveLearningV2Capabilities } from '../lib/server/learning-v2/feature-flags/learning-v2.js'
import { inventoryEntry, LEARNING_V2_DATA_INVENTORY_VERSION } from '../lib/server/learning-v2/privacy/data-inventory-v1.js'
import {
  TUTOR_HUMAN_REVIEW_INPUT_CONTRACT,
  TUTOR_HUMAN_REVIEW_INPUT_CONTRACT_VERSION,
  tutorHumanReviewInputPlanSchema,
  validateTutorHumanReviewInputPlan,
} from '../lib/server/learning-v2/tutor/governance/human-review-input.js'
import {
  deriveTutorQualityClassification,
  TUTOR_DEVELOPMENT_EVALUATION_QUALITY_POLICY,
  TUTOR_PRODUCTION_QUALITY_POLICY,
  TUTOR_PROVIDER_TECHNICAL_FAILURE_CATEGORIES,
  TUTOR_QUALITY_DIMENSION_IDS,
  TUTOR_QUALITY_POLICY_CONTRACT,
  TUTOR_QUALITY_POLICY_CONTRACT_VERSION,
  TUTOR_QUALITY_THRESHOLD_CALIBRATION_STATUS,
  TUTOR_SAFETY_REJECTION_CATEGORIES,
} from '../lib/server/learning-v2/tutor/governance/quality-policy.js'
import {
  TUTOR_RUNTIME_APPROVAL_CONTRACT,
  TutorRuntimeApprovalGate,
} from '../lib/server/learning-v2/tutor/governance/runtime-approval.js'

const v8ClaimUrl = new URL('../docs/evaluation-results/tutor-paid-evaluation-v8-r1-r2-run-1-v1.claim.json', import.meta.url)
const v8ResultUrl = new URL('../docs/evaluation-results/tutor-paid-evaluation-v8-r1-r2-run-1-v1.result.json', import.meta.url)
const v8ReportUrl = new URL('../docs/LEARNING_V2_HARDENING_H14B_V8_FULL_PAID_SYNTHETIC_R1_R2_EVALUATION_REPORT.md', import.meta.url)

function sha256(value) { return createHash('sha256').update(value).digest('hex') }

function boundedResult({ safety = {}, technical = {}, finalFailures = 0 } = {}) {
  const safetyCount = Object.values(safety).reduce((sum, value) => sum + value, 0)
  const technicalCount = Object.values(technical).reduce((sum, value) => sum + value, 0)
  const completed = Math.max(1, safetyCount + technicalCount)
  const fallbackCount = safetyCount + technicalCount
  const providerPass = completed - safetyCount - technicalCount
  const localAccepted = fallbackCount - finalFailures
  return {
    run_manifest_version: 'synthetic-quality-policy-test-v1',
    result_contract_version: 'tutor-paid-evaluation-result-v4',
    fixtures_completed: completed,
    provider_transports: completed,
    fallback_count: fallbackCount,
    r1_provider_candidate_quality: {
      provider_candidate_pass_count: providerPass,
      provider_candidate_fail_count: safetyCount,
      provider_failure_count: technicalCount,
      rejection_reason_distribution: safety,
      provider_failure_distribution: technical,
    },
    r2_final_tutor_system_safety: {
      PROVIDER_ACCEPTED: providerPass,
      LOCAL_FALLBACK_ACCEPTED: localAccepted,
      FINAL_OUTCOME_FAIL: finalFailures,
      system_safety_pass: finalFailures === 0,
    },
    system_safety_pass: finalFailures === 0,
    rejected_provider_text_retained: false,
    raw_provider_response_retained: false,
    raw_provider_error_retained: false,
    learning_truth_mutations: 0,
  }
}

function reviewPlan() {
  return {
    input_contract_version: TUTOR_HUMAN_REVIEW_INPUT_CONTRACT_VERSION,
    workflow_ref: 'tutor-paid-evaluation-human-review-v1',
    required_reviewer_role: 'EDUFLOW_PEDAGOGICAL_REVIEWER',
    scope: 'PAID_SYNTHETIC_EVALUATION_REVIEW_INPUT_ONLY',
    source_run_manifest_version: 'tutor-paid-evaluation-v8-r1-r2-run-1-v1',
    source_result_sha256: 'sha256:92b7546f60b1e6cd2e279b54feeb3a48bec539fbdde7f1856a81d085ac8bbc55',
    synthetic_data_only: true,
    sampling_method: 'STRATIFIED',
    strata: [
      {
        final_source: 'PROVIDER_ACCEPTED', hint_level: 1, fixture_task_category: 'Mathematik', bounded_cause: null,
        evaluation_dimensions: ['SAFETY_CANDIDATE_REJECTION'], synthetic_case_refs: ['tutor-synthetic-001'],
      },
      {
        final_source: 'LOCAL_FALLBACK_ACCEPTED', hint_level: 2, fixture_task_category: 'Deutsch',
        bounded_cause: { classification: 'SAFETY_CANDIDATE_REJECTION', code: 'FORBIDDEN_AUTHORITY' },
        evaluation_dimensions: ['SAFETY_CANDIDATE_REJECTION', 'TOTAL_FALLBACK_GUARDRAIL'],
        synthetic_case_refs: ['tutor-synthetic-002'],
      },
    ],
    rejected_candidate_access: {
      mode: 'BOUNDED_METADATA_ONLY', raw_provider_text_retained: false, raw_provider_text_available: false,
    },
    raw_prompt_retained: false,
    raw_provider_response_retained: false,
    raw_rejected_provider_text_retained: false,
    review_status: 'NOT_REVIEWED',
    review_execution_authorized: false,
    approval_effect: 'NONE',
  }
}

test('versioned policy defines four separate bounded Development/Evaluation dimensions', () => {
  assert.equal(TUTOR_QUALITY_POLICY_CONTRACT_VERSION, 'tutor-cause-specific-quality-policy-v1')
  assert.equal(TUTOR_QUALITY_POLICY_CONTRACT.policy_model, 'CAUSE_SPECIFIC_THRESHOLDS_WITH_TOTAL_GUARDRAIL')
  assert.deepEqual(Object.keys(TUTOR_DEVELOPMENT_EVALUATION_QUALITY_POLICY.dimensions), TUTOR_QUALITY_DIMENSION_IDS)
  for (const contract of Object.values(TUTOR_DEVELOPMENT_EVALUATION_QUALITY_POLICY.dimensions)) {
    for (const field of ['metric_identifier', 'numerator_definition', 'denominator_definition', 'status_model', 'threshold_calibration_status']) {
      assert.equal(typeof contract[field], 'string', field)
    }
    assert.equal(contract.approval_effect, 'NONE')
  }
  for (const code of ['DIRECT_ANSWER_LEAKAGE', 'ANSWER_INDEX_LEAKAGE', 'ELIMINATION_LEAKAGE', 'UNSAFE_OUTPUT', 'FORBIDDEN_AUTHORITY', 'FULL_SOLUTION', 'LOCALE_DE_CH_VIOLATION']) {
    assert.equal(TUTOR_SAFETY_REJECTION_CATEGORIES.includes(code), true, code)
  }
  for (const code of ['PROVIDER_TIMEOUT', 'PROVIDER_NETWORK_ERROR', 'PROVIDER_HTTP_4XX', 'PROVIDER_HTTP_5XX', 'PROVIDER_SCHEMA_PARSE_ERROR', 'PROVIDER_USAGE_MISSING']) {
    assert.equal(TUTOR_PROVIDER_TECHNICAL_FAILURE_CATEGORIES.includes(code), true, code)
  }
})

test('FINAL_OUTCOME_FAIL always blocks System Safety classification', () => {
  const source = boundedResult({ safety: { FORBIDDEN_AUTHORITY: 1 }, finalFailures: 1 })
  const result = deriveTutorQualityClassification(source, { expectedCaseCount: 1 })
  assert.equal(result.dimensions.FINAL_SYSTEM_FAILURE.status, 'BLOCK')
  assert.equal(result.overall_status, 'BLOCK')
  assert.equal(source.system_safety_pass, false)
  const contradictory = structuredClone(source)
  contradictory.system_safety_pass = true
  assert.throws(() => deriveTutorQualityClassification(contradictory, { expectedCaseCount: 1 }), /cannot coexist/u)
})

test('Safety rejections and Provider technical failures remain separate bounded classifications', () => {
  const source = boundedResult({
    safety: { FORBIDDEN_AUTHORITY: 1 },
    technical: { PROVIDER_TIMEOUT: 1 },
  })
  const result = deriveTutorQualityClassification(source, { expectedCaseCount: 2 })
  assert.deepEqual(result.dimensions.SAFETY_CANDIDATE_REJECTION.bounded_categories, { FORBIDDEN_AUTHORITY: 1 })
  assert.deepEqual(result.dimensions.PROVIDER_TECHNICAL_FAILURE.bounded_categories, { PROVIDER_TIMEOUT: 1 })
  assert.equal(result.dimensions.SAFETY_CANDIDATE_REJECTION.numerator, 1)
  assert.equal(result.dimensions.PROVIDER_TECHNICAL_FAILURE.numerator, 1)
  const unbounded = structuredClone(source)
  unbounded.r1_provider_candidate_quality.provider_failure_distribution = { UNBOUNDED_PROVIDER_CODE: 1 }
  assert.throws(() => deriveTutorQualityClassification(unbounded, { expectedCaseCount: 2 }), /Unbounded/u)
})

test('Total fallback remains supplementary and cannot override cause-specific or final state', () => {
  const source = boundedResult({ safety: { DIRECT_ANSWER_LEAKAGE: 1 } })
  const result = deriveTutorQualityClassification(source, { expectedCaseCount: 1 })
  assert.equal(TUTOR_DEVELOPMENT_EVALUATION_QUALITY_POLICY.dimensions.TOTAL_FALLBACK_GUARDRAIL.role, 'SUPPLEMENTARY_QUALITY_GUARDRAIL')
  assert.equal(result.dimensions.TOTAL_FALLBACK_GUARDRAIL.role, 'SUPPLEMENTARY_QUALITY_GUARDRAIL')
  assert.equal(result.dimensions.TOTAL_FALLBACK_GUARDRAIL.status, 'REVIEW_UNCALIBRATED')
  assert.equal(result.dimensions.SAFETY_CANDIDATE_REJECTION.status, 'REVIEW_UNCALIBRATED')
  assert.deepEqual(result.dimensions.SAFETY_CANDIDATE_REJECTION.bounded_categories, { DIRECT_ANSWER_LEAKAGE: 1 })
})

test('uncalibrated dimensions contain no invented numeric threshold', () => {
  for (const id of ['SAFETY_CANDIDATE_REJECTION', 'PROVIDER_TECHNICAL_FAILURE', 'TOTAL_FALLBACK_GUARDRAIL']) {
    const contract = TUTOR_DEVELOPMENT_EVALUATION_QUALITY_POLICY.dimensions[id]
    assert.equal(contract.threshold_calibration_status, TUTOR_QUALITY_THRESHOLD_CALIBRATION_STATUS)
    assert.equal(Object.keys(contract).some((key) => /(?:threshold_value|green_max|review_max|block_min|percentage)/u.test(key)), false)
    assert.equal(Object.values(contract).some((value) => typeof value === 'number'), false)
  }
  assert.equal(JSON.stringify(TUTOR_QUALITY_POLICY_CONTRACT).includes('DECISION_NEEDS_POLICY_JUDGEMENT'), true)
})

test('Development/Evaluation policy can never classify Production', () => {
  const production = deriveTutorQualityClassification(boundedResult(), { policyScope: 'PRODUCTION', expectedCaseCount: 1 })
  assert.equal(TUTOR_PRODUCTION_QUALITY_POLICY.definition_status, 'NOT_DEFINED')
  assert.equal(TUTOR_PRODUCTION_QUALITY_POLICY.development_evaluation_policy_inheritance, 'FORBIDDEN')
  assert.deepEqual(production, {
    policy_contract_version: 'tutor-cause-specific-quality-policy-v1',
    policy_version: 'tutor-production-quality-policy-stub-v1',
    policy_scope: 'PRODUCTION',
    status: 'BLOCKED',
    reason_code: 'PRODUCTION_QUALITY_POLICY_NOT_DEFINED',
    threshold_status: 'NOT_DEFINED',
    development_evaluation_policy_applied: false,
    approval_effects: { human_approval: 'NONE', runtime_approval: 'NONE', production_approval: 'NONE', learning_truth: 'NONE' },
    learning_truth_mutations: 0,
  })
})

test('every policy and derived threshold result has approval effect NONE', () => {
  assert.deepEqual(TUTOR_QUALITY_POLICY_CONTRACT.approval_effects, {
    human_approval: 'NONE', runtime_approval: 'NONE', production_approval: 'NONE', learning_truth: 'NONE',
  })
  for (const dimension of Object.values(TUTOR_DEVELOPMENT_EVALUATION_QUALITY_POLICY.dimensions)) {
    assert.equal(dimension.approval_effect, 'NONE')
  }
  const result = deriveTutorQualityClassification(boundedResult(), { expectedCaseCount: 1 })
  assert.deepEqual(result.approval_effects, TUTOR_QUALITY_POLICY_CONTRACT.approval_effects)
})

test('historical v8 artifacts stay byte-identical and receive only read-only derived classification', async () => {
  const [claimBefore, resultBefore, reportBefore] = await Promise.all([readFile(v8ClaimUrl), readFile(v8ResultUrl), readFile(v8ReportUrl)])
  assert.equal(sha256(claimBefore), '88dd9d188bf858abfa72e47869ad2adc79828a4e8d7939edd7ad62045e99ce09')
  assert.equal(sha256(resultBefore), '92b7546f60b1e6cd2e279b54feeb3a48bec539fbdde7f1856a81d085ac8bbc55')
  assert.equal(sha256(reportBefore), '1eb9d7f95dd76e49f1b7eab286872f15dda2142a4de69b55f00d03c18f6f953b')
  const historical = JSON.parse(resultBefore.toString('utf8')).result
  const classification = deriveTutorQualityClassification(historical, { expectedCaseCount: 120 })
  assert.equal(classification.dimensions.FINAL_SYSTEM_FAILURE.status, 'GREEN_PASS')
  assert.equal(classification.dimensions.SAFETY_CANDIDATE_REJECTION.status, 'REVIEW_UNCALIBRATED')
  assert.equal(classification.dimensions.PROVIDER_TECHNICAL_FAILURE.status, 'REVIEW_UNCALIBRATED')
  assert.equal(classification.dimensions.TOTAL_FALLBACK_GUARDRAIL.status, 'REVIEW_UNCALIBRATED')
  const [claimAfter, resultAfter, reportAfter] = await Promise.all([readFile(v8ClaimUrl), readFile(v8ResultUrl), readFile(v8ReportUrl)])
  assert.equal(sha256(claimAfter), sha256(claimBefore))
  assert.equal(sha256(resultAfter), sha256(resultBefore))
  assert.equal(sha256(reportAfter), sha256(reportBefore))
})

test('raw rejected Provider text remains non-retained and is rejected by bounded contracts', () => {
  assert.equal(TUTOR_QUALITY_POLICY_CONTRACT.rejected_provider_text_retained, false)
  assert.equal(TUTOR_HUMAN_REVIEW_INPUT_CONTRACT.rejected_candidate_access.mode, 'BOUNDED_METADATA_ONLY')
  assert.equal(TUTOR_HUMAN_REVIEW_INPUT_CONTRACT.rejected_candidate_access.raw_provider_text_retained, false)
  const source = boundedResult({ safety: { FORBIDDEN_AUTHORITY: 1 } })
  source.rejected_provider_text_retained = true
  assert.throws(() => deriveTutorQualityClassification(source, { expectedCaseCount: 1 }), /raw provider content/u)
  assert.equal(tutorHumanReviewInputPlanSchema.safeParse({ ...reviewPlan(), raw_rejected_provider_text: 'forbidden' }).success, false)
})

test('Human Review input accepts stratified Provider and fallback sampling with bounded causes only', () => {
  const parsed = validateTutorHumanReviewInputPlan(reviewPlan())
  assert.equal(Object.isFrozen(parsed), true)
  assert.deepEqual(new Set(parsed.strata.map((item) => item.final_source)), new Set(['PROVIDER_ACCEPTED', 'LOCAL_FALLBACK_ACCEPTED']))
  assert.equal(parsed.strata[1].bounded_cause.code, 'FORBIDDEN_AUTHORITY')
  assert.equal(parsed.review_status, 'NOT_REVIEWED')
  assert.equal(parsed.review_execution_authorized, false)
  const missingFallback = reviewPlan()
  missingFallback.strata = [missingFallback.strata[0], { ...missingFallback.strata[0], hint_level: 2 }]
  assert.equal(tutorHumanReviewInputPlanSchema.safeParse(missingFallback).success, false)
})

test('quality classification is pure governance metadata and Production stays fail-closed', () => {
  const source = boundedResult({ safety: { FORBIDDEN_AUTHORITY: 1 } })
  const before = structuredClone(source)
  const result = deriveTutorQualityClassification(source, { expectedCaseCount: 1 })
  assert.deepEqual(source, before)
  assert.equal(result.evidence_effect, 'NONE')
  assert.equal(result.learning_truth_mutations, 0)
  assert.equal(result.source_result_mutated, false)
  assert.equal(LEARNING_V2_DATA_INVENTORY_VERSION, 'learning-v2-data-inventory-v23')
  assert.equal(inventoryEntry('tutor_quality_policy_config').learning_authority, 'none')
  assert.match(inventoryEntry('tutor_human_review_metadata').field_groups.join(' '), /bounded metadata only/u)
  const production = resolveLearningV2Capabilities({ ...localHostingEnvironment,
    NODE_ENV: 'production', LEARNING_V2_ENABLED: '1', LEARNING_V2_PHASE_2_ENABLED: '1',
    LEARNING_V2_PHASE_3_ENABLED: '1', LEARNING_V2_PHASE_3B_ENABLED: '1',
    LEARNING_V2_PHASE_4_ENABLED: '1', LEARNING_V2_PHASE_5_ENABLED: '1',
  })
  assert.equal(Object.values(production).every((enabled) => enabled === false), true)
  const gate = new TutorRuntimeApprovalGate({
    environment: { NODE_ENV: 'test', LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '0' },
  })
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.approved_for_runtime, false)
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.human_review.status, 'NOT_REVIEWED')
  assert.equal(gate.evaluate(gate.configuration()).allowed, false)
})
