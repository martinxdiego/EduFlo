import { open } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  evidenceHardenedRun1Readiness,
  TUTOR_EVIDENCE_HARDENED_RUN_1_MANIFEST,
} from '../lib/server/learning-v2/tutor/evaluation/evidence-hardened-run-1-manifest.js'
import {
  claimEvidenceHardenedRun1,
  EVIDENCE_HARDENED_RUN_1_RESULT_FILENAME,
  runEvidenceHardenedTutorEvaluationRun1,
} from '../lib/server/learning-v2/tutor/evaluation/evidence-hardened-run-1.js'

// No environment-file loading, CLI secret or implicit opt-in activation. Claim and result are
// unique, create-once artifacts. An absent result never authorizes a retry.
const directory = fileURLToPath(new URL('../docs/evaluation-results/', import.meta.url))
let resultHandle
try {
  const readiness = evidenceHardenedRun1Readiness()
  if (!readiness.runnable) {
    console.log(JSON.stringify(readiness))
    process.exitCode = 1
  } else {
    const evaluation = await runEvidenceHardenedTutorEvaluationRun1({
      claim: async () => {
        await claimEvidenceHardenedRun1(directory)
        resultHandle = await open(path.join(directory, EVIDENCE_HARDENED_RUN_1_RESULT_FILENAME), 'wx', 0o600)
      },
    })
    if (resultHandle) {
      await resultHandle.writeFile(JSON.stringify({
        manifest: TUTOR_EVIDENCE_HARDENED_RUN_1_MANIFEST,
        result: evaluation,
      }, null, 2) + '\n')
      await resultHandle.sync()
    }
    console.log(JSON.stringify({
      run_manifest_version: evaluation.run_manifest_version,
      run_contract_hash: evaluation.run_contract_hash,
      status: evaluation.status,
      reason_code: evaluation.reason_code,
      fixtures_attempted: evaluation.fixtures_attempted,
      fixtures_completed: evaluation.fixtures_completed,
      http_calls: evaluation.budget?.http_calls ?? evaluation.http_calls,
      input_tokens: evaluation.budget?.input_tokens ?? null,
      output_tokens: evaluation.budget?.output_tokens ?? null,
      total_tokens: evaluation.budget?.total_tokens ?? null,
      actual_cost: evaluation.budget?.actual_cost ?? null,
      currency: evaluation.budget?.currency ?? TUTOR_EVIDENCE_HARDENED_RUN_1_MANIFEST.currency,
      pass_count: evaluation.case_counts?.PASS ?? 0,
      fail_count: evaluation.case_counts?.FAIL ?? 0,
      bounded_failure_codes: evaluation.bounded_failure_codes ?? [],
      raw_error_retained: false,
    }))
    if (evaluation.status !== 'PASS_TECHNICAL') process.exitCode = 1
  }
} catch {
  if (resultHandle) {
    await resultHandle.writeFile(JSON.stringify({
      manifest: TUTOR_EVIDENCE_HARDENED_RUN_1_MANIFEST,
      result: {
        run_manifest_version: TUTOR_EVIDENCE_HARDENED_RUN_1_MANIFEST.run_manifest_version,
        evaluator_version: TUTOR_EVIDENCE_HARDENED_RUN_1_MANIFEST.evaluator_version,
        result_contract_version: TUTOR_EVIDENCE_HARDENED_RUN_1_MANIFEST.result_contract_version,
        leakage_contract_version: TUTOR_EVIDENCE_HARDENED_RUN_1_MANIFEST.leakage_contract_version,
        status: 'PARTIAL_RUN',
        reason_code: 'EVIDENCE_HARDENED_RUN_1_ARTIFACT_OR_RUNNER_FAILURE',
        termination_reason: 'EVIDENCE_HARDENED_RUN_1_ARTIFACT_OR_RUNNER_FAILURE',
        retry_authorized: false,
        raw_error_retained: false,
      },
    }, null, 2) + '\n').catch(() => {})
    await resultHandle.sync().catch(() => {})
  }
  console.log(JSON.stringify({
    status: 'PARTIAL_RUN',
    reason_code: 'EVIDENCE_HARDENED_RUN_1_ARTIFACT_OR_RUNNER_FAILURE',
    retry_authorized: false,
    raw_error_retained: false,
  }))
  process.exitCode = 1
} finally {
  await resultHandle?.close()
}
