import { projectKnowledgeState } from './projection.js'
import { projectionAsOf } from './projector-contract.js'
import { requireStudent, requireTeacher } from '../auth/learning-authorization.js'
import { LearningV2Error } from '../contracts/errors.js'
import { stableInputHash } from '../idempotency.js'

export class ProjectionService {
  constructor(evidenceRepository, projectionRepository, events, options = {}) {
    this.evidenceRepository = evidenceRepository
    this.projectionRepository = projectionRepository
    this.events = events
    this.now = options.now || (() => new Date())
  }

  async rebuild(actor, studentId, competencyRef, correlationId = `rebuild:${studentId}:${competencyRef.competency_id}`) {
    // One explicitly captured current clock for this refresh, including retries.
    const now = projectionAsOf(this.now())
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const previous = await this.projectionRepository.find?.(actor, studentId, competencyRef.competency_id)
      if (previous?.audit_receipt) await this.events.record(actor, previous.audit_receipt)
      const { evidence, sourceRevision } = await this.evidenceRepository.snapshotForCompetency(actor, studentId, competencyRef.competency_id)
      const projection = projectKnowledgeState({ tenantId: actor.tenant_id, studentId, competencyRef, evidence, now })
      const auditReceipt = {
        type: 'KNOWLEDGE_STATE_UPDATED', aggregate: { type: 'student_competency', id: `${studentId}:${competencyRef.competency_id}` },
        correlationId, occurredAt: projection.projection.calculated_at,
        idempotencyParts: ['KNOWLEDGE_STATE_UPDATED', actor.tenant_id, studentId, competencyRef.competency_id, sourceRevision, stableInputHash(projection.projection)],
        payload: { student_id: studentId, competency_id: competencyRef.competency_id, ...projection.projection, source_revision: sourceRevision },
      }
      const result = await this.projectionRepository.replace(actor, projection, now, sourceRevision, auditReceipt)
      if (result.conflict) continue
      // A persisted projection is not proof that its following audit write succeeded.
      await this.events.record(actor, auditReceipt)
      const { audit_receipt, ...state } = result.state
      return state
    }
    throw new Error('Learning V2 projection compare-and-set conflict')
  }

  // Reproduce an explicitly retained snapshot; never pretend today's active set
  // is the historical set, never read the wall clock, never replace current state.
  reproduce(actor, studentId, competencyRef, { evidence, sourceRevision, asOf, configurationId }) {
    if (actor.actor_type === 'student') { requireStudent(actor); if (actor.student_id !== studentId) throw new LearningV2Error('NOT_FOUND') }
    else requireTeacher(actor)
    if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0 || !configurationId) throw new LearningV2Error('VALIDATION_ERROR')
    const state = projectKnowledgeState({ tenantId: actor.tenant_id, studentId, competencyRef, evidence, now: projectionAsOf(asOf), configurationId })
    return { ...state, projection: { ...state.projection, source_revision: sourceRevision } }
  }

  async readCurrent(actor, studentId, competencyId) {
    const now = projectionAsOf(this.now())
    const { evidence, sourceRevision } = await this.evidenceRepository.snapshotForCompetency(actor, studentId, competencyId, { includeInvalidated: true })
    const stored = await this.projectionRepository.find(actor, studentId, competencyId)
    const target = evidence[0]?.target || stored
    if (!target) return { state: null, evidence }
    const competencyRef = { competency_id: competencyId, framework_id: target.framework_id, framework_version: target.framework_version }
    const state = projectKnowledgeState({ tenantId: actor.tenant_id, studentId, competencyRef, evidence, now })
    state.projection.source_revision = sourceRevision
    return { state, evidence }
  }
}
