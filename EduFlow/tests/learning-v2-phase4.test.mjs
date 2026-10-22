import { localHostingEnvironment } from './helpers/local-hosting-environment.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'
import {
  PHASE_4_SCHEMA_VERSION, TEACHER_ASSESSMENT_BASES, TEACHER_ASSESSMENT_CLAIMS,
  TEACHER_CALIBRATION_STATUS, TEACHER_EVIDENCE_WEIGHTS, TEACHER_ONLY_CONFIDENCE_CAP,
  teacherAssessmentRequestSchema, teacherEvidenceQuerySchema, teacherInvalidationRequestSchema,
  responseModalityForTeacherBasis,
} from '../lib/server/learning-v2/contracts/phase4.js'
import { evidenceDocumentSchema } from '../lib/server/learning-v2/contracts/phase2.js'
import { isLearningV2Phase4DevelopmentEnabled } from '../lib/server/learning-v2/feature-flags/learning-v2.js'
import { projectKnowledgeState } from '../lib/server/learning-v2/knowledge-state/projection.js'
import { redactLearningV2LogMetadata } from '../lib/server/learning-v2/privacy/redaction.js'
import { CONFIDENCE_MEANING, confidenceLabel, teacherReasonStatements } from '../lib/server/learning-v2/teacher/display-model.js'
import { requireTeacherStudentAccess } from '../lib/server/learning-v2/teacher/teacher-authorization.js'
import { ExplanationService } from '../lib/server/learning-v2/knowledge-state/explanation-service.js'

const tenantId = generateDomainId('ten')
const competencyId = generateDomainId('cmp')
const frameworkId = generateDomainId('frm')
const objectiveId = generateDomainId('obj')
const teacherId = 'phase4-teacher'
const studentId = 'phase4-student'
const actor = { actor_id: teacherId, actor_type: 'teacher', role: 'teacher', tenant_id: tenantId, teacher_id: teacherId, student_id: null, permissions: ['learning:read:students'] }

function assessment(overrides = {}) {
  return {
    evidence_id: overrides.evidence_id || generateDomainId('evd'), schema_version: 'evidence-event-v1', tenant_id: tenantId, student_id: studentId,
    type: 'teacher_assessment', target: { competency_id: competencyId, framework_id: frameworkId, framework_version: 'dev-v1', objective_id: objectiveId, objective_version: 1, dimension: 'application' },
    claim: { result: overrides.claim || 'supports' }, independence: { level: 'teacher_assessment' }, source: { kind: 'teacher_assessment', source_id: teacherId, task_id: null, task_version: null },
    provenance: { producer: 'teacher-evidence-rules', producer_version: 'teacher-evidence-rules-v1', evidence_policy_version: 'evidence-policy-v3-teacher-development', grader_version: null, created_by: teacherId },
    quality: { source_confidence: 1, mapping_confidence: 1, classification_confidence: 1, historic: false }, response_modality: responseModalityForTeacherBasis(overrides.basis || 'single_observation'), assessment_basis: overrides.basis || 'single_observation',
    teacher_weight: overrides.claim === 'no_demonstration' ? 0 : TEACHER_EVIDENCE_WEIGHTS[overrides.basis || 'single_observation'], assessment_reason: 'direct_observation', occurred_at: new Date('2026-08-26T08:00:00Z'), recorded_at: new Date('2026-08-26T08:01:00Z'), status: overrides.status || 'active', idempotency_key: 'phase4-idempotency-key',
  }
}

test('Phase 4 flag is default-off, explicit, and unavailable in production', () => {
  assert.equal(isLearningV2Phase4DevelopmentEnabled({ ...localHostingEnvironment,}), false)
  assert.equal(isLearningV2Phase4DevelopmentEnabled({ ...localHostingEnvironment, NODE_ENV: 'development', LEARNING_V2_ENABLED: 'true', LEARNING_V2_PHASE_4_ENABLED: 'true' }), true)
  assert.equal(isLearningV2Phase4DevelopmentEnabled({ ...localHostingEnvironment, NODE_ENV: 'production', LEARNING_V2_ENABLED: 'true', LEARNING_V2_PHASE_4_ENABLED: 'true' }), false)
  assert.equal(isLearningV2Phase4DevelopmentEnabled({ ...localHostingEnvironment, NODE_ENV: 'development', LEARNING_V2_ENABLED: 'true', LEARNING_V2_PHASE_3_ENABLED: 'true' }), false)
})

test('teacher assessment contracts freeze claims, bases, weights, notes, and authority fields', () => {
  assert.deepEqual(TEACHER_ASSESSMENT_CLAIMS, ['supports', 'challenges', 'no_demonstration'])
  assert.deepEqual(TEACHER_ASSESSMENT_BASES, ['single_observation', 'repeated_observation', 'reviewed_work_sample', 'structured_assessment'])
  assert.deepEqual(TEACHER_EVIDENCE_WEIGHTS, { single_observation: 0.75, repeated_observation: 1, reviewed_work_sample: 1, structured_assessment: 1.25, no_demonstration: 0 })
  const valid = { schema_version: PHASE_4_SCHEMA_VERSION, competency_id: competencyId, objective_id: objectiveId, objective_version: 1, claim: 'supports', basis: 'single_observation', observed_at: '2026-08-26T08:00:00.000Z', reason: 'direct_observation', note: 'Private detail', idempotency_key: 'teacher-key-123' }
  assert.equal(teacherAssessmentRequestSchema.safeParse(valid).success, true)
  assert.equal(teacherAssessmentRequestSchema.safeParse({ ...valid, note: '' }).success, true)
  assert.equal(teacherAssessmentRequestSchema.safeParse({ ...valid, note: 'x'.repeat(500) }).success, true)
  assert.equal(teacherAssessmentRequestSchema.safeParse({ ...valid, note: 'x'.repeat(501) }).success, false)
  assert.equal(teacherAssessmentRequestSchema.safeParse({ ...valid, teacher_id: teacherId }).success, false)
  assert.equal(teacherAssessmentRequestSchema.safeParse({ ...valid, override: 0.9 }).success, false)
})

test('Evidence contract accepts the additive teacher type without weakening strictness', () => {
  assert.equal(evidenceDocumentSchema.safeParse(assessment()).success, true)
  assert.equal(evidenceDocumentSchema.safeParse({ ...assessment(), teacher_note: 'x'.repeat(501) }).success, false)
  assert.equal(evidenceDocumentSchema.safeParse({ ...assessment(), hidden_answer: 'secret' }).success, false)
})

test('teacher-only projection uses development weights, caps confidence, and cannot become secure', () => {
  const rows = Array.from({ length: 8 }, () => assessment({ basis: 'structured_assessment', evidence_id: generateDomainId('evd') }))
  const state = projectKnowledgeState({ tenantId, studentId, competencyRef: { competency_id: competencyId, framework_id: frameworkId, framework_version: 'dev-v1' }, evidence: rows, now: new Date('2026-08-26T09:00:00Z') })
  assert.equal(state.contribution_summary.every((item) => item.weight === 1.25 && item.task_id === null), true)
  assert.equal(state.confidence <= TEACHER_ONLY_CONFIDENCE_CAP, true)
  assert.notEqual(state.band, 'secure')
  assert.equal(state.projection.calibration_status, TEACHER_CALIBRATION_STATUS)
  assert.equal(state.limitations.includes('teacher_assessment_only'), true)
  assert.equal(state.distinct_task_count, 0)
  for (const basis of TEACHER_ASSESSMENT_BASES) {
    const basisState = projectKnowledgeState({ tenantId, studentId, competencyRef: { competency_id: competencyId, framework_id: frameworkId, framework_version: 'dev-v1' }, evidence: [assessment({ basis })], now: new Date('2026-08-26T09:00:00Z') })
    assert.equal(basisState.contribution_summary[0].weight, TEACHER_EVIDENCE_WEIGHTS[basis])
  }
})

test('no-demonstration changes neither mastery nor confidence and remains auditable', () => {
  const state = projectKnowledgeState({ tenantId, studentId, competencyRef: { competency_id: competencyId, framework_id: frameworkId, framework_version: 'dev-v1' }, evidence: [assessment({ claim: 'no_demonstration' })], now: new Date('2026-08-26T09:00:00Z') })
  assert.equal(state.mastery, 0.5)
  assert.equal(state.confidence, 0)
  assert.equal(state.evidence_count, 0)
  assert.deepEqual(state.contribution_summary, [])
  assert.ok(state.limitations.includes('teacher_no_demonstration'))
})

test('qualitative display states exact Confidence meaning and deterministic teacher explanations', () => {
  assert.equal(CONFIDENCE_MEANING, 'How well-supported and stable is this estimate?')
  assert.equal(confidenceLabel({ evidence_count: 1, confidence: 0.39 }), 'Limited support for the estimate')
  const statements = teacherReasonStatements([assessment({ claim: 'supports' }), assessment({ claim: 'challenges' })], { evidence_count: 2, limitations: [] })
  assert.equal(statements.includes('A teacher assessment supports this competency.'), true)
  assert.equal(statements.includes('A teacher assessment challenges this competency.'), true)
  assert.equal(statements.includes('Active Evidence contains both supporting and challenging results.'), true)
})

test('invalidation and evidence query contracts allow only controlled operations', () => {
  const base = { schema_version: PHASE_4_SCHEMA_VERSION, reason: 'entered_in_error', idempotency_key: 'invalidate-key-123' }
  assert.equal(teacherInvalidationRequestSchema.safeParse(base).success, true)
  assert.equal(teacherInvalidationRequestSchema.safeParse({ ...base, reason: 'disagreement' }).success, false)
  assert.equal(teacherInvalidationRequestSchema.safeParse({ ...base, reactivate: true }).success, false)
  assert.equal(teacherEvidenceQuerySchema.safeParse({ filter: 'teacher', limit: '50' }).success, true)
  assert.equal(teacherEvidenceQuerySchema.safeParse({ filter: 'all', limit: '51' }).success, false)
})

test('teacher and invalidation notes are redacted from operational logging metadata', () => {
  const safe = redactLearningV2LogMetadata({ teacher_note: 'sensitive observation', invalidation_note: 'sensitive correction', nested: { comment: 'sensitive' } })
  assert.equal(safe.teacher_note, '[REDACTED]')
  assert.equal(safe.invalidation_note, '[REDACTED]')
  assert.equal(safe.nested.comment, '[REDACTED]')
})

function authDb({ memberships = [{ tenant_id: tenantId, role: 'student' }], owned = true, activeTenant = true, activeStudent = true } = {}) {
  const rows = {
    learning_v2_tenants: activeTenant ? { tenant_id: tenantId, type: 'personal', owner_teacher_id: teacherId, status: 'active' } : null,
    students: activeStudent ? { id: studentId, display_name: 'Ada' } : null,
    classes: owned ? { id: 'class-1', name: 'Class A', enrolled_students: [{ student_id: studentId, display_name: 'Ada' }] } : null,
  }
  return { collection(name) { return { async findOne() { return rows[name] || null }, find() { return { project() { return { async toArray() { return memberships } } } } } } } }
}

test('owned-class authorization requires personal ownership, one membership, active student, and enrollment', async () => {
  assert.equal((await requireTeacherStudentAccess(authDb(), actor, studentId)).class_id, 'class-1')
  for (const db of [authDb({ memberships: [] }), authDb({ memberships: [{ tenant_id: tenantId, role: 'student' }, { tenant_id: tenantId, role: 'student' }] }), authDb({ owned: false }), authDb({ activeTenant: false }), authDb({ activeStudent: false })]) {
    await assert.rejects(requireTeacherStudentAccess(db, actor, studentId), (error) => error.code === 'NOT_FOUND')
  }
  await assert.rejects(requireTeacherStudentAccess(authDb(), { ...actor, actor_type: 'student', role: 'student', teacher_id: null, student_id: studentId }, studentId), (error) => error.code === 'FORBIDDEN')
})

test('P0 R02 older Explanation checks current owned-class authority before reading learning data', async () => {
  const state = projectKnowledgeState({ tenantId, studentId, competencyRef: { competency_id: competencyId, framework_id: frameworkId, framework_version: 'dev-v1' }, evidence: [], now: new Date() })
  let reads = 0
  const repository = { async find() { reads += 1; return state } }
  const evidence = { async snapshotForCompetency() { return { evidence: [], sourceRevision: 0 } } }
  for (const db of [authDb({ owned: false }), authDb({ activeStudent: false }), authDb({ activeTenant: false }), authDb({ memberships: [{ tenant_id: generateDomainId('ten'), role: 'student' }] }), authDb({ memberships: [{ tenant_id: tenantId, role: 'student' }, { tenant_id: tenantId, role: 'student' }] })]) {
    await assert.rejects(new ExplanationService(evidence, repository, db).explain(actor, studentId, competencyId), { code: 'NOT_FOUND' })
  }
  assert.equal(reads, 0)
  await new ExplanationService(evidence, repository, authDb()).explain(actor, studentId, competencyId)
  const student = { ...actor, actor_type: 'student', role: 'student', teacher_id: null, student_id: studentId }
  await new ExplanationService(evidence, repository).explain(student, studentId, competencyId)
  assert.equal(reads, 2)
})

test('teacher UI is componentized, qualitative-first, responsive, and does not expose notes in list rows', () => {
  const base = new URL('../components/learning-v2/teacher/', import.meta.url)
  const detail = readFileSync(new URL('StudentLearningDetail.jsx', base), 'utf8')
  const summary = readFileSync(new URL('KnowledgeStateSummary.jsx', base), 'utf8')
  const timeline = readFileSync(new URL('EvidenceTimeline.jsx', base), 'utf8')
  assert.match(detail, /h-\[100dvh\]/)
  assert.match(detail, /DialogContent/)
  assert.match(detail, /onCloseAutoFocus/)
  assert.match(detail, /returnFocusRef/)
  assert.match(summary, /How well-supported and stable is this estimate\?/)
  assert.match(summary, /<details/)
  assert.doesNotMatch(timeline, /teacher_note|invalidation_note/)
  for (const file of ['CompetencySelector.jsx', 'KnowledgeStateSummary.jsx', 'EvidenceTimeline.jsx', 'TutorSessionDetail.jsx', 'TeacherAssessmentForm.jsx', 'EvidenceInvalidationDialog.jsx', 'TechnicalProvenanceDisclosure.jsx']) assert.equal(readFileSync(new URL(file, base), 'utf8').length > 100, true)
  const workspace = readFileSync(new URL('../components/TeacherClassWorkspace.js', import.meta.url), 'utf8')
  assert.match(workspace, /onOpenLearning\(student, event\.currentTarget\)/)
  assert.match(workspace, />Lernstand<\/button>/)
})

test('the exact six Phase 4 route modules exist and all require the Phase 4 gate', () => {
  const paths = [
    '../app/api/v2/learning/teacher/students/[studentId]/competencies/route.js',
    '../app/api/v2/learning/teacher/students/[studentId]/competencies/[competencyId]/route.js',
    '../app/api/v2/learning/teacher/students/[studentId]/competencies/[competencyId]/evidence/route.js',
    '../app/api/v2/learning/teacher/students/[studentId]/tutor-sessions/[sessionId]/route.js',
    '../app/api/v2/learning/teacher/students/[studentId]/assessments/route.js',
    '../app/api/v2/learning/teacher/evidence/[evidenceId]/invalidate/route.js',
  ]
  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    assert.match(source, /requireLearningV2Phase4DevelopmentEnabled\(\)/)
    assert.match(source, /runtime = 'nodejs'/)
  }
})
