import { tenantScopedFilter } from '../auth/tenant-context.js'
import { withTenantWrite } from '../database/tenant-write.js'
import { boundedIdempotencyKey, stableInputHash } from '../idempotency.js'

export class ProjectionRepository {
  constructor(db) { this.db = db; this.collection = db.collection('student_knowledge_states') }

  find(actor, studentId, competencyId) {
    return this.collection.findOne(tenantScopedFilter(actor, { student_id: studentId, competency_id: competencyId }))
  }

  async replace(actor, state, now, sourceRevision, auditReceipt) {
    if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0) throw new TypeError('Evidence snapshot revision required')
    return withTenantWrite(this.db, actor, async (session) => {
      const identity = tenantScopedFilter(actor, { student_id: state.student_id, competency_id: state.competency_id })
      const existing = await this.collection.findOne(identity, { session })
      // One bounded outbox receipt: never overwrite a persisted refresh whose
      // audit event is still missing. The service repairs it before retrying.
      if (existing?.audit_receipt && !await this.db.collection('learning_events').findOne(tenantScopedFilter(actor, {
        idempotency_key: boundedIdempotencyKey('event-v1', existing.audit_receipt.idempotencyParts),
      }), { session })) return { state: null, changed: false, conflict: true }
      if ((existing?.projection?.source_revision || 0) > sourceRevision) return { state: null, changed: false, conflict: true }
      const document = { ...state, projection: { ...state.projection, source_revision: sourceRevision }, ...(auditReceipt ? { audit_receipt: auditReceipt } : {}), created_at: existing?.created_at || now, updated_at: now }
      const comparable = (value) => { const { _id, created_at, updated_at, audit_receipt, ...semantic } = value; return semantic }
      // Compare every derived value and all source/version/as-of metadata. A
      // matching hash is not proof that persisted numerical state is intact.
      if (existing && stableInputHash(comparable(existing)) === stableInputHash(comparable(document))) return { state: existing, changed: false }
      await this.collection.replaceOne(identity, document, { upsert: true, session })
      return { state: document, changed: true, conflict: false }
    }, { sourceRevision })
  }
}
