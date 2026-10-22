import { localHostingEnvironment } from './helpers/local-hosting-environment.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { randomUUID } from 'node:crypto'
import * as studentMaterial from '../lib/student-material.js'
import * as workflow from '../lib/learning-workflow.js'
import * as submissionGrading from '../lib/server/submission-grading.js'
import * as questionIdentity from '../lib/server/worksheet-question-identity.js'
import { applyCorsHeaders, publicErrorMessage } from '../lib/server/security.js'
import { studentSubmissionSchema } from '../lib/server/schemas/assignments.js'
import { parseJsonBody } from '../lib/server/validation.js'
import { LearningV2Error } from '../lib/server/learning-v2/contracts/errors.js'
import { DETERMINISTIC_GRADER_VERSION, GRADING_REVISION } from '../lib/server/learning-v2/contracts/phase2.js'
import { phase5Fixture } from './helpers/phase5-fixture.mjs'
import { multipleChoiceEligibility } from '../lib/server/learning-v2/assignments/assignment-binding-service.js'
import { AttemptService } from '../lib/server/learning-v2/attempts/attempt-service.js'
import { bindAssignmentRequestSchema, PHASE_2_COEFFICIENTS } from '../lib/server/learning-v2/contracts/phase2.js'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'
import { learningV2IndexSpecifications } from '../lib/server/learning-v2/database/bootstrap.js'
import { correctnessEvidenceForAttempt } from '../lib/server/learning-v2/evidence/evidence-rules.js'
import { EvidenceService } from '../lib/server/learning-v2/evidence/evidence-service.js'
import { isLearningV2Phase2DevelopmentEnabled } from '../lib/server/learning-v2/feature-flags/learning-v2.js'
import { processLegacySubmission, safeAfterLegacySubmissionPersisted } from '../lib/server/learning-v2/integration/legacy-submission-adapter.js'
import { invalidateAutomaticEvidenceForTeacherOverride } from '../lib/server/learning-v2/integration/teacher-override-adapter.js'
import { projectKnowledgeState, projectionComparable } from '../lib/server/learning-v2/knowledge-state/projection.js'
import { ProjectionService } from '../lib/server/learning-v2/knowledge-state/projection-service.js'
import { assignmentPinsHash, issueSubmissionIntent, verifySubmissionIntent } from '../lib/server/learning-v2/submissions/submission-intent.js'

const tenantId = generateDomainId('ten')
const studentId = 'synthetic-student-1'
const competencyRef = { competency_id: generateDomainId('cmp'), framework_id: generateDomainId('frm'), framework_version: 'dev-v1' }
const actor = Object.freeze({
  actor_id: studentId, actor_type: 'student', role: 'student', tenant_id: tenantId,
  teacher_id: null, student_id: studentId, permissions: Object.freeze(['learning:read:self', 'learning:write:self']),
})
const now = new Date('2026-08-25T10:00:00.000Z')

// Execute the actual Next handler body with only its I/O/framework imports
// replaced. Node's unit runner cannot import Next's extensionless server entry.
// Live HTTP/Mongo tests separately exercise those real imports and fences.
function submissionHandlerHarness() {
  const f = phase5Fixture()
  const assignment = { id: `deadline-${f.suffix}`, code: 'P5DEADLINE', worksheet_id: f.worksheetId, status: 'active', max_attempts: 1,
    learning_v2: { enabled: true, tenant_id: f.tenantId, task_pins: [{ ...f.tasks[1].source, task_id: f.tasks[1].task_id, task_version: 1 }] } }
  const environment = { JWT_SECRET: 'synthetic-deadline-unit-test-only' }
  const issued = issueSubmissionIntent({ actor: f.student, assignment, attemptNo: 1, environment })
  const state = { rows: [], adapters: 0, updates: 0, enabled: true, authenticate: async () => f.student }
  const db = { collection(name) { return {
    async findOne(filter) {
      if (name === 'assignments') return assignment
      if (name === 'worksheets') return { id: f.worksheetId, revision: 1, content: { questions: f.questions } }
      if (name === 'submissions') return state.rows.find((row) => Object.entries(filter).every(([key, value]) => row[key] === value)) || null
      assert.fail(`Unexpected collection: ${name}`)
    },
    async countDocuments() { return state.rows.length },
    async insertOne(row) { state.rows.push(structuredClone(row)) },
    async updateOne() { state.updates++ },
  } } }
  const context = vm.createContext({ ...studentMaterial, ...workflow, ...submissionGrading, ...questionIdentity, LearningV2Error, DETERMINISTIC_GRADER_VERSION, GRADING_REVISION,
    Response, Request, structuredClone, NextResponse: { json: Response.json }, studentSubmissionSchema, parseJsonBody,
    applyCorsHeaders, publicErrorMessage, uuidv4: randomUUID, getDatabase: async () => db, checkRateLimit: async () => null,
    verifyAuthToken: () => ({ role: 'student', studentId: f.studentId }), ensureLearningV2Indexes: async () => {},
    requireAuthenticatedActor: () => state.authenticate(),
    verifySubmissionIntent: (token, args) => verifySubmissionIntent(token, { ...args, environment }),
    isLearningV2Phase2DevelopmentEnabled: () => state.enabled, isLearningV2Phase3DevelopmentEnabled: () => false,
    resolveTutorPolicy: () => ({ effective_preset: 'TUTOR_OFF' }), nextIndependentAttemptSlot: async () => 1,
    safeAfterLegacySubmissionPersisted: async () => { state.adapters++; return { processed: 1 } },
    learningV2Log() {}, console: { error() {} }, process: { env: {} },
    setTimeout(fn, ms) { state.deadline = fn; state.timeoutMs = ms; return 1 }, clearTimeout() {},
  })
  const source = readFileSync(new URL('../lib/server/student-assignments.js', import.meta.url), 'utf8')
    .replace(/^import .+$/gm, '').replace(/^export /gm, '')
  const submit = vm.runInContext(`${source}\nsubmitStudentAssignment`, context)
  return { state, f, issued, submit: (token = issued.token) => submit(new Request('http://127.0.0.1/api/student/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignmentCode: assignment.code, studentName: 'Synthetic learner', answers: f.questions.map((question) => question.answer), duration: 1,
      ...(token ? { learningV2SubmissionIntent: token } : {}) }),
  })) }
}

test('submission authority deadline consumes no attempt; the same intent retries canonically', async () => {
  for (let iteration = 0; iteration < 3; iteration++) {
    const h = submissionHandlerHarness()
    let release, entered
    const pending = new Promise((resolve) => { release = resolve })
    const started = new Promise((resolve) => { entered = resolve })
    h.state.authenticate = () => { entered(); return pending }
    const request = h.submit(); await started
    assert.equal(h.state.timeoutMs, 1500)
    h.state.deadline()
    const unavailable = await request
    assert.equal(unavailable.status, 503)
    assert.equal(unavailable.headers.get('cache-control'), 'no-store')
    assert.equal(unavailable.headers.get('retry-after'), '1')
    assert.equal(h.state.rows.length, 0); assert.equal(h.state.adapters, 0); assert.equal(h.state.updates, 0)
    release(h.f.student); await pending
    h.state.authenticate = async () => h.f.student
    const accepted = await h.submit(); assert.equal(accepted.status, 201)
    const canonical = (await accepted.json()).submissionId
    assert.equal(h.state.rows[0].learning_v2_submission_intent_id, h.issued.claims.intent_id)
    assert.equal(h.state.rows[0].learning_v2_pins_hash, h.issued.claims.pins_hash)
    assert.equal((await (await h.submit()).json()).submissionId, canonical)
    assert.equal(h.state.rows.length, 1); assert.equal(h.state.updates, 1)
  }
})

test('submission infrastructure failure cannot silently discard V2 context; invalid/absent/disabled intent stays legacy', async () => {
  for (const error of [new Error('synthetic unavailable database'), Object.assign(new Error('synthetic DB failure'), { code: 91 }), new LearningV2Error('INTERNAL_ERROR')]) {
    const h = submissionHandlerHarness(); h.state.authenticate = async () => { throw error }
    const result = await h.submit()
    assert.equal(result.status, 503); assert.equal(h.state.rows.length, 0); assert.equal(h.state.adapters, 0)
    assert.doesNotMatch(JSON.stringify(await result.json()), /synthetic|database|DB failure|INTERNAL_ERROR/)
  }
  for (const mode of ['invalid', 'absent', 'disabled', 'denied']) {
    const h = submissionHandlerHarness()
    if (mode === 'disabled') h.state.enabled = false
    if (mode === 'denied') h.state.authenticate = async () => { throw new LearningV2Error('FORBIDDEN') }
    if (mode === 'absent' || mode === 'disabled') h.state.authenticate = () => assert.fail('Legacy path must not authenticate V2')
    const result = await h.submit(mode === 'absent' ? null : mode === 'invalid' ? `${h.issued.token}tampered` : h.issued.token)
    assert.equal(result.status, 201); assert.equal(h.state.rows.length, 1)
    assert.equal(h.state.rows[0].learning_v2_tenant_id, undefined); assert.equal(h.state.adapters, 0)
  }
})

function evidence(type, task, overrides = {}) {
  return {
    evidence_id: overrides.evidence_id || generateDomainId('evd'),
    tenant_id: tenantId,
    student_id: studentId,
    type,
    target: { ...competencyRef, objective_id: generateDomainId('obj'), objective_version: 1, dimension: 'application' },
    claim: { result: type === 'correct_answer' ? 'supports' : 'challenges' },
    independence: { level: 'independent' },
    source: { kind: 'attempt', source_id: generateDomainId('att'), task_id: task, task_version: 1 },
    provenance: { producer: 'evidence-rules', producer_version: 'evidence-rules-v1', grader_version: 'legacy-deterministic-exact-v1', evidence_policy_version: 'evidence-policy-v1' },
    response_modality: 'selected_response',
    occurred_at: overrides.occurred_at || now,
    status: overrides.status || 'active',
  }
}

test('Phase 2 multiple-choice eligibility is deliberately exact and narrow', () => {
  assert.equal(multipleChoiceEligibility({ type: 'multiple_choice', options: ['A', 'B', 'C'], answer: 'B' }).eligible, true)
  assert.equal(multipleChoiceEligibility({ type: 'true_false', options: ['A', 'B', 'C'], answer: 'B' }).eligible, false)
  assert.equal(multipleChoiceEligibility({ type: 'multiple_choice', options: ['A', 'B'], answer: 'B' }).eligible, false)
  assert.equal(multipleChoiceEligibility({ type: 'multiple_choice', options: ['A', 'A', 'C'], answer: 'A' }).eligible, false)
  assert.equal(multipleChoiceEligibility({ type: 'multiple_choice', options: ['A', '', 'C'], answer: 'A' }).eligible, false)
  assert.equal(multipleChoiceEligibility({ type: 'multiple_choice', options: ['A', 'B', 'C'], answer: 'b' }).eligible, false)
})

test('assignment binding accepts exact task versions and rejects authority injection', () => {
  const valid = {
    schema_version: 'learning-v2-phase2-v1',
    task_pins: [{ question_id: generateDomainId('wqi'), task_id: generateDomainId('tsk'), task_version: 3 }],
  }
  assert.equal(bindAssignmentRequestSchema.safeParse(valid).success, true)
  assert.equal(bindAssignmentRequestSchema.safeParse({ ...valid, tenant_id: tenantId }).success, false)
  assert.equal(bindAssignmentRequestSchema.safeParse({ ...valid, task_pins: [{ ...valid.task_pins[0], content_hash: 'client-value' }] }).success, false)
})

test('signed intents bind actor, tenant, assignment, slot and exact pin hash', () => {
  const taskPins = [{
    question_id: generateDomainId('wqi'), worksheet_id: 'worksheet-1', task_id: generateDomainId('tsk'), task_version: 2,
    content_hash: `sha256:${'a'.repeat(64)}`, hash_version: 'worksheet-question-sha256-v1',
  }]
  const assignment = { id: 'assignment-1', learning_v2: { enabled: true, tenant_id: tenantId, task_pins: taskPins } }
  const environment = { JWT_SECRET: 'synthetic-secret-at-least-sixteen', LEARNING_V2_SUBMISSION_INTENT_TTL_SECONDS: '7200' }
  const first = issueSubmissionIntent({ actor, assignment, attemptNo: 1, now, environment })
  const refresh = issueSubmissionIntent({ actor, assignment, attemptNo: 1, now, environment })
  assert.notEqual(first.claims.intent_id, refresh.claims.intent_id)
  assert.equal(first.claims.learning_v2_attempt_no, refresh.claims.learning_v2_attempt_no)
  assert.equal(first.claims.pins_hash, assignmentPinsHash(taskPins))
  assert.equal(verifySubmissionIntent(first.token, { actor, assignment, now, environment }).student_id, studentId)
  assert.throws(() => verifySubmissionIntent(`${first.token}x`, { actor, assignment, now, environment }))
  assert.throws(() => verifySubmissionIntent(first.token, { actor: { ...actor, student_id: 'injected-student', actor_id: 'injected-student' }, assignment, now, environment }))
})

test('canonical submission uniqueness covers both intent and attempt slot', () => {
  const indexes = learningV2IndexSpecifications().submissions
  const intent = indexes.find((index) => index.name === 'learning_v2_submission_intent_unique')
  const slot = indexes.find((index) => index.name === 'learning_v2_submission_attempt_slot_unique')
  assert.equal(intent.unique, true)
  assert.deepEqual(intent.key, { assignment_id: 1, student_id: 1, learning_v2_submission_intent_id: 1 })
  assert.equal(slot.unique, true)
  assert.deepEqual(slot.key, { assignment_id: 1, student_id: 1, learning_v2_attempt_no: 1 })
})

test('weighted-evidence-v1 calculations use weight 0.75, neutral prior 0.5/2 and selected-response cap 0.70', () => {
  const one = projectKnowledgeState({ tenantId, studentId, competencyRef, evidence: [evidence('correct_answer', generateDomainId('tsk'))], now })
  assert.equal(one.mastery, 0.636364)
  assert.equal(one.confidence, 0.255)
  assert.equal(one.band, 'developing')

  const fourCorrect = Array.from({ length: 4 }, () => evidence('correct_answer', generateDomainId('tsk')))
  const secure = projectKnowledgeState({ tenantId, studentId, competencyRef, evidence: fourCorrect, now })
  assert.equal(secure.mastery, 0.8)
  assert.equal(secure.confidence, 0.7)
  assert.equal(secure.band, 'secure')
  assert.equal(secure.limitations.includes('selected_response_only'), true)
  assert.equal(secure.projection.calibration_status, 'DEVELOPMENT / NOT EDUCATOR-CALIBRATED')
  assert.equal(PHASE_2_COEFFICIENTS.eligible_selected_response_weight, 0.75)

  const mixed = projectKnowledgeState({
    tenantId, studentId, competencyRef,
    evidence: [evidence('correct_answer', generateDomainId('tsk')), evidence('incorrect_answer', generateDomainId('tsk'))], now,
  })
  assert.equal(mixed.mastery, 0.5)
  assert.equal(mixed.confidence, 0.54)
})

test('one-task confidence stays capped at 0.40 and confidence is not performance', () => {
  const task = generateDomainId('tsk')
  const state = projectKnowledgeState({
    tenantId, studentId, competencyRef,
    evidence: Array.from({ length: 20 }, () => evidence('correct_answer', task)), now,
  })
  assert.equal(state.confidence, 0.4)
  assert.equal(state.band, 'appears_strong')
  assert.equal(state.reason_codes.includes('CONFIDENCE_IS_ESTIMATE_CERTAINTY_NOT_PERFORMANCE'), true)
})

test('projection is order-independent, fully rebuildable and excludes invalidated evidence', () => {
  const activeCorrect = evidence('correct_answer', generateDomainId('tsk'))
  const activeIncorrect = evidence('incorrect_answer', generateDomainId('tsk'))
  const invalidated = evidence('correct_answer', generateDomainId('tsk'), { status: 'invalidated' })
  const first = projectKnowledgeState({ tenantId, studentId, competencyRef, evidence: [activeCorrect, activeIncorrect, invalidated], now })
  const rebuilt = projectKnowledgeState({ tenantId, studentId, competencyRef, evidence: [invalidated, activeIncorrect, activeCorrect], now })
  assert.deepEqual(projectionComparable(first), projectionComparable(rebuilt))
  assert.equal(first.evidence_count, 2)
  assert.equal(first.positive_count, 1)
  assert.equal(first.mastery, 0.5)
})

test('projection compare-and-set conflicts trigger a full evidence reload instead of a stale overwrite', async () => {
  let evidenceReads = 0
  let replacements = 0
  const currentEvidence = [evidence('correct_answer', generateDomainId('tsk'))]
  const projection = new ProjectionService(
    { async snapshotForCompetency() { evidenceReads += 1; return { evidence: currentEvidence, sourceRevision: evidenceReads } } },
    {
      async replace(_actor, state) {
        replacements += 1
        return replacements === 1 ? { conflict: true, changed: false, state: null } : { conflict: false, changed: true, state }
      },
    },
    { async record() {} },
    { now: () => now },
  )
  const state = await projection.rebuild(actor, studentId, competencyRef)
  assert.equal(evidenceReads, 2)
  assert.equal(replacements, 2)
  assert.equal(state.evidence_count, 1)
})

test('unanswered attempts produce no pedagogical Evidence and independence stays an attribute', () => {
  const attempt = {
    attempt_id: generateDomainId('att'), student_id: studentId,
    answer: { type: 'selected_response', value: '' }, independence: { level: 'independent' },
    outcome: { correctness: 'incorrect', grader_version: 'legacy-deterministic-exact-v1' },
    primary_competency_ref: competencyRef, objective_ref: { objective_id: generateDomainId('obj'), version: 1 },
    task_ref: { task_id: generateDomainId('tsk'), version: 1 },
  }
  assert.equal(correctnessEvidenceForAttempt(attempt), null)
  attempt.answer.value = 'A'
  const result = correctnessEvidenceForAttempt(attempt)
  assert.equal(result.type, 'incorrect_answer')
  assert.equal(result.independence.level, 'independent')
  assert.equal(result.type === 'independent_success', false)
})

test('immutable Attempt snapshots primary and supporting targets but keeps one primary outcome', async () => {
  let stored
  const service = new AttemptService(
    { async insertCanonical(_actor, document) { stored = document; return document } },
    { async record() {} },
    { now: () => now },
  )
  const supporting = { competency_id: generateDomainId('cmp'), framework_id: competencyRef.framework_id, framework_version: 'dev-v1', role: 'supporting' }
  const task = {
    task_id: generateDomainId('tsk'), version: 2,
    objective_refs: [{ objective_id: generateDomainId('obj'), version: 3 }],
    competency_targets: [{ ...competencyRef, role: 'primary' }, supporting],
  }
  const questionId = generateDomainId('wqi')
  const pin = {
    question_id: questionId, task_id: task.task_id, task_version: task.version,
    content_hash: `sha256:${'b'.repeat(64)}`, hash_version: 'worksheet-question-sha256-v1',
  }
  const attempt = await service.recordLegacyQuestion(actor, {
    assignment: { id: 'assignment-1' }, worksheet: { id: 'worksheet-1' }, task, pin, questionIndex: 0,
    submission: {
      id: 'submission-1', learning_v2_attempt_no: 1, learning_v2_submission_intent_id: 'intent-1',
      submitted_at: now, duration: 30,
    },
    result: {
      studentAnswer: 'B', isCorrect: true, pointsAwarded: 1, maxPoints: 1,
      sourceRevision: 2, contentHash: pin.content_hash, hashVersion: pin.hash_version, gradingRevision: 1,
    },
  })
  assert.equal(attempt.primary_competency_ref.competency_id, competencyRef.competency_id)
  assert.deepEqual(attempt.supporting_competency_refs, [supporting])
  assert.equal(stored.outcome.correctness, 'correct')
  assert.equal(stored.independence.level, 'independent')
})

test('evidence service retry resolves to one canonical correctness Evidence', async () => {
  const records = new Map()
  const repository = {
    async insertCanonical(_actor, document) {
      if (!records.has(document.idempotency_key)) records.set(document.idempotency_key, document)
      return records.get(document.idempotency_key)
    },
  }
  const events = { async record() {} }
  const service = new EvidenceService(repository, events, { now: () => now })
  const attempt = {
    attempt_id: generateDomainId('att'), student_id: studentId, submitted_at: now,
    answer: { type: 'selected_response', value: 'B' }, independence: { level: 'independent' },
    outcome: { correctness: 'correct', grader_version: 'legacy-deterministic-exact-v1' },
    primary_competency_ref: competencyRef, objective_ref: { objective_id: generateDomainId('obj'), version: 1 },
    task_ref: { task_id: generateDomainId('tsk'), version: 1 },
    source: { submission_id: 'submission-1' },
  }
  const first = await service.recordForAttempt(actor, attempt)
  const retry = await service.recordForAttempt(actor, attempt)
  assert.equal(records.size, 1)
  assert.equal(first.evidence_id, retry.evidence_id)
})

test('tenant or student mismatch cannot be injected into the adapter', async () => {
  const result = await processLegacySubmission({
    db: {}, actor,
    assignment: { id: 'assignment-1' }, worksheet: {},
    submission: { id: 'submission-1', student_id: 'injected-student', learning_v2_tenant_id: tenantId },
    services: {},
  })
  assert.equal(result.processed, 0)
  assert.equal(result.skipped[0].reason, 'TENANT_MISMATCH')
})

test('teacher override invalidates automatic Evidence, rebuilds state and emits no teacher assessment', async () => {
  const teacher = Object.freeze({
    actor_id: 'synthetic-teacher-1', actor_type: 'teacher', role: 'teacher', tenant_id: tenantId,
    teacher_id: 'synthetic-teacher-1', student_id: null, permissions: Object.freeze(['learning:read', 'learning:write']),
  })
  const automatic = evidence('correct_answer', generateDomainId('tsk'))
  const calls = { invalidation: null, eventTypes: [], rebuilds: [] }
  const services = {
    attemptRepository: { async findBySubmission() { return [{ attempt_id: automatic.source.source_id }] } },
    evidenceRepository: {
      async invalidateForAttempts(_actor, ids, invalidation) {
        calls.invalidation = { ids, invalidation }
        return [{ ...automatic, status: 'invalidated', invalidation }]
      },
    },
    events: { async record(_actor, event) { calls.eventTypes.push(event.type) } },
    projection: { async rebuild(_actor, targetStudent, target, correlation) { calls.rebuilds.push({ targetStudent, target, correlation }) } },
  }
  const result = await invalidateAutomaticEvidenceForTeacherOverride({
    db: { collection(name) { return { async findOne() { return name === 'classes' ? { enrolled_students: [{ student_id: studentId }] } : { id: studentId } }, find() { return { project() { return this }, async toArray() { return [{ tenant_id: tenantId, role: 'student' }] } } } } } }, actor: teacher, submission: { id: 'submission-1', student_id: studentId, learning_v2_tenant_id: tenantId },
    questionId: generateDomainId('wqi'), services, now,
  })
  assert.equal(result.invalidated, 1)
  assert.equal(calls.invalidation.invalidation.reason, 'teacher_override')
  assert.deepEqual(calls.eventTypes, ['EVIDENCE_INVALIDATED'])
  assert.equal(calls.eventTypes.includes('TEACHER_ASSESSMENT_RECORDED'), false)
  assert.equal(calls.rebuilds.length, 1)
})

test('the hard adapter boundary absorbs a complete V2 failure', async () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, enabled: process.env.LEARNING_V2_ENABLED, phase2: process.env.LEARNING_V2_PHASE_2_ENABLED }
  process.env.NODE_ENV = 'test'
  process.env.LEARNING_V2_ENABLED = 'true'
  process.env.LEARNING_V2_PHASE_2_ENABLED = 'true'
  try {
    const result = await safeAfterLegacySubmissionPersisted({
      db: {}, actor,
      assignment: { id: 'assignment-1' }, worksheet: {},
      submission: {
        id: 'submission-1', student_id: studentId, learning_v2_tenant_id: tenantId,
        learning_v2_submission_intent_id: 'intent-1', learning_v2_attempt_no: 1,
        learning_v2_task_pins: [{ question_id: generateDomainId('wqi') }], submitted_at: now,
      },
      services: { events: { async record() { throw new Error('complete V2 outage') } } },
    })
    assert.deepEqual(result, { status: 'failed', reason: 'ADAPTER_FAILURE' })
  } finally {
    if (previous.NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.NODE_ENV
    if (previous.enabled === undefined) delete process.env.LEARNING_V2_ENABLED; else process.env.LEARNING_V2_ENABLED = previous.enabled
    if (previous.phase2 === undefined) delete process.env.LEARNING_V2_PHASE_2_ENABLED; else process.env.LEARNING_V2_PHASE_2_ENABLED = previous.phase2
  }
})

test('a hung V2 adapter times out without owning the legacy success decision', async () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV, enabled: process.env.LEARNING_V2_ENABLED,
    phase2: process.env.LEARNING_V2_PHASE_2_ENABLED, timeout: process.env.LEARNING_V2_LEGACY_ADAPTER_TIMEOUT_MS,
  }
  process.env.NODE_ENV = 'test'
  process.env.LEARNING_V2_ENABLED = 'true'
  process.env.LEARNING_V2_PHASE_2_ENABLED = 'true'
  process.env.LEARNING_V2_LEGACY_ADAPTER_TIMEOUT_MS = '100'
  try {
    const started = Date.now()
    const result = await safeAfterLegacySubmissionPersisted({
      db: {}, actor,
      assignment: { id: 'assignment-1' }, worksheet: {},
      submission: {
        id: 'submission-hung', student_id: studentId, learning_v2_tenant_id: tenantId,
        learning_v2_submission_intent_id: 'intent-1', learning_v2_attempt_no: 1,
        learning_v2_task_pins: [{ question_id: generateDomainId('wqi') }], submitted_at: now,
      },
      services: { events: { record() { return new Promise(() => {}) } } },
    })
    assert.deepEqual(result, { status: 'failed', reason: 'ADAPTER_TIMEOUT' })
    assert.equal(Date.now() - started < 500, true)
  } finally {
    for (const [key, value] of Object.entries({
      NODE_ENV: previous.NODE_ENV, LEARNING_V2_ENABLED: previous.enabled,
      LEARNING_V2_PHASE_2_ENABLED: previous.phase2, LEARNING_V2_LEGACY_ADAPTER_TIMEOUT_MS: previous.timeout,
    })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  }
})

test('Phase 2 is fail-closed in production and contains no Tutor/AI feature implementation', () => {
  assert.equal(isLearningV2Phase2DevelopmentEnabled({ ...localHostingEnvironment, NODE_ENV: 'production', LEARNING_V2_ENABLED: 'true', LEARNING_V2_PHASE_2_ENABLED: 'true' }), false)
  const root = fileURLToPath(new URL('../lib/server/learning-v2/', import.meta.url))
  const phase2Files = [
    'attempts/attempt-service.js', 'evidence/evidence-service.js', 'integration/legacy-submission-adapter.js',
    'knowledge-state/projection.js', 'reconciliation/reconciliation-service.js',
  ]
  for (const relative of phase2Files) {
    const source = readFileSync(`${root}/${relative}`, 'utf8')
    assert.doesNotMatch(source, /from ['"].*(openai|gemini|tutor|hint|reflection|recommend)/i)
  }
})
