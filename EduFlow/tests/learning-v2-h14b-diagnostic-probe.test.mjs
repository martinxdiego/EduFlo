import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { localTutorFallback } from '../lib/server/learning-v2/tutor/fallback-registry.js'
import { tutorSyntheticEvalCases } from '../lib/server/learning-v2/tutor/eval-fixtures.js'
import { TUTOR_RUNTIME_APPROVAL_CONTRACT } from '../lib/server/learning-v2/tutor/governance/runtime-approval.js'
import { TUTOR_DIAGNOSTIC_PROBE_MANIFEST as manifest, diagnosticProbeReadiness, diagnosticGovernanceSnapshot } from '../lib/server/learning-v2/tutor/evaluation/diagnostic-probe-manifest.js'
import { claimDiagnosticProbe, runTutorDiagnosticProbe } from '../lib/server/learning-v2/tutor/evaluation/diagnostic-probe.js'

const environment = Object.freeze({ NODE_ENV: 'test', RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE: '1', OPENAI_API_KEY: 'synthetic-offline-only' })
const fixtures = tutorSyntheticEvalCases()
const usage = Object.freeze({ input_tokens: 300, output_tokens: 100, total_tokens: 400 })
const clone = () => structuredClone(manifest)
function response({ text, tokens = usage, status = 200, output } = {}) {
  const candidate = { ...localTutorFallback(3) }
  return new Response(JSON.stringify({ object: 'response', usage: tokens,
    output: output || [{ type: 'message', content: [{ type: 'output_text', text: text ?? JSON.stringify(candidate) }] }],
  }), { status, headers: { 'content-type': 'application/json' } })
}
async function offline(options = {}) {
  let calls = 0
  let claims = 0
  const result = await runTutorDiagnosticProbe({ environment, claim: async () => { claims++ },
    ...options, fetchImplementation: async (url, init) => { calls++; return options.fetchImplementation ? options.fetchImplementation(url, init) : response() },
  })
  return { result, calls, claims }
}

test('probe v1 pins one existing case and proves USD 0.08192, separate from evaluation v3', () => {
  const checked = diagnosticProbeReadiness({ environment })
  assert.equal(checked.status, 'READY')
  assert.equal(checked.maximum_cost, 0.08192)
  assert.equal(manifest.max_cost, 0.10)
  assert.equal(manifest.max_http_calls, 1)
  assert.equal(manifest.max_retries, 0)
  assert.equal(manifest.repetition_count, 1)
  assert.equal(Object.isFrozen(manifest.frozen_token_pricing), true)
  assert.notEqual(manifest.diagnostic_manifest_version, manifest.source_manifest_version)
})

test('probe missing opt-in, credentials, production and competing opt-ins block before claim and transport', async () => {
  for (const overrides of [{ RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE: undefined }, { OPENAI_API_KEY: '' },
    { NODE_ENV: 'production' }, { NODE_ENV: undefined }, { RUN_TUTOR_PROVIDER_EVALS: '1' },
    { LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '1' }]) {
    const checked = await offline({ environment: { ...environment, ...overrides } })
    assert.equal(checked.result.status, 'BLOCKED')
    assert.equal(checked.calls, 0)
    assert.equal(checked.claims, 0)
  }
})

test('probe every frozen tuple/budget field and extra approval fields are fail-closed with zero calls', async () => {
  const mutations = [
    ['provider_id', 'other'], ['model_id', 'latest'], ['prompt_version', 'other'], ['schema_version', 'other'],
    ['case_id', 'tutor-synthetic-004'], ['case_hash', 'changed'], ['fixture_set_hash', 'changed'],
    ['fixture_count', 2], ['repetition_count', 2], ['synthetic_data_only', false],
    ['max_http_calls', 2], ['max_retries', 1], ['provider_failover', true], ['max_input_tokens', 41_000],
    ['max_output_tokens', 161], ['max_cost', 0.08], ['currency', 'EUR'], ['service_tier', 'priority'],
    ['approved_for_runtime', true], ['runtime_approval_effect', 'APPROVE'],
  ]
  for (const [key, value] of mutations) {
    const edited = clone(); edited[key] = value
    const checked = await offline({ manifest: edited })
    assert.equal(checked.result.status, 'BLOCKED', key)
    assert.equal(checked.calls, 0, key)
    assert.equal(checked.claims, 0, key)
  }
})

test('probe pricing ref, Standard tier and uncached budget cannot be substituted', async () => {
  for (const [key, value] of [['pricing_ref', 'other'], ['pricing_contract_version', 'v2'], ['pricing_mode', 'FAST'],
    ['provider_request_service_tier', 'priority'], ['input_pricing_basis', 'CACHED_INPUT'],
    ['cached_input_discount_applied', true], ['input_per_million', 0.2], ['output_per_million', 11], ['currency', 'EUR']]) {
    const edited = clone(); edited.frozen_token_pricing[key] = value
    const checked = await offline({ manifest: edited })
    assert.equal(checked.result.status, 'BLOCKED', key)
    assert.equal(checked.calls, 0)
  }
})

test('probe changed fixture or source digest blocks before construction/transport', async () => {
  for (const edited of [fixtures.slice(0, 119), fixtures.map((f) => f.case_id === manifest.case_id ? { ...f, level: 1 } : f),
    fixtures.map((f, i) => i === 0 ? { ...f, case_id: 'changed' } : f)]) {
    const checked = await offline({ fixtures: edited })
    assert.equal(checked.result.block_code, 'FROZEN_FIXTURE_MISMATCH')
    assert.equal(checked.calls, 0)
    assert.equal(checked.claims, 0)
  }
})

test('probe cannot create approval from review workflow; governance is closed', () => {
  const state = diagnosticGovernanceSnapshot(environment)
  assert.equal(state.approved_for_runtime, false)
  assert.equal(state.human_review_status, 'NOT_REVIEWED')
  assert.equal(state.production_capabilities_all_off, true)
  for (const change of [{ approved_for_runtime: true }, { human_review: { ...TUTOR_RUNTIME_APPROVAL_CONTRACT.human_review, reviewer_ref: 'not-authorized' } }]) {
    assert.equal(diagnosticProbeReadiness({ environment, approval: { ...TUTOR_RUNTIME_APPROVAL_CONTRACT, ...change } }).status, 'BLOCKED')
  }
})

test('probe success exercises unchanged real SDK parser and normal gates, retaining only bounded usage', async () => {
  const before = JSON.stringify(TUTOR_RUNTIME_APPROVAL_CONTRACT)
  const checked = await offline({ fetchImplementation: async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses')
    assert.equal(init.redirect, 'error')
    const body = JSON.parse(init.body)
    assert.equal(body.model, manifest.model_id)
    assert.equal(body.service_tier, 'default')
    assert.equal(body.max_output_tokens, 160)
    assert.equal(body.store, false)
    return response()
  } })
  assert.equal(checked.calls, 1)
  assert.equal(checked.result.status, 'PROBE_PASS')
  assert.equal(checked.result.comparison, 'FAILURE_NOT_REPRODUCED')
  assert.equal(checked.result.diagnostic.parse_reached, true)
  assert.equal(checked.result.diagnostic.http_status, 200)
  assert.equal(checked.result.diagnostic.gates_reached, true)
  assert.equal(checked.result.cost, 0.0018)
  assert.equal(checked.result.remaining_diagnostic_budget, 0.0982)
  assert.equal(checked.result.remaining_authorized_http_calls, 0)
  assert.equal(checked.result.runtime_approval_changed, false)
  assert.equal(JSON.stringify(TUTOR_RUNTIME_APPROVAL_CONTRACT), before)
})

test('probe parse failure retains numeric usage from HTTP response but no raw text or error', async () => {
  const sentinel = 'PRIVATE_ERROR_AND_OUTPUT_MUST_NOT_BE_RETAINED'
  const checked = await offline({ fetchImplementation: async () => response({ text: sentinel }) })
  assert.equal(checked.calls, 1)
  assert.equal(checked.result.diagnostic.reason_code, 'PROVIDER_SCHEMA_PARSE_ERROR')
  assert.equal(checked.result.diagnostic.parse_reached, true)
  assert.equal(checked.result.diagnostic.response_known, true)
  assert.equal(checked.result.diagnostic.usage_available, true)
  assert.equal(checked.result.diagnostic.gates_reached, false)
  assert.equal(checked.result.cost, 0.0018)
  assert.equal(JSON.stringify(checked.result).includes(sentinel), false)
  assert.equal(JSON.stringify(checked.result).includes(environment.OPENAI_API_KEY), false)
})

test('probe absent output and malformed HTTP JSON do not falsely claim structured parsing reached', async () => {
  for (const fake of [() => response({ output: [] }), () => new Response('not-json', { headers: { 'content-type': 'application/json' } })]) {
    const checked = await offline({ fetchImplementation: async () => fake() })
    assert.equal(checked.calls, 1)
    assert.equal(checked.result.status, 'PROBE_FAIL')
    assert.equal(checked.result.diagnostic.response_known, true)
    assert.equal(checked.result.diagnostic.parse_reached, false)
  }
})

test('probe 429/5xx/4xx never retry even with retry advice and never retain error body', async () => {
  for (const [status, reason] of [[429, 'PROVIDER_HTTP_429'], [503, 'PROVIDER_HTTP_5XX'], [400, 'PROVIDER_HTTP_4XX']]) {
    const checked = await offline({ fetchImplementation: async () => new Response(JSON.stringify({ error: { message: 'private-error-body' } }),
      { status, headers: { 'content-type': 'application/json', 'x-should-retry': 'true', 'retry-after-ms': '1' } }) })
    assert.equal(checked.calls, 1)
    assert.equal(checked.result.retries, 0)
    assert.equal(checked.result.diagnostic.reason_code, reason)
    assert.equal(checked.result.diagnostic.http_status, status)
    assert.equal(checked.result.diagnostic.parse_reached, false)
    assert.equal(JSON.stringify(checked.result).includes('private-error-body'), false)
  }
})

test('probe network failure/abort stop after one dispatch and unknown usage is not zero cost', async () => {
  for (const name of ['Error', 'AbortError']) {
    const checked = await offline({ fetchImplementation: async () => { const error = new Error('private-network-error'); error.name = name; throw error } })
    assert.equal(checked.calls, 1)
    assert.equal(checked.result.diagnostic.response_known, false)
    assert.equal(checked.result.diagnostic.usage_available, false)
    assert.equal(checked.result.cost, null)
    assert.equal(checked.result.remaining_diagnostic_budget, null)
    assert.equal(checked.result.conservative_unspent_bound, 0.01808)
    assert.equal(JSON.stringify(checked.result).includes('private-network-error'), false)
  }
})

test('probe missing or inconsistent usage never treats it as free; gate failures stay bounded', async () => {
  for (const tokens of [null, { input_tokens: null, output_tokens: 0, total_tokens: 0 }, { ...usage, total_tokens: 1 }]) {
    const checked = await offline({ fetchImplementation: async () => response({ tokens }) })
    assert.equal(checked.result.diagnostic.reason_code, 'PROVIDER_USAGE_MISSING')
    assert.equal(checked.result.cost, null)
    assert.equal(checked.calls, 1)
  }
  const candidate = { ...localTutorFallback(2) }
  const checked = await offline({ fetchImplementation: async () => response({ text: JSON.stringify(candidate) }) })
  assert.equal(checked.result.automated_gate.passed, false)
  assert.equal(checked.result.status, 'PROBE_FAIL')
  assert.equal(checked.calls, 1)
})

test('probe unexpected actual usage over cap fails without further transport', async () => {
  const checked = await offline({ fetchImplementation: async () => response({ tokens: { input_tokens: 60_000, output_tokens: 100, total_tokens: 60_100 } }) })
  assert.equal(checked.result.budget_exceeded, true)
  assert.equal(checked.result.status, 'PROBE_FAIL')
  assert.equal(checked.calls, 1)
  assert.equal(checked.result.remaining_authorized_http_calls, 0)
})

test('probe requires durable claim and rechecks opt-in after asynchronous claim', async () => {
  const missing = await offline({ claim: undefined })
  assert.equal(missing.result.block_code, 'DURABLE_AUTHORIZATION_CLAIM_REQUIRED')
  assert.equal(missing.calls, 0)
  const changed = { ...environment }
  const checked = await offline({ environment: changed, claim: async () => { changed.RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE = '0' } })
  assert.equal(checked.result.status, 'BLOCKED')
  assert.equal(checked.calls, 0)
})

test('probe exclusive durable claim prevents concurrent start and restart after failure', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'eduflow-probe-unit-'))
  try {
    let calls = 0
    const run = () => runTutorDiagnosticProbe({ environment, claim: () => claimDiagnosticProbe(directory),
      fetchImplementation: async () => { calls++; throw new Error('synthetic-failure') } })
    const results = await Promise.all([run(), run()])
    assert.equal(calls, 1)
    assert.equal(results.filter((item) => item.status === 'BLOCKED').length, 1)
    assert.equal((await run()).status, 'BLOCKED')
    assert.equal(calls, 1)
    const claim = JSON.parse(await readFile(path.join(directory, 'tutor-paid-diagnostic-probe-v1.claim.json'), 'utf8'))
    assert.equal(claim.authorization_consumed, true)
    assert.equal(Object.keys(claim).length, 3)
  } finally { await rm(directory, { recursive: true }) }
})
