import { LearningV2Error } from '../contracts/errors.js'
import { PHASE_2_COEFFICIENTS } from '../contracts/phase2.js'
import { RECOMMENDATION_POLICY_VERSION, RECOMMENDATION_RULE_SET_VERSION } from '../contracts/phase5.js'
import { requireTeacherStudentAccess } from '../teacher/teacher-authorization.js'
import { projectKnowledgeState } from '../knowledge-state/projection.js'
import { ExistingContentAdapter } from '../tasks/existing-content-adapter.js'
import { stableInputHash } from '../idempotency.js'
import { TASK_PROJECTION, sameCompetency, selectRecommendationTasks } from './task-selector.js'
import { abstain, attachCandidate, evaluateRecommendationRules, taskKey } from './rules.js'

// Inclusion projections are privacy boundaries, not exclusion lists. No notes,
// answers, hints, provider data, prerequisite graph, or Reflection fields enter.
export const EVIDENCE_PROJECTION = Object.freeze({
  tenant_id: 1, student_id: 1, teacher_weight: 1,
  _id: 0, evidence_id: 1, schema_version: 1, status: 1, type: 1, target: 1,
  'claim.result': 1, 'independence.level': 1, 'source.kind': 1, 'source.source_id': 1,
  'source.task_id': 1, 'source.task_version': 1,
  'provenance.producer': 1, 'provenance.producer_version': 1, 'provenance.evidence_policy_version': 1, 'provenance.grader_version': 1,
  response_modality: 1, tutor_weight: 1, hint_level: 1, assessment_basis: 1,
  occurred_at: 1, recorded_at: 1,
})
export const ATTEMPT_PROJECTION = Object.freeze({
  _id: 0, attempt_id: 1, task_ref: 1, objective_ref: 1, primary_competency_ref: 1,
  status: 1, submitted_at: 1, server_received_at: 1,
  'outcome.correctness': 1,
  'source.kind': 1, 'source.tutor_session_id': 1, 'source.hint_level': 1,
})
export const SESSION_PROJECTION = Object.freeze({
  _id: 0, session_id: 1, task_ref: 1, objective_ref: 1, trigger_attempt_id: 1,
  outcome: 1, status: 1, highest_hint_level: 1, hint_count: 1, retry_count: 1,
  started_at: 1, expires_at: 1, policy_ref: 1,
})
export const ACTIVITY_EVENT_TYPES = Object.freeze(['TUTOR_SESSION_STARTED', 'HINT_REQUESTED', 'TUTOR_DECIDED', 'HINT_GIVEN', 'RETRY_SUBMITTED', 'TUTOR_FALLBACK'])
const EVENT_PROJECTION = { _id: 0, event_id: 1, type: 1, aggregate: 1, occurred_at: 1, recorded_at: 1, sequence: 1 }
// Operational resource guard, never a pedagogical count or silent truncation.
const INPUT_LIMIT = 2000
async function bounded(cursor) {
  const rows = await cursor.limit(INPUT_LIMIT + 1).toArray()
  if (rows.length > INPUT_LIMIT) throw new LearningV2Error('SERVICE_UNAVAILABLE')
  return rows
}
const ordered = (rows, key) => rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])))
const latest = (values) => values.filter(Boolean).map((value) => new Date(value)).sort((a, b) => b - a)[0] || null

export function normalizedSession(session) {
  const { status, ...pedagogical } = session
  // A supported result is pedagogically terminal even while Phase 3b awaits a
  // response. Its later completion changes no recommendation input.
  return { ...pedagogical, active: session.outcome === 'pending' && status === 'active' }
}

export class RecommendationInputReader {
  constructor(db, options = {}) {
    this.db = db
    this.source = options.contentAdapter || new ExistingContentAdapter(db)
    this.project = options.project || projectKnowledgeState
    this.ruleVersion = options.ruleVersion || RECOMMENDATION_RULE_SET_VERSION
    this.policyVersion = options.policyVersion || RECOMMENDATION_POLICY_VERSION
  }

  async read(actor, studentId, competencyId, requestedObjective, now) {
    await requireTeacherStudentAccess(this.db, actor, studentId)
    // Recheck the active teacher too: decision post-validation must not rely on
    // the authenticated actor's earlier request-time snapshot.
    const teacher = await this.db.collection('users').findOne({ id: actor.teacher_id, status: { $nin: ['disabled', 'deleted'] }, disabled_at: { $exists: false }, deleted_at: { $exists: false } }, { projection: { _id: 0, id: 1 } })
    if (!teacher) throw new LearningV2Error('NOT_FOUND')
    const node = await this.db.collection('curriculum_nodes').findOne({ competency_id: competencyId, status: 'active', $or: [{ tenant_id: null }, { tenant_id: actor.tenant_id }] }, { projection: { _id: 0, competency_id: 1, framework_ref: 1, status: 1, schema_version: 1 } })
    if (!node) throw new LearningV2Error('NOT_FOUND')
    const competencyRef = { competency_id: competencyId, framework_id: node.framework_ref.framework_id, framework_version: node.framework_ref.version }
    const framework = await this.db.collection('curriculum_frameworks').findOne({ framework_id: competencyRef.framework_id, version: competencyRef.framework_version, status: 'published', $or: [{ scope: 'global', tenant_id: null }, { scope: 'tenant', tenant_id: actor.tenant_id }] }, { projection: { _id: 0, framework_id: 1, version: 1, status: 1, schema_version: 1 } })
    if (!framework) return { result: abstain('STATE_NOT_CURRENT') }
    const objectives = await bounded(this.db.collection('learning_objectives').find({ tenant_id: actor.tenant_id, status: 'published', visibility: 'tenant', competency_targets: { $elemMatch: { ...competencyRef, role: 'primary' } } }).project({ _id: 0, objective_id: 1, version: 1, status: 1, visibility: 1, competency_targets: 1, definition_schema_version: 1 }))
    const valid = objectives.filter((item) => item.competency_targets.filter((target) => target.role === 'primary').length === 1)
    const objective = requestedObjective ? valid.find((item) => item.objective_id === requestedObjective.objective_id && item.version === requestedObjective.version) : valid.length === 1 ? valid[0] : null
    if (requestedObjective && !objective) throw new LearningV2Error('NOT_FOUND')
    const objectiveOptions = valid.map((item) => ({ objective_id: item.objective_id, version: item.version }))
    if (!objective || valid.filter((item) => item.objective_id === objective.objective_id).length !== 1) return { result: abstain('AMBIGUOUS_OBJECTIVE_SCOPE'), objective_options: objectiveOptions }
    const objectiveRef = { objective_id: objective.objective_id, version: objective.version }
    const scope = { tenant_id: actor.tenant_id, student_id: studentId }
    const [evidence, attempts] = await Promise.all([
      bounded(this.db.collection('evidence_events').find({ ...scope, 'target.competency_id': competencyId, status: 'active' }).project(EVIDENCE_PROJECTION)),
      bounded(this.db.collection('learning_attempts').find({ ...scope, 'primary_competency_ref.competency_id': competencyId }).project(ATTEMPT_PROJECTION)),
    ])
    ordered(evidence, 'evidence_id'); ordered(attempts, 'attempt_id')
    if (evidence.some((item) => !sameCompetency(item.target, competencyRef))) return { result: abstain('STATE_NOT_CURRENT') }
    const sessions = ordered(await bounded(this.db.collection('tutor_sessions').find({ ...scope, trigger_attempt_id: { $in: attempts.map((item) => item.attempt_id) } }).project(SESSION_PROJECTION)), 'session_id').map(normalizedSession)
    const events = ordered(await bounded(this.db.collection('learning_events').find({ tenant_id: actor.tenant_id, 'aggregate.type': 'tutor_session', 'aggregate.id': { $in: sessions.map((item) => item.session_id) }, type: { $in: ACTIVITY_EVENT_TYPES } }).project(EVENT_PROJECTION)), 'event_id')
    const scopedEvidence = evidence.filter((item) => item.target.objective_id === objectiveRef.objective_id && item.target.objective_version === objectiveRef.version)
    const scopedSessions = sessions.filter((item) => item.objective_ref.objective_id === objectiveRef.objective_id && item.objective_ref.version === objectiveRef.version)
    const scopedAttempts = attempts.filter((item) => item.objective_ref.objective_id === objectiveRef.objective_id && item.objective_ref.version === objectiveRef.version)
    const canonicalSupportIds = scopedEvidence.filter((item) => item.type === 'support_required' && item.hint_level === 3 && item.tutor_weight === 0 && item.provenance.producer === 'tutor-evidence-rules' && item.provenance.producer_version === 'tutor-evidence-rules-v1' && item.claim.result === 'neutral' && item.source.kind === 'attempt').filter((item) => {
      const attempt = scopedAttempts.find((entry) => entry.attempt_id === item.source.source_id && entry.status === 'active' && entry.source?.kind === 'tutor_retry' && entry.source.hint_level === 3 && entry.outcome?.correctness === 'incorrect' && entry.task_ref.task_id === item.source.task_id && entry.task_ref.version === item.source.task_version && sameCompetency(entry.primary_competency_ref, competencyRef))
      return attempt && scopedSessions.some((session) => session.session_id === attempt.source.tutor_session_id && session.outcome === 'support_required' && session.highest_hint_level === 3 && session.hint_count === 3 && session.retry_count === 3 && session.task_ref.task_id === attempt.task_ref.task_id && session.task_ref.version === attempt.task_ref.version)
    }).map((item) => item.evidence_id)
    // A read-only full deterministic rebuild. Never persist a projection here,
    // especially during approval; existing projection services remain unchanged.
    const state = this.project({ tenantId: actor.tenant_id, studentId, competencyRef, evidence, now })
    const storedProjection = await this.db.collection('student_knowledge_states').findOne({ ...scope, competency_id: competencyId }, { projection: {
      _id: 0, schema_version: 1, framework_id: 1, framework_version: 1,
      'projection.algorithm': 1, 'projection.algorithm_version': 1, 'projection.coefficient_set_version': 1,
      'projection.input_set_hash': 1, 'projection.evidence_watermark': 1,
    } })
    const used = new Set([...evidence.map((item) => taskKey(item.source.task_id, item.source.task_version)), ...attempts.map((item) => taskKey(item.task_ref.task_id, item.task_ref.version))])
    const tasksCollection = this.db.collection('learning_tasks')
    const tasks = await bounded(tasksCollection.find({ tenant_id: actor.tenant_id, 'competency_targets.competency_id': competencyId }).project(TASK_PROJECTION))
    const catalog = await selectRecommendationTasks({ actor, competencyRef, objectiveRef, tasks, usedTaskKeys: used,
      verifySource: (source) => this.source.verifyRecommendationSource(actor, source),
      countPublishedVersions: (task) => tasksCollection.countDocuments({ tenant_id: actor.tenant_id, task_id: task.task_id, status: 'published' }),
      countSourceBindings: (task) => tasksCollection.countDocuments({ tenant_id: actor.tenant_id, status: 'published', 'source.kind': 'worksheet_question', 'source.worksheet_id': task.source.worksheet_id, 'source.question_id': task.source.question_id }),
    })
    const activityHash = stableInputHash({ attempts, sessions, events })
    const activityWatermark = latest([...attempts.map((item) => item.server_received_at), ...sessions.map((item) => item.started_at), ...events.map((item) => item.recorded_at || item.occurred_at)])
    const supportSessions = new Set(scopedEvidence.filter((item) => canonicalSupportIds.includes(item.evidence_id)).map((item) => scopedAttempts.find((attempt) => attempt.attempt_id === item.source.source_id)?.source.tutor_session_id))
    const otherProcessEvents = events.filter((item) => scopedSessions.some((session) => session.session_id === item.aggregate.id) && !supportSessions.has(item.aggregate.id))
    const latestProcessAt = latest([...scopedAttempts.map((item) => item.submitted_at), ...scopedSessions.map((item) => item.started_at), ...otherProcessEvents.map((item) => item.occurred_at)])
    const result = attachCandidate(evaluateRecommendationRules({ state, evidence: scopedEvidence, now, canonicalSupportIds, latestProcessAt, activeTutor: scopedSessions.some((item) => item.active) }), catalog)
    const input = {
      knowledge_state_schema_version: state.schema_version, projection_algorithm: state.projection.algorithm,
      projection_algorithm_version: state.projection.algorithm_version, coefficient_set_version: state.projection.coefficient_set_version,
      knowledge_state_input_hash: state.projection.input_set_hash, evidence_watermark: state.projection.evidence_watermark,
      activity_input_hash: activityHash, activity_watermark: activityWatermark,
      task_catalog_hash: catalog.hash,
      recommendation_input_hash: stableInputHash({ node, framework, objective, evidence, storedProjection, activityHash, catalog: catalog.hash,
        recency: evidence.map((item) => [item.evidence_id, new Date(item.occurred_at).getTime() >= now.getTime() - PHASE_2_COEFFICIENTS.recent_evidence_days * 86400000]),
        projection: [state.schema_version, state.projection.algorithm, state.projection.algorithm_version, state.projection.coefficient_set_version, state.projection.input_set_hash],
        rule_version: this.ruleVersion, policy_version: this.policyVersion }),
    }
    return { result, input, competency_ref: competencyRef, objective_ref: objectiveRef, objective_options: objectiveOptions,
      rule_version: this.ruleVersion, policy_version: this.policyVersion,
      limitations: [...state.limitations, 'DEVELOPMENT_RULES_NOT_EDUCATOR_CALIBRATED'],
    }
  }
}
