import { localHostingEnvironment } from './helpers/local-hosting-environment.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { resolveLearningV2Capabilities } from '../lib/server/learning-v2/feature-flags/learning-v2.js'
import { tutorSyntheticEvalCases } from '../lib/server/learning-v2/tutor/eval-fixtures.js'
import { localTutorFallback } from '../lib/server/learning-v2/tutor/fallback-registry.js'
import {
  ConservativeEvaluationBudget,
  TUTOR_EVALUATION_ACCOUNTING_CONTRACT_VERSION,
} from '../lib/server/learning-v2/tutor/evaluation/evaluation-accounting-contract.js'
import {
  tutorEvaluationScopeFingerprint,
  TUTOR_PAID_EVALUATION_MANIFEST,
  TUTOR_PAID_EVALUATION_MANIFEST_V7,
} from '../lib/server/learning-v2/tutor/evaluation/evaluation-manifest.js'
import { runSyntheticTutorEvaluationVerification } from '../lib/server/learning-v2/tutor/evaluation/paid-evaluation.js'
import { TUTOR_RUNTIME_APPROVAL_CONTRACT } from '../lib/server/learning-v2/tutor/governance/runtime-approval.js'

const fixtures = tutorSyntheticEvalCases()
const exactUsage = Object.freeze({ input_tokens: 300, output_tokens: 100, total_tokens: 400 })

function offlineProvider(behavior) {
  let calls = 0
  return {
    syntheticEvaluationDouble: true,
    available() { return true },
    async generate(context, options) {
      calls += 1
      await options.beforeTransport()
      return behavior({ call: calls, context })
    },
    calls() { return calls },
  }
}

function safeResult(context, usage = exactUsage) {
  return { candidate: localTutorFallback(context.decision.hint_level), usage }
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

test('prospective evaluation v8/v6/v4 freezes the separate accounting-v1 contract while v7 remains reconstructable', () => {
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.eval_manifest_version, 'tutor-paid-evaluation-v8')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.evaluator_version, 'tutor-paid-evaluator-v6')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.result_contract_version, 'tutor-paid-evaluation-result-v4')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.accounting_contract_version, TUTOR_EVALUATION_ACCOUNTING_CONTRACT_VERSION)
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.revision_reason, 'UNKNOWN_USAGE_CONSERVATIVE_BUDGET_ACCOUNTING')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.scope_fingerprint, 'sha256:223b56b37707171dddb94ecdd4f3e32f689159ce1ffb2219debac477e67cba6c')
  assert.equal(tutorEvaluationScopeFingerprint(TUTOR_PAID_EVALUATION_MANIFEST), TUTOR_PAID_EVALUATION_MANIFEST.scope_fingerprint)
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST_V7.scope_fingerprint, 'sha256:0677d4e8e786225f83b1a680083663efe825058bc8ad6ec973cba498603110df')
  assert.equal(tutorEvaluationScopeFingerprint(TUTOR_PAID_EVALUATION_MANIFEST_V7), TUTOR_PAID_EVALUATION_MANIFEST_V7.scope_fingerprint)
})

test('unknown usage charges exactly the frozen per-call upper bound without fabricating actual cost', () => {
  const budget = new ConservativeEvaluationBudget(TUTOR_PAID_EVALUATION_MANIFEST)
  assert.equal(budget.maximumPerCallCharge(), 0.08192)
  assert.equal(budget.beforeCall(), true)
  budget.markTransport()
  budget.recordUnknownUsage()
  assert.deepEqual(budget.snapshot(), {
    accounting_contract_version: 'tutor-paid-evaluation-accounting-v1',
    http_calls: 1,
    actual_cost_status: 'PARTIAL_UNKNOWN',
    actual_cost: null,
    known_actual_cost: 0,
    known_actual_input_tokens: 0,
    known_actual_output_tokens: 0,
    known_actual_total_tokens: 0,
    unknown_usage_call_count: 1,
    unknown_usage_reserved_input_tokens: 40_000,
    unknown_usage_reserved_output_tokens: 160,
    unknown_usage_reserved_total_tokens: 40_160,
    unknown_usage_call_max_cost: 0.08192,
    conservative_unknown_usage_cost: 0.08192,
    conservative_total_cost_upper_bound: 0.08192,
    remaining_cost_budget_upper_bound: 9.91808,
    authorization_input_tokens_upper_bound: 40_000,
    authorization_output_tokens_upper_bound: 160,
    authorization_total_tokens_upper_bound: 40_160,
    currency: 'USD',
    reservation_pending: false,
    hard_stopped: false,
  })
})

test('multiple unknown calls accumulate monotonically and the next unaffordable transport is blocked before send', () => {
  const budget = new ConservativeEvaluationBudget({ ...TUTOR_PAID_EVALUATION_MANIFEST, max_cost: 0.1 })
  assert.equal(budget.beforeCall(), true)
  budget.markTransport()
  budget.recordUnknownUsage()
  const first = budget.snapshot()
  assert.equal(first.conservative_total_cost_upper_bound, 0.08192)
  assert.equal(budget.beforeCall(), false)
  const stopped = budget.snapshot()
  assert.equal(stopped.http_calls, 1)
  assert.equal(stopped.unknown_usage_call_count, 1)
  assert.equal(stopped.conservative_total_cost_upper_bound, first.conservative_total_cost_upper_bound)
  assert.equal(stopped.hard_stopped, true)

  const accumulating = new ConservativeEvaluationBudget(TUTOR_PAID_EVALUATION_MANIFEST)
  const upperBounds = []
  for (let index = 0; index < 3; index += 1) {
    assert.equal(accumulating.beforeCall(), true)
    accumulating.markTransport()
    accumulating.recordUnknownUsage()
    upperBounds.push(accumulating.snapshot().conservative_total_cost_upper_bound)
  }
  assert.deepEqual(upperBounds, [0.08192, 0.16384, 0.24576])
})

test('exact usage after an unknown call remains known actual cost while the conservative upper bound stays separate', () => {
  const budget = new ConservativeEvaluationBudget(TUTOR_PAID_EVALUATION_MANIFEST)
  assert.equal(budget.beforeCall(), true)
  budget.markTransport()
  budget.recordUnknownUsage()
  assert.equal(budget.beforeCall(), true)
  budget.markTransport()
  budget.recordUsage(exactUsage)
  const snapshot = budget.snapshot()
  assert.equal(snapshot.actual_cost_status, 'PARTIAL_UNKNOWN')
  assert.equal(snapshot.actual_cost, null)
  assert.equal(snapshot.known_actual_cost, 0.0018)
  assert.equal(snapshot.conservative_unknown_usage_cost, 0.08192)
  assert.equal(snapshot.conservative_total_cost_upper_bound, 0.08372)
  assert.equal(snapshot.known_actual_total_tokens, 400)
  assert.equal(snapshot.unknown_usage_reserved_total_tokens, 40_160)
})

test('one offline timeout becomes visible R1 provider failure, safe R2 fallback and continuation through all fixtures', async () => {
  const provider = offlineProvider(({ call, context }) => {
    if (call === 1) throw new DOMException('raw-timeout-must-not-survive', 'AbortError')
    return safeResult(context)
  })
  const result = await runSyntheticTutorEvaluationVerification({
    manifest: TUTOR_PAID_EVALUATION_MANIFEST,
    provider,
    fixtures,
  })
  assert.equal(result.status, 'PASS_TECHNICAL')
  assert.equal(provider.calls(), 120)
  assert.equal(result.retries, 0)
  assert.equal(result.provider_failover, false)
  assert.equal(result.metrics.completed_case_count, 120)
  assert.equal(result.metrics.r1_provider_candidate_quality.provider_failure_count, 1)
  assert.deepEqual(result.metrics.r1_provider_candidate_quality.rejection_reason_distribution, { PROVIDER_TIMEOUT: 1 })
  assert.equal(result.metrics.r2_final_tutor_system_safety.final_safe_count, 120)
  assert.equal(result.metrics.r2_final_tutor_system_safety.final_outcome_fail_count, 0)
  assert.equal(result.budget.actual_cost_status, 'PARTIAL_UNKNOWN')
  assert.equal(result.budget.actual_cost, null)
  assert.equal(result.budget.known_actual_cost, 0.2142)
  assert.equal(result.budget.unknown_usage_call_count, 1)
  assert.equal(result.budget.conservative_total_cost_upper_bound, 0.29612)
  assert.equal(JSON.stringify(result).includes('raw-timeout-must-not-survive'), false)
})

test('a response without trustworthy usage also records provider failure, falls back and continues without retry', async () => {
  const provider = offlineProvider(({ call, context }) => safeResult(context, call === 1 ? null : exactUsage))
  const result = await runSyntheticTutorEvaluationVerification({
    manifest: TUTOR_PAID_EVALUATION_MANIFEST,
    provider,
    fixtures,
  })
  assert.equal(result.status, 'PASS_TECHNICAL')
  assert.equal(provider.calls(), 120)
  assert.equal(result.retries, 0)
  assert.deepEqual(result.metrics.r1_provider_candidate_quality.rejection_reason_distribution, { PROVIDER_USAGE_MISSING: 1 })
  assert.equal(result.metrics.r2_final_tutor_system_safety.system_safety_pass, true)
  assert.equal(result.budget.actual_cost_status, 'PARTIAL_UNKNOWN')
  assert.equal(result.budget.unknown_usage_call_count, 1)
})

test('offline accounting verification cannot change Learning Truth, runtime approval or production closure', async () => {
  const beforeApproval = JSON.stringify(TUTOR_RUNTIME_APPROVAL_CONTRACT)
  const provider = offlineProvider(({ context }) => safeResult(context))
  const result = await runSyntheticTutorEvaluationVerification({
    manifest: TUTOR_PAID_EVALUATION_MANIFEST,
    provider,
    fixtures,
  })
  assert.equal(result.learning_truth_mutations, 0)
  assert.equal(result.runtime_approval_changed, false)
  assert.equal(result.human_approval_changed, false)
  assert.equal(JSON.stringify(TUTOR_RUNTIME_APPROVAL_CONTRACT), beforeApproval)
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.approved_for_runtime, false)
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.human_review.status, 'NOT_REVIEWED')
  const production = resolveLearningV2Capabilities({ ...localHostingEnvironment,
    NODE_ENV: 'production', LEARNING_V2_ENABLED: '1', LEARNING_V2_PHASE_2_ENABLED: '1',
    LEARNING_V2_PHASE_3_ENABLED: '1', LEARNING_V2_PHASE_3B_ENABLED: '1',
    LEARNING_V2_PHASE_4_ENABLED: '1', LEARNING_V2_PHASE_5_ENABLED: '1',
  })
  assert.equal(Object.values(production).every((value) => value === false), true)
})

test('consumed v7 Run 1 claim, result and report remain byte-for-byte immutable', async () => {
  const expected = new Map([
    ['../docs/evaluation-results/tutor-paid-evaluation-v7-r1-r2-run-1-v1.claim.json', '6cd2c0d2c0076eb4c5d29847a48750d175bc15cd73d615a3a7bd4d0ba2b1710d'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v7-r1-r2-run-1-v1.result.json', 'b8afd4742757cb52e1c6344e04603f0ce11ba59eb9ca999515e3076ccf1c2d24'],
    ['../docs/LEARNING_V2_HARDENING_H14B_V7_R1_R2_FULL_PAID_SYNTHETIC_EVALUATION_REPORT.md', '57f037b7a7445a682022f26324354850d596e5ef8d7da1743fb5216a94701298'],
  ])
  for (const [relative, digest] of expected) {
    assert.equal(sha256(await readFile(new URL(relative, import.meta.url))), digest, relative)
  }
})
