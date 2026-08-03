import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import { DEFAULT_RATE_LIMIT_POLICIES } from '../lib/server/rate-limit.js'
import {
  applyCorsHeaders,
  hasBoundedJsonSize,
  isStrongPassword,
  publicErrorMessage,
  SESSION_COOKIE_NAME,
  verifyAuthToken,
} from '../lib/server/security.js'

test('password policy enforces sensible boundaries', () => {
  assert.equal(isStrongPassword('1234567'), false)
  assert.equal(isStrongPassword('12345678'), true)
  assert.equal(isStrongPassword('x'.repeat(128)), true)
  assert.equal(isStrongPassword('x'.repeat(129)), false)
})

test('JSON payload size guard rejects oversized and circular input', () => {
  assert.equal(hasBoundedJsonSize({ prompt: 'ok' }, 100), true)
  assert.equal(hasBoundedJsonSize({ prompt: 'x'.repeat(101) }, 100), false)
  const circular = {}
  circular.self = circular
  assert.equal(hasBoundedJsonSize(circular), false)
})

test('CORS never reflects wildcard configuration', () => {
  const previous = process.env.CORS_ORIGINS
  process.env.CORS_ORIGINS = '*'
  const response = applyCorsHeaders(new Response(), new Request('https://app.example/api', {
    headers: { Origin: 'https://attacker.example' },
  }))
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)
  process.env.CORS_ORIGINS = previous
})

test('CORS only allows a configured request origin', () => {
  const previous = process.env.CORS_ORIGINS
  process.env.CORS_ORIGINS = 'https://app.example,https://school.example'

  const allowed = applyCorsHeaders(new Response(), new Request('https://api.example', {
    headers: { Origin: 'https://school.example' },
  }))
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://school.example')

  const denied = applyCorsHeaders(new Response(), new Request('https://api.example', {
    headers: { Origin: 'https://attacker.example' },
  }))
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null)
  process.env.CORS_ORIGINS = previous
})

test('bearer token verification accepts valid tokens and rejects invalid tokens', () => {
  const previous = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret-with-sufficient-entropy-for-tests'
  const token = jwt.sign({ userId: 'teacher-1' }, process.env.JWT_SECRET, { expiresIn: '5m' })
  const valid = verifyAuthToken(new Request('https://app.example/api', {
    headers: { Authorization: `Bearer ${token}` },
  }))
  assert.equal(valid.userId, 'teacher-1')

  const invalid = verifyAuthToken(new Request('https://app.example/api', {
    headers: { Authorization: 'Bearer invalid-token' },
  }))
  assert.equal(invalid, null)
  process.env.JWT_SECRET = previous
})

test('HttpOnly session cookie is accepted before legacy bearer authentication', () => {
  const previous = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret-with-sufficient-entropy-for-tests'
  const token = jwt.sign({ userId: 'teacher-cookie' }, process.env.JWT_SECRET, { expiresIn: '5m' })
  const request = new Request('https://app.example/api', {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
      Authorization: 'Bearer invalid-legacy-token',
    },
  })
  assert.equal(verifyAuthToken(request)?.userId, 'teacher-cookie')
  process.env.JWT_SECRET = previous
})

test('cookie sessions reject cross-site state-changing requests', () => {
  const previousSecret = process.env.JWT_SECRET
  const previousOrigins = process.env.CORS_ORIGINS
  process.env.JWT_SECRET = 'test-secret-with-sufficient-entropy-for-tests'
  process.env.CORS_ORIGINS = 'https://app.example'
  const token = jwt.sign({ userId: 'teacher-cookie' }, process.env.JWT_SECRET, { expiresIn: '5m' })

  const crossSite = new Request('https://app.example/api/update', {
    method: 'POST',
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
      Origin: 'https://attacker.example',
    },
  })
  assert.equal(verifyAuthToken(crossSite), null)

  const sameSite = new Request('https://app.example/api/update', {
    method: 'POST',
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
      Origin: 'https://app.example',
    },
  })
  assert.equal(verifyAuthToken(sameSite)?.userId, 'teacher-cookie')
  process.env.JWT_SECRET = previousSecret
  process.env.CORS_ORIGINS = previousOrigins
})

test('production errors do not expose internal messages', () => {
  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  assert.equal(publicErrorMessage(new Error('database password leaked')), 'Internal server error')
  process.env.NODE_ENV = previous
})

test('AI-backed class insights have a dedicated per-user rate limit', () => {
  const policy = DEFAULT_RATE_LIMIT_POLICIES.find((candidate) => candidate.matches('/classes/class-1/insights', 'GET'))
  assert.equal(policy?.bucket, 'class-insights')
  assert.equal(policy?.limit, 10)
  assert.equal(policy?.windowMs, 60 * 60 * 1000)
})
