import { phase5Fixture, seedPhase5 } from './phase5-fixture.mjs'
import { createPhase4Services } from '../../lib/server/learning-v2/phase4-services.js'
import { boundedIdempotencyKey } from '../../lib/server/learning-v2/idempotency.js'

export async function seedP0(db, now = new Date('2026-08-28T00:00:00Z')) {
  const f = phase5Fixture(now)
  f.tasks.forEach((task) => {
    task.created_by = f.teacherId
    task.source.audit_snapshot.explanation = 'PRIVATE_EXPLANATION_CANARY'
    task.source.audit_snapshot.answer_index = 0
  })
  f.initialAttempt = f.attempt(f.tasks[0], false)
  f.initialAttempt.answer.value = 'Two'
  f.initialAttempt.idempotency_key = boundedIdempotencyKey('attempt-v1', [f.tenantId, f.initialAttempt.source.submission_id,
    1, f.tasks[0].task_id, f.tasks[0].version, f.tasks[0].source.question_id, 1])
  f.initialEvidence = f.evidence(f.initialAttempt)
  f.initialEvidence.idempotency_key = boundedIdempotencyKey('evidence-v1', ['evidence-policy-v1', f.initialAttempt.attempt_id, 'application', 'correctness'])
  await seedPhase5(db, f)
  f.assignment = {
    id: f.initialAttempt.source.assignment_id, teacher_id: f.teacherId, class_id: f.classId,
    worksheet_id: f.worksheetId, activity_type: 'exercise', status: 'active', max_attempts: 10,
    show_solutions: true, feedback_mode: 'immediate',
    learning_v2: { enabled: true, tenant_id: f.tenantId, task_pins: f.tasks.map((task) => ({
      task_id: task.task_id, task_version: task.version, worksheet_id: f.worksheetId,
      question_id: task.source.question_id, content_hash: task.source.content_hash, hash_version: task.source.hash_version,
    })) },
  }
  f.submission = {
    id: f.initialAttempt.source.submission_id, assignment_id: f.assignment.id, student_id: f.studentId,
    submitted_at: now, learning_v2_tenant_id: f.tenantId, learning_v2_attempt_no: 1,
    learning_v2_submission_intent_id: f.initialAttempt.source.submission_intent_id,
    learning_v2_task_pins: [f.assignment.learning_v2.task_pins[0]],
    question_results: [{ questionId: f.questions[0].question_id, type: 'multiple_choice', studentAnswer: 'Two', isCorrect: false,
      sourceRevision: 1, contentHash: f.tasks[0].source.content_hash, hashVersion: f.tasks[0].source.hash_version,
      graderVersion: f.initialAttempt.outcome.grader_version, gradingRevision: 1, pointsAwarded: 0, maxPoints: 1,
      learningV2Eligibility: { questionType: 'multiple_choice', optionCount: 3, distinctNonEmptyOptions: true, answerExactlyMatchesOption: true },
    }],
  }
  await db.collection('assignments').insertOne(f.assignment)
  await db.collection('submissions').insertOne(f.submission)
  f.services = createPhase4Services(db, { now: () => now, phase3bEnabled: false, provider: { available: () => false } })
  return f
}

export function assessmentRequest(f, overrides = {}) {
  return { schema_version: 'learning-v2-phase4-v1', competency_id: f.competencyId,
    objective_id: f.objectiveId, objective_version: 1, claim: 'supports', basis: 'single_observation',
    observed_at: f.now.toISOString(), reason: 'direct_observation', idempotency_key: 'p0-assessment-key', ...overrides }
}

export async function reachHint(f, level) {
  const tutor = f.services.tutor
  const session = await tutor.start(f.student, { schema_version: 'learning-v2-phase3-v1', submission_id: f.submission.id, question_index: 0 })
  for (let current = 1; current <= level; current += 1) {
    await tutor.hint(f.student, session.session_id, { schema_version: 'learning-v2-phase3-v1', idempotency_key: `p0-hint-${current}` })
    if (current < level) await tutor.retry(f.student, session.session_id, { schema_version: 'learning-v2-phase3-v1', selected_response: 'Two', idempotency_key: `p0-retry-${current}` })
  }
  return session
}
