import { open } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  promptV3Fixture006ProbeReadiness,
  TUTOR_PROMPT_V3_FIXTURE_006_PROBE_MANIFEST,
} from '../lib/server/learning-v2/tutor/evaluation/prompt-v3-fixture-006-probe-manifest.js'
import {
  claimPromptV3Fixture006Probe,
  PROMPT_V3_FIXTURE_006_PROBE_RESULT_FILENAME,
  runPromptV3Fixture006Probe,
} from '../lib/server/learning-v2/tutor/evaluation/prompt-v3-fixture-006-probe.js'

// No .env loading, CLI credential or implicit opt-in activation. Both artifacts
// are create-once. An absent result beside a claim never authorizes another call.
const directory = fileURLToPath(new URL('../docs/evaluation-results/', import.meta.url))
let resultHandle
try {
  const readiness = promptV3Fixture006ProbeReadiness()
  if (!readiness.runnable) {
    console.log(JSON.stringify({
      status: 'BLOCKED', comparison_outcome: 'PROBE_BLOCKED', recommendation: 'INSUFFICIENT_EVIDENCE',
      reason_code: readiness.reason_code, claim_created: false, http_calls: 0,
      raw_error_retained: false, retry_authorized: false,
    }))
    process.exitCode = 1
  } else {
    const probe = await runPromptV3Fixture006Probe({
      claim: async () => {
        await claimPromptV3Fixture006Probe(directory)
        resultHandle = await open(path.join(directory, PROMPT_V3_FIXTURE_006_PROBE_RESULT_FILENAME), 'wx', 0o600)
      },
    })
    if (resultHandle) {
      await resultHandle.writeFile(JSON.stringify({
        manifest: TUTOR_PROMPT_V3_FIXTURE_006_PROBE_MANIFEST,
        result: probe,
      }, null, 2) + '\n')
      await resultHandle.sync()
    }
    console.log(JSON.stringify({
      probe_manifest_version: probe.probe_manifest_version,
      probe_contract_hash: probe.probe_contract_hash,
      status: probe.status,
      comparison_outcome: probe.comparison_outcome,
      recommendation: probe.recommendation,
      reason_code: probe.reason_code,
      claim_created: probe.claim_created,
      fixture_id: probe.fixture_id,
      http_calls: probe.http_calls,
      retries: probe.retries,
      provider_failures: probe.provider_failures,
      provider_timeouts: probe.provider_timeouts,
      input_tokens: probe.usage?.input_tokens ?? null,
      output_tokens: probe.usage?.output_tokens ?? null,
      total_tokens: probe.usage?.total_tokens ?? null,
      actual_cost: probe.actual_cost,
      remaining_budget: probe.remaining_budget,
      currency: probe.currency,
      gate_results: probe.gate_results,
      leakage_evidence: probe.leakage_evidence,
      raw_error_retained: false,
      retry_authorized: false,
    }))
    if (probe.status !== 'PROBE_PASS') process.exitCode = 1
  }
} catch {
  if (resultHandle) {
    await resultHandle.writeFile(JSON.stringify({
      manifest: TUTOR_PROMPT_V3_FIXTURE_006_PROBE_MANIFEST,
      result: {
        probe_manifest_version: TUTOR_PROMPT_V3_FIXTURE_006_PROBE_MANIFEST.probe_manifest_version,
        status: 'BLOCKED',
        comparison_outcome: 'PROBE_BLOCKED',
        recommendation: 'INSUFFICIENT_EVIDENCE',
        reason_code: 'PROBE_ARTIFACT_OR_RUNNER_FAILURE',
        retry_authorized: false,
        raw_error_retained: false,
      },
    }, null, 2) + '\n').catch(() => {})
    await resultHandle.sync().catch(() => {})
  }
  console.log(JSON.stringify({
    status: 'BLOCKED', comparison_outcome: 'PROBE_BLOCKED', recommendation: 'INSUFFICIENT_EVIDENCE',
    reason_code: 'PROBE_ARTIFACT_OR_RUNNER_FAILURE', retry_authorized: false, raw_error_retained: false,
  }))
  process.exitCode = 1
} finally {
  await resultHandle?.close()
}
