import { localHostingEnvironment } from './helpers/local-hosting-environment.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import {
  generateDomainId,
  isDomainId,
  tenantIdSchema,
} from '../lib/server/learning-v2/contracts/ids.js'
import {
  actorContextSchema,
  boundedTextSchema,
  paginationSchema,
  utcTimestampSchema,
} from '../lib/server/learning-v2/contracts/schemas.js'
import {
  LearningV2Error,
  learningV2ErrorPayload,
  validationError,
} from '../lib/server/learning-v2/contracts/errors.js'
import {
  requireAuthenticatedActor,
  requireDurableLearner,
  requireStudent,
  requireTeacher,
} from '../lib/server/learning-v2/auth/learning-authorization.js'
import {
  ensurePersonalTenant,
  requireSameTenant,
  tenantScopedFilter,
} from '../lib/server/learning-v2/auth/tenant-context.js'
import {
  isLearningV2Enabled,
  requireLearningV2Enabled,
} from '../lib/server/learning-v2/feature-flags/learning-v2.js'
import {
  createContextManifest,
  redactLearningV2LogMetadata,
} from '../lib/server/learning-v2/privacy/redaction.js'
import { learningV2Log } from '../lib/server/learning-v2/privacy/logger.js'
import { buildLearningV2RateLimitKey } from '../lib/server/learning-v2/rate-limit/composite-key.js'
import {
  ensureLearningV2Indexes,
  inspectLearningV2Indexes,
  learningV2IndexSpecifications,
} from '../lib/server/learning-v2/database/bootstrap.js'
import { deleteTeacherAccountData } from '../lib/server/account-deletion.js'

process.env.JWT_SECRET = 'learning-v2-phase-0-test-secret-with-sufficient-entropy'

const teacherTenantId = generateDomainId('ten')
const studentTenantId = generateDomainId('ten')

function matches(document, query) {
  return Object.entries(query).every(([key, expected]) => expected && typeof expected === 'object' && '$exists' in expected ? (document[key] !== undefined) === expected.$exists : document[key] === expected)
}

function fixtureDb(seed = {}) {
  const state = {
    users: [...(seed.users || [])],
    students: [...(seed.students || [])],
    learning_v2_tenants: [...(seed.tenants || [])],
    learning_v2_tenant_memberships: [...(seed.memberships || [])],
  }
  return {
    state, client: { startSession() { return { async withTransaction(fn) { return fn() }, async endSession() {} } } },
    collection(name) {
      const documents = state[name] || (state[name] = [])
      return {
        async findOne(query) {
          return documents.find((document) => matches(document, query)) || null
        },
        find(query) {
          const result = documents.filter((document) => matches(document, query))
          return {
            project() { return this },
            async toArray() { return result },
          }
        },
        async findOneAndUpdate(query, update) {
          let document = documents.find((candidate) => matches(candidate, query))
          if (!document) {
            document = { ...query, ...(update.$setOnInsert || {}) }
            documents.push(document)
          }
          return document
        },
        async updateOne(query, update, options = {}) {
          let document = documents.find((candidate) => matches(candidate, query))
          if (!document && options.upsert) {
            document = { ...query, ...(update.$setOnInsert || {}) }
            documents.push(document)
          }
          if (document && update.$set) Object.assign(document, update.$set)
          return { matchedCount: document ? 1 : 0, upsertedCount: document ? 1 : 0 }
        },
      }
    },
  }
}

function dbForActors() {
  return fixtureDb({
    users: [{ id: 'teacher-1' }],
    students: [{ id: 'student-1' }],
    tenants: [
      { tenant_id: teacherTenantId, type: 'personal', owner_teacher_id: 'teacher-1', status: 'active' },
      { tenant_id: studentTenantId, type: 'school', status: 'active' },
    ],
    memberships: [
      { actor_type: 'teacher', actor_id: 'teacher-1', tenant_id: teacherTenantId, role: 'teacher', status: 'active' },
      { actor_type: 'student', actor_id: 'student-1', tenant_id: studentTenantId, role: 'student', status: 'active' },
    ],
  })
}

function bearerRequest(payload, options = {}) {
  const { method = 'GET', body, ...tokenOptions } = options
  const token = jwt.sign(payload, process.env.JWT_SECRET, tokenOptions)
  return new Request('https://app.example/api/v2/learning/context', {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body,
  })
}

test('UUIDv7 domain IDs are generated, sortable-looking, prefixed and validated', () => {
  const first = generateDomainId('ten')
  const second = generateDomainId('evt')
  assert.equal(isDomainId(first, 'ten'), true)
  assert.equal(isDomainId(second, 'evt'), true)
  assert.equal(isDomainId(first, 'evt'), false)
  assert.equal(tenantIdSchema.safeParse(first).success, true)
  assert.throws(() => generateDomainId('student'))
})

test('arbitrary strings, UUIDv4 values and malformed domain IDs are rejected', () => {
  assert.equal(isDomainId('ten_not-a-uuid'), false)
  assert.equal(isDomainId('ten_550e8400-e29b-41d4-a716-446655440000'), false)
  assert.equal(isDomainId('unknown_01a0357c-5014-736b-a0a1-d280b5fdbbe7'), false)
})

test('shared contracts reject malformed, unknown and oversized values', () => {
  assert.equal(boundedTextSchema(10).safeParse('x'.repeat(11)).success, false)
  assert.equal(utcTimestampSchema.safeParse('2026-08-24T10:00:00Z').success, true)
  assert.equal(utcTimestampSchema.safeParse('2026-08-24 10:00:00').success, false)
  assert.equal(utcTimestampSchema.safeParse('2026-02-31T10:00:00Z').success, false)
  assert.equal(paginationSchema.safeParse({ limit: 101 }).success, false)
  assert.equal(paginationSchema.safeParse({ limit: 10, role: 'teacher' }).success, false)
})

test('actor context schema is strict and enforces role-specific identities', () => {
  const base = {
    actor_id: 'teacher-1', actor_type: 'teacher', role: 'teacher', tenant_id: teacherTenantId,
    teacher_id: 'teacher-1', student_id: null, permissions: ['learning:read'],
  }
  assert.equal(actorContextSchema.safeParse(base).success, true)
  assert.equal(actorContextSchema.safeParse({ ...base, role: 'student' }).success, false)
  assert.equal(actorContextSchema.safeParse({ ...base, email: 'teacher@example.test' }).success, false)
})

test('unauthenticated and invalid-token requests fail safely', async () => {
  await assert.rejects(
    requireAuthenticatedActor(new Request('https://app.example/api/v2/learning/context'), { db: dbForActors() }),
    (error) => error.code === 'UNAUTHENTICATED',
  )
  const invalid = new Request('https://app.example/api/v2/learning/context', {
    headers: { Authorization: 'Bearer invalid-token' },
  })
  await assert.rejects(
    requireAuthenticatedActor(invalid, { db: dbForActors() }),
    (error) => error.code === 'UNAUTHENTICATED',
  )
})

test('expired tokens are rejected before actor resolution', async () => {
  const request = bearerRequest({ userId: 'teacher-1' }, { expiresIn: -1 })
  await assert.rejects(
    requireAuthenticatedActor(request, { db: dbForActors() }),
    (error) => error.code === 'UNAUTHENTICATED',
  )
})

test('teacher sessions issued before a password change are rejected', async () => {
  const db = dbForActors()
  db.state.users[0].password_changed_at = new Date(Date.now() + 5_000)
  await assert.rejects(
    requireAuthenticatedActor(bearerRequest({ userId: 'teacher-1' }, { expiresIn: '5m' }), { db }),
    (error) => error.code === 'UNAUTHENTICATED',
  )
})

test('authenticated teacher identity, role and tenant are server-derived', async () => {
  const request = bearerRequest({ userId: 'teacher-1', role: 'student', tenant_id: studentTenantId })
  const actor = await requireAuthenticatedActor(request, { db: dbForActors() })
  assert.deepEqual(actor, {
    actor_id: 'teacher-1', actor_type: 'teacher', role: 'teacher', tenant_id: teacherTenantId,
    teacher_id: 'teacher-1', student_id: null,
    permissions: ['learning:read', 'learning:write', 'learning:read:students'],
  })
  assert.equal(requireTeacher(actor), actor)
  assert.throws(() => requireStudent(actor), (error) => error.code === 'FORBIDDEN')
})

test('authenticated student identity, role and tenant are server-derived', async () => {
  const actor = await requireAuthenticatedActor(
    bearerRequest({ studentId: 'student-1', role: 'teacher', tenant_id: teacherTenantId }),
    { db: dbForActors() },
  )
  assert.equal(actor.actor_type, 'student')
  assert.equal(actor.role, 'student')
  assert.equal(actor.tenant_id, studentTenantId)
  assert.equal(requireStudent(actor), actor)
  assert.equal(requireDurableLearner(actor), actor)
  assert.throws(() => requireTeacher(actor), (error) => error.code === 'FORBIDDEN')
})

test('request body identities and tenant values cannot override server context', async () => {
  const request = bearerRequest(
    { userId: 'teacher-1' },
    { method: 'POST', expiresIn: '5m', body: JSON.stringify({
      user_id: 'attacker', teacher_id: 'attacker', role: 'student', tenant_id: studentTenantId,
    }) },
  )
  const actor = await requireAuthenticatedActor(request, { db: dbForActors() })
  assert.equal(actor.actor_id, 'teacher-1')
  assert.equal(actor.tenant_id, teacherTenantId)
  assert.equal(actor.role, 'teacher')
})

test('missing, foreign and ambiguous tenant contexts fail closed', async () => {
  const missingDb = fixtureDb({ students: [{ id: 'student-1' }] })
  await assert.rejects(
    requireAuthenticatedActor(bearerRequest({ studentId: 'student-1' }, { expiresIn: '5m' }), { db: missingDb }),
    (error) => error.code === 'FORBIDDEN',
  )

  const ambiguousDb = dbForActors()
  ambiguousDb.state.learning_v2_tenant_memberships.push({
    actor_type: 'student', actor_id: 'student-1', tenant_id: teacherTenantId, role: 'student', status: 'active',
  })
  await assert.rejects(
    requireAuthenticatedActor(bearerRequest({ studentId: 'student-1' }, { expiresIn: '5m' }), { db: ambiguousDb }),
    (error) => error.code === 'FORBIDDEN',
  )

  const actor = await requireAuthenticatedActor(bearerRequest({ userId: 'teacher-1' }, { expiresIn: '5m' }), { db: dbForActors() })
  assert.throws(() => requireSameTenant(actor, studentTenantId), (error) => error.code === 'NOT_FOUND')
  assert.throws(
    () => tenantScopedFilter(actor, { tenant_id: studentTenantId, status: 'active' }),
    (error) => error.code === 'NOT_FOUND',
  )
  assert.deepEqual(tenantScopedFilter(actor, { status: 'active' }), { status: 'active', tenant_id: teacherTenantId })
})

test('personal tenant creation is stable and idempotent for a teacher', async () => {
  const db = fixtureDb({ users: [{ id: 'teacher-new' }] })
  const first = await ensurePersonalTenant(db, 'teacher-new')
  const second = await ensurePersonalTenant(db, 'teacher-new')
  assert.equal(first.tenant_id, second.tenant_id)
  assert.equal(isDomainId(first.tenant_id, 'ten'), true)
  assert.equal(db.state.learning_v2_tenants.length, 1)
  assert.equal(db.state.learning_v2_tenant_memberships.length, 1)
})

test('guests and teachers cannot pass the durable learner write guard', () => {
  assert.throws(() => requireDurableLearner(null), (error) => error.code === 'FORBIDDEN')
  const teacher = {
    actor_id: 'teacher-1', actor_type: 'teacher', role: 'teacher', tenant_id: teacherTenantId,
    teacher_id: 'teacher-1', student_id: null, permissions: [],
  }
  assert.throws(() => requireDurableLearner(teacher), (error) => error.code === 'FORBIDDEN')
})

test('teacher account deletion removes Phase 0 personal tenant mappings', async () => {
  const deleted = []
  const personalTenantId = generateDomainId('ten')
  const db = {
    client: { startSession() { return { async withTransaction(fn) { return fn() }, async endSession() {} } } },
    collection(name) {
      return {
        async findOne() { return name === 'users' ? { id: 'teacher-delete' } : null },
        async updateOne() {},
        find() {
          const rows = name === 'learning_v2_tenants' ? [{ tenant_id: personalTenantId }] : []
          return { project() { return this }, async toArray() { return rows } }
        },
        async updateMany() { return { matchedCount: 0 } },
        async deleteMany(query) { deleted.push({ name, query }); return { deletedCount: 0 } },
        async deleteOne(query) { deleted.push({ name, query }); return { deletedCount: 1 } },
      }
    },
  }
  const result = await deleteTeacherAccountData(db, 'teacher-delete')
  assert.equal(result.deletedCount, 1)
  const membershipDelete = deleted.find((entry) => entry.name === 'learning_v2_tenant_memberships')
  const tenantDelete = deleted.find((entry) => entry.name === 'learning_v2_tenants')
  const objectiveDelete = deleted.find((entry) => entry.name === 'learning_objectives')
  const taskDelete = deleted.find((entry) => entry.name === 'learning_tasks')
  assert.ok(membershipDelete)
  assert.deepEqual(objectiveDelete.query, { tenant_id: { $in: [personalTenantId] } })
  assert.deepEqual(taskDelete.query, { tenant_id: { $in: [personalTenantId] } })
  assert.deepEqual(tenantDelete.query, { tenant_id: { $in: [personalTenantId] }, owner_teacher_id: 'teacher-delete', status: 'deleting' })
})

test('feature flag is fail-closed, explicit and independent of legacy configuration', () => {
  assert.equal(isLearningV2Enabled({ ...localHostingEnvironment,}), false)
  assert.equal(isLearningV2Enabled({ ...localHostingEnvironment, LEARNING_V2_ENABLED: 'true' }), true)
  assert.equal(isLearningV2Enabled({ ...localHostingEnvironment, LEARNING_V2_ENABLED: '0', SOME_LEGACY_FEATURE: 'true' }), false)
  assert.throws(() => requireLearningV2Enabled({ ...localHostingEnvironment, LEARNING_V2_ENABLED: 'false' }), (error) => error.code === 'NOT_FOUND')
  assert.doesNotThrow(() => requireLearningV2Enabled({ ...localHostingEnvironment, LEARNING_V2_ENABLED: '1' }))
})

test('privacy redaction removes secrets, learner identifiers and learner content by default', () => {
  const safe = redactLearningV2LogMetadata({
    status: 'rejected',
    student_id: 'student-1',
    learner_name: 'Sensitive Learner',
    email: 'learner@example.test',
    answer: 'my full answer',
    authentication_token: 'Bearer top-secret-token',
    nested: { full_prompt: 'private prompt', provider: 'openai' },
  })
  const output = JSON.stringify(safe)
  assert.equal(output.includes('Sensitive Learner'), false)
  assert.equal(output.includes('learner@example.test'), false)
  assert.equal(output.includes('my full answer'), false)
  assert.equal(output.includes('top-secret-token'), false)
  assert.equal(safe.status, 'rejected')
  assert.equal(safe.nested.provider, 'openai')
  assert.equal(safe.student_id, '[OMITTED]')
})

test('privacy logger emits safe metadata and context manifests record categories only', () => {
  const calls = []
  const safe = learningV2Log('info', 'test.event', { answer: 'secret', outcome: 'allowed' }, (...args) => calls.push(args))
  assert.equal(calls.length, 1)
  assert.equal(safe.answer, '[REDACTED]')
  assert.equal(safe.outcome, 'allowed')
  assert.deepEqual(createContextManifest(['task', 'objective', 'task']), {
    context_categories: ['task', 'objective'],
    contains_direct_identifier: false,
  })
})

test('API errors have stable status mapping and never expose database or stack details', () => {
  const internal = learningV2ErrorPayload(new Error('mongodb://user:password@host private stack'), 'req-safe')
  assert.equal(internal.status, 500)
  assert.deepEqual(internal.payload, {
    error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.', request_id: 'req-safe' },
  })
  for (const [code, status] of Object.entries({
    UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION_ERROR: 400,
    CONFLICT: 409, RATE_LIMITED: 429, INTERNAL_ERROR: 500,
  })) {
    assert.equal(learningV2ErrorPayload(new LearningV2Error(code), 'req').status, status)
  }
})

test('validation errors expose bounded field paths and codes, not input values', () => {
  const schema = z.object({ title: z.string().max(3) }).strict()
  const parsed = schema.safeParse({ title: 'sensitive oversized value', secret: 'database password' })
  const mapped = learningV2ErrorPayload(validationError(parsed.error), 'req-validation')
  const output = JSON.stringify(mapped.payload)
  assert.equal(mapped.status, 400)
  assert.equal(output.includes('sensitive oversized value'), false)
  assert.equal(output.includes('database password'), false)
  assert.equal(mapped.payload.error.details.issues.length > 0, true)
})

test('composite rate-limit keys support future dimensions without leaking raw identities', () => {
  const base = { bucket: 'tutor-turn', windowStart: 12345, tenantId: teacherTenantId, actorId: 'teacher-1' }
  const first = buildLearningV2RateLimitKey(base)
  const same = buildLearningV2RateLimitKey(base)
  const otherProvider = buildLearningV2RateLimitKey({ ...base, provider: 'openai' })
  assert.equal(first, same)
  assert.notEqual(first, otherProvider)
  assert.equal(first.includes('teacher-1'), false)
  assert.equal(first.includes(teacherTenantId), false)
  assert.throws(() => buildLearningV2RateLimitKey({ bucket: 'x', windowStart: 1 }))
})

test('V2 index bootstrap is minimal and idempotent', async () => {
  const calls = []
  const db = {
    collection(name) {
      return {
        async createIndexes(indexes) { calls.push({ name, indexes }) },
      }
    },
  }
  const specs = learningV2IndexSpecifications()
  assert.deepEqual(Object.keys(specs).sort(), [
    'curriculum_frameworks', 'curriculum_nodes', 'evidence_events', 'learning_attempts', 'learning_events',
    'learning_objectives', 'learning_tasks', 'learning_v2_tenant_memberships', 'learning_v2_tenants',
    'student_knowledge_states', 'submissions', 'tutor_policies', 'tutor_sessions',
  ])
  await ensureLearningV2Indexes(db)
  await ensureLearningV2Indexes(db)
  assert.equal(calls.length, 13)
  assert.equal(calls.flatMap((call) => call.indexes).every((index) => index.name.startsWith('learning_v2_')), true)
})

test('index inspection reports missing indexes without creating collections', async () => {
  const expectedCount = Object.values(learningV2IndexSpecifications()).flat().length
  const db = {
    collection() {
      return { listIndexes() { return { async toArray() { return [] } } } }
    },
  }
  const report = await inspectLearningV2Indexes(db)
  assert.equal(report.length, expectedCount)
  assert.equal(report.every((entry) => entry.present === false), true)
})

test('index inspection rejects a same-named index with the wrong definition', async () => {
  const firstExpected = Object.values(learningV2IndexSpecifications()).flat()[0]
  const db = {
    collection() {
      return {
        listIndexes() {
          return { async toArray() { return [{ name: firstExpected.name, key: { wrong: 1 }, unique: true }] } }
        },
      }
    },
  }
  const report = await inspectLearningV2Indexes(db)
  assert.equal(report.find((entry) => entry.index === firstExpected.name).present, false)
})
