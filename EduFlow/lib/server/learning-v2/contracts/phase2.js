import { z } from 'zod'
import {
  attemptIdSchema,
  competencyIdSchema,
  evidenceIdSchema,
  frameworkIdSchema,
  objectiveIdSchema,
  taskIdSchema,
  tenantIdSchema,
  tutorSessionIdSchema,
  worksheetQuestionIdSchema,
} from './ids.js'
import { internalActorIdSchema } from './schemas.js'
import {
  TEACHER_ALGORITHM_VERSION,
  TEACHER_ASSESSMENT_BASES,
  TEACHER_ASSESSMENT_CLAIMS,
  TEACHER_CALIBRATION_STATUS,
  TEACHER_COEFFICIENT_SET_VERSION,
  TEACHER_EVIDENCE_POLICY_VERSION,
  TEACHER_EVIDENCE_WEIGHTS,
  TEACHER_PRODUCER_VERSION,
} from './phase4.js'

export const PHASE_2_SCHEMA_VERSION = 'learning-v2-phase2-v1'
export const ATTEMPT_SCHEMA_VERSION = 'learning-attempt-v1'
export const EVIDENCE_SCHEMA_VERSION = 'evidence-event-v1'
export const LEARNING_EVENT_SCHEMA_VERSION = 'learning-event-v1'
export const KNOWLEDGE_STATE_SCHEMA_VERSION = 'student-knowledge-state-v1'
export const EXPLANATION_SCHEMA_VERSION = 'knowledge-state-explanation-v1'
export const EVIDENCE_POLICY_VERSION = 'evidence-policy-v1'
export const DETERMINISTIC_GRADER_VERSION = 'legacy-deterministic-exact-v1'
export const GRADING_REVISION = 1

export const PHASE_2_COEFFICIENTS = Object.freeze({
  algorithm: 'weighted-evidence-v1',
  algorithm_version: 'weighted-evidence-v1.0.0',
  coefficient_set_version: 'weighted-evidence-development-v1',
  calibration_status: 'DEVELOPMENT / NOT EDUCATOR-CALIBRATED',
  neutral_prior_mastery: 0.5,
  neutral_prior_weight: 2,
  eligible_selected_response_weight: 0.75,
  recent_evidence_days: 90,
  confidence_volume_rate: 0.18,
  confidence_volume_ceiling: 0.75,
  independent_bonus: 0.07,
  recent_bonus: 0.05,
  distinct_task_bonus: 0.10,
  mixed_outcome_bonus: 0.05,
  one_task_cap: 0.40,
  selected_response_only_cap: 0.70,
  absolute_confidence_cap: 0.95,
  secure_mastery_threshold: 0.80,
  secure_confidence_threshold: 0.70,
})

export const PHASE_2_SKIP_REASONS = Object.freeze([
  'FEATURE_DISABLED',
  'ASSIGNMENT_NOT_BOUND',
  'UNAUTHENTICATED_STUDENT',
  'TENANT_MISMATCH',
  'INVALID_INTENT',
  'STALE_ATTEMPT_SLOT',
  'UNPINNED_QUESTION',
  'STALE_SOURCE',
  'TASK_NOT_PUBLISHED',
  'TASK_NOT_ELIGIBLE',
  'QUESTION_NOT_ELIGIBLE',
  'UNANSWERED_NO_DEMONSTRATION',
  'NON_DETERMINISTIC_RESULT',
  'TEACHER_OVERRIDE',
  'MANUAL_REVIEW',
])

const versionSchema = z.number().int().min(1).max(1_000_000)
const sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/)

export const assignmentTaskPinRequestSchema = z.object({
  question_id: worksheetQuestionIdSchema,
  task_id: taskIdSchema,
  task_version: versionSchema,
}).strict()

export const bindAssignmentRequestSchema = z.object({
  schema_version: z.literal(PHASE_2_SCHEMA_VERSION),
  task_pins: z.array(assignmentTaskPinRequestSchema).min(1).max(200),
}).strict()

export const assignmentTaskPinSchema = assignmentTaskPinRequestSchema.extend({
  worksheet_id: internalActorIdSchema,
  content_hash: sha256Schema,
  hash_version: z.literal('worksheet-question-sha256-v1'),
}).strict()

export const assignmentLearningV2BindingSchema = z.object({
  enabled: z.literal(true),
  schema_version: z.literal(PHASE_2_SCHEMA_VERSION),
  tenant_id: tenantIdSchema,
  task_pins: z.array(assignmentTaskPinSchema).min(1).max(200),
  bound_by: internalActorIdSchema,
  bound_at: z.date(),
}).strict()

export const attemptDocumentSchema = z.object({
  attempt_id: attemptIdSchema,
  schema_version: z.literal(ATTEMPT_SCHEMA_VERSION),
  tenant_id: tenantIdSchema,
  student_id: internalActorIdSchema,
  task_ref: z.object({ task_id: taskIdSchema, version: versionSchema }).strict(),
  objective_ref: z.object({ objective_id: objectiveIdSchema, version: versionSchema }).strict(),
  primary_competency_ref: z.object({
    competency_id: competencyIdSchema,
    framework_id: frameworkIdSchema,
    framework_version: z.string().trim().min(1).max(160),
  }).strict(),
  supporting_competency_refs: z.array(z.object({
    competency_id: competencyIdSchema,
    framework_id: frameworkIdSchema,
    framework_version: z.string().trim().min(1).max(160),
    role: z.literal('supporting'),
  }).strict()).max(15),
  source: z.object({
    kind: z.enum(['legacy_submission_question', 'tutor_retry']),
    submission_id: internalActorIdSchema,
    submission_intent_id: z.string().trim().min(1).max(160),
    assignment_id: internalActorIdSchema,
    worksheet_id: internalActorIdSchema,
    question_id: worksheetQuestionIdSchema,
    question_index: z.number().int().min(0).max(1_000),
    source_revision: z.number().int().min(1),
    content_hash: sha256Schema,
    hash_version: z.literal('worksheet-question-sha256-v1'),
    grading_revision: versionSchema,
    learning_v2_attempt_no: versionSchema,
    tutor_session_id: z.string().regex(/^ses_/).optional(),
    hint_level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  }).strict(),
  answer: z.object({ type: z.literal('selected_response'), value: z.string().max(4_000), format_version: z.literal(1) }).strict(),
  outcome: z.object({
    correctness: z.enum(['correct', 'incorrect']),
    score: z.union([z.literal(0), z.literal(1)]),
    points_awarded: z.number().finite().min(0),
    max_points: z.number().finite().positive(),
    grader: z.literal('deterministic'),
    grader_version: z.literal(DETERMINISTIC_GRADER_VERSION),
  }).strict(),
  independence: z.object({
    level: z.enum(['independent', 'lightly_supported', 'supported']),
    assistance_source: z.enum(['none', 'tutor_hint']),
  }).strict(),
  attempt_no: versionSchema,
  numbering_scope: z.enum(['assignment_independent', 'tutor_session_hint_level']).optional(),
  submitted_at: z.date(),
  server_received_at: z.date(),
  duration_ms: z.number().int().min(0).max(7 * 24 * 60 * 60 * 1_000).optional(),
  status: z.literal('active'),
  idempotency_key: z.string().min(1).max(200),
  created_at: z.date(),
}).strict()

export const evidenceDocumentSchema = z.object({
  evidence_id: evidenceIdSchema,
  schema_version: z.literal(EVIDENCE_SCHEMA_VERSION),
  tenant_id: tenantIdSchema,
  student_id: internalActorIdSchema,
  type: z.enum(['correct_answer', 'incorrect_answer', 'correct_after_hint', 'support_required', 'teacher_assessment']),
  target: z.object({
    competency_id: competencyIdSchema,
    framework_id: frameworkIdSchema,
    framework_version: z.string().trim().min(1).max(160),
    objective_id: objectiveIdSchema,
    objective_version: versionSchema,
    dimension: z.literal('application'),
  }).strict(),
  claim: z.object({ result: z.enum(['supports', 'challenges', 'neutral', ...TEACHER_ASSESSMENT_CLAIMS]) }).strict(),
  independence: z.object({ level: z.enum(['independent', 'lightly_supported', 'supported', 'teacher_assessment']) }).strict(),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('attempt'), source_id: attemptIdSchema, task_id: taskIdSchema, task_version: versionSchema }).strict(),
    z.object({
      kind: z.literal('teacher_assessment'), source_id: internalActorIdSchema,
      task_id: taskIdSchema.nullable(), task_version: versionSchema.nullable(),
    }).strict(),
  ]),
  provenance: z.object({
    producer: z.enum(['evidence-rules', 'tutor-evidence-rules', 'teacher-evidence-rules']),
    producer_version: z.enum(['evidence-rules-v1', 'tutor-evidence-rules-v1', TEACHER_PRODUCER_VERSION]),
    evidence_policy_version: z.enum([EVIDENCE_POLICY_VERSION, 'evidence-policy-v2-development', TEACHER_EVIDENCE_POLICY_VERSION]),
    grader_version: z.literal(DETERMINISTIC_GRADER_VERSION).nullable(),
    created_by: internalActorIdSchema.optional(),
  }).strict(),
  quality: z.object({
    source_confidence: z.literal(1),
    mapping_confidence: z.literal(1),
    classification_confidence: z.literal(1),
    historic: z.literal(false),
  }).strict(),
  response_modality: z.enum(['selected_response', 'teacher_observation', 'reviewed_work_sample', 'structured_assessment']),
  tutor_weight: z.union([z.literal(0.60), z.literal(0.45), z.literal(0.30), z.literal(0)]).optional(),
  tutor_terminal_slot: tutorSessionIdSchema.optional(),
  hint_level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  assessment_basis: z.enum(TEACHER_ASSESSMENT_BASES).optional(),
  teacher_weight: z.union([
    z.literal(TEACHER_EVIDENCE_WEIGHTS.single_observation),
    z.literal(TEACHER_EVIDENCE_WEIGHTS.repeated_observation),
    z.literal(TEACHER_EVIDENCE_WEIGHTS.reviewed_work_sample),
    z.literal(TEACHER_EVIDENCE_WEIGHTS.structured_assessment),
    z.literal(TEACHER_EVIDENCE_WEIGHTS.no_demonstration),
  ]).optional(),
  assessment_reason: z.enum(['direct_observation', 'work_review', 'oral_check', 'structured_check']).optional(),
  teacher_note: z.string().trim().max(500).optional(),
  supersedes_evidence_id: evidenceIdSchema.optional(),
  occurred_at: z.date(),
  recorded_at: z.date(),
  status: z.enum(['active', 'invalidated']),
  invalidation: z.object({
    reason: z.string().min(1).max(240), invalidated_at: z.date(), invalidated_by: internalActorIdSchema,
    note: z.string().trim().max(500).optional(), idempotency_key: z.string().min(1).max(200).optional(),
    replacement_evidence_id: evidenceIdSchema.optional(),
    replacement_request_hash: z.string().min(1).max(200).optional(),
  }).strict().optional(),
  idempotency_key: z.string().min(1).max(200),
}).strict()

export const learningEventDocumentSchema = z.object({
  event_id: z.string().regex(/^evt_/),
  event_schema_version: z.literal(LEARNING_EVENT_SCHEMA_VERSION),
  tenant_id: tenantIdSchema,
  aggregate: z.object({ type: z.enum(['legacy_submission', 'attempt', 'evidence', 'student_competency', 'tutor_session']), id: z.string().min(1).max(240) }).strict(),
  sequence: z.number().int().min(1).optional(),
  type: z.enum(['LEGACY_SUBMISSION_GRADED', 'ATTEMPT_RECORDED', 'EVIDENCE_RECORDED', 'EVIDENCE_INVALIDATED', 'KNOWLEDGE_STATE_UPDATED', 'TUTOR_SESSION_STARTED', 'HINT_REQUESTED', 'TUTOR_DECIDED', 'HINT_GIVEN', 'RETRY_SUBMITTED', 'TUTOR_FALLBACK', 'REFLECTION_REQUESTED', 'REFLECTION_SUBMITTED', 'TUTOR_SESSION_COMPLETED', 'TEACHER_ASSESSMENT_RECORDED', 'TEACHER_ASSESSMENT_REPLACED']),
  occurred_at: z.date(),
  recorded_at: z.date(),
  actor: z.object({ kind: z.enum(['student', 'teacher', 'system']), id: z.string().min(1).max(160) }).strict(),
  correlation_id: z.string().min(1).max(240),
  causation_id: z.string().max(240).nullable(),
  payload: z.record(z.unknown()),
  idempotency_key: z.string().min(1).max(200),
}).strict()

export const knowledgeStateDocumentSchema = z.object({
  schema_version: z.literal(KNOWLEDGE_STATE_SCHEMA_VERSION),
  tenant_id: tenantIdSchema,
  student_id: internalActorIdSchema,
  competency_id: competencyIdSchema,
  framework_id: frameworkIdSchema,
  framework_version: z.string().trim().min(1).max(160),
  mastery: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  band: z.enum(['not_yet_demonstrated', 'difficulty_signal', 'developing', 'demonstrated', 'appears_strong', 'secure']),
  qualifier: z.string().min(1).max(100),
  evidence_count: z.number().int().min(0),
  weighted_evidence_volume: z.number().min(0),
  positive_count: z.number().int().min(0),
  negative_count: z.number().int().min(0),
  distinct_task_count: z.number().int().min(0),
  distinct_modality_count: z.number().int().min(0),
  distinct_producer_count: z.number().int().min(0),
  last_evidence_at: z.date().nullable(),
  last_correct_independent_at: z.date().nullable(),
  last_incorrect_independent_at: z.date().nullable(),
  limitations: z.array(z.string().min(1).max(100)).max(20),
  reason_codes: z.array(z.string().min(1).max(160)).max(30),
  confidence_caps: z.array(z.object({ code: z.string().min(1).max(100), value: z.number().min(0).max(1) }).strict()).max(10),
  projection: z.object({
    configuration_id: z.enum(['selected-response-v1', 'teacher-assessment-v1']).optional(),
    policy_version: z.enum(['weighted-evidence-policy-v1', 'weighted-evidence-policy-v1-teacher']).optional(),
    as_of: z.date().optional(),
    source_revision: z.number().int().nonnegative().optional(),
    algorithm: z.literal(PHASE_2_COEFFICIENTS.algorithm),
    algorithm_version: z.enum([PHASE_2_COEFFICIENTS.algorithm_version, TEACHER_ALGORITHM_VERSION]),
    coefficient_set_version: z.enum([PHASE_2_COEFFICIENTS.coefficient_set_version, TEACHER_COEFFICIENT_SET_VERSION]),
    calibration_status: z.enum([PHASE_2_COEFFICIENTS.calibration_status, TEACHER_CALIBRATION_STATUS]),
    input_set_hash: sha256Schema,
    evidence_watermark: evidenceIdSchema.nullable(),
    calculated_at: z.date(),
  }).strict(),
  contribution_summary: z.array(z.object({
    evidence_id: evidenceIdSchema,
    type: z.enum(['correct_answer', 'incorrect_answer', 'correct_after_hint', 'support_required', 'teacher_assessment']),
    direction: z.enum(['supports', 'challenges', 'neutral', 'no_demonstration']),
    weight: z.union([z.literal(1.25), z.literal(1), z.literal(0.75), z.literal(0.60), z.literal(0.45), z.literal(0.30), z.literal(0)]),
    task_id: taskIdSchema.nullable(),
  }).strict()).max(100),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
}).strict()

export const explanationDocumentSchema = z.object({
  schema_version: z.literal(EXPLANATION_SCHEMA_VERSION),
  student_id: internalActorIdSchema,
  competency_id: competencyIdSchema,
  computed: z.object({
    mastery: z.number().min(0).max(1), confidence: z.number().min(0).max(1),
    band: z.string().min(1).max(100), qualifier: z.string().min(1).max(100),
  }).strict(),
  secure: z.boolean(),
  confidence_meaning: z.literal('certainty_about_the_estimate_not_performance'),
  evidence_summary: z.object({
    active: z.number().int().min(0), positive: z.number().int().min(0), negative: z.number().int().min(0),
    weighted_volume: z.number().min(0), distinct_tasks: z.number().int().min(0),
    distinct_modalities: z.number().int().min(0), distinct_producers: z.number().int().min(0),
  }).strict(),
  contributing_evidence: z.array(z.record(z.unknown())).max(1_000),
  contextual_evidence: z.array(z.record(z.unknown())).max(1_000).optional(),
  excluded_evidence: z.array(z.record(z.unknown())).max(1_000),
  limitations: z.array(z.string()),
  reason_codes: z.array(z.string()),
  confidence_caps: z.array(z.object({ code: z.string(), value: z.number() }).strict()),
  projection: z.record(z.unknown()),
}).strict()

export const knowledgeStateIdentitySchema = z.object({
  student_id: internalActorIdSchema,
  competency_id: competencyIdSchema,
}).strict()

export const reconciliationRequestSchema = z.object({
  schema_version: z.literal(PHASE_2_SCHEMA_VERSION),
  assignment_id: internalActorIdSchema.optional(),
  submission_id: internalActorIdSchema.optional(),
  cursor: z.string().min(1).max(2000).optional(),
  limit: z.number().int().min(1).max(500).default(100),
}).strict()

export { sha256Schema }
