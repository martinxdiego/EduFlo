import { unfencedDatabase } from '../../deletion-write-fence.js'
import { withTenantWrite } from '../database/tenant-write.js'
import { tenantScopedFilter } from '../auth/tenant-context.js'
import { generateDomainId } from '../contracts/ids.js'
import { tutorPolicyDocumentSchema } from '../contracts/phase3.js'
import { stableInputHash } from '../idempotency.js'

export class TutorPolicyRepository {
  constructor(db, options = {}) { db = unfencedDatabase(db); this.db = db
    this.collection = db.collection('tutor_policies')
    this.generateId = options.generateId || generateDomainId
    this.now = options.now || (() => new Date())
  }

  async createSnapshot(actor, assignmentId, resolved, createdBy) {
    return withTenantWrite(this.db, actor, async (session) => {
    const contentHash = stableInputHash({ assignment_id: assignmentId, ...resolved })
    const existing = await this.collection.findOne(tenantScopedFilter(actor, { assignment_id: assignmentId, content_hash: contentHash }), { session })
    if (existing) return existing
    const latest = await this.collection.find(tenantScopedFilter(actor, { assignment_id: assignmentId }), { session }).sort({ policy_version: -1 }).limit(1).next()
    const proposed = tutorPolicyDocumentSchema.parse({
      policy_id: this.generateId('pol'), schema_version: 'tutor-policy-v1', tenant_id: actor.tenant_id,
      assignment_id: assignmentId, ...resolved, policy_version: (latest?.policy_version || 0) + 1,
      content_hash: contentHash, immutable: true, created_by: createdBy, created_at: this.now(),
    })
    await this.collection.insertOne(proposed, { session })
    return proposed
    })
  }

  findVersion(actor, policyId, version) {
    return this.collection.findOne(tenantScopedFilter(actor, { policy_id: policyId, policy_version: version }))
  }
}
