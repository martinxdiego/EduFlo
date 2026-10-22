import assert from 'node:assert/strict'
import test from 'node:test'
import { MongoClient } from 'mongodb'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'
import { ensureLearningV2Indexes } from '../lib/server/learning-v2/database/bootstrap.js'
import { projectKnowledgeState, projectionComparable } from '../lib/server/learning-v2/knowledge-state/projection.js'
import { createPhase4Services } from '../lib/server/learning-v2/phase4-services.js'

const enabled = process.env.RUN_LEARNING_V2_MONGO_TESTS === '1'

if (!enabled) {
  test('Learning V2 Phase-4 real Mongo test requires RUN_LEARNING_V2_MONGO_TESTS=1', { skip: true }, () => {})
} else {
  test('Phase 4 teacher control invariants hold against disposable real MongoDB', async () => {
    const baseName = process.env.LEARNING_V2_TEST_DB_NAME
    assert.match(baseName || '', /^eduflow_learning_v2_test_[a-z0-9_-]+$/)
    assert.ok(process.env.MONGO_URL)
    const databaseName = `${baseName}_phase4`
    const client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    const db = client.db(databaseName)
    const now = new Date('2026-08-26T10:00:00.000Z')
    const tenantId = generateDomainId('ten')
    const teacherId = 'phase4-mongo-teacher'
    const studentId = 'phase4-mongo-student'
    const frameworkId = generateDomainId('frm')
    const competencyId = generateDomainId('cmp')
    const objectiveId = generateDomainId('obj')
    const actor = { actor_id: teacherId, actor_type: 'teacher', role: 'teacher', tenant_id: tenantId, teacher_id: teacherId, student_id: null, permissions: ['learning:read', 'learning:write', 'learning:read:students'] }
    try {
      await ensureLearningV2Indexes(db)
      await Promise.all([
        db.collection('learning_v2_tenants').insertOne({ tenant_id: tenantId, type: 'personal', owner_teacher_id: teacherId, status: 'active', created_at: now }),
        db.collection('learning_v2_tenant_memberships').insertMany([
          { actor_type: 'teacher', actor_id: teacherId, tenant_id: tenantId, role: 'teacher', status: 'active', created_at: now },
          { actor_type: 'student', actor_id: studentId, tenant_id: tenantId, role: 'student', status: 'active', created_at: now },
        ]),
        db.collection('students').insertOne({ id: studentId, display_name: 'Mongo Learner', created_at: now }),
        db.collection('classes').insertOne({ id: 'phase4-mongo-class', name: 'Mongo Class', teacher_id: teacherId, enrolled_students: [{ student_id: studentId, display_name: 'Mongo Learner' }] }),
        db.collection('curriculum_nodes').insertOne({ tenant_id: tenantId, competency_id: competencyId, framework_ref: { framework_id: frameworkId, version: 'phase4-v1' }, labels: { de: 'Brüche anwenden' }, authoritative: false, status: 'active' }),
        db.collection('learning_objectives').insertOne({ tenant_id: tenantId, objective_id: objectiveId, version: 1, title: 'Brüche anwenden', learner_statement: 'Ich kann Brüche anwenden.', status: 'published', competency_targets: [{ competency_id: competencyId, framework_id: frameworkId, framework_version: 'phase4-v1', role: 'primary' }] }),
      ])
      const services = createPhase4Services(db, { now: () => now })
      const request = { schema_version: 'learning-v2-phase4-v1', competency_id: competencyId, objective_id: objectiveId, objective_version: 1, claim: 'supports', basis: 'structured_assessment', observed_at: now.toISOString(), reason: 'structured_check', note: 'Sensitive teacher-only note', idempotency_key: 'phase4-mongo-assessment-key' }

      const emptyList = await services.teacherLearning.listCompetencies(actor, studentId)
      assert.equal(emptyList.competencies.length, 1)
      assert.equal(emptyList.competencies[0].mastery.label, 'No demonstration yet')
      assert.equal((await services.teacherLearning.getCompetency(actor, studentId, competencyId)).detail, null)
      await assert.rejects(services.teacherLearning.recordAssessment(actor, studentId, { ...request, competency_id: generateDomainId('cmp'), idempotency_key: 'phase4-invalid-target-key' }), (error) => error.code === 'VALIDATION_ERROR')
      await assert.rejects(services.teacherLearning.recordAssessment(actor, studentId, { ...request, objective_id: generateDomainId('obj'), idempotency_key: 'phase4-foreign-target-key' }), (error) => error.code === 'VALIDATION_ERROR')

      const [first, retry] = await Promise.all([
        services.teacherLearning.recordAssessment(actor, studentId, request),
        services.teacherLearning.recordAssessment(actor, studentId, request),
      ])
      assert.equal(first.assessment.evidence_id, retry.assessment.evidence_id)
      assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: tenantId }), 1)
      assert.equal(await db.collection('learning_events').countDocuments({ tenant_id: tenantId, type: 'TEACHER_ASSESSMENT_RECORDED' }), 1)
      const state = await db.collection('student_knowledge_states').findOne({ tenant_id: tenantId, student_id: studentId, competency_id: competencyId })
      assert.equal(state.contribution_summary[0].weight, 1.25)
      assert.equal(state.confidence <= 0.60, true)
      assert.notEqual(state.band, 'secure')

      const list = await services.teacherLearning.listEvidence(actor, studentId, competencyId, { filter: 'all', limit: 1 })
      assert.equal(list.evidence.length, 1)
      assert.equal(Object.hasOwn(list.evidence[0], 'note'), false)
      const detail = await services.teacherLearning.listEvidence(actor, studentId, competencyId, { filter: 'all', limit: 20, evidence_id: first.assessment.evidence_id })
      assert.equal(detail.evidence.note, 'Sensitive teacher-only note')

      const correction = { ...request, claim: 'challenges', basis: 'repeated_observation', note: 'Corrected private note', replaces_evidence_id: first.assessment.evidence_id, correction_note: 'Original entry was incorrect.', idempotency_key: 'phase4-mongo-correction-key' }
      const [correctedA, correctedB] = await Promise.all([
        services.teacherLearning.recordAssessment(actor, studentId, correction),
        services.teacherLearning.recordAssessment(actor, studentId, correction),
      ])
      assert.equal(correctedA.assessment.evidence_id, correctedB.assessment.evidence_id)
      assert.equal(await db.collection('evidence_events').countDocuments({ tenant_id: tenantId }), 2)
      const old = await db.collection('evidence_events').findOne({ evidence_id: first.assessment.evidence_id })
      assert.equal(old.status, 'invalidated')
      assert.equal(old.claim.result, 'supports')
      assert.equal(old.teacher_note, 'Sensitive teacher-only note')
      assert.equal(old.invalidation.replacement_evidence_id, correctedA.assessment.evidence_id)
      assert.equal((await db.collection('evidence_events').findOne({ evidence_id: correctedA.assessment.evidence_id })).supersedes_evidence_id, old.evidence_id)

      const invalidation = { schema_version: 'learning-v2-phase4-v1', reason: 'entered_in_error', note: 'No longer valid.', idempotency_key: 'phase4-mongo-invalidation-key' }
      const [invalidatedA, invalidatedB] = await Promise.all([
        services.teacherLearning.invalidateEvidence(actor, correctedA.assessment.evidence_id, invalidation),
        services.teacherLearning.invalidateEvidence(actor, correctedA.assessment.evidence_id, invalidation),
      ])
      assert.equal(invalidatedA.evidence.status, 'invalidated')
      assert.equal(invalidatedB.evidence.status, 'invalidated')
      assert.equal(await db.collection('learning_events').countDocuments({ tenant_id: tenantId, type: 'EVIDENCE_INVALIDATED' }), 2)
      const rebuilt = await db.collection('student_knowledge_states').findOne({ tenant_id: tenantId, student_id: studentId, competency_id: competencyId })
      assert.equal(rebuilt.evidence_count, 0)
      assert.equal(rebuilt.mastery, 0.5)
      assert.equal(rebuilt.confidence, 0)

      const [differentA, differentB] = await Promise.all([
        services.teacherLearning.recordAssessment(actor, studentId, { ...request, basis: 'single_observation', idempotency_key: 'phase4-mongo-different-a' }),
        services.teacherLearning.recordAssessment(actor, studentId, { ...request, claim: 'challenges', basis: 'repeated_observation', idempotency_key: 'phase4-mongo-different-b' }),
      ])
      assert.notEqual(differentA.assessment.evidence_id, differentB.assessment.evidence_id)
      const activeRows = await db.collection('evidence_events').find({ tenant_id: tenantId, status: 'active' }).toArray()
      assert.equal(activeRows.length, 2)
      const persistedMixed = await db.collection('student_knowledge_states').findOne({ tenant_id: tenantId, student_id: studentId, competency_id: competencyId })
      const rebuiltMixed = projectKnowledgeState({ tenantId, studentId, competencyRef: { competency_id: competencyId, framework_id: frameworkId, framework_version: 'phase4-v1' }, evidence: activeRows, now })
      assert.equal(persistedMixed.projection.source_revision, (await db.collection('learning_v2_tenants').findOne({ tenant_id: tenantId })).evidence_revision)
      const pureComparable = projectionComparable(persistedMixed)
      delete pureComparable.audit_receipt
      delete pureComparable.projection.source_revision
      assert.deepEqual(pureComparable, projectionComparable(rebuiltMixed))

      await assert.rejects(services.teacherLearning.listCompetencies({ ...actor, teacher_id: 'co-teacher', actor_id: 'co-teacher' }, studentId), (error) => error.code === 'NOT_FOUND')
      const studentActor = { actor_id: studentId, actor_type: 'student', role: 'student', tenant_id: tenantId, teacher_id: null, student_id: studentId, permissions: [] }
      await assert.rejects(services.teacherLearning.listCompetencies(studentActor, studentId), (error) => error.code === 'FORBIDDEN')

      const serializedEvents = JSON.stringify(await db.collection('learning_events').find({ tenant_id: tenantId }).toArray())
      assert.equal(serializedEvents.includes('Sensitive teacher-only note'), false)
      assert.equal(serializedEvents.includes('Corrected private note'), false)
      assert.equal(serializedEvents.includes('Original entry was incorrect.'), false)
    } finally {
      await db.dropDatabase()
      await client.close()
    }
  })
}
