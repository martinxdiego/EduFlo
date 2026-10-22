import assert from 'node:assert/strict'
import test from 'node:test'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { MongoClient } from 'mongodb'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'
import { worksheetQuestionContentHash } from '../lib/server/worksheet-question-identity.js'

const enabled = process.env.RUN_INTEGRATION_TESTS === '1'

function sessionCookie(response) {
  const value = response.headers.get('set-cookie') || ''
  const match = value.match(/(?:^|,\s*)eduflow_session=([^;,]+)/)
  assert.ok(match)
  return `eduflow_session=${match[1]}`
}

if (!enabled) {
  test('Learning V2 Phase-3 API integration requires RUN_INTEGRATION_TESTS=1', { skip: true }, () => {})
} else {
  test('Phase 3 live HTTP flow enforces auth, canonical retries and assisted Evidence', async () => {
    const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000'
    const client = new MongoClient(process.env.MONGO_URL)
    const dbName = process.env.DB_NAME
    assert.match(dbName || '', /^eduflow_learning_v2_test_[a-z0-9_-]+$/)
    await client.connect()
    const db = client.db(dbName)
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const teacherId = `phase3-http-teacher-${suffix}`
    const studentId = `phase3-http-student-${suffix}`
    const otherStudentId = `phase3-http-other-student-${suffix}`
    const assignmentId = `phase3-http-assignment-${suffix}`
    const worksheetId = `phase3-http-worksheet-${suffix}`
    const submissionId = `phase3-http-submission-${suffix}`
    const teacherEmail = `${teacherId}@example.test`
    const username = `p3-${Math.random().toString(36).slice(2, 12)}`
    const otherUsername = `p3o-${Math.random().toString(36).slice(2, 11)}`
    const password = 'Phase3-test-password-42'
    const tenantId = generateDomainId('ten')
    const taskId = generateDomainId('tsk')
    const objectiveId = generateDomainId('obj')
    const competencyId = generateDomainId('cmp')
    const frameworkId = generateDomainId('frm')
    const questionId = generateDomainId('wqi')
    const attemptId = generateDomainId('att')
    const now = new Date()
    const question = { question_id: questionId, number: 1, type: 'multiple_choice', question: 'Was ist die Hauptstadt Frankreichs?', options: ['Bern', 'Paris', 'Rom'], answer: 'Paris', points: 1 }
    const hash = worksheetQuestionContentHash(question)
    const pin = { question_id: questionId, worksheet_id: worksheetId, task_id: taskId, task_version: 1, content_hash: hash, hash_version: 'worksheet-question-sha256-v1' }
    try {
      const passwordHash = await bcrypt.hash(password, 4)
      await Promise.all([
        db.collection('classes').insertOne({ id: `${assignmentId}-class`, teacher_id: teacherId, enrolled_students: [{ student_id: studentId }] }),
        db.collection('users').insertOne({ id: teacherId, email: teacherEmail, name: 'Phase 3 Teacher', password_hash: passwordHash, subscription_tier: 'free', worksheets_used_this_month: 0, month_reset_date: now, created_at: now }),
        db.collection('students').insertOne({ id: studentId, username, display_name: 'Phase 3 Student', password_hash: passwordHash, created_at: now }),
        db.collection('students').insertOne({ id: otherStudentId, username: otherUsername, display_name: 'Phase 3 Other Student', password_hash: passwordHash, created_at: now }),
        db.collection('learning_v2_tenants').insertOne({ tenant_id: tenantId, type: 'personal', owner_teacher_id: teacherId, status: 'active', created_at: now }),
        db.collection('worksheets').insertOne({ id: worksheetId, user_id: teacherId, revision: 1, content: { questions: [question] }, created_at: now }),
        db.collection('assignments').insertOne({
          id: assignmentId, class_id: `${assignmentId}-class`, teacher_id: teacherId, worksheet_id: worksheetId, status: 'active', activity_type: 'exercise', show_solutions: true,
          learning_v2: { enabled: true, schema_version: 'learning-v2-phase2-v1', tenant_id: tenantId, task_pins: [pin], bound_by: teacherId, bound_at: now },
        }),
        db.collection('learning_tasks').insertOne({
          tenant_id: tenantId, task_id: taskId, version: 1, status: 'published', task_type: 'selected_response', response_modality: 'choice',
          source: { worksheet_id: worksheetId, question_id: questionId, content_hash: hash, hash_version: 'worksheet-question-sha256-v1' },
          objective_refs: [{ objective_id: objectiveId, version: 1 }],
          competency_targets: [{ competency_id: competencyId, framework_id: frameworkId, framework_version: 'phase3-v1', role: 'primary' }],
        }),
        db.collection('learning_attempts').insertOne({
          attempt_id: attemptId, schema_version: 'learning-attempt-v1', tenant_id: tenantId, student_id: studentId,
          task_ref: { task_id: taskId, version: 1 }, objective_ref: { objective_id: objectiveId, version: 1 },
          primary_competency_ref: { competency_id: competencyId, framework_id: frameworkId, framework_version: 'phase3-v1' }, supporting_competency_refs: [],
          source: {
            kind: 'legacy_submission_question', submission_id: submissionId, submission_intent_id: 'phase3-http-intent', assignment_id: assignmentId,
            worksheet_id: worksheetId, question_id: questionId, question_index: 0, source_revision: 1, content_hash: hash,
            hash_version: 'worksheet-question-sha256-v1', grading_revision: 1, learning_v2_attempt_no: 1,
          },
          answer: { type: 'selected_response', value: 'Bern', format_version: 1 },
          outcome: { correctness: 'incorrect', score: 0, points_awarded: 0, max_points: 1, grader: 'deterministic', grader_version: 'legacy-deterministic-exact-v1' },
          independence: { level: 'independent', assistance_source: 'none' }, attempt_no: 1, submitted_at: now, server_received_at: now,
          status: 'active', idempotency_key: `phase3-http-trigger-${suffix}`, created_at: now,
        }),
      ])
      await db.collection('learning_v2_tenant_memberships').insertMany([
        { actor_type: 'teacher', actor_id: teacherId, tenant_id: tenantId, role: 'teacher', status: 'active', created_at: now },
        { actor_type: 'student', actor_id: studentId, tenant_id: tenantId, role: 'student', status: 'active', created_at: now },
        { actor_type: 'student', actor_id: otherStudentId, tenant_id: tenantId, role: 'student', status: 'active', created_at: now },
      ])

      const unauthenticated = await fetch(`${baseUrl}/api/v2/learning/tutor/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      assert.equal(unauthenticated.status, 401)
      const teacherLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify({ email: teacherEmail, password }) })
      assert.equal(teacherLogin.status, 200)
      const teacherCookie = sessionCookie(teacherLogin)
      const studentLogin = await fetch(`${baseUrl}/api/student/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify({ username, password }) })
      assert.equal(studentLogin.status, 200)
      const studentCookie = sessionCookie(studentLogin)
      assert.ok(studentCookie)
      const otherStudentLogin = await fetch(`${baseUrl}/api/student/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify({ username: otherUsername, password }) })
      assert.equal(otherStudentLogin.status, 200)
      const teacherAuthorization = `Bearer ${jwt.sign({ userId: teacherId, email: teacherEmail }, process.env.JWT_SECRET, { expiresIn: '1h' })}`
      const studentAuthorization = `Bearer ${jwt.sign({ studentId, username, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' })}`
      const otherStudentAuthorization = `Bearer ${jwt.sign({ studentId: otherStudentId, username: otherUsername, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' })}`

      const policyBody = { schema_version: 'learning-v2-phase3-v1', preset: 'GUIDED_TUTOR' }
      const forbiddenPolicy = await fetch(`${baseUrl}/api/v2/learning/assignments/${assignmentId}/tutor-policy`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: studentAuthorization, Origin: baseUrl }, body: JSON.stringify(policyBody) })
      assert.equal(forbiddenPolicy.status, 403)
      const configured = await fetch(`${baseUrl}/api/v2/learning/assignments/${assignmentId}/tutor-policy`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: teacherAuthorization, Origin: baseUrl }, body: JSON.stringify(policyBody) })
      assert.equal(configured.status, 200)

      const start = () => fetch(`${baseUrl}/api/v2/learning/tutor/sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: studentAuthorization, Origin: baseUrl },
        body: JSON.stringify({ schema_version: 'learning-v2-phase3-v1', submission_id: submissionId, question_index: 0 }),
      })
      const [startedA, startedB] = await Promise.all([start(), start()])
      assert.equal(startedA.status, 200); assert.equal(startedB.status, 200)
      const sessionA = (await startedA.json()).session; const sessionB = (await startedB.json()).session
      assert.equal(sessionA.session_id, sessionB.session_id)
      assert.equal(sessionA.dto_version, 'student-tutor-session-v1')
      for (const forbidden of ['tenant_id', 'student_id', 'assignment_id', 'policy_ref', 'model_config', 'hint_receipts', 'state_version', 'last_sequence']) {
        assert.equal(Object.hasOwn(sessionA, forbidden), false)
      }
      const foreignStudentRead = await fetch(`${baseUrl}/api/v2/learning/tutor/sessions/${sessionA.session_id}`, {
        headers: { Authorization: otherStudentAuthorization, Origin: baseUrl },
      })
      assert.equal(foreignStudentRead.status, 404)

      const hint = (key) => fetch(`${baseUrl}/api/v2/learning/tutor/sessions/${sessionA.session_id}/hints`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: studentAuthorization, Origin: baseUrl },
        body: JSON.stringify({ schema_version: 'learning-v2-phase3-v1', idempotency_key: key }),
      })
      const foreignHint = await fetch(`${baseUrl}/api/v2/learning/tutor/sessions/${sessionA.session_id}/hints`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: otherStudentAuthorization, Origin: baseUrl },
        body: JSON.stringify({ schema_version: 'learning-v2-phase3-v1', idempotency_key: 'phase3-foreign-hint' }),
      })
      assert.equal(foreignHint.status, 404)
      assert.deepEqual((await db.collection('tutor_sessions').findOne({ session_id: sessionA.session_id })).provider_slots, {})
      const [hintA, hintB] = await Promise.all([hint('phase3-same-hint'), hint('phase3-same-hint')])
      assert.equal(hintA.status, 200); assert.equal(hintB.status, 200)
      assert.equal((await hintA.json()).hint.hint_level, 1)
      const firstStored = await db.collection('tutor_sessions').findOne({ session_id: sessionA.session_id })
      assert.equal(firstStored.provider_slots.level_1.status, 'completed')
      assert.equal(firstStored.provider_slots.level_1.reservation_count, 1)
      assert.equal(firstStored.provider_slots.level_1.transport_count, 0)
      assert.equal(firstStored.provider_slots.level_1.error_code, 'PROVIDER_RUNTIME_GATE_OFF')
      assert.equal(await db.collection('rate_limits').countDocuments({ tenant_id: tenantId, bucket: /^tutor-provider-/ }), 0)

      const retry = (key, selectedResponse) => fetch(`${baseUrl}/api/v2/learning/tutor/sessions/${sessionA.session_id}/retries`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: studentAuthorization, Origin: baseUrl },
        body: JSON.stringify({ schema_version: 'learning-v2-phase3-v1', idempotency_key: key, selected_response: selectedResponse }),
      })
      const [wrongA, wrongB] = await Promise.all([retry('phase3-same-retry', 'Bern'), retry('phase3-same-retry', 'Bern')])
      assert.equal(wrongA.status, 200); assert.equal(wrongB.status, 200)
      assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: tenantId }), 0)
      const secondHint = await hint('phase3-second-hint')
      assert.equal(secondHint.status, 200)
      assert.equal((await secondHint.json()).hint.hint_level, 2)
      const correct = await retry('phase3-correct-retry', 'Paris')
      assert.equal(correct.status, 200)
      assert.equal((await correct.json()).session.status, 'completed')

      const evidence = await db.collection('evidence_events').find({ tenant_id: tenantId }).toArray()
      assert.equal(evidence.length, 1)
      assert.equal(evidence[0].type, 'correct_after_hint')
      assert.equal(evidence[0].tutor_weight, 0.45)
      assert.equal(await db.collection('learning_attempts').countDocuments({ tenant_id: tenantId }), 3)
      assert.equal(await db.collection('tutor_sessions').countDocuments({ tenant_id: tenantId }), 1)
      const sequences = (await db.collection('learning_events').find({ tenant_id: tenantId, 'aggregate.type': 'tutor_session' }).sort({ sequence: 1 }).toArray()).map((item) => item.sequence)
      assert.deepEqual(sequences, [...sequences].sort((a, b) => a - b))
      assert.equal(new Set(sequences).size, sequences.length)
    } finally {
      await db.collection('classes').deleteOne({ id: `${assignmentId}-class`, teacher_id: teacherId })
      for (const name of ['users', 'students', 'learning_v2_tenants', 'learning_v2_tenant_memberships', 'worksheets', 'assignments', 'learning_tasks', 'learning_attempts', 'evidence_events', 'student_knowledge_states', 'learning_events', 'tutor_policies', 'tutor_sessions', 'rate_limits', 'ai_generations']) {
        await db.collection(name).deleteMany({ $or: [{ tenant_id: tenantId }, { id: { $in: [teacherId, studentId, otherStudentId] } }, { assignment_id: assignmentId }, { user_id: { $in: [studentId, otherStudentId] } }] })
      }
      await client.close()
    }
  })
}
