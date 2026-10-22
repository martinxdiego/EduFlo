import { buildTutorProviderContext } from '../provider-context.js'
import { TUTOR_RUNTIME_APPROVAL_CONTRACT } from '../governance/runtime-approval.js'
import { verifyIndependentLocalFallback } from './evaluation-gates.js'
import {
  aggregateTutorSystemSafety,
  evaluateTutorInteraction,
  evaluateTutorProviderFailure,
  TUTOR_FALLBACK_RATE_THRESHOLD_STATUS,
  TUTOR_SYSTEM_SAFETY_EVALUATION_SEMANTICS,
  TUTOR_SYSTEM_SAFETY_EVALUATOR_VERSION,
  TUTOR_SYSTEM_SAFETY_RESULT_CONTRACT_VERSION,
} from './system-safety-evaluation-contract.js'
import { TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION } from '../canonical-safety-gates.js'
import {
  paidEvaluationReadiness,
  tutorFixtureSetHash,
  tutorEvaluationManifestSchema,
  TUTOR_PAID_EVALUATION_MANIFEST,
} from './evaluation-manifest.js'
import {
  classifyPaidEvaluationProviderError,
  paidEvaluationUsageMissingDiagnostic,
} from './provider-diagnostics.js'
import {
  ConservativeEvaluationBudget,
  TUTOR_EVALUATION_ACCOUNTING_CONTRACT_VERSION,
} from './evaluation-accounting-contract.js'

function technicalResult(status, values = {}) {
  return Object.freeze({
    status,
    automated_only: true,
    evaluator_contract_version: TUTOR_SYSTEM_SAFETY_EVALUATOR_VERSION,
    result_contract_version: TUTOR_SYSTEM_SAFETY_RESULT_CONTRACT_VERSION,
    canonical_safety_contract_version: TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
    evaluation_semantics: TUTOR_SYSTEM_SAFETY_EVALUATION_SEMANTICS,
    fallback_rate_threshold_status: TUTOR_FALLBACK_RATE_THRESHOLD_STATUS,
    runtime_approval_changed: false,
    human_approval_changed: false,
    production_approval_changed: false,
    ...values,
  })
}

export class PaidEvaluationBudget extends ConservativeEvaluationBudget {}

function boundedDiagnostic(diagnostic, budget, fixture) {
  return Object.freeze({
    ...diagnostic,
    call_ordinal: budget.snapshot().http_calls,
    case_id: fixture?.case_id || null,
    transport_started: true,
    usage_available: false,
    usage_state: 'UNKNOWN_FOR_CALL',
    automated_gates_reached: false,
    raw_error_retained: false,
  })
}

// Internal execution primitive. Irreversible paid runners must perform their
// exact run-specific readiness and create-once claim before calling it.
export async function executeEvaluationCore({ manifest, provider, fixtures }) {
  if (!provider?.available?.()) return technicalResult('BLOCKED', { reason_code: 'PROVIDER_UNAVAILABLE', http_calls: 0 })
  const fallback = verifyIndependentLocalFallback(fixtures)
  if (!fallback.passed) return technicalResult('FAIL', { reason_code: fallback.code, http_calls: 0 })
  const approvalBefore = JSON.stringify(TUTOR_RUNTIME_APPROVAL_CONTRACT)
  const budget = new PaidEvaluationBudget(manifest)
  const caseResults = []
  const providerDiagnostics = []
  const expectedCount = manifest.fixture_count * manifest.repetition_count
  const finish = (status, reasonCode) => technicalResult(status, {
    reason_code: reasonCode,
    accounting_contract_version: TUTOR_EVALUATION_ACCOUNTING_CONTRACT_VERSION,
    budget: budget.snapshot(),
    case_results: Object.freeze(caseResults),
    metrics: aggregateTutorSystemSafety(caseResults, expectedCount),
    provider_diagnostics: Object.freeze(providerDiagnostics),
    retries: 0,
    provider_failover: false,
    learning_truth_mutations: 0,
  })

  for (let repetition = 1; repetition <= manifest.repetition_count; repetition += 1) {
    for (const fixture of fixtures) {
      if (!budget.beforeCall()) return finish('FAIL', 'BUDGET_CAP_REACHED_BEFORE_TRANSPORT')
      let generated
      try {
        generated = await provider.generate(buildTutorProviderContext({
          level: fixture.level,
          promptVersion: manifest.prompt_version,
          task: {},
          question: { question: fixture.prompt, options: fixture.options },
        }), { beforeTransport: async () => budget.markTransport() })
      } catch (error) {
        if (error?.name === 'EvaluationContractIntegrityError') {
          if (budget.transportStarted()) {
            try { budget.recordUnknownUsage() } catch {}
          } else {
            try { budget.cancelBeforeTransport() } catch {}
          }
          return finish('FAIL', 'EVALUATION_CONTRACT_INTEGRITY_FAILURE')
        }
        if (!budget.transportStarted()) {
          budget.cancelBeforeTransport()
          return finish('FAIL', 'PROVIDER_FAILED_BEFORE_TRANSPORT')
        }
        const diagnostic = classifyPaidEvaluationProviderError(error)
        try { budget.recordUnknownUsage() } catch { return finish('FAIL', 'PAID_EVAL_BUDGET_EXCEEDED') }
        providerDiagnostics.push(boundedDiagnostic(diagnostic, budget, fixture))
        const recovered = evaluateTutorProviderFailure(fixture, diagnostic.reason_code, { repetition })
        caseResults.push(recovered)
        if (recovered.final_outcome.status === 'FINAL_OUTCOME_FAIL') return finish('FAIL', recovered.final_outcome.code)
        continue
      }

      try {
        budget.recordUsage(generated.usage)
      } catch (error) {
        if (error?.message !== 'PROVIDER_USAGE_MISSING') return finish('FAIL', error?.message || 'PAID_EVAL_BUDGET_EXCEEDED')
        try { budget.recordUnknownUsage() } catch { return finish('FAIL', 'PAID_EVAL_BUDGET_EXCEEDED') }
        const diagnostic = paidEvaluationUsageMissingDiagnostic()
        providerDiagnostics.push(boundedDiagnostic(diagnostic, budget, fixture))
        const recovered = evaluateTutorProviderFailure(fixture, diagnostic.reason_code, { repetition })
        caseResults.push(recovered)
        if (recovered.final_outcome.status === 'FINAL_OUTCOME_FAIL') return finish('FAIL', recovered.final_outcome.code)
        continue
      }

      const checked = evaluateTutorInteraction(generated.candidate, fixture, { repetition })
      caseResults.push(checked)
      if (checked.final_outcome.status === 'FINAL_OUTCOME_FAIL') return finish('FAIL', checked.final_outcome.code)
    }
  }
  if (JSON.stringify(TUTOR_RUNTIME_APPROVAL_CONTRACT) !== approvalBefore) {
    return finish('FAIL', 'GOVERNANCE_CHANGED_DURING_EVALUATION')
  }
  const metrics = aggregateTutorSystemSafety(caseResults, expectedCount)
  return finish(metrics.r2_final_tutor_system_safety.system_safety_pass ? 'PASS_TECHNICAL' : 'FAIL',
    metrics.r2_final_tutor_system_safety.system_safety_pass ? null : 'SYSTEM_SAFETY_INCOMPLETE_OR_FAILED')
}

export async function runSyntheticTutorEvaluationVerification({ manifest, provider, fixtures } = {}) {
  if (provider?.syntheticEvaluationDouble !== true) {
    return technicalResult('BLOCKED', { reason_code: 'SYNTHETIC_PROVIDER_DOUBLE_REQUIRED', http_calls: 0 })
  }
  if (!manifest || !Array.isArray(fixtures) || fixtures.length !== manifest.fixture_count
    || tutorFixtureSetHash(fixtures) !== manifest.fixture_set_hash) {
    return technicalResult('BLOCKED', { reason_code: 'FIXTURE_SET_MISMATCH', http_calls: 0 })
  }
  return executeEvaluationCore({ manifest, provider, fixtures })
}

export async function runPaidTutorEvaluation({
  environment = process.env,
  manifest = TUTOR_PAID_EVALUATION_MANIFEST,
  provider,
  fixtures,
} = {}) {
  const readiness = paidEvaluationReadiness(environment, manifest)
  if (!readiness.runnable) return technicalResult(readiness.status === 'NOT RUN' ? 'NOT_RUN' : 'BLOCKED', { reason_code: readiness.reasonCode, http_calls: 0 })
  const parsedManifest = tutorEvaluationManifestSchema.parse(manifest)
  if (!provider?.available?.()) return technicalResult('BLOCKED', { reason_code: 'PROVIDER_UNAVAILABLE', http_calls: 0 })
  if (!Array.isArray(fixtures) || fixtures.length !== parsedManifest.fixture_count
    || tutorFixtureSetHash(fixtures) !== parsedManifest.fixture_set_hash) {
    return technicalResult('BLOCKED', { reason_code: 'FIXTURE_SET_MISMATCH', http_calls: 0 })
  }
  return executeEvaluationCore({ manifest: parsedManifest, provider, fixtures })
}
