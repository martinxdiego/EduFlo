import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { MongoClient } from 'mongodb'
import { ensureLearningV2Indexes } from '../lib/server/learning-v2/database/bootstrap.js'
import { RecommendationService } from '../lib/server/learning-v2/recommendations/service.js'
import { RecommendationInputReader } from '../lib/server/learning-v2/recommendations/input-reader.js'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'
import { phase5Fixture, seedPhase5, mutation, learningSnapshot } from './helpers/phase5-fixture.mjs'

if (process.env.RUN_LEARNING_V2_MONGO_TESTS !== '1') {
  test('Phase 5 real Mongo requires RUN_LEARNING_V2_MONGO_TESTS=1', { skip: true }, () => {})
} else {
  const base = process.env.LEARNING_V2_TEST_DB_NAME
  assert.match(base || '', /^eduflow_learning_v2_test_[a-z0-9_-]+$/)
  const client = new MongoClient(process.env.MONGO_URL)
  await client.connect()
  test.after(async () => client.close())
  let serial = 0
  async function scenario(t, action) {
    const db = client.db(`${base}_p5_${++serial}`)
    t.after(async () => db.dropDatabase())
    await ensureLearningV2Indexes(db)
    const f = phase5Fixture(new Date('2026-08-27T10:00:00Z'))
    await seedPhase5(db, f)
    const service = new RecommendationService(db, { now: () => f.now })
    const evaluate = () => service.evaluate(f.actor, f.studentId, f.competencyId, mutation())
    await action({ db, f, service, evaluate })
  }
  const stale = (error) => error.code === 'RECOMMENDATION_STALE'
  test('canonical concurrent generation -> stale Evidence -> replacement -> concurrent approval; no learner writes', async (t) => scenario(t, async ({ db, f, service, evaluate }) => {
    const beforeGeneration = await learningSnapshot(db)
    const results = await Promise.all(Array.from({ length: 8 }, evaluate))
    assert.equal(new Set(results.map((item) => item.recommendation.recommendation_id)).size, 1)
    const old = results[0].recommendation
    assert.equal(old.type, 'TRY_SIMILAR'); assert.equal(old.candidate_task.task_id, f.tasks[1].task_id)
    assert.deepEqual(await learningSnapshot(db), beforeGeneration)
    const newEvidence = f.evidence(f.attempt(f.tasks[0], true, new Date(f.now.getTime() - 1)))
    await db.collection('evidence_events').insertOne(newEvidence)
    await assert.rejects(service.decide(f.actor, old.recommendation_id, 'approved', mutation()), stale)
    const superseded = await db.collection('learning_recommendations').findOne({ recommendation_id: old.recommendation_id })
    assert.equal(superseded.status, 'superseded'); assert.equal(superseded.decision, undefined)
    const fresh = await Promise.all(Array.from({ length: 8 }, evaluate))
    const id = fresh[0].recommendation.recommendation_id
    assert.notEqual(id, old.recommendation_id); assert.equal(new Set(fresh.map((item) => item.recommendation.recommendation_id)).size, 1)
    const before = await learningSnapshot(db)
    const key = mutation()
    const approvals = await Promise.all(Array.from({ length: 8 }, () => service.decide(f.actor, id, 'approved', key)))
    assert.equal(new Set(approvals.map((item) => item.recommendation.decision.decided_at.getTime())).size, 1)
    assert.equal(approvals.every((item) => item.recommendation.status === 'approved'), true)
    assert.deepEqual(await learningSnapshot(db), before)
    assert.equal(await db.collection('learning_recommendations').countDocuments({ status: 'approved' }), 1)
    const stored = await db.collection('learning_recommendations').findOne({ recommendation_id: id })
    assert.equal(stored.state_version, 2)
    await assert.rejects(service.decide(f.actor, id, 'dismissed', key), (error) => error.code === 'CONFLICT')
    const serialized = JSON.stringify([stored, ...approvals])
    for (const canary of ['RAW_ANSWER_CANARY', 'HIDDEN_ANSWER_CANARY', 'TEACHER_NOTE_CANARY', 'INVALIDATION_CANARY', 'PROTECTED_CANARY', key.idempotency_key]) assert.equal(serialized.includes(canary), false)
    await assert.rejects(db.collection('learning_recommendations').insertOne({ ...stored, _id: undefined, recommendation_id: generateDomainId('rec') }), (error) => error.code === 11000)
    await db.collection('evidence_events').insertOne(f.evidence())
    await evaluate()
    const historic = await db.collection('learning_recommendations').findOne({ recommendation_id: id })
    assert.equal(historic.status, 'superseded'); assert.deepEqual(historic.decision, stored.decision)
  }))
  test('approve/dismiss first decision and same-key opposite-action races are canonical', async (t) => scenario(t, async ({ db, f, service, evaluate }) => {
    const id = (await evaluate()).recommendation.recommendation_id
    const result = await Promise.all([service.decide(f.actor, id, 'approved', mutation()), service.decide(f.actor, id, 'dismissed', mutation())])
    assert.equal(result[0].recommendation.decision.action, result[1].recommendation.decision.action)
    assert.equal((await db.collection('learning_recommendations').findOne({ recommendation_id: id })).state_version, 2)
    const next = await evaluate()
    assert.equal(next.recommendation.recommendation_id, id)
  }))
  test('concurrent dismissal remains terminal, replay canonical, no re-presentation', async (t) => scenario(t, async ({ db, f, service, evaluate }) => {
    const id = (await evaluate()).recommendation.recommendation_id; const key = mutation()
    const decisions = await Promise.all(Array.from({ length: 6 }, () => service.decide(f.actor, id, 'dismissed', key)))
    assert.equal(decisions.every((item) => item.recommendation.status === 'dismissed'), true)
    assert.equal((await evaluate()).outcome, 'HISTORICAL_RECOMMENDATION')
    assert.equal(await db.collection('learning_recommendations').countDocuments({}), 1)
  }))
  for (const barrier of ['beforeDecisionCas', 'afterDecisionCas']) test(`staleness at ${barrier} is found post-CAS and immutable intent becomes non-current`, async (t) => scenario(t, async ({ db, f, evaluate }) => {
    const id = (await evaluate()).recommendation.recommendation_id
    const service = new RecommendationService(db, { now: () => f.now, hooks: { [barrier]: async () => { await db.collection('evidence_events').insertOne(f.evidence()) } } })
    await assert.rejects(service.decide(f.actor, id, 'approved', mutation()), stale)
    const historic = await db.collection('learning_recommendations').findOne({ recommendation_id: id })
    assert.equal(historic.status, 'superseded'); assert.equal(historic.decision.action, 'approved')
  }))
  const mutations = {
    'new automatic Evidence': async ({ db, f }) => db.collection('evidence_events').insertOne(f.evidence()),
    'new assisted Evidence': async ({ db, f }) => db.collection('evidence_events').insertOne({ ...f.evidence(), type: 'correct_after_hint', hint_level: 2, tutor_weight: .45, independence: { level: 'lightly_supported' }, provenance: { producer: 'tutor-evidence-rules', producer_version: 'tutor-evidence-rules-v1', grader_version: 'legacy-deterministic-exact-v1', evidence_policy_version: 'evidence-policy-v2-development' } }),
    'new support_required': async ({ db, f }) => db.collection('evidence_events').insertOne({ ...f.evidence(), type: 'support_required', hint_level: 3, tutor_weight: 0, claim: { result: 'neutral' }, independence: { level: 'supported' }, provenance: { producer: 'tutor-evidence-rules', producer_version: 'tutor-evidence-rules-v1', grader_version: 'legacy-deterministic-exact-v1', evidence_policy_version: 'evidence-policy-v2-development' } }),
    'teacher assessment': async ({ db, f }) => db.collection('evidence_events').insertOne({ ...f.evidence(), type: 'teacher_assessment', assessment_basis: 'single_observation', teacher_weight: .75, independence: { level: 'teacher_assessment' }, source: { kind: 'teacher_assessment', source_id: 'synthetic-assessment', task_id: null, task_version: null }, response_modality: 'teacher_observation', provenance: { producer: 'teacher-evidence-rules', producer_version: 'teacher-evidence-rules-v1', grader_version: null, evidence_policy_version: 'evidence-policy-v3-teacher-development' } }),
    'neutral no_demonstration': async ({ db, f }) => db.collection('evidence_events').insertOne({ ...f.evidence(), type: 'teacher_assessment', claim: { result: 'no_demonstration' }, assessment_basis: 'single_observation', teacher_weight: 0, independence: { level: 'teacher_assessment' }, source: { kind: 'teacher_assessment', source_id: 'synthetic-assessment', task_id: null, task_version: null }, response_modality: 'teacher_observation', provenance: { producer: 'teacher-evidence-rules', producer_version: 'teacher-evidence-rules-v1', grader_version: null, evidence_policy_version: 'evidence-policy-v3-teacher-development' } }),
    'invalidation': async ({ db, f }) => db.collection('evidence_events').updateOne({ evidence_id: f.initialEvidence.evidence_id }, { $set: { status: 'invalidated' } }),
    'replacement': async ({ db, f }) => { await db.collection('evidence_events').updateOne({ evidence_id: f.initialEvidence.evidence_id }, { $set: { status: 'invalidated' } }); await db.collection('evidence_events').insertOne(f.evidence()) },
    'Attempt without Evidence': async ({ db, f }) => db.collection('learning_attempts').insertOne(f.attempt(f.tasks[1])),
    'task unpublished': async ({ db, f }) => db.collection('learning_tasks').updateOne({ task_id: f.tasks[1].task_id }, { $set: { status: 'draft' } }),
    'source changed': async ({ db, f }) => db.collection('worksheets').updateOne({ id: f.worksheetId }, { $set: { 'content.questions.1.question': 'Changed authored question' } }),
    'framework version': async ({ db, f }) => db.collection('curriculum_nodes').updateOne({ competency_id: f.competencyId }, { $set: { 'framework_ref.version': 'changed' } }),
    'objective retired': async ({ db, f }) => db.collection('learning_objectives').updateOne({ objective_id: f.objectiveId }, { $set: { status: 'retired' } }),
    'candidate set changed': async ({ db, f }) => db.collection('learning_tasks').updateOne({ task_id: f.tasks[2].task_id }, { $set: { status: 'retired' } }),
    'ambiguous task version': async ({ db, f }) => db.collection('learning_tasks').insertOne({ ...structuredClone(f.tasks[1]), version: 2 }),
    'duplicate source binding': async ({ db, f }) => db.collection('learning_tasks').insertOne({ ...structuredClone(f.tasks[1]), task_id: generateDomainId('tsk') }),
    'projection algorithm': async ({ db }) => db.collection('student_knowledge_states').updateOne({}, { $set: { 'projection.algorithm_version': 'changed' } }),
    'projection coefficients': async ({ db }) => db.collection('student_knowledge_states').updateOne({}, { $set: { 'projection.coefficient_set_version': 'changed' } }),
    'rule version': async ({ service }) => { service.reader.ruleVersion = 'new-development-version' },
    'policy version': async ({ service }) => { service.reader.policyVersion = 'new-policy-version' },
    '24h expiry': async ({ f }) => { f.now = new Date(f.now.getTime() + 86400000) },
  }
  for (const [name, change] of Object.entries(mutations)) test(`fail-closed stale: ${name}`, async (t) => scenario(t, async (context) => {
    const { db, f, service, evaluate } = context
    const id = (await evaluate()).recommendation.recommendation_id
    await change(context)
    await assert.rejects(service.decide(f.actor, id, 'approved', mutation()), stale)
    const row = await db.collection('learning_recommendations').findOne({ recommendation_id: id })
    assert.ok(['superseded', 'expired'].includes(row.status)); assert.equal(row.decision, undefined)
  }))
  test('Reflection-only text/status/completion leaves hashes identical; non-Reflection Tutor activity stales', async (t) => scenario(t, async ({ db, f, service, evaluate }) => {
    const sessionId = generateDomainId('ses')
    await db.collection('tutor_sessions').insertOne({ tenant_id: f.tenantId, student_id: f.studentId, session_id: sessionId, task_ref: f.initialAttempt.task_ref, objective_ref: f.objectiveRef, trigger_attempt_id: f.initialAttempt.attempt_id, outcome: 'correct_after_hint', status: 'active', highest_hint_level: 2, hint_count: 2, retry_count: 2, started_at: f.now, expires_at: new Date(f.now.getTime() + 1000), reflection: { status: 'requested', text: 'REFLECTION_CANARY' }, last_hint: { learner_message: 'HINT_CANARY' }, model_config: { raw: 'PROVIDER_CANARY' } })
    const first = (await evaluate()).recommendation
    const event = (type) => ({ event_id: generateDomainId('evt'), tenant_id: f.tenantId, type, aggregate: { type: 'tutor_session', id: sessionId }, occurred_at: f.now, recorded_at: f.now, idempotency_key: randomUUID(), payload: { text: 'REFLECTION_CANARY' } })
    await db.collection('learning_events').insertMany([event('REFLECTION_REQUESTED'), event('REFLECTION_SUBMITTED'), event('TUTOR_SESSION_COMPLETED')])
    await db.collection('tutor_sessions').updateOne({ session_id: sessionId }, { $set: { status: 'completed', phase: 'closed', state_version: 100, updated_at: new Date(), reflection: { status: 'submitted', text: 'CHANGED_REFLECTION_CANARY' } } })
    assert.equal((await evaluate()).recommendation.recommendation_id, first.recommendation_id)
    const approved = await service.decide(f.actor, first.recommendation_id, 'approved', mutation())
    assert.equal(approved.recommendation.status, 'approved')
    for (const canary of ['REFLECTION_CANARY', 'HINT_CANARY', 'PROVIDER_CANARY']) assert.equal(JSON.stringify(approved).includes(canary), false)
    await db.collection('learning_events').insertOne(event('HINT_GIVEN'))
    await assert.rejects(service.decide(f.actor, first.recommendation_id, 'approved', mutation()), stale)
  }))
  test('full auth boundary: student, foreign/co-teacher, unrelated, removed, transferred and guessed IDs', async (t) => scenario(t, async ({ db, f, service, evaluate }) => {
    const id = (await evaluate()).recommendation.recommendation_id
    await assert.rejects(service.decide(f.student, id, 'approved', mutation()), (error) => error.code === 'FORBIDDEN')
    await assert.rejects(service.decide({ ...f.actor, teacher_id: 'other-teacher' }, id, 'approved', mutation()), (error) => error.code === 'NOT_FOUND')
    await assert.rejects(service.decide({ ...f.actor, tenant_id: generateDomainId('ten') }, id, 'approved', mutation()), (error) => error.code === 'NOT_FOUND')
    await assert.rejects(service.decide(f.actor, generateDomainId('rec'), 'approved', mutation()), (error) => error.code === 'NOT_FOUND')
    await db.collection('classes').updateOne({ id: f.classId }, { $set: { enrolled_students: [] } })
    await assert.rejects(service.decide(f.actor, id, 'approved', mutation()), (error) => error.code === 'NOT_FOUND')
    await assert.rejects(evaluate(), (error) => error.code === 'NOT_FOUND')
    await db.collection('classes').updateOne({ id: f.classId }, { $set: { enrolled_students: [{ student_id: f.studentId }] } })
    await db.collection('learning_v2_tenant_memberships').updateOne({ actor_id: f.studentId }, { $set: { tenant_id: generateDomainId('ten') } })
    await assert.rejects(evaluate(), (error) => error.code === 'NOT_FOUND')
  }))
  test('ambiguous objective requires explicit exact scope; ambiguous versions abstain and no-candidate never persists', async (t) => scenario(t, async ({ db, f, service, evaluate }) => {
    const objective = await db.collection('learning_objectives').findOne({ objective_id: f.objectiveId })
    const second = { ...objective, _id: undefined, objective_id: generateDomainId('obj') }
    await db.collection('learning_objectives').insertOne(second)
    assert.equal((await evaluate()).reasons[0].code, 'AMBIGUOUS_OBJECTIVE_SCOPE')
    const exact = await service.evaluate(f.actor, f.studentId, f.competencyId, { ...mutation(), objective_ref: f.objectiveRef })
    assert.equal(exact.recommendation.type, 'TRY_SIMILAR')
    await db.collection('learning_objectives').insertOne({ ...objective, _id: undefined, version: 2 })
    assert.equal((await service.evaluate(f.actor, f.studentId, f.competencyId, { ...mutation(), objective_ref: f.objectiveRef })).outcome, 'NO_RECOMMENDATION')
    await db.collection('learning_objectives').deleteMany({ objective_id: second.objective_id })
    await db.collection('learning_objectives').deleteOne({ objective_id: f.objectiveId, version: 2 })
    await db.collection('learning_tasks').updateMany({}, { $set: { status: 'retired' } })
    const noTask = await evaluate()
    assert.equal(noTask.outcome, 'NO_RECOMMENDATION'); assert.ok(noTask.reasons.some((item) => item.code === 'NO_ELIGIBLE_TASK'))
    assert.equal(await db.collection('learning_recommendations').countDocuments({ status: 'presented' }), 0)
  }))
  test('operational reader failure rejects, never produces pedagogical abstention', async (t) => scenario(t, async ({ db, f }) => {
    const reader = new RecommendationInputReader(db, { contentAdapter: { verifyRecommendationSource: async () => { throw new Error('PRIVATE_INTERNAL_CANARY') } } })
    const service = new RecommendationService(db, { reader })
    await assert.rejects(service.evaluate(f.actor, f.studentId, f.competencyId, mutation()), /PRIVATE_INTERNAL_CANARY/)
    assert.equal(await db.collection('learning_recommendations').countDocuments({}), 0)
  }))
  test('canonical Level-3 exhaustion links exact retry and session; active Tutor is a hard abstention', async (t) => scenario(t, async ({ db, f, evaluate }) => {
    const sessionId = generateDomainId('ses')
    const retry = f.attempt(f.tasks[0], false)
    retry.source = { ...retry.source, kind: 'tutor_retry', tutor_session_id: sessionId, hint_level: 3 }
    await db.collection('learning_attempts').insertOne(retry)
    await db.collection('tutor_sessions').insertOne({ tenant_id: f.tenantId, student_id: f.studentId, session_id: sessionId, trigger_attempt_id: f.initialAttempt.attempt_id, task_ref: retry.task_ref, objective_ref: f.objectiveRef, outcome: 'pending', status: 'active', highest_hint_level: 3, hint_count: 3, retry_count: 3, started_at: f.now, expires_at: new Date(f.now.getTime() + 1000) })
    assert.equal((await evaluate()).reasons[0].code, 'ACTIVE_TUTOR_SESSION')
    const exhaustion = { ...f.evidence(retry), type: 'support_required', claim: { result: 'neutral' }, independence: { level: 'supported' }, tutor_weight: 0, hint_level: 3, provenance: { producer: 'tutor-evidence-rules', producer_version: 'tutor-evidence-rules-v1', grader_version: 'legacy-deterministic-exact-v1', evidence_policy_version: 'evidence-policy-v2-development' } }
    await db.collection('evidence_events').insertOne(exhaustion)
    await db.collection('tutor_sessions').updateOne({ session_id: sessionId }, { $set: { status: 'escalated', outcome: 'support_required' } })
    const evaluated = await evaluate()
    assert.equal(evaluated.recommendation.type, 'TEACHER_INTERVENTION')
    assert.equal(evaluated.recommendation.technical.rule.rule_id, 'P5-R2')
    assert.equal(evaluated.recommendation.candidate_task, null)
  }))
  for (const field of ['hidden', 'archived', 'foreign_owner']) test(`source integrity rejects ${field} content without copying it`, async (t) => scenario(t, async ({ db, f, evaluate }) => {
    await db.collection('worksheets').updateOne({ id: f.worksheetId }, { $set: field === 'foreign_owner' ? { user_id: 'other-teacher' } : { [field]: true } })
    const evaluated = await evaluate()
    assert.equal(evaluated.outcome, 'NO_RECOMMENDATION'); assert.ok(evaluated.reasons.some((item) => item.code === 'NO_ELIGIBLE_TASK'))
    assert.equal(await db.collection('learning_recommendations').countDocuments({}), 0)
  }))
  test('open-primary and tenant-wide decision-key unique indexes reject independent conflicting inserts', async (t) => scenario(t, async ({ db, f, service, evaluate }) => {
    const id = (await evaluate()).recommendation.recommendation_id
    const record = await db.collection('learning_recommendations').findOne({ recommendation_id: id })
    await assert.rejects(db.collection('learning_recommendations').insertOne({ ...record, _id: undefined, recommendation_id: generateDomainId('rec'), generation_key: 'different-generation' }), (error) => error.code === 11000)
    const key = mutation()
    await service.decide(f.actor, id, 'approved', key)
    await db.collection('evidence_events').insertOne(f.evidence())
    const replacement = (await evaluate()).recommendation
    await assert.rejects(service.decide(f.actor, replacement.recommendation_id, 'approved', key), (error) => error.code === 'CONFLICT')
    assert.equal(await db.collection('learning_recommendations').countDocuments({ 'decision.action': 'approved' }), 1)
  }))
}
