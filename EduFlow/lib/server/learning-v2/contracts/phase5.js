import { z } from 'zod'
import { objectiveReferenceSchema } from './phase1.js'

export const PHASE_5_SCHEMA_VERSION = 'learning-v2-phase5-v1'
export const RECOMMENDATION_RULE_SET_VERSION = 'recommendation-rules-development-v1'
export const RECOMMENDATION_POLICY_VERSION = 'teacher-intent-only-v1'
export const RECOMMENDATION_TYPES = Object.freeze(['TRY_SIMILAR', 'REVIEW_CONCEPT', 'TEACHER_INTERVENTION'])
export const RECOMMENDATION_STATUSES = Object.freeze(['presented', 'approved', 'dismissed', 'expired', 'superseded'])
// DEVELOPMENT OPERATIONAL FRESHNESS CONSTANT — not a pedagogical threshold.
export const RECOMMENDATION_FRESHNESS_MS = 24 * 60 * 60 * 1000
export const RECOMMENDATION_CALIBRATION = 'DEVELOPMENT / NOT EDUCATOR-CALIBRATED'
export const MAX_SUPPORTING_EVIDENCE_IDS = 100

const mutationFields = {
  schema_version: z.literal(PHASE_5_SCHEMA_VERSION),
  idempotency_key: z.string().trim().min(8).max(160),
}
export const recommendationEvaluationSchema = z.object({
  ...mutationFields,
  objective_ref: objectiveReferenceSchema.optional(),
}).strict()
export const recommendationApprovalSchema = z.object(mutationFields).strict()
export const recommendationDismissalSchema = z.object({
  ...mutationFields,
  dismissal_reason: z.enum(['not_now', 'teacher_selected_other_action', 'not_useful']).optional(),
}).strict()
