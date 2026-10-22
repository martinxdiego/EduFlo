import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { MongoClient } from 'mongodb'
import { seedP0 } from './helpers/hardening-p0-fixture.mjs'
import { projectionComparable } from '../lib/server/learning-v2/knowledge-state/projection.js'
import {
  PHASE_3_SCHEMA_VERSION,
  TUTOR_ACTION_BY_LEVEL,
  TUTOR_PROVIDER_SCHEMA_VERSION,
  TUTOR_REASON_BY_LEVEL,
} from '../lib/server/learning-v2/contracts/phase3.js'
import { allowTutorProviderForTest } from './helpers/tutor-runtime-gate.mjs'

const enabled = process.env.RUN_LEARNING_V2_MONGO_TESTS === '1'
const hintInput = (key) => ({ schema_version: PHASE_3_SCHEMA_VERSION, idempotency_key: key })

function gate() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function candidate(level, message = 'Welche Information bestimmt deinen nächsten Schritt?') {
  return {
    schema_version: TUTOR_PROVIDER_SCHEMA_VERSION,
    action: TUTOR_ACTION_BY_LEVEL[level], hint_level: level, learner_message: message,
    reason_code: TUTOR_REASON_BY_LEVEL[level], teacher_attention: false,
  }
}

async function guidedFixture(db) {
  const fixture = await seedP0(db)
  fixture.services.tutor.runtimeApprovalGate = allowTutorProviderForTest()
  await fixture.services.policies.configure(fixture.actor, fixture.assignment.id, {
    schema_version: PHASE_3_SCHEMA_VERSION, preset: 'GUIDED_TUTOR',
  })
  const session = await fixture.services.tutor.start(fixture.student, {
    schema_version: PHASE_3_SCHEMA_VERSION, submission_id: fixture.submission.id, question_index: 0,
  })
  let providerBudget = 0
  fixture.services.tutor.rateLimiter = {
    async consumeHint() { return true },
    async consumeProviderCall() { providerBudget += 1; return true },
  }
  fixture.services.tutor.telemetry = { async record() {} }
  return { fixture, session, providerBudget: () => providerBudget }
}

async function storedSession(db, sessionId) {
  return db.collection('tutor_sessions').findOne({ session_id: sessionId })
}

test('H14-A provider slot/lease invariants hold against a disposable Mongo replica set', { skip: !enabled }, async (t) => {
  const databaseName = process.env.LEARNING_V2_TEST_DB_NAME
  assert.match(databaseName || '', /^eduflow_learning_v2_test_[a-z0-9_-]+$/)
  const url = new URL(process.env.MONGO_URL)
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname))
  const client = new MongoClient(process.env.MONGO_URL)
  await client.connect()
  const db = client.db(databaseName)
  try {
    await t.test('same idempotency key converges with exactly one provider transport and one receipt', async () => {
      const { fixture: f, session, providerBudget } = await guidedFixture(db)
      let calls = 0
      f.services.tutor.provider = { available: () => true, async generate(context, options) {
        await options.beforeTransport(); calls += 1
        await new Promise((resolve) => setTimeout(resolve, 50))
        return { candidate: candidate(context.decision.hint_level), usage: { input_tokens: 1, output_tokens: 1 } }
      } }
      const [first, second] = await Promise.all([
        f.services.tutor.hint(f.student, session.session_id, hintInput('h14a-same-key')),
        f.services.tutor.hint(f.student, session.session_id, hintInput('h14a-same-key')),
      ])
      assert.deepEqual(second.hint, first.hint)
      assert.equal(calls, 1)
      assert.equal(providerBudget(), 1)
      const stored = await storedSession(db, session.session_id)
      assert.equal(stored.hint_receipts.length, 1)
      assert.equal(stored.provider_slots.level_1.status, 'completed')
      assert.equal(stored.provider_slots.level_1.reservation_count, 1)
      assert.equal(stored.provider_slots.level_1.transport_count, 1)
      await f.services.tutor.hint(f.student, session.session_id, hintInput('h14a-same-key'))
      assert.equal(calls, 1, 'successful replay must not start another transport')
    })

    await t.test('different request keys never create a competing fallback while the provider slot is leased', async () => {
      const { fixture: f, session } = await guidedFixture(db)
      const entered = gate(); const release = gate(); let calls = 0
      f.services.tutor.provider = { available: () => true, async generate(context, options) {
        await options.beforeTransport(); calls += 1; entered.resolve(); await release.promise
        return { candidate: candidate(context.decision.hint_level) }
      } }
      const owner = f.services.tutor.hint(f.student, session.session_id, hintInput('h14a-owner-key'))
      await entered.promise
      await assert.rejects(f.services.tutor.hint(f.student, session.session_id, hintInput('h14a-loser-key')), { code: 'OPERATION_IN_PROGRESS' })
      assert.equal((await storedSession(db, session.session_id)).hint_count, 0)
      release.resolve(); await owner
      assert.equal(calls, 1)
      assert.equal((await storedSession(db, session.session_id)).hint_receipts.length, 1)
    })

    await t.test('crash after reservation is recoverable only after lease expiry', async () => {
      const { fixture: f, session } = await guidedFixture(db)
      let crash = true; let calls = 0
      f.services.tutor.afterProviderSlotReserved = async () => { if (crash) { crash = false; throw new Error('synthetic crash after reservation') } }
      f.services.tutor.provider = { available: () => true, async generate(context, options) { await options.beforeTransport(); calls += 1; return { candidate: candidate(context.decision.hint_level) } } }
      await assert.rejects(f.services.tutor.hint(f.student, session.session_id, hintInput('h14a-crash-owner')), /synthetic crash/u)
      let stored = await storedSession(db, session.session_id)
      assert.equal(stored.provider_slots.level_1.status, 'reserved')
      assert.equal(stored.provider_slots.level_1.reservation_count, 1)
      assert.equal(stored.provider_slots.level_1.transport_count, 0)
      await assert.rejects(f.services.tutor.hint(f.student, session.session_id, hintInput('h14a-before-expiry')), { code: 'OPERATION_IN_PROGRESS' })
      await db.collection('tutor_sessions').updateOne({ session_id: session.session_id }, { $set: { 'provider_slots.level_1.lease_expires_at': new Date(f.now.getTime() - 1) } })
      await f.services.tutor.hint(f.student, session.session_id, hintInput('h14a-takeover'))
      stored = await storedSession(db, session.session_id)
      assert.equal(calls, 1)
      assert.equal(stored.provider_slots.level_1.status, 'completed')
      assert.equal(stored.provider_slots.level_1.reservation_count, 2)
      assert.equal(stored.provider_slots.level_1.transport_count, 1)
    })

    await t.test('reached provider plus expired transport fence recovers locally with no second HTTP request and stable replay', async () => {
      const { fixture: f, session } = await guidedFixture(db)
      const providerReached = gate(); const releaseOldOwner = gate(); let httpRequests = 0
      const server = http.createServer((request, response) => {
        httpRequests += 1; request.resume(); response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{}')
      })
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
      const { port } = server.address()
      const projectedBefore = await f.services.projection.rebuild(f.actor, f.studentId, f.competencyRef)
      const attemptsBefore = await db.collection('learning_attempts').countDocuments({ tenant_id: f.tenantId })
      const evidenceBefore = await db.collection('evidence_events').countDocuments({ tenant_id: f.tenantId })
      const stateBefore = await db.collection('student_knowledge_states').findOne({
        tenant_id: f.tenantId, student_id: f.studentId, competency_id: f.competencyRef.competency_id,
      })
      try {
        f.services.tutor.provider = { available: () => true, async generate(context, options) {
          await options.beforeTransport()
          const response = await fetch(`http://127.0.0.1:${port}/synthetic-provider`, { method: 'POST', body: '{}' })
          await response.text(); providerReached.resolve(); await releaseOldOwner.promise
          return { candidate: candidate(context.decision.hint_level, 'Verspäteter synthetischer Providertext') }
        } }
        const oldOwner = f.services.tutor.hint(f.student, session.session_id, hintInput('h14a-ambiguous-old-owner'))
        await providerReached.promise
        await db.collection('tutor_sessions').updateOne({ session_id: session.session_id }, {
          $set: { 'provider_slots.level_1.lease_expires_at': new Date(f.now.getTime() - 1) },
        })
        const recovered = await f.services.tutor.hint(f.student, session.session_id, hintInput('h14a-ambiguous-recovery'))
        releaseOldOwner.resolve()
        const late = await oldOwner
        const replay = await f.services.tutor.hint(f.student, session.session_id, hintInput('h14a-ambiguous-recovery'))
        assert.deepEqual(late.hint, recovered.hint)
        assert.deepEqual(replay.hint, recovered.hint)
        assert.equal(httpRequests, 1)
        const stored = await storedSession(db, session.session_id)
        assert.equal(stored.hint_count, 1)
        assert.equal(stored.hint_receipts.length, 1)
        assert.equal(stored.last_hint.source, 'local')
        assert.equal(stored.last_hint.fallback_code, 'AMBIGUOUS_TRANSPORT_LOCAL_FALLBACK')
        assert.equal(stored.provider_slots.level_1.reservation_count, 2)
        assert.equal(stored.provider_slots.level_1.transport_count, 1)
        assert.equal(stored.provider_slots.level_1.outcome_code, 'LOCAL_FALLBACK')
        assert.equal(stored.provider_slots.level_1.error_code, 'AMBIGUOUS_TRANSPORT_LOCAL_FALLBACK')
        assert.equal(await db.collection('learning_attempts').countDocuments({ tenant_id: f.tenantId }), attemptsBefore)
        assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: f.tenantId }), evidenceBefore)
        const stateAfter = await db.collection('student_knowledge_states').findOne({
          tenant_id: f.tenantId, student_id: f.studentId, competency_id: f.competencyRef.competency_id,
        })
        assert.deepEqual(stateAfter, stateBefore)
        const rebuilt = await f.services.projection.rebuild(f.actor, f.studentId, f.competencyRef)
        assert.deepEqual(projectionComparable(rebuilt), projectionComparable(projectedBefore))
        assert.equal(await db.collection('learning_events').countDocuments({
          tenant_id: f.tenantId, 'aggregate.id': session.session_id, type: 'HINT_GIVEN',
        }), 1)
      } finally {
        releaseOldOwner.resolve()
        server.closeAllConnections?.()
        await new Promise((resolve) => server.close(resolve))
      }
    })

    await t.test('unknown socket-send after durable transport fence permits local recovery only', async () => {
      const { fixture: f, session } = await guidedFixture(db)
      const transportDurable = gate(); const releaseOldOwner = gate(); let providerInvocations = 0
      f.services.tutor.provider = { available: () => true, async generate(context, options) {
        providerInvocations += 1; await options.beforeTransport(); transportDurable.resolve(); await releaseOldOwner.promise
        return { candidate: candidate(context.decision.hint_level, 'Nicht autorisierter alter Text') }
      } }
      const oldOwner = f.services.tutor.hint(f.student, session.session_id, hintInput('h14a-unknown-socket-owner'))
      await transportDurable.promise
      await db.collection('tutor_sessions').updateOne({ session_id: session.session_id }, {
        $set: { 'provider_slots.level_1.lease_expires_at': new Date(f.now.getTime() - 1) },
      })
      const recovered = await f.services.tutor.hint(f.student, session.session_id, hintInput('h14a-unknown-socket-recovery'))
      releaseOldOwner.resolve()
      const late = await oldOwner
      assert.deepEqual(late.hint, recovered.hint)
      assert.equal(providerInvocations, 1, 'ambiguous recovery must not invoke the provider again')
      const stored = await storedSession(db, session.session_id)
      assert.equal(stored.hint_count, 1)
      assert.equal(stored.hint_receipts.length, 1)
      assert.equal(stored.last_hint.source, 'local')
      assert.equal(stored.last_hint.fallback_code, 'AMBIGUOUS_TRANSPORT_LOCAL_FALLBACK')
      assert.equal(stored.provider_slots.level_1.reservation_count, 2)
      assert.equal(stored.provider_slots.level_1.transport_count, 1)
    })

    await t.test('authority revoke while provider is pending blocks hint, Evidence and Knowledge-State mutation', async () => {
      const { fixture: f, session } = await guidedFixture(db)
      const entered = gate(); const release = gate()
      const beforeEvidence = await db.collection('evidence_events').find({ tenant_id: f.tenantId }).toArray()
      const beforeState = await db.collection('student_knowledge_states').find({ tenant_id: f.tenantId }).toArray()
      f.services.tutor.provider = { available: () => true, async generate(context, options) { await options.beforeTransport(); entered.resolve(); await release.promise; return { candidate: candidate(context.decision.hint_level) } } }
      const pending = f.services.tutor.hint(f.student, session.session_id, hintInput('h14a-revoke'))
      await entered.promise
      await f.services.assignments.disable(f.actor, f.assignment.id)
      release.resolve()
      await assert.rejects(pending, { code: 'NOT_FOUND' })
      assert.equal((await storedSession(db, session.session_id)).hint_count, 0)
      assert.deepEqual(await db.collection('evidence_events').find({ tenant_id: f.tenantId }).toArray(), beforeEvidence)
      assert.deepEqual(await db.collection('student_knowledge_states').find({ tenant_id: f.tenantId }).toArray(), beforeState)
    })

    await t.test('unavailable provider uses local fallback with zero provider-call budget and zero transport attempts', async () => {
      const { fixture: f, session, providerBudget } = await guidedFixture(db)
      let calls = 0
      f.services.tutor.provider = { available: () => false, async generate() { calls += 1; throw new Error('must not run') } }
      const result = await f.services.tutor.hint(f.student, session.session_id, hintInput('h14a-unavailable'))
      const stored = await storedSession(db, session.session_id)
      assert.equal(result.hint.hint_level, 1)
      assert.equal(calls, 0)
      assert.equal(providerBudget(), 0)
      assert.equal(stored.last_hint.source, 'local')
      assert.equal(stored.last_hint.fallback_code, 'PROVIDER_UNAVAILABLE')
      assert.equal(stored.provider_slots.level_1.status, 'completed')
      assert.equal(stored.provider_slots.level_1.reservation_count, 1)
      assert.equal(stored.provider_slots.level_1.transport_count, 0)
      assert.equal(stored.provider_slots.level_1.error_code, 'PROVIDER_UNAVAILABLE')
    })

    await t.test('exhausted provider budget prevents transport and records no slot attempt', async () => {
      const { fixture: f, session } = await guidedFixture(db)
      let calls = 0; let budgetChecks = 0
      f.services.tutor.rateLimiter.consumeProviderCall = async () => { budgetChecks += 1; return false }
      f.services.tutor.provider = { available: () => true, async generate(_context, options) {
        await options.beforeTransport(); calls += 1; return { candidate: candidate(1) }
      } }
      const result = await f.services.tutor.hint(f.student, session.session_id, hintInput('h14a-budget-exhausted'))
      const stored = await storedSession(db, session.session_id)
      assert.equal(result.hint.hint_level, 1)
      assert.equal(budgetChecks, 1)
      assert.equal(calls, 0)
      assert.equal(stored.last_hint.source, 'local')
      assert.equal(stored.last_hint.fallback_code, 'BUDGET_EXHAUSTED')
      assert.equal(stored.provider_slots.level_1.reservation_count, 1)
      assert.equal(stored.provider_slots.level_1.transport_count, 0)
      assert.equal(stored.provider_slots.level_1.error_code, 'BUDGET_EXHAUSTED')
    })

    await t.test('never-resolving telemetry cannot delay or duplicate the committed Tutor transition', async () => {
      const { fixture: f, session } = await guidedFixture(db)
      f.services.tutor.provider = { available: () => true, async generate(context, options) { await options.beforeTransport(); return { candidate: candidate(context.decision.hint_level) } } }
      f.services.tutor.telemetry = { record: () => new Promise(() => {}) }
      const attemptsBefore = await db.collection('learning_attempts').countDocuments({ tenant_id: f.tenantId })
      const evidenceBefore = await db.collection('evidence_events').countDocuments({ tenant_id: f.tenantId })
      const stateBefore = await db.collection('student_knowledge_states').find({ tenant_id: f.tenantId }).toArray()
      const started = Date.now()
      await f.services.tutor.hint(f.student, session.session_id, hintInput('h14a-telemetry-never'))
      assert.ok(Date.now() - started < 1_000)
      const stored = await storedSession(db, session.session_id)
      assert.equal(stored.hint_count, 1)
      assert.equal(stored.hint_receipts.length, 1)
      assert.equal(await db.collection('learning_attempts').countDocuments({ tenant_id: f.tenantId }), attemptsBefore)
      assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: f.tenantId }), evidenceBefore)
      assert.deepEqual(await db.collection('student_knowledge_states').find({ tenant_id: f.tenantId }).toArray(), stateBefore)
    })

    await t.test('foreign tenant and unrelated student fail before slot reservation or provider transport', async () => {
      const { fixture: f, session } = await guidedFixture(db)
      const foreign = await seedP0(db); let calls = 0
      f.services.tutor.provider = { available: () => true, async generate() { calls += 1; return { candidate: candidate(1) } } }
      await assert.rejects(f.services.tutor.hint(foreign.student, session.session_id, hintInput('h14a-foreign-tenant')), { code: 'NOT_FOUND' })
      const unrelated = { ...f.student, actor_id: `${f.studentId}-other`, student_id: `${f.studentId}-other` }
      await assert.rejects(f.services.tutor.hint(unrelated, session.session_id, hintInput('h14a-unrelated-student')), { code: 'NOT_FOUND' })
      assert.equal(calls, 0)
      assert.deepEqual((await storedSession(db, session.session_id)).provider_slots, {})
    })
  } finally {
    await client.close()
  }
})
