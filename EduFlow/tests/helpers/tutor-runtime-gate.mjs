import assert from 'node:assert/strict'
import { TUTOR_RUNTIME_APPROVAL_CONTRACT } from '../../lib/server/learning-v2/tutor/governance/runtime-approval.js'

export function allowTutorProviderForTest() {
  const configuration = Object.freeze({
    provider: TUTOR_RUNTIME_APPROVAL_CONTRACT.provider_id,
    model: TUTOR_RUNTIME_APPROVAL_CONTRACT.model_id,
    prompt_version: TUTOR_RUNTIME_APPROVAL_CONTRACT.prompt_version,
    structured_output_schema_version: TUTOR_RUNTIME_APPROVAL_CONTRACT.structured_output_schema_version,
    approval_ref: TUTOR_RUNTIME_APPROVAL_CONTRACT.approval_ref,
  })
  return Object.freeze({
    configuration: () => configuration,
    evaluate(candidate) {
      assert.deepEqual(candidate, configuration)
      return Object.freeze({ allowed: true, approvalRef: configuration.approval_ref, test_seam: true })
    },
  })
}
