import { requireDurableLearner, requireTeacher } from '../auth/learning-authorization.js'
import { requireTeacherStudentAccess } from '../teacher/teacher-authorization.js'
import { isLearningV2Phase2DevelopmentEnabled } from '../feature-flags/learning-v2.js'
import { learningV2Log } from '../privacy/logger.js'
import { createPhase2Services } from '../phase2-services.js'
import { DETERMINISTIC_GRADER_VERSION, EVIDENCE_POLICY_VERSION } from '../contracts/phase2.js'
import { invalidateAutomaticEvidenceForTeacherOverride } from './teacher-override-adapter.js'

function skip(reason, questionId = null) { return { status: 'skipped', reason, question_id: questionId } }

function exactTaskEligible(task, pin, worksheet, result) {
  const primary = task?.competency_targets?.filter((target) => target.role === 'primary') || []
  return task?.status === 'published'
    && task.task_id === pin.task_id
    && task.version === pin.task_version
    && task.task_type === 'selected_response'
    && task.response_modality === 'choice'
    && task.source?.worksheet_id === worksheet.id
    && task.source?.question_id === pin.question_id
    && task.source?.content_hash === pin.content_hash
    && task.source?.hash_version === pin.hash_version
    && result.contentHash === pin.content_hash
    && result.hashVersion === pin.hash_version
    && primary.length === 1
}

function storedResultEligible(result) {
  return result?.type === 'multiple_choice'
    && result.learningV2Eligibility?.questionType === 'multiple_choice'
    && result.learningV2Eligibility?.optionCount >= 3
    && result.learningV2Eligibility?.distinctNonEmptyOptions === true
    && result.learningV2Eligibility?.answerExactlyMatchesOption === true
}

export async function processLegacySubmission({ db, actor, assignment, worksheet, submission, services = createPhase2Services(db) }) {
  if (actor.actor_type === 'teacher') {
    requireTeacher(actor)
    await requireTeacherStudentAccess(db, actor, submission.student_id)
    if (assignment.teacher_id !== actor.teacher_id) return { processed: 0, skipped: [skip('TENANT_MISMATCH')] }
  } else requireDurableLearner(actor)
  const studentId = actor.actor_type === 'teacher' ? submission.student_id : actor.student_id
  if (submission.student_id !== studentId || submission.learning_v2_tenant_id !== actor.tenant_id) return { processed: 0, skipped: [skip('TENANT_MISMATCH')] }
  const pins = submission.learning_v2_task_pins || []
  if (!submission.learning_v2_submission_intent_id || !Number.isInteger(submission.learning_v2_attempt_no) || !pins.length) {
    return { processed: 0, skipped: [skip('INVALID_INTENT')] }
  }
  await services.events.record(actor, {
    type: 'LEGACY_SUBMISSION_GRADED', aggregate: { type: 'legacy_submission', id: submission.id },
    correlationId: submission.id, occurredAt: submission.submitted_at,
    actorKind: actor.actor_type, actorId: actor.actor_id,
    payload: { submission_id: submission.id, grading_revision: 1 },
  })
  const skipped = []
  const attempts = []
  const evidence = []
  const affected = new Map()
  for (const pin of pins) {
    const questionIndex = (submission.question_results || []).findIndex((candidate) => candidate?.questionId === pin.question_id)
    const result = submission.question_results?.[questionIndex]
    if (!result) { skipped.push(skip('UNPINNED_QUESTION', pin.question_id)); continue }
    if (!storedResultEligible(result)) { skipped.push(skip('QUESTION_NOT_ELIGIBLE', pin.question_id)); continue }
    if (result.studentAnswer === null || result.studentAnswer === undefined || (typeof result.studentAnswer === 'string' && result.studentAnswer.trim() === '')) {
      skipped.push(skip('UNANSWERED_NO_DEMONSTRATION', pin.question_id)); continue
    }
    if (result.questionId !== pin.question_id || result.graderVersion !== DETERMINISTIC_GRADER_VERSION) {
      skipped.push(skip('STALE_SOURCE', pin.question_id)); continue
    }
    if (result.aiGraded || result.teacherOverride) {
      if (result.teacherOverride && actor.actor_type === 'teacher') await invalidateAutomaticEvidenceForTeacherOverride({ db, actor, submission, questionId: pin.question_id, services })
      skipped.push(skip(result.teacherOverride ? 'TEACHER_OVERRIDE' : 'NON_DETERMINISTIC_RESULT', pin.question_id)); continue
    }
    if (result.needsManualReview || typeof result.isCorrect !== 'boolean') { skipped.push(skip('MANUAL_REVIEW', pin.question_id)); continue }
    const task = await db.collection('learning_tasks').findOne({
      tenant_id: actor.tenant_id, task_id: pin.task_id, version: pin.task_version,
    })
    if (!exactTaskEligible(task, pin, worksheet, result)) { skipped.push(skip('TASK_NOT_ELIGIBLE', pin.question_id)); continue }
    const attempt = await services.attempts.recordLegacyQuestion(actor, { assignment, worksheet, submission, result, task, pin, questionIndex })
    const evidenceEvent = await services.evidence.recordForAttempt(actor, attempt)
    attempts.push(attempt.attempt_id)
    if (evidenceEvent) {
      evidence.push(evidenceEvent.evidence_id)
      affected.set(attempt.primary_competency_ref.competency_id, attempt.primary_competency_ref)
    }
  }
  const states = []
  for (const competencyRef of affected.values()) {
    states.push(await services.projection.rebuild(actor, studentId, competencyRef, submission.id))
  }
  return { processed: attempts.length, attempts, evidence, state_count: states.length, skipped, evidence_policy_version: EVIDENCE_POLICY_VERSION }
}

export async function safeAfterLegacySubmissionPersisted(context) {
  if (!isLearningV2Phase2DevelopmentEnabled()) return { status: 'skipped', reason: 'FEATURE_DISABLED' }
  const timeoutMs = Math.min(Math.max(Number(process.env.LEARNING_V2_LEGACY_ADAPTER_TIMEOUT_MS) || 1_500, 100), 10_000)
  let timeout
  const operation = processLegacySubmission(context).catch((error) => {
    learningV2Log('error', 'learning_v2.legacy_adapter_failed', {
      submission_id: context.submission?.id, assignment_id: context.assignment?.id,
      error_code: error?.code || 'INTERNAL_ERROR',
    })
    return { status: 'failed', reason: 'ADAPTER_FAILURE' }
  })
  const deadline = new Promise((resolve) => {
    timeout = setTimeout(() => resolve({ status: 'failed', reason: 'ADAPTER_TIMEOUT' }), timeoutMs)
  })
  return Promise.race([operation, deadline]).finally(() => clearTimeout(timeout))
}
