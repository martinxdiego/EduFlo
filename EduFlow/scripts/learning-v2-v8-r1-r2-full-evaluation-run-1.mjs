import { access, open } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  TUTOR_V8_R1_R2_RUN_1_MANIFEST,
  v8R1R2Run1Readiness,
} from '../lib/server/learning-v2/tutor/evaluation/v8-r1-r2-run-1-manifest.js'
import {
  claimV8R1R2Run1,
  runV8R1R2TutorEvaluationRun1,
  V8_R1_R2_RUN_1_CLAIM_FILENAME,
  V8_R1_R2_RUN_1_RESULT_FILENAME,
} from '../lib/server/learning-v2/tutor/evaluation/v8-r1-r2-run-1.js'

// Secrets are inherited only from the process environment. The script never
// loads an env file, accepts a CLI secret, or prints request/provider payloads.
const directory = fileURLToPath(new URL('../docs/evaluation-results/', import.meta.url))
let resultHandle

function boundedSummary(evaluation) {
  return {
    run_manifest_version: evaluation.run_manifest_version,
    run_contract_hash: evaluation.run_contract_hash,
    status: evaluation.status,
    reason_code: evaluation.reason_code,
    fixtures_attempted: evaluation.fixtures_attempted ?? 0,
    fixtures_completed: evaluation.fixtures_completed ?? 0,
    provider_transports: evaluation.provider_transports ?? evaluation.http_calls ?? 0,
    retries: evaluation.retries ?? 0,
    provider_failover: evaluation.provider_failover ?? false,
    actual_cost_status: evaluation.budget?.actual_cost_status ?? null,
    actual_cost: evaluation.budget?.actual_cost ?? null,
    known_actual_cost: evaluation.budget?.known_actual_cost ?? 0,
    known_actual_input_tokens: evaluation.budget?.known_actual_input_tokens ?? 0,
    known_actual_output_tokens: evaluation.budget?.known_actual_output_tokens ?? 0,
    known_actual_total_tokens: evaluation.budget?.known_actual_total_tokens ?? 0,
    unknown_usage_call_count: evaluation.budget?.unknown_usage_call_count ?? 0,
    conservative_unknown_usage_cost: evaluation.budget?.conservative_unknown_usage_cost ?? 0,
    conservative_total_cost_upper_bound: evaluation.budget?.conservative_total_cost_upper_bound ?? 0,
    remaining_cost_budget_upper_bound: evaluation.budget?.remaining_cost_budget_upper_bound ?? null,
    currency: evaluation.budget?.currency ?? TUTOR_V8_R1_R2_RUN_1_MANIFEST.currency,
    r1_provider_candidate_quality: evaluation.r1_provider_candidate_quality ?? null,
    fallback_count: evaluation.fallback_count ?? 0,
    fallback_rate: evaluation.fallback_rate ?? 0,
    fallback_rate_threshold_status: evaluation.fallback_rate_threshold_status ?? 'PRODUCT_DECISION_PENDING',
    r2_final_tutor_system_safety: evaluation.r2_final_tutor_system_safety ?? null,
    system_safety_pass: evaluation.system_safety_pass ?? false,
    bounded_failure_codes: evaluation.bounded_failure_codes ?? [],
    raw_error_retained: false,
  }
}

async function exists(filename) {
  try {
    await access(path.join(directory, filename))
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

try {
  const readiness = v8R1R2Run1Readiness()
  if (!readiness.runnable) {
    console.log(JSON.stringify(readiness))
    process.exitCode = 1
  } else if (await exists(V8_R1_R2_RUN_1_CLAIM_FILENAME) || await exists(V8_R1_R2_RUN_1_RESULT_FILENAME)) {
    console.log(JSON.stringify({
      run_manifest_version: TUTOR_V8_R1_R2_RUN_1_MANIFEST.run_manifest_version,
      status: 'BLOCKED',
      reason_code: 'V8_R1_R2_RUN_1_AUTHORIZATION_ALREADY_CONSUMED_OR_ARTIFACT_EXISTS',
      http_calls: 0,
      retry_authorized: false,
      raw_error_retained: false,
    }))
    process.exitCode = 1
  } else {
    const evaluation = await runV8R1R2TutorEvaluationRun1({
      claim: async () => {
        await claimV8R1R2Run1(directory)
        resultHandle = await open(path.join(directory, V8_R1_R2_RUN_1_RESULT_FILENAME), 'wx', 0o600)
      },
    })
    if (resultHandle) {
      await resultHandle.writeFile(JSON.stringify({
        manifest: TUTOR_V8_R1_R2_RUN_1_MANIFEST,
        result: evaluation,
      }, null, 2) + '\n')
      await resultHandle.sync()
    }
    console.log(JSON.stringify(boundedSummary(evaluation)))
    if (evaluation.status !== 'SYSTEM_SAFETY_PASS') process.exitCode = 1
  }
} catch {
  if (resultHandle) {
    await resultHandle.writeFile(JSON.stringify({
      manifest: TUTOR_V8_R1_R2_RUN_1_MANIFEST,
      result: {
        run_manifest_version: TUTOR_V8_R1_R2_RUN_1_MANIFEST.run_manifest_version,
        run_contract_hash: null,
        source_evaluation_manifest_version: TUTOR_V8_R1_R2_RUN_1_MANIFEST.source_evaluation_manifest_version,
        evaluator_version: TUTOR_V8_R1_R2_RUN_1_MANIFEST.evaluator_version,
        result_contract_version: TUTOR_V8_R1_R2_RUN_1_MANIFEST.result_contract_version,
        accounting_contract_version: TUTOR_V8_R1_R2_RUN_1_MANIFEST.accounting_contract_version,
        canonical_safety_contract_version: TUTOR_V8_R1_R2_RUN_1_MANIFEST.canonical_safety_contract_version,
        status: 'PARTIAL_RUN',
        reason_code: 'V8_R1_R2_RUN_1_ARTIFACT_OR_RUNNER_FAILURE',
        termination_reason: 'V8_R1_R2_RUN_1_ARTIFACT_OR_RUNNER_FAILURE',
        retry_authorized: false,
        raw_error_retained: false,
      },
    }, null, 2) + '\n').catch(() => {})
    await resultHandle.sync().catch(() => {})
  }
  console.log(JSON.stringify({
    run_manifest_version: TUTOR_V8_R1_R2_RUN_1_MANIFEST.run_manifest_version,
    status: resultHandle ? 'PARTIAL_RUN' : 'BLOCKED',
    reason_code: 'V8_R1_R2_RUN_1_ARTIFACT_OR_RUNNER_FAILURE',
    retry_authorized: false,
    raw_error_retained: false,
  }))
  process.exitCode = 1
} finally {
  await resultHandle?.close()
}
