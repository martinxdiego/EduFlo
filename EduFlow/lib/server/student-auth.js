import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from './database.js'
import { checkRateLimit } from './rate-limit.js'
import { studentLoginSchema, studentRegisterSchema } from './schemas/student-auth.js'
import { applyCorsHeaders, publicErrorMessage, setSessionCookie, verifyAuthToken } from './security.js'
import { parseJsonBody } from './validation.js'

function jsonResponse(body, init, request) {
  return applyCorsHeaders(NextResponse.json(body, init), request)
}

function validationResponse(result, request) {
  return jsonResponse({ error: result.error, fields: result.fields }, { status: result.status }, request)
}

function safeStudent(student) {
  const { _id, password_hash, ...safe } = student
  return safe
}

function studentSessionResponse(student, request) {
  const token = jwt.sign(
    { studentId: student.id, username: student.username, role: 'student' },
    process.env.JWT_SECRET,
    { expiresIn: '30d' },
  )
  return applyCorsHeaders(
    setSessionCookie(NextResponse.json({ student: safeStudent(student) }), token, 30 * 24 * 60 * 60),
    request,
  )
}

async function databaseWithRateLimit(request, route) {
  const db = await getDatabase()
  const retryAfter = await checkRateLimit(db, request, route, request.method)
  return { db, retryAfter }
}

export async function registerStudent(request) {
  try {
    const parsed = await parseJsonBody(request, studentRegisterSchema)
    if (!parsed.success) return validationResponse(parsed, request)
    const { username, password, displayName } = parsed.data
    const { db, retryAfter } = await databaseWithRateLimit(request, '/student/register')
    if (retryAfter) {
      const response = jsonResponse({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.' }, { status: 429 }, request)
      response.headers.set('Retry-After', String(retryAfter))
      return response
    }

    if (await db.collection('students').findOne({ username })) {
      return jsonResponse({ error: 'Dieser Benutzername ist bereits vergeben.' }, { status: 400 }, request)
    }
    const student = {
      id: uuidv4(),
      username,
      display_name: displayName,
      password_hash: await bcrypt.hash(password, 12),
      created_at: new Date(),
      total_quizzes: 0,
      total_points: 0,
      streak: 0,
      last_activity: new Date(),
    }
    await db.collection('students').insertOne(student)
    return studentSessionResponse(student, request)
  } catch (error) {
    console.error('Student registration error:', error)
    return jsonResponse({ error: publicErrorMessage(error) }, { status: 500 }, request)
  }
}

export async function loginStudent(request) {
  try {
    const parsed = await parseJsonBody(request, studentLoginSchema)
    if (!parsed.success) return validationResponse(parsed, request)
    const { username, password } = parsed.data
    const { db, retryAfter } = await databaseWithRateLimit(request, '/student/login')
    if (retryAfter) {
      const response = jsonResponse({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.' }, { status: 429 }, request)
      response.headers.set('Retry-After', String(retryAfter))
      return response
    }

    const student = await db.collection('students').findOne({ username })
    const valid = Boolean(student?.password_hash) && await bcrypt.compare(password, student.password_hash)
    if (!valid) {
      return jsonResponse({ error: 'Benutzername oder Passwort falsch.' }, { status: 401 }, request)
    }
    await db.collection('students').updateOne({ id: student.id }, { $set: { last_activity: new Date() } })
    return studentSessionResponse(student, request)
  } catch (error) {
    console.error('Student login error:', error)
    return jsonResponse({ error: publicErrorMessage(error) }, { status: 500 }, request)
  }
}

export async function currentStudent(request) {
  try {
    const session = verifyAuthToken(request)
    if (!session?.studentId || session.role !== 'student') {
      return jsonResponse({ error: 'Nicht eingeloggt.' }, { status: 401 }, request)
    }
    const db = await getDatabase()
    const student = await db.collection('students').findOne({ id: session.studentId })
    if (!student) return jsonResponse({ error: 'Schüler nicht gefunden.' }, { status: 404 }, request)
    return jsonResponse(safeStudent(student), { headers: { 'Cache-Control': 'no-store' } }, request)
  } catch (error) {
    console.error('Student session error:', error)
    return jsonResponse({ error: publicErrorMessage(error) }, { status: 500 }, request)
  }
}

export function studentAuthOptions(request) {
  return jsonResponse({}, { status: 200 }, request)
}
