import { requireTenantContext } from '../auth/tenant-context.js'
import { LearningV2Error } from '../contracts/errors.js'
import { guardTutorWrite } from '../tutor/interaction-context.js'

// The existing tenant is the commit fence, not another source of learning truth.
// A replica set is required; deliberately no unsafe standalone fallback.
export async function mongoTransaction(db, operation) {
  const session = db.client.startSession()
  try {
    return await session.withTransaction(() => operation(session), {
      readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
      readPreference: 'primary', maxCommitTimeMS: 10_000,
    })
  } finally { await session.endSession() }
}

export async function withTenantWrite(db, actor, operation, { sourceRevision } = {}) {
  requireTenantContext(actor)
  return mongoTransaction(db, async (session) => {
    const filter = { tenant_id: actor.tenant_id, status: 'active' }
    if (sourceRevision !== undefined) {
      if (sourceRevision === 0) filter.$or = [{ evidence_revision: 0 }, { evidence_revision: { $exists: false } }]
      else filter.evidence_revision = sourceRevision
    }
    const tenant = await db.collection('learning_v2_tenants').findOneAndUpdate(filter,
      { $inc: { write_fence: 1 } }, { session, returnDocument: 'after' })
    if (!tenant) {
      if (sourceRevision !== undefined && await db.collection('learning_v2_tenants').findOne({
        tenant_id: actor.tenant_id, status: 'active',
      }, { session })) return { state: null, changed: false, conflict: true }
      throw new LearningV2Error('NOT_FOUND')
    }
    await guardTutorWrite(db, actor, session, tenant)
    return operation(session, tenant)
  })
}

export function advanceEvidenceRevision(db, actor, session) {
  return db.collection('learning_v2_tenants').updateOne({ tenant_id: actor.tenant_id, status: 'active' },
    { $inc: { evidence_revision: 1 } }, { session })
}
