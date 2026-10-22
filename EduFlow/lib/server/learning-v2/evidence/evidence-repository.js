import { tenantScopedFilter } from '../auth/tenant-context.js'
import { LearningV2Error } from '../contracts/errors.js'
import { advanceEvidenceRevision, mongoTransaction, withTenantWrite } from '../database/tenant-write.js'

export class EvidenceRepository {
  constructor(db) { this.db = db; this.collection = db.collection('evidence_events') }

  async insertCanonical(actor, document) {
    return withTenantWrite(this.db, actor, async (session) => {
      let canonical = await this.collection.findOne(tenantScopedFilter(actor, { idempotency_key: document.idempotency_key }), { session })
      if (document.tutor_terminal_slot) {
        // Recognize pre-hardening terminal records as well as the new unique slot.
        const attempts = await this.db.collection('learning_attempts').find(tenantScopedFilter(actor, {
          'source.tutor_session_id': document.tutor_terminal_slot,
        }), { session }).project({ attempt_id: 1 }).toArray()
        const terminals = await this.collection.find(tenantScopedFilter(actor, {
          $or: [{ tutor_terminal_slot: document.tutor_terminal_slot }, {
            'source.source_id': { $in: attempts.map((item) => item.attempt_id) },
            type: { $in: ['correct_after_hint', 'support_required'] },
          }],
        }), { session }).toArray()
        if (terminals.length > 1) throw new LearningV2Error('CONFLICT')
        if (terminals.length) canonical = terminals[0]
      }
      if (canonical) {
        if (canonical.source?.source_id !== document.source.source_id || canonical.student_id !== document.student_id) throw new LearningV2Error('CONFLICT')
        return canonical
      }
      await this.collection.insertOne(document, { session })
      await advanceEvidenceRevision(this.db, actor, session)
      return document
    })
  }

  async snapshotForCompetency(actor, studentId, competencyId, { includeInvalidated = false } = {}) {
    return mongoTransaction(this.db, async (session) => {
      const tenant = await this.db.collection('learning_v2_tenants').findOne(tenantScopedFilter(actor, { status: 'active' }), { session })
      if (!tenant) throw new LearningV2Error('NOT_FOUND')
      const evidence = await this.collection.find(tenantScopedFilter(actor, {
        student_id: studentId, 'target.competency_id': competencyId, ...(includeInvalidated ? {} : { status: 'active' }),
      }), { session }).sort({ occurred_at: 1, evidence_id: 1 }).toArray()
      return { evidence, sourceRevision: tenant.evidence_revision || 0 }
    })
  }

  listForCompetency(actor, studentId, competencyId, options = {}) {
    const filter = tenantScopedFilter(actor, {
      student_id: studentId,
      'target.competency_id': competencyId,
      ...(options.activeOnly ? { status: 'active' } : {}),
    })
    return this.collection.find(filter).sort({ occurred_at: 1, evidence_id: 1 }).toArray()
  }

  findById(actor, evidenceId) {
    return this.collection.findOne(tenantScopedFilter(actor, { evidence_id: evidenceId }))
  }

  async listForCompetencyPage(actor, studentId, competencyId, { filter = 'all', limit = 20, cursor } = {}) {
    const category = filter === 'independent' ? { 'independence.level': 'independent', status: 'active' }
      : filter === 'assisted' ? { type: { $in: ['correct_after_hint', 'support_required'] }, status: 'active' }
        : filter === 'teacher' ? { type: 'teacher_assessment', status: 'active' }
          : filter === 'invalidated' ? { status: 'invalidated' }
            : {}
    const before = cursor ? {
      $or: [
        { occurred_at: { $lt: cursor.occurred_at } },
        { occurred_at: cursor.occurred_at, evidence_id: { $lt: cursor.evidence_id } },
      ],
    } : {}
    const query = tenantScopedFilter(actor, {
      student_id: studentId,
      'target.competency_id': competencyId,
      ...category,
      ...before,
    })
    return this.collection.find(query).sort({ occurred_at: -1, evidence_id: -1 }).limit(limit + 1).toArray()
  }

  async invalidateOne(actor, evidenceId, invalidation) {
    return withTenantWrite(this.db, actor, async (session) => {
      const result = await this.collection.findOneAndUpdate(
        tenantScopedFilter(actor, { evidence_id: evidenceId, status: 'active' }),
        { $set: { status: 'invalidated', invalidation } },
        { returnDocument: 'after', session },
      )
      if (result) {
        await advanceEvidenceRevision(this.db, actor, session)
        return { evidence: result, changed: true }
      }
      const canonical = await this.collection.findOne(tenantScopedFilter(actor, { evidence_id: evidenceId }), { session })
      if (!canonical) throw new LearningV2Error('NOT_FOUND')
      return { evidence: canonical, changed: false }
    })
  }

  async invalidateForAttempts(actor, attemptIds, invalidation) {
    if (!attemptIds.length) return []
    const active = await this.collection.find(tenantScopedFilter(actor, {
      'source.kind': 'attempt',
      'source.source_id': { $in: attemptIds },
    })).toArray()
    const canonical = []
    for (const evidence of active) canonical.push((await this.invalidateOne(actor, evidence.evidence_id, invalidation)).evidence)
    return canonical
  }

  async bindLegacyCorrectionReceipt(actor, evidenceId, expectedKey, requestHash) {
    return withTenantWrite(this.db, actor, async (session) => {
      const filter = tenantScopedFilter(actor, { evidence_id: evidenceId, status: 'invalidated',
        'invalidation.reason': 'replaced_by_corrected_assessment', 'invalidation.idempotency_key': expectedKey })
      const canonical = await this.collection.findOne(filter, { session })
      if (!canonical?.invalidation?.replacement_evidence_id) throw new LearningV2Error('CONFLICT')
      if (!canonical.invalidation.replacement_request_hash) {
        await this.collection.updateOne(filter, { $set: { 'invalidation.replacement_request_hash': requestHash } }, { session })
        canonical.invalidation.replacement_request_hash = requestHash
      }
      return canonical
    })
  }
}
