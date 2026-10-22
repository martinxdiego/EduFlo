import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  assignmentDraftBinding,
  assignmentDraftStorage,
  clearAllAssignmentDrafts,
  clearExpiredAssignmentDrafts,
  clearForeignAuthenticatedDrafts,
  readAssignmentDraft,
  STUDENT_ASSIGNMENT_DRAFT_TTL_MS,
  STUDENT_ASSIGNMENT_DRAFT_VERSION,
  writeAssignmentDraft,
} from '../lib/client/student-assignment-drafts.js'
import { learningV2RouteId } from '../lib/server/learning-v2/http/route-identity.js'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'
import {
  correlatedLearningV2LogId,
  redactLearningV2LogMetadata,
} from '../lib/server/learning-v2/privacy/redaction.js'
import {
  STUDENT_TUTOR_DTO_VERSION,
  studentTutorSessionDto,
} from '../lib/server/learning-v2/tutor/student-tutor-dto.js'
import { TutorSessionRepository } from '../lib/server/learning-v2/tutor/tutor-session-repository.js'
import { PUBLIC_V2_ROUTES } from '../scripts/learning-v2-release/routes-v1.mjs'

class MemoryStorage {
  constructor() { this.values = new Map() }
  get length() { return this.values.size }
  key(index) { return [...this.values.keys()][index] ?? null }
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
}

const sourceVersion = `student-assignment-draft-source-v1:${'a'.repeat(64)}`
const assignment = { assignmentId: 'assignment-synthetic', assignmentCode: 'ABCD12', draftSourceVersion: sourceVersion }
const studentA = { id: 'student-synthetic-a' }
const studentB = { id: 'student-synthetic-b' }
const now = new Date('2026-08-31T10:00:00.000Z')

function internalSession(overrides = {}) {
  return {
    _id: 'mongo-internal-id',
    session_id: 'ses_00000000-0000-4000-8000-000000000001',
    schema_version: 'tutor-session-v1',
    tenant_id: 'ten_00000000-0000-4000-8000-000000000001',
    student_id: 'student-synthetic-a',
    assignment_id: 'assignment-synthetic',
    task_ref: { task_id: 'tsk_private', version: 7 },
    objective_ref: { objective_id: 'obj_private', version: 3 },
    trigger_attempt_id: 'att_private',
    start_key: 'private-start-key',
    policy_ref: { policy_id: 'pol_private', version: 4, content_hash: 'sha256:private' },
    preset: 'GUIDED_TUTOR',
    model_config: { provider: 'openai', model: 'private-model', prompt_version: 'private-prompt' },
    status: 'active', phase: 'awaiting_retry', outcome: 'pending',
    highest_hint_level: 1, hint_count: 1, retry_count: 0,
    state_version: 9, last_sequence: 8,
    last_hint: { idempotency_key: 'private-idempotency', source: 'openai' },
    hint_receipts: [{ idempotency_key: 'private-receipt' }],
    internal_canary_added_later: 'must-never-leak',
    expires_at: new Date('2026-08-31T10:30:00.000Z'), completed_at: null,
    ...overrides,
  }
}

test('Student Tutor DTO is versioned, allowlist-only, and excludes every internal canary', () => {
  const dto = studentTutorSessionDto(internalSession())
  assert.equal(dto.dto_version, STUDENT_TUTOR_DTO_VERSION)
  assert.deepEqual(Object.keys(dto).sort(), [
    'completed_at', 'dto_version', 'expires_at', 'highest_hint_level', 'hint_count',
    'outcome', 'phase', 'retry_count', 'session_id', 'status',
  ])
  const serialized = JSON.stringify(dto)
  for (const canary of ['must-never-leak', 'private-idempotency', 'private-model', 'sha256:private', 'ten_', 'student-synthetic-a']) {
    assert.equal(serialized.includes(canary), false)
  }
})

test('Student Tutor DTO exposes only the UI reflection presentation and own submitted text', () => {
  const dto = studentTutorSessionDto(internalSession({
    status: 'completed', phase: 'closed', outcome: 'correct_after_hint',
    reflection: {
      status: 'submitted', type: 'identify_mistake', support_level: 2,
      final_attempt_id: 'att_private', request_event_id: 'evt_private', submission_event_id: 'evt_private_2',
      requested_at: new Date('2026-08-31T10:10:00.000Z'), submitted_at: new Date('2026-08-31T10:11:00.000Z'),
    },
  }), { reflection: {
    promptText: 'Was war dein Denkfehler?', locale: 'de-CH', maximumResponseCharacters: 300,
    maximumResponseWords: 60, responseText: 'Ich habe die Regel verwechselt.',
  } })
  assert.deepEqual(dto.reflection, {
    status: 'submitted', type: 'identify_mistake', requested_at: '2026-08-31T10:10:00.000Z',
    prompt_text: 'Was war dein Denkfehler?', locale: 'de-CH', maximum_response_characters: 300,
    maximum_response_words: 60, submitted_at: '2026-08-31T10:11:00.000Z',
    response_text: 'Ich habe die Regel verwechselt.',
  })
  assert.equal(JSON.stringify(dto).includes('att_private'), false)
  assert.equal(JSON.stringify(dto).includes('evt_private'), false)
})

test('Tutor student lookup is fail-closed on both authoritative tenant and student', async () => {
  let filter
  const repository = new TutorSessionRepository({ collection() { return { async findOne(value) { filter = value; return null } } } })
  const tenantId = generateDomainId('ten')
  const actor = { tenant_id: tenantId, student_id: 'student-synthetic-a' }
  assert.equal(await repository.findForStudent(actor, 'ses_synthetic'), null)
  assert.deepEqual(filter, { tenant_id: tenantId, session_id: 'ses_synthetic', student_id: 'student-synthetic-a' })
})

test('Learning V2 route logs resolve every manifest sample to a static template', () => {
  for (const route of PUBLIC_V2_ROUTES) {
    for (const method of route.methods) {
      const request = { method, url: `https://example.test${route.path}?student_id=raw-canary` }
      assert.equal(learningV2RouteId(request), `${method} ${route.template}`)
    }
  }
  assert.equal(learningV2RouteId({ method: 'GET', url: 'https://example.test/api/v2/learning/new/raw-id' }), 'GET /api/v2/learning/[unmapped]')
})

test('Learning log redaction removes direct, path, query, encoded, nested, token, and content canaries', () => {
  const rawSession = 'ses_00000000-0000-4000-8000-000000000001'
  const rawTenant = 'ten_00000000-0000-4000-8000-000000000002'
  const safe = redactLearningV2LogMetadata({
    session_id: rawSession,
    neutral_path: `/api/v2/learning/tutor/sessions/${rawSession}/hints`,
    neutral_query: `status=failed&tenant=${rawTenant}`,
    encoded_value: encodeURIComponent(`/api/v2/learning/tutor/sessions/${rawSession}?tenant=${rawTenant}`),
    nested: { message: `request failed for session-${rawSession}` },
    route_id: 'POST /api/v2/learning/tutor/sessions/[sessionId]/hints',
    authorization: 'Bearer secret-token',
    reflection: { response_text: 'private learner reflection' },
    status: 'rejected',
  })
  const serialized = JSON.stringify(safe)
  for (const canary of [rawSession, rawTenant, 'secret-token', 'private learner reflection']) assert.equal(serialized.includes(canary), false)
  assert.equal(safe.session_id, '[OMITTED]')
  assert.equal(safe.route_id, 'POST /api/v2/learning/tutor/sessions/[sessionId]/hints')
  assert.equal(safe.status, 'rejected')
})

test('correlation helper requires explicit configuration and is environment-specific HMAC, not stable SHA', () => {
  const value = 'student-synthetic-correlation'
  const key = 'synthetic-test-key-with-at-least-32-characters'
  assert.throws(() => correlatedLearningV2LogId(value), /HMAC key/u)
  const testId = correlatedLearningV2LogId(value, { key, environment: 'test-a' })
  const otherEnvironmentId = correlatedLearningV2LogId(value, { key, environment: 'test-b' })
  const nakedSha = createHash('sha256').update(value).digest('hex')
  assert.match(testId, /^hmac256:[0-9a-f]{24}$/u)
  assert.notEqual(testId, otherEnvironmentId)
  assert.equal(testId.includes(nakedSha.slice(0, 16)), false)
})

test('authenticated draft is actor/assignment/source/schema bound with short absolute TTL', () => {
  const storage = new MemoryStorage()
  const binding = assignmentDraftBinding({ student: studentA, assignment })
  assert.equal(writeAssignmentDraft(storage, binding, { answers: { 0: 'Bern' }, currentQuestion: 1, submissionIntent: 'forbidden' }, { now }), true)
  const raw = [...storage.values.values()][0]
  const envelope = JSON.parse(raw)
  assert.equal(envelope.schema_version, STUDENT_ASSIGNMENT_DRAFT_VERSION)
  assert.equal(Date.parse(envelope.expires_at) - Date.parse(envelope.created_at), STUDENT_ASSIGNMENT_DRAFT_TTL_MS)
  assert.equal(raw.includes('forbidden'), false)
  assert.deepEqual(readAssignmentDraft(storage, binding, { now }), { answers: { 0: 'Bern' }, currentQuestion: 1 })
})

test('same assignment code cannot restore another actor draft and mismatch deletes it', () => {
  const storage = new MemoryStorage()
  const actorA = assignmentDraftBinding({ student: studentA, assignment })
  const actorB = assignmentDraftBinding({ student: studentB, assignment })
  writeAssignmentDraft(storage, actorA, { answers: { 0: 'A' }, currentQuestion: 0 }, { now })
  assert.equal(readAssignmentDraft(storage, actorB, { now }), null)
  assert.equal(storage.length, 0)
})

test('changed source version and expiration invalidate and delete drafts', () => {
  const storage = new MemoryStorage()
  const binding = assignmentDraftBinding({ student: studentA, assignment })
  writeAssignmentDraft(storage, binding, { answers: { 0: 'A' }, currentQuestion: 0 }, { now })
  const changed = assignmentDraftBinding({ student: studentA, assignment: { ...assignment, draftSourceVersion: `${sourceVersion}-changed` } })
  assert.equal(readAssignmentDraft(storage, changed, { now }), null)
  writeAssignmentDraft(storage, binding, { answers: { 0: 'A' }, currentQuestion: 0 }, { now })
  const expiredAt = new Date(now.getTime() + STUDENT_ASSIGNMENT_DRAFT_TTL_MS + 1)
  clearExpiredAssignmentDrafts(storage, { now: expiredAt })
  assert.equal(storage.length, 0)
})

test('guest draft contract is session-scoped and logout cleanup removes authenticated and guest drafts', () => {
  const localStorage = new MemoryStorage()
  const sessionStorage = new MemoryStorage()
  const authenticated = assignmentDraftBinding({ student: studentA, assignment })
  const guest = assignmentDraftBinding({ assignment, guest: true })
  assert.equal(guest.storageScope, 'guest')
  const browser = { localStorage, sessionStorage }
  assert.equal(assignmentDraftStorage(browser, false), localStorage)
  assert.equal(assignmentDraftStorage(browser, true), sessionStorage)
  writeAssignmentDraft(assignmentDraftStorage(browser, false), authenticated, { answers: {}, currentQuestion: 0 }, { now })
  writeAssignmentDraft(assignmentDraftStorage(browser, true), guest, { answers: {}, currentQuestion: 0 }, { now })
  clearForeignAuthenticatedDrafts(localStorage, studentB.id)
  assert.equal(localStorage.length, 0)
  writeAssignmentDraft(localStorage, authenticated, { answers: {}, currentQuestion: 0 }, { now })
  clearAllAssignmentDrafts(localStorage, sessionStorage)
  assert.equal(localStorage.length, 0)
  assert.equal(sessionStorage.length, 0)
  assert.equal(readAssignmentDraft(localStorage, assignmentDraftBinding({ student: studentB, assignment }), { now }), null)
})

test('corrupted or unavailable storage fails safe and never restores a draft', () => {
  const storage = new MemoryStorage()
  const binding = assignmentDraftBinding({ student: studentA, assignment })
  storage.setItem('eduflow_assignment_draft_v2:ABCD12', '{broken-json')
  assert.equal(readAssignmentDraft(storage, binding, { now }), null)
  assert.equal(storage.length, 0)
  const unavailable = { get length() { throw new Error('blocked') }, getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') } }
  assert.equal(assignmentDraftStorage({ get localStorage() { throw new Error('blocked') } }, false), null)
  assert.equal(writeAssignmentDraft(unavailable, binding, { answers: {}, currentQuestion: 0 }, { now }), false)
  assert.equal(readAssignmentDraft(unavailable, binding, { now }), null)
  assert.doesNotThrow(() => clearExpiredAssignmentDrafts(unavailable, { now }))
  assert.doesNotThrow(() => clearForeignAuthenticatedDrafts(unavailable, studentA.id))
  assert.doesNotThrow(() => clearAllAssignmentDrafts(unavailable))
})
