import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { tutorSyntheticEvalCases } from '../lib/server/learning-v2/tutor/eval-fixtures.js'
import { localTutorFallback } from '../lib/server/learning-v2/tutor/fallback-registry.js'
import { TUTOR_CANONICAL_SAFETY_GATE_ORDER } from '../lib/server/learning-v2/tutor/canonical-safety-gates.js'
import {
  TUTOR_V8_R1_R2_RUN_1_MANIFEST as manifest,
  v8R1R2Run1ContractHash,
  v8R1R2Run1Governance,
  v8R1R2Run1Readiness,
} from '../lib/server/learning-v2/tutor/evaluation/v8-r1-r2-run-1-manifest.js'
import {
  claimV8R1R2Run1,
  runV8R1R2TutorEvaluationRun1,
  V8_R1_R2_RUN_1_CLAIM_FILENAME,
} from '../lib/server/learning-v2/tutor/evaluation/v8-r1-r2-run-1.js'

const fixtures = tutorSyntheticEvalCases()
const environment = Object.freeze({
  NODE_ENV: 'test',
  RUN_TUTOR_PROVIDER_EVALS: '1',
  RUN_TUTOR_PROVIDER_EVAL_V8_R1_R2_RUN_1: '1',
  RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE: '0',
  RUN_TUTOR_PROVIDER_EVAL_RUN_2: '0',
  RUN_TUTOR_PROVIDER_EVAL_V2_PROMPT_RUN_1: '0',
  RUN_TUTOR_PROVIDER_EVAL_V5_RUN_1: '0',
  RUN_TUTOR_PROVIDER_PROMPT_V3_FIXTURE_006_PROBE: '0',
  RUN_TUTOR_PROVIDER_EVAL_V7_R1_R2_RUN_1: '0',
  LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '0',
  OPENAI_API_KEY: 'synthetic-offline-only',
})
const usage = Object.freeze({ input_tokens: 300, output_tokens: 100, total_tokens: 400 })

function fakeResponse(init, candidate, responseUsage = usage) {
  const body = JSON.parse(init.body)
  const context = JSON.parse(body.input)
  const envelope = {
    object: 'response',
    output: [{
      type: 'message',
      content: [{ type: 'output_text', text: JSON.stringify(candidate || localTutorFallback(context.decision.hint_level)) }],
    }],
  }
  if (responseUsage) envelope.usage = responseUsage
  return new Response(JSON.stringify(envelope), { status: 200, headers: { 'content-type': 'application/json' } })
}

async function offline(options = {}) {
  let calls = 0
  let claims = 0
  const supplied = options.fetchImplementation
  const evaluation = await runV8R1R2TutorEvaluationRun1({
    environment,
    claim: async () => { claims += 1 },
    ...options,
    fetchImplementation: async (url, init) => {
      calls += 1
      return supplied ? supplied(url, init, calls) : fakeResponse(init)
    },
  })
  return { evaluation, calls, claims }
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

test('v8 Run 1 binds the exact v8/v6/v4/accounting-v1 execution tuple and hash', () => {
  const checked = v8R1R2Run1Readiness({ environment })
  assert.equal(checked.status, 'READY')
  assert.equal(checked.maximum_cost, 9.8304)
  assert.equal(manifest.run_manifest_version, 'tutor-paid-evaluation-v8-r1-r2-run-1-v1')
  assert.equal(manifest.source_evaluation_manifest_version, 'tutor-paid-evaluation-v8')
  assert.equal(manifest.source_evaluation_scope_fingerprint, 'sha256:223b56b37707171dddb94ecdd4f3e32f689159ce1ffb2219debac477e67cba6c')
  assert.equal(manifest.evaluator_version, 'tutor-paid-evaluator-v6')
  assert.equal(manifest.result_contract_version, 'tutor-paid-evaluation-result-v4')
  assert.equal(manifest.accounting_contract_version, 'tutor-paid-evaluation-accounting-v1')
  assert.equal(manifest.prompt_version, 'tutor-guidance-v3')
  assert.equal(manifest.prompt_digest, 'sha256:2a355b1df7560cbb1692869ec0e61fe4561226a5e04fd8602d78663193fe160b')
  assert.equal(manifest.max_retries, 0)
  assert.equal(manifest.provider_failover, false)
  assert.deepEqual(manifest.unknown_usage_reservation, {
    input_tokens: 40_000, output_tokens: 160, total_tokens: 40_160,
    conservative_cost: 0.08192, currency: 'USD',
  })
  assert.equal(v8R1R2Run1ContractHash(), 'sha256:891a9af7f634b77d30a7e9c923d1c3e7de986f203f37cb949e6de3afc641bcb8')
})

test('missing prerequisites, competing paid opt-ins and runtime enablement block before claim and transport', async () => {
  const variants = [
    { RUN_TUTOR_PROVIDER_EVALS: '0' },
    { RUN_TUTOR_PROVIDER_EVAL_V8_R1_R2_RUN_1: '0' },
    { OPENAI_API_KEY: '' },
    { NODE_ENV: 'production' },
    { RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE: '1' },
    { RUN_TUTOR_PROVIDER_EVAL_RUN_2: '1' },
    { RUN_TUTOR_PROVIDER_EVAL_V2_PROMPT_RUN_1: '1' },
    { RUN_TUTOR_PROVIDER_EVAL_V5_RUN_1: '1' },
    { RUN_TUTOR_PROVIDER_PROMPT_V3_FIXTURE_006_PROBE: '1' },
    { RUN_TUTOR_PROVIDER_EVAL_V7_R1_R2_RUN_1: '1' },
    { LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '1' },
  ]
  for (const change of variants) {
    const checked = await offline({ environment: { ...environment, ...change } })
    assert.equal(checked.evaluation.status, 'BLOCKED')
    assert.equal(checked.calls, 0)
    assert.equal(checked.claims, 0)
  }
})

test('tuple, pricing, cap or unknown-reservation mutation fails closed with zero calls', async () => {
  const changes = [
    ['run_manifest_version', 'other'], ['source_evaluation_manifest_version', 'other'],
    ['source_evaluation_scope_fingerprint', 'sha256:' + '0'.repeat(64)], ['evaluator_version', 'other'],
    ['result_contract_version', 'other'], ['accounting_contract_version', 'other'],
    ['canonical_safety_contract_version', 'other'], ['leakage_policy', 'other'],
    ['model_id', 'latest'], ['prompt_version', 'other'], ['prompt_digest', 'sha256:' + '0'.repeat(64)],
    ['schema_version', 'other'], ['fixture_count', 119], ['max_http_calls', 121],
    ['max_retries', 1], ['provider_failover', true], ['max_input_tokens', 4_800_001],
    ['max_output_tokens', 19_201], ['max_total_tokens', 4_819_201], ['max_cost', 11], ['currency', 'EUR'],
  ]
  for (const [field, value] of changes) {
    const edited = structuredClone(manifest)
    edited[field] = value
    const checked = await offline({ manifest: edited })
    assert.equal(checked.evaluation.status, 'BLOCKED', field)
    assert.equal(checked.calls, 0, field)
    assert.equal(checked.claims, 0, field)
  }
  for (const [field, value] of [['input_per_million', 1], ['output_per_million', 11], ['provider_request_service_tier', 'priority']]) {
    const edited = structuredClone(manifest)
    edited.frozen_token_pricing[field] = value
    const checked = await offline({ manifest: edited })
    assert.equal(checked.evaluation.status, 'BLOCKED', field)
    assert.equal(checked.calls, 0, field)
  }
  const reservation = structuredClone(manifest)
  reservation.unknown_usage_reservation.conservative_cost = 0
  const checked = await offline({ manifest: reservation })
  assert.equal(checked.evaluation.status, 'BLOCKED')
  assert.equal(checked.calls, 0)
})

test('complete exact-usage run produces 120 safe R1/R2 outcomes and exact actual cost', async () => {
  const checked = await offline({ fetchImplementation: async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses')
    assert.equal(init.redirect, 'error')
    const body = JSON.parse(init.body)
    assert.equal(body.model, 'gpt-5.6-terra')
    assert.equal(body.service_tier, 'default')
    assert.equal(body.store, false)
    assert.equal(body.max_output_tokens, 160)
    assert.equal(body.reasoning.effort, 'low')
    return fakeResponse(init)
  } })
  const result = checked.evaluation
  assert.equal(result.status, 'SYSTEM_SAFETY_PASS')
  assert.equal(result.fixtures_attempted, 120)
  assert.equal(result.fixtures_completed, 120)
  assert.equal(checked.calls, 120)
  assert.equal(result.retries, 0)
  assert.equal(result.provider_failover, false)
  assert.equal(result.budget.actual_cost_status, 'COMPLETE')
  assert.equal(result.budget.actual_cost, 0.216)
  assert.equal(result.budget.known_actual_cost, 0.216)
  assert.equal(result.budget.known_actual_input_tokens, 36_000)
  assert.equal(result.budget.known_actual_output_tokens, 12_000)
  assert.equal(result.budget.known_actual_total_tokens, 48_000)
  assert.equal(result.budget.unknown_usage_call_count, 0)
  assert.equal(result.budget.conservative_total_cost_upper_bound, 0.216)
  assert.equal(result.r1_provider_candidate_quality.provider_candidate_pass_count, 120)
  assert.equal(result.r2_final_tutor_system_safety.PROVIDER_ACCEPTED, 120)
  assert.equal(result.r2_final_tutor_system_safety.system_safety_pass, true)
})

test('provider rejection remains R1 FAIL while canonical same-level fallback produces safe R2', async () => {
  const hidden = fixtures[0].correctAnswer
  const checked = await offline({ fetchImplementation: async (url, init, call) => fakeResponse(init,
    call === 1 ? { ...localTutorFallback(1), learner_message: `Prüfe: ${hidden}.` } : undefined) })
  const result = checked.evaluation
  assert.equal(result.status, 'SYSTEM_SAFETY_PASS')
  assert.equal(checked.calls, 120)
  assert.equal(result.r1_provider_candidate_quality.provider_candidate_pass_count, 119)
  assert.equal(result.r1_provider_candidate_quality.provider_candidate_fail_count, 1)
  assert.equal(result.r1_provider_candidate_quality.provider_failure_count, 0)
  assert.deepEqual(result.r1_provider_candidate_quality.rejection_reason_distribution, { DIRECT_ANSWER_LEAKAGE: 1 })
  assert.equal(result.fallback_count, 1)
  assert.equal(result.r2_final_tutor_system_safety.LOCAL_FALLBACK_ACCEPTED, 1)
  assert.equal(result.r2_final_tutor_system_safety.FINAL_OUTCOME_FAIL, 0)
  assert.equal(JSON.stringify(result).includes(hidden), false)
})

test('timeouts and missing usage each reserve one full call, remain provider failures and continue without retry', async () => {
  const checked = await offline({ fetchImplementation: async (url, init, call) => {
    if (call === 1) throw new DOMException('raw-timeout-must-not-survive', 'AbortError')
    if (call === 2) return fakeResponse(init, undefined, null)
    return fakeResponse(init)
  } })
  const result = checked.evaluation
  assert.equal(result.status, 'SYSTEM_SAFETY_PASS')
  assert.equal(checked.calls, 120)
  assert.equal(result.retries, 0)
  assert.equal(result.r1_provider_candidate_quality.provider_candidate_pass_count, 118)
  assert.equal(result.r1_provider_candidate_quality.provider_candidate_fail_count, 0)
  assert.equal(result.r1_provider_candidate_quality.provider_failure_count, 2)
  assert.deepEqual(result.r1_provider_candidate_quality.provider_failure_distribution, {
    PROVIDER_TIMEOUT: 1,
    PROVIDER_USAGE_MISSING: 1,
  })
  assert.equal(result.fallback_count, 2)
  assert.equal(result.r2_final_tutor_system_safety.LOCAL_FALLBACK_ACCEPTED, 2)
  assert.equal(result.r2_final_tutor_system_safety.system_safety_pass, true)
  assert.equal(result.budget.actual_cost_status, 'PARTIAL_UNKNOWN')
  assert.equal(result.budget.actual_cost, null)
  assert.equal(result.budget.known_actual_cost, 0.2124)
  assert.equal(result.budget.unknown_usage_call_count, 2)
  assert.equal(result.budget.unknown_usage_reserved_input_tokens, 80_000)
  assert.equal(result.budget.unknown_usage_reserved_output_tokens, 320)
  assert.equal(result.budget.unknown_usage_reserved_total_tokens, 80_320)
  assert.equal(result.budget.conservative_unknown_usage_cost, 0.16384)
  assert.equal(result.budget.conservative_total_cost_upper_bound, 0.37624)
  assert.equal(JSON.stringify(result).includes('raw-timeout-must-not-survive'), false)
})

test('the complete unknown-usage boundary uses all caps but never authorizes transport 121', async () => {
  const checked = await offline({ fetchImplementation: async () => {
    throw new DOMException('bounded-timeout', 'AbortError')
  } })
  const result = checked.evaluation
  assert.equal(result.status, 'SYSTEM_SAFETY_PASS')
  assert.equal(checked.calls, 120)
  assert.equal(result.budget.http_calls, 120)
  assert.equal(result.budget.unknown_usage_call_count, 120)
  assert.equal(result.budget.authorization_input_tokens_upper_bound, 4_800_000)
  assert.equal(result.budget.authorization_output_tokens_upper_bound, 19_200)
  assert.equal(result.budget.authorization_total_tokens_upper_bound, 4_819_200)
  assert.equal(result.budget.conservative_total_cost_upper_bound, 9.8304)
  assert.equal(result.budget.remaining_cost_budget_upper_bound, 0.1696)
  assert.equal(result.r1_provider_candidate_quality.provider_candidate_pass_count, 0)
  assert.equal(result.r1_provider_candidate_quality.provider_failure_count, 120)
  assert.equal(result.r2_final_tutor_system_safety.LOCAL_FALLBACK_ACCEPTED, 120)
})

test('per-transport contract preflight stops before the next fetch when governance input changes', async () => {
  const mutable = { ...environment }
  let calls = 0
  const evaluation = await runV8R1R2TutorEvaluationRun1({
    environment: mutable,
    claim: async () => {},
    fetchImplementation: async (url, init) => {
      calls += 1
      mutable.RUN_TUTOR_PROVIDER_EVALS = '0'
      return fakeResponse(init)
    },
  })
  assert.equal(evaluation.status, 'PARTIAL_RUN')
  assert.equal(evaluation.reason_code, 'EVALUATION_CONTRACT_INTEGRITY_FAILURE')
  assert.equal(calls, 1)
  assert.equal(evaluation.provider_transports, 1)
  assert.equal(evaluation.fixtures_completed, 1)
  assert.equal(evaluation.retries, 0)
})

test('filesystem claim is create-once and contains only bounded immutable contract metadata', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'eduflow-v8-r1-r2-run1-'))
  try {
    await claimV8R1R2Run1(directory)
    await assert.rejects(claimV8R1R2Run1(directory), (error) => error?.code === 'EEXIST')
    const raw = await readFile(path.join(directory, V8_R1_R2_RUN_1_CLAIM_FILENAME), 'utf8')
    const claim = JSON.parse(raw)
    assert.equal(claim.authorization_consumed, true)
    assert.equal(claim.run_contract_hash, v8R1R2Run1ContractHash())
    assert.equal(claim.accounting_contract_version, 'tutor-paid-evaluation-accounting-v1')
    for (const forbidden of ['learner_message', 'hidden_answer', 'learner_answer', 'Authorization', environment.OPENAI_API_KEY]) {
      assert.equal(raw.includes(forbidden), false)
    }
  } finally {
    await rm(directory, { recursive: true })
  }
})

test('v8 runner remains outside Learning Truth and historical v7 evidence stays immutable PARTIAL_RUN', async () => {
  const source = await readFile(new URL('../lib/server/learning-v2/tutor/evaluation/v8-r1-r2-run-1.js', import.meta.url), 'utf8')
  for (const forbidden of ['getDatabase(', '.collection(', 'insertOne(', 'updateOne(', 'deleteOne(']) {
    assert.equal(source.includes(forbidden), false, forbidden)
  }
  const historical = new Map([
    ['../docs/evaluation-results/tutor-paid-evaluation-v7-r1-r2-run-1-v1.claim.json', '6cd2c0d2c0076eb4c5d29847a48750d175bc15cd73d615a3a7bd4d0ba2b1710d'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v7-r1-r2-run-1-v1.result.json', 'b8afd4742757cb52e1c6344e04603f0ce11ba59eb9ca999515e3076ccf1c2d24'],
    ['../docs/LEARNING_V2_HARDENING_H14B_V7_R1_R2_FULL_PAID_SYNTHETIC_EVALUATION_REPORT.md', '57f037b7a7445a682022f26324354850d596e5ef8d7da1743fb5216a94701298'],
  ])
  for (const [relative, digest] of historical) assert.equal(sha256(await readFile(new URL(relative, import.meta.url))), digest)
  const v7 = JSON.parse(await readFile(new URL('../docs/evaluation-results/tutor-paid-evaluation-v7-r1-r2-run-1-v1.result.json', import.meta.url), 'utf8'))
  assert.equal(v7.result.status, 'PARTIAL_RUN')
  assert.equal(v7.result.source_evaluation_manifest_version, 'tutor-paid-evaluation-v7')
  assert.deepEqual(v8R1R2Run1Governance(environment), {
    approved_for_runtime: false,
    human_review_status: 'NOT_REVIEWED',
    reviewer_ref: null,
    review_ref: null,
    approved_at: null,
    runtime_gate_allowed: false,
    production_capabilities_all_off: true,
  })
})
