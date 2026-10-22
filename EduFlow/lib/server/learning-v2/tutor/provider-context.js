import { TUTOR_ACTION_BY_LEVEL, TUTOR_PROMPT_VERSION, TUTOR_PROVIDER_SCHEMA_VERSION } from '../contracts/phase3.js'

export function buildTutorProviderContext({ task, question, level, promptVersion = TUTOR_PROMPT_VERSION }) {
  return Object.freeze({
    schema_version: TUTOR_PROVIDER_SCHEMA_VERSION,
    prompt_version: promptVersion,
    decision: Object.freeze({ hint_level: level, action: TUTOR_ACTION_BY_LEVEL[level] }),
    task: Object.freeze({
      prompt: String(question.question || '').slice(0, 1_500),
      options: Object.freeze((question.options || []).slice(0, 8).map((option) => String(option).slice(0, 300))),
      objective_label: String(task.provider_safe_objective_label || '').slice(0, 300),
    }),
  })
}

export const FORBIDDEN_PROVIDER_CONTEXT_KEYS = Object.freeze([
  'answer', 'correctAnswer', 'correct_answer', 'student_id', 'studentId', 'tenant_id', 'tenantId',
  'assignment_id', 'assignmentId', 'attempt_id', 'attemptId', 'evidence', 'knowledge_state', 'device', 'email', 'name',
])

export function providerContextContainsForbiddenKey(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, child]) => FORBIDDEN_PROVIDER_CONTEXT_KEYS.includes(key) || providerContextContainsForbiddenKey(child))
}
