import { localHostingEnvironment } from './helpers/local-hosting-environment.mjs'
import { AttemptService } from '../lib/server/learning-v2/attempts/attempt-service.js'
import { addTutorAuthorityFixture } from './helpers/tutor-authority-fixture.mjs'
import { ATTEMPT_SCHEMA_VERSION } from '../lib/server/learning-v2/contracts/phase2.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'
import { PHASE_3_SCHEMA_VERSION, TUTOR_ACTION_BY_LEVEL, TUTOR_PROVIDER_SCHEMA_VERSION } from '../lib/server/learning-v2/contracts/phase3.js'
import {
  PHASE_3B_SCHEMA_VERSION,
  REFLECTION_PROMPT_ID,
  REFLECTION_PROMPT_TEXT,
  REFLECTION_PROMPT_VERSION,
  normalizeReflectionResponse,
  reflectionSubmissionRequestSchema,
} from '../lib/server/learning-v2/contracts/phase3b.js'
import { isLearningV2Phase3bDevelopmentEnabled } from '../lib/server/learning-v2/feature-flags/learning-v2.js'
import { identifyMistakeReflectionPrompt, reflectionPrompt } from '../lib/server/learning-v2/reflection/prompt-registry.js'
import { defaultTutorPreset } from '../lib/server/learning-v2/tutor/policy.js'
import { TutorService } from '../lib/server/learning-v2/tutor/tutor-service.js'
import { worksheetQuestionContentHash } from '../lib/server/worksheet-question-identity.js'
import { allowTutorProviderForTest } from './helpers/tutor-runtime-gate.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

function candidate(level) {
  return {
    schema_version: TUTOR_PROVIDER_SCHEMA_VERSION,
    action: TUTOR_ACTION_BY_LEVEL[level],
    hint_level: level,
    learner_message: 'Prüfe die entscheidende Regel und wende sie auf jede Option an.',
    reason_code: level === 1 ? 'METACOGNITIVE_CHECK' : level === 2 ? 'DIRECTIONAL_NUDGE' : 'CONCEPTUAL_NUDGE',
    teacher_attention: false,
  }
}

function harness({ mode = 'exercise', preset, phase3bEnabled = true, provider, triggerCorrect = false } = {}) {
  const tenantId = generateDomainId('ten')
  const studentId = `phase3b-student-${Math.random().toString(16).slice(2)}`
  const actor = { actor_id: studentId, actor_type: 'student', role: 'student', tenant_id: tenantId, student_id: studentId, permissions: ['learning:read:self', 'learning:write:self'] }
  const ids = {
    task: generateDomainId('tsk'), objective: generateDomainId('obj'), competency: generateDomainId('cmp'), framework: generateDomainId('frm'),
    attempt: generateDomainId('att'), question: generateDomainId('wqi'), policy: generateDomainId('pol'),
  }
  const question = { question_id: ids.question, type: 'multiple_choice', question: 'Was ist die Hauptstadt Frankreichs?', options: ['Bern', 'Paris', 'Rom'], answer: 'Paris' }
  const contentHash = worksheetQuestionContentHash(question)
  const assignment = {
    id: 'assignment-phase3b', activity_type: mode, show_solutions: true,
    learning_v2: {
      enabled: true, tenant_id: tenantId, ...(preset ? { tutor_preset: preset } : {}),
      task_pins: [{ task_id: ids.task, task_version: 1, worksheet_id: 'worksheet-phase3b', question_id: ids.question, content_hash: contentHash, hash_version: 'worksheet-question-sha256-v1' }],
    },
  }
  const task = {
    tenant_id: tenantId, task_id: ids.task, version: 1, status: 'published', objective_refs: [{ objective_id: ids.objective, version: 1 }],
    source: { worksheet_id: 'worksheet-phase3b', question_id: ids.question, content_hash: contentHash, hash_version: 'worksheet-question-sha256-v1' },
  }
  const trigger = {
    schema_version: ATTEMPT_SCHEMA_VERSION, tenant_id: tenantId, status: 'active',
    submitted_at: new Date(), server_received_at: new Date(), created_at: new Date(), idempotency_key: 'trigger-key',
    attempt_id: ids.attempt, tenant_id: tenantId, student_id: studentId,
    task_ref: { task_id: ids.task, version: 1 }, objective_ref: { objective_id: ids.objective, version: 1 },
    primary_competency_ref: { competency_id: ids.competency, framework_id: ids.framework, framework_version: 'dev' }, supporting_competency_refs: [],
    source: {
      kind: 'legacy_submission_question', submission_id: 'submission-phase3b', submission_intent_id: 'intent-phase3b', assignment_id: assignment.id,
      worksheet_id: 'worksheet-phase3b', question_id: ids.question, question_index: 0, source_revision: 1, content_hash: contentHash,
      hash_version: 'worksheet-question-sha256-v1', grading_revision: 1, learning_v2_attempt_no: 1,
    },
    outcome: { correctness: triggerCorrect ? 'correct' : 'incorrect', max_points: 1 }, attempt_no: 1,
  }
  const collections = {
    assignments: { async findOne(query) { return query.id === assignment.id ? assignment : null } },
    worksheets: { async findOne() { return { id: 'worksheet-phase3b', content: { questions: [question] } } } },
    learning_tasks: { async findOne() { return task } },
  }
  const sessions = new Map()
  const eventRows = []
  const eventBySemantic = new Map()
  const attemptRows = [trigger]
  const evidenceRows = []
  let projectionCount = 0
  let providerCalls = 0
  let clock = new Date('2026-08-26T12:00:00Z')
  const dependencies = {
    attemptRepository: {
      async findBySubmission() { return [trigger] },
      async findById(_actor, id) { return attemptRows.find((item) => item.attempt_id === id) || null },
    },
    policyRepository: {
      async findVersion() { return { policy_id: ids.policy, policy_version: 1, content_hash: `sha256:${'a'.repeat(64)}`, requested_preset: preset || defaultTutorPreset(mode) } },
      async createSnapshot(_actor, _assignment, resolved) { return { policy_id: ids.policy, policy_version: 1, content_hash: `sha256:${'a'.repeat(64)}`, ...resolved } },
    },
    sessionRepository: {
      async findActiveForSlot() { return structuredClone([...sessions.values()].find((item) => item.status === 'active') || null) },
      async insertActive(_actor, document) {
        const existing = [...sessions.values()].find((item) => item.start_key === document.start_key || item.status === 'active')
        if (existing) return existing
        sessions.set(document.session_id, structuredClone(document)); return structuredClone(sessions.get(document.session_id))
      },
      async findForStudent(_actor, id) { return structuredClone(sessions.get(id) || null) },
      async transition(_actor, session, set) {
        const current = sessions.get(session.session_id)
        if (!current || current.state_version !== session.state_version) { const error = new Error('conflict'); error.code = 'CONFLICT'; throw error }
        Object.assign(current, structuredClone(set), { state_version: current.state_version + 1 })
        return structuredClone(current)
      },
      async reserveProviderSlot(_actor, session, level, values) {
        const current = sessions.get(session.session_id); const key = `level_${level}`; const existing = current.provider_slots?.[key]
        if (existing?.status === 'completed') return { state: 'completed', session: structuredClone(current) }
        if (existing && new Date(existing.lease_expires_at) > values.now) return { state: 'in_progress', session: structuredClone(current) }
        if (existing?.status === 'transport_started') return { state: 'ambiguous_transport', session: structuredClone(current) }
        if (current.state_version !== session.state_version) return { state: 'in_progress', session: structuredClone(current) }
        current.provider_slots[key] = { status: 'reserved', call_id: values.callId,
          reservation_count: (existing?.reservation_count || 0) + 1, transport_count: 0,
          lease_expires_at: values.leaseExpiresAt, outcome_code: null, error_code: null, reserved_at: values.now,
          transport_started_at: null, completed_at: null, updated_at: values.now }
        current.state_version += 1
        return { state: 'owner', session: structuredClone(current) }
      },
      async markProviderTransportStarted(_actor, session, level, callId, values) {
        const current = sessions.get(session.session_id); const slot = current.provider_slots?.[`level_${level}`]
        if (current.state_version !== session.state_version || slot?.call_id !== callId || slot.status !== 'reserved') return null
        Object.assign(slot, { status: 'transport_started', transport_started_at: values.now,
          lease_expires_at: values.leaseExpiresAt, transport_count: 1, updated_at: values.now })
        current.state_version += 1
        return structuredClone(current)
      },
      async recoverAmbiguousTransportWithLocalFallback(_actor, session, level, set, now) {
        const current = sessions.get(session.session_id); const slot = current.provider_slots?.[`level_${level}`]
        if (current.state_version !== session.state_version || slot?.status !== 'transport_started'
          || slot.transport_count !== 1 || new Date(slot.lease_expires_at) > now) return null
        Object.assign(current, structuredClone(set))
        Object.assign(slot, { status: 'completed', reservation_count: slot.reservation_count + 1,
          lease_expires_at: now, outcome_code: 'LOCAL_FALLBACK', error_code: 'AMBIGUOUS_TRANSPORT_LOCAL_FALLBACK',
          completed_at: now, updated_at: now })
        current.state_version += 1
        return structuredClone(current)
      },
      async commitHintWithProviderSlot(_actor, session, level, callId, set, outcome, now) {
        const current = sessions.get(session.session_id); const slot = current.provider_slots?.[`level_${level}`]
        if (current.state_version !== session.state_version || slot?.call_id !== callId || slot.status === 'completed') return null
        Object.assign(current, structuredClone(set))
        Object.assign(slot, { status: 'completed', lease_expires_at: now, outcome_code: outcome.outcomeCode,
          error_code: outcome.errorCode || null, completed_at: now, updated_at: now })
        current.state_version += 1
        return structuredClone(current)
      },
    },
    events: {
      async record(_actor, event) {
        const semantic = JSON.stringify(event.idempotencyParts || [event.type, event.aggregate, event.payload])
        if (eventBySemantic.has(semantic)) return eventBySemantic.get(semantic)
        const sequenceWinner = eventRows.find((item) => item.aggregate.type === event.aggregate.type && item.aggregate.id === event.aggregate.id && item.sequence === event.sequence)
        if (sequenceWinner) { const error = new Error('duplicate sequence'); error.code = 11000; throw error }
        const row = {
          event_id: event.eventId || generateDomainId('evt'), type: event.type, aggregate: structuredClone(event.aggregate), sequence: event.sequence,
          occurred_at: event.occurredAt || new Date(clock), recorded_at: new Date(clock), actor: { kind: event.actorKind, id: event.actorId },
          correlation_id: event.correlationId, causation_id: event.causationId, payload: structuredClone(event.payload),
        }
        eventRows.push(row); eventBySemantic.set(semantic, row); return row
      },
      async listForAggregate(_actor, type, id) { return eventRows.filter((item) => item.aggregate.type === type && item.aggregate.id === id).sort((a, b) => a.sequence - b.sequence) },
      async findForAggregateSequence(_actor, type, id, sequence) { return eventRows.find((item) => item.aggregate.type === type && item.aggregate.id === id && item.sequence === sequence) || null },
    },
    evidence: { async recordTutorOutcome(_actor, attempt, input) { const row = { attempt_id: attempt.attempt_id, ...input }; evidenceRows.push(row); return row } },
    projection: { async rebuild() { projectionCount += 1; return { mastery: 0.5, confidence: 0 } } },
    rateLimiter: { async consumeHint() { return true }, async allowProvider() { return true } },
    telemetry: { async record() {} },
    runtimeApprovalGate: allowTutorProviderForTest(),
    provider: provider ? {
      available() { return provider.available() },
      async generate(context, options) { providerCalls += 1; await options?.beforeTransport?.(); return provider.generate(context, options) },
    } : { available() { return false } },
  }
  dependencies.attempts = new AttemptService({ async insertCanonical(_actor, row) {
    const existing = attemptRows.find((item) => item.idempotency_key === row.idempotency_key)
    if (existing) return structuredClone(existing)
    attemptRows.push(structuredClone(row)); return structuredClone(row)
  } }, dependencies.events)
  const service = new TutorService({ collection(name) { return collections[name] } }, dependencies, {
    phase3bEnabled, now: () => new Date(clock),
  })
  addTutorAuthorityFixture(collections, { assignment, task, trigger, tenantId, studentId, policy: () => dependencies.policyRepository.findVersion() })
  return {
    actor, assignment, evidenceRows, eventRows, question, service, sessions, attemptRows, dependencies,
    projectionCount: () => projectionCount,
    providerCalls: () => providerCalls,
    setClock(value) { clock = new Date(value) },
  }
}

async function start(harnessValue) {
  return harnessValue.service.start(harnessValue.actor, { schema_version: PHASE_3_SCHEMA_VERSION, submission_id: 'submission-phase3b', question_index: 0 })
}

async function solveAfterLevel(harnessValue, targetLevel) {
  const session = await start(harnessValue)
  for (let level = 1; level <= targetLevel; level += 1) {
    await harnessValue.service.hint(harnessValue.actor, session.session_id, { schema_version: PHASE_3_SCHEMA_VERSION, idempotency_key: `hint-${targetLevel}-${level}` })
    await harnessValue.service.retry(harnessValue.actor, session.session_id, {
      schema_version: PHASE_3_SCHEMA_VERSION, idempotency_key: `retry-${targetLevel}-${level}`,
      selected_response: level === targetLevel ? 'Paris' : 'Bern',
    })
  }
  return harnessValue.sessions.get(session.session_id)
}

test('Phase 3b flag is independently default-off and impossible in production', () => {
  assert.equal(isLearningV2Phase3bDevelopmentEnabled({ ...localHostingEnvironment,}), false)
  assert.equal(isLearningV2Phase3bDevelopmentEnabled({ ...localHostingEnvironment, NODE_ENV: 'development', LEARNING_V2_ENABLED: 'true', LEARNING_V2_PHASE_3_ENABLED: 'true', LEARNING_V2_PHASE_3B_ENABLED: 'true' }), true)
  assert.equal(isLearningV2Phase3bDevelopmentEnabled({ ...localHostingEnvironment, NODE_ENV: 'production', LEARNING_V2_ENABLED: 'true', LEARNING_V2_PHASE_3_ENABLED: 'true', LEARNING_V2_PHASE_3B_ENABLED: 'true' }), false)
  assert.equal(isLearningV2Phase3bDevelopmentEnabled({ ...localHostingEnvironment, NODE_ENV: 'development', LEARNING_V2_ENABLED: 'true', LEARNING_V2_PHASE_3B_ENABLED: 'true' }), false)
})

test('Reflection prompt registry contains exactly the frozen identify_mistake prompt', () => {
  assert.deepEqual(identifyMistakeReflectionPrompt(), {
    prompt_id: REFLECTION_PROMPT_ID, prompt_version: REFLECTION_PROMPT_VERSION, type: 'identify_mistake', locale: 'de-CH', text: REFLECTION_PROMPT_TEXT,
    maximum_response_characters: 300, maximum_response_words: 60,
  })
  assert.equal(reflectionPrompt(REFLECTION_PROMPT_ID, REFLECTION_PROMPT_VERSION).text, REFLECTION_PROMPT_TEXT)
  assert.equal(reflectionPrompt(REFLECTION_PROMPT_ID, 'latest'), null)
})

test('response contract normalizes line endings/NFC and enforces every frozen boundary', () => {
  const parseResponse = (response_text, extra = {}) => reflectionSubmissionRequestSchema.safeParse({ schema_version: PHASE_3B_SCHEMA_VERSION, idempotency_key: 'reflection-key', response_text, ...extra })
  assert.equal(parseResponse('ab').success, false)
  assert.equal(parseResponse('abc').success, true)
  assert.equal(parseResponse('a'.repeat(300)).success, true)
  assert.equal(parseResponse('a'.repeat(301)).success, false)
  assert.equal(parseResponse(Array(60).fill('a').join(' ')).success, true)
  assert.equal(parseResponse(Array(61).fill('a').join(' ')).success, false)
  assert.equal(parseResponse('  \n  ').success, false)
  assert.equal(parseResponse('abc\tdef').success, false)
  assert.equal(parseResponse('abc', { attachment: 'file' }).success, false)
  assert.equal(reflectionSubmissionRequestSchema.safeParse({ schema_version: 'wrong', idempotency_key: 'reflection-key', response_text: 'abc' }).success, false)
  assert.equal(normalizeReflectionResponse('  e\u0301xy\r\nz  '), 'éxy z')
  assert.equal(parseResponse('<script>alert(1)</script> **text**').success, true, 'Markup-like text remains inert plain text')
})

test('independent correct, Level 1 correct, support_required and forbidden modes never request Reflection', async () => {
  const independent = harness({ triggerCorrect: true })
  await assert.rejects(start(independent), (error) => error.code === 'NOT_FOUND')

  const level1 = harness()
  const level1Session = await solveAfterLevel(level1, 1)
  assert.equal(level1Session.status, 'completed')
  assert.equal(level1Session.reflection.status, 'not_required')
  assert.equal(level1.eventRows.some((item) => item.type.startsWith('REFLECTION_')), false)

  const exhausted = harness()
  const exhaustedSession = await start(exhausted)
  for (let level = 1; level <= 3; level += 1) {
    await exhausted.service.hint(exhausted.actor, exhaustedSession.session_id, { schema_version: PHASE_3_SCHEMA_VERSION, idempotency_key: `exhaust-hint-${level}` })
    await exhausted.service.retry(exhausted.actor, exhaustedSession.session_id, { schema_version: PHASE_3_SCHEMA_VERSION, idempotency_key: `exhaust-retry-${level}`, selected_response: 'Bern' })
  }
  assert.equal(exhausted.sessions.get(exhaustedSession.session_id).outcome, 'support_required')
  assert.equal(exhausted.eventRows.some((item) => item.type.startsWith('REFLECTION_')), false)

  for (const mode of ['assessment', 'diagnostic', 'exit_ticket']) {
    await assert.rejects(start(harness({ mode })), (error) => error.code === 'NOT_FOUND')
  }
})

for (const targetLevel of [2, 3]) {
  test(`correct Level ${targetLevel} retry creates one request and waits for Reflection`, async () => {
    const h = harness()
    const session = await solveAfterLevel(h, targetLevel)
    assert.equal(session.status, 'active')
    assert.equal(session.phase, 'awaiting_reflection')
    assert.equal(session.reflection.status, 'awaiting_submission')
    assert.equal(h.sessions.get(session.session_id).reflection.support_level, targetLevel)
    assert.equal(h.eventRows.filter((item) => item.type === 'REFLECTION_REQUESTED').length, 1)
    assert.equal(h.eventRows.filter((item) => item.type === 'TUTOR_SESSION_COMPLETED').length, 0)
    assert.equal(h.evidenceRows.length, 1)
    assert.equal(h.projectionCount(), 1)
  })
}

test('LOCAL_HINTS and GUIDED_TUTOR use identical local Reflection behavior and Reflection makes no provider call', async () => {
  const local = harness({ preset: 'LOCAL_HINTS' })
  const guidedProvider = { available() { return true }, async generate(context) { return { candidate: candidate(context.decision.hint_level) } } }
  const guided = harness({ preset: 'GUIDED_TUTOR', provider: guidedProvider })
  const localSession = await solveAfterLevel(local, 2)
  const guidedSession = await solveAfterLevel(guided, 2)
  assert.equal((await local.service.get(local.actor, localSession.session_id)).reflection.prompt_text, REFLECTION_PROMPT_TEXT)
  assert.equal((await guided.service.get(guided.actor, guidedSession.session_id)).reflection.prompt_text, REFLECTION_PROMPT_TEXT)
  const providerCallsBefore = guided.providerCalls()
  await guided.service.reflect(guided.actor, guidedSession.session_id, { schema_version: PHASE_3B_SCHEMA_VERSION, idempotency_key: 'guided-reflection', response_text: 'Ich habe die Regel falsch gelesen.' })
  assert.equal(guided.providerCalls(), providerCallsBefore)
})

test('Reflection submission is event-only and leaves Evidence and Knowledge State untouched', async () => {
  const h = harness()
  const session = await solveAfterLevel(h, 2)
  const evidenceBefore = structuredClone(h.evidenceRows)
  const projectionsBefore = h.projectionCount()
  const result = await h.service.reflect(h.actor, session.session_id, {
    schema_version: PHASE_3B_SCHEMA_VERSION, idempotency_key: 'reflection-submit-one', response_text: '  Ich habe\r\ndie Regel falsch angewendet.  ',
  })
  assert.equal(result.session.status, 'completed')
  assert.equal(result.session.reflection.response_text, 'Ich habe die Regel falsch angewendet.')
  assert.deepEqual(h.evidenceRows, evidenceBefore)
  assert.equal(h.projectionCount(), projectionsBefore)
  assert.equal(h.eventRows.filter((item) => item.type === 'REFLECTION_SUBMITTED').length, 1)
  assert.equal(h.eventRows.filter((item) => item.type === 'TUTOR_SESSION_COMPLETED').length, 1)
  const internalLastSequence = h.sessions.get(session.session_id).last_sequence
  assert.equal(h.eventRows.some((item) => /EVIDENCE|KNOWLEDGE_STATE/.test(item.type) && item.sequence > internalLastSequence), false)
  const storedSession = h.sessions.get(session.session_id)
  assert.equal(JSON.stringify(storedSession).includes('Ich habe die Regel'), false)
  assert.equal(JSON.stringify(h.eventRows.filter((item) => item.type !== 'REFLECTION_SUBMITTED')).includes('Ich habe die Regel'), false)
})

test('semantic idempotency preserves one immutable first response across tokens and rejects same-token mutation', async () => {
  const h = harness()
  const session = await solveAfterLevel(h, 2)
  const input = { schema_version: PHASE_3B_SCHEMA_VERSION, idempotency_key: 'same-client-token', response_text: 'Erste gültige Antwort.' }
  const first = await h.service.reflect(h.actor, session.session_id, input)
  const replay = await h.service.reflect(h.actor, session.session_id, input)
  assert.equal(replay.reflection.response_text, first.reflection.response_text)
  await assert.rejects(h.service.reflect(h.actor, session.session_id, { ...input, response_text: 'Veränderte Antwort.' }), (error) => error.code === 'CONFLICT')
  const otherToken = await h.service.reflect(h.actor, session.session_id, { ...input, idempotency_key: 'different-token', response_text: 'Andere Antwort aus zweitem Tab.' })
  assert.equal(otherToken.reflection.response_text, 'Erste gültige Antwort.')
  assert.equal(h.eventRows.filter((item) => item.type === 'REFLECTION_SUBMITTED').length, 1)
})

test('concurrent different browser tokens converge on one response and ordered terminal events', async () => {
  const h = harness()
  const session = await solveAfterLevel(h, 3)
  const submit = (key, response_text) => h.service.reflect(h.actor, session.session_id, { schema_version: PHASE_3B_SCHEMA_VERSION, idempotency_key: key, response_text })
  const results = await Promise.all([submit('browser-token-a', 'Antwort aus Tab A.'), submit('browser-token-b', 'Antwort aus Tab B.')])
  assert.equal(results[0].reflection.response_text, results[1].reflection.response_text)
  assert.equal(h.eventRows.filter((item) => item.type === 'REFLECTION_SUBMITTED').length, 1)
  assert.equal(h.eventRows.filter((item) => item.type === 'TUTOR_SESSION_COMPLETED').length, 1)
  const sequences = h.eventRows.filter((item) => item.aggregate.type === 'tutor_session').map((item) => item.sequence)
  assert.equal(new Set(sequences).size, sequences.length)
  assert.deepEqual(sequences, [...sequences].sort((a, b) => a - b))
})

test('submission and expiry race converges on exactly one immutable terminal outcome', async () => {
  const h = harness()
  const session = await solveAfterLevel(h, 2)
  const results = await Promise.allSettled([
    h.service.reflect(h.actor, session.session_id, {
      schema_version: PHASE_3B_SCHEMA_VERSION,
      idempotency_key: 'submission-expiry-race',
      response_text: 'Die erste Auswahl war falsch.',
    }),
    h.service.expireReflection(h.actor, session),
  ])
  assert.equal(results.some((item) => item.status === 'fulfilled'), true)
  const stored = h.sessions.get(session.session_id)
  assert.equal(stored.status, 'completed')
  assert.equal(['submitted', 'expired_unsubmitted'].includes(stored.reflection.status), true)
  assert.equal(h.eventRows.filter((item) => item.type === 'TUTOR_SESSION_COMPLETED').length, 1)
  assert.equal(h.eventRows.filter((item) => item.type === 'REFLECTION_SUBMITTED').length, stored.reflection.status === 'submitted' ? 1 : 0)
})

test('event-first reconciliation preserves the canonical response text and repairs the session summary', async () => {
  const h = harness()
  const session = await solveAfterLevel(h, 2)
  const canonicalText = 'Bereits kanonisch gespeicherte Antwort.'
  const canonicalEvent = {
    event_id: generateDomainId('evt'),
    type: 'REFLECTION_SUBMITTED',
    aggregate: { type: 'tutor_session', id: session.session_id },
    sequence: session.last_sequence + 1,
    occurred_at: new Date('2026-08-26T12:01:00Z'),
    recorded_at: new Date('2026-08-26T12:01:00Z'),
    actor: { kind: 'student', id: h.actor.student_id },
    correlation_id: session.session_id,
    causation_id: session.reflection.request_event_id,
    payload: { reflection: { response_text: canonicalText } },
  }
  h.eventRows.push(canonicalEvent)
  const reconciled = await h.service.reflect(h.actor, session.session_id, {
    schema_version: PHASE_3B_SCHEMA_VERSION,
    idempotency_key: 'reconciliation-retry-key',
    response_text: 'Diese spätere Antwort darf nicht gewinnen.',
  })
  assert.equal(reconciled.reflection.response_text, canonicalText)
  assert.equal(reconciled.session.reflection.response_text, canonicalText)
  assert.equal(h.sessions.get(session.session_id).reflection.status, 'submitted')
  assert.equal(JSON.stringify(h.sessions.get(session.session_id)).includes(canonicalText), false)
  assert.equal(h.eventRows.filter((item) => item.type === 'REFLECTION_SUBMITTED').length, 1)
  assert.equal(h.eventRows.filter((item) => item.type === 'TUTOR_SESSION_COMPLETED').length, 1)
})

test('expiry closes without Reflection Evidence, support_required, or state changes', async () => {
  const h = harness()
  const session = await solveAfterLevel(h, 2)
  const evidenceBefore = structuredClone(h.evidenceRows)
  const projectionBefore = h.projectionCount()
  h.setClock('2026-08-26T13:00:00Z')
  await assert.rejects(h.service.get(h.actor, session.session_id), (error) => error.code === 'CONFLICT')
  const stored = h.sessions.get(session.session_id)
  assert.equal(stored.status, 'completed')
  assert.equal(stored.outcome, 'correct_after_hint')
  assert.equal(stored.reflection.status, 'expired_unsubmitted')
  assert.deepEqual(h.evidenceRows, evidenceBefore)
  assert.equal(h.projectionCount(), projectionBefore)
})

test('stale source and non-owner actors fail closed without persisting Reflection text', async () => {
  const h = harness()
  const session = await solveAfterLevel(h, 2)
  h.question.question = 'Geänderte Aufgabe'
  await assert.rejects(h.service.reflect(h.actor, session.session_id, { schema_version: PHASE_3B_SCHEMA_VERSION, idempotency_key: 'stale-source-key', response_text: 'Diese Antwort darf nie gespeichert werden.' }), (error) => error.code === 'NOT_FOUND')
  assert.equal(JSON.stringify(h.eventRows).includes('Diese Antwort darf nie gespeichert werden.'), false)
  const teacher = { ...h.actor, actor_type: 'teacher', role: 'teacher', student_id: null }
  await assert.rejects(h.service.reflect(teacher, session.session_id, { schema_version: PHASE_3B_SCHEMA_VERSION, idempotency_key: 'teacher-key', response_text: 'Nicht erlaubt.' }), (error) => error.code === 'FORBIDDEN')
  const other = { ...h.actor, actor_id: 'other', student_id: 'other' }
  await assert.rejects(h.service.reflect(other, session.session_id, { schema_version: PHASE_3B_SCHEMA_VERSION, idempotency_key: 'other-key', response_text: 'Nicht erlaubt.' }), (error) => error.code === 'NOT_FOUND')
})

test('Phase 3 behavior is unchanged when Phase 3b is disabled', async () => {
  const h = harness({ phase3bEnabled: false })
  const session = await solveAfterLevel(h, 2)
  assert.equal(session.status, 'completed')
  assert.equal(session.phase, 'closed')
  assert.equal(session.reflection, undefined)
  assert.equal(h.eventRows.some((item) => item.type.startsWith('REFLECTION_')), false)
})

test('bounded student and teacher UI render Reflection as escaped text with required accessibility semantics', () => {
  const student = fs.readFileSync(path.join(here, '../components/learning-v2/student/TutorReflectionCard.jsx'), 'utf8')
  const teacher = fs.readFileSync(path.join(here, '../components/learning-v2/teacher/TutorSessionDetail.jsx'), 'utf8')
  assert.match(student, /Kurze Reflexion/)
  assert.match(student, /aria-describedby/)
  assert.match(student, /aria-invalid/)
  assert.match(student, /role="status"/)
  assert.match(student, /w-full min-w-0/)
  assert.doesNotMatch(student, /dangerouslySetInnerHTML|ReactMarkdown|markdown/i)
  assert.match(teacher, /Does not affect Mastery or Confidence|mastery_statement/)
  assert.match(teacher, /whitespace-pre-wrap break-words/)
  assert.doesNotMatch(teacher, /dangerouslySetInnerHTML/)
})

for (const level of [1, 2, 3]) for (const sameKey of [true, false]) {
  test(`P0 R05 canonical incorrect L${level} survives opposite-answer replay (${sameKey ? 'same' : 'different'} key)`, async () => {
    const h = harness({ phase3bEnabled: false })
    const session = await start(h)
    for (let current = 1; current <= level; current += 1) {
      await h.service.hint(h.actor, session.session_id, { schema_version: PHASE_3_SCHEMA_VERSION, idempotency_key: `hint-prepare-${current}` })
      if (current < level) await h.service.retry(h.actor, session.session_id, { schema_version: PHASE_3_SCHEMA_VERSION, selected_response: 'Bern', idempotency_key: `retry-prepare-${current}` })
    }
    const transition = h.dependencies.sessionRepository.transition.bind(h.dependencies.sessionRepository)
    h.dependencies.sessionRepository.transition = async () => { throw new Error('fault after canonical Attempt') }
    const request = { schema_version: PHASE_3_SCHEMA_VERSION, selected_response: 'Bern', idempotency_key: 'canonical-retry-key' }
    await assert.rejects(h.service.retry(h.actor, session.session_id, request), /fault after canonical Attempt/)
    const canonical = structuredClone(h.attemptRows.at(-1))
    h.dependencies.sessionRepository.transition = transition
    const replay = await h.service.retry(h.actor, session.session_id, { ...request, selected_response: 'Paris', idempotency_key: sameKey ? request.idempotency_key : 'losing-other-key' })
    assert.equal(replay.result.correctness, 'incorrect')
    assert.equal(replay.result.outcome, level === 3 ? 'support_required' : 'pending')
    assert.deepEqual(h.attemptRows.at(-1), canonical)
    assert.equal(h.evidenceRows.some((row) => !row.supportRequired), false)
    const timeoutReplay = await h.service.retry(h.actor, session.session_id, { ...request, idempotency_key: sameKey ? request.idempotency_key : 'losing-other-key' })
    assert.deepEqual(timeoutReplay.result, replay.result)
  })
}

test('P0 R05 concurrent opposite answers share the first canonical Attempt', async () => {
  const h = harness({ phase3bEnabled: false })
  const session = await start(h)
  await h.service.hint(h.actor, session.session_id, { schema_version: PHASE_3_SCHEMA_VERSION, idempotency_key: 'concurrent-hint' })
  const responses = await Promise.all(['Bern', 'Paris'].map((selected_response, index) => h.service.retry(h.actor, session.session_id, {
    schema_version: PHASE_3_SCHEMA_VERSION, selected_response, idempotency_key: `concurrent-retry-${index}`,
  })))
  assert.equal(h.attemptRows.filter((row) => row.source.kind === 'tutor_retry').length, 1)
  assert.equal(responses[0].result.correctness, responses[1].result.correctness)
  assert.equal(responses[0].result.correctness, h.attemptRows.at(-1).outcome.correctness)
  assert.equal(h.evidenceRows.length, 0)
})

test('Reflection route is singular, strictly gated, provider-free, and learner cleanup covers its event storage', () => {
  const route = fs.readFileSync(path.join(here, '../app/api/v2/learning/tutor/sessions/[sessionId]/reflection/route.js'), 'utf8')
  const tutor = fs.readFileSync(path.join(here, '../lib/server/learning-v2/tutor/tutor-service.js'), 'utf8')
  const promptRegistry = fs.readFileSync(path.join(here, '../lib/server/learning-v2/reflection/prompt-registry.js'), 'utf8')
  const deletion = fs.readFileSync(path.join(here, '../lib/server/account-deletion.js'), 'utf8')
  assert.match(route, /requireLearningV2Phase3bDevelopmentEnabled/)
  assert.match(route, /readLearningV2Json/)
  assert.doesNotMatch(promptRegistry, /openai|gemini|provider/i)
  assert.equal(/reflection_(completed|success)|explanation_success/.test(tutor), false)
  assert.match(deletion, /PERSONAL_TENANT_CHILDREN/)
  const fence = fs.readFileSync(new URL('../lib/server/deletion-write-fence.js', import.meta.url), 'utf8')
  assert.match(fence, /'learning_events'/)
})
