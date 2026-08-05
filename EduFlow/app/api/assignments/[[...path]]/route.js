import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { generateUniqueCode } from '@/lib/server/access-codes'
import { getDatabase } from '@/lib/server/database'
import { assignmentIdSchema, shareAssignmentSchema, updateAssignmentSchema } from '@/lib/server/schemas/assignments'
import { applyCorsHeaders, publicErrorMessage, verifyAuthToken } from '@/lib/server/security'
import { parseJsonBody } from '@/lib/server/validation'
import { ACTIVITY_MODES, buildLearningGoalProgress, buildSupportRecommendations, normalizeAssignmentSettings } from '@/lib/learning-workflow'

export const runtime = 'nodejs'

function jsonResponse(body, init, request) { return applyCorsHeaders(NextResponse.json(body, init), request) }
function clean(document) { if (!document) return document; const { _id, ...result } = document; return result }

function assignmentSettings(document) {
  const settings = normalizeAssignmentSettings(document)
  return {
    activity_type: settings.activityType,
    activity_label: ACTIVITY_MODES[settings.activityType].label,
    feedback_mode: settings.feedbackMode,
    max_attempts: settings.maxAttempts,
    time_limit_minutes: settings.timeLimitMinutes,
    show_solutions: settings.showSolutions,
    graded: settings.graded,
    feedback_released: settings.feedbackReleased,
    learning_goals: settings.learningGoals,
    instructions: settings.instructions,
    unit: settings.unit,
  }
}

async function ownedAssignment(db, assignmentId, teacherId) {
  return db.collection('assignments').findOne({ id: assignmentId, teacher_id: teacherId })
}

async function shareAssignment(request, db, session) {
  const parsed = await parseJsonBody(request, shareAssignmentSchema)
  if (!parsed.success) return jsonResponse({ error: parsed.error, fields: parsed.fields }, { status: parsed.status }, request)
  const { worksheetId, className, classId, deadline, status, studentNames, targetNiveau } = parsed.data
  const settings = assignmentSettings(parsed.data)
  const worksheet = await db.collection('worksheets').findOne({ id: worksheetId, user_id: session.userId })
  if (!worksheet) return jsonResponse({ error: 'Material nicht gefunden.' }, { status: 404 }, request)
  let resolvedClassName = className
  if (classId) {
    const cls = await db.collection('classes').findOne({ id: classId, teacher_id: session.userId })
    if (!cls) return jsonResponse({ error: 'Klasse nicht gefunden.' }, { status: 404 }, request)
    resolvedClassName = cls.name
  }
  const code = await generateUniqueCode(db, 'assignments')
  const assignment = {
    id: uuidv4(), code, worksheet_id: worksheetId, worksheet_title: worksheet.title || 'Unbenannt',
    teacher_id: session.userId, class_id: classId || null, class_name: resolvedClassName,
    student_names: studentNames, target_niveau: targetNiveau || null, deadline: deadline || null,
    ...settings, subject: worksheet.subject || '', topic: worksheet.topic || '',
    created_at: new Date(), updated_at: new Date(), status, access_url: `/schueler?code=${code}`,
  }
  await db.collection('assignments').insertOne(assignment)
  return jsonResponse({ code, assignmentId: assignment.id, accessUrl: assignment.access_url }, { status: 201 }, request)
}

async function listAssignments(request, db, session) {
  const assignments = await db.collection('assignments').find({ teacher_id: session.userId }).sort({ created_at: -1 }).toArray()
  const ids = assignments.map((assignment) => assignment.id)
  const missingWorksheetIds = assignments.filter((assignment) => !assignment.worksheet_title).map((assignment) => assignment.worksheet_id)
  const [counts, worksheets] = await Promise.all([
    db.collection('submissions').aggregate([
      { $match: { assignment_id: { $in: ids } } },
      { $group: { _id: '$assignment_id', count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('worksheets').find({ id: { $in: missingWorksheetIds } }).project({ id: 1, title: 1 }).toArray(),
  ])
  const countMap = new Map(counts.map((entry) => [entry._id, entry.count]))
  const worksheetMap = new Map(worksheets.map((worksheet) => [worksheet.id, worksheet.title]))
  return jsonResponse(assignments.map((assignment) => ({
    ...clean(assignment),
    ...assignmentSettings(assignment),
    worksheet_title: assignment.worksheet_title || worksheetMap.get(assignment.worksheet_id) || 'Unbenannt',
    submission_count: countMap.get(assignment.id) || 0,
  })), undefined, request)
}

async function assignmentSubmissions(request, db, session, assignmentId) {
  const assignment = await ownedAssignment(db, assignmentId, session.userId)
  if (!assignment) return jsonResponse({ error: 'Aufgabe nicht gefunden.' }, { status: 404 }, request)
  const submissions = await db.collection('submissions').find({ assignment_id: assignmentId }).sort({ submitted_at: -1 }).toArray()
  return jsonResponse({ assignment: { ...clean(assignment), ...assignmentSettings(assignment) }, submissions: submissions.map(clean) }, undefined, request)
}

async function updateAssignment(request, db, session, assignmentId) {
  const parsed = await parseJsonBody(request, updateAssignmentSchema)
  if (!parsed.success) return jsonResponse({ error: parsed.error, fields: parsed.fields }, { status: parsed.status }, request)
  const updates = { ...parsed.data }
  if (Object.prototype.hasOwnProperty.call(updates, 'feedbackReleased')) {
    updates.feedback_released = updates.feedbackReleased
    delete updates.feedbackReleased
  }
  const result = await db.collection('assignments').findOneAndUpdate(
    { id: assignmentId, teacher_id: session.userId },
    { $set: { ...updates, updated_at: new Date() } },
    { returnDocument: 'after' },
  )
  if (!result) return jsonResponse({ error: 'Aufgabe nicht gefunden.' }, { status: 404 }, request)
  return jsonResponse({ ...clean(result), ...assignmentSettings(result) }, undefined, request)
}

async function deleteAssignment(request, db, session, assignmentId) {
  const assignment = await ownedAssignment(db, assignmentId, session.userId)
  if (!assignment) return jsonResponse({ error: 'Aufgabe nicht gefunden.' }, { status: 404 }, request)
  await db.collection('submissions').deleteMany({ assignment_id: assignmentId })
  await db.collection('assignments').deleteOne({ id: assignmentId, teacher_id: session.userId })
  return jsonResponse({ message: 'Aufgabe und alle Abgaben gelöscht.' }, undefined, request)
}

async function assignmentOverview(request, db, session, assignmentId) {
  const assignment = await ownedAssignment(db, assignmentId, session.userId)
  if (!assignment) return jsonResponse({ error: 'Aufgabe nicht gefunden.' }, { status: 404 }, request)
  const submissions = await db.collection('submissions').find({ assignment_id: assignmentId }).sort({ submitted_at: -1 }).toArray()
  if (!submissions.length) return jsonResponse({ students: [], submissions: [], stats: null, learningGoals: [], recommendations: [] }, undefined, request)
  const students = submissions.map((submission) => {
    const totalPoints = submission.total_points || 1
    const earnedPoints = submission.earned_points || 0
    return {
      name: submission.student_name, earnedPoints, totalPoints,
      scorePercentage: submission.score_percentage || 0,
      swissGrade: submission.swiss_grade || Math.round((earnedPoints / totalPoints * 5 + 1) * 2) / 2,
      duration: submission.duration, submittedAt: submission.submitted_at,
      needsReview: submission.needs_review, teacherReviewed: submission.teacher_reviewed,
    }
  })
  const grades = students.map((student) => student.swissGrade)
  const sortedGrades = [...grades].sort((a, b) => a - b)
  const scores = students.map((student) => student.scorePercentage)
  const gradeDistribution = {}
  for (let grade = 1; grade <= 6; grade += 0.5) gradeDistribution[grade] = 0
  for (const grade of grades) if (gradeDistribution[grade] !== undefined) gradeDistribution[grade] += 1
  const passing = grades.filter((grade) => grade >= 4).length
  const stats = {
    count: students.length,
    averageGrade: Math.round(grades.reduce((a, b) => a + b, 0) / grades.length * 10) / 10,
    medianGrade: sortedGrades[Math.floor(sortedGrades.length / 2)],
    bestGrade: Math.max(...grades), worstGrade: Math.min(...grades),
    averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    passing, failing: grades.length - passing, passRate: Math.round(passing / grades.length * 100), gradeDistribution,
  }
  const learningGoals = buildLearningGoalProgress([assignment], submissions)
  const recommendations = buildSupportRecommendations(learningGoals)
  return jsonResponse({ students, stats, learningGoals, recommendations }, undefined, request)
}

export async function OPTIONS(request) { return jsonResponse({}, { status: 200 }, request) }

async function handleAssignments(request, { params }) {
  const session = verifyAuthToken(request)
  if (!session?.userId || session.role === 'student') return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, request)
  const { path = [] } = await params
  try {
    const db = await getDatabase()
    if (!path.length && request.method === 'GET') return listAssignments(request, db, session)
    if (path.length === 1 && path[0] === 'share' && request.method === 'POST') return shareAssignment(request, db, session)
    const parsedId = assignmentIdSchema.safeParse(path[0])
    if (!parsedId.success) return jsonResponse({ error: 'Ungültige Aufgaben-ID.' }, { status: 400 }, request)
    const assignmentId = parsedId.data
    if (path.length === 1 && request.method === 'PUT') return updateAssignment(request, db, session, assignmentId)
    if (path.length === 1 && request.method === 'DELETE') return deleteAssignment(request, db, session, assignmentId)
    if (path.length === 2 && path[1] === 'submissions' && request.method === 'GET') return assignmentSubmissions(request, db, session, assignmentId)
    if (path.length === 2 && path[1] === 'overview' && request.method === 'GET') return assignmentOverview(request, db, session, assignmentId)
    return jsonResponse({ error: 'Route not found' }, { status: 404 }, request)
  } catch (error) {
    console.error('Assignments API error:', error)
    return jsonResponse({ error: publicErrorMessage(error) }, { status: 500 }, request)
  }
}

export const GET = handleAssignments
export const POST = handleAssignments
export const PUT = handleAssignments
export const DELETE = handleAssignments
