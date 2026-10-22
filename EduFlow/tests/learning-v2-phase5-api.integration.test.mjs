import assert from 'node:assert/strict'
import test from 'node:test'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { MongoClient } from 'mongodb'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'
import { phase5Fixture, seedPhase5, mutation, learningSnapshot } from './helpers/phase5-fixture.mjs'

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3015'
if (process.env.RUN_INTEGRATION_TESTS !== '1') {
  test('Phase 5 HTTP requires RUN_INTEGRATION_TESTS=1', { skip: true }, () => {})
} else if (process.env.PHASE5_HTTP_EXPECT_DISABLED === '1') {
  test('Phase 5 disabled/production live HTTP gate rejects all three routes before DB or auth', async () => {
    for (const path of [`teacher/students/s/competencies/${generateDomainId('cmp')}/recommendations`, `teacher/recommendations/${generateDomainId('rec')}/approve`, `teacher/recommendations/${generateDomainId('rec')}/dismiss`]) {
      const response = await fetch(`${baseUrl}/api/v2/learning/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mutation()) })
      assert.equal(response.status, 404); assert.equal(response.headers.get('cache-control'), 'no-store')
    }
  })
} else {
  assert.match(process.env.DB_NAME || '', /^eduflow_learning_v2_test_[a-z0-9_-]+$/)
  const client = new MongoClient(process.env.MONGO_URL)
  await client.connect()
  const db = client.db(process.env.DB_NAME)
  test.after(async () => client.close())
  async function scenario(t, action) {
    const f = phase5Fixture()
    await seedPhase5(db, f)
    t.after(async () => {
      for (const collection of await db.listCollections({}, { nameOnly: true }).toArray()) {
        await db.collection(collection.name).deleteMany({ $or: [{ tenant_id: f.tenantId }, { id: { $in: [f.teacherId, f.studentId, f.worksheetId, f.classId] } }, { teacher_id: f.teacherId }, { student_id: f.studentId }] })
      }
    })
    const auth = `Bearer ${jwt.sign({ userId: f.teacherId, email: `${f.teacherId}@example.test` }, process.env.JWT_SECRET, { expiresIn: '1h' })}`
    const url = `/api/v2/learning/teacher/students/${f.studentId}/competencies/${f.competencyId}/recommendations`
    const post = async (path, body = mutation(), authorization = auth, cookie) => {
      const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl, ...(authorization ? { Authorization: authorization } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })
      const result = await response.json()
      return { response, result }
    }
    const evaluate = (body) => post(url, body)
    const decide = (id, action = 'approve', body) => post(`/api/v2/learning/teacher/recommendations/${id}/${action}`, body)
    await action({ f, auth, url, post, evaluate, decide })
  }
  test('teacher login -> detail -> concurrent TRY_SIMILAR -> concurrent approval -> canonical learner Evidence -> stale -> replacement', async (t) => scenario(t, async ({ f, post, evaluate, decide }) => {
    const password = 'Phase5-synthetic-password-42'
    const passwordHash = await bcrypt.hash(password, 4)
    await db.collection('users').updateOne({ id: f.teacherId }, { $set: { password_hash: passwordHash, subscription_tier: 'free' } })
    await db.collection('students').updateOne({ id: f.studentId }, { $set: { username: `p5-${f.suffix.slice(0, 8)}`, password_hash: passwordHash, xp: 0, total_points: 0 } })
    const login = await post('/api/auth/login', { email: `${f.teacherId}@example.test`, password }, null)
    assert.equal(login.response.status, 200)
    const cookie = login.response.headers.get('set-cookie').split(';')[0]
    assert.match(cookie, /^eduflow_session=/)
    const detail = await fetch(`${baseUrl}/api/v2/learning/teacher/students/${f.studentId}/competencies/${f.competencyId}`, { headers: { Cookie: cookie } })
    assert.equal(detail.status, 200); assert.equal((await detail.json()).recommendations_enabled, true)
    const concurrent = await Promise.all(Array.from({ length: 6 }, () => evaluate()))
    for (const value of concurrent) { assert.equal(value.response.status, 200, JSON.stringify(value.result)); assert.equal(value.response.headers.get('cache-control'), 'no-store') }
    const first = concurrent[0].result.recommendation
    assert.equal(first.type, 'TRY_SIMILAR'); assert.equal(first.candidate_task.task_id, f.tasks[1].task_id)
    assert.ok(first.reasons.some((item) => item.code === 'SINGLE_TASK_ONLY'))
    assert.equal(new Set(concurrent.map((item) => item.result.recommendation.recommendation_id)).size, 1)
    const before = await learningSnapshot(db)
    const key = mutation()
    const decisions = await Promise.all(Array.from({ length: 6 }, () => decide(first.recommendation_id, 'approve', key)))
    assert.equal(decisions.every((item) => item.response.status === 200 && item.result.recommendation.status === 'approved'), true)
    assert.equal(new Set(decisions.map((item) => item.result.recommendation.decision.decided_at)).size, 1)
    assert.deepEqual(await learningSnapshot(db), before)
    assert.equal((await decide(first.recommendation_id, 'dismiss', key)).response.status, 409)

    const assessment = await post(`/api/v2/learning/teacher/students/${f.studentId}/assessments`, { schema_version: 'learning-v2-phase4-v1', competency_id: f.competencyId, objective_id: f.objectiveId, objective_version: 1, claim: 'no_demonstration', basis: 'single_observation', observed_at: new Date().toISOString(), reason: 'direct_observation', idempotency_key: mutation().idempotency_key })
    assert.equal(assessment.response.status, 200)
    const presented = (await evaluate()).result.recommendation
    assert.equal(presented.status, 'presented'); assert.notEqual(presented.recommendation_id, first.recommendation_id)

    // Produce the next Evidence through the accepted Phase-2 learner HTTP flow.
    const assignmentId = `p5-assignment-${f.suffix}`; const assignmentCode = `P5${f.suffix.slice(0, 7).toUpperCase()}`
    await db.collection('assignments').insertOne({ id: assignmentId, code: assignmentCode, worksheet_id: f.worksheetId, worksheet_title: 'Phase 5 synthetic worksheet', teacher_id: f.teacherId, class_id: f.classId, status: 'active', max_attempts: 1, created_at: new Date() })
    const bound = await post(`/api/v2/learning/assignments/${assignmentId}/binding`, { schema_version: 'learning-v2-phase2-v1', task_pins: [{ task_id: f.tasks[1].task_id, task_version: 1, question_id: f.questions[1].question_id }] })
    assert.equal(bound.response.status, 200, JSON.stringify(bound.result))
    const studentLogin = await post('/api/student/login', { username: `p5-${f.suffix.slice(0, 8)}`, password }, null)
    assert.equal(studentLogin.response.status, 200)
    const studentCookie = studentLogin.response.headers.get('set-cookie').split(';')[0]
    const deliveryResponse = await fetch(`${baseUrl}/api/student/assignment/${assignmentCode}`, { headers: { Cookie: studentCookie } })
    assert.equal(deliveryResponse.status, 200)
    const delivery = await deliveryResponse.json(); assert.ok(delivery.learningV2SubmissionIntent)
    const submitted = await post('/api/student/submit', { assignmentCode, studentName: 'Synthetic Phase 5 learner', answers: f.questions.map((item) => item.answer), duration: 12, learningV2SubmissionIntent: delivery.learningV2SubmissionIntent }, null, studentCookie)
    assert.equal(submitted.response.status, 201, JSON.stringify(submitted.result))
    // Legacy HTTP success does not promise completion of the bounded V2 adapter.
    // Require validated durable context, then the existing authorized completion
    // boundary; neither a sleep nor a new fixture identity repairs missing pins.
    const durable = await db.collection('submissions').findOne({ id: submitted.result.submissionId })
    assert.equal(durable.learning_v2_tenant_id, f.tenantId)
    assert.ok(durable.learning_v2_submission_intent_id)
    const completed = await post('/api/v2/learning/reconciliation', { schema_version: 'learning-v2-phase2-v1', assignment_id: assignmentId, submission_id: durable.id, limit: 10 })
    assert.equal(completed.response.status, 200, JSON.stringify(completed.result))
    assert.equal(completed.result.reconciliation.complete, true)
    assert.equal(completed.result.reconciliation.scanned, 1)
    assert.equal(completed.result.reconciliation.evidence, 1)
    assert.equal(completed.result.reconciliation.skipped, 0)
    assert.equal(completed.result.reconciliation.failed, 0)
    assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: f.tenantId }), 3)
    const stale = await decide(presented.recommendation_id)
    assert.equal(stale.response.status, 409); assert.equal(stale.result.error.code, 'RECOMMENDATION_STALE')
    assert.equal(stale.result.error.replacement?.status, 'presented')
    const stalePresented = await db.collection('learning_recommendations').findOne({ recommendation_id: presented.recommendation_id })
    assert.equal(stalePresented.status, 'superseded'); assert.equal(stalePresented.decision, undefined)
    const old = await db.collection('learning_recommendations').findOne({ recommendation_id: first.recommendation_id })
    assert.equal(old.status, 'superseded'); assert.equal(old.decision.action, 'approved')
    const replacement = await evaluate()
    assert.equal(replacement.response.status, 200)
    assert.notEqual(replacement.result.recommendation.recommendation_id, first.recommendation_id)
    assert.equal(replacement.result.recommendation.candidate_task.task_id, f.tasks[2].task_id)
    const dismissed = await Promise.all(Array.from({ length: 4 }, () => decide(replacement.result.recommendation.recommendation_id, 'dismiss', mutation())))
    assert.equal(dismissed.every((item) => item.response.status === 200 && item.result.recommendation.status === 'dismissed'), true)
    assert.equal((await evaluate()).result.outcome, 'HISTORICAL_RECOMMENDATION')
  }))
  test('legacy HTTP completion precedes V2 convergence under a held tenant fence; reconciliation is canonical', async (t) => {
    for (let iteration = 1; iteration <= 3; iteration++) await scenario(t, async ({ f, post }) => {
      const assignmentId = `p5-delayed-${f.suffix}`; const assignmentCode = `P5${f.suffix.slice(0, 7).toUpperCase()}`
      await db.collection('assignments').insertOne({ id: assignmentId, code: assignmentCode, worksheet_id: f.worksheetId, teacher_id: f.teacherId,
        class_id: f.classId, status: 'active', max_attempts: 1, created_at: new Date() })
      const bound = await post(`/api/v2/learning/assignments/${assignmentId}/binding`, { schema_version: 'learning-v2-phase2-v1',
        task_pins: [{ task_id: f.tasks[1].task_id, task_version: 1, question_id: f.questions[1].question_id }] })
      assert.equal(bound.response.status, 200, JSON.stringify(bound.result))
      const assessment = await post(`/api/v2/learning/teacher/students/${f.studentId}/assessments`, {
        schema_version: 'learning-v2-phase4-v1', competency_id: f.competencyId, objective_id: f.objectiveId, objective_version: 1,
        claim: 'no_demonstration', basis: 'single_observation', observed_at: new Date().toISOString(), reason: 'direct_observation', idempotency_key: mutation().idempotency_key,
      })
      assert.equal(assessment.response.status, 200)
      const studentAuth = `Bearer ${jwt.sign({ studentId: f.studentId, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' })}`
      const deliveryResponse = await fetch(`${baseUrl}/api/student/assignment/${assignmentCode}`, { headers: { Authorization: studentAuth } })
      assert.equal(deliveryResponse.status, 200)
      const delivery = await deliveryResponse.json(); assert.ok(delivery.learningV2SubmissionIntent)
      const session = client.startSession()
      let submitted
      try {
        session.startTransaction()
        // Hold only this disposable fixture's existing commit fence. No sleeps,
        // global Mongo failpoints, server configuration changes or weakened checks.
        await db.collection('learning_v2_tenants').updateOne({ tenant_id: f.tenantId }, { $inc: { write_fence: 1 } }, { session })
        submitted = await post('/api/student/submit', { assignmentCode, studentName: 'Synthetic delayed learner', answers: f.questions.map((item) => item.answer),
          duration: 1, learningV2SubmissionIntent: delivery.learningV2SubmissionIntent }, studentAuth)
        assert.equal(submitted.response.status, 201, JSON.stringify(submitted.result))
        const durable = await db.collection('submissions').findOne({ id: submitted.result.submissionId })
        assert.equal(durable.learning_v2_tenant_id, f.tenantId); assert.ok(durable.learning_v2_submission_intent_id)
        assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: f.tenantId }), 2)
        assert.equal(await db.collection('learning_attempts').countDocuments({ tenant_id: f.tenantId, 'source.submission_id': durable.id }), 0)
        t.diagnostic(JSON.stringify({ iteration, tenant: f.tenantId, student: f.studentId, assignment: assignmentId, submission: durable.id,
          intent: durable.learning_v2_submission_intent_id, slot: durable.learning_v2_attempt_no, pins_hash: durable.learning_v2_pins_hash,
          binding: bound.result.binding, http_status: 201, evidence_before_release: 2, adapter_outstanding: true }))
      } finally {
        if (session.inTransaction()) await session.abortTransaction()
        await session.endSession()
      }
      const repair = { schema_version: 'learning-v2-phase2-v1', assignment_id: assignmentId, submission_id: submitted.result.submissionId, limit: 10 }
      assert.equal((await post('/api/v2/learning/reconciliation', repair, studentAuth)).response.status, 403)
      let canonical
      for (let replay = 0; replay < 2; replay++) {
        const completed = await post('/api/v2/learning/reconciliation', repair)
        assert.equal(completed.response.status, 200, JSON.stringify(completed.result))
        const result = completed.result.reconciliation
        assert.equal(result.complete, true); assert.equal(result.scanned, 1); assert.equal(result.processed, 1)
        assert.equal(result.attempts, 1); assert.equal(result.evidence, 1); assert.equal(result.failed, 0); assert.equal(result.skipped, 0)
        assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: f.tenantId }), 3)
        const attempts = await db.collection('learning_attempts').find({ tenant_id: f.tenantId, 'source.submission_id': submitted.result.submissionId }).toArray()
        assert.equal(attempts.length, 1)
        const evidence = await db.collection('evidence_events').find({ tenant_id: f.tenantId, 'source.source_id': attempts[0].attempt_id }).toArray()
        assert.equal(evidence.length, 1)
        const events = await db.collection('learning_events').find({ tenant_id: f.tenantId, type: 'ATTEMPT_RECORDED', 'payload.attempt_id': attempts[0].attempt_id }).toArray()
        assert.equal(events.length, 1)
        const identities = { attempts, evidence, events }
        if (canonical) assert.deepEqual(identities, canonical)
        else canonical = identities
      }
      t.diagnostic(JSON.stringify({ iteration, canonical }))
    })
  })
  test('live authorization: guest, student, same-tenant unrelated, co-teacher, foreign, removed, guessed and injected authority', async (t) => scenario(t, async ({ f, url, post, evaluate, decide }) => {
    const id = (await evaluate()).result.recommendation.recommendation_id
    assert.equal((await post(url, mutation(), null)).response.status, 401)
    const studentAuth = `Bearer ${jwt.sign({ studentId: f.studentId, username: 'synthetic', role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' })}`
    assert.equal((await post(url, mutation(), studentAuth)).response.status, 403)
    const coId = `p5-co-${f.suffix}`
    await db.collection('users').insertOne({ id: coId, tenant_id: f.tenantId })
    await db.collection('learning_v2_tenant_memberships').insertOne({ actor_type: 'teacher', actor_id: coId, tenant_id: f.tenantId, role: 'teacher', status: 'active' })
    const coAuth = `Bearer ${jwt.sign({ userId: coId }, process.env.JWT_SECRET, { expiresIn: '1h' })}`
    assert.equal((await post(url, mutation(), coAuth)).response.status, 404)
    const unrelatedId = `p5-unrelated-${f.suffix}`
    await db.collection('students').insertOne({ id: unrelatedId, tenant_id: f.tenantId, display_name: 'Unrelated synthetic learner' })
    await db.collection('learning_v2_tenant_memberships').insertOne({ actor_type: 'student', actor_id: unrelatedId, tenant_id: f.tenantId, role: 'student', status: 'active' })
    assert.equal((await post(url.replace(f.studentId, unrelatedId))).response.status, 404)
    const foreignId = `p5-foreign-${f.suffix}`; const foreignTenant = generateDomainId('ten')
    await db.collection('users').insertOne({ id: foreignId, tenant_id: foreignTenant })
    await db.collection('learning_v2_tenants').insertOne({ tenant_id: foreignTenant, type: 'personal', owner_teacher_id: foreignId, status: 'active' })
    await db.collection('learning_v2_tenant_memberships').insertOne({ actor_type: 'teacher', actor_id: foreignId, tenant_id: foreignTenant, role: 'teacher', status: 'active' })
    t.after(async () => { for (const name of ['users', 'learning_v2_tenants', 'learning_v2_tenant_memberships']) await db.collection(name).deleteMany({ tenant_id: foreignTenant }) })
    const foreignAuth = `Bearer ${jwt.sign({ userId: foreignId }, process.env.JWT_SECRET, { expiresIn: '1h' })}`
    assert.equal((await post(url, mutation(), foreignAuth)).response.status, 404)
    assert.equal((await post(`/api/v2/learning/teacher/recommendations/${id}/approve`, mutation(), foreignAuth)).response.status, 404)
    for (const key of ['tenant_id', 'student_id', 'teacher_id', 'status', 'type', 'task', 'mastery', 'confidence', 'rule', 'expiry']) assert.equal((await evaluate({ ...mutation(), [key]: 'injected' })).response.status, 400)
    assert.equal((await decide(generateDomainId('rec'))).response.status, 404)
    assert.equal((await post(url.replace(f.studentId, 'unrelated-student'))).response.status, 404)
    await db.collection('classes').updateOne({ id: f.classId }, { $set: { enrolled_students: [] } })
    assert.equal((await decide(id)).response.status, 404)
    assert.equal((await evaluate()).response.status, 404)
    await db.collection('classes').updateOne({ id: f.classId }, { $set: { enrolled_students: [{ student_id: f.studentId }] } })
    await db.collection('learning_v2_tenant_memberships').updateOne({ actor_id: f.studentId }, { $set: { tenant_id: generateDomainId('ten') } })
    assert.equal((await decide(id)).response.status, 404)
  }))
  const changes = {
    'unpublished task': async (f) => db.collection('learning_tasks').updateOne({ task_id: f.tasks[1].task_id }, { $set: { status: 'draft' } }),
    'changed source hash': async (f) => db.collection('worksheets').updateOne({ id: f.worksheetId }, { $set: { 'content.questions.1.question': 'Changed' } }),
    'ambiguous task versions': async (f) => db.collection('learning_tasks').insertOne({ ...structuredClone(f.tasks[1]), version: 2 }),
    'ambiguous objective versions': async (f) => { const original = await db.collection('learning_objectives').findOne({ objective_id: f.objectiveId }); await db.collection('learning_objectives').insertOne({ ...original, _id: undefined, version: 2 }) },
  }
  for (const [name, change] of Object.entries(changes)) test(`live stale validation: ${name}`, async (t) => scenario(t, async ({ f, evaluate, decide }) => {
    const first = (await evaluate()).result.recommendation
    await change(f)
    const result = await decide(first.recommendation_id)
    assert.equal(result.response.status, 409); assert.equal(result.result.error.code, 'RECOMMENDATION_STALE')
    assert.equal((await db.collection('learning_recommendations').findOne({ recommendation_id: first.recommendation_id })).decision, undefined)
  }))
  test('live no candidate is neutral, database write failure is 503 and does not disrupt Phase 4', async (t) => scenario(t, async ({ f, evaluate, post }) => {
    await db.collection('learning_tasks').updateMany({ tenant_id: f.tenantId }, { $set: { status: 'retired' } })
    const neutral = await evaluate()
    assert.equal(neutral.response.status, 200); assert.equal(neutral.result.outcome, 'NO_RECOMMENDATION')
    assert.equal(await db.collection('learning_recommendations').countDocuments({ tenant_id: f.tenantId }), 0)
    await db.collection('learning_tasks').updateMany({ tenant_id: f.tenantId }, { $set: { status: 'published' } })
    const collectionInfo = await db.listCollections({ name: 'learning_recommendations' }, { nameOnly: false }).next()
    const previousValidation = {
      validator: collectionInfo?.options?.validator || {},
      validationLevel: collectionInfo?.options?.validationLevel || 'strict',
      validationAction: collectionInfo?.options?.validationAction || 'error',
    }
    await db.command({ collMod: 'learning_recommendations', validator: { tenant_id: { $ne: f.tenantId } }, validationLevel: 'strict', validationAction: 'error' })
    try {
      const unavailable = await evaluate()
      assert.equal(unavailable.response.status, 503); assert.equal(unavailable.result.error.code, 'SERVICE_UNAVAILABLE')
      assert.equal(JSON.stringify(unavailable.result).includes('Mongo'), false)
      const assessment = await post(`/api/v2/learning/teacher/students/${f.studentId}/assessments`, { schema_version: 'learning-v2-phase4-v1', competency_id: f.competencyId, objective_id: f.objectiveId, objective_version: 1, claim: 'no_demonstration', basis: 'single_observation', observed_at: new Date().toISOString(), reason: 'direct_observation', idempotency_key: mutation().idempotency_key })
      assert.equal(assessment.response.status, 200)
    } finally {
      await db.command({ collMod: 'learning_recommendations', ...previousValidation })
      const restored = await db.listCollections({ name: 'learning_recommendations' }, { nameOnly: false }).next()
      assert.deepEqual({
        validator: restored?.options?.validator || {},
        validationLevel: restored?.options?.validationLevel || 'strict',
        validationAction: restored?.options?.validationAction || 'error',
      }, previousValidation)
    }
  }))
}
