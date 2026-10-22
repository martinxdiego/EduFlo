import { createHash, timingSafeEqual } from 'node:crypto'
import { MongoClient } from 'mongodb'
import { resolveLearningV2Capabilities } from '@/lib/server/learning-v2/feature-flags/learning-v2'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TEST_DB_PATTERN = /^eduflow_learning_v2_test_[a-z0-9_-]+_[a-f0-9]{12}$/
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

function authorized(request) {
  const configured = process.env.LEARNING_V2_RELEASE_HANDSHAKE_TOKEN || ''
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  const expectedBuffer = Buffer.from(configured)
  const suppliedBuffer = Buffer.from(supplied)
  return configured.length >= 32 && expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer)
}

function safeReleaseConfiguration() {
  const databaseName = process.env.DB_NAME || ''
  const mongoUrl = process.env.MONGO_URL || ''
  let endpoint
  try { endpoint = new URL(mongoUrl) } catch { throw new Error('Invalid synthetic Mongo endpoint') }
  if (!TEST_DB_PATTERN.test(databaseName)) throw new Error('Invalid synthetic database identity')
  if (endpoint.protocol !== 'mongodb:' || !LOOPBACK_HOSTS.has(endpoint.hostname)) throw new Error('Non-loopback Mongo endpoint rejected')
  return { databaseName, mongoUrl }
}

function fingerprint(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16)
}

async function databaseIdentity() {
  const { databaseName, mongoUrl } = safeReleaseConfiguration()
  const client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 1_000, connectTimeoutMS: 1_000 })
  try {
    await client.connect()
    const hello = await client.db('admin').command({ hello: 1 })
    await client.db(databaseName).command({ ping: 1 })
    return { name: databaseName, status: 'available', transaction_capable: typeof hello.setName === 'string' && hello.setName.length > 0 }
  } catch {
    return { name: databaseName, status: 'unavailable', transaction_capable: false }
  } finally { await client.close().catch(() => {}) }
}

export async function GET(request) {
  if (process.env.LEARNING_V2_RELEASE_SYNTHETIC !== '1') return new Response(null, { status: 404 })
  if (!authorized(request)) return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  try {
    return Response.json({
      profile_id: process.env.LEARNING_V2_RELEASE_PROFILE_ID,
      manifest_version: process.env.LEARNING_V2_RELEASE_MANIFEST_VERSION,
      synthetic: true,
      node_env: process.env.NODE_ENV,
      flags: resolveLearningV2Capabilities(),
      credential_fingerprints: {
        jwt: fingerprint(process.env.JWT_SECRET),
        submission_intent: fingerprint(process.env.LEARNING_V2_SUBMISSION_INTENT_SECRET),
      },
      database: await databaseIdentity(),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'invalid_release_configuration' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
