import assert from 'node:assert/strict'
import test from 'node:test'
import { MongoClient } from 'mongodb'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'
import { ensureLearningV2Indexes } from '../lib/server/learning-v2/database/bootstrap.js'
import { createPhase3Services } from '../lib/server/learning-v2/phase3-services.js'
import { worksheetQuestionContentHash } from '../lib/server/worksheet-question-identity.js'

const enabled = process.env.RUN_LEARNING_V2_MONGO_TESTS === '1'

function actor(tenantId, studentId) {
  return {
    actor_id: studentId,
    actor_type: 'student',
    role: 'student',
    tenant_id: tenantId,
    teacher_id: null,
    student_id: studentId,
    permissions: [],
  }
}

if (!enabled) {
  test('Learning V2 Phase-3b real Mongo test requires RUN_LEARNING_V2_MONGO_TESTS=1', { skip: true }, () => {})
} else {
  test('Phase 3b Reflection preserves Evidence and Knowledge State against disposable real MongoDB', async () => {
    const baseName = process.env.LEARNING_V2_TEST_DB_NAME
    assert.match(baseName || '', /^eduflow_learning_v2_test_[a-z0-9_-]+$/)
    assert.ok(process.env.MONGO_URL)
    const databaseName = `${baseName}_phase3b`
    const client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    const db = client.db(databaseName)
    const now = new Date('2026-08-26T12:00:00.000Z')
    const tenantId = generateDomainId('ten')
    const studentId = 'phase3b-mongo-student'
    const otherStudentId = 'phase3b-mongo-other-student'
    const foreignTenantId = generateDomainId('ten')
    const assignmentId = 'phase3b-mongo-assignment'
    const worksheetId = 'phase3b-mongo-worksheet'
    const taskId = generateDomainId('tsk')
    const objectiveId = generateDomainId('obj')
    const competencyId = generateDomainId('cmp')
    const frameworkId = generateDomainId('frm')
    const questionId = generateDomainId('wqi')
    const question = {
      question_id: questionId,
      number: 1,
      type: 'multiple_choice',
      question: 'Was ist die Hauptstadt Frankreichs?',
      options: ['Bern', 'Paris', 'Rom'],
      answer: 'Paris',
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
    const studentActor = actor(tenantId, studentId)
    const services = createPhase3Services(db, {
      now: () => now,
      phase3bEnabled: true,
      provider: { available: () => false },
      rateLimiter: { consumeHint: async () => {}, allowProvider: async () => false },
      telemetry: { record: async () => {} },
    })

    const insertTrigger = async (attemptId, submissionId, attemptNo) => {
      await db.collection('learning_attempts').insertOne({
        attempt_id: attemptId,
        schema_version: 'learning-attempt-v1',
        tenant_id: tenantId,
        student_id: studentId,
        task_ref: { task_id: taskId, version: 1 },
        objective_ref: { objective_id: objectiveId, version: 1 },
        primary_competency_ref: {
          competency_id: competencyId,
          framework_id: frameworkId,
          framework_version: 'phase3b-v1',
        },
        supporting_competency_refs: [],
        source: {
          kind: 'legacy_submission_question',
          submission_id: submissionId,
          submission_intent_id: `phase3b-mongo-intent-${attemptNo}`,
          assignment_id: assignmentId,
          worksheet_id: worksheetId,
          question_id: questionId,
          question_index: 0,
          source_revision: 1,
          content_hash: contentHash,
          hash_version: 'worksheet-question-sha256-v1',
          grading_revision: 1,
          learning_v2_attempt_no: attemptNo,
        },
        answer: { type: 'selected_response', value: 'Bern', format_version: 1 },
        outcome: {
          correctness: 'incorrect',
          score: 0,
          points_awarded: 0,
          max_points: 1,
          grader: 'deterministic',
          grader_version: 'legacy-deterministic-exact-v1',
        },
        independence: { level: 'independent', assistance_source: 'none' },
        attempt_no: attemptNo,
        submitted_at: now,
        server_received_at: now,
        status: 'active',
        idempotency_key: `phase3b-mongo-trigger-${attemptNo}`,
        created_at: now,
      })
    }

    const reachReflection = async (submissionId, keyPrefix) => {
      const started = await services.tutor.start(studentActor, {
        schema_version: 'learning-v2-phase3-v1',
        submission_id: submissionId,
        question_index: 0,
      })
      await services.tutor.hint(studentActor, started.session_id, {
        schema_version: 'learning-v2-phase3-v1',
        idempotency_key: `${keyPrefix}-hint-one`,
      })
      await services.tutor.retry(studentActor, started.session_id, {
        schema_version: 'learning-v2-phase3-v1',
        idempotency_key: `${keyPrefix}-retry-one`,
        selected_response: 'Bern',
      })
      await services.tutor.hint(studentActor, started.session_id, {
        schema_version: 'learning-v2-phase3-v1',
        idempotency_key: `${keyPrefix}-hint-two`,
      })
      const corrected = await services.tutor.retry(studentActor, started.session_id, {
        schema_version: 'learning-v2-phase3-v1',
        idempotency_key: `${keyPrefix}-retry-two`,
        selected_response: 'Paris',
      })
      assert.equal(corrected.session.phase, 'awaiting_reflection')
      assert.equal(corrected.session.reflection.status, 'awaiting_submission')
      return corrected.session
    }

    try {
      await ensureLearningV2Indexes(db)
      await Promise.all([
        db.collection('users').insertOne({ id: 'phase3b-mongo-teacher', status: 'active' }),
        db.collection('students').insertOne({ id: studentId, status: 'active' }),
        db.collection('classes').insertOne({ id: 'phase3b-mongo-class', teacher_id: 'phase3b-mongo-teacher', enrolled_students: [{ student_id: studentId }] }),
        db.collection('learning_v2_tenants').insertMany([
          { tenant_id: tenantId, type: 'personal', owner_teacher_id: 'phase3b-mongo-teacher', status: 'active', created_at: now },
          { tenant_id: foreignTenantId, type: 'personal', owner_teacher_id: 'phase3b-mongo-foreign-teacher', status: 'active', created_at: now },
        ]),
        db.collection('learning_v2_tenant_memberships').insertMany([
          { actor_type: 'student', actor_id: studentId, tenant_id: tenantId, role: 'student', status: 'active', created_at: now },
          { actor_type: 'student', actor_id: otherStudentId, tenant_id: tenantId, role: 'student', status: 'active', created_at: now },
        ]),
        db.collection('worksheets').insertOne({ id: worksheetId, user_id: 'phase3b-mongo-teacher', revision: 1, content: { questions: [question] }, created_at: now }),
        db.collection('assignments').insertOne({
          id: assignmentId,
          class_id: 'phase3b-mongo-class',
          teacher_id: 'phase3b-mongo-teacher',
          worksheet_id: worksheetId,
          status: 'active',
          activity_type: 'exercise',
          show_solutions: true,
          learning_v2: {
            enabled: true,
            schema_version: 'learning-v2-phase2-v1',
            tenant_id: tenantId,
            tutor_preset: 'LOCAL_HINTS',
            task_pins: [pin],
            bound_by: 'phase3b-mongo-teacher',
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
          source: {
            worksheet_id: worksheetId,
            question_id: questionId,
            content_hash: contentHash,
            hash_version: 'worksheet-question-sha256-v1',
          },
          objective_refs: [{ objective_id: objectiveId, version: 1 }],
          competency_targets: [{
            competency_id: competencyId,
            framework_id: frameworkId,
            framework_version: 'phase3b-v1',
            role: 'primary',
          }],
        }),
      ])

      const firstAttemptId = generateDomainId('att')
      const firstSubmissionId = 'phase3b-mongo-submission-1'
      await insertTrigger(firstAttemptId, firstSubmissionId, 1)
      const awaiting = await reachReflection(firstSubmissionId, 'phase3b-mongo-first')

      const evidenceBefore = await db.collection('evidence_events').find({ tenant_id: tenantId }).toArray()
      assert.equal(evidenceBefore.length, 1)
      assert.equal(evidenceBefore[0].type, 'correct_after_hint')
      assert.equal(evidenceBefore[0].hint_level, 2)
      const stateBefore = await db.collection('student_knowledge_states').findOne({ tenant_id: tenantId, student_id: studentId, competency_id: competencyId })
      const explanationBefore = await services.explanations.explain(studentActor, studentId, competencyId)
      assert.ok(stateBefore)

      const submit = (responseText, idempotencyKey) => services.tutor.reflect(studentActor, awaiting.session_id, {
        schema_version: 'learning-v2-phase3b-v1',
        idempotency_key: idempotencyKey,
        response_text: responseText,
      })
      const [submissionA, submissionB] = await Promise.all([
        submit('Ich habe zuerst die falsche Hauptstadt gewählt.', 'phase3b-mongo-tab-a'),
        submit('Ich hatte die Länder und Hauptstädte verwechselt.', 'phase3b-mongo-tab-b'),
      ])
      assert.equal(submissionA.session.status, 'completed')
      assert.equal(submissionB.session.status, 'completed')
      assert.equal(submissionA.reflection.response_text, submissionB.reflection.response_text)

      const events = await db.collection('learning_events').find({
        tenant_id: tenantId,
        'aggregate.type': 'tutor_session',
        'aggregate.id': awaiting.session_id,
      }).sort({ sequence: 1 }).toArray()
      assert.equal(events.filter((item) => item.type === 'REFLECTION_REQUESTED').length, 1)
      assert.equal(events.filter((item) => item.type === 'REFLECTION_SUBMITTED').length, 1)
      assert.equal(events.filter((item) => item.type === 'TUTOR_SESSION_COMPLETED').length, 1)
      assert.deepEqual(events.map((item) => item.sequence), events.map((item) => item.sequence).sort((a, b) => a - b))
      assert.equal(new Set(events.map((item) => item.sequence)).size, events.length)
      assert.ok(events.findIndex((item) => item.type === 'REFLECTION_REQUESTED') < events.findIndex((item) => item.type === 'REFLECTION_SUBMITTED'))
      assert.ok(events.findIndex((item) => item.type === 'REFLECTION_SUBMITTED') < events.findIndex((item) => item.type === 'TUTOR_SESSION_COMPLETED'))

      const canonicalSubmission = events.find((item) => item.type === 'REFLECTION_SUBMITTED')
      const persistedSession = await db.collection('tutor_sessions').findOne({ tenant_id: tenantId, session_id: awaiting.session_id })
      assert.equal(canonicalSubmission.payload.reflection.response_text, submissionA.reflection.response_text)
      assert.equal(JSON.stringify(persistedSession).includes(canonicalSubmission.payload.reflection.response_text), false)
      assert.equal(JSON.stringify(evidenceBefore).includes(canonicalSubmission.payload.reflection.response_text), false)
      assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: tenantId }), evidenceBefore.length)
      assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: tenantId, type: 'teacher_assessment' }), 0)

      const stateAfter = await db.collection('student_knowledge_states').findOne({ tenant_id: tenantId, student_id: studentId, competency_id: competencyId })
      const explanationAfter = await services.explanations.explain(studentActor, studentId, competencyId)
      assert.equal(stateAfter.projection.input_set_hash, stateBefore.projection.input_set_hash)
      assert.equal(stateAfter.mastery, stateBefore.mastery)
      assert.equal(stateAfter.confidence, stateBefore.confidence)
      assert.equal(stateAfter.band, stateBefore.band)
      assert.deepEqual(explanationAfter, explanationBefore)

      const secondAttemptId = generateDomainId('att')
      const secondSubmissionId = 'phase3b-mongo-submission-2'
      await insertTrigger(secondAttemptId, secondSubmissionId, 2)
      const stale = await reachReflection(secondSubmissionId, 'phase3b-mongo-stale')
      await assert.rejects(
        services.tutor.reflect(actor(tenantId, otherStudentId), stale.session_id, {
          schema_version: 'learning-v2-phase3b-v1',
          idempotency_key: 'phase3b-mongo-other-student',
          response_text: 'Das darf nicht gespeichert werden.',
        }),
        (error) => error.code === 'NOT_FOUND',
      )
      await assert.rejects(
        services.tutor.reflect(actor(foreignTenantId, studentId), stale.session_id, {
          schema_version: 'learning-v2-phase3b-v1',
          idempotency_key: 'phase3b-mongo-foreign-tenant',
          response_text: 'Das darf ebenfalls nicht gespeichert werden.',
        }),
        (error) => error.code === 'NOT_FOUND',
      )
      await db.collection('worksheets').updateOne({ id: worksheetId }, { $set: { 'content.questions.0.question': 'Veränderte und damit nicht mehr gepinnte Frage' } })
      await assert.rejects(
        services.tutor.reflect(studentActor, stale.session_id, {
          schema_version: 'learning-v2-phase3b-v1',
          idempotency_key: 'phase3b-mongo-stale-source',
          response_text: 'Diese Antwort darf wegen des stale Pins nicht gespeichert werden.',
        }),
        (error) => error.code === 'NOT_FOUND',
      )
      const forbiddenText = 'Diese Antwort darf wegen des stale Pins nicht gespeichert werden.'
      assert.equal(JSON.stringify(await db.collection('learning_events').find({ tenant_id: tenantId }).toArray()).includes(forbiddenText), false)
    } finally {
      await db.dropDatabase()
      await client.close()
    }
  })
}
