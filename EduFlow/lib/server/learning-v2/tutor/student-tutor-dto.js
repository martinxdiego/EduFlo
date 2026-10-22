export const STUDENT_TUTOR_DTO_VERSION = 'student-tutor-session-v1'

function iso(value) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

function reflectionDto(reflection, presentation = {}) {
  if (!reflection) return undefined
  if (reflection.status === 'not_required') return { status: 'not_required' }
  const value = {
    status: reflection.status,
    type: reflection.type,
    requested_at: iso(reflection.requested_at),
  }
  if (presentation.promptText) value.prompt_text = presentation.promptText
  if (presentation.locale) value.locale = presentation.locale
  if (Number.isInteger(presentation.maximumResponseCharacters)) {
    value.maximum_response_characters = presentation.maximumResponseCharacters
  }
  if (Number.isInteger(presentation.maximumResponseWords)) {
    value.maximum_response_words = presentation.maximumResponseWords
  }
  if (reflection.status === 'submitted') {
    value.submitted_at = iso(reflection.submitted_at)
    value.response_text = presentation.responseText
  }
  return value
}

/**
 * The sole browser projection for a Student Tutor Session. This is deliberately
 * constructed field-by-field: additions to the persisted session can never
 * become public without an explicit contract change and DTO version bump.
 */
export function studentTutorSessionDto(session, presentation = {}) {
  const value = {
    dto_version: STUDENT_TUTOR_DTO_VERSION,
    session_id: session.session_id,
    status: session.status,
    phase: session.phase,
    outcome: session.outcome,
    highest_hint_level: session.highest_hint_level,
    hint_count: session.hint_count,
    retry_count: session.retry_count,
    expires_at: iso(session.expires_at),
    completed_at: iso(session.completed_at),
  }
  const reflection = reflectionDto(session.reflection, presentation.reflection)
  if (reflection) value.reflection = reflection
  return value
}
