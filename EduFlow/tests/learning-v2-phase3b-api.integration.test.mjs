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
  test('Learning V2 Phase-3b API integration requires RUN_INTEGRATION_TESTS=1', { skip: true }, () => {})
} else {
  test('Phase 3b live HTTP Reflection flow enforces ownership, pins, local semantics and teacher detail', async () => {
    const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000'
    const dbName = process.env.DB_NAME
    assert.match(dbName || '', /^eduflow_learning_v2_test_[a-z0-9_-]+$/)
    assert.ok(process.env.MONGO_URL)
    assert.ok(process.env.JWT_SECRET)
    const client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    const db = client.db(dbName)
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const teacherId = `phase3b-http-teacher-${suffix}`
    const studentId = `phase3b-http-student-${suffix}`
    const otherStudentId = `phase3b-http-other-${suffix}`
    const foreignStudentId = `phase3b-http-foreign-${suffix}`
    const teacherEmail = `${teacherId}@example.test`
    const username = `p3b-${Math.random().toString(36).slice(2, 12)}`
    const password = 'Phase3b-test-password-42'
    const tenantId = generateDomainId('ten')
    const foreignTenantId = generateDomainId('ten')
    const frameworkId = generateDomainId('frm')
    const competencyId = generateDomainId('cmp')
    const objectiveId = generateDomainId('obj')
    const now = new Date()
    const createdIds = []

    const authorization = (payload) => `Bearer ${jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' })}`
    const otherStudentAuthorization = authorization({ studentId: otherStudentId, username: `other-${suffix}`, role: 'student' })
    const foreignStudentAuthorization = authorization({ studentId: foreignStudentId, username: `foreign-${suffix}`, role: 'student' })
    const jsonHeaders = (credential) => ({
      'Content-Type': 'application/json',
      Origin: baseUrl,
      ...(credential.startsWith('Bearer ') ? { Authorization: credential } : { Cookie: credential }),
    })
    const authHeaders = (credential) => (credential.startsWith('Bearer ') ? { Authorization: credential } : { Cookie: credential })

    const seedScenario = async ({ label, activityType = 'exercise', tutorPreset = 'LOCAL_HINTS', showSolutions = true }) => {
      const assignmentId = `phase3b-http-assignment-${label}-${suffix}`
      const worksheetId = `phase3b-http-worksheet-${label}-${suffix}`
      const submissionId = `phase3b-http-submission-${label}-${suffix}`
      const taskId = generateDomainId('tsk')
      const questionId = generateDomainId('wqi')
      const attemptId = generateDomainId('att')
      const question = {
        question_id: questionId,
        number: 1,
        type: 'multiple_choice',
        question: `Welche Antwort ist für ${label} richtig?`,
        options: ['Falsch', 'Richtig', 'Auch falsch'],
        answer: 'Richtig',
        points: 1,
      }
      const contentHash = worksheetQuestionContentHash(question)
      const pin = {
        question_id: questionId,
        worksheet_id: worksheetId,
        task_id: taskId,
        task_version: 1,
        content_hash: contentHash,
        hash_version: 'worksheet-question-sha256-v1',
      }
      await Promise.all([
        db.collection('worksheets').insertOne({ id: worksheetId, user_id: teacherId, revision: 1, content: { questions: [question] }, created_at: now }),
        db.collection('assignments').insertOne({
          id: assignmentId,
          class_id: `phase3b-http-class-${suffix}`,
          teacher_id: teacherId,
          worksheet_id: worksheetId,
          status: 'active',
          activity_type: activityType,
          show_solutions: showSolutions,
          learning_v2: {
            enabled: true,
            schema_version: 'learning-v2-phase2-v1',
            tenant_id: tenantId,
            tutor_preset: tutorPreset,
            task_pins: [pin],
            bound_by: teacherId,
            bound_at: now,
          },
        }),
        db.collection('learning_tasks').insertOne({
          tenant_id: tenantId,
          task_id: taskId,
          version: 1,
          status: 'published',
          task_type: 'selected_response',
          response_modality: 'choice',
          source: { worksheet_id: worksheetId, question_id: questionId, content_hash: contentHash, hash_version: 'worksheet-question-sha256-v1' },
          objective_refs: [{ objective_id: objectiveId, version: 1 }],
          competency_targets: [{ competency_id: competencyId, framework_id: frameworkId, framework_version: 'phase3b-http-v1', role: 'primary' }],
        }),
        db.collection('learning_attempts').insertOne({
          attempt_id: attemptId,
          schema_version: 'learning-attempt-v1',
          tenant_id: tenantId,
          student_id: studentId,
          task_ref: { task_id: taskId, version: 1 },
          objective_ref: { objective_id: objectiveId, version: 1 },
          primary_competency_ref: { competency_id: competencyId, framework_id: frameworkId, framework_version: 'phase3b-http-v1' },
          supporting_competency_refs: [],
          source: {
            kind: 'legacy_submission_question',
            submission_id: submissionId,
            submission_intent_id: `phase3b-http-intent-${label}-${suffix}`,
            assignment_id: assignmentId,
            worksheet_id: worksheetId,
            question_id: questionId,
            question_index: 0,
            source_revision: 1,
            content_hash: contentHash,
            hash_version: 'worksheet-question-sha256-v1',
            grading_revision: 1,
            learning_v2_attempt_no: 1,
          },
          answer: { type: 'selected_response', value: 'Falsch', format_version: 1 },
          outcome: { correctness: 'incorrect', score: 0, points_awarded: 0, max_points: 1, grader: 'deterministic', grader_version: 'legacy-deterministic-exact-v1' },
          independence: { level: 'independent', assistance_source: 'none' },
          attempt_no: 1,
          submitted_at: now,
          server_received_at: now,
          status: 'active',
          idempotency_key: `phase3b-http-trigger-${label}-${suffix}`,
          created_at: now,
        }),
      ])
      createdIds.push({ assignmentId, worksheetId })
      return { assignmentId, worksheetId, submissionId, taskId, questionId, contentHash }
    }

    let studentCookie
    let teacherCookie
    try {
      const passwordHash = await bcrypt.hash(password, 4)
      await Promise.all([
        db.collection('users').insertOne({ id: teacherId, email: teacherEmail, name: 'Phase 3b Teacher', password_hash: passwordHash, created_at: now }),
        db.collection('students').insertMany([
          { id: studentId, username, display_name: 'Phase 3b Student', password_hash: passwordHash, created_at: now },
          { id: otherStudentId, username: `other-${suffix}`, display_name: 'Other Learner', password_hash: passwordHash, created_at: now },
          { id: foreignStudentId, username: `foreign-${suffix}`, display_name: 'Foreign Learner', password_hash: passwordHash, created_at: now },
        ]),
        db.collection('learning_v2_tenants').insertMany([
          { tenant_id: tenantId, type: 'personal', owner_teacher_id: teacherId, status: 'active', created_at: now },
          { tenant_id: foreignTenantId, type: 'personal', owner_teacher_id: `foreign-teacher-${suffix}`, status: 'active', created_at: now },
        ]),
        db.collection('learning_v2_tenant_memberships').insertMany([
          { actor_type: 'teacher', actor_id: teacherId, tenant_id: tenantId, role: 'teacher', status: 'active', created_at: now },
          { actor_type: 'student', actor_id: studentId, tenant_id: tenantId, role: 'student', status: 'active', created_at: now },
          { actor_type: 'student', actor_id: otherStudentId, tenant_id: tenantId, role: 'student', status: 'active', created_at: now },
          { actor_type: 'student', actor_id: foreignStudentId, tenant_id: foreignTenantId, role: 'student', status: 'active', created_at: now },
        ]),
        db.collection('classes').insertOne({ id: `phase3b-http-class-${suffix}`, name: 'Phase 3b Class', teacher_id: teacherId, enrolled_students: [{ student_id: studentId, display_name: 'Phase 3b Student' }] }),
        db.collection('curriculum_nodes').insertOne({ tenant_id: tenantId, competency_id: competencyId, framework_ref: { framework_id: frameworkId, version: 'phase3b-http-v1' }, labels: { de: 'Reflexionskompetenz' }, authoritative: false, status: 'active' }),
        db.collection('learning_objectives').insertOne({ tenant_id: tenantId, objective_id: objectiveId, version: 1, title: 'Reflektieren', learner_statement: 'Ich kann meinen ersten Fehler benennen.', status: 'published', competency_targets: [{ competency_id: competencyId, framework_id: frameworkId, framework_version: 'phase3b-http-v1', role: 'primary' }] }),
      ])

      const main = await seedScenario({ label: 'main' })
      assert.equal((await fetch(`${baseUrl}/api/v2/learning/tutor/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: '{}' })).status, 401)

      const studentLogin = await fetch(`${baseUrl}/api/student/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify({ username, password }),
      })
      assert.equal(studentLogin.status, 200)
      assert.ok(sessionCookie(studentLogin))
      studentCookie = authorization({ studentId, username, role: 'student' })
      const teacherLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify({ email: teacherEmail, password }),
      })
      assert.equal(teacherLogin.status, 200)
      assert.ok(sessionCookie(teacherLogin))
      teacherCookie = authorization({ userId: teacherId, email: teacherEmail })

      const startSession = async (scenario) => {
        const response = await fetch(`${baseUrl}/api/v2/learning/tutor/sessions`, {
          method: 'POST',
          headers: jsonHeaders(studentCookie),
          body: JSON.stringify({ schema_version: 'learning-v2-phase3-v1', submission_id: scenario.submissionId, question_index: 0 }),
        })
        return response
      }
      const postHint = (sessionId, key) => fetch(`${baseUrl}/api/v2/learning/tutor/sessions/${sessionId}/hints`, {
        method: 'POST', headers: jsonHeaders(studentCookie), body: JSON.stringify({ schema_version: 'learning-v2-phase3-v1', idempotency_key: key }),
      })
      const postRetry = (sessionId, key, selectedResponse) => fetch(`${baseUrl}/api/v2/learning/tutor/sessions/${sessionId}/retries`, {
        method: 'POST', headers: jsonHeaders(studentCookie), body: JSON.stringify({ schema_version: 'learning-v2-phase3-v1', idempotency_key: key, selected_response: selectedResponse }),
      })
      const reachReflection = async (scenario, keyPrefix) => {
        const startedResponse = await startSession(scenario)
        assert.equal(startedResponse.status, 200)
        const started = (await startedResponse.json()).session
        assert.equal((await postHint(started.session_id, `${keyPrefix}-hint-one`)).status, 200)
        assert.equal((await postRetry(started.session_id, `${keyPrefix}-retry-one`, 'Falsch')).status, 200)
        const secondHint = await postHint(started.session_id, `${keyPrefix}-hint-two`)
        assert.equal(secondHint.status, 200)
        assert.equal((await secondHint.json()).hint.hint_level, 2)
        const corrected = await postRetry(started.session_id, `${keyPrefix}-retry-two`, 'Richtig')
        assert.equal(corrected.status, 200)
        const correctedBody = await corrected.json()
        assert.equal(correctedBody.session.phase, 'awaiting_reflection')
        return correctedBody.session
      }

      const awaiting = await reachReflection(main, `phase3b-main-${suffix}`)
      const getAwaiting = await fetch(`${baseUrl}/api/v2/learning/tutor/sessions/${awaiting.session_id}`, { headers: authHeaders(studentCookie) })
      assert.equal(getAwaiting.status, 200)
      const awaitingBody = (await getAwaiting.json()).session
      assert.equal(awaitingBody.reflection.status, 'awaiting_submission')
      assert.equal(awaitingBody.reflection.type, 'identify_mistake')
      assert.equal(Object.hasOwn(awaitingBody.reflection, 'prompt_id'), false)
      assert.equal(Object.hasOwn(awaitingBody.reflection, 'prompt_version'), false)
      assert.equal(awaitingBody.reflection.locale, 'de-CH')
      assert.equal(awaitingBody.reflection.prompt_text, 'Was war bei deinem ersten Versuch falsch oder unklar? Antworte in einem kurzen Satz.')

      const reflectionUrl = `${baseUrl}/api/v2/learning/tutor/sessions/${awaiting.session_id}/reflection`
      const reflectionBody = (key, text) => ({ schema_version: 'learning-v2-phase3b-v1', idempotency_key: key, response_text: text })
      assert.equal((await fetch(reflectionUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify(reflectionBody('phase3b-guest-key', 'Gastantwort')) })).status, 401)
      assert.equal((await fetch(reflectionUrl, { method: 'POST', headers: jsonHeaders(teacherCookie), body: JSON.stringify(reflectionBody('phase3b-teacher-key', 'Lehrerantwort')) })).status, 403)
      assert.equal((await fetch(reflectionUrl, { method: 'POST', headers: jsonHeaders(otherStudentAuthorization), body: JSON.stringify(reflectionBody('phase3b-other-key', 'Andere Lernperson')) })).status, 404)
      assert.equal((await fetch(reflectionUrl, { method: 'POST', headers: jsonHeaders(foreignStudentAuthorization), body: JSON.stringify(reflectionBody('phase3b-foreign-key', 'Fremder Mandant')) })).status, 404)
      assert.equal((await fetch(reflectionUrl, { method: 'POST', headers: jsonHeaders(studentCookie), body: JSON.stringify(reflectionBody('phase3b-oversized-key', 'a'.repeat(301))) })).status, 400)
      assert.equal((await fetch(reflectionUrl, { method: 'POST', headers: jsonHeaders(studentCookie), body: JSON.stringify({ ...reflectionBody('phase3b-injection-key', 'Eigene Antwort'), student_id: studentId, tenant_id: tenantId, mastery: 1 }) })).status, 400)

      const submitReflection = (key, text) => fetch(reflectionUrl, { method: 'POST', headers: jsonHeaders(studentCookie), body: JSON.stringify(reflectionBody(key, text)) })
      const [submittedA, submittedB] = await Promise.all([
        submitReflection('phase3b-tab-a-key', 'Ich habe zuerst die falsche Option gewählt.'),
        submitReflection('phase3b-tab-b-key', 'Ich hatte die beiden Optionen verwechselt.'),
      ])
      assert.equal(submittedA.status, 200)
      assert.equal(submittedB.status, 200)
      const submittedBodyA = await submittedA.json()
      const submittedBodyB = await submittedB.json()
      assert.equal(submittedBodyA.reflection.response_text, submittedBodyB.reflection.response_text)
      assert.equal(submittedBodyA.session.status, 'completed')
      assert.equal(submittedBodyA.session.reflection.status, 'submitted')

      const ownRead = await fetch(`${baseUrl}/api/v2/learning/tutor/sessions/${awaiting.session_id}`, { headers: authHeaders(studentCookie) })
      assert.equal(ownRead.status, 200)
      assert.equal((await ownRead.json()).session.reflection.response_text, submittedBodyA.reflection.response_text)
      const canonicalEvents = await db.collection('learning_events').find({ tenant_id: tenantId, 'aggregate.id': awaiting.session_id }).sort({ sequence: 1 }).toArray()
      assert.equal(canonicalEvents.filter((item) => item.type === 'REFLECTION_REQUESTED').length, 1)
      assert.equal(canonicalEvents.filter((item) => item.type === 'REFLECTION_SUBMITTED').length, 1)
      assert.equal(canonicalEvents.filter((item) => item.type === 'TUTOR_SESSION_COMPLETED').length, 1)
      assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: tenantId }), 1)

      const teacherDetailResponse = await fetch(`${baseUrl}/api/v2/learning/teacher/students/${studentId}/tutor-sessions/${awaiting.session_id}`, { headers: authHeaders(teacherCookie) })
      assert.equal(teacherDetailResponse.status, 200)
      const teacherDetail = await teacherDetailResponse.json()
      assert.equal(teacherDetail.reflection.response_text, submittedBodyA.reflection.response_text)
      assert.equal(teacherDetail.reflection.prompt_text, 'Was war bei deinem ersten Versuch falsch oder unklar? Antworte in einem kurzen Satz.')
      assert.equal(teacherDetail.session.reflection.mastery_statement, 'Does not affect Mastery or Confidence.')
      const teacherSummaryResponse = await fetch(`${baseUrl}/api/v2/learning/teacher/students/${studentId}/competencies/${competencyId}`, { headers: authHeaders(teacherCookie) })
      assert.equal(teacherSummaryResponse.status, 200)
      const teacherSummary = await teacherSummaryResponse.json()
      assert.equal(teacherSummary.tutor_sessions[0].reflection.mastery_statement, 'Does not affect Mastery or Confidence.')
      assert.equal(JSON.stringify(teacherSummary).includes(submittedBodyA.reflection.response_text), false)

      await db.collection('learning_v2_tenant_memberships').updateOne({ actor_type: 'student', actor_id: studentId, tenant_id: tenantId }, { $set: { status: 'inactive' } })
      assert.equal((await fetch(reflectionUrl, { method: 'POST', headers: jsonHeaders(studentCookie), body: JSON.stringify(reflectionBody('phase3b-stale-membership', 'Nicht speichern')) })).status, 403)
      await db.collection('learning_v2_tenant_memberships').updateOne({ actor_type: 'student', actor_id: studentId, tenant_id: tenantId }, { $set: { status: 'active' } })

      const staleScenario = await seedScenario({ label: 'stale' })
      const staleSession = await reachReflection(staleScenario, `phase3b-stale-${suffix}`)
      await db.collection('worksheets').updateOne({ id: staleScenario.worksheetId }, { $set: { 'content.questions.0.question': 'Nachträglich veränderte Frage' } })
      const staleResponseText = 'Diese stale Antwort darf nicht gespeichert werden.'
      const staleResponse = await fetch(`${baseUrl}/api/v2/learning/tutor/sessions/${staleSession.session_id}/reflection`, {
        method: 'POST', headers: jsonHeaders(studentCookie), body: JSON.stringify(reflectionBody('phase3b-stale-source-key', staleResponseText)),
      })
      assert.equal(staleResponse.status, 404)
      assert.equal(JSON.stringify(await db.collection('learning_events').find({ tenant_id: tenantId }).toArray()).includes(staleResponseText), false)

      const expiredScenario = await seedScenario({ label: 'expired' })
      const expiredSession = await reachReflection(expiredScenario, `phase3b-expired-${suffix}`)
      await db.collection('tutor_sessions').updateOne({ tenant_id: tenantId, session_id: expiredSession.session_id }, { $set: { expires_at: new Date(Date.now() - 60_000) } })
      const expiredResponse = await fetch(`${baseUrl}/api/v2/learning/tutor/sessions/${expiredSession.session_id}/reflection`, {
        method: 'POST', headers: jsonHeaders(studentCookie), body: JSON.stringify(reflectionBody('phase3b-expired-key', 'Zu spät eingereichte Antwort')),
      })
      assert.equal(expiredResponse.status, 409)
      const expiredPersisted = await db.collection('tutor_sessions').findOne({ tenant_id: tenantId, session_id: expiredSession.session_id })
      assert.equal(expiredPersisted.reflection.status, 'expired_unsubmitted')

      for (const [label, activityType, tutorPreset] of [
        ['off', 'exercise', 'TUTOR_OFF'],
        ['assessment', 'assessment', 'LOCAL_HINTS'],
        ['diagnostic', 'diagnostic', 'LOCAL_HINTS'],
        ['exit-ticket', 'exit_ticket', 'LOCAL_HINTS'],
      ]) {
        const scenario = await seedScenario({ label, activityType, tutorPreset })
        const response = await startSession(scenario)
        assert.equal(response.status, 404)
      }
    } finally {
      for (const name of [
        'users', 'students', 'learning_v2_tenants', 'learning_v2_tenant_memberships', 'classes', 'curriculum_nodes',
        'learning_objectives', 'worksheets', 'assignments', 'learning_tasks', 'learning_attempts', 'evidence_events',
        'student_knowledge_states', 'learning_events', 'tutor_policies', 'tutor_sessions', 'rate_limits', 'ai_generations',
      ]) {
        await db.collection(name).deleteMany({
          $or: [
            { tenant_id: { $in: [tenantId, foreignTenantId] } },
            { id: { $in: [teacherId, studentId, otherStudentId, foreignStudentId] } },
            { teacher_id: teacherId },
            { user_id: teacherId },
          ],
        })
      }
      await client.close()
    }
  })
}
