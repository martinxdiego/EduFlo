import { withHostingPolicy } from '@/lib/server/hosting-route-policy'
import { submissionTotals as totals, requiresTeacherReview } from '@/lib/server/submission-grading'
import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server/database'
import { assignmentIdSchema, gradeSubmissionSchema } from '@/lib/server/schemas/assignments'
import { applyCorsHeaders, publicErrorMessage, verifyAuthToken } from '@/lib/server/security'
import { parseJsonBody } from '@/lib/server/validation'
import { requireAuthenticatedActor } from '@/lib/server/learning-v2/auth/learning-authorization'
import { isLearningV2Phase2DevelopmentEnabled } from '@/lib/server/learning-v2/feature-flags/learning-v2'
import { safeAfterTeacherOverride } from '@/lib/server/learning-v2/integration/teacher-override-adapter'
import { learningV2Log } from '@/lib/server/learning-v2/privacy/logger'

export const runtime = 'nodejs'

function jsonResponse(body, init, request) { return applyCorsHeaders(NextResponse.json(body, init), request) }

function withLearningV2BoundaryTimeout(operation) {
  const timeoutMs = Math.min(Math.max(Number(process.env.LEARNING_V2_LEGACY_ADAPTER_TIMEOUT_MS) || 1_500, 100), 10_000)
  let timeout
  const deadline = new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Learning V2 timeout')), timeoutMs) })
  return Promise.race([operation, deadline]).finally(() => clearTimeout(timeout))
}

async function ownedSubmission(db, submissionId, teacherId) {
  const submission = await db.collection('submissions').findOne({ id: submissionId })
  if (!submission) return { status: 404 }
  const assignment = await db.collection('assignments').findOne({ id: submission.assignment_id, teacher_id: teacherId })
  return assignment ? { submission, assignment } : { status: 403 }
}

async function gradeSubmission(request, db, session, submissionId) {
  const parsed = await parseJsonBody(request, gradeSubmissionSchema)
  if (!parsed.success) return jsonResponse({ error: parsed.error, fields: parsed.fields }, { status: parsed.status }, request)
  const access = await ownedSubmission(db, submissionId, session.userId)
  if (access.status === 404) return jsonResponse({ error: 'Abgabe nicht gefunden.' }, { status: 404 }, request)
  if (access.status === 403) return jsonResponse({ error: 'Nicht autorisiert.' }, { status: 403 }, request)
  const questionResults = access.submission.question_results || []
  const { questionIndex, pointsAwarded, feedback, teacherComment } = parsed.data
  if (questionIndex >= questionResults.length) return jsonResponse({ error: 'Ungültiger Fragenindex.' }, { status: 400 }, request)
  const question = { ...questionResults[questionIndex] }
  if (requiresTeacherReview(question) && pointsAwarded === undefined) {
    return jsonResponse({ error: 'Explizite Punktebewertung durch die Lehrperson erforderlich.', code: 'TEACHER_REVIEW_REQUIRED' }, { status: 409 }, request)
  }
  if (pointsAwarded !== undefined) {
    const maxPoints = question.maxPoints || 1
    question.pointsAwarded = Math.min(pointsAwarded, maxPoints)
    question.isCorrect = question.pointsAwarded === maxPoints ? true : question.pointsAwarded === 0 ? false : 'partial'
  }
  if (feedback !== undefined) question.feedback = feedback
  if (teacherComment !== undefined) question.teacherComment = teacherComment
  question.aiGraded = false
  question.teacherOverride = true
  question.needsManualReview = false
  questionResults[questionIndex] = question
  const calculated = totals(questionResults)
  const needsReview = calculated.needsReview
  const update = {
    question_results: questionResults, earned_points: calculated.earnedPoints, total_points: calculated.totalPoints,
    score_percentage: calculated.scorePercentage, needs_review: needsReview, swiss_grade: calculated.swissGrade,
    teacher_reviewed: true, reviewed_at: new Date(),
  }
  await db.collection('submissions').updateOne({ id: submissionId, assignment_id: access.assignment.id }, { $set: update })
  if (isLearningV2Phase2DevelopmentEnabled() && question.questionId) {
    try {
      await withLearningV2BoundaryTimeout((async () => {
        const actor = await requireAuthenticatedActor(request, { db })
        await safeAfterTeacherOverride({ db, actor, submission: access.submission, questionId: question.questionId })
      })())
    } catch (error) {
      learningV2Log('error', 'learning_v2.teacher_override_boundary_failed', {
        submission_id: submissionId, question_id: question.questionId, error_code: error?.code || 'INTERNAL_ERROR',
      })
    }
  }
  return jsonResponse({ questionResults, earnedPoints: calculated.earnedPoints, totalPoints: calculated.totalPoints,
    scorePercentage: calculated.scorePercentage, swissGrade: calculated.swissGrade, needsReview }, undefined, request)
}

async function finalizeSubmission(request, db, session, submissionId) {
  const access = await ownedSubmission(db, submissionId, session.userId)
  if (access.status === 404) return jsonResponse({ error: 'Abgabe nicht gefunden.' }, { status: 404 }, request)
  if (access.status === 403) return jsonResponse({ error: 'Nicht autorisiert.' }, { status: 403 }, request)
  const calculated = totals(access.submission.question_results || [])
  if (calculated.needsReview) {
    return jsonResponse({ error: 'Alle offenen Antworten müssen explizit durch die Lehrperson bewertet werden.', code: 'TEACHER_REVIEW_REQUIRED' }, { status: 409 }, request)
  }
  await db.collection('submissions').updateOne(
    { id: submissionId, assignment_id: access.assignment.id },
    { $set: { needs_review: false, swiss_grade: calculated.swissGrade, score_percentage: calculated.scorePercentage,
      earned_points: calculated.earnedPoints, total_points: calculated.totalPoints, teacher_reviewed: true, reviewed_at: new Date() } },
  )
  return jsonResponse(calculated, undefined, request)
}

export async function OPTIONS(request) { return jsonResponse({}, { status: 200 }, request) }

async function handleSubmissions(request, { params }) {
  const session = verifyAuthToken(request)
  if (!session?.userId || session.role === 'student') return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, request)
  const { path = [] } = await params
  const parsedId = assignmentIdSchema.safeParse(path[0])
  if (!parsedId.success) return jsonResponse({ error: 'Ungültige Abgabe-ID.' }, { status: 400 }, request)
  try {
    const db = await getDatabase()
    if (path.length === 2 && path[1] === 'grade' && request.method === 'PUT') return gradeSubmission(request, db, session, parsedId.data)
    if (path.length === 2 && path[1] === 'finalize' && request.method === 'PUT') return finalizeSubmission(request, db, session, parsedId.data)
    return jsonResponse({ error: 'Route not found' }, { status: 404 }, request)
  } catch (error) {
    console.error('Submissions API error:', error)
    return jsonResponse({ error: publicErrorMessage(error) }, { status: 500 }, request)
  }
}

export const PUT = withHostingPolicy(handleSubmissions)
