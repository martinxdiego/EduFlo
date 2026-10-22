import assert from 'node:assert/strict'
import test from 'node:test'
import { MongoClient } from 'mongodb'
import { seedP0 } from './helpers/hardening-p0-fixture.mjs'
import { projectionComparable } from '../lib/server/learning-v2/knowledge-state/projection.js'
import { clearRebuildableLearningV2SubjectData } from '../lib/server/learning-v2/privacy/subject-lifecycle-service.js'
import { TutorTelemetry } from '../lib/server/learning-v2/tutor/tutor-telemetry.js'

const enabled = process.env.RUN_LEARNING_V2_MONGO_TESTS === '1'

test('H12-B safe subject cleanup is transactional, idempotent and preserves canonical truth in real Mongo', { skip: !enabled }, async () => {
  const databaseName = process.env.LEARNING_V2_TEST_DB_NAME
  assert.match(databaseName || '', /^eduflow_learning_v2_test_[a-z0-9_-]+$/)
  const url = new URL(process.env.MONGO_URL)
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'H12-B requires the disposable loopback replica set')
  const client = new MongoClient(process.env.MONGO_URL)
  await client.connect()
  const db = client.db(databaseName)
  try {
    const subject = await seedP0(db)
    const foreign = await seedP0(db)
    const projected = await subject.services.projection.rebuild(subject.actor, subject.studentId, subject.competencyRef)
    await foreign.services.projection.rebuild(foreign.actor, foreign.studentId, foreign.competencyRef)
    const telemetry = new TutorTelemetry(db, { now: () => subject.now })
    for (const fixture of [subject, foreign]) await telemetry.record(fixture.student, {
      model_config: { model: 'synthetic', prompt_version: 'synthetic-v1' },
      policy_ref: { version: 1 }, fallback_registry_version: 'synthetic-v1',
    }, { status: 'complete', usage: { input_tokens: 1, output_tokens: 1 } })

    const protectedCollections = ['submissions', 'learning_attempts', 'evidence_events', 'learning_events', 'tutor_sessions']
    const canonicalBefore = new Map()
    for (const name of protectedCollections) canonicalBefore.set(name,
      await db.collection(name).find({ tenant_id: subject.tenantId }).sort({ _id: 1 }).toArray())
    const foreignStateBefore = await db.collection('student_knowledge_states').countDocuments({ tenant_id: foreign.tenantId })
    const foreignTelemetryBefore = await db.collection('ai_generations').countDocuments({ tenant_id: foreign.tenantId })

    const authorizedStudent = { ...subject.student, permissions: ['learning:read:self', 'learning:write:self'] }
    const first = await clearRebuildableLearningV2SubjectData(db, authorizedStudent, subject.studentId)
    const second = await clearRebuildableLearningV2SubjectData(db, authorizedStudent, subject.studentId)
    assert.deepEqual(first.deleted, { student_knowledge_states: 1, ai_generations: 1 })
    assert.deepEqual(second.deleted, { student_knowledge_states: 0, ai_generations: 0 })
    assert.equal(first.canonical_learning_truth_changed, false)
    assert.equal(await db.collection('student_knowledge_states').countDocuments({ tenant_id: subject.tenantId, student_id: subject.studentId }), 0)
    assert.equal(await db.collection('ai_generations').countDocuments({ tenant_id: subject.tenantId, user_id: subject.studentId }), 0)
    assert.equal(await db.collection('student_knowledge_states').countDocuments({ tenant_id: foreign.tenantId }), foreignStateBefore)
    assert.equal(await db.collection('ai_generations').countDocuments({ tenant_id: foreign.tenantId }), foreignTelemetryBefore)
    for (const name of protectedCollections) assert.deepEqual(
      await db.collection(name).find({ tenant_id: subject.tenantId }).sort({ _id: 1 }).toArray(), canonicalBefore.get(name), name)

    const rebuilt = await subject.services.projection.rebuild(subject.actor, subject.studentId, subject.competencyRef)
    assert.deepEqual(projectionComparable(rebuilt), projectionComparable(projected))
  } finally {
    await client.close()
  }
})
