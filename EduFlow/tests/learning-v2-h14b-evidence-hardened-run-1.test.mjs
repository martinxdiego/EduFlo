import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { inventoryEntry, LEARNING_V2_DATA_INVENTORY_VERSION } from '../lib/server/learning-v2/privacy/data-inventory-v1.js'
import { localTutorFallback } from '../lib/server/learning-v2/tutor/fallback-registry.js'
import { tutorSyntheticEvalCases } from '../lib/server/learning-v2/tutor/eval-fixtures.js'
import { TUTOR_EVALUATION_GATE_ORDER } from '../lib/server/learning-v2/tutor/evaluation/evaluation-evidence-contract.js'
import {
  evidenceHardenedRun1ContractHash,
  evidenceHardenedRun1Governance,
  evidenceHardenedRun1Readiness,
  TUTOR_EVIDENCE_HARDENED_RUN_1_MANIFEST as manifest,
} from '../lib/server/learning-v2/tutor/evaluation/evidence-hardened-run-1-manifest.js'
import {
  claimEvidenceHardenedRun1,
  EVIDENCE_HARDENED_RUN_1_CLAIM_FILENAME,
  EvidenceHardenedRun1Budget,
  runEvidenceHardenedTutorEvaluationRun1,
} from '../lib/server/learning-v2/tutor/evaluation/evidence-hardened-run-1.js'
import { TUTOR_RUNTIME_APPROVAL_CONTRACT } from '../lib/server/learning-v2/tutor/governance/runtime-approval.js'

const fixtures = tutorSyntheticEvalCases()
const environment = Object.freeze({
  NODE_ENV: 'test',
  RUN_TUTOR_PROVIDER_EVALS: '1',
  RUN_TUTOR_PROVIDER_EVAL_V5_RUN_1: '1',
  RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE: '0',
  RUN_TUTOR_PROVIDER_EVAL_RUN_2: '0',
  RUN_TUTOR_PROVIDER_EVAL_V2_PROMPT_RUN_1: '0',
  LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '0',
  OPENAI_API_KEY: 'synthetic-offline-only',
})
const usage = Object.freeze({ input_tokens: 300, output_tokens: 100, total_tokens: 400 })
const clone = () => structuredClone(manifest)

function fakeResponse(init, candidate) {
  const body = JSON.parse(init.body)
  const context = JSON.parse(body.input)
  return new Response(JSON.stringify({
    object: 'response',
    usage,
    output: [{
      type: 'message',
      content: [{ type: 'output_text', text: JSON.stringify(candidate || localTutorFallback(context.decision.hint_level)) }],
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

async function offline(options = {}) {
  let calls = 0
  let claims = 0
  const supplied = options.fetchImplementation
  const evaluation = await runEvidenceHardenedTutorEvaluationRun1({
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

test('evidence-hardened Run 1 binds the exact immutable v5 execution tuple', () => {
  const checked = evidenceHardenedRun1Readiness({ environment })
  assert.equal(checked.status, 'READY')
  assert.equal(checked.maximum_cost, 9.8304)
  assert.equal(manifest.run_manifest_version, 'tutor-paid-evaluation-v5-run-1-v1')
  assert.equal(manifest.source_evaluation_manifest_version, 'tutor-paid-evaluation-v5')
  assert.equal(manifest.source_evaluation_scope_fingerprint, 'sha256:2774461222995a1c6433e426a2e8d12bd9d0cfa4cf7ecf615b57cb3bf79f21ce')
  assert.equal(manifest.evaluator_version, 'tutor-paid-evaluator-v4')
  assert.equal(manifest.result_contract_version, 'tutor-paid-evaluation-result-v2')
  assert.equal(manifest.leakage_contract_version, 'tutor-direct-answer-leakage-v1')
  assert.equal(manifest.leakage_policy, 'STRICT_VALUE_MENTION')
  assert.equal(manifest.prompt_version, 'tutor-guidance-v2')
  assert.equal(manifest.max_http_calls, 120)
  assert.equal(manifest.max_retries, 0)
  assert.equal(manifest.provider_failover, false)
  assert.equal(Object.isFrozen(manifest.frozen_token_pricing), true)
  assert.match(evidenceHardenedRun1ContractHash(), /^sha256:[0-9a-f]{64}$/)
})

test('missing execution prerequisites and competing paid opt-ins block before claim and transport', async () => {
  const variants = [
    { RUN_TUTOR_PROVIDER_EVALS: '0' },
    { RUN_TUTOR_PROVIDER_EVAL_V5_RUN_1: '0' },
    { OPENAI_API_KEY: '' },
    { NODE_ENV: 'production' },
    { NODE_ENV: undefined },
    { RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE: '1' },
    { RUN_TUTOR_PROVIDER_EVAL_RUN_2: '1' },
    { RUN_TUTOR_PROVIDER_EVAL_V2_PROMPT_RUN_1: '1' },
    { LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '1' },
  ]
  for (const change of variants) {
    const checked = await offline({ environment: { ...environment, ...change } })
    assert.equal(checked.evaluation.status, 'BLOCKED')
    assert.equal(checked.calls, 0)
    assert.equal(checked.claims, 0)
  }
})

test('run identity, evaluator, result, leakage and target mutations fail closed with zero calls', async () => {
  const changes = [
    ['run_manifest_version', 'other'], ['evaluator_version', 'other'], ['result_contract_version', 'other'],
    ['leakage_contract_version', 'other'], ['leakage_policy', 'other'],
    ['source_evaluation_manifest_version', 'other'], ['source_evaluation_scope_fingerprint', 'sha256:' + '0'.repeat(64)],
    ['provider_id', 'other'], ['model_id', 'latest'], ['prompt_version', 'other'], ['prompt_digest', 'sha256:' + '0'.repeat(64)],
    ['schema_version', 'other'], ['fixture_count', 119], ['repetition_count', 2], ['synthetic_data_only', false],
    ['max_http_calls', 121], ['max_retries', 1], ['provider_failover', true], ['max_input_tokens', 4_800_001],
    ['max_output_tokens', 19_201], ['max_total_tokens', 4_819_201], ['max_cost', 11], ['currency', 'EUR'],
  ]
  for (const [field, value] of changes) {
    const edited = clone()
    edited[field] = value
    const checked = await offline({ manifest: edited })
    assert.equal(checked.evaluation.status, 'BLOCKED', field)
    assert.equal(checked.calls, 0, field)
    assert.equal(checked.claims, 0, field)
  }
})

test('pricing cannot switch service tier, apply cached discounts or change the frozen tuple', async () => {
  const changes = [
    ['pricing_contract_version', 'other'], ['pricing_ref', 'changed'], ['pricing_mode', 'FAST'],
    ['provider_request_service_tier', 'priority'], ['input_pricing_basis', 'CACHED_INPUT'],
    ['cached_input_discount_applied', true], ['input_per_million', 0.2], ['output_per_million', 11], ['currency', 'EUR'],
  ]
  for (const [field, value] of changes) {
    const edited = clone()
    edited.frozen_token_pricing[field] = value
    const checked = await offline({ manifest: edited })
    assert.equal(checked.evaluation.status, 'BLOCKED', field)
    assert.equal(checked.calls, 0, field)
    assert.equal(checked.claims, 0, field)
  }
})

test('changed, missing, duplicated or reordered fixtures block without consuming authorization', async () => {
  const changedFixtures = [
    fixtures.slice(0, 119),
    [...fixtures].reverse(),
    fixtures.map((item, index) => index === 0 ? { ...item, level: 2 } : item),
    fixtures.map((item, index) => index === 1 ? { ...item, case_id: fixtures[0].case_id } : item),
  ]
  for (const changed of changedFixtures) {
    const checked = await offline({ fixtures: changed })
    assert.equal(checked.evaluation.status, 'BLOCKED')
    assert.equal(checked.calls, 0)
    assert.equal(checked.claims, 0)
  }
})

test('execution cannot create human review, runtime approval or Production capabilities', () => {
  const state = evidenceHardenedRun1Governance(environment)
  assert.deepEqual(state, {
    approved_for_runtime: false,
    human_review_status: 'NOT_REVIEWED',
    reviewer_ref: null,
    review_ref: null,
    approved_at: null,
    runtime_gate_allowed: false,
    production_capabilities_all_off: true,
  })
  for (const change of [{ approved_for_runtime: true }, {
    human_review: {
      ...TUTOR_RUNTIME_APPROVAL_CONTRACT.human_review,
      status: 'APPROVED',
      reviewer_ref: 'reviewer',
      review_ref: 'review',
      approved_at: new Date().toISOString(),
    },
  }]) {
    const approval = { ...TUTOR_RUNTIME_APPROVAL_CONTRACT, ...change }
    assert.equal(evidenceHardenedRun1Readiness({ environment, approval }).status, 'BLOCKED')
  }
})

test('a complete offline run evaluates 120 fixtures with exact usage and all gates PASS', async () => {
  const before = JSON.stringify(TUTOR_RUNTIME_APPROVAL_CONTRACT)
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
  assert.equal(checked.evaluation.status, 'PASS_TECHNICAL')
  assert.equal(checked.evaluation.coverage_complete, true)
  assert.equal(checked.evaluation.fixtures_attempted, 120)
  assert.equal(checked.evaluation.fixtures_completed, 120)
  assert.equal(checked.calls, 120)
  assert.equal(checked.evaluation.budget.http_calls, 120)
  assert.equal(checked.evaluation.budget.input_tokens, 36_000)
  assert.equal(checked.evaluation.budget.output_tokens, 12_000)
  assert.equal(checked.evaluation.budget.total_tokens, 48_000)
  assert.equal(checked.evaluation.budget.actual_cost, 0.216)
  assert.deepEqual(checked.evaluation.case_counts, { PASS: 120, FAIL: 0 })
  for (const gate of TUTOR_EVALUATION_GATE_ORDER) {
    assert.deepEqual(checked.evaluation.gate_aggregate[gate], { PASS: 120, FAIL: 0, NOT_REACHED: 0 })
  }
  assert.deepEqual(checked.evaluation.bounded_failure_codes, [])
  assert.equal(checked.evaluation.retries, 0)
  assert.equal(checked.evaluation.provider_failures, 0)
  assert.equal(checked.evaluation.runtime_approval_changed, false)
  assert.equal(JSON.stringify(TUTOR_RUNTIME_APPROVAL_CONTRACT), before)
})

test('Direct Answer failure stops immediately and retains only bounded leakage evidence', async () => {
  const hidden = fixtures[0].correctAnswer
  const checked = await offline({ fetchImplementation: async (url, init) => {
    const base = localTutorFallback(1)
    return fakeResponse(init, { ...base, learner_message: `Prüfe: ${hidden}.` })
  } })
  assert.equal(checked.calls, 1)
  assert.equal(checked.evaluation.status, 'FAIL_TECHNICAL')
  assert.equal(checked.evaluation.fixtures_completed, 1)
  assert.deepEqual(checked.evaluation.case_counts, { PASS: 0, FAIL: 1 })
  assert.deepEqual(checked.evaluation.bounded_failure_codes, ['DIRECT_ANSWER_LEAKAGE'])
  assert.deepEqual(checked.evaluation.case_results[0].gate_results.map((item) => item.state), [
    'PASS', 'PASS', 'PASS', 'PASS', 'FAIL',
    'NOT_REACHED', 'NOT_REACHED', 'NOT_REACHED', 'NOT_REACHED', 'NOT_REACHED', 'NOT_REACHED',
  ])
  assert.equal(checked.evaluation.gate_aggregate.DIRECT_ANSWER.FAIL, 1)
  assert.equal(checked.evaluation.gate_aggregate.LOCALE_DE_CH.NOT_REACHED, 1)
  const serialized = JSON.stringify(checked.evaluation)
  assert.equal(serialized.includes(`Prüfe: ${hidden}.`), false)
  assert.equal(Object.hasOwn(checked.evaluation.case_results[0].leakage_evidence, 'canonical_answer'), false)
  assert.equal(Object.hasOwn(checked.evaluation.case_results[0].leakage_evidence, 'matched_substring'), false)
})

test('provider HTTP and timeout failures stop after one transport without retry or raw error', async () => {
  for (const kind of ['http', 'timeout']) {
    const sentinel = `raw-${kind}-must-not-survive`
    const checked = await offline({ fetchImplementation: async () => {
      if (kind === 'http') return new Response(JSON.stringify({ error: { message: sentinel } }), {
        status: 503,
        headers: { 'content-type': 'application/json', 'x-should-retry': 'true', 'retry-after-ms': '1' },
      })
      throw new DOMException(sentinel, 'AbortError')
    } })
    assert.equal(checked.calls, 1)
    assert.equal(checked.evaluation.status, 'PARTIAL_RUN')
    assert.equal(checked.evaluation.fixtures_completed, 0)
    assert.equal(checked.evaluation.retries, 0)
    assert.equal(checked.evaluation.provider_failures, 1)
    assert.equal(checked.evaluation.provider_timeouts, kind === 'timeout' ? 1 : 0, JSON.stringify(checked.evaluation.provider_diagnostics))
    assert.equal(JSON.stringify(checked.evaluation).includes(sentinel), false)
    assert.equal(JSON.stringify(checked.evaluation).includes(environment.OPENAI_API_KEY), false)
  }
})

test('parse and missing-usage failures stop and never price unknown usage as zero', async () => {
  const parseFailure = await offline({ fetchImplementation: async () => new Response(JSON.stringify({
    object: 'response',
    usage,
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'not-json' }] }],
  }), { status: 200, headers: { 'content-type': 'application/json' } }) })
  assert.equal(parseFailure.calls, 1)
  assert.equal(parseFailure.evaluation.status, 'PARTIAL_RUN')
  assert.equal(parseFailure.evaluation.provider_diagnostics[0].reason_code, 'PROVIDER_SCHEMA_PARSE_ERROR')
  assert.equal(parseFailure.evaluation.budget.actual_cost, 0.0018)

  const missingUsage = await offline({ fetchImplementation: async (url, init) => {
    const body = await fakeResponse(init).json()
    delete body.usage
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  } })
  assert.equal(missingUsage.calls, 1)
  assert.equal(missingUsage.evaluation.status, 'PARTIAL_RUN')
  assert.equal(missingUsage.evaluation.provider_diagnostics[0].reason_code, 'PROVIDER_USAGE_MISSING')
  assert.equal(missingUsage.evaluation.budget.actual_cost, null)
  assert.equal(missingUsage.evaluation.budget.unpriced_calls, 1)
})

test('budget reserves conservatively and can never authorize transport 121', () => {
  const budget = new EvidenceHardenedRun1Budget()
  for (let index = 0; index < 120; index += 1) {
    assert.equal(budget.reserveNext(), true)
    budget.markTransport()
    budget.recordUsage({ input_tokens: 1, output_tokens: 1, total_tokens: 2 })
  }
  assert.equal(budget.reserveNext(), false)
  assert.equal(budget.snapshot().http_calls, 120)
  assert.equal(budget.snapshot().remaining_http_calls, 0)
  const exceeded = new EvidenceHardenedRun1Budget()
  assert.equal(exceeded.reserveNext(), true)
  exceeded.markTransport()
  assert.throws(() => exceeded.recordUsage({ input_tokens: 40_001, output_tokens: 1, total_tokens: 40_002 }), /BUDGET_EXCEEDED/u)
  assert.equal(exceeded.reserveNext(), false)
})

test('exclusive filesystem claim blocks concurrent and restarted execution', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'eduflow-evidence-hardened-run1-'))
  try {
    let calls = 0
    const run = () => runEvidenceHardenedTutorEvaluationRun1({
      environment,
      claim: () => claimEvidenceHardenedRun1(directory),
      fetchImplementation: async () => {
        calls += 1
        throw new Error('synthetic-only')
      },
    })
    const results = await Promise.all([run(), run()])
    assert.equal(calls, 1)
    assert.equal(results.filter((item) => item.status === 'BLOCKED').length, 1)
    assert.equal((await run()).status, 'BLOCKED')
    assert.equal(calls, 1)
    const raw = await readFile(path.join(directory, EVIDENCE_HARDENED_RUN_1_CLAIM_FILENAME), 'utf8')
    const claim = JSON.parse(raw)
    assert.equal(claim.authorization_consumed, true)
    assert.equal(claim.run_contract_hash, evidenceHardenedRun1ContractHash())
    assert.equal(claim.source_evaluation_scope_fingerprint, manifest.source_evaluation_scope_fingerprint)
    for (const forbidden of ['learner_message', 'hidden_answer', 'learner_answer', 'Authorization', environment.OPENAI_API_KEY]) {
      assert.equal(raw.includes(forbidden), false)
    }
  } finally {
    await rm(directory, { recursive: true })
  }
})

test('run remains outside Learning Truth and preserves historical artifacts byte-for-byte', async () => {
  const runnerSource = await readFile(new URL('../lib/server/learning-v2/tutor/evaluation/evidence-hardened-run-1.js', import.meta.url), 'utf8')
  const scriptSource = await readFile(new URL('../scripts/learning-v2-evidence-hardened-full-evaluation-run-1.mjs', import.meta.url), 'utf8')
  for (const forbidden of ["from '../../database", 'getDatabase(', '.collection(', 'insertOne(', 'updateOne(', 'deleteOne(', 'dotenv']) {
    assert.equal(runnerSource.includes(forbidden), false, forbidden)
    assert.equal(scriptSource.includes(forbidden), false, forbidden)
  }
  assert.equal(LEARNING_V2_DATA_INVENTORY_VERSION, 'learning-v2-data-inventory-v23')
  assert.match(inventoryEntry('tutor_paid_evaluation_manifest').field_groups.join(' '), /evidence-hardened Run-1/u)
  assert.match(inventoryEntry('tutor_paid_evaluation_results').current_deletion, /Evidence-hardened Run-1/u)
  const expected = new Map([
    ['../docs/evaluation-results/tutor-paid-evaluation-v2-prompt-run-1-v1.claim.json', 'f71b646bc850176510a166918a219b89b999163983f44e6e0ca0ede60f624f50'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v2-prompt-run-1-v1.result.json', '922181411312c88c13f3bad50c8d8858c463af90ff5e9cd89537f62c98dcda2f'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v5-run-1-v1.claim.json', '9ffceba7bacb3bdabbe0d49269c8887157bdac0f15129f5eb44227574b3e4561'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v5-run-1-v1.result.json', '9df02a8cb3a935857e7935b85e7113550a42711c629511e5f8c4e2a6f23e4687'],
    ['../docs/LEARNING_V2_HARDENING_H14B_EVIDENCE_HARDENED_FULL_PAID_SYNTHETIC_EVALUATION_REPORT.md', '7e8ad9f2b366d15487c00d91b99bc08f0ffc5fde13d9566596cd5ffc05b36fe9'],
  ])
  for (const [relative, digest] of expected) {
    assert.equal(sha256(await readFile(new URL(relative, import.meta.url))), digest, relative)
  }
})
