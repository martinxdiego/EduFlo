import { z } from 'zod'
import {
  TUTOR_PAID_EVALUATION_MANIFEST,
  tutorEvaluationManifestSchema,
} from './evaluation-manifest.js'
import { domainSeparatedJcsSha256 } from './human-review-canonical.js'
import { TUTOR_HUMAN_REVIEW_INPUT_VERSION_V2 } from '../governance/human-review-input-v2.js'
import { TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2 } from '../governance/human-review-rubric-v2.js'
import { TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION_V2 } from '../governance/human-review-workflow-v2.js'
import { TUTOR_HUMAN_REVIEW_SAMPLING_VERSION } from './human-review-sampling.js'
import { TUTOR_HUMAN_REVIEW_PACKET_VERSION } from './human-review-packet.js'
import { TUTOR_HUMAN_REVIEW_RECORD_VERSION } from '../governance/human-review-record-v1.js'
import { TUTOR_HUMAN_REVIEW_FIRST_PASS_PROJECTION_VERSION } from '../governance/human-review-projection-v1.js'

export const TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST_VERSION = 'tutor-paid-evaluation-v9'
export const TUTOR_REVIEW_CAPABLE_EVALUATOR_VERSION = 'tutor-paid-evaluator-v7'
export const TUTOR_REVIEW_CAPABLE_RESULT_CONTRACT_VERSION = 'tutor-paid-evaluation-result-v5'
export const TUTOR_REVIEW_CAPABLE_SCOPE_DOMAIN = 'EDUFLOW\0H14B\0REVIEW_CAPABLE_EVALUATION_SCOPE\0v1\0'

export const TUTOR_REVIEW_CAPTURE_SEMANTICS = Object.freeze({
  candidate_handling: 'CANONICAL_GATES_THEN_DISCARD_WHOLE_IF_REJECTED',
  rejected_provider_candidate_retained: false,
  raw_provider_response_retained: false,
  raw_prompt_retained: false,
  raw_provider_error_retained: false,
  fallback_handling: 'LOCAL_FALLBACK_THEN_CANONICAL_GATES',
  final_message_lifetime: 'TRANSIENT_UNTIL_COMPLETE_SAMPLE_AND_PACKET_PROJECTION',
  selected_final_messages_destination: TUTOR_HUMAN_REVIEW_PACKET_VERSION,
  non_selected_final_messages_retained: false,
  result_contract_retains_final_messages: false,
  historical_result_mutation: false,
})

const reviewCaptureSemanticsSchema = z.object({
  candidate_handling: z.literal('CANONICAL_GATES_THEN_DISCARD_WHOLE_IF_REJECTED'),
  rejected_provider_candidate_retained: z.literal(false),
  raw_provider_response_retained: z.literal(false),
  raw_prompt_retained: z.literal(false),
  raw_provider_error_retained: z.literal(false),
  fallback_handling: z.literal('LOCAL_FALLBACK_THEN_CANONICAL_GATES'),
  final_message_lifetime: z.literal('TRANSIENT_UNTIL_COMPLETE_SAMPLE_AND_PACKET_PROJECTION'),
  selected_final_messages_destination: z.literal(TUTOR_HUMAN_REVIEW_PACKET_VERSION),
  non_selected_final_messages_retained: z.literal(false),
  result_contract_retains_final_messages: z.literal(false),
  historical_result_mutation: z.literal(false),
}).strict()

const reviewGovernanceSchema = z.object({
  workflow_contract_version: z.literal(TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION_V2),
  input_contract_version: z.literal(TUTOR_HUMAN_REVIEW_INPUT_VERSION_V2),
  rubric_version: z.literal(TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2),
  sampling_contract_version: z.literal(TUTOR_HUMAN_REVIEW_SAMPLING_VERSION),
  packet_contract_version: z.literal(TUTOR_HUMAN_REVIEW_PACKET_VERSION),
  record_contract_version: z.literal(TUTOR_HUMAN_REVIEW_RECORD_VERSION),
  first_pass_projection_version: z.literal(TUTOR_HUMAN_REVIEW_FIRST_PASS_PROJECTION_VERSION),
  review_status: z.literal('NOT_REVIEWED'),
  review_execution_authorized: z.literal(false),
  reviewer_ref: z.null(),
  review_ref: z.null(),
  approved_at: z.null(),
  approval_effect: z.literal('NONE'),
  runtime_approval_effect: z.literal('NONE'),
  production_approval_effect: z.literal('NONE'),
  learning_authority: z.literal('NONE'),
  evidence_effect: z.literal('NONE'),
}).strict()

export const tutorReviewCapableEvaluationManifestSchema = tutorEvaluationManifestSchema.omit({ human_review: true }).extend({
  eval_manifest_version: z.literal(TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST_VERSION),
  evaluator_version: z.literal(TUTOR_REVIEW_CAPABLE_EVALUATOR_VERSION),
  result_contract_version: z.literal(TUTOR_REVIEW_CAPABLE_RESULT_CONTRACT_VERSION),
  supersedes_manifest_version: z.literal('tutor-paid-evaluation-v8'),
  revision_reason: z.literal('HUMAN_REVIEW_CAPTURE_FRAMEWORK'),
  accounting_contract_version: z.literal('tutor-paid-evaluation-accounting-v1'),
  canonical_safety_contract_version: z.literal('tutor-canonical-safety-gates-v1'),
  fixture_set_version: z.literal('tutor-synthetic-fixtures-v1'),
  fixture_set_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  fixture_count: z.literal(120),
  repetition_count: z.literal(1),
  provider_id: z.literal('openai'),
  model_id: z.literal('gpt-5.6-terra'),
  prompt_version: z.literal('tutor-guidance-v3'),
  prompt_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  schema_version: z.literal('tutor-provider-response-v1'),
  max_http_calls: z.literal(120),
  max_input_tokens: z.literal(4_800_000),
  max_output_tokens: z.literal(19_200),
  max_total_tokens: z.literal(4_819_200),
  max_input_tokens_per_call: z.literal(40_000),
  max_output_tokens_per_call: z.literal(160),
  max_cost: z.literal(10),
  currency: z.literal('USD'),
  evaluation_authorization: z.object({
    scope: z.literal('SYNTHETIC_EVALUATION_CONFIGURATION_ONLY'),
    status: z.literal('NOT_AUTHORIZED'),
    synthetic_data_only: z.literal(true),
    runtime_approval_effect: z.literal('NONE'),
  }).strict(),
  review_capture: z.object({
    semantics: z.literal('POST_CANONICAL_PASS_SELECTED_MESSAGES_ONLY'),
    capture_contract: reviewCaptureSemanticsSchema,
    governance: reviewGovernanceSchema,
  }).strict(),
  scope_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
}).strict()

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

const withoutFingerprint = {
  ...TUTOR_PAID_EVALUATION_MANIFEST,
  eval_manifest_version: TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST_VERSION,
  evaluator_version: TUTOR_REVIEW_CAPABLE_EVALUATOR_VERSION,
  result_contract_version: TUTOR_REVIEW_CAPABLE_RESULT_CONTRACT_VERSION,
  supersedes_manifest_version: 'tutor-paid-evaluation-v8',
  revision_reason: 'HUMAN_REVIEW_CAPTURE_FRAMEWORK',
  human_review: undefined,
  evaluation_authorization: {
    scope: 'SYNTHETIC_EVALUATION_CONFIGURATION_ONLY',
    status: 'NOT_AUTHORIZED',
    synthetic_data_only: true,
    runtime_approval_effect: 'NONE',
  },
  review_capture: {
    semantics: 'POST_CANONICAL_PASS_SELECTED_MESSAGES_ONLY',
    capture_contract: TUTOR_REVIEW_CAPTURE_SEMANTICS,
    governance: {
      workflow_contract_version: TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION_V2,
      input_contract_version: TUTOR_HUMAN_REVIEW_INPUT_VERSION_V2,
      rubric_version: TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2,
      sampling_contract_version: TUTOR_HUMAN_REVIEW_SAMPLING_VERSION,
      packet_contract_version: TUTOR_HUMAN_REVIEW_PACKET_VERSION,
      record_contract_version: TUTOR_HUMAN_REVIEW_RECORD_VERSION,
      first_pass_projection_version: TUTOR_HUMAN_REVIEW_FIRST_PASS_PROJECTION_VERSION,
      review_status: 'NOT_REVIEWED',
      review_execution_authorized: false,
      reviewer_ref: null,
      review_ref: null,
      approved_at: null,
      approval_effect: 'NONE',
      runtime_approval_effect: 'NONE',
      production_approval_effect: 'NONE',
      learning_authority: 'NONE',
      evidence_effect: 'NONE',
    },
  },
}
delete withoutFingerprint.human_review

export const TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST = deepFreeze(tutorReviewCapableEvaluationManifestSchema.parse({
  ...withoutFingerprint,
  scope_fingerprint: domainSeparatedJcsSha256(TUTOR_REVIEW_CAPABLE_SCOPE_DOMAIN, withoutFingerprint),
}))

export const TUTOR_REVIEW_CAPABLE_RESULT_CONTRACT = Object.freeze({
  result_contract_version: TUTOR_REVIEW_CAPABLE_RESULT_CONTRACT_VERSION,
  evaluator_version: TUTOR_REVIEW_CAPABLE_EVALUATOR_VERSION,
  source_manifest_version: TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST_VERSION,
  preserves_v8_safety_accounting_provider_contracts: true,
  final_message_storage: 'REVIEW_PACKET_ONLY_AFTER_COMPLETE_SAMPLE',
  raw_provider_response_retained: false,
  rejected_provider_candidate_retained: false,
  non_selected_final_messages_retained: false,
  automated_evaluation_can_authorize_review: false,
  automated_evaluation_can_approve_runtime: false,
  approval_effect: 'NONE',
  runtime_approval_effect: 'NONE',
  production_approval_effect: 'NONE',
  learning_authority: 'NONE',
  evidence_effect: 'NONE',
})
