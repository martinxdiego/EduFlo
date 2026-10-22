import assert from 'node:assert/strict'
import test from 'node:test'
import { MongoClient } from 'mongodb'
import { seedP0, reachHint, assessmentRequest } from './helpers/hardening-p0-fixture.mjs'
import { ensureLearningV2Indexes } from '../lib/server/learning-v2/database/bootstrap.js'
import { ReconciliationService } from '../lib/server/learning-v2/reconciliation/reconciliation-service.js'
import { nextIndependentAttemptSlot } from '../lib/server/learning-v2/attempts/independent-slot.js'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'
import { processLegacySubmission } from '../lib/server/learning-v2/integration/legacy-submission-adapter.js'
import { allowTutorProviderForTest } from './helpers/tutor-runtime-gate.mjs'

const enabled = process.env.RUN_LEARNING_V2_MONGO_TESTS === '1'
const startInput = (f) => ({ schema_version: 'learning-v2-phase3-v1', submission_id: f.submission.id, question_index: 0 })
const hintInput = (key = 'p1a-hint') => ({ schema_version: 'learning-v2-phase3-v1', idempotency_key: key })
const retryInput = (f, key = 'p1a-retry') => ({ ...hintInput(key), selected_response: f.questions[0].answer })
function gate() { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
function afterOnce(object, method, predicate = () => true) {
  const original = object[method].bind(object); let fired = false
  object[method] = async (...args) => { const result = await original(...args); if (!fired && predicate(...args)) { fired = true; throw new Error('P1A durable fault') } return result }
  return () => { object[method] = original; assert.equal(fired, true) }
}

test('P1-A lifecycle, receipts and rebuild against a disposable transaction-capable Mongo', { skip: !enabled }, async (t) => {
  const base = process.env.LEARNING_V2_TEST_DB_NAME
  assert.match(base || '', /^eduflow_learning_v2_test_[a-z0-9_-]+$/)
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(process.env.MONGO_URL).hostname))
  const client = new MongoClient(process.env.MONGO_URL); await client.connect()
  const db = client.db(`${base}_p1a`)
  try {
    await ensureLearningV2Indexes(db)
    for (const change of ['binding', 'assignment', 'enrollment', 'membership', 'policy', 'task', 'source']) await t.test(`H07 current ${change} revocation stops existing sessions without erasing facts`, async () => {
      const f = await seedP0(db); const session = await reachHint(f, 1)
      const before = await db.collection('learning_attempts').find({ tenant_id: f.tenantId }).toArray()
      if (change === 'binding') await f.services.assignments.disable(f.actor, f.assignment.id)
      if (change === 'assignment') await db.collection('assignments').updateOne({ id: f.assignment.id }, { $set: { status: 'closed' } })
      if (change === 'enrollment') await db.collection('classes').updateOne({ id: f.classId }, { $set: { enrolled_students: [] } })
      if (change === 'membership') await db.collection('learning_v2_tenant_memberships').updateOne({ actor_id: f.studentId }, { $set: { tenant_id: generateDomainId('ten') } })
      if (change === 'policy') await f.services.policies.configure(f.actor, f.assignment.id, { schema_version: 'learning-v2-phase3-v1', preset: 'GUIDED_TUTOR' })
      if (change === 'task') await db.collection('learning_tasks').updateOne({ task_id: f.tasks[0].task_id }, { $set: { status: 'retired' } })
      if (change === 'source') await db.collection('worksheets').updateOne({ id: f.worksheetId }, { $set: { 'content.questions.0.question': 'changed' } })
      await assert.rejects(f.services.tutor.start(f.student, startInput(f)), { code: 'NOT_FOUND' })
      await assert.rejects(f.services.tutor.get(f.student, session.session_id), { code: 'NOT_FOUND' })
      await assert.rejects(f.services.tutor.hint(f.student, session.session_id, hintInput()), { code: 'NOT_FOUND' })
      await assert.rejects(f.services.tutor.retry(f.student, session.session_id, retryInput(f)), { code: 'NOT_FOUND' })
      assert.deepEqual(await db.collection('learning_attempts').find({ tenant_id: f.tenantId }).toArray(), before)
      assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: f.tenantId }), 1)
    })
    await t.test('H07 expired active slot is closed before a new trigger can start; old facts stay readable', async () => {
      const f = await seedP0(db); const session = await reachHint(f, 1)
      await db.collection('tutor_sessions').updateOne({ session_id: session.session_id }, { $set: { expires_at: new Date(f.now.getTime() - 1) } })
      await assert.rejects(f.services.tutor.start(f.student, startInput(f)), { code: 'CONFLICT' })
      assert.equal(await db.collection('tutor_sessions').countDocuments({ tenant_id: f.tenantId, status: 'active' }), 0)
      const later = { ...structuredClone(f.initialAttempt), attempt_id: generateDomainId('att'), idempotency_key: 'p1a-later-trigger',
        source: { ...f.initialAttempt.source, submission_id: `${f.submission.id}-later`, learning_v2_attempt_no: 2 }, attempt_no: 2 }
      await f.services.attemptRepository.insertCanonical(f.student, later)
      const fresh = await f.services.tutor.start(f.student, { ...startInput(f), submission_id: later.source.submission_id })
      assert.notEqual(fresh.session_id, session.session_id)
      assert.equal((await f.services.tutor.get(f.student, session.session_id)).status, 'completed')
    })
    await t.test('H07 an old active session without a revision cannot establish current interaction authority', async () => {
      const f = await seedP0(db); const session = await reachHint(f, 1)
      await db.collection('tutor_sessions').updateOne({ session_id: session.session_id }, { $unset: { assignment_revision: '' } })
      await assert.rejects(f.services.tutor.start(f.student, startInput(f)), { code: 'NOT_FOUND' })
      await assert.rejects(f.services.tutor.hint(f.student, session.session_id, hintInput()), { code: 'NOT_FOUND' })
      assert.equal(await db.collection('learning_attempts').countDocuments({ tenant_id: f.tenantId }), 1)
    })
    await t.test('H07 concurrent configuration uses assignment revision CAS', async () => {
      const f = await seedP0(db); const original = f.services.policyRepository.createSnapshot.bind(f.services.policyRepository)
      const both = gate(); let entered = 0
      f.services.policyRepository.createSnapshot = async (...args) => { const value = await original(...args); if (++entered === 2) both.resolve(); await both.promise; return value }
      const outcomes = await Promise.allSettled(['LOCAL_HINTS', 'GUIDED_TUTOR'].map((preset) => f.services.policies.configure(f.actor, f.assignment.id, { schema_version: 'learning-v2-phase3-v1', preset })))
      assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 1)
      assert.equal(outcomes.find((item) => item.status === 'rejected').reason.code, 'CONFLICT')
      const versions = await db.collection('tutor_policies').find({ tenant_id: f.tenantId }).toArray()
      assert.equal(new Set(versions.map((item) => item.policy_version)).size, 2)
    })
    await t.test('H07 revocation while a provider is pending fences hint persistence', async () => {
      const f = await seedP0(db)
      await f.services.policies.configure(f.actor, f.assignment.id, { schema_version: 'learning-v2-phase3-v1', preset: 'GUIDED_TUTOR' })
      f.services.tutor.runtimeApprovalGate = allowTutorProviderForTest()
      const session = await f.services.tutor.start(f.student, startInput(f)); const entered = gate(); const release = gate()
      f.services.tutor.provider = { available: () => true, async generate(_context, options) { await options.beforeTransport(); entered.resolve(); await release.promise; throw new Error('synthetic fallback') } }
      const pending = f.services.tutor.hint(f.student, session.session_id, hintInput())
      await entered.promise; await f.services.assignments.disable(f.actor, f.assignment.id); release.resolve()
      await assert.rejects(pending, { code: 'NOT_FOUND' })
      assert.equal((await db.collection('tutor_sessions').findOne({ session_id: session.session_id })).hint_count, 0)
    })
    await t.test('H07 deleting/recreating a legacy submission cannot reuse its immutable independent slot', async () => {
      const f = await seedP0(db); await db.collection('submissions').deleteOne({ id: f.submission.id })
      assert.equal(await nextIndependentAttemptSlot(db, f.student, f.assignment.id), 2)
      const duplicate = { ...structuredClone(f.initialAttempt), attempt_id: generateDomainId('att'), idempotency_key: 'p1a-reused-slot', source: { ...f.initialAttempt.source, submission_id: 'new-submission' } }
      await assert.rejects(f.services.attemptRepository.insertCanonical(f.student, duplicate), { code: 'CONFLICT' })
    })
    await t.test('H08 same-hash semantic corruption and missing version metadata are repaired', async () => {
      const f = await seedP0(db); const service = f.services.projection
      const expected = await service.rebuild(f.actor, f.studentId, f.competencyRef)
      await db.collection('student_knowledge_states').updateOne({ tenant_id: f.tenantId }, { $set: { mastery: 0.99, confidence: 0.99 }, $unset: { 'projection.coefficient_set_version': '', 'projection.policy_version': '' } })
      const repaired = await service.rebuild(f.actor, f.studentId, f.competencyRef)
      assert.equal(repaired.mastery, expected.mastery); assert.equal(repaired.confidence, expected.confidence)
      assert.equal(repaired.projection.policy_version, expected.projection.policy_version)
      const teacher = await f.services.teacherLearning.recordAssessment(f.actor, f.studentId, assessmentRequest(f))
      assert.equal((await service.rebuild(f.actor, f.studentId, f.competencyRef)).projection.configuration_id, 'teacher-assessment-v1')
      await f.services.teacherLearning.invalidateEvidence(f.actor, teacher.assessment.evidence_id, { schema_version: 'learning-v2-phase4-v1', reason: 'entered_in_error', idempotency_key: 'p1a-remove-teacher' })
      assert.equal((await service.rebuild(f.actor, f.studentId, f.competencyRef)).projection.configuration_id, 'selected-response-v1')
    })
    for (const boundary of ['policy', 'session', 'event']) await t.test(`H09 start repairs after ${boundary}`, async () => {
      const f = await seedP0(db)
      const restore = boundary === 'policy' ? afterOnce(f.services.policyRepository, 'createSnapshot') : boundary === 'session' ? afterOnce(f.services.sessions, 'insertActive') : afterOnce(f.services.events, 'record', (_a, e) => e.type === 'TUTOR_SESSION_STARTED')
      await assert.rejects(f.services.tutor.start(f.student, startInput(f)), /P1A durable fault/); restore()
      await f.services.tutor.start(f.student, startInput(f))
      assert.equal(await db.collection('tutor_sessions').countDocuments({ tenant_id: f.tenantId }), 1)
      assert.equal(await db.collection('learning_events').countDocuments({ tenant_id: f.tenantId, type: 'TUTOR_SESSION_STARTED' }), 1)
    })
    await t.test('H09 a later-clock projection cannot displace an unrepaired audit receipt', async () => {
      const f = await seedP0(db); const service = f.services.projection
      const original = f.services.events.record.bind(f.services.events)
      f.services.events.record = async () => { throw new Error('audit offline') }
      await assert.rejects(service.rebuild(f.actor, f.studentId, f.competencyRef), /audit offline/)
      const first = await db.collection('student_knowledge_states').findOne({ tenant_id: f.tenantId })
      service.now = () => new Date(f.now.getTime() + 86400000)
      await assert.rejects(service.rebuild(f.actor, f.studentId, f.competencyRef), /audit offline/)
      assert.deepEqual((await db.collection('student_knowledge_states').findOne({ tenant_id: f.tenantId })).projection, first.projection)
      f.services.events.record = original
      await service.rebuild(f.actor, f.studentId, f.competencyRef)
      const events = await db.collection('learning_events').find({ tenant_id: f.tenantId, type: 'KNOWLEDGE_STATE_UPDATED' }).toArray()
      assert.equal(events.length, 2)
      assert.ok(events.some((item) => item.payload.as_of.getTime() === f.now.getTime()))
    })
    await t.test('H09 semantic event identity rejects a different payload instead of creating a second event', async () => {
      const f = await seedP0(db)
      const request = { type: 'LEGACY_SUBMISSION_GRADED', aggregate: { type: 'legacy_submission', id: f.submission.id },
        correlationId: f.submission.id, payload: { submission_id: f.submission.id, grading_revision: 1 } }
      const first = await f.services.events.record(f.actor, request)
      assert.equal((await f.services.events.record(f.actor, request)).event_id, first.event_id)
      await assert.rejects(f.services.events.record(f.actor, { ...request, payload: { ...request.payload, grading_revision: 2 } }), { code: 'CONFLICT' })
      assert.equal(await db.collection('learning_events').countDocuments({ tenant_id: f.tenantId }), 1)
    })
    await t.test('H09 older hint/retry receipts remain replayable after later levels and repair missing chronology', async () => {
      const f = await seedP0(db); const session = await reachHint(f, 3)
      const hint = await f.services.tutor.hint(f.student, session.session_id, hintInput('p0-hint-1'))
      const retry = await f.services.tutor.retry(f.student, session.session_id, { ...retryInput(f, 'p0-retry-1'), selected_response: f.questions[0].answer })
      assert.equal(hint.hint.hint_level, 1); assert.equal(retry.result.correctness, 'incorrect')
      const before = await db.collection('learning_events').find({ tenant_id: f.tenantId, 'aggregate.type': 'tutor_session' }).toArray()
      await db.collection('learning_events').deleteMany({ tenant_id: f.tenantId, type: { $in: ['HINT_GIVEN', 'RETRY_SUBMITTED'] } })
      await f.services.tutor.get(f.student, session.session_id)
      assert.equal(await db.collection('learning_events').countDocuments({ tenant_id: f.tenantId, 'aggregate.type': 'tutor_session' }), before.length)
      assert.equal(await db.collection('learning_attempts').countDocuments({ tenant_id: f.tenantId }), 3)
    })
    for (const boundary of ['transition', 'HINT_REQUESTED', 'TUTOR_DECIDED', 'TUTOR_FALLBACK', 'HINT_GIVEN']) await t.test(`H09 hint receipt repairs after ${boundary}`, async () => {
      const f = await seedP0(db); const session = await f.services.tutor.start(f.student, startInput(f))
      const restore = boundary === 'transition' ? afterOnce(f.services.sessions, 'transition') : afterOnce(f.services.events, 'record', (_a, e) => e.type === boundary)
      const interrupted = f.services.tutor.hint(f.student, session.session_id, hintInput())
      if (boundary === 'transition') assert.equal((await interrupted).hint.hint_level, 1)
      else await assert.rejects(interrupted, /P1A durable fault/)
      restore()
      const replay = await f.services.tutor.hint(f.student, session.session_id, hintInput())
      assert.equal(replay.hint.hint_level, 1)
      for (const type of ['HINT_REQUESTED', 'TUTOR_DECIDED', 'TUTOR_FALLBACK', 'HINT_GIVEN']) assert.equal(await db.collection('learning_events').countDocuments({ tenant_id: f.tenantId, type }), 1)
    })
    for (const boundary of ['ATTEMPT_RECORDED', 'EVIDENCE_RECORDED', 'KNOWLEDGE_STATE_UPDATED', 'transition', 'RETRY_SUBMITTED', 'TUTOR_SESSION_COMPLETED']) await t.test(`H09 retry receipt repairs after ${boundary}`, async () => {
      const f = await seedP0(db); const session = await reachHint(f, 1)
      const restore = boundary === 'transition' ? afterOnce(f.services.sessions, 'transition') : afterOnce(f.services.events, 'record', (_a, e) => e.type === boundary)
      const interrupted = f.services.tutor.retry(f.student, session.session_id, retryInput(f))
      if (boundary === 'transition') assert.equal((await interrupted).result.correctness, 'correct')
      else await assert.rejects(interrupted, /P1A durable fault/)
      restore()
      await f.services.tutor.retry(f.student, session.session_id, retryInput(f))
      assert.equal(await db.collection('learning_events').countDocuments({ tenant_id: f.tenantId, type: 'RETRY_SUBMITTED' }), 1)
      assert.equal(await db.collection('learning_events').countDocuments({ tenant_id: f.tenantId, type: 'TUTOR_SESSION_COMPLETED' }), 1)
    })
    for (const boundary of ['REFLECTION_REQUESTED', 'REFLECTION_SUBMITTED', 'transition', 'TUTOR_SESSION_COMPLETED']) await t.test(`H09 Reflection repairs after ${boundary} without learning Evidence`, async () => {
      const f = await seedP0(db); f.services.tutor.phase3bEnabled = true
      const session = await reachHint(f, 2)
      const submission = { schema_version: 'learning-v2-phase3b-v1', response_text: 'Ich habe die entscheidende Regel übersehen.', idempotency_key: 'p1a-reflection' }
      if (boundary === 'REFLECTION_REQUESTED') {
        const restore = afterOnce(f.services.events, 'record', (_a, e) => e.type === boundary)
        await assert.rejects(f.services.tutor.retry(f.student, session.session_id, retryInput(f)), /P1A durable fault/); restore()
        await f.services.tutor.retry(f.student, session.session_id, retryInput(f))
      } else {
        await f.services.tutor.retry(f.student, session.session_id, retryInput(f))
        const restore = boundary === 'transition' ? afterOnce(f.services.sessions, 'transition') : afterOnce(f.services.events, 'record', (_a, e) => e.type === boundary)
        const interrupted = f.services.tutor.reflect(f.student, session.session_id, submission)
        if (boundary === 'transition') assert.equal((await interrupted).reflection.status, 'submitted')
        else await assert.rejects(interrupted, /P1A durable fault/)
        restore()
      }
      const before = await db.collection('evidence_events').find({ tenant_id: f.tenantId }).toArray()
      await f.services.tutor.reflect(f.student, session.session_id, submission)
      await f.services.tutor.get(f.student, session.session_id)
      assert.deepEqual(await db.collection('evidence_events').find({ tenant_id: f.tenantId }).toArray(), before)
      for (const type of ['REFLECTION_REQUESTED', 'REFLECTION_SUBMITTED', 'TUTOR_SESSION_COMPLETED']) assert.equal(await db.collection('learning_events').countDocuments({ tenant_id: f.tenantId, type }), 1)
    })
    for (const boundary of ['evidence', 'event', 'projection']) await t.test(`H09 teacher assessment creation repairs after ${boundary} and rejects changed payload`, async () => {
      const f = await seedP0(db); const input = assessmentRequest(f)
      const restore = boundary === 'evidence' ? afterOnce(f.services.evidenceRepository, 'insertCanonical') : boundary === 'projection' ? afterOnce(f.services.projectionRepository, 'replace') : afterOnce(f.services.events, 'record', (_a, e) => e.type === 'TEACHER_ASSESSMENT_RECORDED')
      await assert.rejects(f.services.teacherLearning.recordAssessment(f.actor, f.studentId, input), /P1A durable fault/); restore()
      await f.services.teacherLearning.recordAssessment(f.actor, f.studentId, input)
      await assert.rejects(f.services.teacherLearning.recordAssessment(f.actor, f.studentId, { ...input, note: 'different observation' }), { code: 'CONFLICT' })
      assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: f.tenantId, type: 'teacher_assessment' }), 1)
    })
    await t.test('H09 bounded reconciliation cursor progresses beyond oldest page and can replay a page', async () => {
      const f = await seedP0(db)
      const { _id, ...submission } = f.submission
      for (let i = 2; i <= 4; i++) await db.collection('submissions').insertOne({ ...structuredClone(submission), id: `${f.submission.id}-${i}`, learning_v2_attempt_no: i, learning_v2_submission_intent_id: `p1a-intent-${i}` })
      const service = new ReconciliationService(db); const input = { schema_version: 'learning-v2-phase2-v1', assignment_id: f.assignment.id, limit: 1 }
      let page = await service.reconcile(f.actor, input); let scanned = page.scanned; let count = 1
      assert.equal(page.failed, 0)
      while (page.next_cursor) { assert.ok(count++ < 6); page = await service.reconcile(f.actor, { ...input, cursor: page.next_cursor }); scanned += page.scanned; assert.equal(page.failed, 0) }
      assert.equal(scanned, 4); assert.equal(page.complete, true)
      assert.equal((await service.reconcile(f.actor, input)).failed, 0)
      assert.equal(await db.collection('learning_attempts').countDocuments({ tenant_id: f.tenantId, 'source.kind': 'legacy_submission_question' }), 4)
    })
    for (const historicalAudit of [false, true]) await t.test(`H09 multi-question submission keeps per-attempt audit identity (historical audit: ${historicalAudit})`, async () => {
      const f = await seedP0(db)
      const submission = { ...f.submission, learning_v2_task_pins: f.assignment.learning_v2.task_pins,
        question_results: f.tasks.map((task) => ({ ...f.submission.question_results[0],
          questionId: task.source.question_id, contentHash: task.source.content_hash })) }
      const firstEvent = { type: 'ATTEMPT_RECORDED', aggregate: { type: 'legacy_submission', id: submission.id },
        correlationId: submission.id, causationId: submission.id, occurredAt: submission.submitted_at,
        payload: { attempt_id: f.initialAttempt.attempt_id, question_id: f.questions[0].question_id } }
      const historical = historicalAudit ? await f.services.events.record(f.actor, { ...firstEvent,
        idempotencyParts: ['ATTEMPT_RECORDED', 'legacy_submission', submission.id, 'once'] }) : null
      const process = () => processLegacySubmission({ db, actor: f.actor, assignment: f.assignment,
        worksheet: { id: f.worksheetId }, submission, services: f.services })
      assert.equal((await process()).processed, 3)
      await Promise.all([process(), process()])
      assert.equal(await db.collection('learning_attempts').countDocuments({ tenant_id: f.tenantId }), 3)
      assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: f.tenantId }), 3)
      const events = await db.collection('learning_events').find({ tenant_id: f.tenantId, type: 'ATTEMPT_RECORDED' }).toArray()
      assert.equal(events.length, 3)
      assert.equal(new Set(events.map((event) => event.payload.attempt_id)).size, 3)
      if (historical) assert.equal(events.find((event) => event.payload.attempt_id === f.initialAttempt.attempt_id).event_id, historical.event_id)
      await assert.rejects(f.services.events.record(f.actor, { ...firstEvent,
        payload: { ...firstEvent.payload, question_id: f.questions[1].question_id } }), { code: 'CONFLICT' })
    })
    for (const boundary of ['LEGACY_SUBMISSION_GRADED', 'attempt', 'ATTEMPT_RECORDED', 'evidence', 'EVIDENCE_RECORDED', 'projection', 'KNOWLEDGE_STATE_UPDATED']) await t.test(`H09 legacy replay repairs after ${boundary}`, async () => {
      const f = await seedP0(db)
      const { _id, ...prior } = f.submission
      const submission = { ...prior, id: `${prior.id}-new`, learning_v2_attempt_no: 2, learning_v2_submission_intent_id: 'p1a-legacy-new-slot' }
      await db.collection('submissions').insertOne(submission)
      const restore = boundary === 'attempt' ? afterOnce(f.services.attemptRepository, 'insertCanonical')
        : boundary === 'evidence' ? afterOnce(f.services.evidenceRepository, 'insertCanonical')
          : boundary === 'projection' ? afterOnce(f.services.projectionRepository, 'replace')
            : afterOnce(f.services.events, 'record', (_a, event) => event.type === boundary)
      const process = () => processLegacySubmission({ db, actor: f.actor, assignment: f.assignment, worksheet: { id: f.worksheetId }, submission, services: f.services })
      await assert.rejects(process(), /P1A durable fault/); restore()
      await process(); await process()
      assert.equal(await db.collection('learning_attempts').countDocuments({ tenant_id: f.tenantId }), 2)
      assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: f.tenantId }), 2)
      for (const type of ['LEGACY_SUBMISSION_GRADED', 'ATTEMPT_RECORDED', 'EVIDENCE_RECORDED', 'KNOWLEDGE_STATE_UPDATED']) assert.equal(await db.collection('learning_events').countDocuments({ tenant_id: f.tenantId, type }), 1)
    })
  } finally { await db.dropDatabase(); await client.close() }
})
