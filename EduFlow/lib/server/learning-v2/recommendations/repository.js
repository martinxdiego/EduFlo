import { deletionFencedDatabase } from '../../deletion-write-fence.js'
import { LearningV2Error } from '../contracts/errors.js'

export const RECOMMENDATION_INDEXES = Object.freeze([
  { name: 'recommendation_id_unique', key: { tenant_id: 1, recommendation_id: 1 }, unique: true },
  { name: 'recommendation_generation_unique', key: { tenant_id: 1, generation_key: 1 }, unique: true },
  { name: 'recommendation_scope_history', key: { tenant_id: 1, student_id: 1, 'competency_ref.competency_id': 1, status: 1, created_at: -1 } },
  { name: 'recommendation_open_primary_unique', key: { tenant_id: 1, student_id: 1, 'competency_ref.competency_id': 1, 'objective_ref.objective_id': 1, 'objective_ref.version': 1, is_primary: 1 }, unique: true, partialFilterExpression: { is_primary: true, status: 'presented' } },
  { name: 'recommendation_decision_key_unique', key: { tenant_id: 1, 'decision.idempotency_key_hash': 1 }, unique: true, partialFilterExpression: { 'decision.idempotency_key_hash': { $type: 'string' } } },
  { name: 'recommendation_expiry', key: { tenant_id: 1, status: 1, expires_at: 1 } },
])
const initialized = new WeakMap()
export function ensureRecommendationIndexes(db) {
  if (!initialized.has(db)) {
    initialized.set(db, db.collection('learning_recommendations').createIndexes(RECOMMENDATION_INDEXES).catch((error) => { initialized.delete(db); throw error }))
  }
  return initialized.get(db)
}

export class RecommendationRepository {
  constructor(db) { db = deletionFencedDatabase(db); this.collection = db.collection('learning_recommendations') }
  find(actor, id) { return this.collection.findOne({ tenant_id: actor.tenant_id, recommendation_id: id }) }
  findGeneration(actor, key) { return this.collection.findOne({ tenant_id: actor.tenant_id, generation_key: key }) }
  findDecision(actor, hash) { return this.collection.findOne({ tenant_id: actor.tenant_id, 'decision.idempotency_key_hash': hash }) }
  currentScope(actor, studentId, competencyId) {
    return this.collection.find({ tenant_id: actor.tenant_id, student_id: studentId, 'competency_ref.competency_id': competencyId, status: { $in: ['presented', 'approved'] } }).toArray()
  }
  async insert(document) {
    try { await this.collection.insertOne(document); return document }
    catch (error) { if (error?.code === 11000) return null; throw error }
  }
  async retire(actor, record, reason, now) {
    if (!['presented', 'approved'].includes(record.status)) return record
    const status = reason === 'EXPIRED' && record.status === 'presented' ? 'expired' : 'superseded'
    await this.collection.updateOne({ tenant_id: actor.tenant_id, recommendation_id: record.recommendation_id, state_version: record.state_version, status: record.status }, {
      $set: { status, updated_at: now, supersession: { superseded_at: now, reason_code: reason } }, $inc: { state_version: 1 },
    })
    return this.find(actor, record.recommendation_id)
  }
  async decide(actor, record, decision) {
    try {
      await this.collection.updateOne({ tenant_id: actor.tenant_id, recommendation_id: record.recommendation_id, state_version: record.state_version, status: 'presented', decision: { $exists: false } }, {
        $set: { status: decision.action, decision, updated_at: decision.decided_at }, $inc: { state_version: 1 },
      })
    } catch (error) { if (error?.code === 11000) throw new LearningV2Error('CONFLICT'); throw error }
    return this.find(actor, record.recommendation_id)
  }
}
