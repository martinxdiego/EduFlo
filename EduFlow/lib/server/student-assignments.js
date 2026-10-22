import { deterministicWorksheetGrade, studentMaterialContent, STRUCTURED_GRADER_VERSION } from '../student-material.js'
import { submissionTotals, reviewableSubmission } from './submission-grading.js'
import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from './database.js'
import { checkRateLimit } from './rate-limit.js'
import { studentSubmissionSchema } from './schemas/assignments.js'
import { applyCorsHeaders, publicErrorMessage, verifyAuthToken } from './security.js'
import { parseJsonBody } from './validation.js'
import { ACTIVITY_MODES, isAssignmentFeedbackVisible, normalizeAssignmentSettings } from '../learning-workflow.js'
import { worksheetQuestionContentHash, WORKSHEET_QUESTION_HASH_VERSION } from './worksheet-question-identity.js'
import { requireAuthenticatedActor } from './learning-v2/auth/learning-authorization.js'
import { ensureLearningV2Indexes } from './learning-v2/database/bootstrap.js'
import { DETERMINISTIC_GRADER_VERSION, GRADING_REVISION } from './learning-v2/contracts/phase2.js'
import { isLearningV2Phase2DevelopmentEnabled, isLearningV2Phase3DevelopmentEnabled } from './learning-v2/feature-flags/learning-v2.js'
import { resolveTutorPolicy } from './learning-v2/tutor/policy.js'
import { safeAfterLegacySubmissionPersisted } from './learning-v2/integration/legacy-submission-adapter.js'
import { learningV2Log } from './learning-v2/privacy/logger.js'
import { issueSubmissionIntent, verifySubmissionIntent } from './learning-v2/submissions/submission-intent.js'
import { nextIndependentAttemptSlot } from './learning-v2/attempts/independent-slot.js'
import { LearningV2Error } from './learning-v2/contracts/errors.js'

function jsonResponse(body, init, request) { return applyCorsHeaders(NextResponse.json(body, init), request) }

function withLearningV2Timeout(operation) {
  const timeoutMs = Math.min(Math.max(Number(process.env.LEARNING_V2_LEGACY_ADAPTER_TIMEOUT_MS) || 1_500, 100), 10_000)
  let timeout
  const deadline = new Promise((_, reject) => { timeout = setTimeout(() => reject(new LearningV2Error('SERVICE_UNAVAILABLE')), timeoutMs) })
  return Promise.race([operation, deadline]).finally(() => clearTimeout(timeout))
}

function studentDraftSourceVersion(assignment, worksheet, questions) {
  const source = JSON.stringify({
    contract: 'student-assignment-draft-source-v1',
    assignment_id: assignment.id,
    assignment_revision: assignment.learning_v2_revision ?? assignment.revision ?? 0,
    worksheet_revision: worksheet.revision ?? 0,
    questions,
  })
  return `student-assignment-draft-source-v1:${createHash('sha256').update(source).digest('hex')}`
}

function publicQuestionResult(result, showSolutions, tutorEnabled, questionIndex) {
  const {
    correctAnswer, questionId, sourceRevision, contentHash, hashVersion, graderVersion, gradingRevision, teacherOverride,
    learningV2Eligibility, ...visible
  } = result
  const tutorAvailable = Boolean(tutorEnabled && result.isCorrect === false && result.learningV2Eligibility?.questionType === 'multiple_choice')
  return {
    ...visible,
    ...(showSolutions && !tutorAvailable ? { correctAnswer } : {}),
    ...(tutorAvailable ? { tutorAvailable: true, questionIndex } : {}),
  }
}

export function submissionResponseBody(submission, assignment, settings) {
  submission = reviewableSubmission(submission)
  const feedbackVisible = isAssignmentFeedbackVisible(assignment)
  const results = submission.question_results || []
  const tutorPolicy = resolveTutorPolicy(assignment, assignment.learning_v2?.tutor_preset)
  const tutorEnabled = isLearningV2Phase3DevelopmentEnabled()
    && assignment.learning_v2?.enabled
    && tutorPolicy.effective_preset !== 'TUTOR_OFF'
  return {
    correctCount: feedbackVisible ? submission.correct_count : null,
    totalQuestions: submission.total_questions,
    totalPoints: submission.total_points,
    earnedPoints: feedbackVisible ? submission.earned_points : null,
    scorePercentage: feedbackVisible ? submission.score_percentage : null,
    duration: submission.duration,
    submissionId: submission.id,
    questionResults: feedbackVisible ? results.map((result, index) => publicQuestionResult(result, settings.showSolutions, tutorEnabled, index)) : [],
    swissGrade: feedbackVisible && settings.graded ? submission.swiss_grade : null,
    needsReview: submission.needs_review,
    feedbackPending: !feedbackVisible,
    canRetry: submission.attempt_number < settings.maxAttempts,
    attemptNumber: submission.attempt_number,
    maxAttempts: settings.maxAttempts,
    activityType: settings.activityType,
  }
}

async function v2DeliveryForRead(db, request, assignment, attemptNo) {
  if (!isLearningV2Phase2DevelopmentEnabled() || !assignment.learning_v2?.enabled) return null
  try {
    const actor = await withLearningV2Timeout((async () => {
      await ensureLearningV2Indexes(db)
      return requireAuthenticatedActor(request, { db, createPersonalTenant: false })
    })())
    if (actor.actor_type !== 'student' || assignment.learning_v2.tenant_id !== actor.tenant_id) return null
    const durableSlot = await nextIndependentAttemptSlot(db, actor, assignment.id, attemptNo - 1)
    return issueSubmissionIntent({ actor, assignment, attemptNo: durableSlot }).token
  } catch (error) {
    learningV2Log('error', 'learning_v2.submission_intent_issue_failed', {
      assignment_id: assignment.id, error_code: error?.code || 'INTERNAL_ERROR',
    })
    return null
  }
}

async function verifiedV2SubmissionContext(db, request, assignment, token) {
  if (!token || !isLearningV2Phase2DevelopmentEnabled() || !assignment.learning_v2?.enabled) return null
  try {
    const actor = await withLearningV2Timeout((async () => {
      await ensureLearningV2Indexes(db)
      return requireAuthenticatedActor(request, { db, createPersonalTenant: false })
    })())
    if (actor.actor_type !== 'student') return null
    const claims = verifySubmissionIntent(token, { actor, assignment })
    return { actor, claims }
  } catch (error) {
    const rejected = ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION_ERROR'].includes(error?.code)
    learningV2Log('warn', 'learning_v2.submission_intent_rejected', {
      assignment_id: assignment.id, error_code: rejected ? error.code : 'SERVICE_UNAVAILABLE',
    })
    // An unavailable authority check is not an invalid intent. Do not consume
    // the legacy attempt cap without the validated pins needed for recovery.
    if (!rejected) throw new LearningV2Error('SERVICE_UNAVAILABLE')
    return null
  }
}

async function enforceTargetNiveau(db, assignment, session) {
  if (!assignment.target_niveau) return true
  if (!session?.studentId || !assignment.class_id) return false
  const cls = await db.collection('classes').findOne({
    id: assignment.class_id,
    enrolled_students: { $elemMatch: { student_id: session.studentId, niveau: assignment.target_niveau } },
  })
  return Boolean(cls)
}

export async function getStudentAssignment(request, { params }) {
  const { code: rawCode } = await params
  const code = String(rawCode || '').trim().toUpperCase()
  if (!/^[A-Z0-9]{4,20}$/.test(code)) return jsonResponse({ error: 'Ungültiger Aufgabencode.' }, { status: 400 }, request)
  try {
    const db = await getDatabase()
    const retryAfter = await checkRateLimit(db, request, `/student/assignment/${code}`, 'GET')
    if (retryAfter) {
      const response = jsonResponse({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.' }, { status: 429 }, request)
      response.headers.set('Retry-After', String(retryAfter)); return response
    }
    const assignment = await db.collection('assignments').findOne({ code, status: 'active' })
    if (!assignment) return jsonResponse({ error: 'Aufgabe nicht gefunden oder nicht mehr aktiv.' }, { status: 404 }, request)
    if (assignment.deadline && new Date(assignment.deadline) < new Date()) return jsonResponse({ error: 'Die Abgabefrist ist abgelaufen.' }, { status: 410 }, request)
    const session = verifyAuthToken(request)
    if (!await enforceTargetNiveau(db, assignment, session)) return jsonResponse({ error: 'Diese Aufgabe ist nicht für dein Niveau freigegeben.' }, { status: 403 }, request)
    const worksheet = await db.collection('worksheets').findOne({ id: assignment.worksheet_id })
    if (!worksheet) return jsonResponse({ error: 'Material nicht gefunden.' }, { status: 404 }, request)
    const settings = normalizeAssignmentSettings(assignment)
    const attemptCount = session?.studentId
      ? await db.collection('submissions').countDocuments({ assignment_id: assignment.id, student_id: session.studentId })
      : 0
    if (session?.studentId && attemptCount >= settings.maxAttempts) {
      return jsonResponse({ error: 'Du hast alle verfügbaren Versuche verwendet.' }, { status: 409 }, request)
    }
    const learningV2SubmissionIntent = await v2DeliveryForRead(db, request, assignment, attemptCount + 1)
    const studentContent = studentMaterialContent(worksheet.content)
    const studentQuestions = studentContent.questions
    return jsonResponse({
      title: worksheet.title, subject: worksheet.subject, grade: worksheet.grade,
      content: studentContent,
      assignmentId: assignment.id, assignmentCode: assignment.code, className: assignment.class_name,
      draftSourceVersion: studentDraftSourceVersion(assignment, worksheet, studentQuestions),
      activityType: settings.activityType, activityLabel: ACTIVITY_MODES[settings.activityType].label,
      instructions: settings.instructions, learningGoals: settings.learningGoals,
      timeLimitMinutes: settings.timeLimitMinutes, maxAttempts: settings.maxAttempts,
      attemptNumber: attemptCount + 1, feedbackMode: settings.feedbackMode,
      ...(learningV2SubmissionIntent ? { learningV2SubmissionIntent } : {}),
    }, { headers: { 'Cache-Control': 'no-store' } }, request)
  } catch (error) {
    learningV2Log('error', 'student.assignment_access_failed', {
      route_id: 'GET /api/student/assignment/[code]', error,
    })
    return jsonResponse({ error: publicErrorMessage(error) }, { status: 500 }, request)
  }
}

export async function submitStudentAssignment(request) {
  try {
    const parsed = await parseJsonBody(request, studentSubmissionSchema, 128 * 1024)
    if (!parsed.success) return jsonResponse({ error: parsed.error, fields: parsed.fields }, { status: parsed.status }, request)
    const { assignmentCode, studentName, answers, duration, learningV2SubmissionIntent } = parsed.data
    const db = await getDatabase()
    const retryAfter = await checkRateLimit(db, request, '/student/submit', 'POST')
    if (retryAfter) {
      const response = jsonResponse({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.' }, { status: 429 }, request)
      response.headers.set('Retry-After', String(retryAfter)); return response
    }
    const session = verifyAuthToken(request)
    const studentId = session?.role === 'student' ? session.studentId : null
    const assignment = await db.collection('assignments').findOne({ code: assignmentCode, status: 'active' })
    if (!assignment) return jsonResponse({ error: 'Aufgabe nicht gefunden oder nicht aktiv.' }, { status: 404 }, request)
    const settings = normalizeAssignmentSettings(assignment)
    let v2Context = await verifiedV2SubmissionContext(db, request, assignment, learningV2SubmissionIntent)
    if (v2Context && v2Context.actor.student_id === studentId) {
      const canonical = await db.collection('submissions').findOne({
        assignment_id: assignment.id,
        student_id: studentId,
        learning_v2_tenant_id: v2Context.actor.tenant_id,
        learning_v2_attempt_no: v2Context.claims.learning_v2_attempt_no,
      })
      if (canonical) {
        await safeAfterLegacySubmissionPersisted({
          db, actor: v2Context.actor, assignment, worksheet: { id: assignment.worksheet_id }, submission: canonical,
        })
        return jsonResponse(submissionResponseBody(canonical, assignment, settings), { status: 201 }, request)
      }
    } else v2Context = null
    if (assignment.deadline && new Date(assignment.deadline) < new Date()) return jsonResponse({ error: 'Die Abgabefrist ist abgelaufen.' }, { status: 410 }, request)
    if (!await enforceTargetNiveau(db, assignment, session)) return jsonResponse({ error: 'Diese Aufgabe ist nicht für dein Niveau freigegeben.' }, { status: 403 }, request)
    const attemptCount = studentId ? await db.collection('submissions').countDocuments({ assignment_id: assignment.id, student_id: studentId }) : 0
    if (studentId && attemptCount >= settings.maxAttempts) return jsonResponse({ error: 'Du hast alle verfügbaren Versuche verwendet.' }, { status: 409 }, request)
    const worksheet = await db.collection('worksheets').findOne({ id: assignment.worksheet_id })
    if (!worksheet) return jsonResponse({ error: 'Material nicht gefunden.' }, { status: 404 }, request)
    const questions = worksheet.content?.questions || []
    if (v2Context) {
      const currentSlot = await nextIndependentAttemptSlot(db, v2Context.actor, assignment.id, attemptCount)
      const pinsCurrent = (assignment.learning_v2.task_pins || []).every((pin) => {
        const question = questions.find((candidate) => candidate?.question_id === pin.question_id)
        return question && worksheetQuestionContentHash(question) === pin.content_hash && pin.hash_version === WORKSHEET_QUESTION_HASH_VERSION
      })
      if (v2Context.claims.learning_v2_attempt_no !== currentSlot) return jsonResponse({ error: 'Der Lernversuch ist nicht mehr aktuell. Bitte lade die Aufgabe neu.' }, { status: 409 }, request)
      if (!pinsCurrent) v2Context = null
    }
    if (answers.length !== questions.length) return jsonResponse({ error: 'Die Anzahl der Antworten ist ungültig.' }, { status: 400 }, request)
    const results = questions.map((question, index) => {
      const graded = deterministicWorksheetGrade(question, answers[index])
      const informational = question.type === 'image_block'
      const maxPoints = informational ? 0 : question.points || 1
      return { questionNumber: question.number, type: question.type, question: question.question, studentAnswer: answers[index],
        isInformational: informational, correctAnswer: question.answer, isCorrect: graded, feedback: graded === true ? 'Richtig!' : graded === false ? 'Nicht korrekt.' : null,
        pointsAwarded: informational ? 0 : graded === true ? maxPoints : graded === false ? 0 : null, maxPoints, aiGraded: false, needsManualReview: !informational && graded === null,
        teacherOverride: false, questionId: question.question_id, sourceRevision: Number.isInteger(worksheet.revision) ? worksheet.revision : 1,
        contentHash: worksheetQuestionContentHash(question), hashVersion: WORKSHEET_QUESTION_HASH_VERSION,
        graderVersion: graded === null ? null : question.type === 'multiple_choice' ? DETERMINISTIC_GRADER_VERSION : STRUCTURED_GRADER_VERSION, gradingRevision: GRADING_REVISION,
        learningV2Eligibility: {
          questionType: question.type,
          optionCount: Array.isArray(question.options) ? question.options.length : 0,
          distinctNonEmptyOptions: Array.isArray(question.options)
            && question.options.every((option) => typeof option === 'string' && option.trim().length > 0)
            && new Set(question.options).size === question.options.length,
          answerExactlyMatchesOption: Array.isArray(question.options) && question.options.includes(question.answer),
        } }
    })
    const { totalPoints, earnedPoints, scorePercentage, swissGrade, needsReview } = submissionTotals(results)
    const submission = { id: uuidv4(), assignment_id: assignment.id, student_id: studentId, student_name: studentName, answers,
      activity_type: settings.activityType, learning_goals: settings.learningGoals, attempt_number: attemptCount + 1,
      question_results: results, correct_count: results.filter((result) => result.isCorrect === true).length, total_questions: questions.filter(question => question.type !== 'image_block').length,
      total_points: totalPoints, earned_points: earnedPoints, score_percentage: scorePercentage, swiss_grade: swissGrade,
      needs_review: needsReview, duration, time_limit_exceeded: Boolean(settings.timeLimitMinutes && duration > settings.timeLimitMinutes * 60), submitted_at: new Date(),
      ...(v2Context ? {
        learning_v2_tenant_id: v2Context.actor.tenant_id,
        learning_v2_submission_intent_id: v2Context.claims.intent_id,
        learning_v2_attempt_no: v2Context.claims.learning_v2_attempt_no,
        learning_v2_pins_hash: v2Context.claims.pins_hash,
        learning_v2_task_pins: structuredClone(assignment.learning_v2.task_pins),
      } : {}) }
    try {
      await db.collection('submissions').insertOne(submission)
    } catch (error) {
      if (v2Context && error?.code === 11000) {
        const canonical = await db.collection('submissions').findOne({
          assignment_id: assignment.id, student_id: studentId,
          learning_v2_tenant_id: v2Context.actor.tenant_id,
          learning_v2_attempt_no: v2Context.claims.learning_v2_attempt_no,
        })
        if (canonical) {
          await safeAfterLegacySubmissionPersisted({
            db, actor: v2Context.actor, assignment, worksheet: { id: assignment.worksheet_id }, submission: canonical,
          })
          return jsonResponse(submissionResponseBody(canonical, assignment, settings), { status: 201 }, request)
        }
      }
      throw error
    }
    if (studentId) {
      const increments = { total_quizzes: 1 }
      if (!needsReview) {
        increments.total_points = earnedPoints
        increments.xp = 10 + earnedPoints + (swissGrade >= 5.5 ? 20 : swissGrade >= 4.5 ? 10 : 0) + (scorePercentage === 100 ? 25 : 0)
      }
      await db.collection('students').updateOne({ id: studentId }, { $inc: increments, $set: { last_activity: new Date() } })
    }
    // 201 acknowledges the durable legacy submission, not V2 convergence.
    // The bounded adapter can still be pending; authorized reconciliation is
    // the completion boundary for consumers that require canonical Evidence.
    if (v2Context) await safeAfterLegacySubmissionPersisted({ db, actor: v2Context.actor, assignment, worksheet, submission })
    return jsonResponse(submissionResponseBody(submission, assignment, settings), { status: 201 }, request)
  } catch (error) {
    if (error?.code === 'SERVICE_UNAVAILABLE') return jsonResponse({ error: 'Die Lernabgabe ist vorübergehend nicht verfügbar. Bitte versuche es erneut.' },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '1' } }, request)
    learningV2Log('error', 'student.assignment_submission_failed', {
      route_id: 'POST /api/student/submit', error,
    })
    return jsonResponse({ error: publicErrorMessage(error) }, { status: 500 }, request)
  }
}

export function studentAssignmentOptions(request) { return jsonResponse({}, { status: 200 }, request) }
