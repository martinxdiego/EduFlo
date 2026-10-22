import { deletionFencedDatabase } from '../../deletion-write-fence.js'
import { tenantScopedFilter } from '../auth/tenant-context.js'
import { requireStudent } from '../auth/learning-authorization.js'
import { normalizeAssignmentSettings } from '../../../learning-workflow.js'
import { worksheetQuestionContentHash, WORKSHEET_QUESTION_HASH_VERSION } from '../../worksheet-question-identity.js'
import { multipleChoiceEligibility } from '../assignments/assignment-binding-service.js'

export class TaskRepository {
  constructor(db) { db = deletionFencedDatabase(db);
    this.db = db
    this.collection = db.collection('learning_tasks')
  }

  // The generic task API has no assignment-code proof. It serves only a current
  // class assignment for this learner; legacy code-based delivery is separate.
  async studentDelivery(actor, task, now) {
    requireStudent(actor)
    if (task.tenant_id !== actor.tenant_id || task.status !== 'published'
      || task.task_type !== 'selected_response' || task.response_modality !== 'choice') return null
    const [student, memberships, tenant] = await Promise.all([
      this.db.collection('students').findOne({ id: actor.student_id, status: { $nin: ['disabled', 'deleted'] }, disabled_at: { $exists: false }, deleted_at: { $exists: false } }),
      this.db.collection('learning_v2_tenant_memberships').find({ actor_type: 'student', actor_id: actor.student_id, status: 'active' }).toArray(),
      this.db.collection('learning_v2_tenants').findOne({ tenant_id: actor.tenant_id, type: 'personal', status: 'active' }),
    ])
    if (!student || !tenant || memberships.length !== 1 || memberships[0].tenant_id !== actor.tenant_id || memberships[0].role !== 'student') return null
    const source = task.source
    if (source?.kind !== 'worksheet_question' || source.hash_version !== WORKSHEET_QUESTION_HASH_VERSION) return null
    const assignments = await this.db.collection('assignments').find({
      teacher_id: tenant.owner_teacher_id, status: 'active', worksheet_id: source.worksheet_id,
      'learning_v2.enabled': true, 'learning_v2.tenant_id': actor.tenant_id,
      'learning_v2.task_pins': { $elemMatch: { task_id: task.task_id, task_version: task.version,
        worksheet_id: source.worksheet_id, question_id: source.question_id,
        content_hash: source.content_hash, hash_version: source.hash_version } },
    }).toArray()
    for (const assignment of assignments) {
      if (!assignment.class_id || (assignment.deadline && new Date(assignment.deadline) < now)) continue
      const ownedClass = await this.db.collection('classes').findOne({ id: assignment.class_id, teacher_id: tenant.owner_teacher_id,
        enrolled_students: { $elemMatch: { student_id: actor.student_id, ...(assignment.target_niveau ? { niveau: assignment.target_niveau } : {}) } } })
      if (!ownedClass) continue
      const attempts = await this.db.collection('submissions').countDocuments({ assignment_id: assignment.id, student_id: actor.student_id })
      if (attempts >= normalizeAssignmentSettings(assignment).maxAttempts) continue
      const worksheet = await this.db.collection('worksheets').findOne({ id: source.worksheet_id, user_id: tenant.owner_teacher_id,
        status: { $nin: ['retired', 'deleted', 'hidden'] }, hidden: { $ne: true }, archived: { $ne: true }, deleted_at: { $exists: false }, retired_at: { $exists: false } })
      const questions = (worksheet?.content?.questions || []).filter((item) => item.question_id === source.question_id)
      const question = questions.length === 1 ? questions[0] : null
      if (!question || question.hidden || ['retired', 'deleted', 'hidden'].includes(question.status)
        || !multipleChoiceEligibility(question).eligible || worksheetQuestionContentHash(question) !== source.content_hash) continue
      // Solutions/feedback are deliberately never part of task delivery, even
      // when the separate submission-feedback endpoint permits their release.
      return { prompt: String(question.question || ''), options: question.options.map(String) }
    }
    return null
  }

  async insert(actor, document) {
    await this.collection.insertOne({ ...document, tenant_id: actor.tenant_id })
    return document
  }

  async findVersion(actor, taskId, version) {
    return this.collection.findOne(tenantScopedFilter(actor, { task_id: taskId, version }))
  }

  async findLatest(actor, taskId, status) {
    const query = tenantScopedFilter(actor, { task_id: taskId, ...(status ? { status } : {}) })
    return this.collection.find(query).sort({ version: -1 }).limit(1).next()
  }

  async list(actor, filter = {}, limit = 50) {
    return this.collection.find(tenantScopedFilter(actor, filter)).sort({ created_at: -1, version: -1 }).limit(limit).toArray()
  }

  async publishDraft(actor, taskId, version, now) {
    return this.collection.findOneAndUpdate(
      tenantScopedFilter(actor, { task_id: taskId, version, status: 'draft' }),
      { $set: { status: 'published', published_at: now } },
      { returnDocument: 'after' },
    )
  }
}
