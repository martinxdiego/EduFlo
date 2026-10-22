import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { PERSONAL_TENANT_CHILDREN } from '../lib/server/deletion-write-fence.js'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'
import { projectKnowledgeState, projectionComparable } from '../lib/server/learning-v2/knowledge-state/projection.js'
import {
  assertInventoryCoversCollections,
  INVENTORIED_MONGODB_COLLECTIONS,
  inventoryEntry,
  LEARNING_V2_DATA_INVENTORY,
  LEARNING_V2_DATA_INVENTORY_VERSION,
  validateLearningV2DataInventory,
} from '../lib/server/learning-v2/privacy/data-inventory-v1.js'
import {
  exportLearningV2Subject,
  LEARNING_V2_SUBJECT_EXPORT_VERSION,
} from '../lib/server/learning-v2/privacy/subject-export-service.js'
import {
  clearRebuildableLearningV2SubjectData,
  LEARNING_V2_SUBJECT_ERASURE_CONTRACT,
} from '../lib/server/learning-v2/privacy/subject-lifecycle-service.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const tenantId = generateDomainId('ten')
const foreignTenantId = generateDomainId('ten')
const studentId = 'h12b-synthetic-student'
const otherStudentId = 'h12b-synthetic-other-student'
const actor = {
  actor_id: studentId, actor_type: 'student', role: 'student', tenant_id: tenantId,
  student_id: studentId, teacher_id: null, permissions: ['learning:read:self', 'learning:write:self'],
}

function valueAt(row, dotted) {
  return dotted.split('.').reduce((value, key) => value?.[key], row)
}

function matches(row, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some((candidate) => matches(row, candidate))
    const actual = valueAt(row, key)
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if (Object.hasOwn(expected, '$in')) return expected.$in.includes(actual)
      if (Object.hasOwn(expected, '$exists')) return (actual !== undefined) === expected.$exists
    }
    return actual === expected
  })
}

class FakeCursor {
  constructor(rows) { this.rows = [...rows] }
  sort(spec) { const key = Object.keys(spec)[0]; this.rows.sort((a, b) => String(valueAt(a, key) || '').localeCompare(String(valueAt(b, key) || ''))); return this }
  limit(value) { this.rows = this.rows.slice(0, value); return this }
  async toArray() { return structuredClone(this.rows) }
}

function fakeDatabase(fixtures) {
  const rows = new Map(Object.entries(fixtures).map(([name, values]) => [name, structuredClone(values)]))
  const db = {
    client: { startSession() { return { async withTransaction(operation) { return operation() }, async endSession() {} } } },
    collection(name) {
      if (!rows.has(name)) rows.set(name, [])
      return {
        find(filter) { return new FakeCursor(rows.get(name).filter((row) => matches(row, filter))) },
        async findOne(filter) { return structuredClone(rows.get(name).find((row) => matches(row, filter)) || null) },
        async findOneAndUpdate(filter, update) {
          const row = rows.get(name).find((candidate) => matches(candidate, filter))
          if (!row) return null
          for (const [key, amount] of Object.entries(update?.$inc || {})) row[key] = Number(row[key] || 0) + amount
          return structuredClone(row)
        },
        async deleteMany(filter) {
          const before = rows.get(name); const keep = before.filter((row) => !matches(row, filter)); rows.set(name, keep)
          return { deletedCount: before.length - keep.length }
        },
      }
    },
  }
  return { db, rows }
}

function discoverCollectionReferences() {
  const roots = [
    path.join(here, '../lib/server/learning-v2'),
    path.join(here, '../lib/server/student-assignments.js'),
    path.join(here, '../lib/server/account-deletion.js'),
    path.join(here, '../lib/server/deletion-write-fence.js'),
  ]
  const files = []
  const visit = (target) => {
    const stat = fs.statSync(target)
    if (stat.isDirectory()) for (const name of fs.readdirSync(target)) visit(path.join(target, name))
    else if (target.endsWith('.js')) files.push(target)
  }
  for (const root of roots) visit(root)
  const collections = new Set()
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    for (const match of source.matchAll(/collection\(['"]([^'"]+)['"]\)/gu)) collections.add(match[1])
  }
  return [...collections].sort()
}

test('versioned technical inventory validates every required lifecycle field without claiming legal policy', () => {
  assert.equal(validateLearningV2DataInventory(), LEARNING_V2_DATA_INVENTORY)
  assert.equal(LEARNING_V2_DATA_INVENTORY.version, LEARNING_V2_DATA_INVENTORY_VERSION)
  assert.equal(LEARNING_V2_DATA_INVENTORY.status, 'technical_contract_not_legal_policy')
  assert.equal(LEARNING_V2_DATA_INVENTORY.synthetic_data_only, true)
  assert.equal(new Set(LEARNING_V2_DATA_INVENTORY.entries.map((item) => item.id)).size, LEARNING_V2_DATA_INVENTORY.entries.length)
})

test('every Learning-V2-referenced Mongo collection is inventoried and an unknown collection fails closed', () => {
  const discovered = discoverCollectionReferences()
  const deletionAndLegacyLifecycle = [
    ...PERSONAL_TENANT_CHILDREN, 'learning_v2_tenants', 'learning_v2_tenant_memberships', 'ai_generations', 'rate_limits',
    'submissions', 'users', 'students', 'classes', 'assignments', 'worksheets', 'comments', 'versions', 'shares',
    'password_reset_tokens', 'generated_assets', 'studio_packages', 'dossiers',
  ]
  assert.equal(assertInventoryCoversCollections([...discovered, ...deletionAndLegacyLifecycle]), true)
  assert.equal(discovered.every((name) => INVENTORIED_MONGODB_COLLECTIONS.includes(name)), true)
  assert.throws(() => assertInventoryCoversCollections([...discovered, 'new_learning_v2_collection']), /new_learning_v2_collection/u)
})

test('inventory covers logs, browser storage, provider processing and backups with unresolved retention/hold where required', () => {
  for (const id of ['learning_v2_logs', 'browser_assignment_drafts', 'browser_auth_cookie', 'learning_v2_http_transient_payloads', 'provider_temporary_processing', 'database_backups']) {
    assert.ok(inventoryEntry(id), id)
  }
  assert.equal(inventoryEntry('database_backups').retention.status, 'unresolved')
  assert.equal(inventoryEntry('provider_temporary_processing').retention.status, 'unresolved_external_provider_behavior')
  assert.equal(inventoryEntry('learning_v2_logs').legal_hold.status, 'unresolved_no_runtime_implementation')
})

test('canonical Attempt/Evidence/Audit stores require a D12-05 decision while derived state is explicitly rebuildable', () => {
  for (const id of ['submissions', 'learning_attempts', 'evidence_events', 'learning_events', 'tutor_sessions']) {
    assert.match(inventoryEntry(id).erasure.subject, /decision|required|D12-05/i)
  }
  assert.equal(inventoryEntry('student_knowledge_states').rebuildable, 'yes_from_active_evidence')
  assert.equal(LEARNING_V2_SUBJECT_ERASURE_CONTRACT.canonical_subject_erasure.status, 'blocked_pending_d12_05_follow_up')
})

test('existing personal-tenant deletion plan covers every tenant-owned Learning V2 child plus telemetry and rate limits', () => {
  for (const collection of PERSONAL_TENANT_CHILDREN) {
    const item = inventoryEntry(collection)
    assert.ok(item, collection)
    assert.match(item.erasure.tenant, /delete/u)
  }
  assert.match(inventoryEntry('ai_generations').erasure.tenant, /delete/u)
  assert.match(inventoryEntry('rate_limits').erasure.tenant, /delete/u)
})

function exportFixtures() {
  const now = new Date('2026-08-31T12:00:00.000Z')
  const competencyId = generateDomainId('cmp')
  const attemptId = generateDomainId('att')
  const evidenceId = generateDomainId('evd')
  const sessionId = generateDomainId('ses')
  return {
    learning_attempts: [
      { tenant_id: tenantId, student_id: studentId, attempt_id: attemptId, schema_version: 'learning-attempt-v1', task_ref: { task_id: generateDomainId('tsk'), version: 1 }, objective_ref: { objective_id: generateDomainId('obj'), version: 1 }, primary_competency_ref: { competency_id: competencyId, framework_id: generateDomainId('frm'), framework_version: 'synthetic' }, supporting_competency_refs: [], source: { kind: 'legacy_submission_question', assignment_id: 'foreign-owner-id-canary', question_index: 0 }, answer: { value: 'hidden-answer-canary' }, outcome: { correctness: 'incorrect', max_points: 1 }, independence: { level: 'independent', assistance_source: 'none' }, attempt_no: 1, submitted_at: now, server_received_at: now, status: 'active', idempotency_key: 'secret-idempotency' },
      { tenant_id: tenantId, student_id: otherStudentId, attempt_id: generateDomainId('att'), answer: { value: 'other-subject-canary' } },
      { tenant_id: foreignTenantId, student_id: studentId, attempt_id: generateDomainId('att'), answer: { value: 'foreign-tenant-canary' } },
    ],
    evidence_events: [{ tenant_id: tenantId, student_id: studentId, evidence_id: evidenceId, schema_version: 'evidence-event-v1', type: 'incorrect_answer', target: { competency_id: competencyId, framework_id: generateDomainId('frm'), framework_version: 'synthetic', objective_id: generateDomainId('obj'), objective_version: 1, dimension: 'application' }, claim: { result: 'challenges' }, independence: { level: 'independent' }, source: { kind: 'attempt', source_id: attemptId, task_id: generateDomainId('tsk'), task_version: 1 }, response_modality: 'selected_response', teacher_note: 'private-teacher-note-canary', occurred_at: now, recorded_at: now, status: 'active', idempotency_key: 'secret-evidence-key' }],
    student_knowledge_states: [{ tenant_id: tenantId, student_id: studentId, schema_version: 'student-knowledge-state-v1', competency_id: competencyId, framework_id: generateDomainId('frm'), framework_version: 'synthetic', mastery: 0.4, confidence: 0.2, band: 'developing', qualifier: 'synthetic', evidence_count: 1, weighted_evidence_volume: 0.75, positive_count: 0, negative_count: 1, distinct_task_count: 1, distinct_modality_count: 1, distinct_producer_count: 1, limitations: [], reason_codes: [], confidence_caps: [], projection: { algorithm: 'weighted', algorithm_version: 'v1', coefficient_set_version: 'v1', calibration_status: 'synthetic', input_set_hash: 'hidden-hash-canary' }, updated_at: now }],
    tutor_sessions: [{ tenant_id: tenantId, student_id: studentId, session_id: sessionId, schema_version: 'tutor-session-v1', status: 'completed', phase: 'closed', outcome: 'correct_after_hint', highest_hint_level: 1, hint_count: 1, retry_count: 1, model_config: { model: 'provider-secret-model-canary' }, policy_ref: { policy_id: 'internal-policy-canary' }, hint_receipts: [{ response: 'hidden-provider-content-canary' }], started_at: now, expires_at: now, completed_at: now }],
    submissions: [{ tenant_id: tenantId, learning_v2_tenant_id: tenantId, student_id: studentId, id: 'submission-self', assignment_id: 'assignment-synthetic', activity_type: 'exercise', attempt_number: 1, correct_count: 0, total_questions: 1, total_points: 1, earned_points: 0, score_percentage: 0, swiss_grade: 1, needs_review: false, duration: 5, submitted_at: now, answers: ['hidden-answer-canary'], question_results: [{ questionNumber: 1, type: 'multiple_choice', question: 'private-question-canary', studentAnswer: 'hidden-answer-canary', correctAnswer: 'correct-answer-canary', feedback: 'private-feedback-canary', isCorrect: false, pointsAwarded: 0, maxPoints: 1 }] }],
    ai_generations: [{ tenant_id: tenantId, user_id: studentId, id: 'generation-self', feature: 'learning-v2-tutor', provider: 'provider-secret-canary', model: 'provider-secret-model-canary', prompt_version: 'prompt-secret-canary', policy_version: 7, status: 'complete', validation_code: null, usage: { input_tokens: 3, output_tokens: 2 }, raw_payload_stored: false, created_at: now }],
    learning_events: [
      { tenant_id: tenantId, event_id: generateDomainId('evt'), event_schema_version: 'learning-event-v1', aggregate: { type: 'attempt', id: attemptId }, type: 'ATTEMPT_RECORDED', actor: { kind: 'teacher', id: 'foreign-teacher-id-canary' }, payload: { answer: 'hidden-answer-canary' }, correlation_id: 'secret-correlation', idempotency_key: 'secret-event-key', occurred_at: now, recorded_at: now },
      { tenant_id: foreignTenantId, event_id: generateDomainId('evt'), aggregate: { type: 'attempt', id: attemptId }, payload: { value: 'foreign-tenant-canary' } },
    ],
    learning_v2_tenants: [{ tenant_id: tenantId, status: 'active', write_fence: 0 }],
  }
}

test('bounded self export separates fact/interpretation/derived/audit/operational sections and omits forbidden data', async () => {
  const { db } = fakeDatabase(exportFixtures())
  const result = await exportLearningV2Subject(db, actor, studentId, { now: new Date('2026-08-31T13:00:00.000Z') })
  assert.equal(result.contract_version, LEARNING_V2_SUBJECT_EXPORT_VERSION)
  assert.equal(result.scope.subject, 'self')
  assert.equal(result.canonical_facts.attempts.length, 1)
  assert.equal(result.pedagogical_interpretations.evidence.length, 1)
  assert.equal(result.derived_state.knowledge_states.length, 1)
  assert.equal(result.process_audit.tutor_sessions.length, 1)
  assert.equal(result.operational_metadata.tutor_provider_usage.length, 1)
  const serialized = JSON.stringify(result)
  for (const canary of ['hidden-answer-canary', 'correct-answer-canary', 'private-question-canary', 'private-feedback-canary', 'private-teacher-note-canary', 'provider-secret-canary', 'provider-secret-model-canary', 'prompt-secret-canary', 'internal-policy-canary', 'foreign-teacher-id-canary', 'foreign-tenant-canary', 'other-subject-canary', tenantId, foreignTenantId, studentId, otherStudentId]) {
    assert.equal(serialized.includes(canary), false, canary)
  }
})

test('subject export rejects a teacher and any unrelated same-tenant or foreign subject target', async () => {
  const { db } = fakeDatabase(exportFixtures())
  await assert.rejects(exportLearningV2Subject(db, actor, otherStudentId), { code: 'NOT_FOUND' })
  await assert.rejects(exportLearningV2Subject(db, actor, 'foreign-subject'), { code: 'NOT_FOUND' })
  await assert.rejects(exportLearningV2Subject(db, { ...actor, actor_type: 'teacher', role: 'teacher', teacher_id: 'teacher', student_id: null }, studentId), { code: 'FORBIDDEN' })
})

function projectionEvidence(now, competencyId) {
  return [{
    evidence_id: generateDomainId('evd'), schema_version: 'evidence-event-v1', tenant_id: tenantId, student_id: studentId,
    type: 'correct_answer', target: { competency_id: competencyId, framework_id: generateDomainId('frm'), framework_version: 'synthetic', objective_id: generateDomainId('obj'), objective_version: 1, dimension: 'application' },
    claim: { result: 'supports' }, independence: { level: 'independent' }, source: { kind: 'attempt', source_id: generateDomainId('att'), task_id: generateDomainId('tsk'), task_version: 1 },
    provenance: { producer: 'evidence-rules', producer_version: 'evidence-rules-v1', evidence_policy_version: 'evidence-policy-v1', grader_version: 'legacy-deterministic-exact-v1' },
    quality: { source_confidence: 1, mapping_confidence: 1, classification_confidence: 1, historic: false }, response_modality: 'selected_response', occurred_at: now, recorded_at: now, status: 'active', idempotency_key: 'h12b-evidence-key',
  }]
}

test('rebuildable cleanup is idempotent, preserves canonical facts, and deterministic Knowledge State reproduces exactly', async () => {
  const now = new Date('2026-08-31T12:00:00.000Z')
  const competencyId = generateDomainId('cmp')
  const competencyRef = { competency_id: competencyId, framework_id: generateDomainId('frm'), framework_version: 'synthetic' }
  const evidence = projectionEvidence(now, competencyId)
  evidence[0].target.framework_id = competencyRef.framework_id
  evidence[0].target.framework_version = competencyRef.framework_version
  const projected = projectKnowledgeState({ tenantId, studentId, competencyRef, evidence, now })
  const fixtures = {
    learning_v2_tenants: [{ tenant_id: tenantId, status: 'active', write_fence: 0 }],
    student_knowledge_states: [{ ...structuredClone(projected), tenant_id: tenantId, student_id: studentId }],
    ai_generations: [{ tenant_id: tenantId, user_id: studentId, feature: 'learning-v2-tutor', id: 'telemetry-self' }, { tenant_id: foreignTenantId, user_id: studentId, feature: 'learning-v2-tutor', id: 'telemetry-foreign' }],
    learning_attempts: [{ tenant_id: tenantId, student_id: studentId, attempt_id: generateDomainId('att') }],
    evidence_events: structuredClone(evidence),
    learning_events: [{ tenant_id: tenantId, aggregate: { type: 'attempt', id: 'canonical' } }],
    tutor_sessions: [{ tenant_id: tenantId, student_id: studentId, session_id: generateDomainId('ses') }],
    submissions: [{ learning_v2_tenant_id: tenantId, student_id: studentId, id: 'submission-canonical' }],
  }
  const { db, rows } = fakeDatabase(fixtures)
  const canonicalBefore = Object.fromEntries(['learning_attempts', 'evidence_events', 'learning_events', 'tutor_sessions', 'submissions'].map((name) => [name, structuredClone(rows.get(name))]))
  const first = await clearRebuildableLearningV2SubjectData(db, actor, studentId)
  const second = await clearRebuildableLearningV2SubjectData(db, actor, studentId)
  assert.deepEqual(first.deleted, { student_knowledge_states: 1, ai_generations: 1 })
  assert.deepEqual(second.deleted, { student_knowledge_states: 0, ai_generations: 0 })
  assert.equal(first.canonical_learning_truth_changed, false)
  assert.equal(rows.get('student_knowledge_states').length, 0)
  assert.equal(rows.get('ai_generations').some((item) => item.id === 'telemetry-foreign'), true)
  for (const [name, values] of Object.entries(canonicalBefore)) assert.deepEqual(rows.get(name), values, name)
  const rebuilt = projectKnowledgeState({ tenantId, studentId, competencyRef, evidence, now })
  assert.deepEqual(projectionComparable(rebuilt), projectionComparable(projected))
})

test('rebuildable cleanup rejects unrelated subjects and never broadens into canonical erasure', async () => {
  const { db } = fakeDatabase({ learning_v2_tenants: [{ tenant_id: tenantId, status: 'active' }] })
  await assert.rejects(clearRebuildableLearningV2SubjectData(db, actor, otherStudentId), { code: 'NOT_FOUND' })
  assert.deepEqual(LEARNING_V2_SUBJECT_ERASURE_CONTRACT.safe_cleanup.map((item) => item.collection), ['student_knowledge_states', 'ai_generations'])
  assert.deepEqual(LEARNING_V2_SUBJECT_ERASURE_CONTRACT.canonical_subject_erasure.protected_collections, ['submissions', 'learning_attempts', 'evidence_events', 'learning_events', 'tutor_sessions'])
})

test('canonical stores and external categories receive no invented product TTL or Legal Hold implementation', () => {
  for (const id of ['learning_attempts', 'evidence_events', 'learning_events', 'student_knowledge_states', 'tutor_sessions', 'learning_recommendations', 'ai_generations', 'database_backups']) {
    const item = inventoryEntry(id)
    assert.equal(item.retention.status, 'unresolved')
    assert.equal(item.legal_hold.status, 'unresolved_no_runtime_implementation')
  }
})
