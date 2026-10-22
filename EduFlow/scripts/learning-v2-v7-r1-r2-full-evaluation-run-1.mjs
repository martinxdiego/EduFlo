import { access, open } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  TUTOR_V7_R1_R2_RUN_1_MANIFEST,
  v7R1R2Run1Readiness,
} from '../lib/server/learning-v2/tutor/evaluation/v7-r1-r2-run-1-manifest.js'
import {
  claimV7R1R2Run1,
  runV7R1R2TutorEvaluationRun1,
  V7_R1_R2_RUN_1_CLAIM_FILENAME,
  V7_R1_R2_RUN_1_RESULT_FILENAME,
} from '../lib/server/learning-v2/tutor/evaluation/v7-r1-r2-run-1.js'

// No environment-file loading, CLI secret, implicit opt-in or retry. Both artifacts are
// create-once; an absent or failed result never recreates paid authorization.
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
    input_tokens: evaluation.budget?.input_tokens ?? null,
    output_tokens: evaluation.budget?.output_tokens ?? null,
    total_tokens: evaluation.budget?.total_tokens ?? null,
    actual_cost: evaluation.budget?.actual_cost ?? null,
    currency: evaluation.budget?.currency ?? TUTOR_V7_R1_R2_RUN_1_MANIFEST.currency,
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
  const readiness = v7R1R2Run1Readiness()
  if (!readiness.runnable) {
    console.log(JSON.stringify(readiness))
    process.exitCode = 1
  } else if (await exists(V7_R1_R2_RUN_1_CLAIM_FILENAME) || await exists(V7_R1_R2_RUN_1_RESULT_FILENAME)) {
    console.log(JSON.stringify({
      run_manifest_version: TUTOR_V7_R1_R2_RUN_1_MANIFEST.run_manifest_version,
      status: 'BLOCKED',
      reason_code: 'V7_R1_R2_RUN_1_AUTHORIZATION_ALREADY_CONSUMED_OR_ARTIFACT_EXISTS',
      http_calls: 0,
      retry_authorized: false,
      raw_error_retained: false,
    }))
    process.exitCode = 1
  } else {
    const evaluation = await runV7R1R2TutorEvaluationRun1({
      claim: async () => {
        await claimV7R1R2Run1(directory)
        resultHandle = await open(path.join(directory, V7_R1_R2_RUN_1_RESULT_FILENAME), 'wx', 0o600)
      },
    })
    if (resultHandle) {
      await resultHandle.writeFile(JSON.stringify({
        manifest: TUTOR_V7_R1_R2_RUN_1_MANIFEST,
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
      manifest: TUTOR_V7_R1_R2_RUN_1_MANIFEST,
      result: {
        run_manifest_version: TUTOR_V7_R1_R2_RUN_1_MANIFEST.run_manifest_version,
        source_evaluation_manifest_version: TUTOR_V7_R1_R2_RUN_1_MANIFEST.source_evaluation_manifest_version,
        evaluator_version: TUTOR_V7_R1_R2_RUN_1_MANIFEST.evaluator_version,
        result_contract_version: TUTOR_V7_R1_R2_RUN_1_MANIFEST.result_contract_version,
        canonical_safety_contract_version: TUTOR_V7_R1_R2_RUN_1_MANIFEST.canonical_safety_contract_version,
        status: 'PARTIAL_RUN',
        reason_code: 'V7_R1_R2_RUN_1_ARTIFACT_OR_RUNNER_FAILURE',
        termination_reason: 'V7_R1_R2_RUN_1_ARTIFACT_OR_RUNNER_FAILURE',
        retry_authorized: false,
        raw_error_retained: false,
      },
    }, null, 2) + '\n').catch(() => {})
    await resultHandle.sync().catch(() => {})
  }
  console.log(JSON.stringify({
    run_manifest_version: TUTOR_V7_R1_R2_RUN_1_MANIFEST.run_manifest_version,
    status: resultHandle ? 'PARTIAL_RUN' : 'BLOCKED',
    reason_code: 'V7_R1_R2_RUN_1_ARTIFACT_OR_RUNNER_FAILURE',
    retry_authorized: false,
    raw_error_retained: false,
  }))
  process.exitCode = 1
} finally {
  await resultHandle?.close()
}
