import { requireTeacher } from '../auth/learning-authorization.js'
import { requireTeacherStudentAccess } from '../teacher/teacher-authorization.js'
import { isLearningV2Phase2DevelopmentEnabled } from '../feature-flags/learning-v2.js'
import { learningV2Log } from '../privacy/logger.js'
import { createPhase2Services } from '../phase2-services.js'

export async function invalidateAutomaticEvidenceForTeacherOverride({ db, actor, submission, questionId, services = createPhase2Services(db), now = new Date() }) {
  requireTeacher(actor)
  if (!submission?.learning_v2_tenant_id || submission.learning_v2_tenant_id !== actor.tenant_id || !questionId) return { invalidated: 0 }
  await requireTeacherStudentAccess(db, actor, submission.student_id)
  const attempts = await services.attemptRepository.findBySubmission(actor, submission.id, questionId)
  const invalidated = await services.evidenceRepository.invalidateForAttempts(
    actor,
    attempts.map((attempt) => attempt.attempt_id),
    { reason: 'teacher_override', invalidated_at: now, invalidated_by: actor.teacher_id },
  )
  const affected = new Map()
  for (const evidence of invalidated) {
    const competencyRef = {
      competency_id: evidence.target.competency_id,
      framework_id: evidence.target.framework_id,
      framework_version: evidence.target.framework_version,
    }
    affected.set(competencyRef.competency_id, competencyRef)
    await services.events.record(actor, {
      type: 'EVIDENCE_INVALIDATED', aggregate: { type: 'evidence', id: evidence.evidence_id },
      correlationId: submission.id, occurredAt: evidence.invalidation.invalidated_at, actorKind: 'teacher', actorId: evidence.invalidation.invalidated_by,
      payload: { evidence_id: evidence.evidence_id, reason: evidence.invalidation.reason },
    })
  }
  for (const competencyRef of affected.values()) {
    await services.projection.rebuild(actor, submission.student_id, competencyRef, submission.id)
  }
  return { invalidated: invalidated.length, rebuilt_states: affected.size }
}

export async function safeAfterTeacherOverride(context) {
  if (!isLearningV2Phase2DevelopmentEnabled()) return { status: 'skipped', reason: 'FEATURE_DISABLED' }
  const timeoutMs = Math.min(Math.max(Number(process.env.LEARNING_V2_LEGACY_ADAPTER_TIMEOUT_MS) || 1_500, 100), 10_000)
  let timeout
  const operation = invalidateAutomaticEvidenceForTeacherOverride(context).catch((error) => {
    learningV2Log('error', 'learning_v2.teacher_override_adapter_failed', {
      submission_id: context.submission?.id, question_id: context.questionId, error_code: error?.code || 'INTERNAL_ERROR',
    })
    return { status: 'failed', reason: 'ADAPTER_FAILURE' }
  })
  const deadline = new Promise((resolve) => {
    timeout = setTimeout(() => resolve({ status: 'failed', reason: 'ADAPTER_TIMEOUT' }), timeoutMs)
  })
  return Promise.race([operation, deadline]).finally(() => clearTimeout(timeout))
}
