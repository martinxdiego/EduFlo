import { requireStudent } from '../auth/learning-authorization.js'
import { LearningV2Error } from '../contracts/errors.js'
import { multipleChoiceEligibility } from '../assignments/assignment-binding-service.js'
import { worksheetQuestionContentHash, WORKSHEET_QUESTION_HASH_VERSION } from '../../worksheet-question-identity.js'
import { resolveTutorPolicy } from './policy.js'
import { stableInputHash } from '../idempotency.js'
import { withTutorInteractionGuard } from './interaction-context.js'
import { unfencedDatabase } from '../../deletion-write-fence.js'

const active = (row) => row && !row.disabled_at && !row.deleted_at && !['disabled', 'deleted'].includes(row.status)
const deny = () => { throw new LearningV2Error('NOT_FOUND') }

export class CurrentTutorInteractionAuthority {
  constructor(db, { now = () => new Date() } = {}) { this.db = unfencedDatabase(db); this.now = now }

  async read(actor, reference, db = this.db, mongoSession) {
    requireStudent(actor)
    const options = mongoSession ? { session: mongoSession } : {}
    const one = (name, filter) => db.collection(name).findOne(filter, options)
    const student = await one('students', { id: actor.student_id })
    const tenant = await one('learning_v2_tenants', { tenant_id: actor.tenant_id, type: 'personal', status: 'active' })
    const memberships = await db.collection('learning_v2_tenant_memberships').find({ actor_type: 'student', actor_id: actor.student_id, status: 'active' }, options).toArray()
    if (!active(student) || !tenant || memberships.length !== 1 || memberships[0].tenant_id !== actor.tenant_id || memberships[0].role !== 'student') deny()
    const teacher = await one('users', { id: tenant.owner_teacher_id })
    if (!active(teacher) || teacher.account_deletion) deny()
    const assignment = await one('assignments', { id: reference.assignment_id, teacher_id: tenant.owner_teacher_id,
      status: 'active', 'learning_v2.tenant_id': actor.tenant_id, 'learning_v2.enabled': true })
    if (!assignment || !assignment.class_id || (assignment.deadline && new Date(assignment.deadline) < this.now())) deny()
    const ownedClass = await one('classes', { id: assignment.class_id, teacher_id: tenant.owner_teacher_id })
    if (!active(ownedClass) || !ownedClass.enrolled_students?.some((item) => item.student_id === actor.student_id && (!assignment.target_niveau || item.niveau === assignment.target_niveau))) deny()
    const pins = (assignment.learning_v2.task_pins || []).filter((item) => item.task_id === reference.task_ref.task_id && item.task_version === reference.task_ref.version)
    if (pins.length !== 1) deny()
    const pin = pins[0]
    const worksheet = await one('worksheets', { id: pin.worksheet_id, user_id: tenant.owner_teacher_id })
    const task = await one('learning_tasks', { tenant_id: actor.tenant_id, task_id: pin.task_id, version: pin.task_version, status: 'published' })
    const questions = (worksheet?.content?.questions || []).filter((item) => item.question_id === pin.question_id)
    const question = questions.length === 1 ? questions[0] : null
    if (!worksheet || assignment.worksheet_id !== worksheet.id || worksheet.hidden || worksheet.archived || worksheet.deleted_at || worksheet.retired_at
      || ['hidden', 'archived', 'deleted', 'retired'].includes(worksheet.status) || !question || question.hidden || ['hidden', 'deleted', 'retired'].includes(question.status)
      || !multipleChoiceEligibility(question).eligible || !task || task.task_type !== 'selected_response' || task.response_modality !== 'choice'
      || pin.hash_version !== WORKSHEET_QUESTION_HASH_VERSION || worksheetQuestionContentHash(question) !== pin.content_hash
      || ['worksheet_id', 'question_id', 'content_hash', 'hash_version'].some((key) => task.source?.[key] !== pin[key])) deny()
    const configuredRef = assignment.learning_v2.tutor_policy_ref
    const policyRef = reference.policy_ref || configuredRef
    const policy = policyRef ? await one('tutor_policies', { tenant_id: actor.tenant_id, policy_id: policyRef.policy_id, policy_version: policyRef.version }) : null
    if (policyRef && (!policy || policy.assignment_id !== assignment.id || policy.content_hash !== policyRef.content_hash)) deny()
    if (configuredRef && reference.policy_ref && stableInputHash(configuredRef) !== stableInputHash(reference.policy_ref)) deny()
    const resolved = resolveTutorPolicy(assignment, policy?.requested_preset || assignment.learning_v2.tutor_preset)
    if (resolved.effective_preset === 'TUTOR_OFF' || (reference.preset && resolved.effective_preset !== reference.preset)) deny()
    if (reference.session_id && reference.assignment_revision === undefined) deny()
    if (reference.assignment_revision !== undefined && reference.assignment_revision !== (assignment.learning_v2_revision || 0)) deny()
    const trigger = reference.trigger_attempt_id ? await one('learning_attempts', { tenant_id: actor.tenant_id, student_id: actor.student_id, attempt_id: reference.trigger_attempt_id }) : null
    if (reference.trigger_attempt_id && (!trigger || trigger.task_ref.task_id !== task.task_id || trigger.task_ref.version !== task.version
      || trigger.source.assignment_id !== assignment.id || ['worksheet_id', 'question_id', 'content_hash', 'hash_version'].some((key) => trigger.source[key] !== pin[key]))) deny()
    return { assignment, pin, worksheet, question, task, policy, tenant, student, ownedClass }
  }

  async run(actor, reference, operation) {
    const context = await this.read(actor, reference)
    const captured = { ...reference, assignment_revision: reference.assignment_revision ?? (context.assignment.learning_v2_revision || 0) }
    return withTutorInteractionGuard(async (db, writer, session) => {
      if (writer.tenant_id !== actor.tenant_id) deny()
      if (captured.expires_at && new Date(captured.expires_at) <= this.now()) throw new LearningV2Error('CONFLICT')
      const current = await this.read(actor, captured, db, session)
      // Lock current authority rows in the same transaction as each durable
      // interaction write; concurrent config/enrollment/source edits conflict.
      for (const [name, filter, field] of [
        ['users', { id: current.tenant.owner_teacher_id, account_deletion: { $exists: false } }, 'account_write_fence'],
        ['students', { id: actor.student_id }, 'learning_v2_interaction_fence'],
        ['classes', { id: current.assignment.class_id }, 'learning_v2_interaction_fence'],
        ['assignments', { id: current.assignment.id }, 'learning_v2_interaction_fence'],
        ['worksheets', { id: current.worksheet.id }, 'learning_v2_interaction_fence'],
        ['learning_tasks', { tenant_id: actor.tenant_id, task_id: current.task.task_id, version: current.task.version }, 'interaction_fence'],
        ['learning_v2_tenant_memberships', { actor_type: 'student', actor_id: actor.student_id, tenant_id: actor.tenant_id, status: 'active' }, 'interaction_fence'],
      ]) {
        const result = await db.collection(name).updateOne(filter, { $inc: { [field]: 1 } }, { session })
        if (!result.matchedCount) deny()
      }
    }, () => operation(context))
  }
}
