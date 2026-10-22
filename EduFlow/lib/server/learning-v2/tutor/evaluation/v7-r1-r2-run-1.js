import OpenAI from 'openai'
import { mkdir, open } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { buildTutorProviderContext, providerContextContainsForbiddenKey } from '../provider-context.js'
import { tutorSyntheticEvalCases } from '../eval-fixtures.js'
import { TUTOR_PROMPT_REGISTRY } from '../prompt-registry.js'
import { OpenAITutorProvider } from '../providers/openai-tutor-provider.js'
import { TUTOR_CANONICAL_SAFETY_GATE_ORDER } from '../canonical-safety-gates.js'
import { verifyIndependentLocalFallback } from './evaluation-gates.js'
import {
  aggregateTutorSystemSafety,
  evaluateTutorInteraction,
  evaluateTutorProviderFailure,
  TUTOR_SYSTEM_SAFETY_CONTRACT_V5,
} from './system-safety-evaluation-contract.js'
import {
  classifyPaidEvaluationProviderError,
  paidEvaluationUsageMissingDiagnostic,
  TUTOR_PROVIDER_DIAGNOSTIC_VERSION,
} from './provider-diagnostics.js'
import {
  TUTOR_V7_R1_R2_RUN_1_MANIFEST,
  v7R1R2Run1ContractHash,
  v7R1R2Run1Governance,
  v7R1R2Run1Readiness,
} from './v7-r1-r2-run-1-manifest.js'

export const V7_R1_R2_RUN_1_CLAIM_FILENAME = 'tutor-paid-evaluation-v7-r1-r2-run-1-v1.claim.json'
export const V7_R1_R2_RUN_1_RESULT_FILENAME = 'tutor-paid-evaluation-v7-r1-r2-run-1-v1.result.json'

function safeUsage(value) {
  if (!value || ![value.input_tokens, value.output_tokens, value.total_tokens]
    .every((item) => Number.isSafeInteger(item) && item >= 0)
    || value.total_tokens !== value.input_tokens + value.output_tokens) return null
  return Object.freeze({
    input_tokens: value.input_tokens,
    output_tokens: value.output_tokens,
    total_tokens: value.total_tokens,
  })
}

export async function claimV7R1R2Run1(directory, manifest = TUTOR_V7_R1_R2_RUN_1_MANIFEST) {
  await mkdir(directory, { recursive: true })
  const handle = await open(path.join(directory, V7_R1_R2_RUN_1_CLAIM_FILENAME), 'wx', 0o600)
  try {
    await handle.writeFile(JSON.stringify({
      run_manifest_version: manifest.run_manifest_version,
      run_contract_hash: v7R1R2Run1ContractHash(manifest),
      source_evaluation_scope_fingerprint: manifest.source_evaluation_scope_fingerprint,
      fixture_set_hash: manifest.fixture_set_hash,
      evaluator_version: manifest.evaluator_version,
      result_contract_version: manifest.result_contract_version,
      canonical_safety_contract_version: manifest.canonical_safety_contract_version,
      authorization: manifest.authorization,
      authorization_consumed: true,
      synthetic_data_only: true,
      runtime_approval_effect: 'NONE',
    }) + '\n')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

export class V7R1R2Run1Budget {
  constructor(manifest = TUTOR_V7_R1_R2_RUN_1_MANIFEST) {
    if (!isDeepStrictEqual(manifest, TUTOR_V7_R1_R2_RUN_1_MANIFEST)) {
      throw new TypeError('V7_R1_R2_RUN_1_BUDGET_CONTRACT_MISMATCH')
    }
    this.manifest = manifest
    this.httpCalls = 0
    this.inputTokens = 0
    this.outputTokens = 0
    this.totalTokens = 0
    this.knownCost = 0
    this.unpricedCalls = 0
    this.pending = null
    this.hardStopped = false
  }

  cost(input, output) {
    return input * this.manifest.frozen_token_pricing.input_per_million / 1_000_000
      + output * this.manifest.frozen_token_pricing.output_per_million / 1_000_000
  }

  reserveNext() {
    if (this.hardStopped || this.pending) return false
    const input = this.manifest.max_input_tokens_per_call
    const output = this.manifest.max_output_tokens_per_call
    const total = input + output
    const cost = this.cost(input, output)
    const allowed = this.httpCalls + 1 <= this.manifest.max_http_calls
      && this.inputTokens + input <= this.manifest.max_input_tokens
      && this.outputTokens + output <= this.manifest.max_output_tokens
      && this.totalTokens + total <= this.manifest.max_total_tokens
      && this.knownCost + cost <= this.manifest.max_cost
      && this.unpricedCalls === 0
    if (!allowed) {
      this.hardStopped = true
      return false
    }
    this.pending = { transport_started: false }
    return true
  }

  markTransport() {
    if (!this.pending || this.pending.transport_started || this.hardStopped) {
      throw new Error('V7_R1_R2_RUN_1_TRANSPORT_NOT_RESERVED')
    }
    this.pending.transport_started = true
    this.httpCalls += 1
  }

  recordUsage(value) {
    if (!this.pending?.transport_started) throw new Error('V7_R1_R2_RUN_1_TRANSPORT_NOT_RESERVED')
    const usage = safeUsage(value)
    if (!usage) return this.markUnpricedTransport()
    this.inputTokens += usage.input_tokens
    this.outputTokens += usage.output_tokens
    this.totalTokens += usage.total_tokens
    this.knownCost += this.cost(usage.input_tokens, usage.output_tokens)
    this.pending = null
    if (usage.input_tokens > this.manifest.max_input_tokens_per_call
      || usage.output_tokens > this.manifest.max_output_tokens_per_call
      || this.inputTokens > this.manifest.max_input_tokens
      || this.outputTokens > this.manifest.max_output_tokens
      || this.totalTokens > this.manifest.max_total_tokens
      || this.knownCost > this.manifest.max_cost) {
      this.hardStopped = true
      throw new Error('V7_R1_R2_RUN_1_BUDGET_EXCEEDED')
    }
    return usage
  }

  markUnpricedTransport() {
    if (!this.pending?.transport_started) throw new Error('V7_R1_R2_RUN_1_TRANSPORT_NOT_RESERVED')
    this.unpricedCalls += 1
    this.pending = null
    this.hardStopped = true
    throw new Error('PROVIDER_USAGE_MISSING')
  }

  cancelBeforeTransport() {
    if (this.pending?.transport_started) throw new Error('V7_R1_R2_RUN_1_TRANSPORT_ALREADY_STARTED')
    this.pending = null
    this.hardStopped = true
  }

  snapshot() {
    const knownCost = Number(this.knownCost.toFixed(10))
    const exact = this.unpricedCalls === 0 && !this.pending
    return Object.freeze({
      http_calls: this.httpCalls,
      input_tokens: this.inputTokens,
      output_tokens: this.outputTokens,
      total_tokens: this.totalTokens,
      actual_cost: exact ? knownCost : null,
      known_cost: knownCost,
      currency: this.manifest.currency,
      unpriced_calls: this.unpricedCalls,
      hard_stopped: this.hardStopped,
      remaining_http_calls: this.manifest.max_http_calls - this.httpCalls,
      remaining_input_tokens: this.manifest.max_input_tokens - this.inputTokens,
      remaining_output_tokens: this.manifest.max_output_tokens - this.outputTokens,
      remaining_total_tokens: this.manifest.max_total_tokens - this.totalTokens,
      remaining_cost: exact ? Number((this.manifest.max_cost - knownCost).toFixed(10)) : null,
    })
  }
}

function boundedProviderDiagnostic(error, state) {
  const base = state?.timeout_or_abort
    ? { reason_code: 'PROVIDER_TIMEOUT', category: 'timeout' }
    : error?.message === 'PROVIDER_USAGE_MISSING'
      ? paidEvaluationUsageMissingDiagnostic()
      : classifyPaidEvaluationProviderError(error)
  return Object.freeze({
    diagnostic_version: TUTOR_PROVIDER_DIAGNOSTIC_VERSION,
    reason_code: base.reason_code,
    category: base.category,
    response_known: Boolean(state?.response_known),
    http_status: state?.http_status ?? null,
    parse_reached: state?.parse_reached ?? false,
    transport_started: Boolean(state?.transport_started),
    usage_available: Boolean(state?.usage),
    gates_reached: Boolean(state?.gates_reached),
    call_ordinal: state?.call_ordinal ?? null,
    case_id: state?.case_id ?? null,
    raw_error_retained: false,
  })
}

function createObservedProvider({ environment, manifest, fixtures, budget, fetchImplementation }) {
  let current = null
  let requestEnvelope = null
  const guardedFetch = async (url, options) => {
    if (!current || current.transport_started || !current.adapter_boundary_reached) {
      if (current) current.internal_code = 'V7_R1_R2_RUN_1_SECOND_OR_UNRESERVED_TRANSPORT'
      throw new Error('V7_R1_R2_RUN_1_INTERNAL_GUARD')
    }
    let actualEnvelope
    try { actualEnvelope = JSON.parse(options.body) } catch {
      current.internal_code = 'V7_R1_R2_RUN_1_OUTGOING_REQUEST_MISMATCH'
      throw new Error('V7_R1_R2_RUN_1_INTERNAL_GUARD')
    }
    if (String(url) !== 'https://api.openai.com/v1/responses' || options.method !== 'POST'
      || !isDeepStrictEqual(actualEnvelope, requestEnvelope)) {
      current.internal_code = 'V7_R1_R2_RUN_1_OUTGOING_REQUEST_MISMATCH'
      throw new Error('V7_R1_R2_RUN_1_INTERNAL_GUARD')
    }
    const check = v7R1R2Run1Readiness({ environment, manifest, fixtures })
    if (!check.runnable) {
      current.internal_code = check.reason_code
      throw new Error('V7_R1_R2_RUN_1_INTERNAL_GUARD')
    }
    budget.markTransport()
    current.transport_started = true
    current.call_ordinal = budget.httpCalls
    let response
    try {
      response = await fetchImplementation(url, { ...options, redirect: 'error' })
    } catch (error) {
      if (['AbortError', 'APIConnectionTimeoutError', 'APIUserAbortError'].includes(error?.name)
        || ['ABORT_ERR', 'ETIMEDOUT'].includes(error?.code)) current.timeout_or_abort = true
      throw error
    }
    current.response_known = true
    current.http_status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
      ? response.status
      : null
    const readJson = response.json.bind(response)
    response.json = async () => {
      const envelope = await readJson()
      if (response.ok) current.usage = safeUsage(envelope?.usage)
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
    const expectedPrompt = TUTOR_PROMPT_REGISTRY[manifest.prompt_version]
    if (!current || body.model !== manifest.model_id || body.service_tier !== manifest.service_tier
      || body.store !== false || body.max_output_tokens !== manifest.max_output_tokens_per_call
      || body.instructions !== expectedPrompt?.instructions || body.input !== JSON.stringify(current.context)
      || body.reasoning?.effort !== 'low' || options.maxRetries !== 0 || options.timeout !== manifest.timeout_ms
      || typeof body.text?.format?.$parseRaw !== 'function') {
      if (current) current.internal_code = 'V7_R1_R2_RUN_1_PROVIDER_REQUEST_CONTRACT_MISMATCH'
      throw new Error('V7_R1_R2_RUN_1_INTERNAL_GUARD')
    }
    const serialized = JSON.stringify(body)
    if (Buffer.byteLength(serialized, 'utf8') > manifest.max_input_tokens_per_call) {
      current.internal_code = 'V7_R1_R2_RUN_1_INPUT_BOUND_NOT_PROVEN'
      throw new Error('V7_R1_R2_RUN_1_INTERNAL_GUARD')
    }
    requestEnvelope = JSON.parse(serialized)
    const original = body.text.format
    const format = { ...original }
    Object.defineProperties(format, {
      $brand: { value: original.$brand, enumerable: false },
      $parseRaw: {
        value: (text) => {
          current.parse_reached = true
          return original.$parseRaw(text)
        },
        enumerable: false,
      },
    })
    return sdk.responses.parse({ ...body, text: { ...body.text, format } }, options)
  } } }
  const provider = new OpenAITutorProvider({ client: observedClient, timeoutMs: manifest.timeout_ms })
  return Object.freeze({
    provider,
    begin(fixture, context) {
      if (current) throw new Error('V7_R1_R2_RUN_1_CALL_ALREADY_ACTIVE')
      current = {
        case_id: fixture.case_id,
        context,
        adapter_boundary_reached: false,
        transport_started: false,
        response_known: false,
        http_status: null,
        parse_reached: false,
        usage: null,
        timeout_or_abort: false,
        gates_reached: false,
        call_ordinal: budget.httpCalls + 1,
        internal_code: null,
      }
    },
    adapterBoundary() {
      if (!current || current.adapter_boundary_reached) throw new Error('V7_R1_R2_RUN_1_ADAPTER_BOUNDARY_INVALID')
      current.adapter_boundary_reached = true
    },
    markGatesReached() { if (current) current.gates_reached = true },
    state() { return current ? Object.freeze({ ...current, context: undefined }) : null },
    end() { current = null; requestEnvelope = null },
  })
}

function aggregateGates(cases, select) {
  return Object.freeze(Object.fromEntries(TUTOR_CANONICAL_SAFETY_GATE_ORDER.map((gate) => [gate, Object.freeze({
    PASS: cases.filter((item) => select(item).find((entry) => entry.gate === gate)?.state === 'PASS').length,
    FAIL: cases.filter((item) => select(item).find((entry) => entry.gate === gate)?.state === 'FAIL').length,
    NOT_REACHED: cases.filter((item) => select(item).find((entry) => entry.gate === gate)?.state === 'NOT_REACHED').length,
  })])))
}

function distribution(values) {
  return Object.freeze(values.reduce((result, value) => {
    result[value] = (result[value] || 0) + 1
    return result
  }, {}))
}

function baseResult(manifest, status, values = {}) {
  return Object.freeze({
    run_manifest_version: manifest.run_manifest_version,
    run_contract_hash: v7R1R2Run1ContractHash(manifest),
    source_evaluation_manifest_version: manifest.source_evaluation_manifest_version,
    source_evaluation_scope_fingerprint: manifest.source_evaluation_scope_fingerprint,
    evaluator_version: manifest.evaluator_version,
    result_contract_version: manifest.result_contract_version,
    canonical_safety_contract_version: manifest.canonical_safety_contract_version,
    leakage_contract_version: manifest.leakage_contract_version,
    leakage_policy: manifest.leakage_policy,
    status,
    automated_only: true,
    synthetic_data_only: true,
    ...values,
  })
}

export async function runV7R1R2TutorEvaluationRun1({
  environment = process.env,
  manifest = TUTOR_V7_R1_R2_RUN_1_MANIFEST,
  fixtures = tutorSyntheticEvalCases(),
  claim,
  fetchImplementation = globalThis.fetch,
} = {}) {
  const preflight = v7R1R2Run1Readiness({ environment, manifest, fixtures })
  if (!preflight.runnable) {
    return baseResult(manifest, 'BLOCKED', {
      started: false,
      completed: false,
      reason_code: preflight.reason_code,
      termination_reason: preflight.reason_code,
      http_calls: 0,
    })
  }
  const fallback = verifyIndependentLocalFallback(fixtures)
  if (!fallback.passed) {
    return baseResult(manifest, 'BLOCKED', {
      started: false,
      completed: false,
      reason_code: fallback.code,
      termination_reason: fallback.code,
      http_calls: 0,
    })
  }
  if (typeof claim !== 'function') {
    return baseResult(manifest, 'BLOCKED', {
      started: false,
      completed: false,
      reason_code: 'V7_R1_R2_RUN_1_DURABLE_CLAIM_REQUIRED',
      termination_reason: 'V7_R1_R2_RUN_1_DURABLE_CLAIM_REQUIRED',
      http_calls: 0,
    })
  }
  try {
    await claim()
  } catch {
    return baseResult(manifest, 'BLOCKED', {
      started: false,
      completed: false,
      reason_code: 'V7_R1_R2_RUN_1_AUTHORIZATION_ALREADY_CONSUMED_OR_CLAIM_FAILED',
      termination_reason: 'V7_R1_R2_RUN_1_AUTHORIZATION_ALREADY_CONSUMED_OR_CLAIM_FAILED',
      http_calls: 0,
    })
  }
  const afterClaim = v7R1R2Run1Readiness({ environment, manifest, fixtures })
  if (!afterClaim.runnable) {
    return baseResult(manifest, 'PARTIAL_RUN', {
      started: true,
      completed: false,
      reason_code: afterClaim.reason_code,
      termination_reason: afterClaim.reason_code,
      http_calls: 0,
      retry_authorized: false,
    })
  }

  const governanceBefore = preflight.governance
  const budget = new V7R1R2Run1Budget(manifest)
  const cases = []
  const diagnostics = []
  const observed = createObservedProvider({ environment, manifest, fixtures, budget, fetchImplementation })
  const finish = (status, reasonCode) => {
    const governanceAfter = v7R1R2Run1Governance(environment)
    const governanceIntact = isDeepStrictEqual(governanceAfter, governanceBefore)
    const finalStatus = governanceIntact ? status : 'SYSTEM_SAFETY_FAIL'
    const finalReason = governanceIntact ? reasonCode : 'GOVERNANCE_CHANGED_DURING_RUN'
    const aggregate = aggregateTutorSystemSafety(cases, manifest.fixture_count, { contract: TUTOR_SYSTEM_SAFETY_CONTRACT_V5 })
    const providerPass = cases.filter((item) => item.provider_candidate.status === 'PASS').length
    const providerFail = cases.filter((item) => item.provider_candidate.status === 'FAIL').length
    const providerFailure = cases.filter((item) => item.provider_candidate.status === 'PROVIDER_FAILURE').length
    const providerTotal = providerPass + providerFail + providerFailure
    const providerAccepted = cases.filter((item) => item.final_outcome.status === 'PROVIDER_ACCEPTED').length
    const localAccepted = cases.filter((item) => item.final_outcome.status === 'LOCAL_FALLBACK_ACCEPTED').length
    const finalFailed = cases.filter((item) => item.final_outcome.status === 'FINAL_OUTCOME_FAIL').length
    const fallbackCount = cases.filter((item) => item.fallback.used).length
    const boundedFailureCodes = [...new Set([
      ...cases.map((item) => item.provider_candidate.code),
      ...cases.map((item) => item.final_outcome.code),
      ...diagnostics.map((item) => item.reason_code),
      finalReason,
    ].filter(Boolean))]
    return baseResult(manifest, finalStatus, {
      started: true,
      completed: cases.length === manifest.fixture_count && finalStatus === 'SYSTEM_SAFETY_PASS',
      coverage_complete: cases.length === manifest.fixture_count,
      reason_code: finalReason,
      termination_reason: finalReason || 'ALL_EXPECTED_FINAL_OUTCOMES_CANONICAL_PASS',
      fixtures_attempted: budget.httpCalls,
      fixtures_completed: cases.length,
      provider_transports: budget.httpCalls,
      retries: 0,
      provider_failover: false,
      provider_failures: diagnostics.length,
      provider_timeouts: diagnostics.filter((item) => item.category === 'timeout').length,
      budget: budget.snapshot(),
      r1_provider_candidate_quality: Object.freeze({
        provider_candidate_pass_count: providerPass,
        provider_candidate_fail_count: providerFail,
        provider_failure_count: providerFailure,
        provider_candidate_pass_rate: providerTotal ? providerPass / providerTotal : 0,
        rejection_reason_distribution: distribution(cases
          .filter((item) => item.provider_candidate.status === 'FAIL')
          .map((item) => item.provider_candidate.code)),
        provider_failure_distribution: distribution(cases
          .filter((item) => item.provider_candidate.status === 'PROVIDER_FAILURE')
          .map((item) => item.provider_candidate.code)),
      }),
      fallback_count: fallbackCount,
      fallback_rate: cases.length ? fallbackCount / cases.length : 0,
      fallback_rate_threshold_status: manifest.fallback_rate_threshold_status,
      r2_final_tutor_system_safety: Object.freeze({
        PROVIDER_ACCEPTED: providerAccepted,
        LOCAL_FALLBACK_ACCEPTED: localAccepted,
        FINAL_OUTCOME_FAIL: finalFailed,
        system_safety_pass: finalStatus === 'SYSTEM_SAFETY_PASS' && aggregate.r2_final_tutor_system_safety.system_safety_pass,
      }),
      system_safety_pass: finalStatus === 'SYSTEM_SAFETY_PASS' && aggregate.r2_final_tutor_system_safety.system_safety_pass,
      bounded_gate_diagnostics: Object.freeze({
        provider_candidate: aggregateGates(cases, (item) => item.provider_candidate.gate_results),
        final_outcome: aggregateGates(cases, (item) => item.final_outcome.gate_results),
      }),
      bounded_failure_codes: Object.freeze(boundedFailureCodes),
      case_results: Object.freeze(cases),
      provider_diagnostics: Object.freeze(diagnostics),
      raw_prompt_retained: false,
      raw_provider_response_retained: false,
      rejected_provider_text_retained: false,
      raw_answer_retained: false,
      raw_provider_error_retained: false,
      governance_after: governanceAfter,
      runtime_approval_changed: !governanceIntact,
      production_capabilities_all_off: governanceAfter.production_capabilities_all_off,
      learning_truth_mutations: 0,
      domain_database_used: false,
      retry_authorized: false,
    })
  }

  try {
    for (const fixture of fixtures) {
      if (!budget.reserveNext()) return finish('PARTIAL_RUN', 'V7_R1_R2_RUN_1_BUDGET_CAP_REACHED_BEFORE_TRANSPORT')
      const context = buildTutorProviderContext({
        level: fixture.level,
        promptVersion: manifest.prompt_version,
        task: {},
        question: { question: fixture.prompt, options: fixture.options },
      })
      if (providerContextContainsForbiddenKey(context)) {
        budget.cancelBeforeTransport()
        return finish('PARTIAL_RUN', 'V7_R1_R2_RUN_1_FORBIDDEN_PROVIDER_CONTEXT')
      }
      observed.begin(fixture, context)
      try {
        const generated = await observed.provider.generate(context, {
          beforeTransport: async () => observed.adapterBoundary(),
        })
        const state = observed.state()
        const returnedUsage = safeUsage(generated.usage)
        if (!state.usage || !returnedUsage || !isDeepStrictEqual(state.usage, returnedUsage)) {
          throw new Error('PROVIDER_USAGE_MISSING')
        }
        budget.recordUsage(state.usage)
        observed.markGatesReached()
        const checked = evaluateTutorInteraction(generated.candidate, fixture, { contract: TUTOR_SYSTEM_SAFETY_CONTRACT_V5 })
        cases.push(checked)
        observed.end()
        if (checked.final_outcome.status === 'FINAL_OUTCOME_FAIL') {
          return finish('SYSTEM_SAFETY_FAIL', checked.final_outcome.code)
        }
      } catch (error) {
        const state = observed.state()
        let internalCode = state?.internal_code
          || (error?.message === 'V7_R1_R2_RUN_1_BUDGET_EXCEEDED' ? error.message : null)
          || (state?.gates_reached ? 'V7_R1_R2_RUN_1_EVALUATOR_FAILURE' : null)
        let usageTrustworthy = false
        if (budget.pending) {
          if (!state?.transport_started) {
            budget.cancelBeforeTransport()
          } else if (state.usage) {
            try {
              budget.recordUsage(state.usage)
              usageTrustworthy = true
            } catch (budgetError) {
              internalCode = budgetError?.message === 'V7_R1_R2_RUN_1_BUDGET_EXCEEDED'
                ? budgetError.message
                : 'V7_R1_R2_RUN_1_BUDGET_ACCOUNTING_FAILURE'
            }
          } else {
            try { budget.markUnpricedTransport() } catch {}
          }
        }
        if (!internalCode && state?.transport_started) {
          const diagnostic = boundedProviderDiagnostic(error, state)
          diagnostics.push(diagnostic)
          const recovered = evaluateTutorProviderFailure(fixture, diagnostic.reason_code, { contract: TUTOR_SYSTEM_SAFETY_CONTRACT_V5 })
          cases.push(recovered)
          observed.end()
          if (recovered.final_outcome.status === 'FINAL_OUTCOME_FAIL') {
            return finish('SYSTEM_SAFETY_FAIL', recovered.final_outcome.code)
          }
          if (!usageTrustworthy) return finish('PARTIAL_RUN', 'REQUIRED_USAGE_ACCOUNTING_UNTRUSTWORTHY')
          continue
        }
        observed.end()
        return finish('PARTIAL_RUN', internalCode || 'V7_R1_R2_RUN_1_INTERNAL_FAILURE')
      }
    }
  } catch {
    observed.end()
    return finish('PARTIAL_RUN', 'V7_R1_R2_RUN_1_INTERNAL_FAILURE')
  }
  return finish('SYSTEM_SAFETY_PASS', null)
}
