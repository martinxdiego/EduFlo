import { z } from 'zod'

export const TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION = 'tutor-human-review-workflow-v1'
export const TUTOR_HUMAN_REVIEW_WORKFLOW_REF = 'tutor-paid-evaluation-human-review-v1'
export const TUTOR_HUMAN_REVIEWER_ROLE = 'EDUFLOW_PEDAGOGICAL_REVIEWER'
export const TUTOR_HUMAN_REVIEW_RUBRIC_REF = 'tutor-human-review-rubric-v1'
export const TUTOR_HUMAN_REVIEW_CRITERIA = Object.freeze([
  'clarity',
  'pedagogical_appropriateness',
  'hint_level_discipline',
  'cognitive_work_preservation',
  'factual_correctness',
  'no_solution_leakage',
  'locale_and_tone',
])

export const tutorHumanReviewWorkflowSchema = z.object({
  workflow_contract_version: z.literal(TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION),
  workflow_ref: z.literal(TUTOR_HUMAN_REVIEW_WORKFLOW_REF),
  scope: z.literal('PAID_SYNTHETIC_EVALUATION_REVIEW_ONLY'),
  required_reviewer_role: z.literal(TUTOR_HUMAN_REVIEWER_ROLE),
  rubric_ref: z.literal(TUTOR_HUMAN_REVIEW_RUBRIC_REF),
  criteria: z.array(z.enum(TUTOR_HUMAN_REVIEW_CRITERIA)).length(7),
  review_record_requirements: z.object({
    reviewer_ref_required: z.literal(true),
    review_ref_required: z.literal(true),
    reviewer_role_must_match: z.literal(TUTOR_HUMAN_REVIEWER_ROLE),
    allowed_review_statuses: z.tuple([z.literal('APPROVED'), z.literal('REJECTED')]),
  }).strict(),
  automated_evaluation_can_approve: z.literal(false),
  runtime_approval_effect: z.literal('NONE'),
}).strict()

const parsedWorkflow = tutorHumanReviewWorkflowSchema.parse({
  workflow_contract_version: TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION,
  workflow_ref: TUTOR_HUMAN_REVIEW_WORKFLOW_REF,
  scope: 'PAID_SYNTHETIC_EVALUATION_REVIEW_ONLY',
  required_reviewer_role: TUTOR_HUMAN_REVIEWER_ROLE,
  rubric_ref: TUTOR_HUMAN_REVIEW_RUBRIC_REF,
  criteria: TUTOR_HUMAN_REVIEW_CRITERIA,
  review_record_requirements: {
    reviewer_ref_required: true,
    review_ref_required: true,
    reviewer_role_must_match: TUTOR_HUMAN_REVIEWER_ROLE,
    allowed_review_statuses: ['APPROVED', 'REJECTED'],
  },
  automated_evaluation_can_approve: false,
  runtime_approval_effect: 'NONE',
})
Object.freeze(parsedWorkflow.criteria)
Object.freeze(parsedWorkflow.review_record_requirements.allowed_review_statuses)
Object.freeze(parsedWorkflow.review_record_requirements)
export const TUTOR_HUMAN_REVIEW_WORKFLOW = Object.freeze(parsedWorkflow)
