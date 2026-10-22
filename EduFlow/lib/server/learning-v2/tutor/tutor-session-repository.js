import { deletionFencedDatabase } from '../../deletion-write-fence.js'
import { tenantScopedFilter } from '../auth/tenant-context.js'
import { LearningV2Error } from '../contracts/errors.js'

export class TutorSessionRepository {
  constructor(db) { db = deletionFencedDatabase(db); this.collection = db.collection('tutor_sessions') }

  async insertActive(actor, document) {
    try { await this.collection.insertOne(document) } catch (error) {
      if (error?.code !== 11000) throw error
    }
    const canonical = await this.collection.findOne(tenantScopedFilter(actor, { start_key: document.start_key }))
      || await this.collection.findOne(tenantScopedFilter(actor, {
        student_id: document.student_id, assignment_id: document.assignment_id,
        'task_ref.task_id': document.task_ref.task_id, 'task_ref.version': document.task_ref.version,
        status: 'active',
      }))
    if (!canonical) throw new LearningV2Error('CONFLICT')
    return canonical
  }

  findForStudent(actor, sessionId) {
    return this.collection.findOne(tenantScopedFilter(actor, { session_id: sessionId, student_id: actor.student_id }))
  }

  findActiveForSlot(actor, assignmentId, taskRef) {
    return this.collection.findOne(tenantScopedFilter(actor, { student_id: actor.student_id, assignment_id: assignmentId,
      'task_ref.task_id': taskRef.task_id, 'task_ref.version': taskRef.version, status: 'active' }))
  }

  findForTeacher(actor, studentId, sessionId) {
    return this.collection.findOne(tenantScopedFilter(actor, { session_id: sessionId, student_id: studentId }))
  }

  listForTeacherStudent(actor, studentId, objectiveIds = [], limit = 20) {
    return this.collection.find(tenantScopedFilter(actor, {
      student_id: studentId,
      ...(objectiveIds.length ? { 'objective_ref.objective_id': { $in: objectiveIds } } : {}),
    })).sort({ last_activity_at: -1, session_id: -1 }).limit(limit).toArray()
  }

  async transition(actor, session, set) {
    const result = await this.collection.findOneAndUpdate(
      tenantScopedFilter(actor, { session_id: session.session_id, student_id: actor.student_id, state_version: session.state_version }),
      { $set: { ...set }, $inc: { state_version: 1 } },
      { returnDocument: 'after' },
    )
    if (!result) throw new LearningV2Error('CONFLICT')
    return result
  }

  async reserveProviderSlot(actor, session, level, { callId, now, leaseExpiresAt }) {
    const key = `level_${level}`
    const path = `provider_slots.${key}`
    const existing = session.provider_slots?.[key]
    if (existing?.status === 'completed') return { state: 'completed', session }
    if (existing && new Date(existing.lease_expires_at) > now) return { state: 'in_progress', session }
    // Once transport_started is durable, delivery to the external provider is
    // unknowable after a crash. Never issue another transport for this slot.
    if (existing?.status === 'transport_started') return { state: 'ambiguous_transport', session }
    const slot = {
      status: 'reserved', call_id: callId, reservation_count: (existing?.reservation_count || 0) + 1,
      transport_count: 0,
      lease_expires_at: leaseExpiresAt, outcome_code: null, error_code: null,
      reserved_at: now, transport_started_at: null, completed_at: null, updated_at: now,
    }
    const filter = tenantScopedFilter(actor, {
      session_id: session.session_id, student_id: actor.student_id, status: 'active', phase: 'awaiting_hint',
      highest_hint_level: level - 1, state_version: session.state_version,
      ...(existing ? {
        [`${path}.call_id`]: existing.call_id,
        [`${path}.status`]: 'reserved',
        [`${path}.transport_count`]: 0,
        [`${path}.lease_expires_at`]: { $lte: now },
      } : { [path]: { $exists: false } }),
    })
    const reserved = await this.collection.findOneAndUpdate(filter,
      { $set: { [path]: slot, updated_at: now, last_activity_at: now }, $inc: { state_version: 1 } },
      { returnDocument: 'after' })
    if (reserved) return { state: 'owner', session: reserved }
    const canonical = await this.findForStudent(actor, session.session_id)
    const canonicalSlot = canonical?.provider_slots?.[key]
    if (canonical?.hint_receipts?.some((item) => item.hint_level === level) || canonicalSlot?.status === 'completed') {
      return { state: 'completed', session: canonical }
    }
    if (canonicalSlot && new Date(canonicalSlot.lease_expires_at) > now) return { state: 'in_progress', session: canonical }
    if (canonicalSlot?.status === 'transport_started') return { state: 'ambiguous_transport', session: canonical }
    throw new LearningV2Error('CONFLICT')
  }

  async markProviderTransportStarted(actor, session, level, callId, { now, leaseExpiresAt }) {
    const path = `provider_slots.level_${level}`
    const result = await this.collection.findOneAndUpdate(tenantScopedFilter(actor, {
      session_id: session.session_id, student_id: actor.student_id, status: 'active', phase: 'awaiting_hint',
      highest_hint_level: level - 1, state_version: session.state_version,
      [`${path}.status`]: 'reserved', [`${path}.call_id`]: callId,
      [`${path}.transport_count`]: 0, [`${path}.lease_expires_at`]: { $gt: now },
    }), {
      $set: {
        [`${path}.status`]: 'transport_started', [`${path}.transport_started_at`]: now,
        [`${path}.lease_expires_at`]: leaseExpiresAt, [`${path}.updated_at`]: now,
        updated_at: now, last_activity_at: now,
      },
      $inc: { [`${path}.transport_count`]: 1, state_version: 1 },
    }, { returnDocument: 'after' })
    if (!result) throw new LearningV2Error('OPERATION_IN_PROGRESS', { retryAfterSeconds: 1 })
    return result
  }

  async recoverAmbiguousTransportWithLocalFallback(actor, session, level, set, now) {
    const key = `level_${level}`
    const path = `provider_slots.${key}`
    const slot = session.provider_slots?.[key]
    if (!slot || slot.status !== 'transport_started' || slot.transport_count !== 1) return null
    const completedSlot = {
      ...slot,
      status: 'completed',
      reservation_count: slot.reservation_count + 1,
      lease_expires_at: now,
      outcome_code: 'LOCAL_FALLBACK',
      error_code: 'AMBIGUOUS_TRANSPORT_LOCAL_FALLBACK',
      completed_at: now,
      updated_at: now,
    }
    return this.collection.findOneAndUpdate(tenantScopedFilter(actor, {
      session_id: session.session_id, student_id: actor.student_id, status: 'active', phase: 'awaiting_hint',
      highest_hint_level: level - 1, state_version: session.state_version,
      [`${path}.status`]: 'transport_started', [`${path}.call_id`]: slot.call_id,
      [`${path}.transport_count`]: 1, [`${path}.lease_expires_at`]: { $lte: now },
    }), {
      $set: { ...set, [path]: completedSlot }, $inc: { state_version: 1 },
    }, { returnDocument: 'after' })
  }

  async commitHintWithProviderSlot(actor, session, level, callId, set, slotOutcome, now) {
    const key = `level_${level}`
    const path = `provider_slots.${key}`
    const slot = session.provider_slots?.[key]
    if (!slot || slot.call_id !== callId) return null
    const completedSlot = {
      ...slot,
      status: 'completed',
      lease_expires_at: now,
      outcome_code: slotOutcome.outcomeCode,
      error_code: slotOutcome.errorCode || null,
      completed_at: now,
      updated_at: now,
    }
    return this.collection.findOneAndUpdate(tenantScopedFilter(actor, {
      session_id: session.session_id, student_id: actor.student_id, status: 'active', phase: 'awaiting_hint',
      highest_hint_level: level - 1, state_version: session.state_version,
      [`${path}.status`]: { $in: ['reserved', 'transport_started'] },
      [`${path}.call_id`]: callId, [`${path}.lease_expires_at`]: { $gt: now },
    }), {
      $set: { ...set, [path]: completedSlot }, $inc: { state_version: 1 },
    }, { returnDocument: 'after' })
  }

  async closeExpired(actor, now) {
    const result = await this.collection.updateMany(
      tenantScopedFilter(actor, { status: 'active', expires_at: { $lte: now } }),
      { $set: { status: 'completed', phase: 'closed', outcome: 'pending', completed_at: now, updated_at: now, last_activity_at: now } },
    )
    return result.modifiedCount
  }
}
