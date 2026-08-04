import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '@/lib/server/database'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { deleteTeacherAccountData } from '@/lib/server/account-deletion'
import { isTransactionalEmailConfigured, sendPasswordResetEmail } from '@/lib/server/email'
import { createPasswordResetToken, hashPasswordResetToken } from '@/lib/server/password-reset'
import {
  deleteAccountSchema,
  forgotPasswordSchema,
  googleAuthSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  teacherTypeSchema,
} from '@/lib/server/schemas/auth'
import {
  applyCorsHeaders,
  clearSessionCookie,
  publicErrorMessage,
  setSessionCookie,
  verifyAuthToken,
} from '@/lib/server/security'
import { parseJsonBody } from '@/lib/server/validation'

export const runtime = 'nodejs'

function jsonResponse(body, init, request) {
  return applyCorsHeaders(NextResponse.json(body, init), request)
}

function validationResponse(result, request) {
  return jsonResponse(
    { error: result.error, fields: result.fields },
    { status: result.status },
    request,
  )
}

function authenticatedResponse(body, token, request) {
  return applyCorsHeaders(
    setSessionCookie(NextResponse.json(body), token, 7 * 24 * 60 * 60),
    request,
  )
}

function signTeacherSession(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' },
  )
}

function safeUser(user) {
  const { _id, password_hash, google_id, ...safe } = user
  return { ...safe, has_password: Boolean(password_hash) }
}

async function register(request, db) {
  const parsed = await parseJsonBody(request, registerSchema)
  if (!parsed.success) return validationResponse(parsed, request)

  const { email, password, name } = parsed.data
  if (await db.collection('users').findOne({ email })) {
    return jsonResponse({ error: 'User already exists' }, { status: 400 }, request)
  }

  const user = {
    id: uuidv4(),
    email,
    password_hash: await bcrypt.hash(password, 12),
    name,
    subscription_tier: 'free',
    worksheets_used_this_month: 0,
    created_at: new Date(),
    month_reset_date: new Date(),
  }
  await db.collection('users').insertOne(user)

  return authenticatedResponse({ user: safeUser(user) }, signTeacherSession(user), request)
}

async function login(request, db) {
  const parsed = await parseJsonBody(request, loginSchema)
  if (!parsed.success) return validationResponse(parsed, request)

  const { email, password } = parsed.data
  const user = await db.collection('users').findOne({ email })
  const valid = Boolean(user?.password_hash) && await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    return jsonResponse({ error: 'Invalid credentials' }, { status: 401 }, request)
  }

  return authenticatedResponse({ user: safeUser(user) }, signTeacherSession(user), request)
}

async function forgotPassword(request, db) {
  if (!isTransactionalEmailConfigured()) {
    return jsonResponse(
      { error: 'Der Passwort-Reset ist derzeit noch nicht verfügbar.' },
      { status: 503 },
      request,
    )
  }

  const parsed = await parseJsonBody(request, forgotPasswordSchema)
  if (!parsed.success) return validationResponse(parsed, request)

  const genericResponse = {
    message: 'Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde ein Link zum Zurücksetzen versendet.',
  }
  const user = await db.collection('users').findOne({ email: parsed.data.email })
  if (!user) return jsonResponse(genericResponse, { status: 202 }, request)

  const { token, tokenHash, expiresAt } = createPasswordResetToken()
  const resetRecord = {
    id: uuidv4(),
    user_id: user.id,
    token_hash: tokenHash,
    created_at: new Date(),
    expires_at: expiresAt,
    used_at: null,
  }

  await db.collection('password_reset_tokens').deleteMany({ user_id: user.id })
  await db.collection('password_reset_tokens').insertOne(resetRecord)

  const origin = process.env.NEXT_PUBLIC_BASE_URL
    ? new URL(process.env.NEXT_PUBLIC_BASE_URL).origin
    : new URL(request.url).origin

  try {
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl: `${origin}/passwort-zuruecksetzen?token=${encodeURIComponent(token)}`,
      idempotencyKey: `password-reset/${resetRecord.id}`,
    })
  } catch (error) {
    await db.collection('password_reset_tokens').deleteOne({ id: resetRecord.id })
    console.error('Password reset email delivery failed')
  }

  return jsonResponse(genericResponse, { status: 202 }, request)
}

async function resetPassword(request, db) {
  const parsed = await parseJsonBody(request, resetPasswordSchema)
  if (!parsed.success) return validationResponse(parsed, request)

  const passwordHash = await bcrypt.hash(parsed.data.password, 12)
  const now = new Date()
  const resetRecord = await db.collection('password_reset_tokens').findOneAndUpdate(
    {
      token_hash: hashPasswordResetToken(parsed.data.token),
      used_at: null,
      expires_at: { $gt: now },
    },
    { $set: { used_at: now } },
    { returnDocument: 'after' },
  )

  if (!resetRecord) {
    return jsonResponse({ error: 'Dieser Link ist ungültig oder abgelaufen.' }, { status: 400 }, request)
  }

  const updated = await db.collection('users').updateOne(
    { id: resetRecord.user_id },
    { $set: { password_hash: passwordHash, password_changed_at: now } },
  )
  if (updated.matchedCount !== 1) {
    return jsonResponse({ error: 'Dieser Link ist ungültig oder abgelaufen.' }, { status: 400 }, request)
  }

  await db.collection('password_reset_tokens').deleteMany({ user_id: resetRecord.user_id })
  return jsonResponse({ success: true, message: 'Ihr Passwort wurde aktualisiert.' }, undefined, request)
}

async function deleteAccount(request, db) {
  const session = verifyAuthToken(request)
  if (!session?.userId || session.role === 'student') {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, request)
  }

  const parsed = await parseJsonBody(request, deleteAccountSchema)
  if (!parsed.success) return validationResponse(parsed, request)

  const user = await db.collection('users').findOne({ id: session.userId })
  const emailMatches = user && user.email === parsed.data.email
  const passwordMatches = !user?.password_hash
    || (Boolean(parsed.data.password) && await bcrypt.compare(parsed.data.password, user.password_hash))

  if (!emailMatches || !passwordMatches) {
    return jsonResponse({ error: 'Die Kontobestätigung ist nicht korrekt.' }, { status: 401 }, request)
  }

  const result = await deleteTeacherAccountData(db, user.id)
  if (result.deletedCount !== 1) {
    return jsonResponse({ error: 'User not found' }, { status: 404 }, request)
  }

  return applyCorsHeaders(
    clearSessionCookie(NextResponse.json({ success: true })),
    request,
  )
}

async function currentUser(request, db) {
  const session = verifyAuthToken(request)
  if (!session?.userId || session.role === 'student') {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, request)
  }

  const user = await db.collection('users').findOne({ id: session.userId })
  if (!user) return jsonResponse({ error: 'User not found' }, { status: 404 }, request)

  const now = new Date()
  const lastReset = new Date(user.month_reset_date || user.created_at || now)
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { worksheets_used_this_month: 0, month_reset_date: now } },
    )
    user.worksheets_used_this_month = 0
    user.month_reset_date = now
  }

  return jsonResponse(safeUser(user), { headers: { 'Cache-Control': 'no-store' } }, request)
}

async function updateTeacherType(request, db) {
  const session = verifyAuthToken(request)
  if (!session?.userId || session.role === 'student') {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, request)
  }

  const parsed = await parseJsonBody(request, teacherTypeSchema)
  if (!parsed.success) return validationResponse(parsed, request)

  const result = await db.collection('users').updateOne(
    { id: session.userId },
    { $set: { teacher_type: parsed.data.teacher_type } },
  )
  if (result.matchedCount !== 1) {
    return jsonResponse({ error: 'User not found' }, { status: 404 }, request)
  }
  return jsonResponse({ success: true, teacher_type: parsed.data.teacher_type }, undefined, request)
}

async function googleLogin(request, db) {
  const parsed = await parseJsonBody(request, googleAuthSchema)
  if (!parsed.success) return validationResponse(parsed, request)
  const { code, codeVerifier } = parsed.data

  const configuredOrigin = process.env.NEXT_PUBLIC_BASE_URL
    ? new URL(process.env.NEXT_PUBLIC_BASE_URL).origin
    : new URL(request.url).origin
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${configuredOrigin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  })
  const tokenData = await tokenResponse.json()
  if (!tokenResponse.ok || !tokenData.access_token) {
    console.error('Google token exchange failed:', tokenData.error)
    return jsonResponse({ error: 'Google authentication failed.' }, { status: 400 }, request)
  }

  const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  const googleUser = await userInfoResponse.json()
  const email = typeof googleUser.email === 'string' ? googleUser.email.trim().toLowerCase() : ''
  if (!userInfoResponse.ok || !email) {
    return jsonResponse({ error: 'Google authentication failed.' }, { status: 400 }, request)
  }

  let user = await db.collection('users').findOne({
    $or: [{ google_id: googleUser.id }, { email }],
  })
  if (user) {
    if (!user.google_id) {
      await db.collection('users').updateOne({ id: user.id }, { $set: { google_id: googleUser.id } })
      user.google_id = googleUser.id
    }
  } else {
    user = {
      id: uuidv4(),
      email,
      name: String(googleUser.name || email.split('@')[0]).slice(0, 100),
      google_id: googleUser.id,
      subscription_tier: 'free',
      worksheets_used_this_month: 0,
      created_at: new Date(),
      month_reset_date: new Date(),
    }
    await db.collection('users').insertOne(user)
  }

  return authenticatedResponse({ user: safeUser(user) }, signTeacherSession(user), request)
}

export async function OPTIONS(request) {
  return jsonResponse({}, { status: 200 }, request)
}

async function handleAuthRoute(request, { params }) {
  const { path = [] } = await params
  const action = path.join('/')
  const method = request.method

  try {
    if (action === 'logout' && method === 'POST') {
      return applyCorsHeaders(clearSessionCookie(NextResponse.json({ success: true })), request)
    }

    const db = await getDatabase()
    const retryAfter = await checkRateLimit(db, request, `/auth/${action}`, method)
    if (retryAfter) {
      const response = jsonResponse({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.' }, { status: 429 }, request)
      response.headers.set('Retry-After', String(retryAfter))
      return response
    }

    if (action === 'register' && method === 'POST') return register(request, db)
    if (action === 'login' && method === 'POST') return login(request, db)
    if (action === 'forgot-password' && method === 'POST') return forgotPassword(request, db)
    if (action === 'reset-password' && method === 'POST') return resetPassword(request, db)
    if (action === 'me' && method === 'GET') return currentUser(request, db)
    if (action === 'teacher-type' && method === 'PATCH') return updateTeacherType(request, db)
    if (action === 'google' && method === 'POST') return googleLogin(request, db)
    if (action === 'account' && method === 'DELETE') return deleteAccount(request, db)
    return jsonResponse({ error: 'Route not found' }, { status: 404 }, request)
  } catch (error) {
    console.error('Auth API error:', error)
    return jsonResponse({ error: publicErrorMessage(error) }, { status: 500 }, request)
  }
}

export const GET = handleAuthRoute
export const POST = handleAuthRoute
export const PATCH = handleAuthRoute
export const DELETE = handleAuthRoute
