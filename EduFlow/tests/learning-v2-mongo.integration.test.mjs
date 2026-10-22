import assert from 'node:assert/strict'
import test from 'node:test'
import { MongoClient } from 'mongodb'
import { AttemptRepository } from '../lib/server/learning-v2/attempts/attempt-repository.js'
import { PHASE_2_SCHEMA_VERSION } from '../lib/server/learning-v2/contracts/phase2.js'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'
import {
  ensureLearningV2Indexes,
  inspectLearningV2Indexes,
} from '../lib/server/learning-v2/database/bootstrap.js'
import { EvidenceRepository } from '../lib/server/learning-v2/evidence/evidence-repository.js'
import { LearningEventRepository } from '../lib/server/learning-v2/events/learning-event-repository.js'
import { safeAfterLegacySubmissionPersisted } from '../lib/server/learning-v2/integration/legacy-submission-adapter.js'
import { projectKnowledgeState } from '../lib/server/learning-v2/knowledge-state/projection.js'
import { ProjectionRepository } from '../lib/server/learning-v2/knowledge-state/projection-repository.js'
import { createPhase2Services } from '../lib/server/learning-v2/phase2-services.js'
import { ReconciliationService } from '../lib/server/learning-v2/reconciliation/reconciliation-service.js'
import { TutorSessionRepository } from '../lib/server/learning-v2/tutor/tutor-session-repository.js'

const enabled = process.env.RUN_LEARNING_V2_MONGO_TESTS === '1'

function fulfilledCount(results) {
  return results.filter((result) => result.status === 'fulfilled').length
}

function assertOneDuplicateWrite(results) {
  assert.equal(fulfilledCount(results), 1)
  const rejected = results.find((result) => result.status === 'rejected')
  assert.equal(rejected?.reason?.code, 11000)
}

function selectedResponseEvidence({ tenantId, studentId, competencyRef, taskId, type = 'correct_answer', occurredAt }) {
  return {
    evidence_id: generateDomainId('evd'),
    tenant_id: tenantId,
    student_id: studentId,
    type,
    target: {
      ...competencyRef,
      objective_id: generateDomainId('obj'),
      objective_version: 1,
      dimension: 'application',
    },
    claim: { result: type === 'correct_answer' ? 'supports' : 'challenges' },
    independence: { level: 'independent' },
    source: { kind: 'attempt', source_id: generateDomainId('att'), task_id: taskId, task_version: 1 },
    provenance: { producer: 'evidence-rules', evidence_policy_version: 'evidence-policy-v1' },
    response_modality: 'selected_response',
    occurred_at: occurredAt,
    status: 'active',
  }
}

if (!enabled) {
  test('Learning V2 MongoDB bootstrap test requires RUN_LEARNING_V2_MONGO_TESTS=1', { skip: true }, () => {})
} else {
  test('Learning V2 real-Mongo invariants hold in an explicitly disposable database', async (t) => {
    const databaseName = process.env.LEARNING_V2_TEST_DB_NAME
    assert.match(
      databaseName || '',
      /^eduflow_learning_v2_test_[a-z0-9_-]+$/,
      'LEARNING_V2_TEST_DB_NAME must name an explicitly disposable Learning V2 test database',
    )
    assert.equal(process.env.DB_NAME === databaseName || process.env.DB_NAME === undefined, true)
    assert.ok(process.env.MONGO_URL, 'MONGO_URL is required')
    const client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    const db = client.db(databaseName)
    try {
      await t.test('Phase 0, Phase 1 and Phase 2 indexes bootstrap idempotently', async () => {
        await ensureLearningV2Indexes(db)
        await ensureLearningV2Indexes(db)
        const report = await inspectLearningV2Indexes(db)
        assert.equal(report.every((entry) => entry.present), true)
      })

      await t.test('both partial legacy-submission uniqueness boundaries reject concurrent duplicates', async () => {
        const submissions = db.collection('submissions')
        const assignmentId = 'mongo-assignment-slot'
        const studentId = 'mongo-student-slot'
        const slotRace = await Promise.allSettled([
          submissions.insertOne({
            id: 'slot-a', assignment_id: assignmentId, student_id: studentId,
            learning_v2_submission_intent_id: 'intent-a', learning_v2_attempt_no: 1,
          }),
          submissions.insertOne({
            id: 'slot-b', assignment_id: assignmentId, student_id: studentId,
            learning_v2_submission_intent_id: 'intent-b', learning_v2_attempt_no: 1,
          }),
        ])
        assertOneDuplicateWrite(slotRace)
        assert.equal(await submissions.countDocuments({ assignment_id: assignmentId, student_id: studentId }), 1)

        const intentAssignment = 'mongo-assignment-intent'
        const intentRace = await Promise.allSettled([
          submissions.insertOne({
            id: 'intent-a', assignment_id: intentAssignment, student_id: studentId,
            learning_v2_submission_intent_id: 'same-intent', learning_v2_attempt_no: 1,
          }),
          submissions.insertOne({
            id: 'intent-b', assignment_id: intentAssignment, student_id: studentId,
            learning_v2_submission_intent_id: 'same-intent', learning_v2_attempt_no: 2,
          }),
        ])
        assertOneDuplicateWrite(intentRace)
        assert.equal(await submissions.countDocuments({ assignment_id: intentAssignment, student_id: studentId }), 1)
      })

      await t.test('concurrent Attempt writes resolve to one canonical Attempt', async () => {
        const tenantId = generateDomainId('ten')
        await db.collection('learning_v2_tenants').insertOne({ tenant_id: tenantId, status: 'active', type: 'personal', owner_teacher_id: tenantId })
        const actor = { tenant_id: tenantId }
        const repository = new AttemptRepository(db)
        const idempotencyKey = 'mongo-attempt-idempotency'
        const source = { submission_id: 'mongo-submission-attempt', question_id: 'mongo-question-attempt' }
        const common = {
          tenant_id: tenantId, student_id: 'mongo-attempt-student', idempotency_key: idempotencyKey,
          source, task_ref: { task_id: generateDomainId('tsk'), version: 1 },
        }
        const [first, second] = await Promise.all([
          repository.insertCanonical(actor, { ...common, attempt_id: generateDomainId('att') }),
          repository.insertCanonical(actor, { ...common, attempt_id: generateDomainId('att') }),
        ])
        assert.equal(first.attempt_id, second.attempt_id)
        assert.equal(await db.collection('learning_attempts').countDocuments({ tenant_id: tenantId, idempotency_key: idempotencyKey }), 1)
      })

      await t.test('concurrent correctness interpretation creates one Evidence outcome', async () => {
        const tenantId = generateDomainId('ten')
        await db.collection('learning_v2_tenants').insertOne({ tenant_id: tenantId, status: 'active', type: 'personal', owner_teacher_id: tenantId })
        const actor = { tenant_id: tenantId }
        const repository = new EvidenceRepository(db)
        const attemptId = generateDomainId('att')
        const common = {
          tenant_id: tenantId, student_id: 'mongo-evidence-student', idempotency_key: 'mongo-evidence-idempotency',
          source: { kind: 'attempt', source_id: attemptId },
        }
        const [first, second] = await Promise.all([
          repository.insertCanonical(actor, { ...common, evidence_id: generateDomainId('evd'), type: 'correct_answer' }),
          repository.insertCanonical(actor, { ...common, evidence_id: generateDomainId('evd'), type: 'incorrect_answer' }),
        ])
        assert.equal(first.evidence_id, second.evidence_id)
        const canonical = await db.collection('evidence_events').find({ tenant_id: tenantId, idempotency_key: common.idempotency_key }).toArray()
        assert.equal(canonical.length, 1)
        assert.equal(['correct_answer', 'incorrect_answer'].includes(canonical[0].type), true)
      })

      await t.test('Knowledge State source revision fences concurrent writes', async () => {
        const tenantId = generateDomainId('ten'); const actor = { tenant_id: tenantId }
        await db.collection('learning_v2_tenants').insertOne({ tenant_id: tenantId, status: 'active', type: 'personal', owner_teacher_id: tenantId, evidence_revision: 2 })
        const competencyRef = { competency_id: generateDomainId('cmp'), framework_id: generateDomainId('frm'), framework_version: 'mongo-v1' }
        const now = new Date('2026-08-25T10:00:00Z'); const studentId = 'source-revision-student'
        const state = projectKnowledgeState({ tenantId, studentId, competencyRef, evidence: [], now })
        const repository = new ProjectionRepository(db)
        const results = await Promise.all([repository.replace(actor, state, now, 1), repository.replace(actor, state, now, 2)])
        assert.equal(results[0].conflict, true); assert.equal(results[1].changed, true)
        assert.equal((await repository.find(actor, studentId, competencyRef.competency_id)).projection.source_revision, 2)
        assert.equal((await repository.replace(actor, state, now, 2)).changed, false)
      })

      await t.test('LearningEvent retries preserve idempotency and aggregate sequence uniqueness', async () => {
        const tenantId = generateDomainId('ten')
        await db.collection('learning_v2_tenants').insertOne({ tenant_id: tenantId, status: 'active', type: 'personal', owner_teacher_id: tenantId })
        const actor = { tenant_id: tenantId }
        const events = new LearningEventRepository(db)
        const input = {
          type: 'ATTEMPT_RECORDED', aggregate: { type: 'legacy_submission', id: 'mongo-event-submission' },
          correlationId: 'mongo-event-correlation', payload: { attempt_id: generateDomainId('att'), question_id: 'mongo-question' },
        }
        const [first, second] = await Promise.all([events.record(actor, input), events.record(actor, input)])
        assert.equal(first.event_id, second.event_id)
        assert.equal(await db.collection('learning_events').countDocuments({ tenant_id: tenantId, idempotency_key: first.idempotency_key }), 1)

        const aggregate = { type: 'attempt', id: generateDomainId('att') }
        const sequenceRace = await Promise.allSettled([
          db.collection('learning_events').insertOne({
            tenant_id: tenantId, event_id: generateDomainId('evt'), idempotency_key: 'sequence-a', aggregate, sequence: 1,
          }),
          db.collection('learning_events').insertOne({
            tenant_id: tenantId, event_id: generateDomainId('evt'), idempotency_key: 'sequence-b', aggregate, sequence: 1,
          }),
        ])
        assertOneDuplicateWrite(sequenceRace)
      })

      await t.test('Tutor active-session uniqueness and compare-and-set converge under real races', async () => {
        const tenantId = generateDomainId('ten')
        await db.collection('learning_v2_tenants').insertOne({ tenant_id: tenantId, status: 'active', type: 'personal', owner_teacher_id: tenantId })
        const actor = { tenant_id: tenantId, student_id: 'mongo-tutor-student' }
        const repository = new TutorSessionRepository(db)
        const common = {
          tenant_id: tenantId, student_id: actor.student_id, assignment_id: 'mongo-tutor-assignment',
          task_ref: { task_id: generateDomainId('tsk'), version: 1 }, status: 'active', state_version: 1,
        }
        const [first, second] = await Promise.all([
          repository.insertActive(actor, { ...common, session_id: generateDomainId('ses'), start_key: 'mongo-tutor-start-a' }),
          repository.insertActive(actor, { ...common, session_id: generateDomainId('ses'), start_key: 'mongo-tutor-start-b' }),
        ])
        assert.equal(first.session_id, second.session_id)
        assert.equal(await db.collection('tutor_sessions').countDocuments({ tenant_id: tenantId, status: 'active' }), 1)

        const canonical = await repository.findForStudent(actor, first.session_id)
        const race = await Promise.allSettled([
          repository.transition(actor, canonical, { phase: 'awaiting_retry' }),
          repository.transition(actor, canonical, { phase: 'awaiting_retry' }),
        ])
        assert.equal(fulfilledCount(race), 1)
        assert.equal(race.find((item) => item.status === 'rejected')?.reason?.code, 'CONFLICT')
        assert.equal((await repository.findForStudent(actor, first.session_id)).state_version, 2)
      })

      await t.test('failed post-grading V2 processing is recovered idempotently by concurrent reconciliation', async () => {
        const tenantId = generateDomainId('ten')
        const teacherId = 'mongo-reconcile-teacher'
        await db.collection('classes').insertOne({ id: 'mongo-reconcile-class', teacher_id: teacherId, enrolled_students: [{ student_id: 'mongo-reconcile-student' }] })
        const studentId = 'mongo-reconcile-student'
        const assignmentId = 'mongo-reconcile-assignment'
        const worksheetId = 'mongo-reconcile-worksheet'
        const submissionId = 'mongo-reconcile-submission'
        const questionId = generateDomainId('wqi')
        const taskId = generateDomainId('tsk')
        const objectiveId = generateDomainId('obj')
        const competencyRef = {
          competency_id: generateDomainId('cmp'), framework_id: generateDomainId('frm'), framework_version: 'mongo-v1',
        }
        const contentHash = `sha256:${'a'.repeat(64)}`
        const submittedAt = new Date('2026-08-25T10:00:00.000Z')
        const pin = {
          question_id: questionId, worksheet_id: worksheetId, task_id: taskId, task_version: 1,
          content_hash: contentHash, hash_version: 'worksheet-question-sha256-v1',
        }
        const assignment = {
          id: assignmentId, teacher_id: teacherId, worksheet_id: worksheetId,
          learning_v2: { enabled: true, tenant_id: tenantId, task_pins: [pin] },
        }
        const submission = {
          id: submissionId, assignment_id: assignmentId, student_id: studentId, student_name: 'Synthetic Student',
          learning_v2_tenant_id: tenantId, learning_v2_submission_intent_id: 'mongo-reconcile-intent',
          learning_v2_attempt_no: 1, learning_v2_task_pins: [pin], earned_points: 1, score_percentage: 100,
          submitted_at: submittedAt,
          question_results: [{
            questionId, type: 'multiple_choice', studentAnswer: 'B', isCorrect: true,
            pointsAwarded: 1, maxPoints: 1, aiGraded: false, needsManualReview: false, teacherOverride: false,
            sourceRevision: 1, contentHash, hashVersion: 'worksheet-question-sha256-v1',
            graderVersion: 'legacy-deterministic-exact-v1', gradingRevision: 1,
            learningV2Eligibility: {
              questionType: 'multiple_choice', optionCount: 3,
              distinctNonEmptyOptions: true, answerExactlyMatchesOption: true,
            },
          }],
        }
        await Promise.all([
          db.collection('learning_v2_tenants').insertOne({
            tenant_id: tenantId, type: 'personal', owner_teacher_id: teacherId, status: 'active', created_at: submittedAt,
          }),
          db.collection('students').insertOne({ id: studentId, created_at: submittedAt }),
          db.collection('assignments').insertOne(assignment),
          db.collection('learning_tasks').insertOne({
            tenant_id: tenantId, task_id: taskId, version: 1, status: 'published',
            task_type: 'selected_response', response_modality: 'choice',
            source: { worksheet_id: worksheetId, question_id: questionId, content_hash: contentHash, hash_version: 'worksheet-question-sha256-v1' },
            objective_refs: [{ objective_id: objectiveId, version: 1 }],
            competency_targets: [{ ...competencyRef, role: 'primary' }],
          }),
          db.collection('submissions').insertOne(submission),
        ])
        await db.collection('learning_v2_tenant_memberships').insertOne({
          actor_type: 'student', actor_id: studentId, tenant_id: tenantId, role: 'student', status: 'active', created_at: submittedAt,
        })
        const studentActor = {
          actor_id: studentId, actor_type: 'student', role: 'student', tenant_id: tenantId,
          teacher_id: null, student_id: studentId, permissions: ['learning:read:self', 'learning:write:self'],
        }
        const previousEnvironment = {
          NODE_ENV: process.env.NODE_ENV,
          LEARNING_V2_ENABLED: process.env.LEARNING_V2_ENABLED,
          LEARNING_V2_PHASE_2_ENABLED: process.env.LEARNING_V2_PHASE_2_ENABLED,
        }
        process.env.NODE_ENV = 'test'
        process.env.LEARNING_V2_ENABLED = 'true'
        process.env.LEARNING_V2_PHASE_2_ENABLED = 'true'
        try {
          const failed = await safeAfterLegacySubmissionPersisted({
            db, actor: studentActor, assignment, worksheet: { id: worksheetId }, submission,
            services: { events: { async record() { throw new Error('controlled V2 outage') } } },
          })
          assert.deepEqual(failed, { status: 'failed', reason: 'ADAPTER_FAILURE' })
          const persistedLegacy = await db.collection('submissions').findOne({ id: submissionId })
          assert.equal(persistedLegacy.earned_points, 1)
          assert.equal(persistedLegacy.score_percentage, 100)
          assert.equal(await db.collection('learning_attempts').countDocuments({ tenant_id: tenantId }), 0)
        } finally {
          for (const [key, value] of Object.entries(previousEnvironment)) {
            if (value === undefined) delete process.env[key]
            else process.env[key] = value
          }
        }

        const teacherActor = {
          actor_id: teacherId, actor_type: 'teacher', role: 'teacher', tenant_id: tenantId,
          teacher_id: teacherId, student_id: null, permissions: ['learning:read', 'learning:write', 'learning:read:students'],
        }
        const reconciliation = new ReconciliationService(db)
        const request = { schema_version: PHASE_2_SCHEMA_VERSION, assignment_id: assignmentId, submission_id: submissionId, limit: 10 }
        await Promise.all([
          reconciliation.reconcile(teacherActor, request),
          reconciliation.reconcile(teacherActor, request),
        ])
        const services = createPhase2Services(db)
        const firstAttempt = await db.collection('learning_attempts').findOne({ tenant_id: tenantId })
        const firstEvidence = await db.collection('evidence_events').findOne({ tenant_id: tenantId })
        const firstState = await db.collection('student_knowledge_states').findOne({ tenant_id: tenantId })
        assert.ok(firstAttempt && firstEvidence && firstState)
        assert.equal(firstEvidence.type, 'correct_answer')
        assert.equal(firstState.mastery, 0.636364)
        assert.equal(firstState.confidence, 0.255)
        assert.equal(firstState.limitations.includes('selected_response_only'), true)
        const firstEventCount = await db.collection('learning_events').countDocuments({ tenant_id: tenantId, type: { $ne: 'KNOWLEDGE_STATE_UPDATED' } })

        await reconciliation.reconcile(teacherActor, request)
        assert.equal(await db.collection('submissions').countDocuments({ id: submissionId }), 1)
        assert.equal(await db.collection('learning_attempts').countDocuments({ tenant_id: tenantId }), 1)
        assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: tenantId }), 1)
        assert.equal(await db.collection('student_knowledge_states').countDocuments({ tenant_id: tenantId }), 1)
        // Current refresh has a distinct explicit as_of; immutable domain events
        // remain canonical while each new projection time has its own audit.
        assert.equal(await db.collection('learning_events').countDocuments({ tenant_id: tenantId, type: { $ne: 'KNOWLEDGE_STATE_UPDATED' } }), firstEventCount)
        assert.equal((await db.collection('learning_attempts').findOne({ tenant_id: tenantId })).attempt_id, firstAttempt.attempt_id)
        assert.equal((await db.collection('evidence_events').findOne({ tenant_id: tenantId })).evidence_id, firstEvidence.evidence_id)
        assert.equal(
          (await db.collection('student_knowledge_states').findOne({ tenant_id: tenantId })).projection.input_set_hash,
          firstState.projection.input_set_hash,
        )
        const explanation = await services.explanations.explain(studentActor, studentId, competencyRef.competency_id)
        assert.equal(explanation.evidence_summary.active, 1)
        assert.equal(explanation.contributing_evidence[0].evidence_id, firstEvidence.evidence_id)
        assert.equal(explanation.limitations.includes('selected_response_only'), true)
      })
    } finally {
      await db.dropDatabase()
      await client.close()
    }
  })
}
