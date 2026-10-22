import { verifyAuthToken } from '../../security.js'
import { actorContextSchema } from '../contracts/schemas.js'
import { LearningV2Error } from '../contracts/errors.js'
import { resolveTenantContext, requireTenantContext } from './tenant-context.js'

const PERMISSIONS = Object.freeze({
  teacher: Object.freeze(['learning:read', 'learning:write', 'learning:read:students']),
  student: Object.freeze(['learning:read:self', 'learning:write:self']),
})

function sessionIdentity(session) {
  const teacherId = typeof session?.userId === 'string' && session.userId ? session.userId : null
  const studentId = typeof session?.studentId === 'string' && session.studentId ? session.studentId : null
  if (Boolean(teacherId) === Boolean(studentId)) throw new LearningV2Error('UNAUTHENTICATED')
  return teacherId
    ? { actor_id: teacherId, actor_type: 'teacher', role: 'teacher' }
    : { actor_id: studentId, actor_type: 'student', role: 'student' }
}

async function authoritativeActor(db, identity) {
  const collection = identity.actor_type === 'teacher' ? 'users' : 'students'
  const record = await db.collection(collection).findOne(
    { id: identity.actor_id },
    { projection: { _id: 0, id: 1, status: 1, disabled_at: 1, deleted_at: 1, password_changed_at: 1, account_deletion: 1 } },
  )
  return record && !record.account_deletion && !record.disabled_at && !record.deleted_at && !['disabled', 'deleted'].includes(record.status)
    ? record
    : null
}

function sessionPredatesPasswordChange(session, record) {
  if (!record?.password_changed_at) return false
  const changedAtSeconds = Math.floor(new Date(record.password_changed_at).getTime() / 1000)
  return !Number.isFinite(session?.iat) || session.iat < changedAtSeconds
}

export async function requireAuthenticatedActor(request, options = {}) {
  const { db, verifySession = verifyAuthToken, createPersonalTenant = true } = options
  if (!db) throw new TypeError('A MongoDB database is required')
  const session = verifySession(request)
  if (!session) throw new LearningV2Error('UNAUTHENTICATED')
  const identity = sessionIdentity(session)
  const actorRecord = await authoritativeActor(db, identity)
  if (!actorRecord || sessionPredatesPasswordChange(session, actorRecord)) {
    throw new LearningV2Error('UNAUTHENTICATED')
  }
  const tenant = await resolveTenantContext(db, identity, { createPersonalTenant })

  const parsed = actorContextSchema.safeParse({
    ...identity,
    tenant_id: tenant.tenant_id,
    teacher_id: identity.actor_type === 'teacher' ? identity.actor_id : null,
    student_id: identity.actor_type === 'student' ? identity.actor_id : null,
    permissions: [...PERMISSIONS[identity.role]],
  })
  if (!parsed.success) throw new LearningV2Error('INTERNAL_ERROR')
  parsed.data.permissions = Object.freeze(parsed.data.permissions)
  return Object.freeze(parsed.data)
}

export function requireTeacher(actor) {
  requireTenantContext(actor)
  if (actor.actor_type !== 'teacher' || actor.role !== 'teacher' || !actor.teacher_id || actor.student_id) {
    throw new LearningV2Error('FORBIDDEN')
  }
  return actor
}

export function requireStudent(actor) {
  requireTenantContext(actor)
  if (actor.actor_type !== 'student' || actor.role !== 'student' || !actor.student_id || actor.teacher_id) {
    throw new LearningV2Error('FORBIDDEN')
  }
  return actor
}

export function requireDurableLearner(actor) {
  return requireStudent(actor)
}
