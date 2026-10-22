import { z } from 'zod'
import { TUTOR_ACTIONS } from '../../contracts/phase3.js'
import {
  TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2,
  TUTOR_HUMAN_REVIEW_DIMENSIONS_V2,
  TUTOR_HUMAN_REVIEW_NA_REASON_V2,
  TUTOR_HUMAN_REVIEW_RATINGS_V2,
  TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2,
} from './human-review-rubric-v2.js'

export const TUTOR_HUMAN_REVIEW_FIRST_PASS_PROJECTION_VERSION = 'tutor-human-review-first-pass-projection-v1'
export const TUTOR_HUMAN_REVIEW_SECOND_PASS_PROJECTION_VERSION = 'tutor-human-review-second-pass-projection-v1'

const identifierSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/)
const itemRefSchema = z.string().regex(/^hri-[0-9a-f]{64}$/)

function exactArraySchema(values) {
  return z.array(z.enum(values)).length(values.length).superRefine((items, context) => {
    if (items.some((item, index) => item !== values[index])) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Projection contract values must use canonical order' })
    }
  })
}

const criticalFindingsSchema = z.object({
  FACTUAL_CORRECTNESS: exactArraySchema(TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2.FACTUAL_CORRECTNESS),
  SOLUTION_LEAKAGE: exactArraySchema(TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2.SOLUTION_LEAKAGE),
  COGNITIVE_WORK_PRESERVATION: exactArraySchema(TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2.COGNITIVE_WORK_PRESERVATION),
  AUTHORITY_BOUNDARY: exactArraySchema(TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2.AUTHORITY_BOUNDARY),
}).strict()

const boundedText = (maximum) => z.string().min(1).max(maximum)
  .refine((value) => value === value.trim(), 'Projection text must already be canonically trimmed')
const learnerMessageSchema = boundedText(280)
  .refine((value) => value.length <= 280, 'Learner message exceeds the UTF-16 code-unit limit')
  .refine((value) => value.split(/\s+/u).length <= 60, 'Learner message exceeds the word limit')

export const tutorHumanReviewFirstPassProjectionSchema = z.object({
  projection_version: z.literal(TUTOR_HUMAN_REVIEW_FIRST_PASS_PROJECTION_VERSION),
  rubric_version: z.literal(TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2),
  review_ref: identifierSchema,
  review_item_ref: itemRefSchema,
  subject_category: boundedText(80),
  hint_level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  expected_tutor_action: z.enum(TUTOR_ACTIONS),
  synthetic_task_context: z.object({
    task: boundedText(1_500),
    options: z.array(boundedText(300)).min(1).max(8),
  }).strict(),
  final_learner_message: learnerMessageSchema,
  factual_leakage_review_view: z.object({
    synthetic_correct_answer_context: boundedText(300),
    permitted_dimensions: exactArraySchema(['FACTUAL_CORRECTNESS', 'SOLUTION_LEAKAGE']),
  }).strict(),
  dimensions: exactArraySchema(TUTOR_HUMAN_REVIEW_DIMENSIONS_V2),
  allowed_ratings: exactArraySchema(TUTOR_HUMAN_REVIEW_RATINGS_V2),
  not_applicable_rule: z.object({
    dimension: z.literal('FACTUAL_CORRECTNESS'),
    reason: z.literal(TUTOR_HUMAN_REVIEW_NA_REASON_V2),
  }).strict(),
  critical_findings: criticalFindingsSchema,
}).strict()

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

export function verifyTutorHumanReviewFirstPassProjection(value) {
  return deepFreeze(tutorHumanReviewFirstPassProjectionSchema.parse(value))
}

function repositoryAuthorityRequired() {
  const error = new TypeError('Projection requires an opaque Assignment Token resolved by the repository-backed Coordinator')
  error.code = 'REVIEW_AUTHORITY_INVALID'
  throw error
}

// Legacy direct constructors remain named so stale callers fail explicitly;
// the trusted Coordinator owns both projections and reads their source files.
export function createTutorHumanReviewFirstPassProjection() { return repositoryAuthorityRequired() }
export function createTutorHumanReviewSecondPassProjection() { return repositoryAuthorityRequired() }
