import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { localTutorFallback } from '../lib/server/learning-v2/tutor/fallback-registry.js'
import { tutorSyntheticEvalCases } from '../lib/server/learning-v2/tutor/eval-fixtures.js'
import { TUTOR_RUNTIME_APPROVAL_CONTRACT } from '../lib/server/learning-v2/tutor/governance/runtime-approval.js'
import {
  fullEvaluationRun2ContractHash,
  fullEvaluationRun2Governance,
  fullEvaluationRun2Readiness,
  TUTOR_FULL_EVALUATION_RUN_2_MANIFEST as manifest,
} from '../lib/server/learning-v2/tutor/evaluation/full-evaluation-run-2-manifest.js'
import {
  claimFullEvaluationRun2,
  FullEvaluationRun2Budget,
  runFullTutorEvaluationRun2,
} from '../lib/server/learning-v2/tutor/evaluation/full-evaluation-run-2.js'
import { inventoryEntry, LEARNING_V2_DATA_INVENTORY_VERSION } from '../lib/server/learning-v2/privacy/data-inventory-v1.js'

const fixtures = tutorSyntheticEvalCases()
const environment = Object.freeze({
  NODE_ENV: 'test',
  RUN_TUTOR_PROVIDER_EVALS: '1',
  RUN_TUTOR_PROVIDER_EVAL_RUN_2: '1',
  RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE: '0',
  LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '0',
  OPENAI_API_KEY: 'synthetic-offline-only',
})
const usage = Object.freeze({ input_tokens: 300, output_tokens: 100, total_tokens: 400 })
const clone = () => structuredClone(manifest)

function fakeResponse(init = {}) {
  const body = JSON.parse(init.body)
  const context = JSON.parse(body.input)
  return new Response(JSON.stringify({
    object: 'response',
    usage,
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(localTutorFallback(context.decision.hint_level)) }] }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

async function offline(options = {}) {
  let calls = 0
  let claims = 0
  const supplied = options.fetchImplementation
  const evaluation = await runFullTutorEvaluationRun2({
    environment,
    claim: async () => { claims++ },
    ...options,
    fetchImplementation: async (url, init) => {
      calls++
      return supplied ? supplied(url, init, calls) : fakeResponse(init)
    },
  })
  return { evaluation, calls, claims }
}

test('Run 2 manifest is immutable, distinct and binds the exact frozen 120-case scope', () => {
  const checked = fullEvaluationRun2Readiness({ environment })
  assert.equal(checked.status, 'READY')
  assert.equal(checked.maximum_cost, 9.8304)
  assert.equal(manifest.run_manifest_version, 'tutor-paid-evaluation-run-2-v1')
  assert.equal(manifest.source_evaluation_manifest_version, 'tutor-paid-evaluation-v3')
  assert.equal(manifest.fixture_count, 120)
  assert.equal(manifest.repetition_count, 1)
  assert.equal(manifest.max_http_calls, 120)
  assert.equal(manifest.max_retries, 0)
  assert.equal(manifest.provider_failover, false)
  assert.equal(manifest.max_cost, 10)
  assert.equal(Object.isFrozen(manifest.frozen_token_pricing), true)
  assert.match(fullEvaluationRun2ContractHash(), /^sha256:[0-9a-f]{64}$/)
  assert.equal(Object.hasOwn(manifest, 'approved_for_runtime'), false)
})

test('Run 2 missing opt-ins, credentials, allowed environment or closed gates block before claim and transport', async () => {
  const variants = [
    { RUN_TUTOR_PROVIDER_EVALS: '0' }, { RUN_TUTOR_PROVIDER_EVAL_RUN_2: '0' }, { OPENAI_API_KEY: '' },
    { NODE_ENV: 'production' }, { NODE_ENV: undefined }, { RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE: '1' },
    { LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '1' },
  ]
  for (const change of variants) {
    const checked = await offline({ environment: { ...environment, ...change } })
    assert.equal(checked.evaluation.status, 'BLOCKED')
    assert.equal(checked.calls, 0)
    assert.equal(checked.claims, 0)
  }
})

test('Run 2 exact target, identity and budget mutations fail closed with zero calls', async () => {
  const changes = [
    ['run_manifest_version', 'other'], ['evaluator_version', 'other'], ['source_evaluation_manifest_version', 'other'],
    ['provider_id', 'other'], ['model_id', 'latest'], ['prompt_version', 'other'], ['schema_version', 'other'],
    ['fixture_set_hash', 'changed'], ['fixture_count', 119], ['repetition_count', 2], ['synthetic_data_only', false],
    ['pricing_contract_version', 'other'], ['pricing_ref', 'other'], ['pricing_mode', 'FAST'], ['service_tier', 'priority'],
    ['max_http_calls', 121], ['max_retries', 1], ['provider_failover', true], ['max_input_tokens', 4_800_001],
    ['max_output_tokens', 19_201], ['max_total_tokens', 4_819_201], ['max_cost', 11], ['currency', 'EUR'],
    ['approved_for_runtime', true],
  ]
  for (const [field, value] of changes) {
    const edited = clone(); edited[field] = value
    const checked = await offline({ manifest: edited })
    assert.equal(checked.evaluation.status, 'BLOCKED', field)
    assert.equal(checked.calls, 0, field)
    assert.equal(checked.claims, 0, field)
  }
})

test('Run 2 pricing tuple cannot use Fast mode, cached discounts or changed rates', async () => {
  for (const [field, value] of [['pricing_ref', 'changed'], ['pricing_mode', 'FAST'], ['provider_request_service_tier', 'priority'],
    ['input_pricing_basis', 'CACHED_INPUT'], ['cached_input_discount_applied', true], ['input_per_million', 0.2],
    ['output_per_million', 11], ['currency', 'EUR']]) {
    const edited = clone(); edited.frozen_token_pricing[field] = value
    const checked = await offline({ manifest: edited })
    assert.equal(checked.evaluation.status, 'BLOCKED', field)
    assert.equal(checked.calls, 0)
  }
})

test('Run 2 changed, missing, duplicate or reordered fixtures block without a claim', async () => {
  for (const changed of [fixtures.slice(0, 119), [...fixtures].reverse(),
    fixtures.map((item, index) => index === 0 ? { ...item, level: 2 } : item),
    fixtures.map((item, index) => index === 1 ? { ...item, case_id: fixtures[0].case_id } : item)]) {
    const checked = await offline({ fixtures: changed })
    assert.equal(checked.evaluation.status, 'BLOCKED')
    assert.equal(checked.calls, 0)
    assert.equal(checked.claims, 0)
  }
})

test('Run 2 workflow and evaluation cannot create human or runtime approval', () => {
  const state = fullEvaluationRun2Governance(environment)
  assert.equal(state.approved_for_runtime, false)
  assert.equal(state.human_review_status, 'NOT_REVIEWED')
  assert.equal(state.production_capabilities_all_off, true)
  for (const change of [{ approved_for_runtime: true }, {
    human_review: { ...TUTOR_RUNTIME_APPROVAL_CONTRACT.human_review, status: 'APPROVED', reviewer_ref: 'x', review_ref: 'y', approved_at: new Date().toISOString() },
  }]) {
    assert.equal(fullEvaluationRun2Readiness({ environment, approval: { ...TUTOR_RUNTIME_APPROVAL_CONTRACT, ...change } }).status, 'BLOCKED')
  }
})

test('Run 2 completes all 120 fixtures in one new run with exact usage and zero retries', async () => {
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
  assert.equal(checked.evaluation.fixtures_completed, 120)
  assert.equal(checked.evaluation.case_results.length, 120)
  assert.equal(checked.calls, 120)
  assert.equal(checked.evaluation.budget.http_calls, 120)
  assert.equal(checked.evaluation.budget.input_tokens, 36_000)
  assert.equal(checked.evaluation.budget.output_tokens, 12_000)
  assert.equal(checked.evaluation.budget.actual_cost, 0.216)
  assert.equal(checked.evaluation.budget.remaining_http_calls, 0)
  assert.equal(checked.evaluation.retries, 0)
  assert.equal(checked.evaluation.provider_diagnostics.length, 0)
  assert.equal(checked.evaluation.runtime_approval_changed, false)
  assert.equal(JSON.stringify(TUTOR_RUNTIME_APPROVAL_CONTRACT), before)
})

test('Run 2 provider HTTP failure stops at that fixture with one attempt and bounded diagnostics', async () => {
  const sentinel = 'RAW_ERROR_BODY_MUST_NOT_SURVIVE'
  const checked = await offline({ fetchImplementation: async (url, init, ordinal) => ordinal < 3 ? fakeResponse(init)
    : new Response(JSON.stringify({ error: { message: sentinel } }), {
      status: 503, headers: { 'content-type': 'application/json', 'x-should-retry': 'true', 'retry-after-ms': '1' },
    }) })
  assert.equal(checked.calls, 3)
  assert.equal(checked.evaluation.status, 'PARTIAL_RUN')
  assert.equal(checked.evaluation.fixtures_completed, 2)
  assert.equal(checked.evaluation.retries, 0)
  assert.equal(checked.evaluation.provider_diagnostics.length, 1)
  assert.deepEqual(checked.evaluation.provider_diagnostics[0], {
    diagnostic_version: 'tutor-paid-evaluation-provider-diagnostic-v1',
    reason_code: 'PROVIDER_HTTP_5XX', category: 'provider_transient', response_known: true,
    http_status: 503, parse_reached: false, transport_started: true, usage_available: false,
    gates_reached: false, call_ordinal: 3, case_id: 'tutor-synthetic-003', raw_error_retained: false,
  })
  assert.equal(checked.evaluation.budget.actual_cost, null)
  assert.equal(checked.evaluation.budget.unpriced_calls, 1)
  assert.equal(JSON.stringify(checked.evaluation).includes(sentinel), false)
  assert.equal(JSON.stringify(checked.evaluation).includes(environment.OPENAI_API_KEY), false)
})

test('Run 2 structured parse failure preserves trustworthy usage and stops without retry', async () => {
  const checked = await offline({ fetchImplementation: async () => new Response(JSON.stringify({
    object: 'response', usage, output: [{ type: 'message', content: [{ type: 'output_text', text: 'not-json' }] }],
  }), { status: 200, headers: { 'content-type': 'application/json' } }) })
  assert.equal(checked.calls, 1)
  assert.equal(checked.evaluation.status, 'PARTIAL_RUN')
  assert.equal(checked.evaluation.provider_diagnostics[0].reason_code, 'PROVIDER_SCHEMA_PARSE_ERROR')
  assert.equal(checked.evaluation.provider_diagnostics[0].response_known, true)
  assert.equal(checked.evaluation.provider_diagnostics[0].http_status, 200)
  assert.equal(checked.evaluation.provider_diagnostics[0].parse_reached, true)
  assert.equal(checked.evaluation.provider_diagnostics[0].usage_available, true)
  assert.equal(checked.evaluation.budget.actual_cost, 0.0018)
})

test('Run 2 missing or untrustworthy usage is not treated as zero cost and stops', async () => {
  for (const tokens of [null, { input_tokens: null, output_tokens: 0, total_tokens: 0 }, { ...usage, total_tokens: 1 }]) {
    const checked = await offline({ fetchImplementation: async (url, init) => {
      const base = await fakeResponse(init).json(); base.usage = tokens
      return new Response(JSON.stringify(base), { status: 200, headers: { 'content-type': 'application/json' } })
    } })
    assert.equal(checked.calls, 1)
    assert.equal(checked.evaluation.status, 'PARTIAL_RUN')
    assert.equal(checked.evaluation.provider_diagnostics[0].reason_code, 'PROVIDER_USAGE_MISSING')
    assert.equal(checked.evaluation.budget.actual_cost, null)
    assert.equal(checked.evaluation.budget.unpriced_calls, 1)
  }
})

test('Run 2 network/abort failure performs exactly one dispatch and preserves no raw error', async () => {
  for (const name of ['Error', 'AbortError']) {
    const checked = await offline({ fetchImplementation: async () => {
      const error = new Error('private-network-detail'); error.name = name; throw error
    } })
    assert.equal(checked.calls, 1)
    assert.equal(checked.evaluation.status, 'PARTIAL_RUN')
    assert.equal(checked.evaluation.provider_diagnostics[0].response_known, false)
    assert.equal(checked.evaluation.provider_diagnostics[0].transport_started, true)
    assert.equal(checked.evaluation.provider_diagnostics[0].usage_available, false)
    assert.equal(JSON.stringify(checked.evaluation).includes('private-network-detail'), false)
  }
})

test('Run 2 bounded pedagogical gate failure is FAIL_TECHNICAL and cannot continue', async () => {
  const checked = await offline({ fetchImplementation: async (url, init) => {
    const base = await fakeResponse(init).json()
    base.output[0].content[0].text = JSON.stringify(localTutorFallback(2))
    return new Response(JSON.stringify(base), { status: 200, headers: { 'content-type': 'application/json' } })
  } })
  assert.equal(checked.calls, 1)
  assert.equal(checked.evaluation.status, 'FAIL_TECHNICAL')
  assert.equal(checked.evaluation.fixtures_completed, 1)
  assert.equal(checked.evaluation.case_results[0].code, 'WRONG_LEVEL')
  assert.equal(checked.evaluation.provider_diagnostics.length, 0)
})

test('Run 2 budget validates usage, freezes after a cap breach and never authorizes call 121', () => {
  const budget = new FullEvaluationRun2Budget()
  for (let index = 0; index < 120; index += 1) {
    assert.equal(budget.reserveNext(), true)
    budget.markTransport()
    budget.recordUsage({ input_tokens: 1, output_tokens: 1, total_tokens: 2 })
  }
  assert.equal(budget.reserveNext(), false)
  assert.equal(budget.snapshot().http_calls, 120)
  assert.equal(budget.snapshot().remaining_http_calls, 0)
  const exceeded = new FullEvaluationRun2Budget()
  assert.equal(exceeded.reserveNext(), true)
  exceeded.markTransport()
  assert.throws(() => exceeded.recordUsage({ input_tokens: 40_001, output_tokens: 1, total_tokens: 40_002 }), /RUN_2_BUDGET_EXCEEDED/)
  assert.equal(exceeded.reserveNext(), false)
})

test('Run 2 requires an exclusive durable claim and rechecks authorization after claim', async () => {
  const missing = await offline({ claim: undefined })
  assert.equal(missing.evaluation.reason_code, 'RUN_2_DURABLE_CLAIM_REQUIRED')
  assert.equal(missing.calls, 0)
  const changed = { ...environment }
  const checked = await offline({ environment: changed, claim: async () => { changed.RUN_TUTOR_PROVIDER_EVAL_RUN_2 = '0' } })
  assert.equal(checked.evaluation.status, 'PARTIAL_RUN')
  assert.equal(checked.calls, 0)
})

test('Run 2 filesystem claim prevents concurrent or restarted execution and contains no content', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'eduflow-run2-unit-'))
  try {
    let calls = 0
    const run = () => runFullTutorEvaluationRun2({ environment, claim: () => claimFullEvaluationRun2(directory),
      fetchImplementation: async () => { calls++; throw new Error('synthetic-failure') } })
    const results = await Promise.all([run(), run()])
    assert.equal(calls, 1)
    assert.equal(results.filter((item) => item.status === 'BLOCKED').length, 1)
    assert.equal((await run()).status, 'BLOCKED')
    assert.equal(calls, 1)
    const raw = await readFile(path.join(directory, 'tutor-paid-evaluation-run-2-v1.claim.json'), 'utf8')
    const claim = JSON.parse(raw)
    assert.equal(claim.authorization_consumed, true)
    assert.equal(claim.run_contract_hash, fullEvaluationRun2ContractHash())
    assert.equal(Object.keys(claim).length, 4)
    for (const forbidden of ['prompt', 'answer', 'Authorization', environment.OPENAI_API_KEY]) assert.equal(raw.includes(forbidden), false)
  } finally { await rm(directory, { recursive: true }) }
})

test('Run 2 source contains no Mongo/domain write path and results expose only bounded case metadata', async () => {
  const checked = await offline({ fixtures: fixtures.slice(0, 119) })
  assert.equal(checked.evaluation.domain_database_used, undefined)
  const source = await readFile(new URL('../lib/server/learning-v2/tutor/evaluation/full-evaluation-run-2.js', import.meta.url), 'utf8')
  for (const forbidden of ["from '../../database", 'getDatabase(', '.collection(', 'insertOne(', 'updateOne(', 'deleteOne(']) {
    assert.equal(source.includes(forbidden), false, forbidden)
  }
  assert.equal(LEARNING_V2_DATA_INVENTORY_VERSION, 'learning-v2-data-inventory-v23')
  assert.equal(inventoryEntry('tutor_paid_evaluation_results').storage_kind, 'repository_bounded_artifacts')
  assert.match(inventoryEntry('tutor_paid_evaluation_results').current_deletion, /never be used to authorize another run/u)
})
