import { open } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { diagnosticProbeReadiness, TUTOR_DIAGNOSTIC_PROBE_MANIFEST } from '../lib/server/learning-v2/tutor/evaluation/diagnostic-probe-manifest.js'
import { claimDiagnosticProbe, runTutorDiagnosticProbe } from '../lib/server/learning-v2/tutor/evaluation/diagnostic-probe.js'

// No .env loading, no CLI credential, no opt-in activation, no paid-eval runner.
// Both files deliberately survive success, failure and restart. A missing result
// next to a claim is ambiguous consumption, NEVER permission for another call.
const directory = fileURLToPath(new URL('../docs/evaluation-results/', import.meta.url))
let resultHandle
try {
  const readiness = diagnosticProbeReadiness()
  if (!readiness.runnable) {
    console.log(JSON.stringify(readiness))
    process.exitCode = 1
  } else {
    const result = await runTutorDiagnosticProbe({ claim: async () => {
      await claimDiagnosticProbe(directory)
      resultHandle = await open(path.join(directory, 'tutor-paid-diagnostic-probe-v1.result.json'), 'wx', 0o600)
    } })
    if (resultHandle) {
      await resultHandle.writeFile(JSON.stringify({ manifest: TUTOR_DIAGNOSTIC_PROBE_MANIFEST, result }, null, 2) + '\n')
      await resultHandle.sync()
    }
    console.log(JSON.stringify(result))
    if (result.status !== 'PROBE_PASS') process.exitCode = 1
  }
} catch {
  // Never serialize caught errors, paths, HTTP envelopes or SDK objects.
  console.log(JSON.stringify({ status: 'PROBE_INCONCLUSIVE', reason_code: 'PROBE_ARTIFACT_OR_RUNNER_FAILURE', retry_authorized: false, raw_error_retained: false }))
  process.exitCode = 1
} finally { await resultHandle?.close() }
