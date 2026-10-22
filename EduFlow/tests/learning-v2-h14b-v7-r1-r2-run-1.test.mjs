import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { localTutorFallback } from '../lib/server/learning-v2/tutor/fallback-registry.js'
import { tutorSyntheticEvalCases } from '../lib/server/learning-v2/tutor/eval-fixtures.js'
import { TUTOR_CANONICAL_SAFETY_GATE_ORDER } from '../lib/server/learning-v2/tutor/canonical-safety-gates.js'
import {
  TUTOR_V7_R1_R2_RUN_1_MANIFEST as manifest,
  v7R1R2Run1ContractHash,
  v7R1R2Run1Governance,
  v7R1R2Run1Readiness,
} from '../lib/server/learning-v2/tutor/evaluation/v7-r1-r2-run-1-manifest.js'
import {
  claimV7R1R2Run1,
  runV7R1R2TutorEvaluationRun1,
  V7R1R2Run1Budget,
  V7_R1_R2_RUN_1_CLAIM_FILENAME,
} from '../lib/server/learning-v2/tutor/evaluation/v7-r1-r2-run-1.js'
import { TUTOR_RUNTIME_APPROVAL_CONTRACT } from '../lib/server/learning-v2/tutor/governance/runtime-approval.js'

const fixtures = tutorSyntheticEvalCases()
const environment = Object.freeze({
  NODE_ENV: 'test',
  RUN_TUTOR_PROVIDER_EVALS: '1',
  RUN_TUTOR_PROVIDER_EVAL_V7_R1_R2_RUN_1: '1',
  RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE: '0',
  RUN_TUTOR_PROVIDER_EVAL_RUN_2: '0',
  RUN_TUTOR_PROVIDER_EVAL_V2_PROMPT_RUN_1: '0',
  RUN_TUTOR_PROVIDER_EVAL_V5_RUN_1: '0',
  RUN_TUTOR_PROVIDER_PROMPT_V3_FIXTURE_006_PROBE: '0',
  LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '0',
  OPENAI_API_KEY: 'synthetic-offline-only',
})
const usage = Object.freeze({ input_tokens: 300, output_tokens: 100, total_tokens: 400 })
const clone = () => structuredClone(manifest)

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
  const evaluation = await runV7R1R2TutorEvaluationRun1({
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

test('v7 R1/R2 Run 1 binds the exact immutable execution tuple and conservative budget', () => {
  const checked = v7R1R2Run1Readiness({ environment })
  assert.equal(checked.status, 'READY')
  assert.equal(checked.maximum_cost, 9.8304)
  assert.equal(manifest.run_manifest_version, 'tutor-paid-evaluation-v7-r1-r2-run-1-v1')
  assert.equal(manifest.source_evaluation_manifest_version, 'tutor-paid-evaluation-v7')
  assert.equal(manifest.source_evaluation_scope_fingerprint, 'sha256:0677d4e8e786225f83b1a680083663efe825058bc8ad6ec973cba498603110df')
  assert.equal(manifest.evaluator_version, 'tutor-paid-evaluator-v5')
  assert.equal(manifest.result_contract_version, 'tutor-paid-evaluation-result-v3')
  assert.equal(manifest.canonical_safety_contract_version, 'tutor-canonical-safety-gates-v1')
  assert.equal(manifest.prompt_version, 'tutor-guidance-v3')
  assert.equal(manifest.prompt_digest, 'sha256:2a355b1df7560cbb1692869ec0e61fe4561226a5e04fd8602d78663193fe160b')
  assert.equal(manifest.max_http_calls, 120)
  assert.equal(manifest.max_retries, 0)
  assert.equal(manifest.provider_failover, false)
  assert.equal(manifest.fallback_rate_threshold_status, 'PRODUCT_DECISION_PENDING')
  assert.equal(Object.isFrozen(manifest.frozen_token_pricing), true)
  assert.match(v7R1R2Run1ContractHash(), /^sha256:[0-9a-f]{64}$/)
})

test('missing prerequisites, competing opt-ins and runtime enablement block before claim and transport', async () => {
  const variants = [
    { RUN_TUTOR_PROVIDER_EVALS: '0' },
    { RUN_TUTOR_PROVIDER_EVAL_V7_R1_R2_RUN_1: '0' },
    { OPENAI_API_KEY: '' },
    { NODE_ENV: 'production' },
    { NODE_ENV: undefined },
    { RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE: '1' },
    { RUN_TUTOR_PROVIDER_EVAL_RUN_2: '1' },
    { RUN_TUTOR_PROVIDER_EVAL_V2_PROMPT_RUN_1: '1' },
    { RUN_TUTOR_PROVIDER_EVAL_V5_RUN_1: '1' },
    { RUN_TUTOR_PROVIDER_PROMPT_V3_FIXTURE_006_PROBE: '1' },
    { LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '1' },
  ]
  for (const change of variants) {
    const checked = await offline({ environment: { ...environment, ...change } })
    assert.equal(checked.evaluation.status, 'BLOCKED')
    assert.equal(checked.calls, 0)
    assert.equal(checked.claims, 0)
  }
})

test('any tuple, pricing, transport-policy or cap mutation fails closed with zero calls', async () => {
  const changes = [
    ['run_manifest_version', 'other'], ['source_evaluation_manifest_version', 'other'],
    ['source_evaluation_scope_fingerprint', 'sha256:' + '0'.repeat(64)], ['evaluator_version', 'other'],
    ['result_contract_version', 'other'], ['canonical_safety_contract_version', 'other'],
    ['leakage_contract_version', 'other'], ['leakage_policy', 'other'], ['fallback_registry_version', 'other'],
    ['fallback_rate_threshold_status', 'PASS'], ['authorization', 'other'], ['runtime_approval_effect', 'APPROVE'],
    ['synthetic_data_only', false], ['provider_id', 'other'], ['model_id', 'latest'], ['prompt_version', 'other'],
    ['prompt_digest', 'sha256:' + '0'.repeat(64)], ['schema_version', 'other'], ['fixture_count', 119],
    ['repetition_count', 2], ['pricing_contract_version', 'other'], ['pricing_ref', 'changed'], ['pricing_mode', 'FAST'],
    ['service_tier', 'priority'], ['max_http_calls', 121], ['max_retries', 1], ['provider_failover', true],
    ['timeout_ms', 6_001], ['max_input_tokens', 4_800_001], ['max_output_tokens', 19_201],
    ['max_total_tokens', 4_819_201], ['max_cost', 11], ['currency', 'EUR'],
  ]
  for (const [field, value] of changes) {
    const edited = clone()
    edited[field] = value
    const checked = await offline({ manifest: edited })
    assert.equal(checked.evaluation.status, 'BLOCKED', field)
    assert.equal(checked.calls, 0, field)
    assert.equal(checked.claims, 0, field)
  }
  for (const [field, value] of [
    ['provider_request_service_tier', 'priority'], ['cached_input_discount_applied', true],
    ['input_per_million', 0.2], ['output_per_million', 11], ['currency', 'EUR'],
  ]) {
    const edited = clone()
    edited.frozen_token_pricing[field] = value
    const checked = await offline({ manifest: edited })
    assert.equal(checked.evaluation.status, 'BLOCKED', field)
    assert.equal(checked.calls, 0, field)
  }
})

test('changed, missing, duplicated or reordered fixtures block without consuming authorization', async () => {
  for (const changed of [
    fixtures.slice(0, 119),
    [...fixtures].reverse(),
    fixtures.map((item, index) => index === 0 ? { ...item, level: 2 } : item),
    fixtures.map((item, index) => index === 1 ? { ...item, case_id: fixtures[0].case_id } : item),
  ]) {
    const checked = await offline({ fixtures: changed })
    assert.equal(checked.evaluation.status, 'BLOCKED')
    assert.equal(checked.calls, 0)
    assert.equal(checked.claims, 0)
  }
})

test('a complete safe offline run produces 120 R1 passes and 120 provider-accepted R2 outcomes', async () => {
  const checked = await offline({ fetchImplementation: async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses')
    assert.equal(init.redirect, 'error')
    const body = JSON.parse(init.body)
    assert.equal(body.model, 'gpt-5.6-terra')
    assert.equal(body.service_tier, 'default')
    assert.equal(body.store, false)
    assert.equal(body.max_output_tokens, 160)
    return fakeResponse(init)
  } })
  assert.equal(checked.evaluation.status, 'SYSTEM_SAFETY_PASS')
  assert.equal(checked.evaluation.coverage_complete, true)
  assert.equal(checked.evaluation.fixtures_attempted, 120)
  assert.equal(checked.evaluation.fixtures_completed, 120)
  assert.equal(checked.calls, 120)
  assert.equal(checked.evaluation.budget.actual_cost, 0.216)
  assert.deepEqual(checked.evaluation.r1_provider_candidate_quality, {
    provider_candidate_pass_count: 120,
    provider_candidate_fail_count: 0,
    provider_failure_count: 0,
    provider_candidate_pass_rate: 1,
    rejection_reason_distribution: {},
    provider_failure_distribution: {},
  })
  assert.equal(checked.evaluation.fallback_count, 0)
  assert.equal(checked.evaluation.fallback_rate, 0)
  assert.deepEqual(checked.evaluation.r2_final_tutor_system_safety, {
    PROVIDER_ACCEPTED: 120,
    LOCAL_FALLBACK_ACCEPTED: 0,
    FINAL_OUTCOME_FAIL: 0,
    system_safety_pass: true,
  })
  for (const gate of TUTOR_CANONICAL_SAFETY_GATE_ORDER) {
    assert.deepEqual(checked.evaluation.bounded_gate_diagnostics.provider_candidate[gate], { PASS: 120, FAIL: 0, NOT_REACHED: 0 })
    assert.deepEqual(checked.evaluation.bounded_gate_diagnostics.final_outcome[gate], { PASS: 120, FAIL: 0, NOT_REACHED: 0 })
  }
})

test('a rejected provider candidate remains R1 FAIL while safe R2 fallback continues all 120 fixtures', async () => {
  const hidden = fixtures[0].correctAnswer
  const checked = await offline({ fetchImplementation: async (url, init, call) => fakeResponse(init,
    call === 1 ? { ...localTutorFallback(1), learner_message: `Prüfe: ${hidden}.` } : undefined) })
  assert.equal(checked.evaluation.status, 'SYSTEM_SAFETY_PASS')
  assert.equal(checked.calls, 120)
  assert.equal(checked.evaluation.r1_provider_candidate_quality.provider_candidate_pass_count, 119)
  assert.equal(checked.evaluation.r1_provider_candidate_quality.provider_candidate_fail_count, 1)
  assert.equal(checked.evaluation.r1_provider_candidate_quality.provider_failure_count, 0)
  assert.deepEqual(checked.evaluation.r1_provider_candidate_quality.rejection_reason_distribution, { DIRECT_ANSWER_LEAKAGE: 1 })
  assert.equal(checked.evaluation.fallback_count, 1)
  assert.equal(checked.evaluation.r2_final_tutor_system_safety.LOCAL_FALLBACK_ACCEPTED, 1)
  assert.equal(checked.evaluation.r2_final_tutor_system_safety.PROVIDER_ACCEPTED, 119)
  assert.equal(checked.evaluation.r2_final_tutor_system_safety.FINAL_OUTCOME_FAIL, 0)
  assert.equal(JSON.stringify(checked.evaluation).includes(hidden), false)
})

test('a bounded parse failure with trustworthy usage uses local fallback and continues without retry', async () => {
  const checked = await offline({ fetchImplementation: async (url, init, call) => call === 1
    ? new Response(JSON.stringify({
      object: 'response', usage,
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'not-json' }] }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
    : fakeResponse(init) })
  assert.equal(checked.evaluation.status, 'SYSTEM_SAFETY_PASS')
  assert.equal(checked.calls, 120)
  assert.equal(checked.evaluation.retries, 0)
  assert.equal(checked.evaluation.r1_provider_candidate_quality.provider_failure_count, 1)
  assert.deepEqual(checked.evaluation.r1_provider_candidate_quality.provider_failure_distribution, { PROVIDER_SCHEMA_PARSE_ERROR: 1 })
  assert.equal(checked.evaluation.r2_final_tutor_system_safety.LOCAL_FALLBACK_ACCEPTED, 1)
  assert.equal(checked.evaluation.budget.actual_cost, 0.216)
})

test('unpriced HTTP, timeout or missing-usage transport terminates PARTIAL after one call and no retry', async () => {
  const scenarios = [
    async () => new Response(JSON.stringify({ error: { message: 'raw-must-not-survive' } }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'x-should-retry': 'true', 'retry-after-ms': '1' },
    }),
    async () => { throw new DOMException('raw-must-not-survive', 'AbortError') },
    async (url, init) => fakeResponse(init, undefined, null),
  ]
  for (const fetchImplementation of scenarios) {
    const checked = await offline({ fetchImplementation })
    assert.equal(checked.evaluation.status, 'PARTIAL_RUN')
    assert.equal(checked.calls, 1)
    assert.equal(checked.evaluation.provider_transports, 1)
    assert.equal(checked.evaluation.retries, 0)
    assert.equal(checked.evaluation.provider_failover, false)
    assert.equal(checked.evaluation.fixtures_completed, 1)
    assert.equal(checked.evaluation.r2_final_tutor_system_safety.LOCAL_FALLBACK_ACCEPTED, 1)
    assert.equal(checked.evaluation.termination_reason, 'REQUIRED_USAGE_ACCOUNTING_UNTRUSTWORTHY')
    assert.equal(checked.evaluation.budget.actual_cost, null)
    assert.equal(checked.evaluation.budget.unpriced_calls, 1)
    assert.equal(JSON.stringify(checked.evaluation).includes('raw-must-not-survive'), false)
    assert.equal(JSON.stringify(checked.evaluation).includes(environment.OPENAI_API_KEY), false)
  }
})

test('budget never authorizes transport 121 and governance remains closed', () => {
  const budget = new V7R1R2Run1Budget()
  for (let index = 0; index < 120; index += 1) {
    assert.equal(budget.reserveNext(), true)
    budget.markTransport()
    budget.recordUsage({ input_tokens: 1, output_tokens: 1, total_tokens: 2 })
  }
  assert.equal(budget.reserveNext(), false)
  assert.equal(budget.snapshot().http_calls, 120)
  assert.deepEqual(v7R1R2Run1Governance(environment), {
    approved_for_runtime: false,
    human_review_status: 'NOT_REVIEWED',
    reviewer_ref: null,
    review_ref: null,
    approved_at: null,
    runtime_gate_allowed: false,
    production_capabilities_all_off: true,
  })
  const approved = { ...TUTOR_RUNTIME_APPROVAL_CONTRACT, approved_for_runtime: true }
  assert.equal(v7R1R2Run1Readiness({ environment, approval: approved }).status, 'BLOCKED')
})

test('exclusive filesystem claim is create-once and contains bounded contract metadata only', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'eduflow-v7-r1-r2-run1-'))
  try {
    await claimV7R1R2Run1(directory)
    await assert.rejects(claimV7R1R2Run1(directory), (error) => error?.code === 'EEXIST')
    const raw = await readFile(path.join(directory, V7_R1_R2_RUN_1_CLAIM_FILENAME), 'utf8')
    const claim = JSON.parse(raw)
    assert.equal(claim.authorization_consumed, true)
    assert.equal(claim.run_contract_hash, v7R1R2Run1ContractHash())
    assert.equal(claim.source_evaluation_scope_fingerprint, manifest.source_evaluation_scope_fingerprint)
    for (const forbidden of ['learner_message', 'hidden_answer', 'learner_answer', 'Authorization', environment.OPENAI_API_KEY]) {
      assert.equal(raw.includes(forbidden), false)
    }
  } finally {
    await rm(directory, { recursive: true })
  }
})

test('runner remains outside Learning Truth and preserves all historical paid artifacts byte-for-byte', async () => {
  const runnerSource = await readFile(new URL('../lib/server/learning-v2/tutor/evaluation/v7-r1-r2-run-1.js', import.meta.url), 'utf8')
  const scriptSource = await readFile(new URL('../scripts/learning-v2-v7-r1-r2-full-evaluation-run-1.mjs', import.meta.url), 'utf8')
  for (const forbidden of ["from '../../database", 'getDatabase(', '.collection(', 'insertOne(', 'updateOne(', 'deleteOne(', 'dotenv']) {
    assert.equal(runnerSource.includes(forbidden), false, forbidden)
    assert.equal(scriptSource.includes(forbidden), false, forbidden)
  }
  const expected = new Map([
    ['../docs/evaluation-results/tutor-paid-diagnostic-probe-v1.claim.json', '1c97cfd5119234556f3a0f4e88f240482c2e3b1f513f2ffd6f37bbb0d042674d'],
    ['../docs/evaluation-results/tutor-paid-diagnostic-probe-v1.result.json', '723532484bdf4e9c4858f5546c9f7df6b03a93d0ae460ab380352787e2869e06'],
    ['../docs/evaluation-results/tutor-paid-evaluation-run-2-v1.claim.json', '54a3544773e93af6ed39d33921e7f3e5fb88a07b4d77a9fd0b41a35a058e5803'],
    ['../docs/evaluation-results/tutor-paid-evaluation-run-2-v1.result.json', '63ae14d3d1aabf303ffba051cf8e9dc71718ead4ca734d81305165ea96d95e8b'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v2-prompt-run-1-v1.claim.json', 'f71b646bc850176510a166918a219b89b999163983f44e6e0ca0ede60f624f50'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v2-prompt-run-1-v1.result.json', '922181411312c88c13f3bad50c8d8858c463af90ff5e9cd89537f62c98dcda2f'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v5-run-1-v1.claim.json', '9ffceba7bacb3bdabbe0d49269c8887157bdac0f15129f5eb44227574b3e4561'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v5-run-1-v1.result.json', '9df02a8cb3a935857e7935b85e7113550a42711c629511e5f8c4e2a6f23e4687'],
    ['../docs/evaluation-results/tutor-paid-prompt-v3-fixture-006-probe-v1.claim.json', '7ba3c7d2662bf77fad500528493b9a23277d02e907dd9e27a27648b081cc1de4'],
    ['../docs/evaluation-results/tutor-paid-prompt-v3-fixture-006-probe-v1.result.json', 'd8b5d4a923bb9b2aa0ccab67c43322a42f456bff4c6224111853e5238b26776c'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v7-r1-r2-run-1-v1.claim.json', '6cd2c0d2c0076eb4c5d29847a48750d175bc15cd73d615a3a7bd4d0ba2b1710d'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v7-r1-r2-run-1-v1.result.json', 'b8afd4742757cb52e1c6344e04603f0ce11ba59eb9ca999515e3076ccf1c2d24'],
  ])
  for (const [relative, digest] of expected) assert.equal(sha256(await readFile(new URL(relative, import.meta.url))), digest, relative)
})
