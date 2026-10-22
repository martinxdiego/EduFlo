import assert from 'node:assert/strict'
import test from 'node:test'
import bcrypt from 'bcryptjs'
import { MongoClient } from 'mongodb'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'
import { worksheetQuestionContentHash, WORKSHEET_QUESTION_HASH_VERSION } from '../lib/server/worksheet-question-identity.js'

const enabled = process.env.RUN_INTEGRATION_TESTS === '1'

function sessionCookie(response) {
  const value = response.headers.get('set-cookie') || ''
  assert.match(value, /eduflow_session=/)
  assert.match(value, /HttpOnly/i)
  return value.split(';', 1)[0]
}

if (!enabled) {
  test('Learning V2 Phase-2 API integration requires RUN_INTEGRATION_TESTS=1', { skip: true }, () => {})
} else {
  test('Learning V2 Phase-2 live API vertical slice is canonical under concurrent retry', async () => {
    const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000'
    const mongoUrl = process.env.MONGO_URL
    const databaseName = process.env.DB_NAME
    assert.ok(mongoUrl && databaseName && process.env.JWT_SECRET, 'MongoDB and JWT test configuration are required')
    assert.match(
      databaseName,
      /^eduflow_learning_v2_test_[a-z0-9_-]+$/,
      'DB_NAME must name an explicitly disposable Learning V2 test database',
    )

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const teacherId = `phase2-api-teacher-${suffix}`
    const studentId = `phase2-api-student-${suffix}`
    const teacherEmail = `${teacherId}@example.test`
    const username = `p2-${Math.random().toString(36).slice(2, 12)}`
    const password = 'Phase2-test-password-42'
    const tenantId = generateDomainId('ten')
    const worksheetId = `phase2-api-worksheet-${suffix}`
    const assignmentId = `phase2-api-assignment-${suffix}`
    const assignmentCode = `P2${Math.random().toString(36).slice(2, 9).toUpperCase()}`
    const questionId = generateDomainId('wqi')
    const taskId = generateDomainId('tsk')
    const objectiveId = generateDomainId('obj')
    const competencyId = generateDomainId('cmp')
    const frameworkId = generateDomainId('frm')
    const question = {
      question_id: questionId,
      number: 1,
      type: 'multiple_choice',
      question: 'Welche Antwort ist exakt vier?',
      options: ['3', '4', '5'],
      answer: '4',
      points: 1,
    }
    const contentHash = worksheetQuestionContentHash(question)
    const client = new MongoClient(mongoUrl)
    await client.connect()
    const db = client.db(databaseName)

    try {
      await db.collection('rate_limits').deleteMany({})
      const passwordHash = await bcrypt.hash(password, 4)
      await Promise.all([
        db.collection('users').insertOne({
          id: teacherId, email: teacherEmail, name: 'Synthetic Phase-2 Teacher', password_hash: passwordHash,
          subscription_tier: 'free', worksheets_used_this_month: 0, month_reset_date: new Date(), created_at: new Date(),
        }),
        db.collection('students').insertOne({
          id: studentId, username, display_name: 'Synthetic Phase-2 Student', password_hash: passwordHash,
          total_quizzes: 0, total_points: 0, xp: 0, created_at: new Date(),
        }),
        db.collection('learning_v2_tenants').insertOne({
          tenant_id: tenantId, type: 'personal', owner_teacher_id: teacherId, status: 'active', created_at: new Date(),
        }),
        db.collection('worksheets').insertOne({
          id: worksheetId, user_id: teacherId, title: 'Synthetic Phase-2 worksheet', revision: 1,
          content: { questions: [question] }, created_at: new Date(),
        }),
        db.collection('assignments').insertOne({
          id: assignmentId, code: assignmentCode, worksheet_id: worksheetId,
          worksheet_title: 'Synthetic Phase-2 worksheet', teacher_id: teacherId,
          status: 'active', max_attempts: 1, created_at: new Date(),
        }),
        db.collection('learning_tasks').insertOne({
          tenant_id: tenantId, task_id: taskId, version: 1, status: 'published',
          task_type: 'selected_response', response_modality: 'choice',
          source: {
            kind: 'worksheet_question', worksheet_id: worksheetId, question_id: questionId,
            content_hash: contentHash, hash_version: WORKSHEET_QUESTION_HASH_VERSION,
          },
          objective_refs: [{ objective_id: objectiveId, version: 1 }],
          competency_targets: [{
            competency_id: competencyId, framework_id: frameworkId, framework_version: 'synthetic-v1', role: 'primary',
          }],
          created_at: new Date(), published_at: new Date(),
        }),
      ])
      await db.collection('learning_v2_tenant_memberships').insertMany([
        {
          actor_type: 'teacher', actor_id: teacherId, tenant_id: tenantId,
          role: 'teacher', status: 'active', created_at: new Date(),
        },
        {
          actor_type: 'student', actor_id: studentId, tenant_id: tenantId,
          role: 'student', status: 'active', created_at: new Date(),
        },
      ])

      const teacherLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ email: teacherEmail, password }),
      })
      assert.equal(teacherLogin.status, 200)
      const teacherCookie = sessionCookie(teacherLogin)

      const bindingResponse = await fetch(`${baseUrl}/api/v2/learning/assignments/${assignmentId}/binding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: teacherCookie, Origin: baseUrl },
        body: JSON.stringify({
          schema_version: 'learning-v2-phase2-v1',
          task_pins: [{ question_id: questionId, task_id: taskId, task_version: 1 }],
        }),
      })
      assert.equal(bindingResponse.status, 200)
      const binding = (await bindingResponse.json()).binding
      assert.equal(binding.task_pins[0].question_id, questionId)
      assert.equal(binding.task_pins[0].task_id, taskId)
      assert.equal(binding.task_pins[0].task_version, 1)
      assert.equal(binding.task_pins[0].content_hash, contentHash)
      assert.equal(binding.task_pins[0].hash_version, WORKSHEET_QUESTION_HASH_VERSION)

      const studentLogin = await fetch(`${baseUrl}/api/student/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ username, password }),
      })
      assert.equal(studentLogin.status, 200)
      const studentCookie = sessionCookie(studentLogin)

      const readAssignment = () => fetch(`${baseUrl}/api/student/assignment/${assignmentCode}`, {
        headers: { Cookie: studentCookie },
      })
      const [firstRead, refreshedRead] = await Promise.all([readAssignment(), readAssignment()])
      assert.equal(firstRead.status, 200)
      assert.equal(refreshedRead.status, 200)
      const firstDelivery = await firstRead.json()
      const refreshedDelivery = await refreshedRead.json()
      assert.ok(firstDelivery.learningV2SubmissionIntent)
      assert.ok(refreshedDelivery.learningV2SubmissionIntent)
      assert.notEqual(firstDelivery.learningV2SubmissionIntent, refreshedDelivery.learningV2SubmissionIntent)
      assert.equal(firstDelivery.content.questions[0].answer, undefined)

      const submit = (learningV2SubmissionIntent) => fetch(`${baseUrl}/api/student/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: studentCookie, Origin: baseUrl },
        body: JSON.stringify({
          assignmentCode,
          studentName: 'Synthetic Phase-2 Student',
          answers: ['4'],
          duration: 12,
          learningV2SubmissionIntent,
        }),
      })
      const [firstSubmit, refreshedIntentSubmit] = await Promise.all([
        submit(firstDelivery.learningV2SubmissionIntent),
        submit(refreshedDelivery.learningV2SubmissionIntent),
      ])
      assert.equal(firstSubmit.status, 201)
      assert.equal(refreshedIntentSubmit.status, 201)
      const firstResult = await firstSubmit.json()
      const refreshedResult = await refreshedIntentSubmit.json()
      assert.equal(firstResult.submissionId, refreshedResult.submissionId)
      assert.equal(firstResult.earnedPoints, 1)

      const replay = await submit(firstDelivery.learningV2SubmissionIntent)
      assert.equal(replay.status, 201)
      assert.equal((await replay.json()).submissionId, firstResult.submissionId)

      const [submission, attempt, evidence, state, student] = await Promise.all([
        db.collection('submissions').find({ assignment_id: assignmentId, student_id: studentId }).toArray(),
        db.collection('learning_attempts').find({ tenant_id: tenantId, student_id: studentId }).toArray(),
        db.collection('evidence_events').find({ tenant_id: tenantId, student_id: studentId }).toArray(),
        db.collection('student_knowledge_states').find({ tenant_id: tenantId, student_id: studentId }).toArray(),
        db.collection('students').findOne({ id: studentId }),
      ])
      assert.equal(submission.length, 1)
      assert.equal(attempt.length, 1)
      assert.equal(evidence.length, 1)
      assert.equal(state.length, 1)
      assert.equal(submission[0].id, firstResult.submissionId)
      assert.equal(evidence[0].type, 'correct_answer')
      assert.equal(evidence[0].source.source_id, attempt[0].attempt_id)
      assert.equal(state[0].mastery, 0.636364)
      assert.equal(state[0].confidence, 0.255)
      assert.equal(state[0].limitations.includes('selected_response_only'), true)
      assert.equal(student.total_quizzes, 1)

      const explanationResponse = await fetch(
        `${baseUrl}/api/v2/learning/knowledge-state/${studentId}/${competencyId}/explanation`,
        { headers: { Cookie: studentCookie } },
      )
      assert.equal(explanationResponse.status, 200)
      const explanation = (await explanationResponse.json()).explanation
      assert.equal(explanation.computed.mastery, 0.636364)
      assert.equal(explanation.computed.confidence, 0.255)
      assert.equal(explanation.contributing_evidence.length, 1)
      assert.equal(explanation.contributing_evidence[0].evidence_id, evidence[0].evidence_id)
      assert.equal(explanation.limitations.includes('selected_response_only'), true)
      assert.equal(explanation.confidence_meaning, 'certainty_about_the_estimate_not_performance')
    } finally {
      await Promise.all([
        db.collection('users').deleteMany({ id: teacherId }),
        db.collection('students').deleteMany({ id: studentId }),
        db.collection('learning_v2_tenants').deleteMany({ tenant_id: tenantId }),
        db.collection('learning_v2_tenant_memberships').deleteMany({ tenant_id: tenantId }),
        db.collection('worksheets').deleteMany({ id: worksheetId }),
        db.collection('assignments').deleteMany({ id: assignmentId }),
        db.collection('learning_tasks').deleteMany({ tenant_id: tenantId }),
        db.collection('submissions').deleteMany({ assignment_id: assignmentId }),
        db.collection('learning_attempts').deleteMany({ tenant_id: tenantId }),
        db.collection('evidence_events').deleteMany({ tenant_id: tenantId }),
        db.collection('student_knowledge_states').deleteMany({ tenant_id: tenantId }),
        db.collection('learning_events').deleteMany({ tenant_id: tenantId }),
      ])
      await client.close()
    }
  })
}
