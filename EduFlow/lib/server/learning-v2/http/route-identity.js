const templates = [
  '/api/v2/learning/assignments/[assignmentId]/binding',
  '/api/v2/learning/assignments/[assignmentId]/tutor-policy',
  '/api/v2/learning/context',
  '/api/v2/learning/curriculum/development-subset',
  '/api/v2/learning/curriculum/frameworks',
  '/api/v2/learning/curriculum/nodes',
  '/api/v2/learning/knowledge-state/[studentId]/[competencyId]/explanation',
  '/api/v2/learning/objectives/[objectiveId]/versions/[version]/publish',
  '/api/v2/learning/objectives/[objectiveId]/versions',
  '/api/v2/learning/objectives/[objectiveId]',
  '/api/v2/learning/objectives',
  '/api/v2/learning/reconciliation',
  '/api/v2/learning/tasks/[taskId]/versions/[version]/publish',
  '/api/v2/learning/tasks/[taskId]/versions',
  '/api/v2/learning/tasks/[taskId]',
  '/api/v2/learning/tasks',
  '/api/v2/learning/teacher/evidence/[evidenceId]/invalidate',
  '/api/v2/learning/teacher/recommendations/[recommendationId]/approve',
  '/api/v2/learning/teacher/recommendations/[recommendationId]/dismiss',
  '/api/v2/learning/teacher/students/[studentId]/assessments',
  '/api/v2/learning/teacher/students/[studentId]/competencies/[competencyId]/evidence',
  '/api/v2/learning/teacher/students/[studentId]/competencies/[competencyId]/recommendations',
  '/api/v2/learning/teacher/students/[studentId]/competencies/[competencyId]',
  '/api/v2/learning/teacher/students/[studentId]/competencies',
  '/api/v2/learning/teacher/students/[studentId]/tutor-sessions/[sessionId]',
  '/api/v2/learning/tutor/sessions/[sessionId]/hints',
  '/api/v2/learning/tutor/sessions/[sessionId]/reflection',
  '/api/v2/learning/tutor/sessions/[sessionId]/retries',
  '/api/v2/learning/tutor/sessions/[sessionId]',
  '/api/v2/learning/tutor/sessions',
]

function expression(template) {
  const source = template.split('/').map((part) => (
    /^\[[A-Za-z][A-Za-z0-9]*\]$/.test(part) ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )).join('/')
  return new RegExp(`^${source}$`, 'u')
}

export const LEARNING_V2_ROUTE_TEMPLATES = Object.freeze(templates.map((template) => Object.freeze({
  template,
  expression: expression(template),
})))

export function learningV2RouteId(request) {
  const method = String(request?.method || 'UNKNOWN').toUpperCase()
  let pathname = ''
  try { pathname = new URL(request.url).pathname } catch { /* fail closed to an unmapped static identity */ }
  const match = LEARNING_V2_ROUTE_TEMPLATES.find((candidate) => candidate.expression.test(pathname))
  return `${method} ${match?.template || '/api/v2/learning/[unmapped]'}`
}
