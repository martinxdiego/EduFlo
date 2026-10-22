import { deletionFencedDatabase } from '../../deletion-write-fence.js'
import { tenantScopedFilter } from '../auth/tenant-context.js'
import { generateDomainId } from '../contracts/ids.js'
import { LEARNING_EVENT_SCHEMA_VERSION, learningEventDocumentSchema } from '../contracts/phase2.js'
import { boundedIdempotencyKey, stableInputHash } from '../idempotency.js'
import { LearningV2Error } from '../contracts/errors.js'

export class LearningEventRepository {
  constructor(db, options = {}) { db = deletionFencedDatabase(db);
    this.collection = db.collection('learning_events')
    this.generateId = options.generateId || generateDomainId
    this.now = options.now || (() => new Date())
  }

  async record(actor, {
    type, aggregate, correlationId, causationId = null, payload = {}, occurredAt,
    actorKind = 'system', actorId = 'learning-v2', sequence, eventId, idempotencyParts, payloadConflict = 'reject',
  }) {
    // A submission has one audit event per independent Attempt, not one for all questions.
    const independentAttemptId = type === 'ATTEMPT_RECORDED' && aggregate.type === 'legacy_submission' ? payload.attempt_id : null
    const idempotencyKey = boundedIdempotencyKey('event-v1', idempotencyParts || [type, aggregate.type, aggregate.id, independentAttemptId || (sequence ?? 'once')])
    const document = {
      event_id: eventId || this.generateId('evt'),
      event_schema_version: LEARNING_EVENT_SCHEMA_VERSION,
      tenant_id: actor.tenant_id,
      aggregate,
      ...(Number.isInteger(sequence) ? { sequence } : {}),
      type,
      occurred_at: occurredAt || this.now(),
      recorded_at: this.now(),
      actor: { kind: actorKind, id: actorId },
      correlation_id: correlationId,
      causation_id: causationId,
      payload,
      idempotency_key: idempotencyKey,
    }
    const parsed = learningEventDocumentSchema.safeParse(document)
    if (!parsed.success) throw new TypeError('Invalid Learning V2 event document')
    const legacy = !idempotencyParts ? await this.collection.findOne(tenantScopedFilter(actor, {
      type, 'aggregate.type': aggregate.type, 'aggregate.id': aggregate.id,
      ...(independentAttemptId ? { 'payload.attempt_id': independentAttemptId } : {}),
      sequence: Number.isInteger(sequence) ? sequence : { $exists: false },
    })) : null
    try { if (!legacy) await this.collection.updateOne(
      tenantScopedFilter(actor, { idempotency_key: idempotencyKey }),
      { $setOnInsert: parsed.data },
      { upsert: true },
    ) } catch (error) { if (error?.code !== 11000) throw error }
    const canonical = legacy || await this.collection.findOne(tenantScopedFilter(actor, { idempotency_key: idempotencyKey }))
      || (Number.isInteger(sequence) ? await this.findForAggregateSequence(actor, aggregate.type, aggregate.id, sequence) : null)
    if (!canonical || canonical.type !== type || stableInputHash(canonical.aggregate) !== stableInputHash(aggregate)
      || (payloadConflict !== 'canonical' && stableInputHash(canonical.payload) !== stableInputHash(payload))) throw new LearningV2Error('CONFLICT')
    return canonical
  }

  listForAggregate(actor, aggregateType, aggregateId) {
    return this.collection.find(tenantScopedFilter(actor, {
      'aggregate.type': aggregateType,
      'aggregate.id': aggregateId,
    })).sort({ sequence: 1, recorded_at: 1 }).toArray()
  }

  findForAggregateSequence(actor, aggregateType, aggregateId, sequence) {
    return this.collection.findOne(tenantScopedFilter(actor, {
      'aggregate.type': aggregateType,
      'aggregate.id': aggregateId,
      sequence,
    }))
  }
}
