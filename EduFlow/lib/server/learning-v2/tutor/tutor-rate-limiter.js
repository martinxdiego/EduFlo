import { deletionFencedDatabase } from '../../deletion-write-fence.js'
import { boundedIdempotencyKey } from '../idempotency.js'
import { LearningV2Error } from '../contracts/errors.js'

export class TutorRateLimiter {
  constructor(db, options = {}) { db = deletionFencedDatabase(db); this.collection = db.collection('rate_limits'); this.now = options.now || (() => new Date()) }

  async consume(keyParts, bucket, limit, windowMs, reject = false) {
    const now = this.now(); const windowStart = Math.floor(now.getTime() / windowMs) * windowMs
    const key = boundedIdempotencyKey('tutor-rate-v1', [bucket, ...keyParts, windowStart])
    try {
      await this.collection.updateOne({ key, tenant_id: keyParts[0] }, { $inc: { count: 1 }, $setOnInsert: { bucket, created_at: now, expires_at: new Date(windowStart + windowMs + 60_000) } }, { upsert: true })
    } catch (error) {
      if (error?.code !== 11000) throw error
      await this.collection.updateOne({ key, tenant_id: keyParts[0] }, { $inc: { count: 1 } })
    }
    const receipt = await this.collection.findOne({ key }, { projection: { count: 1 } })
    if ((receipt?.count || 0) <= limit) return true
    if (reject) throw new LearningV2Error('RATE_LIMITED', { retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now.getTime()) / 1_000)) })
    return false
  }

  consumeHint(actor) { return this.consume([actor.tenant_id, actor.student_id], 'tutor-hints-actor-10m', 6, 10 * 60_000, true) }

  async consumeProviderCall(actor) {
    const actorDaily = await this.consume([actor.tenant_id, actor.student_id], 'tutor-provider-actor-day', 30, 86_400_000)
    const tenantHourly = await this.consume([actor.tenant_id], 'tutor-provider-tenant-hour', 60, 3_600_000)
    const tenantDaily = await this.consume([actor.tenant_id], 'tutor-provider-tenant-day', 300, 86_400_000)
    return actorDaily && tenantHourly && tenantDaily
  }

  // Compatibility for callers outside the hardened TutorService boundary.
  allowProvider(actor) { return this.consumeProviderCall(actor) }
}
