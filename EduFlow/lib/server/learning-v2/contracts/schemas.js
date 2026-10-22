import { z } from 'zod'
import { tenantIdSchema } from './ids.js'

export const MAX_BOUNDED_TEXT_LENGTH = 2_000
export const MAX_IDENTIFIER_LENGTH = 200

export const boundedTextSchema = (max = MAX_BOUNDED_TEXT_LENGTH) => z.string().trim().min(1).max(max)
export const internalActorIdSchema = z.string().trim().min(1).max(MAX_IDENTIFIER_LENGTH)

export const utcTimestampSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return false
  const normalizedInput = value.includes('.') ? value : value.replace('Z', '.000Z')
  return parsed.toISOString() === normalizedInput
}, { message: 'Expected a valid UTC ISO timestamp' })

export const paginationSchema = z.object({
  cursor: z.string().trim().min(1).max(MAX_IDENTIFIER_LENGTH).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict()

export const actorContextSchema = z.object({
  actor_id: internalActorIdSchema,
  actor_type: z.enum(['teacher', 'student']),
  role: z.enum(['teacher', 'student']),
  tenant_id: tenantIdSchema,
  teacher_id: internalActorIdSchema.nullable(),
  student_id: internalActorIdSchema.nullable(),
  permissions: z.array(z.string().trim().min(1).max(100)).max(32),
}).strict().superRefine((actor, context) => {
  if (actor.actor_type !== actor.role) {
    context.addIssue({ code: 'custom', path: ['role'], message: 'Actor type and role must match' })
  }
  if (actor.actor_type === 'teacher' && (!actor.teacher_id || actor.student_id)) {
    context.addIssue({ code: 'custom', path: ['teacher_id'], message: 'Invalid teacher actor context' })
  }
  if (actor.actor_type === 'student' && (!actor.student_id || actor.teacher_id)) {
    context.addIssue({ code: 'custom', path: ['student_id'], message: 'Invalid student actor context' })
  }
})

export const contextManifestSchema = z.object({
  context_categories: z.array(z.enum([
    'task',
    'objective',
    'knowledge_state_summary',
    'recent_evidence_summary',
    'tutor_history_summary',
    'policy',
  ])).max(16),
  contains_direct_identifier: z.boolean(),
}).strict()
