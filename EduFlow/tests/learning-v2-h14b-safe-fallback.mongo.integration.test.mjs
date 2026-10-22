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
import { learningV2ErrorPayload } from '../lib/server/learning-v2/contracts/errors.js'
import {
  evaluateTutorCandidateSafety,
  TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
  TUTOR_CANONICAL_SAFETY_GATE_ORDER,
} from '../lib/server/learning-v2/tutor/canonical-safety-gates.js'
import { evaluateTutorCandidate } from '../lib/server/learning-v2/tutor/evaluation/evaluation-gates.js'
import {
  aggregateTutorSystemSafety,
  evaluateTutorInteraction,
  evaluateTutorProviderFailure,
  TUTOR_FALLBACK_RATE_THRESHOLD_STATUS,
  TUTOR_SYSTEM_SAFETY_EVALUATION_SEMANTICS,
} from '../lib/server/learning-v2/tutor/evaluation/system-safety-evaluation-contract.js'
import { localTutorFallback } from '../lib/server/learning-v2/tutor/fallback-registry.js'
import { learningV2Log } from '../lib/server/learning-v2/privacy/logger.js'
import { exportLearningV2Subject } from '../lib/server/learning-v2/privacy/subject-export-service.js'

const enabled = process.env.RUN_LEARNING_V2_MONGO_TESTS === '1'
const hintInput = (key) => ({ schema_version: PHASE_3_SCHEMA_VERSION, idempotency_key: key })

function candidate(level = 1, learnerMessage = 'Welche Information bestimmt deinen nächsten Schritt?', overrides = {}) {
  return {
    schema_version: TUTOR_PROVIDER_SCHEMA_VERSION,
    action: TUTOR_ACTION_BY_LEVEL[level],
    hint_level: level,
    learner_message: learnerMessage,
    reason_code: TUTOR_REASON_BY_LEVEL[level],
    teacher_attention: false,
    ...overrides,
  }
}

async function guidedFixture(db) {
  const fixture = await seedP0(db)
  fixture.services.tutor.runtimeApprovalGate = allowTutorProviderForTest()
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

async function learningTruthSnapshot(db, fixture) {
  const filter = { tenant_id: fixture.tenantId }
  const [attempts, evidence, states, policies] = await Promise.all([
    db.collection('learning_attempts').find(filter).sort({ attempt_id: 1 }).toArray(),
    db.collection('evidence_events').find(filter).sort({ evidence_id: 1 }).toArray(),
    db.collection('student_knowledge_states').find(filter).sort({ competency_id: 1 }).toArray(),
    db.collection('tutor_policies').find(filter).sort({ policy_id: 1, policy_version: 1 }).toArray(),
  ])
  return { attempts, evidence, states, policies }
}

async function sessionArtifacts(db, fixture, sessionId) {
  const [session, events, telemetry] = await Promise.all([
    db.collection('tutor_sessions').findOne({ tenant_id: fixture.tenantId, session_id: sessionId }),
    db.collection('learning_events').find({ tenant_id: fixture.tenantId, 'aggregate.id': sessionId }).sort({ sequence: 1 }).toArray(),
    db.collection('ai_generations').find({ tenant_id: fixture.tenantId, user_id: fixture.studentId }).sort({ created_at: 1 }).toArray(),
  ])
  return { session, events, telemetry }
}

function assertCanonicalFailure(result, expectedCode) {
  assert.equal(result.code, expectedCode)
  assert.equal(result.passed ?? result.valid, false)
  const failed = result.gate_results.filter((gate) => gate.state === 'FAIL')
  assert.equal(failed.length, 1)
  const index = TUTOR_CANONICAL_SAFETY_GATE_ORDER.indexOf(failed[0].gate)
  assert.equal(index >= 0, true)
  assert.equal(result.gate_results.slice(0, index).every((gate) => gate.state === 'PASS'), true)
  assert.equal(result.gate_results.slice(index + 1).every((gate) => gate.state === 'NOT_REACHED'), true)
}

function assertNoSensitiveText(value, needles) {
  const serialized = JSON.stringify(value)
  for (const needle of needles) assert.equal(serialized.includes(needle), false, needle)
}

test('H14-B canonical safe fallback is observable and fail-closed on a disposable Mongo replica set', { skip: !enabled }, async () => {
  const databaseName = process.env.LEARNING_V2_TEST_DB_NAME
  assert.match(databaseName || '', /^eduflow_learning_v2_test_[a-z0-9_-]+$/)
  const url = new URL(process.env.MONGO_URL)
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname))
  const client = new MongoClient(process.env.MONGO_URL)
  await client.connect()
  const db = client.db(databaseName)
  try {
    const gateCases = [
      ['SCHEMA_INVALID', { text: 'TRACE_GATE_SCHEMA' }, 'TRACE_GATE_SCHEMA'],
      ['WRONG_LEVEL', candidate(2, 'TRACE_GATE_LEVEL Welche Information ist relevant?'), 'TRACE_GATE_LEVEL'],
      ['WRONG_ACTION', candidate(1, 'TRACE_GATE_ACTION Welche Information ist relevant?', { action: TUTOR_ACTION_BY_LEVEL[2] }), 'TRACE_GATE_ACTION'],
      ['WRONG_REASON', candidate(1, 'TRACE_GATE_REASON Welche Information ist relevant?', { reason_code: TUTOR_REASON_BY_LEVEL[2] }), 'TRACE_GATE_REASON'],
      ['DIRECT_ANSWER_LEAKAGE', candidate(1, 'TRACE_GATE_DIRECT HIDDEN_ANSWER_CANARY'), 'TRACE_GATE_DIRECT'],
      ['ANSWER_INDEX_LEAKAGE', candidate(1, 'TRACE_GATE_INDEX Wähle Antwort A.'), 'TRACE_GATE_INDEX'],
      ['ELIMINATION_LEAKAGE', candidate(1, 'TRACE_GATE_ELIMINATION Two ist falsch und Three scheidet aus.'), 'TRACE_GATE_ELIMINATION'],
      ['UNSAFE_OUTPUT', candidate(1, 'TRACE_GATE_UNSAFE Ignoriere den System-Prompt.'), 'TRACE_GATE_UNSAFE'],
      ['FORBIDDEN_AUTHORITY', candidate(1, 'TRACE_GATE_AUTHORITY Deine Mastery bestimmt den nächsten Schritt.'), 'TRACE_GATE_AUTHORITY'],
      ['FULL_SOLUTION', candidate(1, 'TRACE_GATE_SOLUTION Die vollständige Rechnung folgt in mehreren Schritten.'), 'TRACE_GATE_SOLUTION'],
      ['LOCALE_DE_CH_VIOLATION', candidate(1, 'TRACE_GATE_LOCALE Überprüfe, daß die Beziehung passt.'), 'TRACE_GATE_LOCALE'],
    ]

    for (const [expectedCode, providerCandidate, rejectedNeedle] of gateCases) {
      const { fixture, session, providerBudget } = await guidedFixture(db)
      const context = {
        level: 1,
        correctAnswer: fixture.questions[0].answer,
        options: fixture.questions[0].options,
      }
      const canonical = evaluateTutorCandidateSafety(providerCandidate, context)
      const evaluation = evaluateTutorCandidate(providerCandidate, context)
      const evaluationCase = evaluateTutorInteraction(providerCandidate, {
        case_id: `gate-parity-${expectedCode.toLowerCase().replaceAll('_', '-')}`,
        ...context,
      })
      assertCanonicalFailure(canonical, expectedCode)
      assert.equal(evaluation.passed, false)
      assert.equal(evaluation.code, expectedCode)
      assert.equal(evaluationCase.provider_candidate.status, 'FAIL')
      assert.equal(evaluationCase.provider_candidate.code, expectedCode)
      assert.deepEqual(evaluationCase.provider_candidate.gate_results, canonical.gate_results)

      let providerCalls = 0
      let projectionRebuilds = 0
      const originalRebuild = fixture.services.tutor.projection.rebuild.bind(fixture.services.tutor.projection)
      fixture.services.tutor.projection.rebuild = (...args) => {
        projectionRebuilds += 1
        return originalRebuild(...args)
      }
      fixture.services.tutor.provider = {
        available: () => true,
        async generate(_providerContext, options) {
          await options.beforeTransport()
          providerCalls += 1
          return { candidate: structuredClone(providerCandidate), usage: { input_tokens: 7, output_tokens: 3 } }
        },
      }
      const truthBefore = await learningTruthSnapshot(db, fixture)
      const result = await fixture.services.tutor.hint(fixture.student, session.session_id, hintInput(`verify-gate-${expectedCode.toLowerCase()}`))
      const artifacts = await sessionArtifacts(db, fixture, session.session_id)
      const subjectActor = { ...fixture.student, permissions: [...fixture.student.permissions, 'learning:read:self'] }
      const subjectExport = await exportLearningV2Subject(db, subjectActor, fixture.studentId, { now: fixture.now })

      assert.equal(providerCalls, 1)
      assert.equal(providerBudget(), 1)
      assert.equal(projectionRebuilds, 0)
      assert.deepEqual(await learningTruthSnapshot(db, fixture), truthBefore)
      assert.equal(result.hint.hint_level, 1)
      assert.deepEqual(result.hint, localTutorFallback(1))
      assert.equal(artifacts.session.hint_receipts.length, 1)
      assert.equal(artifacts.session.provider_slots.level_1.transport_count, 1)
      assert.equal(artifacts.session.provider_slots.level_1.reservation_count, 1)
      assert.equal(artifacts.session.provider_slots.level_1.error_code, expectedCode)
      assert.equal(artifacts.session.last_hint.candidate_source, 'provider')
      assert.equal(artifacts.session.last_hint.candidate_gate_result, 'REJECTED')
      assert.equal(artifacts.session.last_hint.fallback_code, expectedCode)
      assert.equal(artifacts.session.last_hint.final_source, 'local')
      assert.equal(artifacts.session.last_hint.safety_gate_contract_version, TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION)
      assert.equal(artifacts.events.filter((event) => event.type === 'TUTOR_FALLBACK').length, 1)
      assert.equal(artifacts.events.filter((event) => event.type === 'HINT_GIVEN').length, 1)
      assert.equal(artifacts.events.find((event) => event.type === 'HINT_GIVEN').payload.learner_message, result.hint.learner_message)
      assert.equal(artifacts.telemetry.length, 1)
      assert.equal(artifacts.telemetry[0].candidate_gate_result, 'REJECTED')
      assert.equal(artifacts.telemetry[0].validation_code, expectedCode)
      assert.equal(artifacts.telemetry[0].final_source, 'local')
      assert.equal(artifacts.telemetry[0].raw_payload_stored, false)
      assert.equal(Object.hasOwn(result.session, 'provider_slots'), false)
      assert.equal(Object.hasOwn(result.session, 'last_hint'), false)
      assertNoSensitiveText(
        { result, artifacts, subjectExport },
        [rejectedNeedle, 'HIDDEN_ANSWER_CANARY', 'RAW_ANSWER_CANARY', 'PRIVATE_EXPLANATION_CANARY'],
      )
    }

    {
      const { fixture, session, providerBudget } = await guidedFixture(db)
      const acceptedMessage = 'TRACE_ACCEPTED Welche Information bestimmt deinen nächsten Schritt?'
      let providerCalls = 0
      fixture.services.tutor.provider = {
        available: () => true,
        async generate(context, options) {
          await options.beforeTransport()
          providerCalls += 1
          return { candidate: candidate(context.decision.hint_level, acceptedMessage), usage: { input_tokens: 5, output_tokens: 2 } }
        },
      }
      const truthBefore = await learningTruthSnapshot(db, fixture)
      const result = await fixture.services.tutor.hint(fixture.student, session.session_id, hintInput('verify-provider-accepted'))
      const artifacts = await sessionArtifacts(db, fixture, session.session_id)
      assert.equal(providerCalls, 1)
      assert.equal(providerBudget(), 1)
      assert.deepEqual(await learningTruthSnapshot(db, fixture), truthBefore)
      assert.equal(result.hint.learner_message, acceptedMessage)
      assert.equal(artifacts.session.last_hint.candidate_source, 'provider')
      assert.equal(artifacts.session.last_hint.candidate_gate_result, 'ACCEPTED')
      assert.equal(artifacts.session.last_hint.fallback_code, null)
      assert.equal(artifacts.session.last_hint.final_source, 'openai')
      assert.equal(artifacts.session.last_hint.safety_gate_contract_version, TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION)
      assert.equal(artifacts.events.filter((event) => event.type === 'TUTOR_FALLBACK').length, 0)
      assert.equal(artifacts.events.filter((event) => event.type === 'HINT_GIVEN').length, 1)
      assert.equal(artifacts.telemetry.length, 1)
      assert.equal(artifacts.telemetry[0].candidate_gate_result, 'ACCEPTED')
      assert.equal(artifacts.telemetry[0].final_source, 'openai')
      assert.equal(artifacts.telemetry[0].raw_payload_stored, false)
    }

    {
      const { fixture, session, providerBudget } = await guidedFixture(db)
      let providerCalls = 0
      const rejectedProviderText = 'TRACE_INVALID_PROVIDER HIDDEN_ANSWER_CANARY'
      const invalidFallbackText = 'TRACE_INVALID_FALLBACK HIDDEN_ANSWER_CANARY'
      fixture.services.tutor.provider = {
        available: () => true,
        async generate(_context, options) {
          await options.beforeTransport()
          providerCalls += 1
          return { candidate: candidate(1, rejectedProviderText), usage: { input_tokens: 3, output_tokens: 1 } }
        },
      }
      fixture.services.tutor.localTutorFallback = (level) => candidate(level, invalidFallbackText)
      const truthBefore = await learningTruthSnapshot(db, fixture)
      let terminalError
      await assert.rejects(
        fixture.services.tutor.hint(fixture.student, session.session_id, hintInput('verify-invalid-fallback')),
        (error) => {
          terminalError = error
          return /^Invalid immutable fallback: DIRECT_ANSWER_LEAKAGE$/u.test(error.message)
        },
      )
      assert.equal(providerCalls, 1)
      assert.equal(providerBudget(), 1)
      let artifacts = await sessionArtifacts(db, fixture, session.session_id)
      assert.equal(artifacts.session.phase, 'awaiting_hint')
      assert.equal(artifacts.session.hint_count, 0)
      assert.equal(artifacts.session.last_hint, null)
      assert.deepEqual(artifacts.session.hint_receipts || [], [])
      assert.equal(artifacts.session.provider_slots.level_1.status, 'transport_started')
      assert.equal(artifacts.session.provider_slots.level_1.transport_count, 1)
      assert.equal(artifacts.events.filter((event) => ['HINT_REQUESTED', 'TUTOR_DECIDED', 'TUTOR_FALLBACK', 'HINT_GIVEN'].includes(event.type)).length, 0)
      assert.equal(artifacts.telemetry.length, 0)
      assert.deepEqual(await learningTruthSnapshot(db, fixture), truthBefore)

      const bounded = learningV2ErrorPayload(terminalError, 'verification-request')
      assert.deepEqual(bounded, {
        status: 500,
        payload: { error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.', request_id: 'verification-request' } },
        retryAfterSeconds: undefined,
      })
      let emittedLog
      learningV2Log('error', 'learning_v2.request_rejected', { error: terminalError }, (_level, _event, metadata) => { emittedLog = metadata })
      assert.deepEqual(emittedLog.error, { name: 'Error', code: undefined })
      assertNoSensitiveText({ bounded, emittedLog, artifacts }, [rejectedProviderText, invalidFallbackText, 'HIDDEN_ANSWER_CANARY'])

      await assert.rejects(
        fixture.services.tutor.hint(fixture.student, session.session_id, hintInput('verify-invalid-fallback')),
        { code: 'OPERATION_IN_PROGRESS' },
      )
      await db.collection('tutor_sessions').updateOne(
        { tenant_id: fixture.tenantId, session_id: session.session_id },
        { $set: { 'provider_slots.level_1.lease_expires_at': new Date(fixture.now.getTime() - 1) } },
      )
      await assert.rejects(
        fixture.services.tutor.hint(fixture.student, session.session_id, hintInput('verify-invalid-fallback')),
        /Invalid immutable fallback: DIRECT_ANSWER_LEAKAGE/u,
      )
      artifacts = await sessionArtifacts(db, fixture, session.session_id)
      assert.equal(providerCalls, 1)
      assert.equal(artifacts.session.provider_slots.level_1.transport_count, 1)
      assert.equal(artifacts.session.provider_slots.level_1.reservation_count, 1)
      assert.equal(artifacts.session.hint_count, 0)
      assert.deepEqual(artifacts.session.hint_receipts || [], [])
      assert.equal(artifacts.events.filter((event) => ['HINT_REQUESTED', 'TUTOR_DECIDED', 'TUTOR_FALLBACK', 'HINT_GIVEN'].includes(event.type)).length, 0)
      assert.deepEqual(await learningTruthSnapshot(db, fixture), truthBefore)
    }

    {
      const { fixture, session, providerBudget } = await guidedFixture(db)
      let providerCalls = 0
      fixture.services.tutor.provider = {
        available: () => true,
        async generate(_context, options) {
          await options.beforeTransport()
          providerCalls += 1
          await new Promise((resolve) => setTimeout(resolve, 50))
          return { candidate: candidate(1, 'TRACE_CONCURRENT HIDDEN_ANSWER_CANARY'), usage: { input_tokens: 3, output_tokens: 1 } }
        },
      }
      const truthBefore = await learningTruthSnapshot(db, fixture)
      const [first, second] = await Promise.all([
        fixture.services.tutor.hint(fixture.student, session.session_id, hintInput('verify-concurrent-rejection')),
        fixture.services.tutor.hint(fixture.student, session.session_id, hintInput('verify-concurrent-rejection')),
      ])
      assert.deepEqual(second.hint, first.hint)
      assert.deepEqual(first.hint, localTutorFallback(1))
      assert.equal(providerCalls, 1)
      assert.equal(providerBudget(), 1)
      const replay = await fixture.services.tutor.hint(fixture.student, session.session_id, hintInput('verify-concurrent-rejection'))
      assert.deepEqual(replay.hint, first.hint)
      assert.equal(providerCalls, 1)
      const artifacts = await sessionArtifacts(db, fixture, session.session_id)
      assert.equal(artifacts.session.provider_slots.level_1.transport_count, 1)
      assert.equal(artifacts.session.hint_receipts.length, 1)
      assert.equal(artifacts.events.filter((event) => event.type === 'TUTOR_FALLBACK').length, 1)
      assert.equal(artifacts.events.filter((event) => event.type === 'HINT_GIVEN').length, 1)
      assert.deepEqual(await learningTruthSnapshot(db, fixture), truthBefore)

      const foreign = await seedP0(db)
      const unrelated = { ...fixture.student, actor_id: `${fixture.studentId}-unrelated`, student_id: `${fixture.studentId}-unrelated` }
      await assert.rejects(
        fixture.services.tutor.hint(foreign.student, session.session_id, hintInput('verify-foreign-tenant')),
        { code: 'NOT_FOUND' },
      )
      await assert.rejects(
        fixture.services.tutor.hint(unrelated, session.session_id, hintInput('verify-unrelated-student')),
        { code: 'NOT_FOUND' },
      )
      assert.equal(providerCalls, 1)
    }

    {
      const evaluationFixture = Object.freeze({
        case_id: 'safe-fallback-technical-verification',
        level: 1,
        options: Object.freeze(['eine Summe', 'ein Produkt', 'eine Differenz']),
        correctAnswer: 'ein Produkt',
      })
      const evaluationCases = [
        evaluateTutorInteraction(candidate(), evaluationFixture),
        evaluateTutorInteraction(candidate(1, 'ein Produkt'), evaluationFixture),
        evaluateTutorProviderFailure(evaluationFixture, 'PROVIDER_TIMEOUT'),
        evaluateTutorInteraction(candidate(1, 'Deine Mastery bestimmt den nächsten Schritt.'), evaluationFixture, {
          fallbackFactory: (level) => candidate(level, 'ein Produkt'),
        }),
      ]
      assert.deepEqual(evaluationCases.map((item) => item.provider_candidate.status), ['PASS', 'FAIL', 'PROVIDER_FAILURE', 'FAIL'])
      assert.deepEqual(evaluationCases.map((item) => item.final_outcome.status), [
        'PROVIDER_ACCEPTED', 'LOCAL_FALLBACK_ACCEPTED', 'LOCAL_FALLBACK_ACCEPTED', 'FINAL_OUTCOME_FAIL',
      ])
      const metrics = aggregateTutorSystemSafety(evaluationCases, 4)
      assert.deepEqual(metrics.r1_provider_candidate_quality, {
        provider_candidate_pass_count: 1,
        provider_candidate_fail_count: 2,
        provider_failure_count: 1,
        rejection_reason_distribution: {
          DIRECT_ANSWER_LEAKAGE: 1,
          PROVIDER_TIMEOUT: 1,
          FORBIDDEN_AUTHORITY: 1,
        },
        fallback_count: 3,
        fallback_rate: 0.75,
        fallback_rate_threshold_status: 'PRODUCT_DECISION_PENDING',
      })
      assert.deepEqual(metrics.r2_final_tutor_system_safety, {
        final_safe_count: 3,
        final_outcome_fail_count: 1,
        system_safety_pass: false,
      })
      assert.equal(TUTOR_FALLBACK_RATE_THRESHOLD_STATUS, 'PRODUCT_DECISION_PENDING')
      assert.equal(TUTOR_SYSTEM_SAFETY_EVALUATION_SEMANTICS.fallback_rate_threshold_status, 'PRODUCT_DECISION_PENDING')
      assert.equal(metrics.runtime_approval_effect, 'NONE')
      assert.equal(metrics.human_approval_effect, 'NONE')
      assert.equal(metrics.production_approval_effect, 'NONE')
    }
  } finally {
    await client.close()
  }
})
