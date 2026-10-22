import { createHash } from 'crypto'
import { LearningV2Error } from '../contracts/errors.js'
import { deletionFencedDatabase } from '../../deletion-write-fence.js'

const DIMENSIONS = ['tenantId', 'actorId', 'studentId', 'sessionId', 'provider']

export function buildLearningV2RateLimitKey({ bucket, windowStart, ...values }) {
  if (!/^[a-z0-9][a-z0-9:-]{0,99}$/.test(String(bucket || '')) || !Number.isFinite(windowStart) || windowStart < 0) {
    throw new TypeError('A safe rate-limit bucket and window are required')
  }
  const dimensions = DIMENSIONS
    .filter((dimension) => values[dimension] !== undefined && values[dimension] !== null && values[dimension] !== '')
    .map((dimension) => [dimension, String(values[dimension])])
  if (!dimensions.length) throw new TypeError('At least one server-resolved rate-limit dimension is required')
  const canonical = JSON.stringify(dimensions)
  const digest = createHash('sha256').update(canonical).digest('hex')
  return `learning-v2:${bucket}:${digest}:${windowStart}`
}

export async function enforceLearningV2RateLimit(db, options) {
  if (!Number.isInteger(options.limit) || options.limit < 1 || !Number.isInteger(options.windowMs) || options.windowMs < 1) {
    throw new TypeError('Positive integer rate-limit and window values are required')
  }
  const now = options.now ?? Date.now()
  const windowStart = Math.floor(now / options.windowMs) * options.windowMs
  const key = buildLearningV2RateLimitKey({ ...options.dimensions, bucket: options.bucket, windowStart })
  const collection = deletionFencedDatabase(db).collection('rate_limits')
  const filter = { key, ...(options.dimensions.tenantId ? { tenant_id: options.dimensions.tenantId } : {}) }
  try {
    await collection.updateOne(
      filter,
      { $inc: { count: 1 }, $setOnInsert: {
        key,
        bucket: `learning-v2:${options.bucket}`,
        created_at: new Date(now),
        expires_at: new Date(windowStart + options.windowMs + 60_000),
      } },
      { upsert: true },
    )
  } catch (error) {
    if (error?.code !== 11000) throw error
    await collection.updateOne(filter, { $inc: { count: 1 } })
  }
  const entry = await collection.findOne({ key }, { projection: { count: 1 } })
  if ((entry?.count || 0) > options.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + options.windowMs - now) / 1000))
    throw new LearningV2Error('RATE_LIMITED', { retryAfterSeconds })
  }
}
