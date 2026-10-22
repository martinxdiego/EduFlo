import { requireStudent } from '../auth/learning-authorization.js'
import { LearningV2Error } from '../contracts/errors.js'
import { LEARNING_V2_DATA_INVENTORY_VERSION } from './data-inventory-v1.js'

export const LEARNING_V2_SUBJECT_EXPORT_VERSION = 'learning-v2-subject-export-v1'
export const LEARNING_V2_SUBJECT_EXPORT_LIMIT = 2_000

const UNRESOLVED_EXPORT_FIELDS = Object.freeze([
  'students profile/credentials/gamification',
  'classes enrollment relationships',
  'submissions answers/studentAnswer/correctAnswer/question text/feedback/submission-intent metadata',
  'learning_attempts answer/source internal identifiers/idempotency_key',
  'evidence_events teacher_note/invalidation.note/provenance.created_by/idempotency_key',
  'learning_events payload/actor/correlation/causation/idempotency_key',
  'tutor_sessions provider slots/receipts/Reflection event text/policy/model/provider metadata',
  'learning_recommendations candidate and teacher decision history',
  'rate_limits pseudonymous counters',
])

const iso = (value) => value instanceof Date ? value.toISOString() : value == null ? null : String(value)
const ordered = (values, key) => values.sort((left, right) => String(left[key] || '').localeCompare(String(right[key] || '')))

async function boundedRows(db, collection, filter, projection, sortField) {
  let cursor = db.collection(collection).find(filter, { projection })
  if (sortField) cursor = cursor.sort({ [sortField]: 1 })
  cursor = cursor.limit(LEARNING_V2_SUBJECT_EXPORT_LIMIT + 1)
  const values = await cursor.toArray()
  if (values.length > LEARNING_V2_SUBJECT_EXPORT_LIMIT) throw new LearningV2Error('SERVICE_UNAVAILABLE')
  return values
}

function attemptDto(item) {
  return {
    attempt_id: item.attempt_id,
    schema_version: item.schema_version,
    task_ref: item.task_ref,
    objective_ref: item.objective_ref,
    primary_competency_ref: item.primary_competency_ref,
    supporting_competency_refs: item.supporting_competency_refs || [],
    source: {
      kind: item.source?.kind,
      question_index: item.source?.question_index,
      hint_level: item.source?.hint_level,
    },
    outcome: item.outcome ? {
      correctness: item.outcome.correctness,
      score: item.outcome.score,
      points_awarded: item.outcome.points_awarded,
      max_points: item.outcome.max_points,
      grader: item.outcome.grader,
      grader_version: item.outcome.grader_version,
    } : null,
    independence: item.independence,
    attempt_no: item.attempt_no,
    submitted_at: iso(item.submitted_at),
    server_received_at: iso(item.server_received_at),
    duration_ms: item.duration_ms,
    status: item.status,
  }
}

function evidenceDto(item) {
  return {
    evidence_id: item.evidence_id,
    schema_version: item.schema_version,
    type: item.type,
    target: item.target,
    claim: item.claim,
    independence: item.independence,
    source: { kind: item.source?.kind, task_id: item.source?.task_id ?? null, task_version: item.source?.task_version ?? null },
    response_modality: item.response_modality,
    tutor_weight: item.tutor_weight,
    hint_level: item.hint_level,
    assessment_basis: item.assessment_basis,
    teacher_weight: item.teacher_weight,
    occurred_at: iso(item.occurred_at),
    recorded_at: iso(item.recorded_at),
    status: item.status,
    invalidation: item.invalidation ? { reason: item.invalidation.reason, invalidated_at: iso(item.invalidation.invalidated_at) } : null,
  }
}

function stateDto(item) {
  return {
    schema_version: item.schema_version,
    competency_id: item.competency_id,
    framework_id: item.framework_id,
    framework_version: item.framework_version,
    mastery: item.mastery,
    confidence: item.confidence,
    band: item.band,
    qualifier: item.qualifier,
    evidence_count: item.evidence_count,
    weighted_evidence_volume: item.weighted_evidence_volume,
    positive_count: item.positive_count,
    negative_count: item.negative_count,
    distinct_task_count: item.distinct_task_count,
    distinct_modality_count: item.distinct_modality_count,
    distinct_producer_count: item.distinct_producer_count,
    last_evidence_at: iso(item.last_evidence_at),
    limitations: item.limitations || [],
    reason_codes: item.reason_codes || [],
    confidence_caps: item.confidence_caps || [],
    projection: item.projection ? {
      configuration_id: item.projection.configuration_id,
      algorithm: item.projection.algorithm,
      algorithm_version: item.projection.algorithm_version,
      coefficient_set_version: item.projection.coefficient_set_version,
      calibration_status: item.projection.calibration_status,
      as_of: iso(item.projection.as_of),
    } : null,
    updated_at: iso(item.updated_at),
  }
}

function sessionDto(item) {
  return {
    session_id: item.session_id,
    schema_version: item.schema_version,
    status: item.status,
    phase: item.phase,
    outcome: item.outcome,
    highest_hint_level: item.highest_hint_level,
    hint_count: item.hint_count,
    retry_count: item.retry_count,
    reflection: item.reflection ? { status: item.reflection.status, type: item.reflection.type } : null,
    started_at: iso(item.started_at),
    expires_at: iso(item.expires_at),
    completed_at: iso(item.completed_at),
  }
}

function submissionDto(item) {
  return {
    submission_id: item.id,
    assignment_id: item.assignment_id,
    activity_type: item.activity_type,
    attempt_number: item.attempt_number,
    correct_count: item.correct_count,
    total_questions: item.total_questions,
    total_points: item.total_points,
    earned_points: item.earned_points,
    score_percentage: item.score_percentage,
    swiss_grade: item.swiss_grade,
    needs_review: item.needs_review,
    duration: item.duration,
    time_limit_exceeded: item.time_limit_exceeded,
    submitted_at: iso(item.submitted_at),
    question_results: (item.question_results || []).map((result) => ({
      question_number: result.questionNumber,
      type: result.type,
      is_correct: result.isCorrect,
      points_awarded: result.pointsAwarded,
      max_points: result.maxPoints,
      needs_manual_review: result.needsManualReview,
    })),
  }
}

function eventDto(item) {
  return {
    event_id: item.event_id,
    event_schema_version: item.event_schema_version,
    aggregate_type: item.aggregate?.type,
    sequence: item.sequence,
    type: item.type,
    occurred_at: iso(item.occurred_at),
    recorded_at: iso(item.recorded_at),
  }
}

function telemetryDto(item) {
  return {
    generation_id: item.id,
    feature: item.feature,
    status: item.status,
    validation_code: item.validation_code,
    usage: item.usage ? { input_tokens: Number(item.usage.input_tokens || 0), output_tokens: Number(item.usage.output_tokens || 0) } : {},
    raw_payload_stored: item.raw_payload_stored === true,
    created_at: iso(item.created_at),
  }
}

export async function exportLearningV2Subject(db, actor, subjectId, options = {}) {
  requireStudent(actor)
  if (!actor.permissions?.includes('learning:read:self')) throw new LearningV2Error('FORBIDDEN')
  if (typeof subjectId !== 'string' || subjectId !== actor.student_id) throw new LearningV2Error('NOT_FOUND')
  const scope = { tenant_id: actor.tenant_id, student_id: actor.student_id }
  const [attemptRows, evidenceRows, stateRows, sessionRows, submissionRows, telemetryRows] = await Promise.all([
    boundedRows(db, 'learning_attempts', scope, { _id: 0, tenant_id: 0, student_id: 0, answer: 0, idempotency_key: 0 }, 'attempt_id'),
    boundedRows(db, 'evidence_events', scope, { _id: 0, tenant_id: 0, student_id: 0, teacher_note: 0, idempotency_key: 0, 'provenance.created_by': 0, 'invalidation.note': 0, 'invalidation.invalidated_by': 0, 'invalidation.idempotency_key': 0, 'invalidation.replacement_request_hash': 0 }, 'evidence_id'),
    boundedRows(db, 'student_knowledge_states', scope, { _id: 0, tenant_id: 0, student_id: 0, contribution_summary: 0, audit_receipt: 0, 'projection.input_set_hash': 0, 'projection.evidence_watermark': 0 }, 'competency_id'),
    boundedRows(db, 'tutor_sessions', scope, { _id: 0, tenant_id: 0, student_id: 0, assignment_id: 0, task_ref: 0, objective_ref: 0, trigger_attempt_id: 0, start_key: 0, policy_ref: 0, preset: 0, model_config: 0, fallback_registry_version: 0, evidence_policy_version: 0, provider_slots: 0, state_version: 0, last_sequence: 0, last_hint: 0, last_retry: 0, hint_receipts: 0, retry_receipts: 0, completion_receipt: 0 }, 'session_id'),
    boundedRows(db, 'submissions', { learning_v2_tenant_id: actor.tenant_id, student_id: actor.student_id }, { _id: 0, student_id: 0, student_name: 0, answers: 0, learning_v2_tenant_id: 0, learning_v2_submission_intent_id: 0, learning_v2_pins_hash: 0, learning_v2_task_pins: 0, 'question_results.question': 0, 'question_results.studentAnswer': 0, 'question_results.correctAnswer': 0, 'question_results.feedback': 0, 'question_results.questionId': 0, 'question_results.contentHash': 0 }, 'id'),
    boundedRows(db, 'ai_generations', { tenant_id: actor.tenant_id, user_id: actor.student_id, feature: 'learning-v2-tutor' }, { _id: 0, tenant_id: 0, user_id: 0, provider: 0, model: 0, prompt_version: 0, policy_version: 0, fallback_registry_version: 0 }, 'id'),
  ])

  const aggregateClauses = []
  const addAggregate = (type, ids) => { if (ids.length) aggregateClauses.push({ 'aggregate.type': type, 'aggregate.id': { $in: ids } }) }
  addAggregate('attempt', attemptRows.map((item) => item.attempt_id))
  addAggregate('evidence', evidenceRows.map((item) => item.evidence_id))
  addAggregate('tutor_session', sessionRows.map((item) => item.session_id))
  addAggregate('legacy_submission', submissionRows.map((item) => item.id))
  addAggregate('student_competency', [...new Set([...stateRows.map((item) => item.competency_id), ...evidenceRows.map((item) => item.target?.competency_id)].filter(Boolean))]
    .map((competencyId) => `${actor.student_id}:${competencyId}`))
  const eventRows = aggregateClauses.length ? await boundedRows(db, 'learning_events', {
    tenant_id: actor.tenant_id, $or: aggregateClauses,
  }, { _id: 0, tenant_id: 0, actor: 0, correlation_id: 0, causation_id: 0, payload: 0, idempotency_key: 0 }, 'event_id') : []

  return {
    contract_version: LEARNING_V2_SUBJECT_EXPORT_VERSION,
    inventory_version: LEARNING_V2_DATA_INVENTORY_VERSION,
    generated_at: iso(options.now || new Date()),
    scope: { tenant: 'authorized_actor_tenant', subject: 'self', synthetic_data_only: true },
    canonical_facts: {
      legacy_submissions: ordered(submissionRows.map(submissionDto), 'submission_id'),
      attempts: ordered(attemptRows.map(attemptDto), 'attempt_id'),
    },
    pedagogical_interpretations: { evidence: ordered(evidenceRows.map(evidenceDto), 'evidence_id') },
    derived_state: { knowledge_states: ordered(stateRows.map(stateDto), 'competency_id') },
    process_audit: {
      tutor_sessions: ordered(sessionRows.map(sessionDto), 'session_id'),
      learning_events: ordered(eventRows.map(eventDto), 'event_id'),
    },
    operational_metadata: { tutor_provider_usage: ordered(telemetryRows.map(telemetryDto), 'generation_id') },
    unresolved_not_exported: [...UNRESOLVED_EXPORT_FIELDS],
  }
}
