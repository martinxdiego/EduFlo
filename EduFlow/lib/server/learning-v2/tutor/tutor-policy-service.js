import { deletionFencedDatabase } from '../../deletion-write-fence.js'
import { requireTeacher } from '../auth/learning-authorization.js'
import { LearningV2Error, validationError } from '../contracts/errors.js'
import { tutorPolicyRequestSchema } from '../contracts/phase3.js'
import { resolveTutorPolicy } from './policy.js'

function dto(document) {
  if (!document) return null
  const { _id, ...value } = document
  if (value.created_at instanceof Date) value.created_at = value.created_at.toISOString()
  return value
}

export class TutorPolicyService {
  constructor(db, repository, options = {}) { db = deletionFencedDatabase(db); this.db = db; this.repository = repository; this.now = options.now || (() => new Date()) }

  async configure(actor, assignmentId, rawInput) {
    requireTeacher(actor)
    const parsed = tutorPolicyRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw validationError(parsed.error)
    const assignment = await this.db.collection('assignments').findOne({ id: assignmentId, teacher_id: actor.teacher_id, 'learning_v2.enabled': true, 'learning_v2.tenant_id': actor.tenant_id })
    if (!assignment) throw new LearningV2Error('NOT_FOUND')
    const policy = await this.repository.createSnapshot(actor, assignmentId, resolveTutorPolicy(assignment, parsed.data.preset), actor.teacher_id)
    const updated = await this.db.collection('assignments').updateOne(
      { id: assignmentId, teacher_id: actor.teacher_id, 'learning_v2.enabled': true, learning_v2_revision: assignment.learning_v2_revision ?? { $exists: false } },
      { $set: {
        'learning_v2.tutor_preset': parsed.data.preset,
        'learning_v2.tutor_policy_ref': { policy_id: policy.policy_id, version: policy.policy_version, content_hash: policy.content_hash },
        updated_at: this.now(),
      } },
    )
    if (updated.matchedCount !== 1) throw new LearningV2Error('CONFLICT')
    return dto(policy)
  }

  async get(actor, assignmentId) {
    requireTeacher(actor)
    const assignment = await this.db.collection('assignments').findOne({ id: assignmentId, teacher_id: actor.teacher_id }, { projection: { learning_v2: 1 } })
    if (!assignment) throw new LearningV2Error('NOT_FOUND')
    const ref = assignment.learning_v2?.tutor_policy_ref
    return ref ? dto(await this.repository.findVersion(actor, ref.policy_id, ref.version)) : null
  }
}
