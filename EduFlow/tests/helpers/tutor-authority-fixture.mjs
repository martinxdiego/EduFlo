// Complete the service-level Tutor double with current delivery authority.
// Real transaction/interleaving behavior is tested separately against Mongo.
export function addTutorAuthorityFixture(collections, { assignment, task, trigger, tenantId, studentId, policy }) {
  assignment.teacher_id = 'synthetic-tutor-teacher'
  assignment.class_id = 'synthetic-tutor-class'
  assignment.worksheet_id = trigger.source.worksheet_id
  assignment.status = 'active'
  task.task_type = 'selected_response'; task.response_modality = 'choice'
  const worksheetFind = collections.worksheets.findOne
  collections.worksheets.findOne = async (...args) => ({ ...await worksheetFind(...args), user_id: assignment.teacher_id })
  collections.users = { async findOne() { return { id: assignment.teacher_id, status: 'active' } } }
  collections.students = { async findOne() { return { id: studentId, status: 'active' } } }
  collections.classes = { async findOne() { return { id: assignment.class_id, teacher_id: assignment.teacher_id, enrolled_students: [{ student_id: studentId }] } } }
  collections.learning_v2_tenants = { async findOne() { return { tenant_id: tenantId, owner_teacher_id: assignment.teacher_id, type: 'personal', status: 'active' } } }
  collections.learning_v2_tenant_memberships = { find() { return { async toArray() { return [{ tenant_id: tenantId, actor_id: studentId, role: 'student', status: 'active' }] } } } }
  collections.learning_attempts = { async findOne() { return trigger } }
  collections.tutor_policies = { async findOne() { return { ...await policy(), assignment_id: assignment.id } } }
}
