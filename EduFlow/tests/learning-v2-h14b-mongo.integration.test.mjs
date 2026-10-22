import assert from 'node:assert/strict'
import test from 'node:test'
import { MongoClient } from 'mongodb'
import { seedP0 } from './helpers/hardening-p0-fixture.mjs'
import { allowTutorProviderForTest } from './helpers/tutor-runtime-gate.mjs'
import {
  PHASE_3_SCHEMA_VERSION,
  TUTOR_ACTION_BY_LEVEL,
  TUTOR_PROVIDER_SCHEMA_VERSION,
  TUTOR_REASON_BY_LEVEL,
} from '../lib/server/learning-v2/contracts/phase3.js'
import { TutorRuntimeApprovalGate } from '../lib/server/learning-v2/tutor/governance/runtime-approval.js'

const enabled = process.env.RUN_LEARNING_V2_MONGO_TESTS === '1'

function candidate(level) {
  return {
    schema_version: TUTOR_PROVIDER_SCHEMA_VERSION,
    action: TUTOR_ACTION_BY_LEVEL[level],
    hint_level: level,
    learner_message: 'Welche Information bestimmt deinen nächsten Schritt?',
    reason_code: TUTOR_REASON_BY_LEVEL[level],
    teacher_attention: false,
  }
}

async function guidedFixture(db, runtimeApprovalGate) {
  const fixture = await seedP0(db)
  fixture.services.tutor.runtimeApprovalGate = runtimeApprovalGate
  await fixture.services.policies.configure(fixture.actor, fixture.assignment.id, {
    schema_version: PHASE_3_SCHEMA_VERSION,
    preset: 'GUIDED_TUTOR',
  })
  const session = await fixture.services.tutor.start(fixture.student, {
    schema_version: PHASE_3_SCHEMA_VERSION,
    submission_id: fixture.submission.id,
    question_index: 0,
  })
  let providerBudget = 0
  fixture.services.tutor.rateLimiter = {
    async consumeHint() { return true },
    async consumeProviderCall() { providerBudget += 1; return true },
  }
  return { fixture, session, providerBudget: () => providerBudget }
}

async function counts(db, fixture) {
  return {
    attempts: await db.collection('learning_attempts').countDocuments({ tenant_id: fixture.tenantId }),
    evidence: await db.collection('evidence_events').countDocuments({ tenant_id: fixture.tenantId }),
    states: await db.collection('student_knowledge_states').countDocuments({ tenant_id: fixture.tenantId }),
  }
}

test('H14-B runtime approval boundary holds against a disposable Mongo replica set', { skip: !enabled }, async (t) => {
  const databaseName = process.env.LEARNING_V2_TEST_DB_NAME
  assert.match(databaseName || '', /^eduflow_learning_v2_test_[a-z0-9_-]+$/)
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(process.env.MONGO_URL).hostname))
  const client = new MongoClient(process.env.MONGO_URL)
  await client.connect()
  const db = client.db(databaseName)
  try {
    await t.test('exact tuple-bound downstream test seam permits one transport without creating runtime approval', async () => {
      const { fixture, session, providerBudget } = await guidedFixture(db, allowTutorProviderForTest())
      let transports = 0
      fixture.services.tutor.provider = {
        available: () => true,
        async generate(context, options) {
          await options.beforeTransport(); transports += 1
          return { candidate: candidate(context.decision.hint_level), usage: { input_tokens: 2, output_tokens: 2 } }
        },
      }
      const before = await counts(db, fixture)
      await fixture.services.tutor.hint(fixture.student, session.session_id, {
        schema_version: PHASE_3_SCHEMA_VERSION,
        idempotency_key: 'h14b-approved-tuple',
      })
      const stored = await db.collection('tutor_sessions').findOne({ session_id: session.session_id })
      assert.equal(transports, 1)
      assert.equal(providerBudget(), 1)
      assert.equal(stored.hint_receipts[0].source, 'openai')
      assert.equal(stored.provider_slots.level_1.transport_count, 1)
      assert.deepEqual(await counts(db, fixture), before)
    })

    await t.test('model, prompt, schema and approval-ref mismatches make zero provider calls and preserve learning truth', async () => {
      const mismatches = [
        ['model', 'unknown-model', 'PROVIDER_MODEL_NOT_APPROVED'],
        ['prompt_version', 'unknown-prompt', 'PROVIDER_PROMPT_NOT_APPROVED'],
        ['structured_output_schema_version', 'unknown-schema', 'PROVIDER_SCHEMA_NOT_APPROVED'],
        ['approval_ref', 'unknown-approval', 'PROVIDER_APPROVAL_REF_MISMATCH'],
      ]
      for (const [field, value, reasonCode] of mismatches) {
        const approvalGate = new TutorRuntimeApprovalGate({
          environment: { LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '1' },
          nodeEnvironment: 'test',
        })
        const configuration = { ...approvalGate.configuration(), [field]: value }
        const gate = {
          configuration: () => configuration,
          evaluate: (candidateConfiguration) => approvalGate.evaluate(candidateConfiguration),
        }
        const { fixture, session, providerBudget } = await guidedFixture(db, gate)
        let transports = 0
        fixture.services.tutor.provider = { available: () => true, async generate() { transports += 1; throw new Error('must not run') } }
        const before = await counts(db, fixture)
        await fixture.services.tutor.hint(fixture.student, session.session_id, {
          schema_version: PHASE_3_SCHEMA_VERSION,
          idempotency_key: `h14b-mismatch-${field}`,
        })
        const stored = await db.collection('tutor_sessions').findOne({ session_id: session.session_id })
        assert.equal(transports, 0, field)
        assert.equal(providerBudget(), 0, field)
        assert.equal(stored.hint_receipts[0].source, 'local', field)
        assert.equal(stored.hint_receipts[0].fallback_code, reasonCode, field)
        assert.equal(stored.provider_slots.level_1.transport_count, 0, field)
        assert.deepEqual(await counts(db, fixture), before, field)
      }
    })

    await t.test('runtime gate off yields local fallback with zero transport and zero call budget', async () => {
      const gate = new TutorRuntimeApprovalGate({ environment: {}, nodeEnvironment: 'test' })
      const { fixture, session, providerBudget } = await guidedFixture(db, gate)
      let transports = 0
      fixture.services.tutor.provider = { available: () => true, async generate() { transports += 1; throw new Error('must not run') } }
      const before = await counts(db, fixture)
      await fixture.services.tutor.hint(fixture.student, session.session_id, {
        schema_version: PHASE_3_SCHEMA_VERSION,
        idempotency_key: 'h14b-runtime-off',
      })
      const stored = await db.collection('tutor_sessions').findOne({ session_id: session.session_id })
      assert.equal(transports, 0)
      assert.equal(providerBudget(), 0)
      assert.equal(stored.hint_receipts[0].fallback_code, 'PROVIDER_RUNTIME_GATE_OFF')
      assert.equal(stored.provider_slots.level_1.transport_count, 0)
      assert.deepEqual(await counts(db, fixture), before)
    })
  } finally {
    await client.close()
  }
})
