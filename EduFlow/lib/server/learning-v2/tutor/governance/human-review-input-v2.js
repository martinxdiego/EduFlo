import { z } from 'zod'
import { TUTOR_HUMAN_REVIEW_PACKET_VERSION } from '../evaluation/human-review-packet.js'
import { TUTOR_HUMAN_REVIEW_SAMPLING_VERSION } from '../evaluation/human-review-sampling.js'
import { TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2 } from './human-review-rubric-v2.js'
import {
  TUTOR_HUMAN_REVIEWER_ROLE_V2,
  TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION_V2,
} from './human-review-workflow-v2.js'

export const TUTOR_HUMAN_REVIEW_INPUT_VERSION_V2 = 'tutor-human-review-quality-input-v2'

export const tutorHumanReviewInputV2Schema = z.object({
  input_contract_version: z.literal(TUTOR_HUMAN_REVIEW_INPUT_VERSION_V2),
  workflow_contract_version: z.literal(TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION_V2),
  rubric_version: z.literal(TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2),
  sampling_contract_version: z.literal(TUTOR_HUMAN_REVIEW_SAMPLING_VERSION),
  packet_contract_version: z.literal(TUTOR_HUMAN_REVIEW_PACKET_VERSION),
  required_reviewer_role: z.literal(TUTOR_HUMAN_REVIEWER_ROLE_V2),
  scope: z.literal('PAID_SYNTHETIC_EVALUATION_REVIEW_INPUT_ONLY'),
  synthetic_data_only: z.literal(true),
  review_status: z.literal('NOT_REVIEWED'),
  review_execution_authorized: z.literal(false),
  reviewer_ref: z.null(),
  review_ref: z.null(),
  approved_at: z.null(),
  raw_prompt_retained: z.literal(false),
  raw_provider_response_retained: z.literal(false),
  raw_rejected_provider_text_retained: z.literal(false),
  approval_effect: z.literal('NONE'),
  runtime_approval_effect: z.literal('NONE'),
  production_approval_effect: z.literal('NONE'),
  learning_authority: z.literal('NONE'),
  evidence_effect: z.literal('NONE'),
}).strict()

export const TUTOR_HUMAN_REVIEW_INPUT_V2 = Object.freeze(tutorHumanReviewInputV2Schema.parse({
  input_contract_version: TUTOR_HUMAN_REVIEW_INPUT_VERSION_V2,
  workflow_contract_version: TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION_V2,
  rubric_version: TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2,
  sampling_contract_version: TUTOR_HUMAN_REVIEW_SAMPLING_VERSION,
  packet_contract_version: TUTOR_HUMAN_REVIEW_PACKET_VERSION,
  required_reviewer_role: TUTOR_HUMAN_REVIEWER_ROLE_V2,
  scope: 'PAID_SYNTHETIC_EVALUATION_REVIEW_INPUT_ONLY',
  synthetic_data_only: true,
  review_status: 'NOT_REVIEWED',
  review_execution_authorized: false,
  reviewer_ref: null,
  review_ref: null,
  approved_at: null,
  raw_prompt_retained: false,
  raw_provider_response_retained: false,
  raw_rejected_provider_text_retained: false,
  approval_effect: 'NONE',
  runtime_approval_effect: 'NONE',
  production_approval_effect: 'NONE',
  learning_authority: 'NONE',
  evidence_effect: 'NONE',
}))
