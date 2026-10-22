import { z } from 'zod'
import {
  TUTOR_HUMAN_REVIEWER_ROLE,
  TUTOR_HUMAN_REVIEW_WORKFLOW_REF,
} from './human-review-workflow.js'
import {
  TUTOR_PROVIDER_TECHNICAL_FAILURE_CATEGORIES,
  TUTOR_QUALITY_DIMENSION_IDS,
  TUTOR_SAFETY_REJECTION_CATEGORIES,
} from './quality-policy.js'

export const TUTOR_HUMAN_REVIEW_INPUT_CONTRACT_VERSION = 'tutor-human-review-quality-input-v1'

const causeClassSchema = z.enum([
  'SAFETY_CANDIDATE_REJECTION',
  'PROVIDER_TECHNICAL_FAILURE',
])
const causeCodeSchema = z.enum([
  ...TUTOR_SAFETY_REJECTION_CATEGORIES,
  ...TUTOR_PROVIDER_TECHNICAL_FAILURE_CATEGORIES,
])
const dimensionSchema = z.enum(TUTOR_QUALITY_DIMENSION_IDS)

const boundedCauseSchema = z.object({
  classification: causeClassSchema,
  code: causeCodeSchema,
}).strict()

const reviewStratumSchema = z.object({
  final_source: z.enum(['PROVIDER_ACCEPTED', 'LOCAL_FALLBACK_ACCEPTED']),
  hint_level: z.number().int().min(1).max(3),
  fixture_task_category: z.string().trim().min(1).max(80).nullable(),
  bounded_cause: boundedCauseSchema.nullable(),
  evaluation_dimensions: z.array(dimensionSchema).min(1).max(TUTOR_QUALITY_DIMENSION_IDS.length),
  synthetic_case_refs: z.array(z.string().regex(/^tutor-synthetic-[0-9]{3}$/)).min(1).max(120),
}).strict().superRefine((value, context) => {
  if (new Set(value.evaluation_dimensions).size !== value.evaluation_dimensions.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Evaluation dimensions must be unique' })
  }
  if (new Set(value.synthetic_case_refs).size !== value.synthetic_case_refs.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Synthetic case references must be unique' })
  }
  if (value.final_source === 'PROVIDER_ACCEPTED' && value.bounded_cause !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Provider-accepted strata cannot invent a fallback cause' })
  }
  if (value.final_source === 'LOCAL_FALLBACK_ACCEPTED' && value.bounded_cause === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Local-fallback strata require a bounded cause' })
  }
  if (value.bounded_cause?.classification === 'SAFETY_CANDIDATE_REJECTION'
    && !TUTOR_SAFETY_REJECTION_CATEGORIES.includes(value.bounded_cause.code)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Safety cause code is outside the canonical safety taxonomy' })
  }
  if (value.bounded_cause?.classification === 'PROVIDER_TECHNICAL_FAILURE'
    && !TUTOR_PROVIDER_TECHNICAL_FAILURE_CATEGORIES.includes(value.bounded_cause.code)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Provider cause code is outside the provider failure taxonomy' })
  }
})

export const tutorHumanReviewInputPlanSchema = z.object({
  input_contract_version: z.literal(TUTOR_HUMAN_REVIEW_INPUT_CONTRACT_VERSION),
  workflow_ref: z.literal(TUTOR_HUMAN_REVIEW_WORKFLOW_REF),
  required_reviewer_role: z.literal(TUTOR_HUMAN_REVIEWER_ROLE),
  scope: z.literal('PAID_SYNTHETIC_EVALUATION_REVIEW_INPUT_ONLY'),
  source_run_manifest_version: z.string().trim().min(1).max(160),
  source_result_sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  synthetic_data_only: z.literal(true),
  sampling_method: z.literal('STRATIFIED'),
  strata: z.array(reviewStratumSchema).min(2).max(120),
  rejected_candidate_access: z.object({
    mode: z.literal('BOUNDED_METADATA_ONLY'),
    raw_provider_text_retained: z.literal(false),
    raw_provider_text_available: z.literal(false),
  }).strict(),
  raw_prompt_retained: z.literal(false),
  raw_provider_response_retained: z.literal(false),
  raw_rejected_provider_text_retained: z.literal(false),
  review_status: z.literal('NOT_REVIEWED'),
  review_execution_authorized: z.literal(false),
  approval_effect: z.literal('NONE'),
}).strict().superRefine((value, context) => {
  const sources = new Set(value.strata.map((stratum) => stratum.final_source))
  for (const source of ['PROVIDER_ACCEPTED', 'LOCAL_FALLBACK_ACCEPTED']) {
    if (!sources.has(source)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Missing required final-source stratum: ${source}` })
    }
  }
})

export const TUTOR_HUMAN_REVIEW_INPUT_CONTRACT = Object.freeze({
  input_contract_version: TUTOR_HUMAN_REVIEW_INPUT_CONTRACT_VERSION,
  workflow_ref: TUTOR_HUMAN_REVIEW_WORKFLOW_REF,
  required_reviewer_role: TUTOR_HUMAN_REVIEWER_ROLE,
  scope: 'PAID_SYNTHETIC_EVALUATION_REVIEW_INPUT_ONLY',
  sampling_method: 'STRATIFIED',
  required_final_sources: Object.freeze(['PROVIDER_ACCEPTED', 'LOCAL_FALLBACK_ACCEPTED']),
  stratification_dimensions: Object.freeze([
    Object.freeze({ identifier: 'HINT_LEVEL', source: 'fixture.level', availability: 'REQUIRED' }),
    Object.freeze({ identifier: 'FIXTURE_TASK_CATEGORY', source: 'fixture.subject', availability: 'WHEN_PRESENT' }),
    Object.freeze({ identifier: 'FINAL_SOURCE', source: 'final_outcome.status', availability: 'REQUIRED' }),
    Object.freeze({ identifier: 'BOUNDED_FALLBACK_REJECTION_CAUSE', source: 'provider_candidate.code', availability: 'WHEN_FALLBACK_USED' }),
    Object.freeze({ identifier: 'EVALUATION_DIMENSION', source: 'quality_policy.dimension', availability: 'REQUIRED' }),
  ]),
  rejected_candidate_access: Object.freeze({
    mode: 'BOUNDED_METADATA_ONLY',
    raw_provider_text_retained: false,
    raw_provider_text_available: false,
  }),
  review_execution_authorized: false,
  automated_evaluation_can_approve: false,
  approval_effect: 'NONE',
  learning_truth_effect: 'NONE',
})

export function validateTutorHumanReviewInputPlan(value) {
  const parsed = tutorHumanReviewInputPlanSchema.parse(value)
  for (const stratum of parsed.strata) {
    Object.freeze(stratum.synthetic_case_refs)
    Object.freeze(stratum.evaluation_dimensions)
    if (stratum.bounded_cause) Object.freeze(stratum.bounded_cause)
    Object.freeze(stratum)
  }
  Object.freeze(parsed.strata)
  Object.freeze(parsed.rejected_candidate_access)
  return Object.freeze(parsed)
}
