import { requireTeacher } from '../auth/learning-authorization.js'
import { LearningV2Error } from '../contracts/errors.js'
import { MEMBERSHIP_COLLECTION, TENANT_COLLECTION } from '../auth/tenant-context.js'

export async function requireTeacherStudentAccess(db, actor, studentId) {
  requireTeacher(actor)
  const [tenant, student, memberships, ownedClass] = await Promise.all([
    db.collection(TENANT_COLLECTION).findOne({
      tenant_id: actor.tenant_id,
      type: 'personal',
      owner_teacher_id: actor.teacher_id,
      status: 'active',
    }, { projection: { _id: 0, tenant_id: 1 } }),
    db.collection('students').findOne({
      id: studentId,
      disabled_at: { $exists: false },
      deleted_at: { $exists: false },
      status: { $nin: ['disabled', 'deleted'] },
    }, { projection: { _id: 0, id: 1, display_name: 1 } }),
    db.collection(MEMBERSHIP_COLLECTION).find({
      actor_type: 'student',
      actor_id: studentId,
      status: 'active',
    }).project({ _id: 0, tenant_id: 1, role: 1 }).toArray(),
    db.collection('classes').findOne({
      teacher_id: actor.teacher_id,
      'enrolled_students.student_id': studentId,
    }, { projection: { _id: 0, id: 1, name: 1, enrolled_students: { $elemMatch: { student_id: studentId } } } }),
  ])
  if (!tenant || !student || memberships.length !== 1
    || memberships[0].tenant_id !== actor.tenant_id || memberships[0].role !== 'student'
    || !ownedClass) throw new LearningV2Error('NOT_FOUND')

  const enrollment = (ownedClass.enrolled_students || []).find((item) => item.student_id === studentId)
  if (!enrollment) throw new LearningV2Error('NOT_FOUND')
  return {
    student_id: studentId,
    display_name: enrollment.display_name || student.display_name || 'Learner',
    class_id: ownedClass.id,
    class_name: ownedClass.name,
  }
}
