import { requireTeacher } from '../auth/learning-authorization.js'
import { LearningV2Error, validationError } from '../contracts/errors.js'
import { EVIDENCE_SCHEMA_VERSION, evidenceDocumentSchema } from '../contracts/phase2.js'
import {
  ASSISTED_INVALIDATION_REASONS,
  AUTOMATIC_INVALIDATION_REASONS,
  PHASE_4_SCHEMA_VERSION,
  SUPPORT_INVALIDATION_REASONS,
  TEACHER_CALIBRATION_STATUS,
  TEACHER_EVIDENCE_POLICY_VERSION,
  TEACHER_EVIDENCE_WEIGHTS,
  TEACHER_INVALIDATION_REASONS,
  TEACHER_PRODUCER_VERSION,
  responseModalityForTeacherBasis,
  teacherAssessmentRequestSchema,
  teacherInvalidationRequestSchema,
} from '../contracts/phase4.js'
import { generateDomainId } from '../contracts/ids.js'
import { boundedIdempotencyKey, stableInputHash } from '../idempotency.js'
import { REFLECTION_NO_MASTERY_STATEMENT } from '../contracts/phase3b.js'
import { requireTeacherStudentAccess } from './teacher-authorization.js'
import {
  CONFIDENCE_MEANING,
  changeExplanation,
  confidenceLabel,
  limitationLabels,
  masteryLabel,
  roundEstimate,
  teacherReasonStatements,
} from './display-model.js'

function iso(value) { return value instanceof Date ? value.toISOString() : value }
function parse(schema, input) {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw validationError(parsed.error)
  return parsed.data
}
function stripEmpty(value) { return typeof value === 'string' && value.trim() ? value.trim() : undefined }
function cursorEncode(item) {
  return Buffer.from(JSON.stringify({ occurred_at: iso(item.occurred_at), evidence_id: item.evidence_id })).toString('base64url')
}
function cursorDecode(value) {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    const occurredAt = new Date(parsed.occurred_at)
    if (!Number.isFinite(occurredAt.getTime()) || typeof parsed.evidence_id !== 'string') throw new Error('invalid cursor')
    return { occurred_at: occurredAt, evidence_id: parsed.evidence_id }
  } catch {
    throw new LearningV2Error('VALIDATION_ERROR')
  }
}

function allowedReasonsFor(evidence) {
  if (['correct_answer', 'incorrect_answer'].includes(evidence.type)) return AUTOMATIC_INVALIDATION_REASONS
  if (evidence.type === 'correct_after_hint') return ASSISTED_INVALIDATION_REASONS
  if (evidence.type === 'support_required') return SUPPORT_INVALIDATION_REASONS
  if (evidence.type === 'teacher_assessment') return TEACHER_INVALIDATION_REASONS
  return []
}

export class TeacherLearningService {
  constructor(db, dependencies, options = {}) {
    this.db = db
    Object.assign(this, dependencies)
    this.generateId = options.generateId || generateDomainId
    this.now = options.now || (() => new Date())
  }

  async orientation(actor, studentId) {
    return requireTeacherStudentAccess(this.db, actor, studentId)
  }

  async labels(actor, competencyId, objectiveRef) {
    const [node, objective] = await Promise.all([
      this.db.collection('curriculum_nodes').findOne({
        competency_id: competencyId,
        status: 'active',
        $or: [{ tenant_id: null }, { tenant_id: actor.tenant_id }],
      }, { projection: { _id: 0, competency_id: 1, labels: 1, external_reference: 1, authoritative: 1, framework_ref: 1 } }),
      objectiveRef ? this.db.collection('learning_objectives').findOne({
        tenant_id: actor.tenant_id,
        objective_id: objectiveRef.objective_id,
        version: objectiveRef.version,
      }, { projection: { _id: 0, objective_id: 1, version: 1, title: 1, learner_statement: 1 } }) : null,
    ])
    const labelValues = Object.values(node?.labels || {}).filter((value) => typeof value === 'string' && value.trim())
    return {
      competency: {
        competency_id: competencyId,
        label: labelValues[0] || objective?.title || 'Competency',
        authoritative: node?.authoritative !== false,
        external_code: node?.external_reference?.code || null,
      },
      objective: objective ? {
        objective_id: objective.objective_id,
        version: objective.version,
        title: objective.title,
        learner_statement: objective.learner_statement,
      } : null,
    }
  }

  summaryDto(state, evidence, labels, orientation) {
    const active = evidence.filter((item) => item.status === 'active')
    const counts = {
      independent: active.filter((item) => ['correct_answer', 'incorrect_answer'].includes(item.type)).length,
      assisted: active.filter((item) => item.type === 'correct_after_hint').length,
      support_required: active.filter((item) => item.type === 'support_required').length,
      teacher: active.filter((item) => item.type === 'teacher_assessment').length,
      invalidated: evidence.filter((item) => item.status === 'invalidated').length,
    }
    return {
      schema_version: PHASE_4_SCHEMA_VERSION,
      learner: orientation,
      ...labels,
      mastery: { label: masteryLabel(state) },
      confidence: { label: confidenceLabel(state), meaning: CONFIDENCE_MEANING },
      limitations: limitationLabels(state?.limitations || []),
      limitation_codes: state?.limitations || [],
      counts,
      last_activity_at: iso(state?.last_evidence_at || active.at(-1)?.occurred_at || null),
      why: teacherReasonStatements(evidence, state),
      detail: state ? {
        calculated_mastery_estimate: roundEstimate(state.mastery),
        calculated_confidence_estimate: roundEstimate(state.confidence),
        evidence_count: state.evidence_count,
        weighted_evidence_volume: state.weighted_evidence_volume,
        distinct_tasks: state.distinct_task_count,
        distinct_modalities: state.distinct_modality_count,
        distinct_producers: state.distinct_producer_count,
        confidence_caps: state.confidence_caps,
        calculated_estimate_warning: 'Calculated development estimate; not a calibrated measurement.',
      } : null,
      technical: state ? {
        schema_version: state.schema_version,
        algorithm: state.projection.algorithm,
        algorithm_version: state.projection.algorithm_version,
        coefficient_set_version: state.projection.coefficient_set_version,
        calibration_status: state.projection.calibration_status,
        evidence_watermark: state.projection.evidence_watermark,
      } : { calibration_status: TEACHER_CALIBRATION_STATUS },
    }
  }

  async objectiveRefForEvidence(evidence) {
    const latest = [...evidence].sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))[0]
    return latest ? { objective_id: latest.target.objective_id, version: latest.target.objective_version } : null
  }

  async listCompetencies(actor, studentId) {
    requireTeacher(actor)
    const orientation = await this.orientation(actor, studentId)
    const [states, objectives] = await Promise.all([
      this.db.collection('student_knowledge_states').find({
        tenant_id: actor.tenant_id,
        student_id: studentId,
      }).sort({ updated_at: -1, competency_id: 1 }).toArray(),
      this.db.collection('learning_objectives').find({ tenant_id: actor.tenant_id, status: 'published' })
        .project({ _id: 0, objective_id: 1, version: 1, competency_targets: 1 }).toArray(),
    ])
    const stateByCompetency = new Map(states.map((state) => [state.competency_id, state]))
    const objectiveByCompetency = new Map()
    for (const objective of objectives) for (const target of objective.competency_targets || []) {
      if (!objectiveByCompetency.has(target.competency_id)) objectiveByCompetency.set(target.competency_id, {
        objective_id: objective.objective_id, version: objective.version,
      })
    }
    const competencyIds = [...new Set([...stateByCompetency.keys(), ...objectiveByCompetency.keys()])]
    const competencies = await Promise.all(competencyIds.map(async (competencyId) => {
      const { state, evidence } = await this.projection.readCurrent(actor, studentId, competencyId)
      const objectiveRef = await this.objectiveRefForEvidence(evidence) || objectiveByCompetency.get(competencyId)
      const labels = await this.labels(actor, competencyId, objectiveRef)
      return this.summaryDto(state, evidence, labels, orientation)
    }))
    competencies.sort((left, right) => left.competency.label.localeCompare(right.competency.label))
    return { schema_version: PHASE_4_SCHEMA_VERSION, learner: orientation, competencies }
  }

  async tutorSummary(actor, session) {
    const events = await this.events.listForAggregate(actor, 'tutor_session', session.session_id)
    const hints = events.filter((item) => item.type === 'HINT_GIVEN')
    const fallback = events.filter((item) => item.type === 'TUTOR_FALLBACK')
    const attempts = await this.db.collection('learning_attempts').find({
      tenant_id: actor.tenant_id,
      student_id: session.student_id,
      'source.tutor_session_id': session.session_id,
    }).project({ _id: 0, attempt_id: 1 }).toArray()
    const attemptIds = attempts.map((item) => item.attempt_id)
    const assistedEvidence = attemptIds.length ? await this.db.collection('evidence_events').find({
      tenant_id: actor.tenant_id,
      student_id: session.student_id,
      'source.source_id': { $in: attemptIds },
    }).project({ _id: 0, evidence_id: 1, type: 1, status: 1 }).toArray() : []
    return {
      session_id: session.session_id,
      status: session.status,
      outcome: session.outcome,
      hint_count: session.hint_count,
      highest_hint_level: session.highest_hint_level,
      retry_count: session.retry_count,
      generated_hint_count: hints.filter((item) => item.payload?.source === 'openai').length,
      local_hint_count: hints.filter((item) => item.payload?.source === 'local').length,
      fallback_occurred: fallback.length > 0,
      support_required: session.outcome === 'support_required',
      started_at: iso(session.started_at),
      completed_at: iso(session.completed_at),
      assisted_evidence: assistedEvidence,
      reflection: session.reflection ? {
        status: session.reflection.status,
        type: session.reflection.type || null,
        support_level: session.reflection.support_level || null,
        final_attempt_id: session.reflection.final_attempt_id || null,
        requested_at: iso(session.reflection.requested_at),
        submitted_at: iso(session.reflection.submitted_at),
        mastery_effect: 'none',
        mastery_statement: REFLECTION_NO_MASTERY_STATEMENT,
      } : null,
    }
  }

  async getCompetency(actor, studentId, competencyId) {
    requireTeacher(actor)
    const orientation = await this.orientation(actor, studentId)
    const { state, evidence } = await this.projection.readCurrent(actor, studentId, competencyId)
    let objectiveRef = await this.objectiveRefForEvidence(evidence)
    if (!objectiveRef) {
      const objective = await this.db.collection('learning_objectives').findOne({
        tenant_id: actor.tenant_id,
        status: 'published',
        'competency_targets.competency_id': competencyId,
      }, { projection: { _id: 0, objective_id: 1, version: 1 } })
      if (objective) objectiveRef = { objective_id: objective.objective_id, version: objective.version }
    }
    if (!state && !objectiveRef) throw new LearningV2Error('NOT_FOUND')
    const labels = await this.labels(actor, competencyId, objectiveRef)
    const objectiveIds = [...new Set(evidence.map((item) => item.target.objective_id))]
    const sessions = await this.sessionRepository.listForTeacherStudent(actor, studentId, objectiveIds, 20)
    const tutorSessions = await Promise.all(sessions.map((session) => this.tutorSummary(actor, session)))
    return { ...this.summaryDto(state, evidence, labels, orientation), tutor_sessions: tutorSessions }
  }

  async evidenceDto(actor, evidence, { detail = false } = {}) {
    const labels = await this.labels(actor, evidence.target.competency_id, {
      objective_id: evidence.target.objective_id,
      version: evidence.target.objective_version,
    })
    const contribution = evidence.status === 'invalidated' || evidence.claim.result === 'no_demonstration' || evidence.type === 'support_required'
      ? 'does_not_change_mastery' : evidence.claim.result
    const base = {
      evidence_id: evidence.evidence_id,
      type: evidence.type,
      claim: evidence.claim.result,
      occurred_at: iso(evidence.occurred_at),
      status: evidence.status,
      independence: evidence.independence.level,
      hint_level: evidence.hint_level || null,
      assessment_basis: evidence.assessment_basis || null,
      contribution,
      weight_category: evidence.type === 'teacher_assessment' ? 'teacher_assessment'
        : evidence.type === 'support_required' ? 'neutral'
          : evidence.type === 'correct_after_hint' ? `assisted_level_${evidence.hint_level}` : 'independent',
      task: evidence.source.task_id ? { task_id: evidence.source.task_id, version: evidence.source.task_version } : null,
      objective: labels.objective,
      invalidation: evidence.invalidation ? {
        reason: evidence.invalidation.reason,
        invalidated_at: iso(evidence.invalidation.invalidated_at),
        actor_role: 'teacher',
        has_note: Boolean(evidence.invalidation.note),
      } : null,
      has_note: Boolean(evidence.teacher_note),
    }
    if (!detail) return base
    return {
      ...base,
      note: evidence.type === 'teacher_assessment' ? evidence.teacher_note || null : null,
      invalidation_note: evidence.invalidation?.note || null,
      technical: {
        evidence_id: evidence.evidence_id,
        schema_version: evidence.schema_version,
        evidence_policy_version: evidence.provenance.evidence_policy_version,
        producer: evidence.provenance.producer,
        producer_version: evidence.provenance.producer_version,
        grader_version: evidence.provenance.grader_version,
        objective_id: evidence.target.objective_id,
        objective_version: evidence.target.objective_version,
        task_id: evidence.source.task_id || null,
        task_version: evidence.source.task_version || null,
        supersedes_evidence_id: evidence.supersedes_evidence_id || null,
        development_weight: evidence.teacher_weight ?? evidence.tutor_weight ?? 0.75,
        calibration_status: TEACHER_CALIBRATION_STATUS,
      },
    }
  }

  async listEvidence(actor, studentId, competencyId, query) {
    requireTeacher(actor)
    await this.orientation(actor, studentId)
    if (query.evidence_id) {
      const evidence = await this.evidenceRepository.findById(actor, query.evidence_id)
      if (!evidence || evidence.student_id !== studentId || evidence.target.competency_id !== competencyId) throw new LearningV2Error('NOT_FOUND')
      return { schema_version: PHASE_4_SCHEMA_VERSION, evidence: await this.evidenceDto(actor, evidence, { detail: true }) }
    }
    const rows = await this.evidenceRepository.listForCompetencyPage(actor, studentId, competencyId, {
      filter: query.filter,
      limit: query.limit,
      cursor: cursorDecode(query.cursor),
    })
    const hasMore = rows.length > query.limit
    const page = rows.slice(0, query.limit)
    return {
      schema_version: PHASE_4_SCHEMA_VERSION,
      evidence: await Promise.all(page.map((item) => this.evidenceDto(actor, item))),
      next_cursor: hasMore ? cursorEncode(page.at(-1)) : null,
    }
  }

  async getTutorSession(actor, studentId, sessionId) {
    requireTeacher(actor)
    await this.orientation(actor, studentId)
    const session = await this.sessionRepository.findForTeacher(actor, studentId, sessionId)
    if (!session) throw new LearningV2Error('NOT_FOUND')
    const events = await this.events.listForAggregate(actor, 'tutor_session', sessionId)
    const chronology = events.filter((item) => [
      'TUTOR_SESSION_STARTED', 'HINT_GIVEN', 'TUTOR_FALLBACK', 'RETRY_SUBMITTED', 'REFLECTION_REQUESTED', 'REFLECTION_SUBMITTED', 'TUTOR_SESSION_COMPLETED',
    ].includes(item.type)).map((item) => ({
      event_id: item.event_id,
      type: item.type,
      occurred_at: iso(item.occurred_at),
      ...(item.type === 'HINT_GIVEN' ? {
        hint_level: item.payload.hint_level,
        action: item.payload.action,
        accepted_hint_text: item.payload.learner_message,
        source: item.payload.source,
      } : {}),
      ...(item.type === 'TUTOR_FALLBACK' ? { hint_level: item.payload.hint_level, fallback_reason: item.payload.code } : {}),
      ...(item.type === 'RETRY_SUBMITTED' ? { hint_level: item.payload.hint_level, correctness: item.payload.correctness } : {}),
      ...(item.type === 'REFLECTION_REQUESTED' ? {
        reflection_type: item.payload.reflection?.type,
        prompt_id: item.payload.reflection?.prompt_id,
        prompt_version: item.payload.reflection?.prompt_version,
        prompt_text: item.payload.reflection?.prompt_text,
        support_level: item.payload.cause?.support_level,
        final_attempt_id: item.payload.cause?.final_attempt_id,
      } : {}),
      ...(item.type === 'REFLECTION_SUBMITTED' ? {
        reflection_type: item.payload.reflection?.type,
        response_text: item.payload.reflection?.response_text,
        support_level: item.payload.cause?.support_level,
        final_attempt_id: item.payload.cause?.final_attempt_id,
      } : {}),
      ...(item.type === 'TUTOR_SESSION_COMPLETED' ? { outcome: item.payload.outcome } : {}),
    }))
    const requested = events.find((item) => item.type === 'REFLECTION_REQUESTED')
    const submitted = events.find((item) => item.type === 'REFLECTION_SUBMITTED')
    return {
      schema_version: PHASE_4_SCHEMA_VERSION,
      session: await this.tutorSummary(actor, session),
      chronology,
      reflection: session.reflection && session.reflection.status !== 'not_required' ? {
        status: session.reflection.status,
        type: session.reflection.type,
        support_level: session.reflection.support_level,
        final_attempt_id: session.reflection.final_attempt_id,
        requested_at: iso(session.reflection.requested_at),
        submitted_at: iso(session.reflection.submitted_at),
        prompt_text: requested?.payload?.reflection?.prompt_text || null,
        response_text: submitted?.payload?.reflection?.response_text || null,
        mastery_effect: 'none',
        mastery_statement: REFLECTION_NO_MASTERY_STATEMENT,
      } : null,
      technical: {
        session_id: session.session_id,
        schema_version: session.schema_version,
        task_id: session.task_ref.task_id,
        task_version: session.task_ref.version,
        objective_id: session.objective_ref.objective_id,
        objective_version: session.objective_ref.version,
        policy_id: session.policy_ref.policy_id,
        policy_version: session.policy_ref.version,
        provider: session.model_config.provider,
        model: session.model_config.model,
        prompt_version: session.model_config.prompt_version,
        evidence_policy_version: session.evidence_policy_version,
        fallback_registry_version: session.fallback_registry_version,
      },
    }
  }

  async targetForAssessment(actor, input) {
    const objective = await this.db.collection('learning_objectives').findOne({
      tenant_id: actor.tenant_id,
      objective_id: input.objective_id,
      version: input.objective_version,
      status: 'published',
    })
    const target = objective?.competency_targets?.find((item) => item.competency_id === input.competency_id)
    if (!objective || !target) throw new LearningV2Error('VALIDATION_ERROR')
    const node = await this.db.collection('curriculum_nodes').findOne({
      competency_id: target.competency_id,
      'framework_ref.framework_id': target.framework_id,
      'framework_ref.version': target.framework_version,
      status: 'active',
      $or: [{ tenant_id: null }, { tenant_id: actor.tenant_id }],
    })
    if (!node) throw new LearningV2Error('VALIDATION_ERROR')
    let task = null
    if (input.task_ref) {
      task = await this.db.collection('learning_tasks').findOne({
        tenant_id: actor.tenant_id,
        task_id: input.task_ref.task_id,
        version: input.task_ref.version,
        status: 'published',
      })
      const taskTarget = task?.competency_targets?.find((item) => item.role === 'primary')
      const taskObjective = task?.objective_refs?.[0]
      if (!task || taskTarget?.competency_id !== input.competency_id
        || taskObjective?.objective_id !== input.objective_id || taskObjective?.version !== input.objective_version) {
        throw new LearningV2Error('VALIDATION_ERROR')
      }
    }
    return { objective, target, task }
  }

  async recordAssessment(actor, studentId, rawInput) {
    requireTeacher(actor)
    await this.orientation(actor, studentId)
    const input = parse(teacherAssessmentRequestSchema, rawInput)
    const observedAt = new Date(input.observed_at)
    const now = this.now()
    if (observedAt.getTime() > now.getTime() + 5 * 60_000) throw new LearningV2Error('VALIDATION_ERROR')
    const { target, task } = await this.targetForAssessment(actor, input)
    const before = await this.projectionRepository.find(actor, studentId, input.competency_id)
    let evidenceId = this.generateId('evd')
    let old = null
    let existingReplacement = null
    let correctionKey = null
    if (input.replaces_evidence_id) {
      old = await this.evidenceRepository.findById(actor, input.replaces_evidence_id)
      if (!old || old.type !== 'teacher_assessment' || old.student_id !== studentId
        || old.target.competency_id !== input.competency_id || old.provenance.created_by !== actor.teacher_id) {
        throw new LearningV2Error('NOT_FOUND')
      }
      if (old.status !== 'active' && old.invalidation?.reason !== 'replaced_by_corrected_assessment') {
        throw new LearningV2Error('CONFLICT')
      }
      const invalidation = {
        reason: 'replaced_by_corrected_assessment', invalidated_at: now, invalidated_by: actor.teacher_id,
        idempotency_key: boundedIdempotencyKey('teacher-correction-v1', [actor.tenant_id, studentId, input.idempotency_key]),
        replacement_evidence_id: evidenceId,
        replacement_request_hash: boundedIdempotencyKey('teacher-correction-payload-v1', [{ ...input, idempotency_key: undefined }]),
        ...(stripEmpty(input.correction_note) ? { note: stripEmpty(input.correction_note) } : {}),
      }
      const invalidated = await this.evidenceRepository.invalidateOne(actor, old.evidence_id, invalidation)
      let receipt = invalidated.evidence.invalidation
      await this.events.record(actor, {
        type: 'EVIDENCE_INVALIDATED', aggregate: { type: 'evidence', id: old.evidence_id },
        correlationId: old.evidence_id, occurredAt: receipt.invalidated_at, actorKind: 'teacher', actorId: receipt.invalidated_by,
        payload: { evidence_id: old.evidence_id, reason: receipt.reason },
      })
      // Pre-hardening corrections recorded the original request key and reserved
      // replacement ID, but not the payload hash. Only that original retry may
      // complete the receipt, and an existing replacement remains immutable.
      if (!receipt.replacement_request_hash) {
        const existing = await this.evidenceRepository.findById(actor, receipt.replacement_evidence_id)
        const matchesExisting = !existing || (
          existing.student_id === studentId && existing.provenance.created_by === actor.teacher_id
          && existing.target.competency_id === input.competency_id && existing.target.objective_id === input.objective_id
          && existing.target.objective_version === input.objective_version && existing.claim.result === input.claim
          && existing.assessment_basis === input.basis && existing.assessment_reason === input.reason
          && new Date(existing.occurred_at).getTime() === observedAt.getTime()
          && (existing.teacher_note || '') === (stripEmpty(input.note) || '')
          && (existing.source.task_id || null) === (input.task_ref?.task_id || null)
          && (existing.source.task_version || null) === (input.task_ref?.version || null)
          && existing.supersedes_evidence_id === old.evidence_id
        )
        if (!matchesExisting || (receipt.note || '') !== (stripEmpty(input.correction_note) || '')
          || receipt.idempotency_key !== invalidation.idempotency_key) {
          await this.projection.rebuild(actor, studentId, target, old.evidence_id)
          throw new LearningV2Error('CONFLICT')
        }
        receipt = (await this.evidenceRepository.bindLegacyCorrectionReceipt(actor, old.evidence_id,
          invalidation.idempotency_key, invalidation.replacement_request_hash)).invalidation
      }
      if (receipt.replacement_request_hash !== invalidation.replacement_request_hash) {
        await this.projection.rebuild(actor, studentId, target, old.evidence_id)
        throw new LearningV2Error('CONFLICT')
      }
      evidenceId = receipt.replacement_evidence_id
      correctionKey = boundedIdempotencyKey('teacher-correction-replacement-v1', [actor.tenant_id, old.evidence_id])
      existingReplacement = await this.evidenceRepository.findById(actor, evidenceId)
    }
    const teacherWeight = input.claim === 'no_demonstration' ? 0 : TEACHER_EVIDENCE_WEIGHTS[input.basis]
    const idempotencyKey = correctionKey || boundedIdempotencyKey('teacher-assessment-v1', [actor.tenant_id, studentId, input.idempotency_key])
    const proposed = {
      evidence_id: evidenceId,
      schema_version: EVIDENCE_SCHEMA_VERSION,
      tenant_id: actor.tenant_id,
      student_id: studentId,
      type: 'teacher_assessment',
      target: {
        competency_id: target.competency_id,
        framework_id: target.framework_id,
        framework_version: target.framework_version,
        objective_id: input.objective_id,
        objective_version: input.objective_version,
        dimension: 'application',
      },
      claim: { result: input.claim },
      independence: { level: 'teacher_assessment' },
      source: {
        kind: 'teacher_assessment', source_id: actor.teacher_id,
        task_id: task?.task_id || null, task_version: task?.version || null,
      },
      provenance: {
        producer: 'teacher-evidence-rules', producer_version: TEACHER_PRODUCER_VERSION,
        evidence_policy_version: TEACHER_EVIDENCE_POLICY_VERSION, grader_version: null,
        created_by: actor.teacher_id,
      },
      quality: { source_confidence: 1, mapping_confidence: 1, classification_confidence: 1, historic: false },
      response_modality: responseModalityForTeacherBasis(input.basis),
      assessment_basis: input.basis,
      teacher_weight: teacherWeight,
      assessment_reason: input.reason,
      ...(stripEmpty(input.note) ? { teacher_note: stripEmpty(input.note) } : {}),
      ...(old ? { supersedes_evidence_id: old.evidence_id } : {}),
      occurred_at: observedAt,
      recorded_at: now,
      status: 'active',
      idempotency_key: idempotencyKey,
    }
    const parsed = evidenceDocumentSchema.safeParse(proposed)
    if (!parsed.success) throw new TypeError('Invalid teacher assessment Evidence document')
    const evidence = existingReplacement || await this.evidenceRepository.insertCanonical(actor, parsed.data)
    const assessmentSemantics = (item) => ({ student_id: item.student_id, target: item.target, claim: item.claim,
      source: item.source, basis: item.assessment_basis, reason: item.assessment_reason, note: item.teacher_note || '',
      occurred_at: new Date(item.occurred_at).toISOString(), supersedes: item.supersedes_evidence_id || null,
      created_by: item.provenance.created_by, weight: item.teacher_weight })
    if (stableInputHash(assessmentSemantics(evidence)) !== stableInputHash(assessmentSemantics(parsed.data))) throw new LearningV2Error('CONFLICT')
    if (evidence.student_id !== studentId || evidence.target.competency_id !== input.competency_id
      || evidence.claim.result !== input.claim || evidence.assessment_basis !== input.basis
      || evidence.supersedes_evidence_id !== (old?.evidence_id || undefined)) throw new LearningV2Error('CONFLICT')

    await this.events.record(actor, {
      type: 'TEACHER_ASSESSMENT_RECORDED', aggregate: { type: 'evidence', id: evidence.evidence_id },
      correlationId: evidence.evidence_id, occurredAt: evidence.recorded_at, actorKind: 'teacher', actorId: actor.teacher_id,
      payload: {
        evidence_id: evidence.evidence_id, student_id: studentId, competency_id: input.competency_id,
        claim: input.claim, basis: input.basis,
      },
    })
    if (old) await this.events.record(actor, {
      type: 'TEACHER_ASSESSMENT_REPLACED', aggregate: { type: 'evidence', id: evidence.evidence_id },
      correlationId: evidence.evidence_id, causationId: old.evidence_id,
      occurredAt: evidence.recorded_at, actorKind: 'teacher', actorId: actor.teacher_id,
      payload: { old_evidence_id: old.evidence_id, replacement_evidence_id: evidence.evidence_id },
    })
    const after = await this.projection.rebuild(actor, studentId, {
      competency_id: target.competency_id,
      framework_id: target.framework_id,
      framework_version: target.framework_version,
    }, evidence.evidence_id)
    return {
      schema_version: PHASE_4_SCHEMA_VERSION,
      assessment: await this.evidenceDto(actor, evidence, { detail: true }),
      state: await this.getCompetency(actor, studentId, input.competency_id),
      change_explanation: changeExplanation(before, after, evidence),
    }
  }

  async invalidateEvidence(actor, evidenceId, rawInput) {
    requireTeacher(actor)
    const input = parse(teacherInvalidationRequestSchema, rawInput)
    const evidence = await this.evidenceRepository.findById(actor, evidenceId)
    if (!evidence) throw new LearningV2Error('NOT_FOUND')
    await this.orientation(actor, evidence.student_id)
    if (!allowedReasonsFor(evidence).includes(input.reason)) throw new LearningV2Error('VALIDATION_ERROR')
    if (evidence.type === 'teacher_assessment' && evidence.provenance.created_by !== actor.teacher_id) throw new LearningV2Error('NOT_FOUND')
    const before = await this.projectionRepository.find(actor, evidence.student_id, evidence.target.competency_id)
    const invalidation = {
      reason: input.reason,
      invalidated_at: this.now(),
      invalidated_by: actor.teacher_id,
      idempotency_key: boundedIdempotencyKey('teacher-invalidation-v1', [actor.tenant_id, evidenceId, input.idempotency_key]),
      ...(stripEmpty(input.note) ? { note: stripEmpty(input.note) } : {}),
    }
    const result = await this.evidenceRepository.invalidateOne(actor, evidenceId, invalidation)
    const receipt = result.evidence.invalidation
    {
      await this.events.record(actor, {
        type: 'EVIDENCE_INVALIDATED', aggregate: { type: 'evidence', id: evidenceId },
        correlationId: evidenceId, occurredAt: receipt.invalidated_at,
        actorKind: 'teacher', actorId: receipt.invalidated_by,
        payload: { evidence_id: evidenceId, reason: receipt.reason },
      })
    }
    const after = await this.projection.rebuild(actor, evidence.student_id, {
        competency_id: evidence.target.competency_id,
        framework_id: evidence.target.framework_id,
        framework_version: evidence.target.framework_version,
      }, evidenceId)
    return {
      schema_version: PHASE_4_SCHEMA_VERSION,
      evidence: await this.evidenceDto(actor, result.evidence, { detail: true }),
      state: await this.getCompetency(actor, evidence.student_id, evidence.target.competency_id),
      change_explanation: changeExplanation(before, after, result.evidence),
    }
  }
}
