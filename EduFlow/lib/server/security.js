import jwt from 'jsonwebtoken'

const DEFAULT_MAX_JSON_CHARS = 20_000
export const SESSION_COOKIE_NAME = 'eduflow_session'

function configuredOrigins() {
  return String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin && origin !== '*')
}

export function applyCorsHeaders(response, request) {
  const origins = configuredOrigins()
  const requestOrigin = request?.headers?.get?.('origin')
  const allowedOrigin = requestOrigin && origins.includes(requestOrigin)
    ? requestOrigin
    : (!requestOrigin && origins.length === 1 ? origins[0] : null)

  if (allowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
    const vary = response.headers.get('Vary')
    if (!vary?.split(',').some((value) => value.trim().toLowerCase() === 'origin')) {
      response.headers.set('Vary', vary ? `${vary}, Origin` : 'Origin')
    }
  }

  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return response
}

function verifyJwt(token) {
  if (!token || !process.env.JWT_SECRET) return null

  try {
    return jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return null
  }
}

function cookieValue(request, name) {
  const nextCookie = request?.cookies?.get?.(name)
  if (nextCookie?.value) return nextCookie.value

  const cookieHeader = request?.headers?.get?.('cookie') || ''
  for (const entry of cookieHeader.split(';')) {
    const separator = entry.indexOf('=')
    if (separator < 0) continue
    const key = entry.slice(0, separator).trim()
    if (key === name) return decodeURIComponent(entry.slice(separator + 1).trim())
  }
  return null
}

function isTrustedCookieRequest(request) {
  const method = String(request?.method || 'GET').toUpperCase()
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true

  const origin = request?.headers?.get?.('origin')
  if (!origin) return false

  try {
    const requestOrigin = new URL(request.url).origin
    return origin === requestOrigin || configuredOrigins().includes(origin)
  } catch {
    return false
  }
}

export function verifyAuthToken(request) {
  const sessionToken = cookieValue(request, SESSION_COOKIE_NAME)
  const session = verifyJwt(sessionToken)
  if (session && isTrustedCookieRequest(request)) return session

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  return verifyJwt(authHeader.substring(7))
}

export function setSessionCookie(response, token, maxAgeSeconds) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  })
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export function clearSessionCookie(response) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export function isStrongPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128
}

export function hasBoundedJsonSize(value, maxChars = DEFAULT_MAX_JSON_CHARS) {
  try {
    return JSON.stringify(value ?? null).length <= maxChars
  } catch {
    return false
  }
}

export function publicErrorMessage(error, fallback = 'Internal server error') {
  return process.env.NODE_ENV === 'development' && error instanceof Error
    ? error.message
    : fallback
}
