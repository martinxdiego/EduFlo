import { resolveHostingCapabilities, HostingCapabilityError } from '../../hosting-capabilities-v1.js'

const INDEXES = Object.freeze({
  learning_v2_tenants: [
    { name: 'learning_v2_tenant_id_unique', key: { tenant_id: 1 }, unique: true },
    {
      name: 'learning_v2_personal_tenant_owner_unique',
      key: { type: 1, owner_teacher_id: 1 },
      unique: true,
      partialFilterExpression: { type: 'personal', owner_teacher_id: { $type: 'string' } },
    },
  ],
  learning_v2_tenant_memberships: [
    {
      name: 'learning_v2_membership_identity_unique',
      key: { actor_type: 1, actor_id: 1, tenant_id: 1 },
      unique: true,
    },
    {
      name: 'learning_v2_membership_actor_active',
      key: { actor_type: 1, actor_id: 1, status: 1 },
    },
    {
      name: 'learning_v2_membership_tenant_role_active',
      key: { tenant_id: 1, role: 1, status: 1 },
    },
  ],
  curriculum_frameworks: [
    {
      name: 'learning_v2_curriculum_framework_version_unique',
      key: { scope: 1, tenant_id: 1, framework_id: 1, version: 1 },
      unique: true,
    },
    {
      name: 'learning_v2_curriculum_framework_list',
      key: { scope: 1, tenant_id: 1, status: 1, name: 1 },
    },
  ],
  curriculum_nodes: [
    { name: 'learning_v2_curriculum_competency_id_unique', key: { competency_id: 1 }, unique: true },
    {
      name: 'learning_v2_curriculum_external_reference_unique',
      key: {
        'framework_ref.framework_id': 1,
        'framework_ref.version': 1,
        'external_reference.namespace': 1,
        'external_reference.code': 1,
      },
      unique: true,
    },
    {
      name: 'learning_v2_curriculum_parent_order',
      key: { 'framework_ref.framework_id': 1, 'framework_ref.version': 1, parent_competency_id: 1, order: 1 },
    },
    { name: 'learning_v2_curriculum_prerequisite_lookup', key: { 'prerequisites.competency_id': 1 } },
  ],
  learning_objectives: [
    {
      name: 'learning_v2_objective_version_unique',
      key: { tenant_id: 1, objective_id: 1, version: 1 },
      unique: true,
    },
    { name: 'learning_v2_objective_status_list', key: { tenant_id: 1, status: 1, created_at: -1 } },
    {
      name: 'learning_v2_objective_competency_lookup',
      key: { tenant_id: 1, 'competency_targets.competency_id': 1, status: 1 },
    },
  ],
  learning_tasks: [
    {
      name: 'learning_v2_task_version_unique',
      key: { tenant_id: 1, task_id: 1, version: 1 },
      unique: true,
    },
    {
      name: 'learning_v2_task_source_lookup',
      key: { tenant_id: 1, 'source.kind': 1, 'source.worksheet_id': 1, 'source.question_id': 1, status: 1 },
    },
    {
      name: 'learning_v2_task_objective_lookup',
      key: { tenant_id: 1, 'objective_refs.objective_id': 1, status: 1 },
    },
  ],
  learning_attempts: [
    { name: 'learning_v2_attempt_id_unique', key: { tenant_id: 1, attempt_id: 1 }, unique: true },
    { name: 'learning_v2_attempt_idempotency_unique', key: { tenant_id: 1, idempotency_key: 1 }, unique: true },
    { name: 'learning_v2_attempt_student_task_history', key: { tenant_id: 1, student_id: 1, 'task_ref.task_id': 1, submitted_at: -1 } },
    { name: 'learning_v2_attempt_submission_question', key: { tenant_id: 1, 'source.submission_id': 1, 'source.question_id': 1 } },
  ],
  evidence_events: [
    { name: 'learning_v2_evidence_id_unique', key: { tenant_id: 1, evidence_id: 1 }, unique: true },
    { name: 'learning_v2_evidence_idempotency_unique', key: { tenant_id: 1, idempotency_key: 1 }, unique: true },
    { name: 'learning_v2_evidence_projection', key: { tenant_id: 1, student_id: 1, 'target.competency_id': 1, status: 1, occurred_at: -1 } },
    { name: 'learning_v2_evidence_source_trace', key: { tenant_id: 1, 'source.kind': 1, 'source.source_id': 1 } },
    { name: 'learning_v2_evidence_tutor_terminal_unique', key: { tenant_id: 1, tutor_terminal_slot: 1 }, unique: true,
      partialFilterExpression: { tutor_terminal_slot: { $type: 'string' } } },
  ],
  learning_events: [
    { name: 'learning_v2_event_id_unique', key: { tenant_id: 1, event_id: 1 }, unique: true },
    { name: 'learning_v2_event_idempotency_unique', key: { tenant_id: 1, idempotency_key: 1 }, unique: true },
    {
      name: 'learning_v2_event_aggregate_sequence_unique',
      key: { tenant_id: 1, 'aggregate.type': 1, 'aggregate.id': 1, sequence: 1 },
      unique: true,
      partialFilterExpression: { sequence: { $type: 'number' } },
    },
    { name: 'learning_v2_event_type_time', key: { tenant_id: 1, type: 1, recorded_at: 1 } },
    { name: 'learning_v2_event_correlation_time', key: { tenant_id: 1, correlation_id: 1, recorded_at: 1 } },
  ],
  student_knowledge_states: [
    { name: 'learning_v2_knowledge_state_identity_unique', key: { tenant_id: 1, student_id: 1, competency_id: 1 }, unique: true },
    { name: 'learning_v2_knowledge_state_student_updated', key: { tenant_id: 1, student_id: 1, updated_at: -1 } },
    { name: 'learning_v2_knowledge_state_competency_band', key: { tenant_id: 1, competency_id: 1, band: 1, confidence: 1 } },
  ],
  tutor_policies: [
    { name: 'learning_v2_tutor_policy_id_version_unique', key: { tenant_id: 1, policy_id: 1, policy_version: 1 }, unique: true },
    { name: 'learning_v2_tutor_policy_content_unique', key: { tenant_id: 1, assignment_id: 1, content_hash: 1 }, unique: true },
    { name: 'learning_v2_tutor_policy_assignment_version', key: { tenant_id: 1, assignment_id: 1, policy_version: -1 } },
  ],
  tutor_sessions: [
    { name: 'learning_v2_tutor_session_id_unique', key: { tenant_id: 1, session_id: 1 }, unique: true },
    { name: 'learning_v2_tutor_session_start_unique', key: { tenant_id: 1, start_key: 1 }, unique: true },
    {
      name: 'learning_v2_tutor_active_identity_unique',
      key: { tenant_id: 1, student_id: 1, assignment_id: 1, 'task_ref.task_id': 1, 'task_ref.version': 1 },
      unique: true, partialFilterExpression: { status: 'active' },
    },
    { name: 'learning_v2_tutor_session_resume', key: { tenant_id: 1, student_id: 1, status: 1, last_activity_at: -1 } },
    { name: 'learning_v2_tutor_session_expiry', key: { tenant_id: 1, status: 1, expires_at: 1 } },
  ],
  submissions: [
    {
      name: 'learning_v2_submission_intent_unique',
      key: { assignment_id: 1, student_id: 1, learning_v2_submission_intent_id: 1 },
      unique: true,
      partialFilterExpression: {
        assignment_id: { $type: 'string' },
        student_id: { $type: 'string' },
        learning_v2_submission_intent_id: { $type: 'string' },
      },
    },
    {
      name: 'learning_v2_submission_attempt_slot_unique',
      key: { assignment_id: 1, student_id: 1, learning_v2_attempt_no: 1 },
      unique: true,
      partialFilterExpression: {
        assignment_id: { $type: 'string' },
        student_id: { $type: 'string' },
        learning_v2_attempt_no: { $type: 'number' },
      },
    },
  ],
})

const bootstrapPromises = new WeakMap()

export function learningV2IndexSpecifications() {
  return Object.fromEntries(
    Object.entries(INDEXES).map(([collection, indexes]) => [collection, indexes.map((index) => structuredClone(index))]),
  )
}

export async function ensureLearningV2Indexes(db) {
  if (!db || typeof db.collection !== 'function') throw new TypeError('A MongoDB database is required')
  if (resolveHostingCapabilities().environment === 'staging') {
    if ((await inspectLearningV2Indexes(db)).some((index) => !index.present)) throw new HostingCapabilityError()
    return
  }
  if (!bootstrapPromises.has(db)) {
    const promise = Promise.all(Object.entries(INDEXES).map(([collectionName, indexes]) => (
      db.collection(collectionName).createIndexes(indexes)
    ))).catch((error) => {
      bootstrapPromises.delete(db)
      throw error
    })
    bootstrapPromises.set(db, promise)
  }
  await bootstrapPromises.get(db)
}

export async function inspectLearningV2Indexes(db) {
  const report = []
  for (const [collectionName, expectedIndexes] of Object.entries(INDEXES)) {
    let actual = []
    try {
      actual = await db.collection(collectionName).listIndexes().toArray()
    } catch (error) {
      if (error?.codeName !== 'NamespaceNotFound' && error?.code !== 26) throw error
    }
    for (const expected of expectedIndexes) {
      const found = actual.find((index) => index.name === expected.name)
      const keyMatches = found && JSON.stringify(found.key) === JSON.stringify(expected.key)
      const uniqueMatches = found && Boolean(found.unique) === Boolean(expected.unique)
      const partialMatches = found && JSON.stringify(found.partialFilterExpression || null)
        === JSON.stringify(expected.partialFilterExpression || null)
      report.push({
        collection: collectionName,
        index: expected.name,
        present: Boolean(found && keyMatches && uniqueMatches && partialMatches),
      })
    }
  }
  return report
}
