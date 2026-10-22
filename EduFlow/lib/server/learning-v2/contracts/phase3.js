import { z } from 'zod'
import { tutorPolicyIdSchema, tutorSessionIdSchema } from './ids.js'
import { reflectionSessionSummarySchema } from './phase3b.js'

export const PHASE_3_SCHEMA_VERSION = 'learning-v2-phase3-v1'
export const TUTOR_POLICY_SCHEMA_VERSION = 'tutor-policy-v1'
export const TUTOR_SESSION_SCHEMA_VERSION = 'tutor-session-v4'
export const TUTOR_EVIDENCE_POLICY_VERSION = 'evidence-policy-v2-development'
export const TUTOR_FALLBACK_REGISTRY_VERSION = 'tutor-fallback-v1'
export const TUTOR_PROMPT_VERSION_V1 = 'tutor-guidance-v1'
export const TUTOR_PROMPT_VERSION_V2 = 'tutor-guidance-v2'
export const TUTOR_PROMPT_VERSION_V3 = 'tutor-guidance-v3'
export const TUTOR_PROMPT_VERSIONS = Object.freeze([TUTOR_PROMPT_VERSION_V1, TUTOR_PROMPT_VERSION_V2, TUTOR_PROMPT_VERSION_V3])
export const TUTOR_PROMPT_VERSION = TUTOR_PROMPT_VERSION_V3
export const TUTOR_PROVIDER_SCHEMA_VERSION = 'tutor-provider-response-v1'
export const TUTOR_MODEL = 'gpt-5.6-terra'

export const TUTOR_PRESETS = Object.freeze(['TUTOR_OFF', 'LOCAL_HINTS', 'GUIDED_TUTOR'])
export const TUTOR_ACTIONS = Object.freeze([
  'ASK_METACOGNITIVE_QUESTION',
  'GIVE_DIRECTIONAL_HINT',
  'GIVE_CONCEPT_HINT',
])
export const TUTOR_ACTION_BY_LEVEL = Object.freeze({
  1: 'ASK_METACOGNITIVE_QUESTION',
  2: 'GIVE_DIRECTIONAL_HINT',
  3: 'GIVE_CONCEPT_HINT',
})
export const TUTOR_REASON_BY_LEVEL = Object.freeze({ 1: 'METACOGNITIVE_CHECK', 2: 'DIRECTIONAL_NUDGE', 3: 'CONCEPTUAL_NUDGE' })
export const TUTOR_EVIDENCE_WEIGHTS = Object.freeze({ 1: 0.60, 2: 0.45, 3: 0.30, support_required: 0 })
export const TUTOR_PROVIDER_SLOT_ERROR_CODES = Object.freeze([
  'PROVIDER_UNAVAILABLE', 'BUDGET_EXHAUSTED', 'BUDGET_ERROR', 'PROVIDER_TIMEOUT', 'PROVIDER_ERROR',
  'CONTEXT_OVERSIZE', 'SCHEMA_INVALID', 'WRONG_LEVEL', 'WRONG_ACTION', 'WRONG_REASON',
  'DIRECT_ANSWER_LEAKAGE', 'ANSWER_INDEX_LEAKAGE', 'ELIMINATION_LEAKAGE', 'UNSAFE_OUTPUT',
  'FORBIDDEN_AUTHORITY', 'FULL_SOLUTION', 'LOCALE_DE_CH_VIOLATION',
  'AMBIGUOUS_TRANSPORT_LOCAL_FALLBACK',
  'PROVIDER_RUNTIME_GATE_OFF', 'PROVIDER_ENVIRONMENT_NOT_ALLOWED', 'PROVIDER_NOT_APPROVED',
  'PROVIDER_MODEL_NOT_APPROVED', 'PROVIDER_PROMPT_NOT_APPROVED', 'PROVIDER_SCHEMA_NOT_APPROVED',
  'PROVIDER_APPROVAL_REF_MISMATCH', 'PROVIDER_APPROVAL_NOT_APPROVED', 'PROVIDER_HUMAN_REVIEW_REQUIRED',
])

export const tutorPresetSchema = z.enum(TUTOR_PRESETS)
export const tutorPolicyRequestSchema = z.object({
  schema_version: z.literal(PHASE_3_SCHEMA_VERSION),
  preset: tutorPresetSchema,
}).strict()

export const startTutorSessionRequestSchema = z.object({
  schema_version: z.literal(PHASE_3_SCHEMA_VERSION),
  submission_id: z.string().trim().min(1).max(160),
  question_index: z.number().int().min(0).max(1_000),
}).strict()

export const tutorHintRequestSchema = z.object({
  schema_version: z.literal(PHASE_3_SCHEMA_VERSION),
  idempotency_key: z.string().trim().min(8).max(160),
}).strict()

export const tutorRetryRequestSchema = tutorHintRequestSchema.extend({
  selected_response: z.string().max(300),
}).strict()

export const tutorProviderResponseSchema = z.object({
  schema_version: z.literal(TUTOR_PROVIDER_SCHEMA_VERSION),
  action: z.enum(TUTOR_ACTIONS),
  hint_level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  learner_message: z.string().trim().min(1).max(280).refine((value) => value.split(/\s+/).length <= 60),
  reason_code: z.enum(['METACOGNITIVE_CHECK', 'DIRECTIONAL_NUDGE', 'CONCEPTUAL_NUDGE']),
  teacher_attention: z.literal(false),
}).strict()

export const tutorProviderSlotSchema = z.object({
  status: z.enum(['reserved', 'transport_started', 'completed']),
  call_id: z.string().regex(/^pcl_[0-9a-f-]{36}$/),
  reservation_count: z.number().int().min(1).max(100),
  // A monotonic one-way fence. 1 means that an external transport may have
  // occurred and therefore no later owner may start another one.
  transport_count: z.number().int().min(0).max(1),
  lease_expires_at: z.date(),
  outcome_code: z.enum(['PROVIDER_ACCEPTED', 'LOCAL_FALLBACK']).nullable(),
  error_code: z.enum(TUTOR_PROVIDER_SLOT_ERROR_CODES).nullable(),
  reserved_at: z.date(),
  transport_started_at: z.date().nullable(),
  completed_at: z.date().nullable(),
  updated_at: z.date(),
}).strict()

export const tutorProviderSlotsSchema = z.object({
  level_1: tutorProviderSlotSchema.optional(),
  level_2: tutorProviderSlotSchema.optional(),
  level_3: tutorProviderSlotSchema.optional(),
}).strict()

export const tutorPolicyDocumentSchema = z.object({
  policy_id: tutorPolicyIdSchema,
  schema_version: z.literal(TUTOR_POLICY_SCHEMA_VERSION),
  tenant_id: z.string().regex(/^ten_/),
  assignment_id: z.string().trim().min(1).max(160),
  requested_preset: tutorPresetSchema,
  effective_preset: tutorPresetSchema,
  restriction_reasons: z.array(z.string().min(1).max(100)).max(10),
  policy_version: z.number().int().positive(),
  content_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  immutable: z.literal(true),
  created_by: z.string().trim().min(1).max(160),
  created_at: z.date(),
}).strict()

export const tutorSessionDocumentSchema = z.object({
  session_id: tutorSessionIdSchema,
  schema_version: z.literal(TUTOR_SESSION_SCHEMA_VERSION),
  tenant_id: z.string().regex(/^ten_/),
  student_id: z.string().trim().min(1).max(160),
  assignment_id: z.string().trim().min(1).max(160),
  task_ref: z.object({ task_id: z.string().regex(/^tsk_/), version: z.number().int().positive() }).strict(),
  objective_ref: z.object({ objective_id: z.string().regex(/^obj_/), version: z.number().int().positive() }).strict(),
  trigger_attempt_id: z.string().regex(/^att_/),
  start_key: z.string().trim().min(1).max(200),
  assignment_revision: z.number().int().nonnegative().optional(),
  policy_ref: z.object({ policy_id: tutorPolicyIdSchema, version: z.number().int().positive(), content_hash: z.string().regex(/^sha256:/) }).strict(),
  preset: z.enum(['LOCAL_HINTS', 'GUIDED_TUTOR']),
  model_config: z.object({
    provider: z.string().trim().min(1).max(60),
    model: z.string().trim().min(1).max(120),
    prompt_version: z.string().trim().min(1).max(120),
    structured_output_schema_version: z.string().trim().min(1).max(120),
    approval_ref: z.string().trim().min(1).max(160),
  }).strict(),
  fallback_registry_version: z.literal(TUTOR_FALLBACK_REGISTRY_VERSION),
  evidence_policy_version: z.literal(TUTOR_EVIDENCE_POLICY_VERSION),
  status: z.enum(['active', 'completed', 'escalated']),
  phase: z.enum(['awaiting_hint', 'awaiting_retry', 'awaiting_reflection', 'closed']),
  highest_hint_level: z.number().int().min(0).max(3),
  hint_count: z.number().int().min(0).max(3),
  retry_count: z.number().int().min(0).max(3),
  state_version: z.number().int().positive(),
  last_sequence: z.number().int().min(0),
  last_hint: z.record(z.unknown()).nullable(),
  last_retry: z.record(z.unknown()).nullable(),
  hint_receipts: z.array(z.record(z.unknown())).max(3).optional(),
  retry_receipts: z.array(z.record(z.unknown())).max(3).optional(),
  provider_slots: tutorProviderSlotsSchema,
  completion_receipt: z.record(z.unknown()).optional(),
  outcome: z.enum(['pending', 'correct_after_hint', 'support_required']),
  reflection: reflectionSessionSummarySchema.optional(),
  started_at: z.date(),
  updated_at: z.date(),
  last_activity_at: z.date(),
  expires_at: z.date(),
  completed_at: z.date().nullable(),
}).strict()
