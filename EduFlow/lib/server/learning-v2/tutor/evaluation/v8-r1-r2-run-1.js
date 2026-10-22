import OpenAI from 'openai'
import { mkdir, open } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { providerContextContainsForbiddenKey } from '../provider-context.js'
import { tutorSyntheticEvalCases } from '../eval-fixtures.js'
import { TUTOR_PROMPT_REGISTRY } from '../prompt-registry.js'
import { OpenAITutorProvider } from '../providers/openai-tutor-provider.js'
import { TUTOR_CANONICAL_SAFETY_GATE_ORDER } from '../canonical-safety-gates.js'
import { verifyIndependentLocalFallback } from './evaluation-gates.js'
import { executeEvaluationCore } from './paid-evaluation.js'
import {
  TUTOR_V8_R1_R2_RUN_1_MANIFEST,
  v8R1R2Run1ContractHash,
  v8R1R2Run1Governance,
  v8R1R2Run1Readiness,
} from './v8-r1-r2-run-1-manifest.js'

export const V8_R1_R2_RUN_1_CLAIM_FILENAME = 'tutor-paid-evaluation-v8-r1-r2-run-1-v1.claim.json'
export const V8_R1_R2_RUN_1_RESULT_FILENAME = 'tutor-paid-evaluation-v8-r1-r2-run-1-v1.result.json'

class EvaluationContractIntegrityError extends Error {
  constructor() {
    super('EVALUATION_CONTRACT_INTEGRITY_FAILURE')
    this.name = 'EvaluationContractIntegrityError'
  }
}

export async function claimV8R1R2Run1(directory, manifest = TUTOR_V8_R1_R2_RUN_1_MANIFEST) {
  await mkdir(directory, { recursive: true })
  const handle = await open(path.join(directory, V8_R1_R2_RUN_1_CLAIM_FILENAME), 'wx', 0o600)
  try {
    await handle.writeFile(JSON.stringify({
      run_manifest_version: manifest.run_manifest_version,
      run_contract_hash: v8R1R2Run1ContractHash(manifest),
      source_evaluation_manifest_version: manifest.source_evaluation_manifest_version,
      source_evaluation_scope_fingerprint: manifest.source_evaluation_scope_fingerprint,
      fixture_set_hash: manifest.fixture_set_hash,
      evaluator_version: manifest.evaluator_version,
      result_contract_version: manifest.result_contract_version,
      accounting_contract_version: manifest.accounting_contract_version,
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

function createPaidProvider({ environment, manifest, fixtures, fetchImplementation }) {
  let active = null
  const guardedFetch = async (url, options) => {
    if (!active || active.fetch_started) throw new EvaluationContractIntegrityError()
    let body
    try { body = JSON.parse(options.body) } catch { throw new EvaluationContractIntegrityError() }
    const expectedPrompt = TUTOR_PROMPT_REGISTRY[manifest.prompt_version]
    if (String(url) !== 'https://api.openai.com/v1/responses' || options.method !== 'POST'
      || body.model !== manifest.model_id || body.service_tier !== manifest.service_tier
      || body.store !== false || body.max_output_tokens !== manifest.max_output_tokens_per_call
      || body.instructions !== expectedPrompt?.instructions || body.input !== JSON.stringify(active.context)
      || body.reasoning?.effort !== 'low'
      || Buffer.byteLength(JSON.stringify(body), 'utf8') > manifest.max_input_tokens_per_call) {
      throw new EvaluationContractIntegrityError()
    }
    const preflight = v8R1R2Run1Readiness({ environment, manifest, fixtures })
    if (!preflight.runnable) throw new EvaluationContractIntegrityError()
    active.fetch_started = true
    try {
      return await fetchImplementation(url, { ...options, redirect: 'error' })
    } catch (error) {
      if (['AbortError', 'APIConnectionTimeoutError', 'APIUserAbortError'].includes(error?.name)
        || ['ABORT_ERR', 'ETIMEDOUT'].includes(error?.code)) active.timeout_or_abort = true
      throw error
    }
  }
  const client = new OpenAI({
    apiKey: environment.OPENAI_API_KEY,
    baseURL: 'https://api.openai.com/v1',
    maxRetries: 0,
    timeout: manifest.timeout_ms,
    logLevel: 'off',
    fetch: guardedFetch,
  })
  const provider = new OpenAITutorProvider({ client, timeoutMs: manifest.timeout_ms })
  return Object.freeze({
    available() { return provider.available() },
    async generate(context, options = {}) {
      if (active || providerContextContainsForbiddenKey(context)) throw new EvaluationContractIntegrityError()
      active = { context, fetch_started: false, timeout_or_abort: false }
      try {
        return await provider.generate(context, {
          ...options,
          beforeTransport: async () => {
            const preflight = v8R1R2Run1Readiness({ environment, manifest, fixtures })
            if (!preflight.runnable) throw new EvaluationContractIntegrityError()
            await options.beforeTransport?.()
          },
        })
      } catch (error) {
        if (active.timeout_or_abort) throw new DOMException('bounded-provider-timeout', 'AbortError')
        throw error
      } finally {
        active = null
      }
    },
  })
}

function distribution(values) {
  return Object.freeze(values.reduce((result, value) => {
    result[value] = (result[value] || 0) + 1
    return result
  }, {}))
}

function aggregateGates(cases, select) {
  return Object.freeze(Object.fromEntries(TUTOR_CANONICAL_SAFETY_GATE_ORDER.map((gate) => [gate, Object.freeze({
    PASS: cases.filter((item) => select(item).find((entry) => entry.gate === gate)?.state === 'PASS').length,
    FAIL: cases.filter((item) => select(item).find((entry) => entry.gate === gate)?.state === 'FAIL').length,
    NOT_REACHED: cases.filter((item) => select(item).find((entry) => entry.gate === gate)?.state === 'NOT_REACHED').length,
  })])))
}

function baseResult(manifest, status, values = {}) {
  return Object.freeze({
    run_manifest_version: manifest.run_manifest_version,
    run_contract_hash: v8R1R2Run1ContractHash(manifest),
    source_evaluation_manifest_version: manifest.source_evaluation_manifest_version,
    source_evaluation_scope_fingerprint: manifest.source_evaluation_scope_fingerprint,
    evaluator_version: manifest.evaluator_version,
    result_contract_version: manifest.result_contract_version,
    accounting_contract_version: manifest.accounting_contract_version,
    canonical_safety_contract_version: manifest.canonical_safety_contract_version,
    leakage_contract_version: manifest.leakage_contract_version,
    leakage_policy: manifest.leakage_policy,
    status,
    automated_only: true,
    synthetic_data_only: true,
    ...values,
  })
}

function finalStatus(core) {
  if (core.status === 'PASS_TECHNICAL') return 'SYSTEM_SAFETY_PASS'
  if (core.status === 'BLOCKED') return 'BLOCKED'
  if (core.reason_code?.startsWith('LOCAL_FALLBACK_')
    || ['GOVERNANCE_CHANGED_DURING_EVALUATION', 'SYSTEM_SAFETY_INCOMPLETE_OR_FAILED'].includes(core.reason_code)) {
    return 'SYSTEM_SAFETY_FAIL'
  }
  return 'PARTIAL_RUN'
}

function boundedRunResult(manifest, core, governanceBefore) {
  const cases = core.case_results || []
  const diagnostics = core.provider_diagnostics || []
  const governanceAfter = v8R1R2Run1Governance()
  const governanceIntact = isDeepStrictEqual(governanceAfter, governanceBefore)
  const status = governanceIntact ? finalStatus(core) : 'SYSTEM_SAFETY_FAIL'
  const reasonCode = governanceIntact ? core.reason_code : 'GOVERNANCE_CHANGED_DURING_RUN'
  const providerPass = cases.filter((item) => item.provider_candidate.status === 'PASS').length
  const providerFail = cases.filter((item) => item.provider_candidate.status === 'FAIL').length
  const providerFailure = cases.filter((item) => item.provider_candidate.status === 'PROVIDER_FAILURE').length
  const providerTotal = providerPass + providerFail + providerFailure
  const providerAccepted = cases.filter((item) => item.final_outcome.status === 'PROVIDER_ACCEPTED').length
  const localAccepted = cases.filter((item) => item.final_outcome.status === 'LOCAL_FALLBACK_ACCEPTED').length
  const finalFailed = cases.filter((item) => item.final_outcome.status === 'FINAL_OUTCOME_FAIL').length
  const fallbackCount = cases.filter((item) => item.fallback.used).length
  const budget = core.budget || null
  const boundedFailureCodes = [...new Set([
    ...cases.map((item) => item.provider_candidate.code),
    ...cases.map((item) => item.final_outcome.code),
    ...diagnostics.map((item) => item.reason_code),
    reasonCode,
  ].filter(Boolean))]
  return baseResult(manifest, status, {
    started: true,
    completed: status === 'SYSTEM_SAFETY_PASS' && cases.length === manifest.fixture_count,
    coverage_complete: cases.length === manifest.fixture_count,
    reason_code: reasonCode,
    termination_reason: reasonCode || 'ALL_EXPECTED_FINAL_OUTCOMES_CANONICAL_PASS',
    fixtures_attempted: budget?.http_calls ?? 0,
    fixtures_completed: cases.length,
    provider_transports: budget?.http_calls ?? 0,
    retries: 0,
    provider_failover: false,
    provider_failures: diagnostics.length,
    provider_timeouts: diagnostics.filter((item) => item.category === 'timeout').length,
    budget,
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
      system_safety_pass: status === 'SYSTEM_SAFETY_PASS' && core.metrics?.r2_final_tutor_system_safety?.system_safety_pass === true,
    }),
    system_safety_pass: status === 'SYSTEM_SAFETY_PASS' && core.metrics?.r2_final_tutor_system_safety?.system_safety_pass === true,
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
    human_approval_changed: false,
    production_capabilities_all_off: governanceAfter.production_capabilities_all_off,
    learning_truth_mutations: 0,
    domain_database_used: false,
    retry_authorized: false,
  })
}

export async function runV8R1R2TutorEvaluationRun1({
  environment = process.env,
  manifest = TUTOR_V8_R1_R2_RUN_1_MANIFEST,
  fixtures = tutorSyntheticEvalCases(),
  claim,
  fetchImplementation = globalThis.fetch,
} = {}) {
  const preflight = v8R1R2Run1Readiness({ environment, manifest, fixtures })
  if (!preflight.runnable) {
    return baseResult(manifest, 'BLOCKED', {
      started: false, completed: false,
      reason_code: preflight.reason_code, termination_reason: preflight.reason_code, http_calls: 0,
    })
  }
  const fallback = verifyIndependentLocalFallback(fixtures)
  if (!fallback.passed) {
    return baseResult(manifest, 'BLOCKED', {
      started: false, completed: false,
      reason_code: fallback.code, termination_reason: fallback.code, http_calls: 0,
    })
  }
  if (typeof claim !== 'function') {
    return baseResult(manifest, 'BLOCKED', {
      started: false, completed: false,
      reason_code: 'V8_R1_R2_RUN_1_DURABLE_CLAIM_REQUIRED',
      termination_reason: 'V8_R1_R2_RUN_1_DURABLE_CLAIM_REQUIRED', http_calls: 0,
    })
  }
  try { await claim() } catch {
    return baseResult(manifest, 'BLOCKED', {
      started: false, completed: false,
      reason_code: 'V8_R1_R2_RUN_1_AUTHORIZATION_ALREADY_CONSUMED_OR_CLAIM_FAILED',
      termination_reason: 'V8_R1_R2_RUN_1_AUTHORIZATION_ALREADY_CONSUMED_OR_CLAIM_FAILED', http_calls: 0,
    })
  }
  const afterClaim = v8R1R2Run1Readiness({ environment, manifest, fixtures })
  if (!afterClaim.runnable) {
    return baseResult(manifest, 'PARTIAL_RUN', {
      started: true, completed: false,
      reason_code: afterClaim.reason_code, termination_reason: afterClaim.reason_code,
      http_calls: 0, retry_authorized: false,
    })
  }
  const provider = createPaidProvider({ environment, manifest, fixtures, fetchImplementation })
  const core = await executeEvaluationCore({ manifest, provider, fixtures })
  return boundedRunResult(manifest, core, preflight.governance)
}
