import OpenAI from 'openai'
import { open, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { tutorSyntheticEvalCases } from '../eval-fixtures.js'
import { verifyIndependentLocalFallback } from './evaluation-gates.js'
import { OpenAITutorProvider } from '../providers/openai-tutor-provider.js'
import { buildTutorProviderContext } from '../provider-context.js'
import { TUTOR_PROMPT_REGISTRY } from '../prompt-registry.js'
import {
  evaluateTutorCandidateWithEvidence,
  TUTOR_EVALUATION_GATE_ORDER,
} from './evaluation-evidence-contract.js'
import {
  classifyPaidEvaluationProviderError,
  paidEvaluationUsageMissingDiagnostic,
  TUTOR_PROVIDER_DIAGNOSTIC_VERSION,
} from './provider-diagnostics.js'
import {
  promptV3Fixture006ProbeContractHash,
  promptV3Fixture006ProbeGovernance,
  promptV3Fixture006ProbeReadiness,
  TUTOR_PROMPT_V3_FIXTURE_006_PROBE_MANIFEST,
} from './prompt-v3-fixture-006-probe-manifest.js'

export const PROMPT_V3_FIXTURE_006_PROBE_CLAIM_FILENAME = 'tutor-paid-prompt-v3-fixture-006-probe-v1.claim.json'
export const PROMPT_V3_FIXTURE_006_PROBE_RESULT_FILENAME = 'tutor-paid-prompt-v3-fixture-006-probe-v1.result.json'

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

export async function claimPromptV3Fixture006Probe(directory) {
  await mkdir(directory, { recursive: true })
  const target = path.join(directory, PROMPT_V3_FIXTURE_006_PROBE_CLAIM_FILENAME)
  const handle = await open(target, 'wx', 0o600)
  try {
    const manifest = TUTOR_PROMPT_V3_FIXTURE_006_PROBE_MANIFEST
    await handle.writeFile(JSON.stringify({
      probe_manifest_version: manifest.probe_manifest_version,
      probe_contract_hash: promptV3Fixture006ProbeContractHash(manifest),
      source_evaluation_scope_fingerprint: manifest.source_evaluation_scope_fingerprint,
      fixture_set_hash: manifest.fixture_set_hash,
      case_id: manifest.case_id,
      evaluator_version: manifest.evaluator_version,
      result_contract_version: manifest.result_contract_version,
      leakage_contract_version: manifest.leakage_contract_version,
      leakage_policy: manifest.leakage_policy,
      authorization_consumed: true,
    }) + '\n')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

function safeUsage(value) {
  if (!value || ![value.input_tokens, value.output_tokens, value.total_tokens]
    .every((item) => Number.isSafeInteger(item) && item >= 0)
    || value.total_tokens !== value.input_tokens + value.output_tokens) return null
  return Object.freeze({ input_tokens: value.input_tokens, output_tokens: value.output_tokens, total_tokens: value.total_tokens })
}

function usageCost(usage, manifest) {
  if (!usage) return null
  return Number((usage.input_tokens * manifest.frozen_token_pricing.input_per_million / 1_000_000
    + usage.output_tokens * manifest.frozen_token_pricing.output_per_million / 1_000_000).toFixed(10))
}

function notReachedGates() {
  return Object.freeze(TUTOR_EVALUATION_GATE_ORDER.map((gate) => Object.freeze({ gate, state: 'NOT_REACHED' })))
}

function boundedProviderDiagnostic(error, state) {
  const classified = state.timeout_or_abort
    ? { reason_code: 'PROVIDER_TIMEOUT', category: 'timeout' }
    : error?.message === 'PROVIDER_USAGE_MISSING'
    ? paidEvaluationUsageMissingDiagnostic()
    : classifyPaidEvaluationProviderError(error)
  return Object.freeze({
    diagnostic_version: TUTOR_PROVIDER_DIAGNOSTIC_VERSION,
    reason_code: classified.reason_code,
    category: classified.category,
    response_known: state.response_known,
    http_status: state.http_status,
    parse_reached: state.parse_reached,
    transport_started: state.http_calls === 1,
    usage_available: Boolean(state.usage),
    gates_reached: state.gates_reached,
    call_ordinal: state.http_calls,
    case_id: TUTOR_PROMPT_V3_FIXTURE_006_PROBE_MANIFEST.case_id,
    raw_error_retained: false,
  })
}

function probeResult(manifest, status, values = {}) {
  return deepFreeze({
    probe_manifest_version: manifest.probe_manifest_version,
    probe_contract_hash: promptV3Fixture006ProbeContractHash(manifest),
    source_evaluation_manifest_version: manifest.source_evaluation_manifest_version,
    source_evaluation_scope_fingerprint: manifest.source_evaluation_scope_fingerprint,
    evaluator_version: manifest.evaluator_version,
    result_contract_version: manifest.result_contract_version,
    leakage_contract_version: manifest.leakage_contract_version,
    leakage_policy: manifest.leakage_policy,
    status,
    automated_only: true,
    synthetic_data_only: true,
    ...values,
  })
}

export async function runPromptV3Fixture006Probe({
  environment = process.env,
  manifest = TUTOR_PROMPT_V3_FIXTURE_006_PROBE_MANIFEST,
  fixtures = tutorSyntheticEvalCases(),
  claim,
  fetchImplementation = globalThis.fetch,
} = {}) {
  const firstPreflight = promptV3Fixture006ProbeReadiness({ environment, manifest, fixtures })
  if (!firstPreflight.runnable) {
    return probeResult(manifest, 'BLOCKED', {
      comparison_outcome: 'PROBE_BLOCKED', recommendation: 'INSUFFICIENT_EVIDENCE',
      claim_created: false, reason_code: firstPreflight.reason_code, termination_reason: firstPreflight.reason_code,
      fixture_id: manifest.case_id, http_calls: 0, retries: 0, provider_failover: false,
      provider_failures: 0, provider_timeouts: 0, usage: null, actual_cost: null,
      remaining_budget: manifest.max_cost, currency: manifest.currency,
      gate_results: notReachedGates(), leakage_evidence: null,
      raw_prompt_retained: false, raw_provider_response_retained: false, raw_answer_retained: false,
      learning_truth_mutations: 0, domain_database_used: false, retry_authorized: false,
    })
  }
  const fixture = fixtures.find((item) => item.case_id === manifest.case_id)
  if (!fixture || !verifyIndependentLocalFallback([fixture]).passed) {
    return probeResult(manifest, 'BLOCKED', {
      comparison_outcome: 'PROBE_BLOCKED', recommendation: 'INSUFFICIENT_EVIDENCE',
      claim_created: false, reason_code: 'LOCAL_FALLBACK_INVALID', termination_reason: 'LOCAL_FALLBACK_INVALID',
      fixture_id: manifest.case_id, http_calls: 0, retries: 0, provider_failover: false,
      provider_failures: 0, provider_timeouts: 0, usage: null, actual_cost: null,
      remaining_budget: manifest.max_cost, currency: manifest.currency,
      gate_results: notReachedGates(), leakage_evidence: null,
      raw_prompt_retained: false, raw_provider_response_retained: false, raw_answer_retained: false,
      learning_truth_mutations: 0, domain_database_used: false, retry_authorized: false,
    })
  }
  if (typeof claim !== 'function') {
    return probeResult(manifest, 'BLOCKED', {
      comparison_outcome: 'PROBE_BLOCKED', recommendation: 'INSUFFICIENT_EVIDENCE',
      claim_created: false, reason_code: 'DURABLE_AUTHORIZATION_CLAIM_REQUIRED',
      termination_reason: 'DURABLE_AUTHORIZATION_CLAIM_REQUIRED', fixture_id: manifest.case_id,
      http_calls: 0, retries: 0, provider_failover: false, provider_failures: 0, provider_timeouts: 0,
      usage: null, actual_cost: null, remaining_budget: manifest.max_cost, currency: manifest.currency,
      gate_results: notReachedGates(), leakage_evidence: null,
      raw_prompt_retained: false, raw_provider_response_retained: false, raw_answer_retained: false,
      learning_truth_mutations: 0, domain_database_used: false, retry_authorized: false,
    })
  }

  try { await claim() } catch {
    return probeResult(manifest, 'BLOCKED', {
      comparison_outcome: 'PROBE_BLOCKED', recommendation: 'INSUFFICIENT_EVIDENCE',
      claim_created: false, reason_code: 'AUTHORIZATION_ALREADY_CONSUMED_OR_CLAIM_FAILED',
      termination_reason: 'AUTHORIZATION_ALREADY_CONSUMED_OR_CLAIM_FAILED', fixture_id: manifest.case_id,
      http_calls: 0, retries: 0, provider_failover: false, provider_failures: 0, provider_timeouts: 0,
      usage: null, actual_cost: null, remaining_budget: manifest.max_cost, currency: manifest.currency,
      gate_results: notReachedGates(), leakage_evidence: null,
      raw_prompt_retained: false, raw_provider_response_retained: false, raw_answer_retained: false,
      learning_truth_mutations: 0, domain_database_used: false, retry_authorized: false,
    })
  }

  const state = {
    claim_created: true,
    http_calls: 0,
    response_known: false,
    http_status: null,
    parse_reached: false,
    usage: null,
    gates_reached: false,
    request_envelope: null,
    reserved: false,
    internal_code: null,
    timeout_or_abort: false,
  }
  const governanceBefore = firstPreflight.governance
  let checked = null
  let diagnostic = null

  const finish = () => {
    const governanceAfter = promptV3Fixture006ProbeGovernance(environment)
    const governanceIntact = isDeepStrictEqual(governanceAfter, governanceBefore)
    const cost = usageCost(state.usage, manifest)
    const budgetExceeded = Boolean(state.usage && (state.usage.input_tokens > manifest.max_input_tokens
      || state.usage.output_tokens > manifest.max_output_tokens
      || state.usage.total_tokens > manifest.max_total_tokens || cost > manifest.max_cost))
    if (budgetExceeded && !state.internal_code) state.internal_code = 'PROBE_ACTUAL_USAGE_BUDGET_EXCEEDED'

    let comparisonOutcome
    let recommendation
    let status
    let reasonCode
    if (!governanceIntact || state.internal_code) {
      comparisonOutcome = 'PROBE_BLOCKED'
      recommendation = 'INSUFFICIENT_EVIDENCE'
      status = 'BLOCKED'
      reasonCode = !governanceIntact ? 'GOVERNANCE_CHANGED_DURING_PROBE' : state.internal_code
    } else if (diagnostic) {
      comparisonOutcome = 'PROBE_PROVIDER_FAILURE'
      recommendation = 'PROVIDER_FAILURE_REQUIRES_REVIEW'
      status = 'PROVIDER_FAILURE'
      reasonCode = diagnostic.reason_code
    } else if (checked?.passed) {
      comparisonOutcome = 'V3_ALIGNMENT_CONFIRMED'
      recommendation = 'READY_FOR_NEW_FULL_V6_EVALUATION'
      status = 'PROBE_PASS'
      reasonCode = null
    } else if (checked) {
      comparisonOutcome = 'V3_ALIGNMENT_FAILED'
      recommendation = 'PROMPT_OR_MODEL_REVIEW_REQUIRED'
      status = 'PROBE_FAIL'
      reasonCode = checked.code
    } else {
      comparisonOutcome = 'PROBE_BLOCKED'
      recommendation = 'INSUFFICIENT_EVIDENCE'
      status = 'BLOCKED'
      reasonCode = 'PROBE_NO_BOUNDED_OUTCOME'
    }
    return probeResult(manifest, status, {
      comparison_outcome: comparisonOutcome,
      recommendation,
      claim_created: state.claim_created,
      reason_code: reasonCode,
      termination_reason: reasonCode || 'ALL_MANDATORY_GATES_PASSED',
      fixture_id: manifest.case_id,
      fixtures_attempted: state.http_calls,
      fixtures_completed: checked ? 1 : 0,
      http_calls: state.http_calls,
      retries: 0,
      provider_failover: false,
      provider_failures: diagnostic ? 1 : 0,
      provider_timeouts: diagnostic?.category === 'timeout' ? 1 : 0,
      provider_diagnostic: diagnostic,
      usage: state.usage,
      actual_cost: cost,
      remaining_budget: cost === null ? null : Number((manifest.max_cost - cost).toFixed(10)),
      currency: manifest.currency,
      maximum_cost: firstPreflight.maximum_cost,
      remaining_authorized_http_calls: 0,
      case_result: checked,
      gate_results: checked?.gate_results || notReachedGates(),
      leakage_evidence: checked?.leakage_evidence || null,
      raw_prompt_retained: false,
      raw_provider_response_retained: false,
      raw_answer_retained: false,
      governance_after: governanceAfter,
      runtime_approval_changed: !governanceIntact,
      production_capabilities_all_off: governanceAfter.production_capabilities_all_off,
      learning_truth_mutations: 0,
      domain_database_used: false,
      full_evaluation_started: false,
      human_review_performed: false,
      retry_authorized: false,
    })
  }

  const afterClaim = promptV3Fixture006ProbeReadiness({ environment, manifest, fixtures })
  if (!afterClaim.runnable) {
    state.internal_code = afterClaim.reason_code
    return finish()
  }

  const context = buildTutorProviderContext({
    level: fixture.level,
    promptVersion: manifest.prompt_version,
    task: {},
    question: { question: fixture.prompt, options: fixture.options },
  })
  try {
    const guardedFetch = async (url, options) => {
      if (!state.reserved || state.http_calls !== 0) {
        state.internal_code = 'SECOND_OR_UNRESERVED_TRANSPORT_FORBIDDEN'
        throw new Error('PROMPT_V3_FIXTURE_006_PROBE_INTERNAL_GUARD')
      }
      if (String(url) !== 'https://api.openai.com/v1/responses' || options.method !== 'POST'
        || !isDeepStrictEqual(JSON.parse(options.body), state.request_envelope)) {
        state.internal_code = 'OUTGOING_REQUEST_CONTRACT_MISMATCH'
        throw new Error('PROMPT_V3_FIXTURE_006_PROBE_INTERNAL_GUARD')
      }
      const finalPreflight = promptV3Fixture006ProbeReadiness({ environment, manifest, fixtures })
      if (!finalPreflight.runnable) {
        state.internal_code = finalPreflight.reason_code
        throw new Error('PROMPT_V3_FIXTURE_006_PROBE_INTERNAL_GUARD')
      }
      state.http_calls = 1
      let response
      try {
        response = await fetchImplementation(url, { ...options, redirect: 'error' })
      } catch (error) {
        if (['AbortError', 'APIConnectionTimeoutError', 'APIUserAbortError'].includes(error?.name)
          || ['ABORT_ERR', 'ETIMEDOUT'].includes(error?.code)) state.timeout_or_abort = true
        throw error
      }
      state.response_known = true
      state.http_status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
        ? response.status
        : null
      const readJson = response.json.bind(response)
      response.json = async () => {
        const envelope = await readJson()
        if (response.ok) state.usage = safeUsage(envelope?.usage)
        return envelope
      }
      return response
    }
    const sdk = new OpenAI({
      apiKey: environment.OPENAI_API_KEY,
      baseURL: 'https://api.openai.com/v1',
      maxRetries: 0,
      timeout: manifest.timeout_ms,
      logLevel: 'off',
      fetch: guardedFetch,
    })
    const observedClient = { responses: { parse: (body, options) => {
      const prompt = TUTOR_PROMPT_REGISTRY[manifest.prompt_version]
      if (body.model !== manifest.model_id || body.service_tier !== manifest.service_tier
        || body.store !== false || body.max_output_tokens !== manifest.max_output_tokens_per_call
        || body.instructions !== prompt?.instructions || body.input !== JSON.stringify(context)
        || body.reasoning?.effort !== 'low' || options.maxRetries !== 0 || options.timeout !== manifest.timeout_ms
        || typeof body.text?.format?.$parseRaw !== 'function') {
        state.internal_code = 'PROVIDER_REQUEST_CONTRACT_MISMATCH'
        throw new Error('PROMPT_V3_FIXTURE_006_PROBE_INTERNAL_GUARD')
      }
      const serialized = JSON.stringify(body)
      if (Buffer.byteLength(serialized, 'utf8') > manifest.max_input_tokens_per_call) {
        state.internal_code = 'INPUT_BOUND_NOT_PROVEN'
        throw new Error('PROMPT_V3_FIXTURE_006_PROBE_INTERNAL_GUARD')
      }
      state.request_envelope = JSON.parse(serialized)
      const original = body.text.format
      const format = { ...original }
      Object.defineProperties(format, {
        $brand: { value: original.$brand, enumerable: false },
        $parseRaw: {
          value: (text) => { state.parse_reached = true; return original.$parseRaw(text) },
          enumerable: false,
        },
      })
      return sdk.responses.parse({ ...body, text: { ...body.text, format } }, options)
    } } }
    const provider = new OpenAITutorProvider({ client: observedClient, timeoutMs: manifest.timeout_ms })
    const generated = await provider.generate(context, {
      beforeTransport: async () => {
        if (state.reserved) {
          state.internal_code = 'SECOND_OR_UNRESERVED_TRANSPORT_FORBIDDEN'
          throw new Error('PROMPT_V3_FIXTURE_006_PROBE_INTERNAL_GUARD')
        }
        state.reserved = true
      },
    })
    if (!state.usage || !isDeepStrictEqual(state.usage, safeUsage(generated.usage))) throw new Error('PROVIDER_USAGE_MISSING')
    state.gates_reached = true
    checked = evaluateTutorCandidateWithEvidence(generated.candidate, fixture)
  } catch (error) {
    if (!state.internal_code) diagnostic = boundedProviderDiagnostic(error, state)
  } finally {
    state.request_envelope = null
  }
  return finish()
}
