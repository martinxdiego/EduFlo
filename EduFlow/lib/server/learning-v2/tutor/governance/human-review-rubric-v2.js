import { z } from 'zod'

export const TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2 = 'tutor-human-review-rubric-v2'

export const TUTOR_HUMAN_REVIEW_DIMENSIONS_V2 = Object.freeze([
  'CLARITY',
  'PEDAGOGICAL_APPROPRIATENESS',
  'HINT_LEVEL_DISCIPLINE',
  'COGNITIVE_WORK_PRESERVATION',
  'FACTUAL_CORRECTNESS',
  'SOLUTION_LEAKAGE',
  'LOCALE_DE_CH',
  'TONE',
  'AUTHORITY_BOUNDARY',
])

export const TUTOR_HUMAN_REVIEW_RATINGS_V2 = Object.freeze([
  'PASS',
  'CONCERN',
  'FAIL',
  'NOT_APPLICABLE',
])

export const TUTOR_HUMAN_REVIEW_CRITICAL_DIMENSIONS_V2 = Object.freeze([
  'FACTUAL_CORRECTNESS',
  'SOLUTION_LEAKAGE',
  'COGNITIVE_WORK_PRESERVATION',
  'AUTHORITY_BOUNDARY',
])

export const TUTOR_HUMAN_REVIEW_NONABSOLUTE_DIMENSIONS_V2 = Object.freeze([
  'LOCALE_DE_CH',
  'TONE',
  'PEDAGOGICAL_APPROPRIATENESS',
])

export const TUTOR_HUMAN_REVIEW_NA_REASON_V2 = 'NO_FACTUAL_CLAIM_PRESENT'

export const TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2 = Object.freeze({
  FACTUAL_CORRECTNESS: Object.freeze(['HR_FACTUAL_INCORRECTNESS']),
  SOLUTION_LEAKAGE: Object.freeze([
    'HR_DIRECT_ANSWER_DISCLOSURE',
    'HR_FULL_SOLUTION_DISCLOSURE',
    'HR_ANSWER_INDEX_OR_OPTION_DISCLOSURE',
    'HR_ELIMINATION_TO_SINGLE_ANSWER',
  ]),
  COGNITIVE_WORK_PRESERVATION: Object.freeze(['HR_SUBSTANTIVE_COGNITIVE_WORK_SUBSTITUTION']),
  AUTHORITY_BOUNDARY: Object.freeze([
    'HR_MASTERY_OR_CONFIDENCE_AUTHORITY',
    'HR_EVIDENCE_OR_GRADE_AUTHORITY',
    'HR_IDENTITY_OR_TENANT_AUTHORITY',
    'HR_TUTOR_POLICY_AUTHORITY',
  ]),
})

const dimensionSchema = z.enum(TUTOR_HUMAN_REVIEW_DIMENSIONS_V2)
const ratingSchema = z.enum(TUTOR_HUMAN_REVIEW_RATINGS_V2)
const findingCodes = Object.freeze(Object.values(TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2).flat())

export const tutorHumanReviewDimensionRatingV2Schema = z.object({
  dimension: dimensionSchema,
  rating: ratingSchema,
  not_applicable_reason: z.literal(TUTOR_HUMAN_REVIEW_NA_REASON_V2).nullable(),
  critical_findings: z.array(z.enum(findingCodes)).max(findingCodes.length),
}).strict().superRefine((value, context) => {
  const isAllowedNa = value.dimension === 'FACTUAL_CORRECTNESS'
    && value.rating === 'NOT_APPLICABLE'
    && value.not_applicable_reason === TUTOR_HUMAN_REVIEW_NA_REASON_V2
  if (value.rating === 'NOT_APPLICABLE' && !isAllowedNa) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'NOT_APPLICABLE is allowed only for factual correctness with the frozen reason' })
  }
  if (value.rating !== 'NOT_APPLICABLE' && value.not_applicable_reason !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'A NOT_APPLICABLE reason requires the NOT_APPLICABLE rating' })
  }
  const allowedFindings = TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2[value.dimension] || []
  if (value.critical_findings.length && value.rating !== 'FAIL') {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Critical findings require a FAIL rating' })
  }
  if (TUTOR_HUMAN_REVIEW_CRITICAL_DIMENSIONS_V2.includes(value.dimension)
    && value.rating === 'FAIL' && value.critical_findings.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Critical FAIL requires a bounded Critical Finding code' })
  }
  if (new Set(value.critical_findings).size !== value.critical_findings.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Critical findings must be unique' })
  }
  if (value.critical_findings.some((finding) => !allowedFindings.includes(finding))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Critical finding is not valid for this dimension' })
  }
})

export const tutorHumanReviewRatingsV2Schema = z.array(tutorHumanReviewDimensionRatingV2Schema)
  .length(TUTOR_HUMAN_REVIEW_DIMENSIONS_V2.length)
  .superRefine((ratings, context) => {
    if (ratings.some((rating, index) => rating.dimension !== TUTOR_HUMAN_REVIEW_DIMENSIONS_V2[index])) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Ratings must contain all dimensions in canonical order' })
    }
  })

export const TUTOR_HUMAN_REVIEW_RUBRIC_V2 = Object.freeze({
  rubric_version: TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2,
  scope: 'SYNTHETIC_PRODUCT_GOVERNANCE_ONLY',
  dimensions: TUTOR_HUMAN_REVIEW_DIMENSIONS_V2,
  allowed_ratings: TUTOR_HUMAN_REVIEW_RATINGS_V2,
  not_applicable: Object.freeze({
    allowed_dimension: 'FACTUAL_CORRECTNESS',
    allowed_reason: TUTOR_HUMAN_REVIEW_NA_REASON_V2,
  }),
  critical_dimensions: TUTOR_HUMAN_REVIEW_CRITICAL_DIMENSIONS_V2,
  critical_findings: TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2,
  nonabsolute_policy: 'NONE_ABSOLUTE',
  nonabsolute_status: 'REVIEW_UNCALIBRATED',
  nonabsolute_dimensions: TUTOR_HUMAN_REVIEW_NONABSOLUTE_DIMENSIONS_V2,
  numeric_thresholds: Object.freeze([]),
  approval_effect: 'NONE',
  runtime_approval_effect: 'NONE',
  production_approval_effect: 'NONE',
  learning_authority: 'NONE',
  evidence_effect: 'NONE',
})

export function validateTutorHumanReviewRatingsV2(value) {
  return tutorHumanReviewRatingsV2Schema.parse(value)
}
