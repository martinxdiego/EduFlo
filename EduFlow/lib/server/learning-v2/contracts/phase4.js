import { z } from 'zod'
import { competencyIdSchema, evidenceIdSchema, objectiveIdSchema, taskIdSchema } from './ids.js'

export const PHASE_4_SCHEMA_VERSION = 'learning-v2-phase4-v1'
export const TEACHER_EVIDENCE_POLICY_VERSION = 'evidence-policy-v3-teacher-development'
export const TEACHER_PRODUCER_VERSION = 'teacher-evidence-rules-v1'
export const TEACHER_ALGORITHM_VERSION = 'weighted-evidence-v1.1.0'
export const TEACHER_COEFFICIENT_SET_VERSION = 'weighted-evidence-development-v2-teacher'
export const TEACHER_CALIBRATION_STATUS = 'DEVELOPMENT / NOT EDUCATOR-CALIBRATED'
export const TEACHER_ONLY_CONFIDENCE_CAP = 0.60

export const TEACHER_ASSESSMENT_CLAIMS = Object.freeze(['supports', 'challenges', 'no_demonstration'])
export const TEACHER_ASSESSMENT_BASES = Object.freeze([
  'single_observation',
  'repeated_observation',
  'reviewed_work_sample',
  'structured_assessment',
])
export const TEACHER_EVIDENCE_WEIGHTS = Object.freeze({
  single_observation: 0.75,
  repeated_observation: 1.00,
  reviewed_work_sample: 1.00,
  structured_assessment: 1.25,
  no_demonstration: 0.00,
})

export const AUTOMATIC_INVALIDATION_REASONS = Object.freeze([
  'grading_error',
  'wrong_target_mapping',
  'invalid_source',
  'duplicate_or_corrupt_source',
])
export const ASSISTED_INVALIDATION_REASONS = Object.freeze([
  ...AUTOMATIC_INVALIDATION_REASONS,
  'invalid_tutor_linkage',
  'incorrect_assistance_source',
])
export const SUPPORT_INVALIDATION_REASONS = Object.freeze([
  'wrong_target_mapping',
  'invalid_source',
  'duplicate_or_corrupt_source',
  'invalid_tutor_linkage',
])
export const TEACHER_INVALIDATION_REASONS = Object.freeze([
  'entered_in_error',
  'replaced_by_corrected_assessment',
])
export const ALL_INVALIDATION_REASONS = Object.freeze([...new Set([
  ...ASSISTED_INVALIDATION_REASONS,
  ...SUPPORT_INVALIDATION_REASONS,
  ...TEACHER_INVALIDATION_REASONS,
])])

const versionSchema = z.number().int().min(1).max(1_000_000)
const noteSchema = z.string().trim().max(500)
const idempotencySchema = z.string().trim().min(8).max(160)

export const teacherAssessmentRequestSchema = z.object({
  schema_version: z.literal(PHASE_4_SCHEMA_VERSION),
  competency_id: competencyIdSchema,
  objective_id: objectiveIdSchema,
  objective_version: versionSchema,
  claim: z.enum(TEACHER_ASSESSMENT_CLAIMS),
  basis: z.enum(TEACHER_ASSESSMENT_BASES),
  observed_at: z.string().datetime({ offset: true }),
  reason: z.enum(['direct_observation', 'work_review', 'oral_check', 'structured_check']),
  note: noteSchema.optional(),
  task_ref: z.object({ task_id: taskIdSchema, version: versionSchema }).strict().optional(),
  replaces_evidence_id: evidenceIdSchema.optional(),
  correction_note: noteSchema.optional(),
  idempotency_key: idempotencySchema,
}).strict()

export const teacherInvalidationRequestSchema = z.object({
  schema_version: z.literal(PHASE_4_SCHEMA_VERSION),
  reason: z.enum(ALL_INVALIDATION_REASONS),
  note: noteSchema.optional(),
  idempotency_key: idempotencySchema,
}).strict()

export const teacherEvidenceQuerySchema = z.object({
  filter: z.enum(['all', 'independent', 'assisted', 'teacher', 'invalidated']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).max(1_000).optional(),
  evidence_id: evidenceIdSchema.optional(),
}).strict()

export function teacherEvidenceWeight(evidence) {
  if (evidence?.type !== 'teacher_assessment' || evidence?.claim?.result === 'no_demonstration') return 0
  return TEACHER_EVIDENCE_WEIGHTS[evidence.assessment_basis] ?? 0
}

export function responseModalityForTeacherBasis(basis) {
  if (basis === 'reviewed_work_sample') return 'reviewed_work_sample'
  if (basis === 'structured_assessment') return 'structured_assessment'
  return 'teacher_observation'
}
