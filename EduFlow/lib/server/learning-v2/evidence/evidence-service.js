import { generateDomainId } from '../contracts/ids.js'
import { DETERMINISTIC_GRADER_VERSION, EVIDENCE_POLICY_VERSION, EVIDENCE_SCHEMA_VERSION, evidenceDocumentSchema } from '../contracts/phase2.js'
import { boundedIdempotencyKey } from '../idempotency.js'
import { correctnessEvidenceForAttempt } from './evidence-rules.js'
import { TUTOR_EVIDENCE_POLICY_VERSION, TUTOR_EVIDENCE_WEIGHTS } from '../contracts/phase3.js'
import { LearningV2Error } from '../contracts/errors.js'

export class EvidenceService {
  constructor(repository, events, options = {}) {
    this.repository = repository
    this.events = events
    this.generateId = options.generateId || generateDomainId
    this.now = options.now || (() => new Date())
  }

  async recordForAttempt(actor, attempt) {
    const interpretation = correctnessEvidenceForAttempt(attempt)
    if (!interpretation) return null
    const idempotencyKey = boundedIdempotencyKey('evidence-v1', [EVIDENCE_POLICY_VERSION, attempt.attempt_id, 'application', 'correctness'])
    const now = this.now()
    const proposed = {
      evidence_id: this.generateId('evd'),
      schema_version: EVIDENCE_SCHEMA_VERSION,
      tenant_id: actor.tenant_id,
      student_id: attempt.student_id,
      ...interpretation,
      occurred_at: attempt.submitted_at,
      recorded_at: now,
      status: 'active',
      idempotency_key: idempotencyKey,
    }
    const parsed = evidenceDocumentSchema.safeParse(proposed)
    if (!parsed.success) throw new TypeError('Invalid Learning V2 evidence document')
    const evidence = await this.repository.insertCanonical(actor, parsed.data)
    await this.events.record(actor, {
      type: 'EVIDENCE_RECORDED', aggregate: { type: 'attempt', id: attempt.attempt_id },
      correlationId: attempt.source.submission_id, causationId: attempt.attempt_id,
      occurredAt: attempt.submitted_at, payload: { evidence_id: evidence.evidence_id },
    })
    return evidence
  }

  async recordTutorOutcome(actor, attempt, { hintLevel, supportRequired = false, sessionId }) {
    const correct = attempt?.outcome?.correctness === 'correct'
    const canonicalSupport = attempt?.outcome?.correctness === 'incorrect' && hintLevel === 3
    if (attempt?.tenant_id !== actor.tenant_id || attempt.student_id !== actor.student_id
      || attempt.source?.kind !== 'tutor_retry' || attempt.source.tutor_session_id !== sessionId || attempt.source.hint_level !== hintLevel
      || ![1, 2, 3].includes(hintLevel) || (!correct && !canonicalSupport) || supportRequired !== canonicalSupport
      || attempt.independence?.level !== (hintLevel <= 2 ? 'lightly_supported' : 'supported') || attempt.independence?.assistance_source !== 'tutor_hint'
      || attempt.outcome.grader !== 'deterministic' || attempt.outcome.grader_version !== DETERMINISTIC_GRADER_VERSION) throw new LearningV2Error('CONFLICT')
    const now = this.now()
    const type = supportRequired ? 'support_required' : 'correct_after_hint'
    const independence = supportRequired || hintLevel === 3 ? 'supported' : 'lightly_supported'
    const proposed = {
      evidence_id: this.generateId('evd'), schema_version: EVIDENCE_SCHEMA_VERSION,
      tenant_id: actor.tenant_id, student_id: attempt.student_id, type,
      target: {
        competency_id: attempt.primary_competency_ref.competency_id,
        framework_id: attempt.primary_competency_ref.framework_id,
        framework_version: attempt.primary_competency_ref.framework_version,
        objective_id: attempt.objective_ref.objective_id,
        objective_version: attempt.objective_ref.version,
        dimension: 'application',
      },
      claim: { result: supportRequired ? 'neutral' : 'supports' },
      independence: { level: independence },
      source: { kind: 'attempt', source_id: attempt.attempt_id, task_id: attempt.task_ref.task_id, task_version: attempt.task_ref.version },
      provenance: {
        producer: 'tutor-evidence-rules', producer_version: 'tutor-evidence-rules-v1',
        evidence_policy_version: TUTOR_EVIDENCE_POLICY_VERSION, grader_version: DETERMINISTIC_GRADER_VERSION,
      },
      quality: { source_confidence: 1, mapping_confidence: 1, classification_confidence: 1, historic: false },
      response_modality: 'selected_response', occurred_at: attempt.submitted_at, recorded_at: now,
      status: 'active',
      idempotency_key: boundedIdempotencyKey('evidence-tutor-terminal-v1', [TUTOR_EVIDENCE_POLICY_VERSION, sessionId]),
      tutor_terminal_slot: sessionId,
      tutor_weight: supportRequired ? TUTOR_EVIDENCE_WEIGHTS.support_required : TUTOR_EVIDENCE_WEIGHTS[hintLevel],
      hint_level: hintLevel,
    }
    const parsed = evidenceDocumentSchema.safeParse(proposed)
    if (!parsed.success) throw new TypeError('Invalid tutor Evidence document')
    const evidence = await this.repository.insertCanonical(actor, parsed.data)
    if (evidence.type !== type || evidence.claim.result !== proposed.claim.result || evidence.hint_level !== hintLevel
      || evidence.tutor_weight !== proposed.tutor_weight) throw new LearningV2Error('CONFLICT')
    await this.events.record(actor, {
      type: 'EVIDENCE_RECORDED', aggregate: { type: 'evidence', id: evidence.evidence_id },
      correlationId: sessionId, causationId: attempt.attempt_id, occurredAt: attempt.submitted_at,
      payload: { evidence_id: evidence.evidence_id, type, hint_level: hintLevel, weight: proposed.tutor_weight },
    })
    return evidence
  }
}
