import { randomUUID } from 'node:crypto'
import { generateDomainId } from '../../lib/server/learning-v2/contracts/ids.js'
import { ATTEMPT_SCHEMA_VERSION, DETERMINISTIC_GRADER_VERSION, EVIDENCE_SCHEMA_VERSION } from '../../lib/server/learning-v2/contracts/phase2.js'
import { PHASE_5_SCHEMA_VERSION } from '../../lib/server/learning-v2/contracts/phase5.js'
import { correctnessEvidenceForAttempt } from '../../lib/server/learning-v2/evidence/evidence-rules.js'
import { projectKnowledgeState } from '../../lib/server/learning-v2/knowledge-state/projection.js'
import { WORKSHEET_QUESTION_HASH_VERSION, worksheetQuestionContentHash } from '../../lib/server/worksheet-question-identity.js'

export const mutation = (key = randomUUID()) => ({ schema_version: PHASE_5_SCHEMA_VERSION, idempotency_key: key })
export function phase5Fixture(now = new Date()) {
  const suffix = randomUUID()
  const teacherId = `p5-teacher-${suffix}`; const studentId = `p5-student-${suffix}`
  const tenantId = generateDomainId('ten'); const competencyId = generateDomainId('cmp'); const frameworkId = generateDomainId('frm'); const objectiveId = generateDomainId('obj')
  const competencyRef = { competency_id: competencyId, framework_id: frameworkId, framework_version: 'p5-development-v1' }
  const objectiveRef = { objective_id: objectiveId, version: 1 }
  const actor = { tenant_id: tenantId, actor_id: teacherId, teacher_id: teacherId, student_id: null, actor_type: 'teacher', role: 'teacher', permissions: ['learning:read', 'learning:write', 'learning:read:students'] }
  const student = { ...actor, actor_id: studentId, teacher_id: null, student_id: studentId, actor_type: 'student', role: 'student' }
  const worksheetId = `p5-sheet-${suffix}`
  const questions = [0, 1, 2].map((index) => ({ question_id: generateDomainId('wqi'), type: 'multiple_choice', question: `Synthetic question ${index}`, options: ['HIDDEN_ANSWER_CANARY', 'Two', 'Three'], answer: 'HIDDEN_ANSWER_CANARY', points: 1 }))
  const tasks = questions.map((question, index) => ({ tenant_id: tenantId, task_id: generateDomainId('tsk'), version: 1, status: 'published', task_type: 'selected_response', response_modality: 'choice', definition_schema_version: 'learning-v2-phase1-v1', objective_refs: [objectiveRef], competency_targets: [{ ...competencyRef, role: 'primary' }], published_at: new Date(now.getTime() - 10000 + index), source: { kind: 'worksheet_question', worksheet_id: worksheetId, question_id: question.question_id, content_hash: worksheetQuestionContentHash(question), hash_version: WORKSHEET_QUESTION_HASH_VERSION, audit_snapshot: { answer: 'HIDDEN_ANSWER_CANARY' } } }))
  const attempt = (task = tasks[0], correct = true, time = now) => ({
    attempt_id: generateDomainId('att'), schema_version: ATTEMPT_SCHEMA_VERSION, tenant_id: tenantId, student_id: studentId,
    task_ref: { task_id: task.task_id, version: task.version }, objective_ref: objectiveRef, primary_competency_ref: competencyRef, supporting_competency_refs: [],
    source: { kind: 'legacy_submission_question', submission_id: `submission-${suffix}`, submission_intent_id: generateDomainId('int'), assignment_id: `assignment-${suffix}`, worksheet_id: worksheetId, question_id: task.source.question_id, question_index: 0, source_revision: 1, content_hash: task.source.content_hash, hash_version: task.source.hash_version, grading_revision: 1, learning_v2_attempt_no: 1 },
    answer: { type: 'selected_response', value: 'RAW_ANSWER_CANARY', format_version: 1 },
    outcome: { correctness: correct ? 'correct' : 'incorrect', score: correct ? 1 : 0, points_awarded: correct ? 1 : 0, max_points: 1, grader: 'deterministic', grader_version: DETERMINISTIC_GRADER_VERSION },
    independence: { level: 'independent', assistance_source: 'none' }, attempt_no: 1, submitted_at: time, server_received_at: time, created_at: time, status: 'active', idempotency_key: randomUUID(),
  })
  const evidence = (from = attempt()) => ({ evidence_id: generateDomainId('evd'), schema_version: EVIDENCE_SCHEMA_VERSION, tenant_id: tenantId, student_id: studentId, ...correctnessEvidenceForAttempt(from), occurred_at: from.submitted_at, recorded_at: from.server_received_at, status: 'active', idempotency_key: randomUUID() })
  const initialAttempt = attempt(tasks[0], true, new Date(now.getTime() - 5000)); const initialEvidence = evidence(initialAttempt)
  return { now, suffix, actor, student, tenantId, teacherId, studentId, competencyId, frameworkId, objectiveId, competencyRef, objectiveRef, worksheetId, questions, tasks, attempt, evidence, initialAttempt, initialEvidence,
    classId: `p5-class-${suffix}`,
  }
}
export async function seedPhase5(db, fixture) {
  const f = fixture
  await Promise.all([
    db.collection('users').insertOne({ id: f.teacherId, email: `${f.teacherId}@example.test`, name: 'Phase 5 synthetic teacher', created_at: f.now }),
    db.collection('students').insertOne({ id: f.studentId, username: f.studentId, display_name: 'Phase 5 synthetic learner', created_at: f.now, protected_attribute_canary: 'PROTECTED_CANARY' }),
    db.collection('learning_v2_tenants').insertOne({ tenant_id: f.tenantId, type: 'personal', owner_teacher_id: f.teacherId, status: 'active', created_at: f.now }),
    db.collection('learning_v2_tenant_memberships').insertMany([{ actor_type: 'teacher', actor_id: f.teacherId, tenant_id: f.tenantId, role: 'teacher', status: 'active' }, { actor_type: 'student', actor_id: f.studentId, tenant_id: f.tenantId, role: 'student', status: 'active' }]),
    db.collection('classes').insertOne({ id: f.classId, teacher_id: f.teacherId, name: 'Phase 5 synthetic class', enrolled_students: [{ student_id: f.studentId, display_name: 'Phase 5 synthetic learner' }] }),
    db.collection('curriculum_frameworks').insertOne({ tenant_id: f.tenantId, scope: 'tenant', framework_id: f.frameworkId, version: f.competencyRef.framework_version, status: 'published', name: 'Synthetic framework' }),
    db.collection('curriculum_nodes').insertOne({ tenant_id: f.tenantId, competency_id: f.competencyId, status: 'active', framework_ref: { framework_id: f.frameworkId, version: f.competencyRef.framework_version }, labels: { de: 'Phase 5 Testkompetenz' }, prerequisites: [{ private_canary: 'PREREQUISITE_CANARY' }] }),
    db.collection('learning_objectives').insertOne({ tenant_id: f.tenantId, ...f.objectiveRef, status: 'published', visibility: 'tenant', title: 'Phase 5 Testlernziel', learner_statement: 'Ich kann den synthetischen Test lösen.', competency_targets: [{ ...f.competencyRef, role: 'primary' }] }),
    db.collection('worksheets').insertOne({ id: f.worksheetId, user_id: f.teacherId, title: 'Phase 5 synthetic worksheet', revision: 1, content: { questions: f.questions } }),
    db.collection('learning_tasks').insertMany(structuredClone(f.tasks)),
    db.collection('learning_attempts').insertOne(structuredClone(f.initialAttempt)),
    db.collection('evidence_events').insertOne({ ...structuredClone(f.initialEvidence), teacher_note: 'TEACHER_NOTE_CANARY', invalidation: { note: 'INVALIDATION_CANARY' } }),
    db.collection('student_knowledge_states').insertOne(projectKnowledgeState({ tenantId: f.tenantId, studentId: f.studentId, competencyRef: f.competencyRef, evidence: [f.initialEvidence], now: f.now })),
  ])
}
export async function learningSnapshot(db) {
  const names = ['assignments', 'submissions', 'learning_attempts', 'evidence_events', 'student_knowledge_states', 'tutor_sessions', 'learning_events', 'worksheets', 'grades', 'reflections']
  return Object.fromEntries(await Promise.all(names.map(async (name) => [name, JSON.stringify(await db.collection(name).find({}).sort({ _id: 1 }).toArray())])))
}
