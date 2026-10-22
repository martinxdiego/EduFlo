import { requireTeacher } from '../auth/learning-authorization.js'
import { requireTeacherStudentAccess } from '../teacher/teacher-authorization.js'
import { LearningV2Error, validationError } from '../contracts/errors.js'
import { generateDomainId } from '../contracts/ids.js'
import { MAX_SUPPORTING_EVIDENCE_IDS, PHASE_5_SCHEMA_VERSION, RECOMMENDATION_FRESHNESS_MS, recommendationApprovalSchema, recommendationDismissalSchema, recommendationEvaluationSchema } from '../contracts/phase5.js'
import { stableInputHash } from '../idempotency.js'
import { RecommendationInputReader } from './input-reader.js'
import { RecommendationRepository, ensureRecommendationIndexes } from './repository.js'
import { explainCodes, recommendationDto } from './explanations.js'

function parse(schema, raw) { const result = schema.safeParse(raw); if (!result.success) throw validationError(result.error); return result.data }
export function generationKey(actor, studentId, snapshot) {
  return stableInputHash([actor.tenant_id, studentId, snapshot.competency_ref, snapshot.objective_ref,
    snapshot.rule_version, snapshot.policy_version, snapshot.result.rule_id, snapshot.result.type,
    snapshot.input, snapshot.result.candidate_task_ref || null])
}
export function matchesSnapshot(record, snapshot, now) {
  if (!snapshot.input || snapshot.result.type === 'NO_RECOMMENDATION' || now >= new Date(record.expires_at)) return false
  const { supporting_evidence_ids, evaluated_at, ...input } = record.input
  return stableInputHash(input) === stableInputHash(snapshot.input)
    && record.rule.rule_set_version === snapshot.rule_version && record.rule.policy_version === snapshot.policy_version
    && record.rule.rule_id === snapshot.result.rule_id && record.type === snapshot.result.type
    && stableInputHash(record.candidate_task_ref || null) === stableInputHash(snapshot.result.candidate_task_ref || null)
    && stableInputHash(record.competency_ref) === stableInputHash(snapshot.competency_ref)
    && stableInputHash(record.objective_ref) === stableInputHash(snapshot.objective_ref)
}

export class RecommendationService {
  constructor(db, options = {}) {
    this.db = db; this.reader = options.reader || new RecommendationInputReader(db, options)
    this.repository = options.repository || new RecommendationRepository(db)
    this.now = options.now || (() => new Date())
    // Test-only injected barriers; never environment/client-controlled.
    this.hooks = options.hooks || {}
  }
  async evaluate(actor, studentId, competencyId, raw) {
    requireTeacher(actor)
    const request = parse(recommendationEvaluationSchema, raw)
    await requireTeacherStudentAccess(this.db, actor, studentId)
    await ensureRecommendationIndexes(this.db)
    for (let retry = 0; retry < 6; retry++) {
      const now = this.now()
      const snapshot = await this.reader.read(actor, studentId, competencyId, request.objective_ref, now)
      const history = await this.repository.currentScope(actor, studentId, competencyId)
      for (const previous of history) {
        // Other explicitly selected objectives are independent primary scopes.
        if (snapshot.objective_ref && previous.objective_ref.objective_id !== snapshot.objective_ref.objective_id) continue
        if (!matchesSnapshot(previous, snapshot, now)) await this.repository.retire(actor, previous, now >= new Date(previous.expires_at) ? 'EXPIRED' : 'INPUT_CHANGED', now)
      }
      if (snapshot.result.type === 'NO_RECOMMENDATION') return { schema_version: PHASE_5_SCHEMA_VERSION, outcome: 'NO_RECOMMENDATION', recommendation: null, reasons: explainCodes(snapshot.result.reason_codes), failed_rule_id: snapshot.result.failed_rule_id || null, objective_options: snapshot.objective_options || [], evaluated_at: now }
      const key = generationKey(actor, studentId, snapshot)
      let record = await this.repository.findGeneration(actor, key)
      if (!record) record = await this.repository.insert({
        recommendation_id: generateDomainId('rec'), schema_version: PHASE_5_SCHEMA_VERSION,
        tenant_id: actor.tenant_id, student_id: studentId, competency_ref: snapshot.competency_ref, objective_ref: snapshot.objective_ref,
        type: snapshot.result.type, is_primary: true, ...(snapshot.result.candidate_task_ref ? { candidate_task_ref: snapshot.result.candidate_task_ref } : {}),
        rule: { rule_id: snapshot.result.rule_id, priority: snapshot.result.priority, rule_set_version: snapshot.rule_version, policy_version: snapshot.policy_version },
        input: { ...snapshot.input, supporting_evidence_ids: snapshot.result.supporting_evidence_ids.slice(-MAX_SUPPORTING_EVIDENCE_IDS), evaluated_at: now },
        reason_codes: snapshot.result.reason_codes, limitation_codes: snapshot.limitations,
        generation_key: key, status: 'presented', created_at: now, presented_at: now, updated_at: now,
        expires_at: new Date(now.getTime() + RECOMMENDATION_FRESHNESS_MS), state_version: 1,
      })
      if (!record) continue
      const post = await this.reader.read(actor, studentId, competencyId, snapshot.objective_ref, this.now())
      // Expiry is terminal for a semantic generation, just like dismissal: no
      // clock-derived identity and no silent re-presentation of unchanged inputs.
      if (['expired', 'dismissed', 'superseded'].includes(record.status)) return { schema_version: PHASE_5_SCHEMA_VERSION, outcome: 'HISTORICAL_RECOMMENDATION', recommendation: recommendationDto(record), objective_options: snapshot.objective_options }
      if (!matchesSnapshot(record, post, this.now())) { await this.repository.retire(actor, record, 'INPUT_CHANGED', this.now()); continue }
      record = await this.repository.find(actor, record.recommendation_id)
      return { schema_version: PHASE_5_SCHEMA_VERSION, outcome: 'RECOMMENDATION', recommendation: recommendationDto(record), objective_options: snapshot.objective_options }
    }
    throw new LearningV2Error('SERVICE_UNAVAILABLE')
  }

  async stale(actor, record, reason = 'INPUT_CHANGED') {
    // A concurrent decision may have won the original CAS; reload and retire it
    // too, preserving its immutable historical decision.
    let current = await this.repository.find(actor, record.recommendation_id)
    for (let retry = 0; current && ['presented', 'approved'].includes(current.status) && retry < 6; retry++) current = await this.repository.retire(actor, current, reason, this.now())
    let replacement = null
    try {
      const evaluated = await this.evaluate(actor, record.student_id, record.competency_ref.competency_id, {
        schema_version: PHASE_5_SCHEMA_VERSION, idempotency_key: 'server-stale-re-evaluation', objective_ref: record.objective_ref,
      })
      if (evaluated.recommendation?.status === 'presented') replacement = {
        recommendation_id: evaluated.recommendation.recommendation_id, type: evaluated.recommendation.type, status: 'presented',
      }
    } catch (error) {
      // Retirement is already durable. Missing target or unavailable replacement
      // must never restore the old approval. Authorization is checked again.
      await requireTeacherStudentAccess(this.db, actor, record.student_id)
      if (!(error instanceof LearningV2Error)) throw new LearningV2Error('SERVICE_UNAVAILABLE')
    }
    throw new LearningV2Error('RECOMMENDATION_STALE', { details: { replacement } })
  }
  async validate(actor, record) {
    await requireTeacherStudentAccess(this.db, actor, record.student_id)
    let snapshot
    try { snapshot = await this.reader.read(actor, record.student_id, record.competency_ref.competency_id, record.objective_ref, this.now()) }
    catch (error) {
      if (error?.code !== 'NOT_FOUND') throw error
      // Lost relationship stays nondisclosing. Missing/retired target is stale.
      await requireTeacherStudentAccess(this.db, actor, record.student_id)
      const teacher = await this.db.collection('users').findOne({ id: actor.teacher_id, status: { $nin: ['disabled', 'deleted'] }, disabled_at: { $exists: false }, deleted_at: { $exists: false } }, { projection: { _id: 0, id: 1 } })
      if (!teacher) throw new LearningV2Error('NOT_FOUND')
      return this.stale(actor, record)
    }
    if (!matchesSnapshot(record, snapshot, this.now())) return this.stale(actor, record, this.now() >= new Date(record.expires_at) ? 'EXPIRED' : 'INPUT_CHANGED')
    return snapshot
  }
  async decide(actor, recommendationId, action, raw) {
    requireTeacher(actor)
    if (!['approved', 'dismissed'].includes(action)) throw new LearningV2Error('VALIDATION_ERROR')
    const request = parse(action === 'approved' ? recommendationApprovalSchema : recommendationDismissalSchema, raw)
    let record = await this.repository.find(actor, recommendationId)
    if (!record) throw new LearningV2Error('NOT_FOUND')
    await requireTeacherStudentAccess(this.db, actor, record.student_id)
    const hash = stableInputHash(request.idempotency_key)
    const replay = await this.repository.findDecision(actor, hash)
    if (replay && (replay.recommendation_id !== recommendationId || replay.decision.action !== action)) throw new LearningV2Error('CONFLICT')
    if (['expired', 'superseded'].includes(record.status)) throw new LearningV2Error('RECOMMENDATION_STALE')
    if (!record.decision && record.status !== 'presented') throw new LearningV2Error('CONFLICT')
    await this.validate(actor, record)
    if (!record.decision) {
      await this.hooks.beforeDecisionCas?.(record)
      record = await this.repository.decide(actor, record, { action, teacher_id: actor.teacher_id, decided_at: this.now(), idempotency_key_hash: hash, recommendation_state_version: record.state_version, ...(request.dismissal_reason ? { dismissal_reason: request.dismissal_reason } : {}) })
    }
    if (!record?.decision || ['expired', 'superseded'].includes(record.status)) throw new LearningV2Error('RECOMMENDATION_STALE')
    // A same-key opposite-action race must conflict, not masquerade as replay.
    if (record.decision.idempotency_key_hash === hash && record.decision.action !== action) throw new LearningV2Error('CONFLICT')
    await this.hooks.afterDecisionCas?.(record)
    await this.validate(actor, record)
    record = await this.repository.find(actor, recommendationId)
    if (['expired', 'superseded'].includes(record.status)) throw new LearningV2Error('RECOMMENDATION_STALE')
    return { schema_version: PHASE_5_SCHEMA_VERSION, outcome: 'RECOMMENDATION', recommendation: recommendationDto(record) }
  }
}
