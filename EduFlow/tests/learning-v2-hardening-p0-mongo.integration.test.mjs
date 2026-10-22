import assert from 'node:assert/strict'
import test from 'node:test'
import { MongoClient } from 'mongodb'
import { seedP0, assessmentRequest, reachHint } from './helpers/hardening-p0-fixture.mjs'
import { ensureLearningV2Indexes } from '../lib/server/learning-v2/database/bootstrap.js'
import { projectKnowledgeState } from '../lib/server/learning-v2/knowledge-state/projection.js'
import { createPhase1Services } from '../lib/server/learning-v2/phase1-services.js'
import { ReconciliationService } from '../lib/server/learning-v2/reconciliation/reconciliation-service.js'
import { invalidateAutomaticEvidenceForTeacherOverride } from '../lib/server/learning-v2/integration/teacher-override-adapter.js'
import { deleteTeacherAccountData } from '../lib/server/account-deletion.js'
import { PERSONAL_TENANT_CHILDREN, deletionFencedDatabase } from '../lib/server/deletion-write-fence.js'
import { withTenantWrite } from '../lib/server/learning-v2/database/tenant-write.js'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'

const enabled = process.env.RUN_LEARNING_V2_MONGO_TESTS === '1'
function gate() { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
function afterOnce(object, method, predicate = () => true) {
  const original = object[method].bind(object); let fired = false
  object[method] = async (...args) => {
    const result = await original(...args)
    if (!fired && predicate(...args)) { fired = true; throw new Error(`P0 fault after ${method}`) }
    return result
  }
  return () => { assert.equal(fired, true); object[method] = original }
}
async function assertProjection(f) {
  const { evidence, sourceRevision } = await f.services.evidenceRepository.snapshotForCompetency(f.actor, f.studentId, f.competencyId)
  const expected = projectKnowledgeState({ tenantId: f.tenantId, studentId: f.studentId, competencyRef: f.competencyRef, evidence, now: f.now })
  const actual = await f.services.projectionRepository.find(f.actor, f.studentId, f.competencyId)
  for (const field of ['mastery', 'confidence', 'evidence_count', 'positive_count', 'negative_count']) assert.equal(actual[field], expected[field], field)
  assert.equal(actual.projection.input_set_hash, expected.projection.input_set_hash)
  assert.equal(actual.projection.source_revision, sourceRevision)
}

test('P0 hardening against an explicitly disposable real Mongo replica set', { skip: !enabled }, async (t) => {
  const base = process.env.LEARNING_V2_TEST_DB_NAME
  assert.match(base || '', /^eduflow_learning_v2_test_[a-z0-9_-]+$/)
  const url = new URL(process.env.MONGO_URL)
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'P0 tests require the disposable loopback instance')
  const client = new MongoClient(process.env.MONGO_URL)
  await client.connect()
  const db = client.db(`${base}_p0`)
  try {
    await ensureLearningV2Indexes(db)
    await t.test('R01 allowlist, assignment authority, solution restrictions, retired/draft/stale tasks', async () => {
      const f = await seedP0(db)
      const tasks = createPhase1Services(db).tasks
      const taskId = f.tasks[0].task_id
      const delivered = await tasks.get(f.student, taskId)
      assert.deepEqual(Object.keys(delivered).sort(), ['task_id', 'version', 'status', 'task_type', 'response_modality', 'objective_refs', 'content'].sort())
      assert.equal(delivered.source, undefined)
      assert.equal(JSON.stringify(delivered).includes('PRIVATE_EXPLANATION_CANARY'), false)
      assert.equal(JSON.stringify(delivered).includes('answer_index'), false)
      assert.equal(delivered.content.options.includes('HIDDEN_ANSWER_CANARY'), true, 'The answer option is visible, never identified as correct')
      assert.equal((await tasks.get(f.actor, taskId)).source.audit_snapshot.answer, 'HIDDEN_ANSWER_CANARY')
      await db.collection('assignments').updateOne({ id: f.assignment.id }, { $set: { show_solutions: false, feedback_mode: 'teacher_release' } })
      assert.deepEqual(await tasks.get(f.student, taskId), delivered)
      for (const status of ['draft', 'retired']) {
        await db.collection('learning_tasks').updateOne({ task_id: taskId }, { $set: { status } })
        await assert.rejects(tasks.get(f.student, taskId), { code: 'NOT_FOUND' })
      }
      await db.collection('learning_tasks').updateOne({ task_id: taskId }, { $set: { status: 'published' } })
      await db.collection('worksheets').updateOne({ id: f.worksheetId }, { $set: { 'content.questions.0.answer': 'Two' } })
      await assert.rejects(tasks.get(f.student, taskId), { code: 'NOT_FOUND' })
      await db.collection('classes').updateOne({ id: f.classId }, { $set: { enrolled_students: [] } })
      assert.equal((await tasks.list(f.student)).length, 0)
      const foreign = await seedP0(db)
      await assert.rejects(tasks.get(foreign.student, taskId), { code: 'NOT_FOUND' })
    })

    await t.test('R02 Explanation and teacher reconciliation use the same current target authority', async () => {
      const f = await seedP0(db); const foreign = await seedP0(db)
      const reconcile = new ReconciliationService(db)
      const request = { schema_version: 'learning-v2-phase2-v1', submission_id: f.submission.id }
      const explain = (actor = f.actor) => f.services.explanations.explain(actor, f.studentId, f.competencyId)
      await explain(); await explain(f.student)
      assert.equal((await reconcile.reconcile(f.actor, request)).failed, 0)
      for (const actor of [foreign.actor, { ...f.actor, teacher_id: foreign.teacherId, actor_id: foreign.teacherId }]) {
        await assert.rejects(explain(actor), { code: 'NOT_FOUND' })
        await assert.rejects(reconcile.reconcile(actor, request), { code: 'NOT_FOUND' })
      }
      const changes = [
        ['classes', { id: f.classId }, { enrolled_students: [] }, { enrolled_students: [{ student_id: f.studentId }] }],
        ['students', { id: f.studentId }, { status: 'disabled' }, { status: 'active' }],
        ['students', { id: f.studentId }, { status: 'deleted' }, { status: 'active' }],
        ['learning_v2_tenant_memberships', { actor_id: f.studentId }, { tenant_id: foreign.tenantId }, { tenant_id: f.tenantId }],
      ]
      for (const [name, filter, deny, restore] of changes) {
        await db.collection(name).updateOne(filter, { $set: deny })
        await assert.rejects(explain(), { code: 'NOT_FOUND' })
        await assert.rejects(reconcile.reconcile(f.actor, request), { code: 'NOT_FOUND' })
        await db.collection(name).updateOne(filter, { $set: restore })
      }
      await db.collection('learning_v2_tenant_memberships').insertOne({ actor_type: 'student', actor_id: f.studentId, tenant_id: foreign.tenantId, role: 'student', status: 'active' })
      await assert.rejects(explain(), { code: 'NOT_FOUND' })
      await assert.rejects(reconcile.reconcile(f.actor, request), { code: 'NOT_FOUND' })
    })

    for (const level of [1, 2, 3]) for (const winnerCorrect of [false, true]) {
      await t.test(`R05 Mongo L${level} ${winnerCorrect ? 'correct' : 'incorrect'} canonical retry survives persist/transition failure`, async () => {
        const f = await seedP0(db); const session = await reachHint(f, level)
        const original = f.services.sessions.transition.bind(f.services.sessions)
        f.services.sessions.transition = async () => { throw new Error('P0 transition fault') }
        const request = { schema_version: 'learning-v2-phase3-v1', selected_response: winnerCorrect ? 'HIDDEN_ANSWER_CANARY' : 'Two', idempotency_key: 'p0-first-answer' }
        await assert.rejects(f.services.tutor.retry(f.student, session.session_id, request), /P0 transition fault/)
        f.services.sessions.transition = original
        const before = await db.collection('learning_attempts').findOne({ tenant_id: f.tenantId, 'source.tutor_session_id': session.session_id, 'source.hint_level': level })
        const losing = { ...request, selected_response: winnerCorrect ? 'Two' : 'HIDDEN_ANSWER_CANARY', idempotency_key: 'p0-opposite-answer' }
        const replay = await f.services.tutor.retry(f.student, session.session_id, losing)
        assert.equal(replay.result.correctness, winnerCorrect ? 'correct' : 'incorrect')
        assert.deepEqual((await f.services.tutor.retry(f.student, session.session_id, losing)).result, replay.result)
        assert.deepEqual(await db.collection('learning_attempts').findOne({ attempt_id: before.attempt_id }), before)
        const terminal = await db.collection('evidence_events').find({ tenant_id: f.tenantId, tutor_terminal_slot: session.session_id }).toArray()
        assert.equal(terminal.length, winnerCorrect || level === 3 ? 1 : 0)
        if (terminal.length) {
          assert.equal(terminal[0].type, winnerCorrect ? 'correct_after_hint' : 'support_required')
          assert.equal(terminal[0].source.source_id, before.attempt_id)
          assert.equal(replay.session.outcome, terminal[0].type)
          await assertProjection(f)
        }
      })
    }
    await t.test('R05 concurrent opposite L3 answers cannot create two terminal Evidence types', async () => {
      const f = await seedP0(db); const session = await reachHint(f, 3)
      const results = await Promise.allSettled(['Two', 'HIDDEN_ANSWER_CANARY'].map((selected_response, i) => f.services.tutor.retry(f.student, session.session_id, {
        schema_version: 'learning-v2-phase3-v1', selected_response, idempotency_key: `p0-concurrent-${i}`,
      })))
      assert.ok(results.some((row) => row.status === 'fulfilled'))
      for (const row of results.filter((row) => row.status === 'rejected')) assert.equal(row.reason.code, 'CONFLICT')
      const attempts = await db.collection('learning_attempts').find({ tenant_id: f.tenantId, 'source.tutor_session_id': session.session_id, 'source.hint_level': 3 }).toArray()
      const terminal = await db.collection('evidence_events').find({ tenant_id: f.tenantId, tutor_terminal_slot: session.session_id }).toArray()
      assert.equal(attempts.length, 1); assert.equal(terminal.length, 1)
      assert.equal(terminal[0].type, attempts[0].outcome.correctness === 'correct' ? 'correct_after_hint' : 'support_required')
      assert.equal((await f.services.sessions.findForStudent(f.student, session.session_id)).outcome, terminal[0].type)
    })
    await t.test('R05 failure immediately after Attempt commit repairs its audit before deriving the terminal outcome', async () => {
      const f = await seedP0(db); const session = await reachHint(f, 3)
      const restore = afterOnce(f.services.attemptRepository, 'insertCanonical')
      const input = { schema_version: 'learning-v2-phase3-v1', selected_response: 'Two', idempotency_key: 'p0-commit-failure' }
      await assert.rejects(f.services.tutor.retry(f.student, session.session_id, input), /P0 fault/)
      restore()
      const result = await f.services.tutor.retry(f.student, session.session_id, { ...input, selected_response: 'HIDDEN_ANSWER_CANARY' })
      assert.equal(result.result.correctness, 'incorrect')
      assert.equal(result.session.outcome, 'support_required')
      const attempt = await db.collection('learning_attempts').findOne({ tenant_id: f.tenantId, 'source.tutor_session_id': session.session_id, 'source.hint_level': 3 })
      assert.equal(await db.collection('learning_events').countDocuments({ tenant_id: f.tenantId, type: 'ATTEMPT_RECORDED', 'payload.attempt_id': attempt.attempt_id }), 1)
      assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: f.tenantId, tutor_terminal_slot: session.session_id }), 1)
    })

    for (const mutation of ['addition', 'invalidation', 'ABA']) await t.test(`R03 source fence: old snapshot finishes after newer ${mutation}`, async () => {
      const f = await seedP0(db); const captured = gate(); const resume = gate()
      const repository = f.services.evidenceRepository
      const original = repository.snapshotForCompetency.bind(repository); let reads = 0
      repository.snapshotForCompetency = async (...args) => {
        const value = await original(...args)
        if (++reads === 1) { captured.resolve(); await resume.promise }
        return value
      }
      const stale = f.services.projection.rebuild(f.actor, f.studentId, f.competencyRef)
      await captured.promise
      const added = f.evidence(f.attempt(f.tasks[1]))
      if (mutation !== 'invalidation') await repository.insertCanonical(f.actor, added)
      if (mutation !== 'addition') await repository.invalidateOne(f.actor, mutation === 'ABA' ? added.evidence_id : f.initialEvidence.evidence_id,
        { reason: 'teacher_override', invalidated_at: f.now, invalidated_by: f.teacherId })
      const newest = await f.services.projection.rebuild(f.actor, f.studentId, f.competencyRef)
      resume.resolve(); await stale
      const replay = await f.services.projection.rebuild(f.actor, f.studentId, f.competencyRef)
      assert.deepEqual({ ...replay, _id: undefined }, { ...newest, _id: undefined })
      assert.ok(reads >= 4, 'stale writer reloads the authoritative snapshot')
      await assertProjection(f)
    })

    for (const boundary of ['invalidation', 'invalidation_event', 'replacement', 'replacement_event', 'projection', 'response']) {
      await t.test(`R04 correction recovers after durable ${boundary}`, async () => {
        const f = await seedP0(db); const s = f.services
        const first = await s.teacherLearning.recordAssessment(f.actor, f.studentId, assessmentRequest(f))
        const input = assessmentRequest(f, { claim: 'challenges', replaces_evidence_id: first.assessment.evidence_id, idempotency_key: 'p0-correction-request', note: 'P0 private note' })
        let restore
        if (boundary === 'invalidation') restore = afterOnce(s.evidenceRepository, 'invalidateOne')
        if (boundary === 'invalidation_event') restore = afterOnce(s.events, 'record', (_a, e) => e.type === 'EVIDENCE_INVALIDATED')
        if (boundary === 'replacement') restore = afterOnce(s.evidenceRepository, 'insertCanonical')
        if (boundary === 'replacement_event') restore = afterOnce(s.events, 'record', (_a, e) => e.type === 'TEACHER_ASSESSMENT_REPLACED')
        if (boundary === 'projection') restore = afterOnce(s.projectionRepository, 'replace')
        if (boundary === 'response') restore = afterOnce(s.teacherLearning, 'recordAssessment')
        await assert.rejects(s.teacherLearning.recordAssessment(f.actor, f.studentId, input), /P0 fault/)
        restore()
        const result = await s.teacherLearning.recordAssessment(f.actor, f.studentId, input)
        const old = await s.evidenceRepository.findById(f.actor, first.assessment.evidence_id)
        assert.equal(old.status, 'invalidated'); assert.equal(old.invalidation.replacement_evidence_id, result.assessment.evidence_id)
        const history = await db.collection('evidence_events').find({ tenant_id: f.tenantId }).sort({ evidence_id: 1 }).toArray()
        await s.teacherLearning.recordAssessment(f.actor, f.studentId, { ...input, idempotency_key: 'p0-different-replay-key' })
        assert.deepEqual(await db.collection('evidence_events').find({ tenant_id: f.tenantId }).sort({ evidence_id: 1 }).toArray(), history)
        for (const type of ['EVIDENCE_INVALIDATED', 'TEACHER_ASSESSMENT_REPLACED']) assert.equal(await db.collection('learning_events').countDocuments({ tenant_id: f.tenantId, type }), 1)
        await assertProjection(f)
        await assert.rejects(s.teacherLearning.recordAssessment(f.actor, f.studentId, { ...input, note: 'different correction' }), { code: 'CONFLICT' })
      })
    }
    await t.test('R04 automatic invalidation repairs an audit outage on unchanged replay; legacy override remains repairable', async () => {
      const f = await seedP0(db); const s = f.services
      await s.projection.rebuild(f.actor, f.studentId, f.competencyRef)
      const original = s.events.record.bind(s.events)
      s.events.record = async () => { throw new Error('audit outage') }
      const input = { schema_version: 'learning-v2-phase4-v1', reason: 'grading_error', idempotency_key: 'p0-invalidation-key' }
      await assert.rejects(s.teacherLearning.invalidateEvidence(f.actor, f.initialEvidence.evidence_id, input), /audit outage/)
      s.events.record = original
      await s.teacherLearning.invalidateEvidence(f.actor, f.initialEvidence.evidence_id, input)
      await assertProjection(f)
      await db.collection('submissions').updateOne({ id: f.submission.id }, { $set: { 'question_results.0.teacherOverride': true } })
      await invalidateAutomaticEvidenceForTeacherOverride({ db, actor: f.actor, submission: f.submission, questionId: f.questions[0].question_id, services: s, now: f.now })
      const reconciliation = await new ReconciliationService(db).reconcile(f.actor, { schema_version: 'learning-v2-phase2-v1', submission_id: f.submission.id })
      assert.equal(reconciliation.failed, 0)
      assert.equal(await db.collection('learning_events').countDocuments({ tenant_id: f.tenantId, type: 'EVIDENCE_INVALIDATED' }), 1)
      await assertProjection(f)
    })
    for (const boundary of ['invalidateOne', 'insertCanonical']) await t.test(`R04 pre-hardening correction receipt after ${boundary} resumes only with its original retry identity`, async () => {
      const f = await seedP0(db); const s = f.services
      const first = await s.teacherLearning.recordAssessment(f.actor, f.studentId, assessmentRequest(f))
      const input = assessmentRequest(f, { replaces_evidence_id: first.assessment.evidence_id, claim: 'challenges', idempotency_key: 'p0-legacy-correction-key' })
      const restore = afterOnce(s.evidenceRepository, boundary)
      await assert.rejects(s.teacherLearning.recordAssessment(f.actor, f.studentId, input), /P0 fault/)
      restore()
      await db.collection('evidence_events').updateOne({ evidence_id: first.assessment.evidence_id }, { $unset: { 'invalidation.replacement_request_hash': '' } })
      await assert.rejects(s.teacherLearning.recordAssessment(f.actor, f.studentId, { ...input, idempotency_key: 'p0-unknown-original-retry' }), { code: 'CONFLICT' })
      const replay = await s.teacherLearning.recordAssessment(f.actor, f.studentId, input)
      assert.equal(replay.assessment.claim, 'challenges')
      assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: f.tenantId, type: 'teacher_assessment' }), 2)
      assert.ok((await s.evidenceRepository.findById(f.actor, first.assessment.evidence_id)).invalidation.replacement_request_hash)
      await assertProjection(f)
    })

    for (const step of ['scope', ...PERSONAL_TENANT_CHILDREN, 'telemetry', 'legacy_children', 'legacy_parents', 'memberships', 'tenants', 'account']) {
      await t.test(`R07 personal-tenant deletion resumes after ${step}, with foreign survivors`, async () => {
        const f = await seedP0(db); const foreign = await seedP0(db)
        const legacy = ['comments', 'versions', 'shares', 'password_reset_tokens', 'generated_assets', 'studio_packages', 'dossiers']
        for (const fixture of [f, foreign]) {
          for (const name of ['learning_recommendations', 'tutor_sessions', 'tutor_policies']) {
            await db.collection(name).insertOne({ tenant_id: fixture.tenantId, student_id: fixture.studentId, status: 'completed', session_id: generateDomainId('ses') })
          }
          for (const name of legacy) await db.collection(name).insertOne({ id: `${fixture.suffix}-${name}`, user_id: fixture.teacherId, owner_id: fixture.teacherId, worksheet_id: fixture.worksheetId })
          await db.collection('students').updateOne({ id: fixture.studentId }, { $set: { enrolled_classes: [{ class_id: fixture.classId, teacher_id: fixture.teacherId }] } })
          await db.collection('learning_events').insertOne({ tenant_id: fixture.tenantId, event_id: generateDomainId('evt'), type: 'REFLECTION_SUBMITTED', idempotency_key: 'p0-reflection', payload: { reflection: { response_text: 'Private learner reflection' } } })
          await fixture.services.tutor.telemetry.record(fixture.student, { model_config: { model: 'synthetic' }, policy_ref: { version: 1 } }, { status: 'complete' })
        }
        const foreignCounts = new Map()
        for (const name of [...PERSONAL_TENANT_CHILDREN, 'learning_v2_tenant_memberships', 'learning_v2_tenants', 'ai_generations']) foreignCounts.set(name, await db.collection(name).countDocuments({ tenant_id: foreign.tenantId }))
        let fired = false
        await assert.rejects(deleteTeacherAccountData(db, f.teacherId, { afterStep: async (current) => { if (step === current) { fired = true; throw new Error('P0 deletion fault') } } }), /P0 deletion fault/)
        assert.equal(fired, true)
        if (step !== 'account') assert.deepEqual((await db.collection('users').findOne({ id: f.teacherId })).account_deletion.tenant_ids, [f.tenantId])
        await assert.rejects(f.services.tutor.telemetry.record(f.student, { model_config: {}, policy_ref: {} }, {}), { code: 'NOT_FOUND' })
        await deleteTeacherAccountData(db, f.teacherId)
        await deleteTeacherAccountData(db, f.teacherId)
        for (const name of [...PERSONAL_TENANT_CHILDREN, 'learning_v2_tenant_memberships', 'learning_v2_tenants', 'ai_generations']) {
          assert.equal(await db.collection(name).countDocuments({ tenant_id: f.tenantId }), 0, name)
          assert.equal(await db.collection(name).countDocuments({ tenant_id: foreign.tenantId }), foreignCounts.get(name), `${name} foreign survivor`)
        }
        for (const name of legacy) {
          assert.equal(await db.collection(name).countDocuments({ user_id: f.teacherId }), 0, name)
          assert.equal(await db.collection(name).countDocuments({ user_id: foreign.teacherId }), 1, `${name} foreign survivor`)
        }
        assert.deepEqual((await db.collection('students').findOne({ id: f.studentId })).enrolled_classes, [], 'Teacher deletion does not erase the learner account')
        assert.equal(await db.collection('users').countDocuments({ id: f.teacherId }), 0)
        assert.equal(await db.collection('submissions').countDocuments({ assignment_id: f.assignment.id }), 0)
        assert.equal(await db.collection('learning_attempts').countDocuments({ tenant_id: foreign.tenantId }), 1)
        assert.equal(await db.collection('users').countDocuments({ id: foreign.teacherId }), 1)
      })
    }
    await t.test('R07 an in-flight producer commits before the fence and is swept; post-fence producers fail closed', async () => {
      const f = await seedP0(db); const entered = gate(); const release = gate()
      const pending = withTenantWrite(db, f.student, async (session) => {
        entered.resolve(); await release.promise
        await db.collection('learning_events').insertOne({ tenant_id: f.tenantId, event_id: generateDomainId('evt'), idempotency_key: 'p0-inflight' }, { session })
      })
      await entered.promise
      const deletion = deleteTeacherAccountData(db, f.teacherId)
      release.resolve(); await pending; await deletion
      assert.equal(await db.collection('learning_events').countDocuments({ tenant_id: f.tenantId }), 0)
      await assert.rejects(f.services.attemptRepository.insertCanonical(f.student, f.attempt()), { code: 'NOT_FOUND' })
      await assert.rejects(deletionFencedDatabase(db).collection('worksheets').insertOne({ id: 'p0-late-sheet', user_id: f.teacherId }), { code: 'NOT_FOUND' })
      await assert.rejects(deletionFencedDatabase(db).collection('submissions').insertOne({ id: 'p0-late-submission', assignment_id: f.assignment.id, student_id: f.studentId }), { code: 'NOT_FOUND' })
      await assert.rejects(deletionFencedDatabase(db).collection('students').updateOne({ id: f.studentId }, { $push: { enrolled_classes: { class_id: f.classId, teacher_id: f.teacherId } } }), { code: 'NOT_FOUND' })
      for (const name of PERSONAL_TENANT_CHILDREN) await assert.rejects(deletionFencedDatabase(db).collection(name).insertOne({ tenant_id: f.tenantId }), { code: 'NOT_FOUND' })
    })
  } finally { await db.dropDatabase(); await client.close() }
})
