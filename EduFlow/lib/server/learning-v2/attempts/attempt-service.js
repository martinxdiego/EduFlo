import { generateDomainId } from '../contracts/ids.js'
import { ATTEMPT_SCHEMA_VERSION, DETERMINISTIC_GRADER_VERSION, attemptDocumentSchema } from '../contracts/phase2.js'
import { boundedIdempotencyKey } from '../idempotency.js'
import { LearningV2Error } from '../contracts/errors.js'

export function canonicalTutorRetry(actor, attempt, { session, triggerAttempt, context }) {
  const level = session.highest_hint_level
  const source = attempt?.source
  const trigger = triggerAttempt
  const correct = attempt?.outcome?.correctness === 'correct'
  const same = (left, right, keys) => keys.every((key) => left?.[key] === right?.[key])
  if (![1, 2, 3].includes(level) || !attempt || !trigger
    || attempt.tenant_id !== actor.tenant_id || trigger.tenant_id !== actor.tenant_id || session.tenant_id !== actor.tenant_id
    || attempt.student_id !== actor.student_id || trigger.student_id !== actor.student_id || session.student_id !== actor.student_id
    || trigger.attempt_id !== session.trigger_attempt_id || trigger.source.kind !== 'legacy_submission_question'
    || source?.kind !== 'tutor_retry' || source.tutor_session_id !== session.session_id || source.hint_level !== level
    || !same(attempt.task_ref, session.task_ref, ['task_id', 'version']) || !same(attempt.task_ref, trigger.task_ref, ['task_id', 'version'])
    || !same(attempt.objective_ref, trigger.objective_ref, ['objective_id', 'version']) || !same(attempt.objective_ref, session.objective_ref, ['objective_id', 'version'])
    || !same(attempt.primary_competency_ref, trigger.primary_competency_ref, ['competency_id', 'framework_id', 'framework_version'])
    || !same(source, trigger.source, ['submission_id', 'submission_intent_id', 'assignment_id', 'worksheet_id', 'question_id', 'question_index', 'content_hash', 'hash_version', 'grading_revision'])
    || source.assignment_id !== session.assignment_id
    || !same(source, context.pin, ['worksheet_id', 'question_id', 'content_hash', 'hash_version'])
    || !same(source, context.task.source, ['worksheet_id', 'question_id', 'content_hash', 'hash_version'])
    || attempt.independence?.level !== (level <= 2 ? 'lightly_supported' : 'supported') || attempt.independence?.assistance_source !== 'tutor_hint'
    || attempt.answer?.type !== 'selected_response' || !context.question.options.includes(attempt.answer.value)
    || !['correct', 'incorrect'].includes(attempt.outcome.correctness) || correct !== (attempt.answer.value === context.question.answer)
    || attempt.outcome.grader !== 'deterministic' || attempt.outcome.grader_version !== DETERMINISTIC_GRADER_VERSION
    || attempt.outcome.score !== (correct ? 1 : 0) || attempt.outcome.max_points !== trigger.outcome.max_points
    || attempt.outcome.points_awarded !== (correct ? attempt.outcome.max_points : 0)) throw new LearningV2Error('CONFLICT')
  return { correct, hintLevel: level, supportRequired: !correct && level === 3 }
}

export class AttemptService {
  constructor(repository, events, options = {}) {
    this.repository = repository
    this.events = events
    this.generateId = options.generateId || generateDomainId
    this.now = options.now || (() => new Date())
  }

  async recordLegacyQuestion(actor, { assignment, worksheet, submission, result, task, pin, questionIndex }) {
    const idempotencyKey = boundedIdempotencyKey('attempt-v1', [
      actor.tenant_id,
      submission.id,
      submission.learning_v2_attempt_no,
      pin.task_id,
      pin.task_version,
      pin.question_id,
      result.gradingRevision,
    ])
    const primary = task.competency_targets.find((target) => target.role === 'primary')
    const now = this.now()
    const proposed = {
      attempt_id: this.generateId('att'),
      schema_version: ATTEMPT_SCHEMA_VERSION,
      tenant_id: actor.tenant_id,
      student_id: actor.actor_type === 'teacher' ? submission.student_id : actor.student_id,
      task_ref: { task_id: task.task_id, version: task.version },
      objective_ref: { objective_id: task.objective_refs[0].objective_id, version: task.objective_refs[0].version },
      primary_competency_ref: {
        competency_id: primary.competency_id,
        framework_id: primary.framework_id,
        framework_version: primary.framework_version,
      },
      supporting_competency_refs: task.competency_targets.filter((target) => target.role === 'supporting').map((target) => ({ ...target })),
      source: {
        kind: 'legacy_submission_question',
        submission_id: submission.id,
        submission_intent_id: submission.learning_v2_submission_intent_id,
        assignment_id: assignment.id,
        worksheet_id: worksheet.id,
        question_id: pin.question_id,
        question_index: questionIndex,
        source_revision: result.sourceRevision,
        content_hash: result.contentHash,
        hash_version: result.hashVersion,
        grading_revision: result.gradingRevision,
        learning_v2_attempt_no: submission.learning_v2_attempt_no,
      },
      answer: { type: 'selected_response', value: result.studentAnswer, format_version: 1 },
      outcome: {
        correctness: result.isCorrect ? 'correct' : 'incorrect',
        score: result.isCorrect ? 1 : 0,
        points_awarded: result.pointsAwarded,
        max_points: result.maxPoints,
        grader: 'deterministic',
        grader_version: DETERMINISTIC_GRADER_VERSION,
      },
      independence: { level: 'independent', assistance_source: 'none' },
      attempt_no: submission.learning_v2_attempt_no,
      numbering_scope: 'assignment_independent',
      submitted_at: submission.submitted_at,
      server_received_at: now,
      ...(Number.isFinite(submission.duration) ? { duration_ms: submission.duration * 1_000 } : {}),
      status: 'active',
      idempotency_key: idempotencyKey,
      created_at: now,
    }
    const parsed = attemptDocumentSchema.safeParse(proposed)
    if (!parsed.success) throw new TypeError('Invalid Learning V2 attempt document')
    const attempt = await this.repository.insertCanonical(actor, parsed.data)
    await this.events.record(actor, {
      type: 'ATTEMPT_RECORDED', aggregate: { type: 'legacy_submission', id: submission.id },
      correlationId: submission.id, causationId: submission.id, occurredAt: submission.submitted_at,
      payload: { attempt_id: attempt.attempt_id, question_id: pin.question_id },
    })
    return attempt
  }

  async recordTutorRetry(actor, { session, triggerAttempt, selectedResponse, isCorrect, hintLevel }) {
    const idempotencyKey = boundedIdempotencyKey('attempt-tutor-v1', [session.session_id, hintLevel])
    const now = this.now()
    const proposed = {
      ...structuredClone(triggerAttempt),
      _id: undefined,
      attempt_id: this.generateId('att'),
      source: {
        ...structuredClone(triggerAttempt.source),
        kind: 'tutor_retry',
        tutor_session_id: session.session_id,
        hint_level: hintLevel,
      },
      answer: { type: 'selected_response', value: selectedResponse, format_version: 1 },
      outcome: {
        correctness: isCorrect ? 'correct' : 'incorrect', score: isCorrect ? 1 : 0,
        points_awarded: isCorrect ? triggerAttempt.outcome.max_points : 0,
        max_points: triggerAttempt.outcome.max_points,
        grader: 'deterministic', grader_version: DETERMINISTIC_GRADER_VERSION,
      },
      independence: {
        level: hintLevel <= 2 ? 'lightly_supported' : 'supported',
        assistance_source: 'tutor_hint',
      },
      attempt_no: hintLevel,
      numbering_scope: 'tutor_session_hint_level',
      submitted_at: now,
      server_received_at: now,
      idempotency_key: idempotencyKey,
      created_at: now,
    }
    delete proposed._id
    const parsed = attemptDocumentSchema.safeParse(proposed)
    if (!parsed.success) throw new TypeError('Invalid tutor retry attempt document')
    const attempt = await this.repository.insertCanonical(actor, parsed.data)
    await this.events.record(actor, {
      type: 'ATTEMPT_RECORDED', aggregate: { type: 'attempt', id: attempt.attempt_id },
      correlationId: session.session_id, causationId: session.session_id, occurredAt: now,
      payload: { attempt_id: attempt.attempt_id, hint_level: hintLevel, assistance: 'tutor_hint' },
    })
    return attempt
  }
}
