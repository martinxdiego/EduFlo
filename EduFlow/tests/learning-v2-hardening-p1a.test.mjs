import { localHostingEnvironment } from './helpers/local-hosting-environment.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { phase5Fixture } from './helpers/phase5-fixture.mjs'
import { resolveLearningV2Capabilities } from '../lib/server/learning-v2/feature-flags/learning-v2.js'
import { handleLearningV2Route } from '../lib/server/learning-v2/http/route-handler.js'
import { projectKnowledgeState } from '../lib/server/learning-v2/knowledge-state/projection.js'
import { ProjectionService } from '../lib/server/learning-v2/knowledge-state/projection-service.js'
import { ExplanationService } from '../lib/server/learning-v2/knowledge-state/explanation-service.js'
import { createRequestScope } from '../components/learning-v2/request-scope.js'
import { createOperationReceipts } from '../components/learning-v2/operation-receipts.js'

const flags = ['LEARNING_V2_ENABLED', 'LEARNING_V2_PHASE_2_ENABLED', 'LEARNING_V2_PHASE_3_ENABLED', 'LEARNING_V2_PHASE_3B_ENABLED', 'LEARNING_V2_PHASE_4_ENABLED', 'LEARNING_V2_PHASE_5_ENABLED']
const all = { ...localHostingEnvironment, ...Object.fromEntries(flags.map((name) => [name, '1'])) }

test('H11 actual capability graph is explicit, independent where allowed, and production-closed', () => {
  assert.ok(Object.values(resolveLearningV2Capabilities({ ...localHostingEnvironment, ...all, NODE_ENV: 'production' })).every((value) => !value))
  assert.ok(Object.values(resolveLearningV2Capabilities({ ...localHostingEnvironment, ...all, LEARNING_V2_ENABLED: '0' })).every((value) => !value))
  const teacherOnly = resolveLearningV2Capabilities({ ...localHostingEnvironment, LEARNING_V2_ENABLED: '1', LEARNING_V2_PHASE_4_ENABLED: '1', LEARNING_V2_PHASE_5_ENABLED: '1' })
  assert.equal(teacherOnly.teacher, true); assert.equal(teacherOnly.recommendations, true); assert.equal(teacherOnly.ingestion, false)
  assert.equal(resolveLearningV2Capabilities({ ...localHostingEnvironment, ...all, LEARNING_V2_PHASE_3_ENABLED: '0' }).reflection, false)
  assert.equal(resolveLearningV2Capabilities({ ...localHostingEnvironment, ...all, LEARNING_V2_PHASE_4_ENABLED: '0' }).recommendations, false)
})

test('H11 disabled routes reject before unavailable Mongo or provider/domain composition', async () => {
  const keys = [...flags, 'NODE_ENV', 'MONGO_URL', 'DB_NAME']
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  try {
    delete process.env.MONGO_URL; delete process.env.DB_NAME
    for (const [capability, flag] of Object.entries({ definitions: flags[0], ingestion: flags[1], tutor: flags[2], reflection: flags[3], teacher: flags[4], recommendations: flags[5] })) {
      Object.assign(process.env, all, { NODE_ENV: 'test', [flag]: '0' })
      let touched = false
      const response = await handleLearningV2Route(new Request('http://localhost/api/v2/learning/test'), capability, () => { touched = true; throw new Error('provider unavailable') })
      assert.equal(response.status, 404); assert.equal(touched, false)
    }
    Object.assign(process.env, all, { NODE_ENV: 'production' })
    for (const capability of Object.keys(resolveLearningV2Capabilities(all))) assert.equal((await handleLearningV2Route(new Request('http://localhost/api/v2/learning/test'), capability, () => assert.fail('production mutation'))).status, 404)
  } finally { for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key] }
})

test('H08 explicit clock, inclusive 90-day boundary, fixed reproduction and current refresh', async () => {
  const f = phase5Fixture(new Date('2026-08-28T00:00:00Z'))
  const evidence = [f.evidence(f.attempt())]
  const args = { tenantId: f.tenantId, studentId: f.studentId, competencyRef: f.competencyRef, evidence }
  assert.throws(() => projectKnowledgeState(args), { code: 'VALIDATION_ERROR' })
  const atBoundary = new Date(f.now.getTime() + 90 * 86400000)
  const exact = projectKnowledgeState({ ...args, now: atBoundary })
  const after = projectKnowledgeState({ ...args, now: new Date(atBoundary.getTime() + 1) })
  assert.equal(exact.confidence, 0.255); assert.equal(after.confidence, 0.205); assert.equal(exact.mastery, after.mastery)
  let clockReads = 0
  const service = new ProjectionService({ async snapshotForCompetency() { return { evidence, sourceRevision: 7 } } },
    { async replace(_actor, state) { return { state, changed: true } } }, { async record() {} }, { now: () => { clockReads++; return after.projection.as_of } })
  const snapshot = { evidence, sourceRevision: 7, asOf: atBoundary, configurationId: 'selected-response-v1' }
  const first = service.reproduce(f.actor, f.studentId, f.competencyRef, snapshot)
  assert.deepEqual(service.reproduce(f.actor, f.studentId, f.competencyRef, snapshot), first)
  assert.equal(clockReads, 0)
  assert.equal((await service.rebuild(f.actor, f.studentId, f.competencyRef)).confidence, 0.205)
  assert.equal(clockReads, 1)
  assert.throws(() => service.reproduce(f.actor, f.studentId, f.competencyRef, { ...snapshot, asOf: undefined }), { code: 'VALIDATION_ERROR' })
  assert.throws(() => projectKnowledgeState({ ...args, now: f.now, configurationId: 'unapproved-coefficients' }), { code: 'VALIDATION_ERROR' })
})

test('H08 rejects mixed scope, malformed semantics and duplicate canonical evidence', () => {
  const f = phase5Fixture(); const item = f.initialEvidence
  const args = { tenantId: f.tenantId, studentId: f.studentId, competencyRef: f.competencyRef, now: f.now }
  for (const patch of [{ tenant_id: 'foreign' }, { student_id: 'foreign' }, { status: 'unknown' }, { target: { ...item.target, framework_version: 'foreign' } }, { claim: { result: 'neutral' } }]) {
    assert.throws(() => projectKnowledgeState({ ...args, evidence: [{ ...item, ...patch }] }), { code: 'VALIDATION_ERROR' })
  }
  assert.throws(() => projectKnowledgeState({ ...args, evidence: [item, item] }), { code: 'VALIDATION_ERROR' })
})

test('H08 neutral-only Evidence stays visible as context, and approved configuration versions are explicit', async () => {
  const f = phase5Fixture()
  const neutral = { ...f.initialEvidence, type: 'teacher_assessment', claim: { result: 'no_demonstration' },
    independence: { level: 'teacher_assessment' }, assessment_basis: 'single_observation', teacher_weight: 0,
    source: { kind: 'teacher_assessment', source_id: f.teacherId, task_id: null, task_version: null }, response_modality: 'teacher_observation',
    provenance: { producer: 'teacher-evidence-rules', producer_version: 'teacher-evidence-rules-v1', evidence_policy_version: 'evidence-policy-v3-teacher-development', grader_version: null } }
  const args = { tenantId: f.tenantId, studentId: f.studentId, competencyRef: f.competencyRef, now: f.now }
  const state = projectKnowledgeState({ ...args, evidence: [neutral] })
  assert.equal(state.mastery, .5); assert.equal(state.confidence, 0); assert.deepEqual(state.contribution_summary, [])
  const explanations = new ExplanationService({ async snapshotForCompetency() { return { evidence: [neutral], sourceRevision: 3 } } }, { async find() { return null } }, null, { now: () => f.now })
  const result = await explanations.explain(f.student, f.studentId, f.competencyId)
  assert.deepEqual(result.contributing_evidence, []); assert.equal(result.contextual_evidence[0].evidence_id, neutral.evidence_id)
  assert.equal(result.contextual_evidence[0].arithmetic_contribution, 'none')
  assert.throws(() => projectKnowledgeState({ ...args, evidence: [neutral], configurationId: 'selected-response-v1' }), { code: 'VALIDATION_ERROR' })
  const base = projectKnowledgeState({ ...args, evidence: [f.initialEvidence] })
  const versioned = projectKnowledgeState({ ...args, evidence: [f.initialEvidence], configurationId: 'teacher-assessment-v1' })
  assert.equal(base.mastery, versioned.mastery); assert.equal(base.confidence, versioned.confidence)
  assert.notEqual(base.projection.algorithm_version, versioned.projection.algorithm_version)
  assert.notEqual(base.projection.coefficient_set_version, versioned.projection.coefficient_set_version)
})

test('H13 delayed target/channel responses are ignored across switches and close/reopen', async () => {
  const a = createRequestScope('learner-A:competency-A:objective-1')
  const old = ['state', 'evidence', 'tutor', 'recommendation', 'decision'].map((channel) => a.begin(channel))
  a.close(); const b = createRequestScope('learner-B:competency-B:objective-2')
  const fresh = b.begin('state')
  await Promise.resolve()
  assert.ok(old.every((request) => !request.current() && request.signal.aborted)); assert.equal(fresh.current(), true)
  b.close(); b.open(); assert.equal(fresh.current(), false)
  const first = b.begin('detail'); const second = b.begin('detail')
  assert.equal(first.current(), false); assert.equal(second.current(), true)
})

test('H13 lost Tutor response retains operation identity and the original payload', () => {
  let generated = 0
  const receipts = createOperationReceipts(() => `request-${++generated}`)
  const first = receipts.get('session:retry:1', { selected_response: 'A' })
  assert.deepEqual(receipts.get('session:retry:1', { selected_response: 'B' }), first)
  assert.equal(generated, 1)
  const next = receipts.get('session:retry:2', { selected_response: 'B' })
  assert.notEqual(next.idempotency_key, first.idempotency_key)
})
