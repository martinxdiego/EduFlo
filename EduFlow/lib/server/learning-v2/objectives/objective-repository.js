import { deletionFencedDatabase } from '../../deletion-write-fence.js'
import { tenantScopedFilter } from '../auth/tenant-context.js'

export class ObjectiveRepository {
  constructor(db) { db = deletionFencedDatabase(db);
    this.collection = db.collection('learning_objectives')
  }

  async insert(actor, document) {
    await this.collection.insertOne({ ...document, tenant_id: actor.tenant_id })
    return document
  }

  async findVersion(actor, objectiveId, version) {
    return this.collection.findOne(tenantScopedFilter(actor, { objective_id: objectiveId, version }))
  }

  async findLatest(actor, objectiveId, status) {
    const query = tenantScopedFilter(actor, { objective_id: objectiveId, ...(status ? { status } : {}) })
    return this.collection.find(query).sort({ version: -1 }).limit(1).next()
  }

  async list(actor, filter = {}, limit = 50) {
    return this.collection.find(tenantScopedFilter(actor, filter)).sort({ created_at: -1, version: -1 }).limit(limit).toArray()
  }

  async publishDraft(actor, objectiveId, version, now) {
    return this.collection.findOneAndUpdate(
      tenantScopedFilter(actor, { objective_id: objectiveId, version, status: 'draft' }),
      { $set: { status: 'published', published_at: now } },
      { returnDocument: 'after' },
    )
  }
}
