import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { inventoryEntry, LEARNING_V2_DATA_INVENTORY_VERSION } from '../lib/server/learning-v2/privacy/data-inventory-v1.js'
import { tutorSyntheticEvalCases } from '../lib/server/learning-v2/tutor/eval-fixtures.js'
import { localTutorFallback } from '../lib/server/learning-v2/tutor/fallback-registry.js'
import { TUTOR_EVALUATION_GATE_ORDER } from '../lib/server/learning-v2/tutor/evaluation/evaluation-evidence-contract.js'
import {
  promptV3Fixture006ProbeContractHash,
  promptV3Fixture006ProbeGovernance,
  promptV3Fixture006ProbeReadiness,
  TUTOR_PROMPT_V3_FIXTURE_006_PROBE_MANIFEST as manifest,
} from '../lib/server/learning-v2/tutor/evaluation/prompt-v3-fixture-006-probe-manifest.js'
import {
  claimPromptV3Fixture006Probe,
  PROMPT_V3_FIXTURE_006_PROBE_CLAIM_FILENAME,
  runPromptV3Fixture006Probe,
} from '../lib/server/learning-v2/tutor/evaluation/prompt-v3-fixture-006-probe.js'
import { TUTOR_RUNTIME_APPROVAL_CONTRACT } from '../lib/server/learning-v2/tutor/governance/runtime-approval.js'

const fixtures = tutorSyntheticEvalCases()
const target = fixtures.find((fixture) => fixture.case_id === 'tutor-synthetic-006')
const environment = Object.freeze({
  NODE_ENV: 'test',
  RUN_TUTOR_PROVIDER_EVALS: '1',
  RUN_TUTOR_PROVIDER_PROMPT_V3_FIXTURE_006_PROBE: '1',
  RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE: '0',
  RUN_TUTOR_PROVIDER_EVAL_RUN_2: '0',
  RUN_TUTOR_PROVIDER_EVAL_V2_PROMPT_RUN_1: '0',
  RUN_TUTOR_PROVIDER_EVAL_V5_RUN_1: '0',
  LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '0',
  OPENAI_API_KEY: 'synthetic-offline-only',
})
const usage = Object.freeze({ input_tokens: 300, output_tokens: 100, total_tokens: 400 })
const clone = () => structuredClone(manifest)

function fakeResponse(init, candidate = localTutorFallback(target.level), suppliedUsage = usage) {
  return new Response(JSON.stringify({
    object: 'response',
    usage: suppliedUsage,
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(candidate) }] }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

async function offline(options = {}) {
  let calls = 0
  let claims = 0
  const supplied = options.fetchImplementation
  const result = await runPromptV3Fixture006Probe({
    environment,
    claim: async () => { claims += 1 },
    ...options,
    fetchImplementation: async (url, init) => {
      calls += 1
      return supplied ? supplied(url, init, calls) : fakeResponse(init)
    },
  })
  return { result, calls, claims }
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

test('targeted probe binds the exact v6/v4/v3 fixture-006 tuple and conservative cap', () => {
  const readiness = promptV3Fixture006ProbeReadiness({ environment })
  assert.equal(readiness.status, 'READY')
  assert.equal(readiness.maximum_cost, 0.08192)
  assert.equal(manifest.probe_manifest_version, 'tutor-paid-prompt-v3-fixture-006-probe-v1')
  assert.equal(promptV3Fixture006ProbeContractHash(), 'sha256:359b5341e264db60fac4e25b9ed3a3877385b593a0c301c012ff987ad4ca2d85')
  assert.equal(manifest.source_evaluation_manifest_version, 'tutor-paid-evaluation-v6')
  assert.equal(manifest.source_evaluation_scope_fingerprint, 'sha256:d5d0058476e11f8ecee743e505ed87832a3a1fa40699ee11e8b57206c728cf65')
  assert.equal(manifest.evaluator_version, 'tutor-paid-evaluator-v4')
  assert.equal(manifest.prompt_version, 'tutor-guidance-v3')
  assert.equal(manifest.prompt_digest, 'sha256:2a355b1df7560cbb1692869ec0e61fe4561226a5e04fd8602d78663193fe160b')
  assert.equal(manifest.case_id, 'tutor-synthetic-006')
  assert.equal(manifest.case_hash, 'sha256:7336802050c525d57da8bfbc4eca1ebf16fe08879c0cda8ed7277aa32e534391')
  assert.equal(manifest.max_http_calls, 1)
  assert.equal(manifest.max_retries, 0)
  assert.equal(manifest.provider_failover, false)
  assert.equal(Object.isFrozen(manifest.frozen_token_pricing), true)
})

test('missing credentials, exact opt-ins, non-production environment or closed gates block before claim and transport', async () => {
  const variants = [
    { RUN_TUTOR_PROVIDER_EVALS: '0' },
    { RUN_TUTOR_PROVIDER_PROMPT_V3_FIXTURE_006_PROBE: '0' },
    { OPENAI_API_KEY: '' },
    { NODE_ENV: 'production' },
    { NODE_ENV: undefined },
    { RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE: '1' },
    { RUN_TUTOR_PROVIDER_EVAL_RUN_2: '1' },
    { RUN_TUTOR_PROVIDER_EVAL_V2_PROMPT_RUN_1: '1' },
    { RUN_TUTOR_PROVIDER_EVAL_V5_RUN_1: '1' },
    { LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '1' },
  ]
  for (const change of variants) {
    const checked = await offline({ environment: { ...environment, ...change } })
    assert.equal(checked.result.comparison_outcome, 'PROBE_BLOCKED')
    assert.equal(checked.calls, 0)
    assert.equal(checked.claims, 0)
  }
})

test('every identity, target, leakage and budget mutation fails closed with zero calls', async () => {
  const changes = [
    ['probe_manifest_version', 'other'], ['source_evaluation_manifest_version', 'other'],
    ['source_evaluation_scope_fingerprint', 'sha256:' + '0'.repeat(64)], ['evaluator_version', 'other'],
    ['result_contract_version', 'other'], ['leakage_contract_version', 'other'], ['leakage_policy', 'other'],
    ['authorization', 'other'], ['synthetic_data_only', false], ['fixture_set_version', 'other'],
    ['fixture_set_hash', 'sha256:' + '0'.repeat(64)], ['case_id', 'tutor-synthetic-007'],
    ['case_hash', 'sha256:' + '0'.repeat(64)], ['fixture_count', 2], ['repetition_count', 2],
    ['provider_id', 'other'], ['model_id', 'latest'], ['prompt_version', 'tutor-guidance-v2'],
    ['prompt_digest', 'sha256:' + '0'.repeat(64)], ['schema_version', 'other'],
    ['max_http_calls', 2], ['max_retries', 1], ['provider_failover', true],
    ['max_input_tokens', 40_001], ['max_output_tokens', 161], ['max_total_tokens', 40_161],
    ['max_cost', 0.11], ['currency', 'EUR'],
  ]
  for (const [field, value] of changes) {
    const edited = clone()
    edited[field] = value
    const checked = await offline({ manifest: edited })
    assert.equal(checked.result.comparison_outcome, 'PROBE_BLOCKED', field)
    assert.equal(checked.calls, 0, field)
    assert.equal(checked.claims, 0, field)
  }
})

test('pricing cannot switch tier, cached basis, reference, rate or currency', async () => {
  const changes = [
    ['pricing_contract_version', 'other'], ['pricing_ref', 'changed'], ['pricing_mode', 'FAST'],
    ['provider_request_service_tier', 'priority'], ['input_pricing_basis', 'CACHED_INPUT'],
    ['cached_input_discount_applied', true], ['input_per_million', 0.2],
    ['output_per_million', 11], ['currency', 'EUR'],
  ]
  for (const [field, value] of changes) {
    const edited = clone()
    edited.frozen_token_pricing[field] = value
    const checked = await offline({ manifest: edited })
    assert.equal(checked.result.comparison_outcome, 'PROBE_BLOCKED', field)
    assert.equal(checked.calls, 0, field)
  }
})

test('changed fixture source, target content, duplicate or order blocks before authorization consumption', async () => {
  const changed = [
    fixtures.slice(0, 119),
    [...fixtures].reverse(),
    fixtures.map((item) => item.case_id === target.case_id ? { ...item, level: 1 } : item),
    fixtures.map((item, index) => index === 1 ? { ...item, case_id: fixtures[0].case_id } : item),
  ]
  for (const candidate of changed) {
    const checked = await offline({ fixtures: candidate })
    assert.equal(checked.result.comparison_outcome, 'PROBE_BLOCKED')
    assert.equal(checked.calls, 0)
    assert.equal(checked.claims, 0)
  }
})

test('runtime, human review and Production governance remain closed', () => {
  assert.deepEqual(promptV3Fixture006ProbeGovernance(environment), {
    approved_for_runtime: false,
    human_review_status: 'NOT_REVIEWED',
    reviewer_ref: null,
    review_ref: null,
    approved_at: null,
    runtime_gate_allowed: false,
    production_capabilities_all_off: true,
  })
  const approval = { ...TUTOR_RUNTIME_APPROVAL_CONTRACT, approved_for_runtime: true }
  assert.equal(promptV3Fixture006ProbeReadiness({ environment, approval }).status, 'BLOCKED')
})

test('one passing response answers only the alignment question and all eleven gates PASS', async () => {
  const before = JSON.stringify(TUTOR_RUNTIME_APPROVAL_CONTRACT)
  const checked = await offline({ fetchImplementation: async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses')
    assert.equal(init.redirect, 'error')
    const body = JSON.parse(init.body)
    assert.equal(body.model, 'gpt-5.6-terra')
    assert.equal(body.service_tier, 'default')
    assert.equal(body.store, false)
    assert.equal(body.max_output_tokens, 160)
    assert.equal(JSON.parse(body.input).prompt_version, 'tutor-guidance-v3')
    return fakeResponse(init)
  } })
  assert.equal(checked.result.comparison_outcome, 'V3_ALIGNMENT_CONFIRMED')
  assert.equal(checked.result.recommendation, 'READY_FOR_NEW_FULL_V6_EVALUATION')
  assert.equal(checked.result.http_calls, 1)
  assert.equal(checked.result.retries, 0)
  assert.equal(checked.result.actual_cost, 0.0018)
  assert.equal(checked.result.gate_results.length, 11)
  assert.equal(checked.result.gate_results.every((item) => item.state === 'PASS'), true)
  assert.equal(JSON.stringify(TUTOR_RUNTIME_APPROVAL_CONTRACT), before)
})

test('Direct Answer failure retains only bounded STRICT_VALUE_MENTION evidence', async () => {
  const generated = { ...localTutorFallback(target.level), learner_message: `Prüfe: ${target.correctAnswer}.` }
  const checked = await offline({ fetchImplementation: async (url, init) => fakeResponse(init, generated) })
  assert.equal(checked.result.comparison_outcome, 'V3_ALIGNMENT_FAILED')
  assert.equal(checked.result.recommendation, 'PROMPT_OR_MODEL_REVIEW_REQUIRED')
  assert.equal(checked.result.reason_code, 'DIRECT_ANSWER_LEAKAGE')
  assert.deepEqual(checked.result.gate_results.map((item) => item.state), [
    'PASS', 'PASS', 'PASS', 'PASS', 'FAIL',
    'NOT_REACHED', 'NOT_REACHED', 'NOT_REACHED', 'NOT_REACHED', 'NOT_REACHED', 'NOT_REACHED',
  ])
  assert.equal(checked.result.leakage_evidence.raw_answer_retained, false)
  assert.equal(checked.result.leakage_evidence.raw_response_retained, false)
  const serialized = JSON.stringify(checked.result)
  assert.equal(serialized.includes(target.correctAnswer), false)
  assert.equal(Object.hasOwn(checked.result.leakage_evidence, 'matched_substring'), false)
})

test('HTTP and timeout failures stop after exactly one transport with bounded diagnostics and no retry', async () => {
  for (const kind of ['http', 'timeout']) {
    const sentinel = `raw-${kind}-must-not-survive`
    const checked = await offline({ fetchImplementation: async () => {
      if (kind === 'http') return new Response(JSON.stringify({ error: { message: sentinel } }), {
        status: 503, headers: { 'content-type': 'application/json', 'x-should-retry': 'true', 'retry-after-ms': '1' },
      })
      throw new DOMException(sentinel, 'AbortError')
    } })
    assert.equal(checked.calls, 1)
    assert.equal(checked.result.comparison_outcome, 'PROBE_PROVIDER_FAILURE')
    assert.equal(checked.result.recommendation, 'PROVIDER_FAILURE_REQUIRES_REVIEW')
    assert.equal(checked.result.http_calls, 1)
    assert.equal(checked.result.retries, 0)
    assert.equal(checked.result.provider_failures, 1)
    assert.equal(checked.result.provider_timeouts, kind === 'timeout' ? 1 : 0)
    assert.equal(JSON.stringify(checked.result).includes(sentinel), false)
    assert.equal(JSON.stringify(checked.result).includes(environment.OPENAI_API_KEY), false)
  }
})

test('parse and missing-usage failures remain bounded, single-call and never price unknown usage as zero', async () => {
  const parse = await offline({ fetchImplementation: async () => new Response(JSON.stringify({
    object: 'response', usage,
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'not-json' }] }],
  }), { status: 200, headers: { 'content-type': 'application/json' } }) })
  assert.equal(parse.calls, 1)
  assert.equal(parse.result.comparison_outcome, 'PROBE_PROVIDER_FAILURE')
  assert.equal(parse.result.provider_diagnostic.reason_code, 'PROVIDER_SCHEMA_PARSE_ERROR')
  assert.equal(parse.result.actual_cost, 0.0018)

  const missing = await offline({ fetchImplementation: async (url, init) => {
    const body = await fakeResponse(init).json()
    delete body.usage
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  } })
  assert.equal(missing.calls, 1)
  assert.equal(missing.result.comparison_outcome, 'PROBE_PROVIDER_FAILURE')
  assert.equal(missing.result.provider_diagnostic.reason_code, 'PROVIDER_USAGE_MISSING')
  assert.equal(missing.result.actual_cost, null)
})

test('exclusive claim permits only one runner and persists no prompt, answer, response, identifier or secret', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'eduflow-prompt-v3-probe-'))
  try {
    let calls = 0
    const run = () => runPromptV3Fixture006Probe({
      environment,
      claim: () => claimPromptV3Fixture006Probe(directory),
      fetchImplementation: async () => { calls += 1; throw new Error('synthetic-only') },
    })
    const results = await Promise.all([run(), run()])
    assert.equal(calls, 1)
    assert.equal(results.filter((item) => item.comparison_outcome === 'PROBE_BLOCKED').length, 1)
    assert.equal((await run()).comparison_outcome, 'PROBE_BLOCKED')
    assert.equal(calls, 1)
    const raw = await readFile(path.join(directory, PROMPT_V3_FIXTURE_006_PROBE_CLAIM_FILENAME), 'utf8')
    const claim = JSON.parse(raw)
    assert.equal(claim.authorization_consumed, true)
    assert.equal(claim.probe_contract_hash, promptV3Fixture006ProbeContractHash())
    for (const forbidden of ['learner_message', 'correctAnswer', 'hidden_answer', 'Authorization', environment.OPENAI_API_KEY]) {
      assert.equal(raw.includes(forbidden), false)
    }
  } finally {
    await rm(directory, { recursive: true })
  }
})

test('probe has no Learning-domain database path, inventory covers bounded artifacts, and history stays immutable', async () => {
  const runner = await readFile(new URL('../lib/server/learning-v2/tutor/evaluation/prompt-v3-fixture-006-probe.js', import.meta.url), 'utf8')
  const script = await readFile(new URL('../scripts/learning-v2-prompt-v3-fixture-006-probe.mjs', import.meta.url), 'utf8')
  for (const forbidden of ["from '../../database", 'getDatabase(', '.collection(', 'insertOne(', 'updateOne(', 'deleteOne(', 'dotenv']) {
    assert.equal(runner.includes(forbidden), false, forbidden)
    assert.equal(script.includes(forbidden), false, forbidden)
  }
  assert.equal(LEARNING_V2_DATA_INVENTORY_VERSION, 'learning-v2-data-inventory-v23')
  assert.match(inventoryEntry('tutor_paid_evaluation_manifest').field_groups.join(' '), /Prompt-v3 Fixture-006 targeted probe/u)
  assert.match(inventoryEntry('tutor_paid_evaluation_results').current_deletion, /Prompt-v3 Fixture-006 probe/u)
  const historical = new Map([
    ['../docs/evaluation-results/tutor-paid-diagnostic-probe-v1.claim.json', '1c97cfd5119234556f3a0f4e88f240482c2e3b1f513f2ffd6f37bbb0d042674d'],
    ['../docs/evaluation-results/tutor-paid-diagnostic-probe-v1.result.json', '723532484bdf4e9c4858f5546c9f7df6b03a93d0ae460ab380352787e2869e06'],
    ['../docs/evaluation-results/tutor-paid-evaluation-run-2-v1.claim.json', '54a3544773e93af6ed39d33921e7f3e5fb88a07b4d77a9fd0b41a35a058e5803'],
    ['../docs/evaluation-results/tutor-paid-evaluation-run-2-v1.result.json', '63ae14d3d1aabf303ffba051cf8e9dc71718ead4ca734d81305165ea96d95e8b'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v2-prompt-run-1-v1.claim.json', 'f71b646bc850176510a166918a219b89b999163983f44e6e0ca0ede60f624f50'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v2-prompt-run-1-v1.result.json', '922181411312c88c13f3bad50c8d8858c463af90ff5e9cd89537f62c98dcda2f'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v5-run-1-v1.claim.json', '9ffceba7bacb3bdabbe0d49269c8887157bdac0f15129f5eb44227574b3e4561'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v5-run-1-v1.result.json', '9df02a8cb3a935857e7935b85e7113550a42711c629511e5f8c4e2a6f23e4687'],
    ['../docs/LEARNING_V2_HARDENING_H14B_PROMPT_V3_ALIGNMENT_REPORT.md', '115330cdecbae1f9b1a59a81462187a32f4681a5ea7ae6ef7d44bb29a6c41eb6'],
    ['../docs/evaluation-results/tutor-paid-prompt-v3-fixture-006-probe-v1.claim.json', '7ba3c7d2662bf77fad500528493b9a23277d02e907dd9e27a27648b081cc1de4'],
    ['../docs/evaluation-results/tutor-paid-prompt-v3-fixture-006-probe-v1.result.json', 'd8b5d4a923bb9b2aa0ccab67c43322a42f456bff4c6224111853e5238b26776c'],
    ['../docs/LEARNING_V2_HARDENING_H14B_PROMPT_V3_FIXTURE_006_PAID_PROBE_REPORT.md', 'ddc4e5f5ebe21b6b4e26d183fc59980187180529d37c3f2ca4498cd4faba154a'],
  ])
  for (const [relative, digest] of historical) assert.equal(sha256(await readFile(new URL(relative, import.meta.url))), digest, relative)
})
