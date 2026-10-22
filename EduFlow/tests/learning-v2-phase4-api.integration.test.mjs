import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import { MongoClient } from 'mongodb'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'

const enabled = process.env.RUN_INTEGRATION_TESTS === '1'

if (!enabled) {
  test('Learning V2 Phase-4 API integration requires RUN_INTEGRATION_TESTS=1', { skip: true }, () => {})
} else {
  test('Phase 4 live HTTP flow enforces ownership, idempotency, pagination, correction and invalidation', async () => {
    const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000'
    const dbName = process.env.DB_NAME
    assert.match(dbName || '', /^eduflow_learning_v2_test_[a-z0-9_-]+$/)
    const client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    const db = client.db(dbName)
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const teacherId = `phase4-http-teacher-${suffix}`
    const coTeacherId = `phase4-http-co-teacher-${suffix}`
    const foreignTeacherId = `phase4-http-foreign-teacher-${suffix}`
    const studentId = `phase4-http-student-${suffix}`
    const tenantId = generateDomainId('ten')
    const foreignTenantId = generateDomainId('ten')
    const frameworkId = generateDomainId('frm')
    const competencyId = generateDomainId('cmp')
    const objectiveId = generateDomainId('obj')
    const now = new Date()
    const authorization = (payload) => `Bearer ${jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' })}`
    const teacherAuth = authorization({ userId: teacherId, email: `${teacherId}@example.test` })
    const coTeacherAuth = authorization({ userId: coTeacherId, email: `${coTeacherId}@example.test` })
    const foreignTeacherAuth = authorization({ userId: foreignTeacherId, email: `${foreignTeacherId}@example.test` })
    const studentAuth = authorization({ studentId, username: `p4-${suffix}`, role: 'student' })
    const headers = (auth, json = false) => ({ ...(json ? { 'Content-Type': 'application/json', Origin: baseUrl } : {}), ...(auth ? { Authorization: auth } : {}) })
    const assessmentUrl = `${baseUrl}/api/v2/learning/teacher/students/${studentId}/assessments`
    const competencyUrl = `${baseUrl}/api/v2/learning/teacher/students/${studentId}/competencies/${competencyId}`
    const evidenceUrl = `${competencyUrl}/evidence`
    try {
      await Promise.all([
        db.collection('users').insertMany([{ id: teacherId, email: `${teacherId}@example.test`, created_at: now }, { id: coTeacherId, email: `${coTeacherId}@example.test`, created_at: now }, { id: foreignTeacherId, email: `${foreignTeacherId}@example.test`, created_at: now }]),
        db.collection('students').insertOne({ id: studentId, username: `p4-${suffix}`, display_name: 'HTTP Learner', created_at: now }),
        db.collection('learning_v2_tenants').insertOne({ tenant_id: tenantId, type: 'personal', owner_teacher_id: teacherId, status: 'active', created_at: now }),
        db.collection('learning_v2_tenants').insertOne({ tenant_id: foreignTenantId, type: 'personal', owner_teacher_id: foreignTeacherId, status: 'active', created_at: now }),
        db.collection('learning_v2_tenant_memberships').insertMany([
          { actor_type: 'teacher', actor_id: teacherId, tenant_id: tenantId, role: 'teacher', status: 'active', created_at: now },
          { actor_type: 'teacher', actor_id: coTeacherId, tenant_id: tenantId, role: 'teacher', status: 'active', created_at: now },
          { actor_type: 'student', actor_id: studentId, tenant_id: tenantId, role: 'student', status: 'active', created_at: now },
          { actor_type: 'teacher', actor_id: foreignTeacherId, tenant_id: foreignTenantId, role: 'teacher', status: 'active', created_at: now },
        ]),
        db.collection('classes').insertOne({ id: `phase4-http-class-${suffix}`, name: 'HTTP Class', teacher_id: teacherId, enrolled_students: [{ student_id: studentId, display_name: 'HTTP Learner' }] }),
        db.collection('curriculum_nodes').insertOne({ tenant_id: tenantId, competency_id: competencyId, framework_ref: { framework_id: frameworkId, version: 'phase4-http-v1' }, labels: { de: 'HTTP Kompetenz' }, authoritative: false, status: 'active' }),
        db.collection('learning_objectives').insertOne({ tenant_id: tenantId, objective_id: objectiveId, version: 1, title: 'HTTP Ziel', learner_statement: 'Ich kann das.', status: 'published', competency_targets: [{ competency_id: competencyId, framework_id: frameworkId, framework_version: 'phase4-http-v1', role: 'primary' }] }),
      ])

      assert.equal((await fetch(`${baseUrl}/api/v2/learning/teacher/students/${studentId}/competencies`)).status, 401)
      assert.equal((await fetch(`${baseUrl}/api/v2/learning/teacher/students/${studentId}/competencies`, { headers: headers(studentAuth) })).status, 403)
      assert.equal((await fetch(`${baseUrl}/api/v2/learning/teacher/students/${studentId}/competencies`, { headers: headers(coTeacherAuth) })).status, 404)
      assert.equal((await fetch(`${baseUrl}/api/v2/learning/teacher/students/${studentId}/competencies`, { headers: headers(foreignTeacherAuth) })).status, 404)
      const emptyDetail = await fetch(competencyUrl, { headers: headers(teacherAuth) })
      assert.equal(emptyDetail.status, 200)
      assert.equal((await emptyDetail.json()).detail, null)
      assert.equal((await fetch(`${baseUrl}/api/v2/learning/teacher/students/${studentId}/tutor-sessions/${generateDomainId('ses')}`, { headers: headers(teacherAuth) })).status, 404)

      const body = { schema_version: 'learning-v2-phase4-v1', competency_id: competencyId, objective_id: objectiveId, objective_version: 1, claim: 'supports', basis: 'single_observation', observed_at: now.toISOString(), reason: 'direct_observation', note: 'HTTP private note', idempotency_key: `phase4-http-key-${suffix}` }
      const injected = await fetch(assessmentUrl, { method: 'POST', headers: headers(teacherAuth, true), body: JSON.stringify({ ...body, student_id: studentId, idempotency_key: `phase4-http-injected-${suffix}` }) })
      assert.equal(injected.status, 400)
      const submit = () => fetch(assessmentUrl, { method: 'POST', headers: headers(teacherAuth, true), body: JSON.stringify(body) })
      const [createdA, createdB] = await Promise.all([submit(), submit()])
      assert.equal(createdA.status, 200); assert.equal(createdB.status, 200)
      const createdBodyA = await createdA.json(); const createdBodyB = await createdB.json()
      assert.equal(createdBodyA.assessment.evidence_id, createdBodyB.assessment.evidence_id)
      assert.equal(createdBodyA.assessment.note, 'HTTP private note')
      assert.equal(createdBodyA.state.confidence.meaning, 'How well-supported and stable is this estimate?')

      for (let index = 1; index <= 2; index += 1) {
        const response = await fetch(assessmentUrl, { method: 'POST', headers: headers(teacherAuth, true), body: JSON.stringify({ ...body, observed_at: new Date(now.getTime() + index * 1_000).toISOString(), claim: index === 1 ? 'challenges' : 'no_demonstration', note: `private-${index}`, idempotency_key: `phase4-http-extra-${suffix}-${index}` }) })
        assert.equal(response.status, 200)
      }

      const pageOne = await (await fetch(`${evidenceUrl}?limit=1&filter=all`, { headers: headers(teacherAuth) })).json()
      assert.equal(pageOne.evidence.length, 1)
      assert.ok(pageOne.next_cursor)
      assert.equal(Object.hasOwn(pageOne.evidence[0], 'note'), false)
      const pageTwoResponse = await fetch(`${evidenceUrl}?limit=1&filter=all&cursor=${encodeURIComponent(pageOne.next_cursor)}`, { headers: headers(teacherAuth) })
      assert.equal(pageTwoResponse.status, 200)
      assert.equal((await pageTwoResponse.json()).evidence.length, 1)

      const summaryResponse = await fetch(competencyUrl, { headers: headers(teacherAuth) })
      assert.equal(summaryResponse.status, 200)
      const summary = await summaryResponse.json()
      assert.equal(typeof summary.mastery.label, 'string')
      assert.equal(summary.detail.calculated_mastery_estimate.toString().split('.')[1]?.length <= 2 || Number.isInteger(summary.detail.calculated_mastery_estimate), true)

      const correction = { ...body, claim: 'challenges', basis: 'reviewed_work_sample', replaces_evidence_id: createdBodyA.assessment.evidence_id, correction_note: 'HTTP correction note', idempotency_key: `phase4-http-correction-${suffix}` }
      const correctedResponse = await fetch(assessmentUrl, { method: 'POST', headers: headers(teacherAuth, true), body: JSON.stringify(correction) })
      assert.equal(correctedResponse.status, 200)
      const corrected = await correctedResponse.json()
      assert.equal(corrected.assessment.technical.supersedes_evidence_id, createdBodyA.assessment.evidence_id)

      const badInvalidation = await fetch(`${baseUrl}/api/v2/learning/teacher/evidence/${corrected.assessment.evidence_id}/invalidate`, { method: 'POST', headers: headers(teacherAuth, true), body: JSON.stringify({ schema_version: 'learning-v2-phase4-v1', reason: 'disagreement', idempotency_key: `phase4-http-bad-${suffix}` }) })
      assert.equal(badInvalidation.status, 400)
      const invalidate = () => fetch(`${baseUrl}/api/v2/learning/teacher/evidence/${corrected.assessment.evidence_id}/invalidate`, { method: 'POST', headers: headers(teacherAuth, true), body: JSON.stringify({ schema_version: 'learning-v2-phase4-v1', reason: 'entered_in_error', note: 'HTTP invalidation note', idempotency_key: `phase4-http-invalidate-${suffix}` }) })
      const [invalidatedA, invalidatedB] = await Promise.all([invalidate(), invalidate()])
      assert.equal(invalidatedA.status, 200); assert.equal(invalidatedB.status, 200)
      assert.equal((await invalidatedA.json()).evidence.status, 'invalidated')

      const eventsText = JSON.stringify(await db.collection('learning_events').find({ tenant_id: tenantId }).toArray())
      assert.equal(eventsText.includes('HTTP private note'), false)
      assert.equal(eventsText.includes('HTTP correction note'), false)
      assert.equal(eventsText.includes('HTTP invalidation note'), false)
    } finally {
      for (const name of ['users', 'students', 'learning_v2_tenants', 'learning_v2_tenant_memberships', 'classes', 'curriculum_nodes', 'learning_objectives', 'learning_tasks', 'learning_attempts', 'evidence_events', 'student_knowledge_states', 'learning_events', 'tutor_sessions']) {
        await db.collection(name).deleteMany({ $or: [{ tenant_id: { $in: [tenantId, foreignTenantId] } }, { id: teacherId }, { id: coTeacherId }, { id: foreignTeacherId }, { id: studentId }, { teacher_id: teacherId }] })
      }
      await client.close()
    }
  })
}
