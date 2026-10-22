import { z } from 'zod'

export const PHASE_3B_SCHEMA_VERSION = 'learning-v2-phase3b-v1'
export const REFLECTION_TYPE = 'identify_mistake'
export const REFLECTION_PROMPT_ID = 'reflection-identify-mistake'
export const REFLECTION_PROMPT_VERSION = 'reflection-identify-mistake-v1'
export const REFLECTION_LOCALE = 'de-CH'
export const REFLECTION_PROMPT_TEXT = 'Was war bei deinem ersten Versuch falsch oder unklar? Antworte in einem kurzen Satz.'
export const REFLECTION_NO_MASTERY_STATEMENT = 'Does not affect Mastery or Confidence.'
export const REFLECTION_MAX_CHARACTERS = 300
export const REFLECTION_MAX_WORDS = 60

const disallowedControlCharacters = /[\u0000-\u001f\u007f-\u009f]/u
const letterOrNumber = /[\p{L}\p{N}]/u

export function normalizeReflectionResponse(value) {
  return String(value).replace(/\r\n?|\n/gu, ' ').normalize('NFC').trim()
}

export function reflectionCharacterCount(value) {
  return Array.from(value).length
}

export function reflectionWordCount(value) {
  return value ? value.split(/\s+/u).length : 0
}

export const reflectionResponseTextSchema = z.string().transform(normalizeReflectionResponse).superRefine((value, context) => {
  const characterCount = reflectionCharacterCount(value)
  if (characterCount < 3) context.addIssue({ code: z.ZodIssueCode.too_small, minimum: 3, inclusive: true, type: 'string' })
  if (characterCount > REFLECTION_MAX_CHARACTERS) context.addIssue({ code: z.ZodIssueCode.too_big, maximum: REFLECTION_MAX_CHARACTERS, inclusive: true, type: 'string' })
  if (!letterOrNumber.test(value)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A letter or number is required' })
  if (reflectionWordCount(value) > REFLECTION_MAX_WORDS) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Too many words' })
  if (disallowedControlCharacters.test(value)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Control characters are not allowed' })
})

export const reflectionSubmissionRequestSchema = z.object({
  schema_version: z.literal(PHASE_3B_SCHEMA_VERSION),
  idempotency_key: z.string().trim().min(8).max(160),
  response_text: reflectionResponseTextSchema,
}).strict()

const reflectionBaseSessionSchema = z.object({
  type: z.literal(REFLECTION_TYPE),
  prompt_id: z.literal(REFLECTION_PROMPT_ID),
  prompt_version: z.literal(REFLECTION_PROMPT_VERSION),
  cause: z.literal('supported_correction'),
  support_level: z.union([z.literal(2), z.literal(3)]),
  final_attempt_id: z.string().regex(/^att_/),
  request_event_id: z.string().regex(/^evt_/),
  requested_at: z.date(),
}).strict()

export const reflectionSessionSummarySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('not_required') }).strict(),
  reflectionBaseSessionSchema.extend({ status: z.literal('awaiting_submission') }).strict(),
  reflectionBaseSessionSchema.extend({
    status: z.literal('submitted'),
    submission_event_id: z.string().regex(/^evt_/),
    submitted_at: z.date(),
  }).strict(),
  reflectionBaseSessionSchema.extend({ status: z.literal('expired_unsubmitted') }).strict(),
])

