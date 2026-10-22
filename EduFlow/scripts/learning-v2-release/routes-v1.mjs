export const ROUTE_MANIFEST_VERSION = 'learning-v2-public-routes-v2'

const route = (file, path, capability, methods) => Object.freeze({
  file: `app/api/v2/${file}/route.js`,
  path: `/api/v2/${path}`,
  template: `/api/v2/${file}`,
  capability,
  methods: Object.freeze([...methods]),
})

export const PUBLIC_V2_ROUTES = Object.freeze([
  route('learning/assignments/[assignmentId]/binding', 'learning/assignments/h10-assignment/binding', 'ingestion', ['GET', 'POST', 'DELETE']),
  route('learning/assignments/[assignmentId]/tutor-policy', 'learning/assignments/h10-assignment/tutor-policy', 'tutor', ['GET', 'PUT']),
  route('learning/context', 'learning/context', 'definitions', ['GET']),
  route('learning/curriculum/development-subset', 'learning/curriculum/development-subset', 'definitions', ['POST']),
  route('learning/curriculum/frameworks', 'learning/curriculum/frameworks', 'definitions', ['GET']),
  route('learning/curriculum/nodes', 'learning/curriculum/nodes', 'definitions', ['GET']),
  route('learning/knowledge-state/[studentId]/[competencyId]/explanation', 'learning/knowledge-state/h10-student/cmp_00000000-0000-4000-8000-000000000001/explanation', 'ingestion', ['GET']),
  route('learning/objectives/[objectiveId]', 'learning/objectives/obj_00000000-0000-4000-8000-000000000001', 'definitions', ['GET']),
  route('learning/objectives/[objectiveId]/versions/[version]/publish', 'learning/objectives/obj_00000000-0000-4000-8000-000000000001/versions/1/publish', 'definitions', ['POST']),
  route('learning/objectives/[objectiveId]/versions', 'learning/objectives/obj_00000000-0000-4000-8000-000000000001/versions', 'definitions', ['POST']),
  route('learning/objectives', 'learning/objectives', 'definitions', ['GET', 'POST']),
  route('learning/reconciliation', 'learning/reconciliation', 'ingestion', ['POST']),
  route('learning/tasks/[taskId]', 'learning/tasks/tsk_00000000-0000-4000-8000-000000000001', 'definitions', ['GET']),
  route('learning/tasks/[taskId]/versions/[version]/publish', 'learning/tasks/tsk_00000000-0000-4000-8000-000000000001/versions/1/publish', 'definitions', ['POST']),
  route('learning/tasks/[taskId]/versions', 'learning/tasks/tsk_00000000-0000-4000-8000-000000000001/versions', 'definitions', ['POST']),
  route('learning/tasks', 'learning/tasks', 'definitions', ['GET', 'POST']),
  route('learning/teacher/evidence/[evidenceId]/invalidate', 'learning/teacher/evidence/evd_00000000-0000-4000-8000-000000000001/invalidate', 'teacher', ['POST']),
  route('learning/teacher/recommendations/[recommendationId]/approve', 'learning/teacher/recommendations/rec_00000000-0000-4000-8000-000000000001/approve', 'recommendations', ['POST']),
  route('learning/teacher/recommendations/[recommendationId]/dismiss', 'learning/teacher/recommendations/rec_00000000-0000-4000-8000-000000000001/dismiss', 'recommendations', ['POST']),
  route('learning/teacher/students/[studentId]/assessments', 'learning/teacher/students/h10-student/assessments', 'teacher', ['POST']),
  route('learning/teacher/students/[studentId]/competencies/[competencyId]/evidence', 'learning/teacher/students/h10-student/competencies/cmp_00000000-0000-4000-8000-000000000001/evidence', 'teacher', ['GET']),
  route('learning/teacher/students/[studentId]/competencies/[competencyId]/recommendations', 'learning/teacher/students/h10-student/competencies/cmp_00000000-0000-4000-8000-000000000001/recommendations', 'recommendations', ['POST']),
  route('learning/teacher/students/[studentId]/competencies/[competencyId]', 'learning/teacher/students/h10-student/competencies/cmp_00000000-0000-4000-8000-000000000001', 'teacher', ['GET']),
  route('learning/teacher/students/[studentId]/competencies', 'learning/teacher/students/h10-student/competencies', 'teacher', ['GET']),
  route('learning/teacher/students/[studentId]/tutor-sessions/[sessionId]', 'learning/teacher/students/h10-student/tutor-sessions/ses_00000000-0000-4000-8000-000000000001', 'teacher', ['GET']),
  route('learning/tutor/sessions/[sessionId]/hints', 'learning/tutor/sessions/ses_00000000-0000-4000-8000-000000000001/hints', 'tutor', ['POST']),
  route('learning/tutor/sessions/[sessionId]/reflection', 'learning/tutor/sessions/ses_00000000-0000-4000-8000-000000000001/reflection', 'reflection', ['POST']),
  route('learning/tutor/sessions/[sessionId]/retries', 'learning/tutor/sessions/ses_00000000-0000-4000-8000-000000000001/retries', 'tutor', ['POST']),
  route('learning/tutor/sessions/[sessionId]', 'learning/tutor/sessions/ses_00000000-0000-4000-8000-000000000001', 'tutor', ['GET']),
  route('learning/tutor/sessions', 'learning/tutor/sessions', 'tutor', ['POST']),
])

export function routeMethodCount(routes = PUBLIC_V2_ROUTES) {
  return routes.reduce((count, item) => count + item.methods.length, 0)
}
