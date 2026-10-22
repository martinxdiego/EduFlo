import { open } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  fullEvaluationRun2Readiness,
  TUTOR_FULL_EVALUATION_RUN_2_MANIFEST,
} from '../lib/server/learning-v2/tutor/evaluation/full-evaluation-run-2-manifest.js'
import {
  claimFullEvaluationRun2,
  runFullTutorEvaluationRun2,
} from '../lib/server/learning-v2/tutor/evaluation/full-evaluation-run-2.js'

// No dotenv, CLI secret or opt-in activation. The claim and result are unique
// to Run 2 and survive every outcome. An absent result never permits a retry.
const directory = fileURLToPath(new URL('../docs/evaluation-results/', import.meta.url))
let resultHandle
try {
  const readiness = fullEvaluationRun2Readiness()
  if (!readiness.runnable) {
    console.log(JSON.stringify(readiness))
    process.exitCode = 1
  } else {
    const evaluation = await runFullTutorEvaluationRun2({ claim: async () => {
      await claimFullEvaluationRun2(directory)
      resultHandle = await open(path.join(directory, 'tutor-paid-evaluation-run-2-v1.result.json'), 'wx', 0o600)
    } })
    if (resultHandle) {
      await resultHandle.writeFile(JSON.stringify({ manifest: TUTOR_FULL_EVALUATION_RUN_2_MANIFEST, result: evaluation }, null, 2) + '\n')
      await resultHandle.sync()
    }
    console.log(JSON.stringify({
      run_manifest_version: evaluation.run_manifest_version,
      status: evaluation.status,
      reason_code: evaluation.reason_code,
      fixtures_attempted: evaluation.fixtures_attempted,
      fixtures_completed: evaluation.fixtures_completed,
      http_calls: evaluation.budget?.http_calls ?? evaluation.http_calls,
      actual_cost: evaluation.budget?.actual_cost ?? null,
      raw_error_retained: false,
    }))
    if (evaluation.status !== 'PASS_TECHNICAL') process.exitCode = 1
  }
} catch {
  if (resultHandle) {
    await resultHandle.writeFile(JSON.stringify({
      manifest: TUTOR_FULL_EVALUATION_RUN_2_MANIFEST,
      result: { status: 'PARTIAL_RUN', reason_code: 'RUN_2_ARTIFACT_OR_RUNNER_FAILURE', retry_authorized: false, raw_error_retained: false },
    }, null, 2) + '\n').catch(() => {})
    await resultHandle.sync().catch(() => {})
  }
  console.log(JSON.stringify({ status: 'PARTIAL_RUN', reason_code: 'RUN_2_ARTIFACT_OR_RUNNER_FAILURE', retry_authorized: false, raw_error_retained: false }))
  process.exitCode = 1
} finally { await resultHandle?.close() }
