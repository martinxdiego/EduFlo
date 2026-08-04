import { createHash, randomUUID } from 'crypto'
import { getDatabase } from '@/lib/server/database'
import { logEvent } from '@/lib/server/logger'

const DEFAULT_PRICES_USD_PER_MILLION = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4o-mini-tts': { input: 0.6, output: 12 },
  'gpt-image-2': { input: 0, output: 0 },
}

function prices() {
  try {
    return { ...DEFAULT_PRICES_USD_PER_MILLION, ...JSON.parse(process.env.AI_MODEL_PRICES_JSON || '{}') }
  } catch {
    return DEFAULT_PRICES_USD_PER_MILLION
  }
}

export function estimateCostUsd(model, usage = {}, explicitCostUsd) {
  if (Number.isFinite(explicitCostUsd)) return explicitCostUsd
  const price = prices()[model] || { input: 0, output: 0 }
  const input = usage.prompt_tokens ?? usage.input_tokens ?? 0
  const output = usage.completion_tokens ?? usage.output_tokens ?? 0
  return Number(((input * price.input + output * price.output) / 1_000_000).toFixed(6))
}

function promptFingerprint(prompt) {
  return createHash('sha256').update(String(prompt || '')).digest('hex')
}

export async function startGeneration({ userId, feature, model, prompt, metadata = {} }) {
  const id = randomUUID()
  const now = new Date()
  const record = {
    id,
    user_id: userId,
    feature,
    model,
    status: 'pending',
    prompt_hash: promptFingerprint(prompt),
    prompt_chars: String(prompt || '').length,
    metadata,
    created_at: now,
    updated_at: now,
  }
  try {
    const db = await getDatabase()
    await db.collection('ai_generations').insertOne(record)
  } catch (error) {
    logEvent('warn', 'ai.telemetry.start_failed', { generationId: id, feature, error })
  }
  return id
}

export async function completeGeneration(id, { result, usage, model, quality, metadata = {}, explicitCostUsd }) {
  const costUsd = estimateCostUsd(model, usage, explicitCostUsd)
  try {
    const db = await getDatabase()
    await db.collection('ai_generations').updateOne(
      { id },
      { $set: {
        status: 'complete',
        result,
        usage: usage || {},
        estimated_cost_usd: costUsd,
        quality: quality || null,
        metadata,
        updated_at: new Date(),
        completed_at: new Date(),
      } },
    )
  } catch (error) {
    logEvent('warn', 'ai.telemetry.complete_failed', { generationId: id, error })
  }
  return { generationId: id, estimatedCostUsd: costUsd }
}

export async function failGeneration(id, error, metadata = {}) {
  try {
    const db = await getDatabase()
    await db.collection('ai_generations').updateOne(
      { id },
      { $set: {
        status: 'error',
        error: String(error?.message || error).slice(0, 500),
        metadata,
        updated_at: new Date(),
      } },
    )
  } catch (telemetryError) {
    logEvent('warn', 'ai.telemetry.fail_failed', { generationId: id, error: telemetryError })
  }
}

export async function getAIMetrics(userId, days = 30) {
  const db = await getDatabase()
  const since = new Date(Date.now() - Math.min(Math.max(days, 1), 365) * 86400000)
  const rows = await db.collection('ai_generations').aggregate([
    { $match: { user_id: userId, created_at: { $gte: since } } },
    { $group: {
      _id: '$feature',
      requests: { $sum: 1 },
      completed: { $sum: { $cond: [{ $eq: ['$status', 'complete'] }, 1, 0] } },
      failed: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
      costUsd: { $sum: { $ifNull: ['$estimated_cost_usd', 0] } },
      inputTokens: { $sum: { $ifNull: ['$usage.prompt_tokens', { $ifNull: ['$usage.input_tokens', 0] }] } },
      outputTokens: { $sum: { $ifNull: ['$usage.completion_tokens', { $ifNull: ['$usage.output_tokens', 0] }] } },
      averageQuality: { $avg: '$quality.score' },
    } },
    { $sort: { requests: -1 } },
  ]).toArray()

  const features = rows.map(({ _id, ...row }) => ({ feature: _id, ...row, costUsd: Number(row.costUsd.toFixed(4)) }))
  return {
    periodDays: Math.min(Math.max(days, 1), 365),
    totals: features.reduce((acc, row) => ({
      requests: acc.requests + row.requests,
      completed: acc.completed + row.completed,
      failed: acc.failed + row.failed,
      costUsd: Number((acc.costUsd + row.costUsd).toFixed(4)),
      inputTokens: acc.inputTokens + row.inputTokens,
      outputTokens: acc.outputTokens + row.outputTokens,
    }), { requests: 0, completed: 0, failed: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 }),
    features,
  }
}
