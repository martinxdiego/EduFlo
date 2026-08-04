import { createHash } from 'crypto'
import { verifyAuthToken } from './security.js'

export const DEFAULT_RATE_LIMIT_POLICIES = [
  { matches: (route, method) => method === 'POST' && route === '/auth/forgot-password', bucket: 'password-reset-request', limit: 5, windowMs: 30 * 60 * 1000 },
  { matches: (route, method) => method === 'POST' && route === '/auth/reset-password', bucket: 'password-reset-submit', limit: 10, windowMs: 30 * 60 * 1000 },
  { matches: (route, method) => method === 'DELETE' && route === '/auth/account', bucket: 'account-deletion', limit: 5, windowMs: 30 * 60 * 1000 },
  { matches: (route, method) => method === 'POST' && ['/auth/register', '/auth/login', '/auth/google', '/student/register', '/student/login'].includes(route), bucket: 'auth', limit: 10, windowMs: 15 * 60 * 1000 },
  { matches: (route, method) => method === 'GET' && route.startsWith('/student/assignment/'), bucket: 'assignment-read', limit: 60, windowMs: 10 * 60 * 1000 },
  { matches: (route, method) => method === 'POST' && route === '/student/submit', bucket: 'assignment-submit', limit: 20, windowMs: 10 * 60 * 1000 },
  { matches: (route, method) => method === 'GET' && /^\/classes\/[^/]+\/insights$/.test(route), bucket: 'class-insights', limit: 10, windowMs: 60 * 60 * 1000 },
  { matches: (route, method) => method === 'POST' && ['/generate-worksheet', '/generate-worksheet-stream', '/regenerate-worksheet', '/analyze-upload', '/chat', '/chat-add-questions', '/ki-action', '/generate-image', '/analyze-errors', '/analyze-exam-scan', '/tts', '/generate-dossier-stream'].includes(route), bucket: 'expensive', limit: 30, windowMs: 60 * 60 * 1000 },
]

function requestIdentity(request) {
  const token = verifyAuthToken(request)
  const rawIdentity = token?.userId || token?.studentId
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
  return createHash('sha256').update(String(rawIdentity)).digest('hex')
}

export async function checkRateLimit(db, request, route, method, policies = DEFAULT_RATE_LIMIT_POLICIES) {
  const policy = policies.find((candidate) => candidate.matches(route, method))
  if (!policy) return null

  const now = Date.now()
  const windowStart = Math.floor(now / policy.windowMs) * policy.windowMs
  const key = `${policy.bucket}:${requestIdentity(request)}:${windowStart}`
  const filter = { key }
  const update = {
    $inc: { count: 1 },
    $setOnInsert: {
      bucket: policy.bucket,
      created_at: new Date(now),
      expires_at: new Date(windowStart + policy.windowMs + 60_000),
    },
  }

  try {
    await db.collection('rate_limits').updateOne(filter, update, { upsert: true })
  } catch (error) {
    if (error?.code !== 11000) throw error
    await db.collection('rate_limits').updateOne(filter, { $inc: { count: 1 } })
  }

  const entry = await db.collection('rate_limits').findOne(filter, { projection: { count: 1 } })
  if ((entry?.count || 0) <= policy.limit) return null

  return Math.max(1, Math.ceil((windowStart + policy.windowMs - now) / 1000))
}
