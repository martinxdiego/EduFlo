import OpenAI from 'openai'
import { isDeepStrictEqual } from 'node:util'
import { open, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { OpenAITutorProvider } from '../providers/openai-tutor-provider.js'
import { buildTutorProviderContext } from '../provider-context.js'
import { tutorSyntheticEvalCases } from '../eval-fixtures.js'
import { evaluateTutorCandidate, verifyIndependentLocalFallback } from './evaluation-gates.js'
import { classifyPaidEvaluationProviderError, paidEvaluationUsageMissingDiagnostic, TUTOR_PROVIDER_DIAGNOSTIC_VERSION } from './provider-diagnostics.js'
import { diagnosticProbeReadiness, diagnosticGovernanceSnapshot, TUTOR_DIAGNOSTIC_PROBE_MANIFEST } from './diagnostic-probe-manifest.js'

// An exclusive, fsynced authorization tombstone. Never remove it to retry v1.
// No learner identifiers, credentials or request/response content enter this file.
export async function claimDiagnosticProbe(directory) {
  await mkdir(directory, { recursive: true })
  const handle = await open(path.join(directory, 'tutor-paid-diagnostic-probe-v1.claim.json'), 'wx', 0o600)
  try {
    await handle.writeFile(JSON.stringify({ diagnostic_manifest_version: 'tutor-paid-diagnostic-probe-v1', case_id: 'tutor-synthetic-003', authorization_consumed: true }) + '\n')
    await handle.sync()
  } finally { await handle.close() }
}

function safeUsage(value) {
  if (!value || ![value.input_tokens, value.output_tokens, value.total_tokens]
    .every((item) => Number.isSafeInteger(item) && item >= 0)
    || value.total_tokens !== value.input_tokens + value.output_tokens) return null
  return Object.freeze({ input_tokens: value.input_tokens, output_tokens: value.output_tokens, total_tokens: value.total_tokens })
}

// One invocation, one SDK client, one allowed fetch dispatch. All testing uses
// an explicit in-memory transport; no application service/database is imported.
export async function runTutorDiagnosticProbe({ environment = process.env, manifest = TUTOR_DIAGNOSTIC_PROBE_MANIFEST,
  fixtures = tutorSyntheticEvalCases(), claim, fetchImplementation = globalThis.fetch } = {}) {
  const preflight = diagnosticProbeReadiness({ environment, manifest, fixtures })
  const state = { http_calls: 0, response_known: false, http_status: null, parse_reached: false, usage: null, gates_reached: false }
  let diagnostic = null
  let gate = null
  let blockCode = null
  let requestEnvelope = null
  let reserved = false
  const finish = () => {
    const usage = state.usage
    const cost = usage ? Number((usage.input_tokens * 2 / 1_000_000 + usage.output_tokens * 12 / 1_000_000).toFixed(10)) : null
    const exceeded = usage && (usage.input_tokens > 40_000 || usage.output_tokens > 160 || cost > 0.10)
    const governance = diagnosticGovernanceSnapshot(environment)
    const approvalUnchanged = isDeepStrictEqual(governance, preflight.governance)
    const passed = !blockCode && !diagnostic && gate?.passed === true && !exceeded && approvalUnchanged
    const comparison = state.http_calls === 0 ? 'PROBE_BLOCKED'
      : diagnostic?.category === 'unknown' ? 'PROBE_INCONCLUSIVE'
        : passed ? 'FAILURE_NOT_REPRODUCED' : 'FAILURE_REPRODUCED'
    const recommendation = passed ? 'SAFE_TO_PLAN_NEW_FULL_EVALUATION'
      : blockCode || exceeded ? 'CONFIG_FIX_REQUIRED'
        : ['timeout', 'rate_or_quota', 'provider_transient', 'network_transport'].includes(diagnostic?.category)
          ? 'PROVIDER_FAILURE_REQUIRES_REVIEW'
          : diagnostic?.category === 'request_or_account' ? 'CONFIG_FIX_REQUIRED' : 'INSUFFICIENT_EVIDENCE'
    return Object.freeze({
      diagnostic_manifest_version: TUTOR_DIAGNOSTIC_PROBE_MANIFEST.diagnostic_manifest_version,
      evaluator_version: TUTOR_DIAGNOSTIC_PROBE_MANIFEST.evaluator_version,
      status: state.http_calls === 0 ? 'BLOCKED' : passed ? 'PROBE_PASS' : 'PROBE_FAIL',
      preflight_status: preflight.status, block_code: blockCode, comparison, recommendation,
      diagnostic: Object.freeze({
        diagnostic_version: TUTOR_PROVIDER_DIAGNOSTIC_VERSION,
        reason_code: diagnostic?.reason_code || null, category: diagnostic?.category || null,
        response_known: state.response_known, http_status: state.http_status, parse_reached: state.parse_reached,
        transport_started: state.http_calls > 0, usage_available: Boolean(usage), gates_reached: state.gates_reached,
        call_ordinal: state.http_calls, case_id: 'tutor-synthetic-003', raw_error_retained: false,
      }),
      http_calls: state.http_calls, retries: 0, provider_failover: false,
      automated_gate: gate, independent_local_fallback: 'PASS',
      usage, cost, currency: 'USD', max_cost: 0.10, maximum_cost: 0.08192,
      remaining_diagnostic_budget: cost === null ? null : Number((0.10 - cost).toFixed(10)),
      conservative_unspent_bound: Number((0.10 - (state.http_calls ? 0.08192 : 0)).toFixed(10)),
      remaining_authorized_http_calls: 0, budget_exceeded: Boolean(exceeded),
      governance_after: governance, runtime_approval_changed: !approvalUnchanged,
      full_evaluation_started: false, learning_truth_mutations: 0,
    })
  }
  if (!preflight.runnable) return Object.freeze({ status: 'BLOCKED', block_code: preflight.reason_code, http_calls: 0, comparison: 'PROBE_BLOCKED', recommendation: 'CONFIG_FIX_REQUIRED' })
  const fixture = fixtures.find((item) => item.case_id === manifest.case_id)
  if (!verifyIndependentLocalFallback([fixture]).passed) {
    return Object.freeze({ status: 'BLOCKED', block_code: 'LOCAL_FALLBACK_INVALID', http_calls: 0, comparison: 'PROBE_BLOCKED', recommendation: 'CONFIG_FIX_REQUIRED' })
  }
  if (typeof claim !== 'function') { blockCode = 'DURABLE_AUTHORIZATION_CLAIM_REQUIRED'; return finish() }
  try { await claim() } catch { blockCode = 'AUTHORIZATION_ALREADY_CONSUMED_OR_CLAIM_FAILED'; return finish() }
  const recheck = diagnosticProbeReadiness({ environment, manifest, fixtures })
  if (!recheck.runnable) { blockCode = recheck.reason_code; return finish() }
  const context = buildTutorProviderContext({
    level: fixture.level,
    promptVersion: manifest.prompt_version,
    task: {},
    question: { question: fixture.prompt, options: fixture.options },
  })
  try {
    const guardedFetch = async (url, options) => {
      if (state.http_calls !== 0 || !reserved) { blockCode = 'SECOND_TRANSPORT_FORBIDDEN'; throw new Error('PROBE_BLOCKED') }
      if (String(url) !== 'https://api.openai.com/v1/responses' || options.method !== 'POST'
        || !isDeepStrictEqual(JSON.parse(options.body), requestEnvelope)) {
        blockCode = 'OUTGOING_REQUEST_MISMATCH'; throw new Error('PROBE_BLOCKED')
      }
      const lastCheck = diagnosticProbeReadiness({ environment, manifest, fixtures })
      if (!lastCheck.runnable) { blockCode = lastCheck.reason_code; throw new Error('PROBE_BLOCKED') }
      // This counts dispatch, not receipt at the provider. Redirects cannot send
      // a second HTTP request; SDK/network failures are never retried.
      state.http_calls += 1
      const response = await fetchImplementation(url, { ...options, redirect: 'error' })
      state.response_known = true
      state.http_status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null
      const readJson = response.json.bind(response)
      response.json = async () => {
        const envelope = await readJson()
        // Extract only numeric usage, before the SDK's structured-output parser
        // can throw. The transient envelope continues to the unchanged SDK.
        if (response.ok) state.usage = safeUsage(envelope?.usage)
        return envelope
      }
      return response
    }
    const sdk = new OpenAI({ apiKey: environment.OPENAI_API_KEY, baseURL: 'https://api.openai.com/v1',
      maxRetries: 0, timeout: manifest.timeout_ms, logLevel: 'off', fetch: guardedFetch })
    const observedClient = { responses: { parse: (body, options) => {
      if (body.model !== manifest.model_id || body.service_tier !== 'default' || body.max_output_tokens !== 160
        || body.store !== false || options.maxRetries !== 0 || body.input !== JSON.stringify(context)
        || typeof body.text?.format?.$parseRaw !== 'function') {
        blockCode = 'PROVIDER_REQUEST_CONTRACT_MISMATCH'; throw new Error('PROBE_BLOCKED')
      }
      const serialized = JSON.stringify(body)
      // Byte upper bound plus protocol allowance, using no guessed tokenizer
      // or cached-input discount. Covers instructions, context AND schema.
      if (Buffer.byteLength(serialized, 'utf8') + 1024 > manifest.max_input_tokens) {
        blockCode = 'INPUT_TOKEN_BOUND_NOT_PROVEN'; throw new Error('PROBE_BLOCKED')
      }
      requestEnvelope = JSON.parse(serialized)
      const original = body.text.format
      const format = { ...original }
      Object.defineProperties(format, {
        $brand: { value: original.$brand, enumerable: false },
        $parseRaw: { value: (text) => { state.parse_reached = true; return original.$parseRaw(text) }, enumerable: false },
      })
      return sdk.responses.parse({ ...body, text: { ...body.text, format } }, options)
    } } }
    const provider = new OpenAITutorProvider({ client: observedClient, timeoutMs: manifest.timeout_ms })
    const generated = await provider.generate(context, { beforeTransport: async () => {
      if (reserved) { blockCode = 'SECOND_TRANSPORT_FORBIDDEN'; throw new Error('PROBE_BLOCKED') }
      reserved = true
    } })
    if (!state.usage) diagnostic = paidEvaluationUsageMissingDiagnostic()
    state.gates_reached = true
    gate = evaluateTutorCandidate(generated.candidate, fixture)
  } catch (error) {
    if (!blockCode) diagnostic = classifyPaidEvaluationProviderError(error)
  } finally {
    requestEnvelope = null
  }
  return finish()
}
