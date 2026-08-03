import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { generateUniqueCode } from '@/lib/server/access-codes'
import { getDatabase } from '@/lib/server/database'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { classIdSchema, classSchema, niveauSchema, studentIdSchema } from '@/lib/server/schemas/classes'
import { applyCorsHeaders, publicErrorMessage, verifyAuthToken } from '@/lib/server/security'
import { parseJsonBody } from '@/lib/server/validation'

export const runtime = 'nodejs'

function jsonResponse(body, init, request) {
  return applyCorsHeaders(NextResponse.json(body, init), request)
}

function clean(document) {
  if (!document) return document
  const { _id, ...result } = document
  return result
}

function validId(value, schema = classIdSchema) {
  const result = schema.safeParse(value)
  return result.success ? result.data : null
}

async function ownedClass(db, classId, teacherId) {
  return db.collection('classes').findOne({ id: classId, teacher_id: teacherId })
}

async function upsertClass(request, db, session) {
  const parsed = await parseJsonBody(request, classSchema)
  if (!parsed.success) return jsonResponse({ error: parsed.error, fields: parsed.fields }, { status: parsed.status }, request)
  const { name, students } = parsed.data
  const existing = await db.collection('classes').findOne({ name, teacher_id: session.userId })
  if (existing) {
    const updates = { updated_at: new Date() }
    if (students) updates.students = students
    await db.collection('classes').updateOne({ id: existing.id, teacher_id: session.userId }, { $set: updates })
    return jsonResponse(clean(await ownedClass(db, existing.id, session.userId)), undefined, request)
  }

  const created = {
    id: uuidv4(),
    name,
    teacher_id: session.userId,
    join_code: await generateUniqueCode(db, 'classes', 'join_code'),
    students: students || [],
    enrolled_students: [],
    created_at: new Date(),
    updated_at: new Date(),
  }
  await db.collection('classes').insertOne(created)
  return jsonResponse(clean(created), { status: 201 }, request)
}

async function listClasses(request, db, session) {
  const classes = await db.collection('classes').find({ teacher_id: session.userId }).sort({ name: 1 }).toArray()
  return jsonResponse(classes.map(clean), undefined, request)
}

async function classDetails(request, db, session, classId) {
  const cls = await ownedClass(db, classId, session.userId)
  if (!cls) return jsonResponse({ error: 'Klasse nicht gefunden.' }, { status: 404 }, request)
  const enrolled = cls.enrolled_students || []
  const studentIds = enrolled.map((entry) => entry.student_id)
  const assignments = await db.collection('assignments').find({ class_id: classId }).project({ id: 1 }).toArray()
  const assignmentIds = assignments.map((assignment) => assignment.id)
  const [students, submissions] = await Promise.all([
    db.collection('students').find({ id: { $in: studentIds } }).toArray(),
    db.collection('submissions').find({ student_id: { $in: studentIds }, assignment_id: { $in: assignmentIds } }).toArray(),
  ])
  const studentsById = new Map(students.map((student) => [student.id, student]))
  const enriched = enrolled.map((entry) => {
    const student = studentsById.get(entry.student_id)
    const grades = submissions.filter((submission) => submission.student_id === entry.student_id).map((submission) => submission.swiss_grade || 1)
    return {
      ...entry,
      display_name: student?.display_name || entry.display_name,
      total_quizzes: student?.total_quizzes || 0,
      total_points: student?.total_points || 0,
      xp: student?.xp || 0,
      level: student?.level || 1,
      streak: student?.streak || 0,
      avg_grade: grades.length ? Math.round(grades.reduce((sum, grade) => sum + grade, 0) / grades.length * 10) / 10 : null,
    }
  })
  return jsonResponse({ ...clean(cls), enrolled_students: enriched }, undefined, request)
}

async function updateNiveau(request, db, session, classId, studentId) {
  const parsed = await parseJsonBody(request, niveauSchema)
  if (!parsed.success) return jsonResponse({ error: parsed.error, fields: parsed.fields }, { status: parsed.status }, request)
  const result = await db.collection('classes').updateOne(
    { id: classId, teacher_id: session.userId, 'enrolled_students.student_id': studentId },
    { $set: { 'enrolled_students.$.niveau': parsed.data.niveau, updated_at: new Date() } },
  )
  if (!result.matchedCount) return jsonResponse({ error: 'Klasse oder Schüler nicht gefunden.' }, { status: 404 }, request)
  return jsonResponse({ success: true, niveau: parsed.data.niveau }, undefined, request)
}

async function removeStudent(request, db, session, classId, studentId) {
  const result = await db.collection('classes').updateOne(
    { id: classId, teacher_id: session.userId, 'enrolled_students.student_id': studentId },
    { $pull: { enrolled_students: { student_id: studentId } }, $set: { updated_at: new Date() } },
  )
  if (!result.matchedCount) return jsonResponse({ error: 'Klasse oder Schüler nicht gefunden.' }, { status: 404 }, request)
  await db.collection('students').updateOne({ id: studentId }, { $pull: { enrolled_classes: { class_id: classId } } })
  return jsonResponse({ success: true }, undefined, request)
}

async function deleteClass(request, db, session, classId) {
  const cls = await ownedClass(db, classId, session.userId)
  if (!cls) return jsonResponse({ error: 'Klasse nicht gefunden.' }, { status: 404 }, request)
  const studentIds = (cls.enrolled_students || []).map((student) => student.student_id)
  if (studentIds.length) {
    await db.collection('students').updateMany(
      { id: { $in: studentIds } },
      { $pull: { enrolled_classes: { class_id: classId } } },
    )
  }
  await db.collection('classes').deleteOne({ id: classId, teacher_id: session.userId })
  return jsonResponse({ success: true }, undefined, request)
}

async function classStats(request, db, session, classId) {
  const cls = await ownedClass(db, classId, session.userId)
  if (!cls) return jsonResponse({ error: 'Klasse nicht gefunden.' }, { status: 404 }, request)
  const assignments = await db.collection('assignments').find({ class_id: classId, teacher_id: session.userId }).toArray()
  if (!assignments.length) return jsonResponse({ assignments: [], studentStats: [], classStats: null }, undefined, request)
  const submissions = await db.collection('submissions').find({ assignment_id: { $in: assignments.map((assignment) => assignment.id) } }).toArray()
  const studentMap = new Map((cls.enrolled_students || []).map((student) => [student.student_id, {
    student_id: student.student_id, display_name: student.display_name, niveau: student.niveau || 'B', submissions: 0,
    total_earned: 0, total_possible: 0, grades: [], avg_grade: null, avg_score: null,
  }]))
  for (const submission of submissions) {
    const student = studentMap.get(submission.student_id)
    if (!student) continue
    student.submissions += 1
    student.total_earned += submission.earned_points || 0
    student.total_possible += submission.total_points || 0
    student.grades.push(submission.swiss_grade || 1)
  }
  const studentStats = [...studentMap.values()].map((student) => ({
    ...student,
    avg_grade: student.grades.length ? Math.round(student.grades.reduce((a, b) => a + b, 0) / student.grades.length * 10) / 10 : null,
    avg_score: student.total_possible ? Math.round(student.total_earned / student.total_possible * 100) : null,
  }))
  const grades = submissions.map((submission) => submission.swiss_grade || 1)
  const passing = grades.filter((grade) => grade >= 4).length
  const classStatsValue = grades.length ? {
    totalAssignments: assignments.length, totalSubmissions: submissions.length,
    avgGrade: Math.round(grades.reduce((a, b) => a + b, 0) / grades.length * 10) / 10,
    bestGrade: Math.max(...grades), worstGrade: Math.min(...grades), passing, failing: grades.length - passing,
    passRate: Math.round(passing / grades.length * 100),
    niveauStats: { A: studentStats.filter((s) => s.niveau === 'A'), B: studentStats.filter((s) => s.niveau === 'B'), C: studentStats.filter((s) => s.niveau === 'C') },
  } : null
  const summaries = assignments.map((assignment) => {
    const assignmentGrades = submissions.filter((submission) => submission.assignment_id === assignment.id).map((submission) => submission.swiss_grade || 1)
    return { id: assignment.id, title: assignment.worksheet_title, target_niveau: assignment.target_niveau, created_at: assignment.created_at,
      submission_count: assignmentGrades.length, avg_grade: assignmentGrades.length ? Math.round(assignmentGrades.reduce((a, b) => a + b, 0) / assignmentGrades.length * 10) / 10 : null }
  })
  return jsonResponse({ assignments: summaries, studentStats, classStats: classStatsValue }, undefined, request)
}

async function classInsights(request, db, session, classId) {
  const cls = await ownedClass(db, classId, session.userId)
  if (!cls) return jsonResponse({ error: 'Klasse nicht gefunden.' }, { status: 404 }, request)
  const enrolled = cls.enrolled_students || []
  const studentIds = enrolled.map((student) => student.student_id)
  if (!studentIds.length) return jsonResponse({ students: [], topicWeaknesses: [], recommendations: '' }, undefined, request)
  const assignments = await db.collection('assignments').find({ class_id: classId, teacher_id: session.userId }).toArray()
  const submissions = await db.collection('submissions').find({ assignment_id: { $in: assignments.map((assignment) => assignment.id) }, student_id: { $in: studentIds } }).toArray()
  const worksheets = await db.collection('worksheets').find({ id: { $in: assignments.map((assignment) => assignment.worksheet_id) } }).toArray()
  const assignmentMap = new Map(assignments.map((assignment) => [assignment.id, assignment]))
  const worksheetMap = new Map(worksheets.map((worksheet) => [worksheet.id, worksheet]))
  const perStudent = new Map(studentIds.map((id) => [id, { topics: {}, totalWrong: 0, totalQuestions: 0 }]))
  const topics = {}
  for (const submission of submissions) {
    const insight = perStudent.get(submission.student_id)
    if (!insight) continue
    const worksheet = worksheetMap.get(assignmentMap.get(submission.assignment_id)?.worksheet_id)
    const topic = worksheet?.topic || 'Unbekannt'
    for (const result of submission.question_results || []) {
      insight.totalQuestions += 1
      insight.topics[topic] ||= { wrong: 0, total: 0 }
      insight.topics[topic].total += 1
      topics[topic] ||= { total: 0, wrong: 0, subject: worksheet?.subject || '', studentsWrong: new Set() }
      topics[topic].total += 1
      if (result.isCorrect === false) {
        insight.totalWrong += 1; insight.topics[topic].wrong += 1; topics[topic].wrong += 1; topics[topic].studentsWrong.add(submission.student_id)
      }
    }
  }
  const students = enrolled.map((student) => {
    const insight = perStudent.get(student.student_id)
    const weakTopics = Object.entries(insight.topics).filter(([, value]) => value.total >= 2 && value.wrong / value.total > 0.3)
      .sort((a, b) => b[1].wrong / b[1].total - a[1].wrong / a[1].total).slice(0, 3)
      .map(([topic, value]) => ({ topic, errorRate: Math.round(value.wrong / value.total * 100), wrong: value.wrong, total: value.total }))
    return { student_id: student.student_id, display_name: student.display_name, niveau: student.niveau || 'B', totalQuestions: insight.totalQuestions,
      totalWrong: insight.totalWrong, errorRate: insight.totalQuestions ? Math.round(insight.totalWrong / insight.totalQuestions * 100) : 0, weakTopics, needsHelp: weakTopics.length > 0 }
  })
  const topicWeaknesses = Object.entries(topics).filter(([, value]) => value.total >= 3).map(([topic, value]) => ({
    topic, subject: value.subject, errorRate: Math.round(value.wrong / value.total * 100), affectedStudents: value.studentsWrong.size,
    totalStudents: studentIds.length, total: value.total, wrong: value.wrong,
  })).sort((a, b) => b.affectedStudents - a.affectedStudents || b.errorRate - a.errorRate)
  let recommendations = ''
  if (topicWeaknesses.length && process.env.OPENAI_API_KEY) {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const prompt = `Gib einer Schweizer Lehrperson drei konkrete Unterrichtsmassnahmen und Differenzierungsideen für diese Klassenschwächen:\n${topicWeaknesses.slice(0, 5).map((item) => `- ${item.topic}: ${item.errorRate}% Fehler, ${item.affectedStudents}/${item.totalStudents} betroffen`).join('\n')}`
      const result = await client.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 800 })
      recommendations = result.choices[0]?.message?.content || ''
    } catch (error) { console.error('Class insights AI error:', error) }
  }
  return jsonResponse({ students: students.sort((a, b) => b.errorRate - a.errorRate), topicWeaknesses, recommendations, totalSubmissions: submissions.length }, undefined, request)
}

export async function OPTIONS(request) { return jsonResponse({}, { status: 200 }, request) }

async function handleClasses(request, { params }) {
  const session = verifyAuthToken(request)
  if (!session?.userId || session.role === 'student') return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, request)
  const { path = [] } = await params
  try {
    const db = await getDatabase()
    const retryAfter = await checkRateLimit(db, request, `/classes/${path.join('/')}`.replace(/\/$/, ''), request.method)
    if (retryAfter) {
      const response = jsonResponse({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.' }, { status: 429 }, request)
      response.headers.set('Retry-After', String(retryAfter))
      return response
    }
    if (!path.length && request.method === 'GET') return listClasses(request, db, session)
    if (!path.length && request.method === 'POST') return upsertClass(request, db, session)
    const classId = validId(path[0])
    if (!classId) return jsonResponse({ error: 'Ungültige Klassen-ID.' }, { status: 400 }, request)
    if (path.length === 1 && request.method === 'GET') return classDetails(request, db, session, classId)
    if (path.length === 1 && request.method === 'DELETE') return deleteClass(request, db, session, classId)
    if (path.length === 2 && path[1] === 'stats' && request.method === 'GET') return classStats(request, db, session, classId)
    if (path.length === 2 && path[1] === 'insights' && request.method === 'GET') return classInsights(request, db, session, classId)
    if (path.length >= 3 && path[1] === 'students') {
      const studentId = validId(path[2], studentIdSchema)
      if (!studentId) return jsonResponse({ error: 'Ungültige Schüler-ID.' }, { status: 400 }, request)
      if (path.length === 3 && request.method === 'DELETE') return removeStudent(request, db, session, classId, studentId)
      if (path.length === 4 && path[3] === 'niveau' && request.method === 'PUT') return updateNiveau(request, db, session, classId, studentId)
    }
    return jsonResponse({ error: 'Route not found' }, { status: 404 }, request)
  } catch (error) {
    console.error('Classes API error:', error)
    return jsonResponse({ error: publicErrorMessage(error) }, { status: 500 }, request)
  }
}

export const GET = handleClasses
export const POST = handleClasses
export const PUT = handleClasses
export const DELETE = handleClasses
