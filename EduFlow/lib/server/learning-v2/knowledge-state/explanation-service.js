import { requireStudent, requireTeacher } from '../auth/learning-authorization.js'
import { LearningV2Error } from '../contracts/errors.js'
import { EXPLANATION_SCHEMA_VERSION, PHASE_2_COEFFICIENTS, explanationDocumentSchema } from '../contracts/phase2.js'
import { requireTeacherStudentAccess } from '../teacher/teacher-authorization.js'
import { ProjectionService } from './projection-service.js'
import { evidenceWeight } from './projection.js'

function iso(value) { return value instanceof Date ? value.toISOString() : value }

export class ExplanationService {
  constructor(evidenceRepository, projectionRepository, db, options = {}) {
    this.evidenceRepository = evidenceRepository
    this.projectionRepository = projectionRepository
    this.db = db
    this.projection = new ProjectionService(evidenceRepository, projectionRepository, null, options)
  }

  async explain(actor, studentId, competencyId) {
    if (actor.actor_type === 'student') {
      requireStudent(actor)
      if (actor.student_id !== studentId) throw new LearningV2Error('NOT_FOUND')
    } else {
      requireTeacher(actor)
      if (!this.db) throw new LearningV2Error('NOT_FOUND')
      await requireTeacherStudentAccess(this.db, actor, studentId)
    }
    const { state, evidence } = await this.projection.readCurrent(actor, studentId, competencyId)
    if (!state) throw new LearningV2Error('NOT_FOUND')
    const explanation = {
      schema_version: EXPLANATION_SCHEMA_VERSION,
      student_id: studentId,
      competency_id: competencyId,
      computed: { mastery: state.mastery, confidence: state.confidence, band: state.band, qualifier: state.qualifier },
      secure: state.mastery >= PHASE_2_COEFFICIENTS.secure_mastery_threshold
        && state.confidence >= PHASE_2_COEFFICIENTS.secure_confidence_threshold,
      confidence_meaning: 'certainty_about_the_estimate_not_performance',
      evidence_summary: {
        active: state.evidence_count,
        positive: state.positive_count,
        negative: state.negative_count,
        weighted_volume: state.weighted_evidence_volume,
        distinct_tasks: state.distinct_task_count,
        distinct_modalities: state.distinct_modality_count,
        distinct_producers: state.distinct_producer_count,
      },
      contextual_evidence: evidence.filter((item) => item.status === 'active' && evidenceWeight(item) === 0).map((item) => ({
        evidence_id: item.evidence_id, type: item.type, direction: item.claim.result, arithmetic_contribution: 'none',
      })),
      contributing_evidence: evidence.filter((item) => item.status === 'active' && evidenceWeight(item) > 0).map((item) => ({
        evidence_id: item.evidence_id,
        type: item.type,
        occurred_at: iso(item.occurred_at),
        task_id: item.source.task_id,
        task_version: item.source.task_version,
        direction: item.claim.result,
        independence: item.independence.level,
        modality: item.response_modality,
      })),
      excluded_evidence: evidence.filter((item) => item.status !== 'active').map((item) => ({
        evidence_id: item.evidence_id, status: item.status, reason: item.invalidation?.reason || 'invalidated',
      })),
      limitations: state.limitations,
      reason_codes: state.reason_codes,
      confidence_caps: state.confidence_caps,
      projection: {
        ...state.projection,
        calculated_at: iso(state.projection.calculated_at),
      },
    }
    const parsed = explanationDocumentSchema.safeParse(explanation)
    if (!parsed.success) throw new TypeError('Invalid Learning V2 explanation')
    return parsed.data
  }
}
