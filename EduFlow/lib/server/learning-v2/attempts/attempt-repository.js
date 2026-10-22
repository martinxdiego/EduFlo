import { unfencedDatabase } from '../../deletion-write-fence.js'
import { withTenantWrite } from '../database/tenant-write.js'
import { tenantScopedFilter } from '../auth/tenant-context.js'
import { LearningV2Error } from '../contracts/errors.js'

function sameSource(left, right) {
  return left?.student_id === right?.student_id
    && left?.source?.submission_id === right?.source?.submission_id
    && left?.source?.question_id === right?.source?.question_id
    && left?.task_ref?.task_id === right?.task_ref?.task_id
    && left?.task_ref?.version === right?.task_ref?.version
}

export class AttemptRepository {
  constructor(db) { this.db = unfencedDatabase(db); this.collection = this.db.collection('learning_attempts') }

  async insertCanonical(actor, document) {
    return withTenantWrite(this.db, actor, async (session) => {
      const key = tenantScopedFilter(actor, { idempotency_key: document.idempotency_key })
      let canonical = await this.collection.findOne(key, { session })
      if (document.source.kind === 'legacy_submission_question') {
        const occupied = await this.collection.findOne(tenantScopedFilter(actor, { student_id: document.student_id,
          'source.kind': 'legacy_submission_question', 'source.assignment_id': document.source.assignment_id,
          'source.question_id': document.source.question_id, 'source.learning_v2_attempt_no': document.source.learning_v2_attempt_no }), { session })
        if (occupied && occupied.idempotency_key !== document.idempotency_key) throw new LearningV2Error('CONFLICT')
      }
      if (!canonical) { await this.collection.insertOne(document, { session }); canonical = document }
      if (!sameSource(canonical, document)) throw new LearningV2Error('CONFLICT')
      return canonical
    })
  }

  findBySubmission(actor, submissionId, questionId) {
    return this.collection.find(tenantScopedFilter(actor, {
      'source.submission_id': submissionId,
      ...(questionId ? { 'source.question_id': questionId } : {}),
    })).toArray()
  }

  findById(actor, attemptId) {
    return this.collection.findOne(tenantScopedFilter(actor, { attempt_id: attemptId }))
  }
}
