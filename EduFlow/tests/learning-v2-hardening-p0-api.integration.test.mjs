import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import { MongoClient } from 'mongodb'
import { seedP0, assessmentRequest } from './helpers/hardening-p0-fixture.mjs'
import { ensureLearningV2Indexes } from '../lib/server/learning-v2/database/bootstrap.js'

const enabled = process.env.RUN_INTEGRATION_TESTS === '1'
test('P0 public routes use authenticated delivery, current target authority and canonical mutations', { skip: !enabled }, async (t) => {
  const base = process.env.TEST_BASE_URL
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname))
  assert.match(process.env.DB_NAME || '', /^eduflow_learning_v2_test_[a-z0-9_-]+$/)
  const client = new MongoClient(process.env.MONGO_URL); await client.connect()
  const db = client.db(process.env.DB_NAME)
  const token = (actor) => jwt.sign(actor.actor_type === 'student' ? { studentId: actor.student_id } : { userId: actor.teacher_id }, process.env.JWT_SECRET, { expiresIn: '1h' })
  async function request(path, actor, body, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(`${base}${path}`, { method, headers: {
      ...(actor ? { Authorization: `Bearer ${token(actor)}` } : {}), 'Content-Type': 'application/json', Origin: base,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const result = await response.json()
    if (path.startsWith('/api/v2/')) assert.equal(response.headers.get('cache-control'), 'no-store')
    return { status: response.status, result }
  }
  const fixtures = []
  const seed = async () => { const f = await seedP0(db, new Date()); fixtures.push(f); return f }
  try {
    await ensureLearningV2Indexes(db)
    await t.test('H01/R01 assigned task get/list omit private fields; same-tenant unassigned, foreign, guest and stale delivery deny', async () => {
      const f = await seed(); const foreign = await seed()
      const path = `/api/v2/learning/tasks/${f.tasks[0].task_id}`
      const ok = await request(path, f.student)
      assert.equal(ok.status, 200, JSON.stringify(ok.result))
      assert.equal(ok.result.task.source, undefined)
      assert.equal(JSON.stringify(ok.result).includes('PRIVATE_EXPLANATION_CANARY'), false)
      assert.equal(JSON.stringify(ok.result).includes('answer_index'), false)
      assert.deepEqual(Object.keys(ok.result.task.content).sort(), ['options', 'prompt'])
      const list = await request('/api/v2/learning/tasks', f.student)
      assert.equal(list.status, 200); assert.equal(list.result.tasks.length, 3)
      assert.equal(list.result.tasks.every((task) => task.source === undefined), true)
      const teacher = await request(path, f.actor)
      assert.equal(teacher.status, 200); assert.equal(teacher.result.task.source.audit_snapshot.answer, 'HIDDEN_ANSWER_CANARY')
      assert.equal((await request(path, null)).status, 401)
      assert.equal((await request(path, foreign.student)).status, 404)
      await db.collection('assignments').updateOne({ id: f.assignment.id }, { $set: { show_solutions: false, feedback_mode: 'teacher_release' } })
      assert.deepEqual((await request(path, f.student)).result, ok.result)
      await db.collection('classes').updateOne({ id: f.classId }, { $set: { enrolled_students: [] } })
      assert.equal((await request(path, f.student)).status, 404)
      assert.equal((await request('/api/v2/learning/tasks', f.student)).result.tasks.length, 0)
      await db.collection('classes').updateOne({ id: f.classId }, { $set: { enrolled_students: [{ student_id: f.studentId }] } })
      for (const status of ['draft', 'retired']) {
        await db.collection('learning_tasks').updateOne({ task_id: f.tasks[0].task_id }, { $set: { status } })
        assert.equal((await request(path, f.student)).status, 404)
      }
      await db.collection('learning_tasks').updateOne({ task_id: f.tasks[0].task_id }, { $set: { status: 'published' } })
      await db.collection('worksheets').updateOne({ id: f.worksheetId }, { $set: { 'content.questions.0.question': 'Changed after pin' } })
      assert.equal((await request(path, f.student)).status, 404)
    })
    await t.test('H02/R02 Explanation and reconciliation reject unrelated, removed, transferred, disabled, deleted and ambiguous targets', async () => {
      const f = await seed(); const foreign = await seed()
      const path = `/api/v2/learning/knowledge-state/${f.studentId}/${f.competencyId}/explanation`
      const repair = { schema_version: 'learning-v2-phase2-v1', submission_id: f.submission.id }
      assert.equal((await request(path, f.actor)).status, 200)
      assert.equal((await request(path, f.student)).status, 200)
      assert.equal((await request(path, null)).status, 401)
      assert.equal((await request('/api/v2/learning/reconciliation', f.actor, repair)).result.reconciliation.failed, 0)
      for (const actor of [foreign.actor, { ...foreign.actor, tenant_id: f.tenantId }]) {
        assert.equal((await request(path, actor)).status, 404)
        assert.equal((await request('/api/v2/learning/reconciliation', actor, repair)).status, 404)
      }
      await db.collection('learning_v2_tenant_memberships').updateOne({ actor_id: foreign.teacherId }, { $set: { tenant_id: f.tenantId } })
      assert.equal((await request(path, foreign.actor)).status, 404)
      assert.equal((await request('/api/v2/learning/reconciliation', foreign.actor, repair)).status, 404)
      await db.collection('learning_v2_tenant_memberships').updateOne({ actor_id: foreign.teacherId }, { $set: { tenant_id: foreign.tenantId } })
      const transitions = [
        ['classes', { id: f.classId }, { enrolled_students: [] }, { enrolled_students: [{ student_id: f.studentId }] }],
        ['students', { id: f.studentId }, { status: 'disabled' }, { status: 'active' }],
        ['students', { id: f.studentId }, { status: 'deleted' }, { status: 'active' }],
        ['learning_v2_tenant_memberships', { actor_id: f.studentId }, { tenant_id: foreign.tenantId }, { tenant_id: f.tenantId }],
      ]
      for (const [name, filter, deny, restore] of transitions) {
        await db.collection(name).updateOne(filter, { $set: deny })
        assert.equal((await request(path, f.actor)).status, 404)
        assert.equal((await request('/api/v2/learning/reconciliation', f.actor, repair)).status, 404)
        await db.collection(name).updateOne(filter, { $set: restore })
      }
      await db.collection('learning_v2_tenant_memberships').insertOne({ actor_type: 'student', actor_id: f.studentId, tenant_id: foreign.tenantId, status: 'active', role: 'student' })
      assert.equal((await request(path, f.actor)).status, 404)
      assert.equal((await request('/api/v2/learning/reconciliation', f.actor, repair)).status, 404)
    })
    await t.test('H03/H05 public Tutor retry and assessment correction preserve canonical history on opposite payload/replay', async () => {
      const f = await seed()
      const start = await request('/api/v2/learning/tutor/sessions', f.student, { schema_version: 'learning-v2-phase3-v1', submission_id: f.submission.id, question_index: 0 })
      assert.equal(start.status, 200, JSON.stringify(start.result))
      const sessionId = start.result.session.session_id
      const prefix = `/api/v2/learning/tutor/sessions/${sessionId}`
      assert.equal((await request(`${prefix}/hints`, f.student, { schema_version: 'learning-v2-phase3-v1', idempotency_key: 'p0-http-hint' })).status, 200)
      const retryInput = { schema_version: 'learning-v2-phase3-v1', selected_response: 'Two', idempotency_key: 'p0-http-retry' }
      const retry = await request(`${prefix}/retries`, f.student, retryInput)
      assert.equal(retry.status, 200); assert.equal(retry.result.result.correctness, 'incorrect')
      const losing = await request(`${prefix}/retries`, f.student, { ...retryInput, selected_response: 'HIDDEN_ANSWER_CANARY' })
      assert.equal(losing.status, 200); assert.deepEqual(losing.result.result, retry.result.result)
      const path = `/api/v2/learning/teacher/students/${f.studentId}/assessments`
      const first = await request(path, f.actor, assessmentRequest(f))
      assert.equal(first.status, 200, JSON.stringify(first.result))
      const correctionInput = assessmentRequest(f, { replaces_evidence_id: first.result.assessment.evidence_id, claim: 'challenges', idempotency_key: 'p0-http-correction' })
      const correction = await request(path, f.actor, correctionInput)
      assert.equal(correction.status, 200, JSON.stringify(correction.result))
      const replay = await request(path, f.actor, { ...correctionInput, idempotency_key: 'p0-http-correction-replay' })
      assert.equal(replay.status, 200); assert.equal(replay.result.assessment.evidence_id, correction.result.assessment.evidence_id)
      const invalidate = `/api/v2/learning/teacher/evidence/${correction.result.assessment.evidence_id}/invalidate`
      const invalidation = { schema_version: 'learning-v2-phase4-v1', reason: 'entered_in_error', idempotency_key: 'p0-http-invalidation' }
      assert.equal((await request(invalidate, f.actor, invalidation)).status, 200)
      assert.equal((await request(invalidate, f.actor, invalidation)).status, 200)
      assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: f.tenantId, type: 'teacher_assessment', status: 'active' }), 0)
    })
    await t.test('H06 public account deletion removes learner-keyed tenant telemetry and denies old credentials', async () => {
      const f = await seed(); const foreign = await seed()
      await f.services.tutor.telemetry.record(f.student, { model_config: { model: 'synthetic' }, policy_ref: { version: 1 } }, { status: 'complete' })
      const result = await request('/api/auth/account', f.actor, { email: `${f.teacherId}@example.test` }, 'DELETE')
      assert.equal(result.status, 200, JSON.stringify(result.result))
      assert.equal(await db.collection('ai_generations').countDocuments({ tenant_id: f.tenantId }), 0)
      assert.equal(await db.collection('learning_v2_tenants').countDocuments({ tenant_id: f.tenantId }), 0)
      assert.equal((await request('/api/v2/learning/tasks', f.actor)).status, 401)
      assert.equal((await request('/api/v2/learning/tasks', foreign.actor)).status, 200)
    })
  } finally {
    // Exact synthetic fixture scopes only; the caller separately drops its disposable DB.
    for (const f of fixtures) for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
      await db.collection(name).deleteMany({ $or: [{ tenant_id: f.tenantId }, { id: { $in: [f.teacherId, f.studentId, f.worksheetId, f.classId, f.assignment.id, f.submission.id] } }] })
    }
    await client.close()
  }
})
