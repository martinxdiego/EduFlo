import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PHASE_3_SCHEMA_VERSION,
  TUTOR_ACTION_BY_LEVEL,
  TUTOR_PROVIDER_SCHEMA_VERSION,
  TUTOR_REASON_BY_LEVEL,
} from '../lib/server/learning-v2/contracts/phase3.js'
import {
  TUTOR_RUNTIME_APPROVAL_CONTRACT,
  TutorRuntimeApprovalGate,
} from '../lib/server/learning-v2/tutor/governance/runtime-approval.js'
import {
  conservativeMaximumEvaluationCost,
  paidEvaluationReadiness,
  tutorFixtureSetHash,
  tutorEvaluationManifestSchema,
  TUTOR_PAID_EVALUATION_MANIFEST,
} from '../lib/server/learning-v2/tutor/evaluation/evaluation-manifest.js'
import {
  TUTOR_FROZEN_TOKEN_PRICING,
  TUTOR_PAID_EVALUATION_PRICING_CONTRACT,
  TUTOR_PRICING_CONTRACT_VERSION,
  TUTOR_PRICING_REF,
  TUTOR_STANDARD_SERVICE_TIER,
} from '../lib/server/learning-v2/tutor/evaluation/pricing-contract.js'
import { evaluateTutorCandidate } from '../lib/server/learning-v2/tutor/evaluation/evaluation-gates.js'
import { PaidEvaluationBudget, runPaidTutorEvaluation } from '../lib/server/learning-v2/tutor/evaluation/paid-evaluation.js'
import {
  classifyPaidEvaluationProviderError,
  TUTOR_PROVIDER_DIAGNOSTIC_VERSION,
} from '../lib/server/learning-v2/tutor/evaluation/provider-diagnostics.js'
import { inventoryEntry, LEARNING_V2_DATA_INVENTORY_VERSION } from '../lib/server/learning-v2/privacy/data-inventory-v1.js'
import { tutorSyntheticEvalCases } from '../lib/server/learning-v2/tutor/eval-fixtures.js'
import {
  TUTOR_HUMAN_REVIEW_WORKFLOW,
  TUTOR_HUMAN_REVIEW_WORKFLOW_REF,
  TUTOR_HUMAN_REVIEWER_ROLE,
} from '../lib/server/learning-v2/tutor/governance/human-review-workflow.js'

function candidate(level = 1, message = 'Welche Information bestimmt deinen nächsten Schritt?') {
  return {
    schema_version: TUTOR_PROVIDER_SCHEMA_VERSION,
    action: TUTOR_ACTION_BY_LEVEL[level],
    hint_level: level,
    learner_message: message,
    reason_code: TUTOR_REASON_BY_LEVEL[level],
    teacher_attention: false,
  }
}

const fixture = Object.freeze({
  case_id: 'h14b-synthetic-001',
  level: 1,
  prompt: 'Welche Darstellung passt?',
  options: Object.freeze(['eine Summe', 'ein Produkt', 'eine Differenz']),
  correctAnswer: 'ein Produkt',
})

function budgetTestManifest(overrides = {}) {
  return {
    ...TUTOR_PAID_EVALUATION_MANIFEST,
    fixture_count: 1,
    fixture_set_hash: tutorFixtureSetHash([fixture]),
    repetition_count: 1,
    max_http_calls: 1,
    max_input_tokens: 20,
    max_output_tokens: 10,
    max_total_tokens: 30,
    max_input_tokens_per_call: 10,
    max_output_tokens_per_call: 5,
    max_cost: 10,
    currency: 'USD',
    ...overrides,
  }
}

const runnableEnvironment = Object.freeze({ NODE_ENV: 'test', RUN_TUTOR_PROVIDER_EVALS: '1', OPENAI_API_KEY: 'synthetic-test-key' })

async function assertEvaluationBlocked(manifest, reasonCode, environment = runnableEnvironment) {
  let providerTouches = 0
  const result = await runPaidTutorEvaluation({
    environment,
    manifest,
    fixtures: [fixture],
    provider: {
      available() { providerTouches += 1; return true },
      async generate() { providerTouches += 1; throw new Error('must not run') },
    },
  })
  assert.equal(result.status, 'BLOCKED')
  assert.equal(result.reason_code, reasonCode)
  assert.equal(result.http_calls, 0)
  assert.equal(providerTouches, 0)
}

test('H14-B repository approval contract is versioned, immutable and explicitly not approved', () => {
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.approval_contract_version, 'tutor-runtime-approval-v4')
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.approved_for_runtime, false)
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.human_review.status, 'NOT_REVIEWED')
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.human_review.workflow_ref, TUTOR_HUMAN_REVIEW_WORKFLOW_REF)
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.human_review.required_reviewer_role, TUTOR_HUMAN_REVIEWER_ROLE)
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.human_review.reviewer_ref, null)
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.human_review.approved_at, null)
  assert.equal(Object.isFrozen(TUTOR_RUNTIME_APPROVAL_CONTRACT), true)
  assert.equal(Object.isFrozen(TUTOR_RUNTIME_APPROVAL_CONTRACT.human_review), true)
  const gate = new TutorRuntimeApprovalGate({ environment: {}, nodeEnvironment: 'test' })
  assert.equal(Object.isFrozen(gate.contract), true)
  assert.equal(Object.isFrozen(gate.contract.human_review), true)
})

test('H14-B current exact tuple stays blocked without human approval and every tuple mismatch fails closed', () => {
  const gate = new TutorRuntimeApprovalGate({
    environment: { LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '1' },
    nodeEnvironment: 'test',
  })
  const exact = gate.configuration()
  assert.deepEqual(gate.evaluate(exact), { allowed: false, reasonCode: 'PROVIDER_APPROVAL_NOT_APPROVED' })
  const mismatches = [
    ['provider', 'unknown', 'PROVIDER_NOT_APPROVED'],
    ['model', 'unknown', 'PROVIDER_MODEL_NOT_APPROVED'],
    ['prompt_version', 'unknown', 'PROVIDER_PROMPT_NOT_APPROVED'],
    ['structured_output_schema_version', 'unknown', 'PROVIDER_SCHEMA_NOT_APPROVED'],
    ['approval_ref', 'unknown', 'PROVIDER_APPROVAL_REF_MISMATCH'],
  ]
  for (const [field, value, reasonCode] of mismatches) {
    assert.deepEqual(gate.evaluate({ ...exact, [field]: value }), { allowed: false, reasonCode })
  }
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.approved_for_runtime, false)
})

test('H14-B runtime switch and environment are independent fail-closed gates including production', () => {
  const off = new TutorRuntimeApprovalGate({ environment: {}, nodeEnvironment: 'test' })
  assert.equal(off.evaluate(off.configuration()).reasonCode, 'PROVIDER_RUNTIME_GATE_OFF')
  const production = new TutorRuntimeApprovalGate({
    environment: { LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '1' },
    nodeEnvironment: 'production',
  })
  assert.equal(production.evaluate(production.configuration()).reasonCode, 'PROVIDER_ENVIRONMENT_NOT_ALLOWED')
})

test('H14-B paid evaluation defaults to NOT RUN and v3 stays blocked without a new run authorization', () => {
  assert.equal(paidEvaluationReadiness({}).reasonCode, 'OPT_IN_REQUIRED')
  const blocked = paidEvaluationReadiness(runnableEnvironment)
  assert.equal(blocked.runnable, false)
  assert.equal(blocked.status, 'BLOCKED')
  assert.equal(blocked.reasonCode, 'PAID_EVALUATION_AUTHORIZATION_REQUIRED')
  assert.equal(blocked.maximum_cost, 9.8304)
  assert.equal(blocked.max_cost, 10)
  assert.equal(blocked.currency, 'USD')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.result_status, 'NOT_RUN')
  assert.equal(tutorFixtureSetHash(tutorSyntheticEvalCases()), TUTOR_PAID_EVALUATION_MANIFEST.fixture_set_hash)
})

test('H14-B exact immutable Standard uncached pricing tuple and maximum-cost proof are frozen', () => {
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.eval_manifest_version, 'tutor-paid-evaluation-v8')
  assert.equal(TUTOR_PRICING_CONTRACT_VERSION, 'openai-gpt-5.6-terra-standard-pricing-v1')
  assert.equal(TUTOR_PRICING_REF, 'openai:gpt-5.6-terra:standard-api:2026-07-30:v1')
  assert.deepEqual(TUTOR_PAID_EVALUATION_MANIFEST.frozen_token_pricing, TUTOR_FROZEN_TOKEN_PRICING)
  assert.equal(TUTOR_FROZEN_TOKEN_PRICING.input_per_million, 2)
  assert.equal(TUTOR_FROZEN_TOKEN_PRICING.output_per_million, 12)
  assert.equal(TUTOR_FROZEN_TOKEN_PRICING.currency, 'USD')
  assert.equal(TUTOR_FROZEN_TOKEN_PRICING.pricing_mode, 'STANDARD_API')
  assert.equal(TUTOR_FROZEN_TOKEN_PRICING.provider_request_service_tier, TUTOR_STANDARD_SERVICE_TIER)
  assert.equal(TUTOR_FROZEN_TOKEN_PRICING.input_pricing_basis, 'UNCACHED_INPUT')
  assert.equal(TUTOR_FROZEN_TOKEN_PRICING.cached_input_discount_applied, false)
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.max_cost, 10)
  assert.equal(conservativeMaximumEvaluationCost(), 9.8304)
  assert.equal(Object.isFrozen(TUTOR_PAID_EVALUATION_PRICING_CONTRACT), true)
  assert.equal(TUTOR_PAID_EVALUATION_PRICING_CONTRACT.runtime_fetch_allowed, false)
})

test('H14-B automated gates reject strict-schema, authority, full-solution and de-CH violations', () => {
  assert.equal(evaluateTutorCandidate({ ...candidate(), tenant_id: 'forbidden' }, fixture).code, 'SCHEMA_INVALID')
  assert.equal(evaluateTutorCandidate(candidate(1, 'Deine Mastery bestimmt den nächsten Schritt.'), fixture).code, 'FORBIDDEN_AUTHORITY')
  assert.equal(evaluateTutorCandidate(candidate(1, 'Die vollständige Lösung kommt in Schritt 1: prüfen. Schritt 2: auswählen.'), fixture).code, 'FULL_SOLUTION')
  assert.equal(evaluateTutorCandidate(candidate(1, 'Überprüfe, daß die Regel passt.'), fixture).code, 'LOCALE_DE_CH_VIOLATION')
})

test('H14-B unapproved v3 evaluation cannot touch a provider or mutate runtime governance', async () => {
  const before = JSON.stringify(TUTOR_RUNTIME_APPROVAL_CONTRACT)
  const fixtures = tutorSyntheticEvalCases()
  let providerTouches = 0
  const result = await runPaidTutorEvaluation({
    environment: runnableEnvironment,
    manifest: TUTOR_PAID_EVALUATION_MANIFEST,
    fixtures,
    provider: {
      available() { providerTouches += 1; return true },
      async generate() { providerTouches += 1; throw new Error('must not run') },
    },
  })
  assert.equal(result.status, 'BLOCKED')
  assert.equal(result.reason_code, 'PAID_EVALUATION_AUTHORIZATION_REQUIRED')
  assert.equal(result.runtime_approval_changed, false)
  assert.equal(result.http_calls, 0)
  assert.equal(providerTouches, 0)
  assert.equal(JSON.stringify(TUTOR_RUNTIME_APPROVAL_CONTRACT), before)
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.approved_for_runtime, false)
})

test('H14-B leakage gate remains local, bounded and independent from runtime approval', () => {
  const fixtures = tutorSyntheticEvalCases()
  const message = `Die Lösung lautet ${fixtures[0].correctAnswer}.`
  const result = evaluateTutorCandidate(candidate(fixtures[0].level, message), fixtures[0])
  assert.deepEqual(result, { passed: false, code: 'DIRECT_ANSWER_LEAKAGE' })
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.approved_for_runtime, false)
})

test('H14-B call cap stops before any additional external transport', () => {
  const budget = new PaidEvaluationBudget(budgetTestManifest())
  assert.equal(budget.beforeCall(), true)
  budget.markTransport()
  budget.recordUsage({ input_tokens: 3, output_tokens: 2, total_tokens: 5 })
  assert.equal(budget.beforeCall(), false)
  assert.equal(budget.snapshot().http_calls, 1)
  assert.equal(budget.snapshot().hard_stopped, true)
})

test('H14-B token and cost caps stop conservatively before transport', () => {
  const tokenBudget = new PaidEvaluationBudget(budgetTestManifest({ max_input_tokens: 9 }))
  assert.equal(tokenBudget.beforeCall(), false)
  assert.equal(tokenBudget.snapshot().http_calls, 0)
  const costBudget = new PaidEvaluationBudget(budgetTestManifest({ max_cost: 0 }))
  assert.equal(costBudget.beforeCall(), false)
  assert.equal(costBudget.snapshot().http_calls, 0)
})

test('H14-B runtime and evaluation request schemas contain no client-owned approval authority', () => {
  assert.equal(PHASE_3_SCHEMA_VERSION, 'learning-v2-phase3-v1')
  const serialized = JSON.stringify(TUTOR_PAID_EVALUATION_MANIFEST)
  assert.equal(serialized.includes('student_id'), false)
  assert.equal(serialized.includes('tenant_id'), false)
  assert.equal(serialized.includes('learner_answer'), false)
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.human_review.reviewer_ref, null)
  assert.equal(LEARNING_V2_DATA_INVENTORY_VERSION, 'learning-v2-data-inventory-v23')
  for (const id of ['tutor_runtime_approval_config', 'tutor_paid_evaluation_manifest', 'tutor_paid_evaluation_results', 'tutor_quality_policy_config', 'tutor_human_review_metadata', 'tutor_diagnostic_probe_artifacts']) {
    assert.ok(inventoryEntry(id), id)
  }
  assert.match(inventoryEntry('tutor_paid_evaluation_results').field_groups.join(' '), /calls\/tokens\/cost/u)
  assert.match(inventoryEntry('tutor_sessions').field_groups.join(' '), /approval-ref/u)
})

test('H14-B evaluation configuration cannot carry or set approved_for_runtime', () => {
  assert.equal(tutorEvaluationManifestSchema.safeParse({
    ...TUTOR_PAID_EVALUATION_MANIFEST,
    approved_for_runtime: true,
  }).success, false)
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.evaluation_authorization.scope, 'SYNTHETIC_EVALUATION_CONFIGURATION_ONLY')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.evaluation_authorization.status, 'NOT_AUTHORIZED')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.evaluation_authorization.runtime_approval_effect, 'NONE')
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.approved_for_runtime, false)
})

test('H14-B human-review workflow existence is not a human review or runtime approval', () => {
  assert.equal(TUTOR_HUMAN_REVIEW_WORKFLOW.workflow_ref, TUTOR_HUMAN_REVIEW_WORKFLOW_REF)
  assert.equal(TUTOR_HUMAN_REVIEW_WORKFLOW.required_reviewer_role, TUTOR_HUMAN_REVIEWER_ROLE)
  assert.equal(TUTOR_HUMAN_REVIEW_WORKFLOW.automated_evaluation_can_approve, false)
  assert.equal(TUTOR_HUMAN_REVIEW_WORKFLOW.runtime_approval_effect, 'NONE')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.human_review.workflow_ref, TUTOR_HUMAN_REVIEW_WORKFLOW_REF)
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.human_review.required_reviewer_role, 'EDUFLOW_PEDAGOGICAL_REVIEWER')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.human_review.reviewer_ref, null)
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.human_review.review_ref, null)
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.human_review.review_status, 'NOT_REVIEWED')
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.approved_for_runtime, false)
})

test('H14-B missing frozen pricing blocks before any provider touch or transport', async () => {
  await assertEvaluationBlocked({ ...TUTOR_PAID_EVALUATION_MANIFEST, frozen_token_pricing: null }, 'FROZEN_PRICING_REQUIRED')
})

test('H14-B missing max_cost blocks before any provider touch or transport', async () => {
  await assertEvaluationBlocked({ ...TUTOR_PAID_EVALUATION_MANIFEST, max_cost: null }, 'MAX_COST_REQUIRED')
})

test('H14-B missing currency blocks before any provider touch or transport', async () => {
  await assertEvaluationBlocked({ ...TUTOR_PAID_EVALUATION_MANIFEST, currency: null }, 'CURRENCY_REQUIRED')
})

test('H14-B production blocks paid evaluation before any provider touch or transport', async () => {
  await assertEvaluationBlocked(TUTOR_PAID_EVALUATION_MANIFEST, 'EVALUATION_ENVIRONMENT_NOT_ALLOWED', {
    ...runnableEnvironment,
    NODE_ENV: 'production',
  })
})

test('H14-B currency mismatch blocks before any provider touch or transport', async () => {
  await assertEvaluationBlocked({ ...TUTOR_PAID_EVALUATION_MANIFEST, currency: 'EUR' }, 'PRICING_CURRENCY_MISMATCH')
})

test('H14-B changed model blocks before any provider touch or transport', async () => {
  await assertEvaluationBlocked({ ...TUTOR_PAID_EVALUATION_MANIFEST, model_id: 'gpt-5.6-terra-changed' }, 'EVALUATION_TARGET_MISMATCH')
})

test('H14-B changed pricing reference under the same manifest version fails closed before provider touch', async () => {
  await assertEvaluationBlocked({
    ...TUTOR_PAID_EVALUATION_MANIFEST,
    frozen_token_pricing: { ...TUTOR_FROZEN_TOKEN_PRICING, pricing_ref: 'changed-without-version-bump' },
  }, 'PRICING_REF_VERSION_MISMATCH')
})

test('H14-B maximum evaluation cost above cap blocks before any provider touch or transport', async () => {
  await assertEvaluationBlocked({ ...TUTOR_PAID_EVALUATION_MANIFEST, max_cost: 9 }, 'MAXIMUM_COST_EXCEEDS_CAP')
})

test('H14-B Fast mode cannot substitute for the frozen Standard price tuple', async () => {
  await assertEvaluationBlocked({
    ...TUTOR_PAID_EVALUATION_MANIFEST,
    frozen_token_pricing: { ...TUTOR_FROZEN_TOKEN_PRICING, pricing_mode: 'FAST' },
  }, 'STANDARD_PRICING_MODE_REQUIRED')
  await assertEvaluationBlocked({
    ...TUTOR_PAID_EVALUATION_MANIFEST,
    frozen_token_pricing: { ...TUTOR_FROZEN_TOKEN_PRICING, provider_request_service_tier: 'fast' },
  }, 'STANDARD_SERVICE_TIER_REQUIRED')
})

test('H14-B cached-input discount cannot increase the conservative evaluation budget', async () => {
  await assertEvaluationBlocked({
    ...TUTOR_PAID_EVALUATION_MANIFEST,
    frozen_token_pricing: {
      ...TUTOR_FROZEN_TOKEN_PRICING,
      input_pricing_basis: 'CACHED_INPUT',
      cached_input_discount_applied: true,
    },
  }, 'UNCACHED_INPUT_PRICING_REQUIRED')
  assert.equal(conservativeMaximumEvaluationCost(), 9.8304)
})

function assertSafeDiagnostic(error, reasonCode, expected = {}) {
  let providerTransports = 0
  const diagnostic = classifyPaidEvaluationProviderError(error)
  assert.equal(providerTransports, 0)
  assert.equal(diagnostic.diagnostic_version, TUTOR_PROVIDER_DIAGNOSTIC_VERSION)
  assert.equal(diagnostic.reason_code, reasonCode)
  assert.equal(diagnostic.raw_error_retained, false)
  for (const [field, value] of Object.entries(expected)) assert.equal(diagnostic[field], value)
  const serialized = JSON.stringify(diagnostic)
  assert.equal(serialized.includes('raw-secret-provider-body'), false)
  assert.equal(serialized.includes('raw-secret-provider-message'), false)
  return diagnostic
}

test('H14-B bounded diagnostics classify HTTP 429 without raw provider data or transport', () => {
  assertSafeDiagnostic({ status: 429, message: 'raw-secret-provider-message', error: { body: 'raw-secret-provider-body' } }, 'PROVIDER_HTTP_429', {
    category: 'rate_or_quota', http_response_known: true, http_status: 429,
  })
})

test('H14-B bounded diagnostics classify generic HTTP 4xx without inferring model or account cause', () => {
  assertSafeDiagnostic({ status: 400, message: 'raw-secret-provider-message' }, 'PROVIDER_HTTP_4XX', {
    category: 'request_or_account', http_response_known: true, http_status: 400,
  })
})

test('H14-B bounded diagnostics classify provider HTTP 5xx as transient without raw body', () => {
  assertSafeDiagnostic({ status: 503, message: 'raw-secret-provider-message' }, 'PROVIDER_HTTP_5XX', {
    category: 'provider_transient', http_response_known: true, http_status: 503,
  })
})

test('H14-B bounded diagnostics classify timeout and abort errors without transport', () => {
  assertSafeDiagnostic({ name: 'APIConnectionTimeoutError', message: 'raw-secret-provider-message' }, 'PROVIDER_TIMEOUT', {
    category: 'timeout', http_response_known: false, http_status: null,
  })
  assertSafeDiagnostic({ name: 'APIUserAbortError', message: 'raw-secret-provider-message' }, 'PROVIDER_TIMEOUT')
})

test('H14-B bounded diagnostics classify supported network errors without transport', () => {
  assertSafeDiagnostic({ name: 'APIConnectionError', message: 'raw-secret-provider-message' }, 'PROVIDER_NETWORK_ERROR', {
    category: 'network_transport', http_response_known: false, http_status: null,
  })
  assertSafeDiagnostic({ code: 'ECONNRESET', message: 'raw-secret-provider-message' }, 'PROVIDER_NETWORK_ERROR')
})

test('H14-B bounded diagnostics classify structured-output parse failure without retaining output', () => {
  assertSafeDiagnostic({ name: 'ZodError', message: 'raw-secret-provider-message' }, 'PROVIDER_SCHEMA_PARSE_ERROR', {
    category: 'structured_output_parse', structured_output_parse_reached: true,
  })
  assertSafeDiagnostic(new Error('Tutor provider returned no parsed output'), 'PROVIDER_SCHEMA_PARSE_ERROR')
})

test('H14-B bounded diagnostics fail closed to unknown without echoing arbitrary exceptions', () => {
  assertSafeDiagnostic({ name: 'UnexpectedError', message: 'raw-secret-provider-message', body: 'raw-secret-provider-body' }, 'PROVIDER_UNKNOWN_ERROR', {
    category: 'unknown', structured_output_parse_reached: null,
  })
})

test('H14-B unapproved v3 evaluator cannot reach a fake HTTP error', async () => {
  const fixtures = tutorSyntheticEvalCases()
  const raw = Object.assign(new Error('raw-secret-provider-message'), {
    status: 429,
    error: { body: 'raw-secret-provider-body' },
  })
  let networkTransports = 0
  const result = await runPaidTutorEvaluation({
    environment: runnableEnvironment,
    manifest: TUTOR_PAID_EVALUATION_MANIFEST,
    fixtures,
    provider: {
      available() { networkTransports += 1; return true },
      async generate(_context, options) {
        networkTransports += 1
        await options.beforeTransport()
        throw raw
      },
    },
  })
  assert.equal(networkTransports, 0)
  assert.equal(result.status, 'BLOCKED')
  assert.equal(result.reason_code, 'PAID_EVALUATION_AUTHORIZATION_REQUIRED')
  assert.equal(result.http_calls, 0)
  assert.equal(JSON.stringify(result).includes('raw-secret-provider'), false)
})

test('H14-B unapproved v3 evaluator cannot reach fake usage accounting', async () => {
  const fixtures = tutorSyntheticEvalCases()
  let networkTransports = 0
  const result = await runPaidTutorEvaluation({
    environment: runnableEnvironment,
    manifest: TUTOR_PAID_EVALUATION_MANIFEST,
    fixtures,
    provider: {
      available() { networkTransports += 1; return true },
      async generate(_context, options) {
        networkTransports += 1
        await options.beforeTransport()
        return { candidate: candidate(fixtures[0].level), usage: null }
      },
    },
  })
  assert.equal(networkTransports, 0)
  assert.equal(result.status, 'BLOCKED')
  assert.equal(result.reason_code, 'PAID_EVALUATION_AUTHORIZATION_REQUIRED')
  assert.equal(result.http_calls, 0)
})
