import { localHostingEnvironment } from './helpers/local-hosting-environment.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'
import {
  PHASE_1_SCHEMA_VERSION,
  competencyTargetsSchema,
  createObjectiveRequestSchema,
} from '../lib/server/learning-v2/contracts/phase1.js'
import { LearningV2Error } from '../lib/server/learning-v2/contracts/errors.js'
import { ObjectiveService } from '../lib/server/learning-v2/objectives/objective-service.js'
import { TaskService, studentTaskDto, taskDto } from '../lib/server/learning-v2/tasks/task-service.js'

test('P0 R01 private domain fields cannot enter the explicit student delivery DTO', () => {
  const document = { task_id: 'task', version: 1, status: 'published', task_type: 'selected_response', response_modality: 'choice',
    objective_refs: [{ objective_id: 'objective', version: 1, private_note: 'PRIVATE_OBJECTIVE' }],
    source: { audit_snapshot: { answer: 'PRIVATE_ANSWER', explanation: 'PRIVATE_EXPLANATION', answer_index: 1 } },
    unknown_private_field: 'PRIVATE_AUTHORED_AUDIT',
  }
  const dto = studentTaskDto(document, { prompt: 'Question', options: ['One', 'Two', 'Three'] })
  assert.equal(JSON.stringify(dto).includes('PRIVATE_'), false)
  assert.equal(taskDto(document).source.audit_snapshot.answer, 'PRIVATE_ANSWER')
  assert.equal(taskDto(document).unknown_private_field, undefined)
})
import { ExistingContentAdapter } from '../lib/server/learning-v2/tasks/existing-content-adapter.js'
import { CurriculumService, validateCurriculumGraph } from '../lib/server/learning-v2/curriculum/curriculum-service.js'
import {
  DEVELOPMENT_CURRICULUM_SUBSET,
  requireDevelopmentCurriculumSeedAllowed,
} from '../lib/server/learning-v2/curriculum/development-subset.js'
import { learningV2IndexSpecifications } from '../lib/server/learning-v2/database/bootstrap.js'
import { isLearningV2Enabled, requireLearningV2Enabled } from '../lib/server/learning-v2/feature-flags/learning-v2.js'
import {
  hasStableWorksheetQuestionIds,
  reconcileWorksheetQuestionIds,
  worksheetQuestionContentHash,
} from '../lib/server/worksheet-question-identity.js'
import { prepareWorksheetContent } from '../lib/server/worksheet-quality.js'

const tenantA = generateDomainId('ten')
const tenantB = generateDomainId('ten')
const primaryId = DEVELOPMENT_CURRICULUM_SUBSET.nodes[2].competency_id
const supportingId = DEVELOPMENT_CURRICULUM_SUBSET.nodes[3].competency_id
const frameworkId = DEVELOPMENT_CURRICULUM_SUBSET.framework.framework_id
const frameworkVersion = DEVELOPMENT_CURRICULUM_SUBSET.framework.version

const teacherA = Object.freeze({
  actor_id: 'teacher-a', actor_type: 'teacher', role: 'teacher', tenant_id: tenantA,
  teacher_id: 'teacher-a', student_id: null, permissions: ['learning:write'],
})
const teacherB = Object.freeze({ ...teacherA, actor_id: 'teacher-b', teacher_id: 'teacher-b', tenant_id: tenantB })
const studentA = Object.freeze({
  actor_id: 'student-a', actor_type: 'student', role: 'student', tenant_id: tenantA,
  teacher_id: null, student_id: 'student-a', permissions: ['learning:read:self'],
})

function target(competencyId, role) {
  return { competency_id: competencyId, framework_id: frameworkId, framework_version: frameworkVersion, role }
}

function objectiveInput(overrides = {}) {
  return {
    schema_version: PHASE_1_SCHEMA_VERSION,
    source_type: 'curriculum',
    visibility: 'tenant',
    title: 'Addition erklären',
    learner_statement: 'Ich kann eine Additionsstrategie verständlich erklären.',
    competency_targets: [target(primaryId, 'primary'), target(supportingId, 'supporting')],
    audience: { cycles: ['development-cycle'], grades: [5] },
    difficulty: 0.4,
    estimated_effort_minutes: 15,
    ...overrides,
  }
}

function taskInput(objective, source = { kind: 'worksheet_question', worksheet_id: 'worksheet-a', question_index: 0 }, overrides = {}) {
  return {
    schema_version: PHASE_1_SCHEMA_VERSION,
    source,
    objective_ref: { objective_id: objective.objective_id, version: objective.version },
    task_type: 'constructed_response',
    response_modality: 'text',
    difficulty: 0.45,
    estimated_effort_minutes: 8,
    ...overrides,
  }
}

class MemoryDefinitionRepository {
  constructor(identityField) {
    this.identityField = identityField
    this.documents = []
    this.failNextInsertWithDuplicate = false
  }

  async insert(actor, document) {
    if (this.failNextInsertWithDuplicate) {
      this.failNextInsertWithDuplicate = false
      throw Object.assign(new Error('duplicate'), { code: 11000 })
    }
    const duplicate = this.documents.some((candidate) => (
      candidate.tenant_id === actor.tenant_id
      && candidate[this.identityField] === document[this.identityField]
      && candidate.version === document.version
    ))
    if (duplicate) throw Object.assign(new Error('duplicate'), { code: 11000 })
    this.documents.push(structuredClone(document))
  }

  async findVersion(actor, id, version) {
    return structuredClone(this.documents.find((document) => (
      document.tenant_id === actor.tenant_id && document[this.identityField] === id && document.version === version
    )) || null)
  }

  async findLatest(actor, id, status) {
    const matches = this.documents.filter((document) => (
      document.tenant_id === actor.tenant_id && document[this.identityField] === id && (!status || document.status === status)
    )).sort((left, right) => right.version - left.version)
    return structuredClone(matches[0] || null)
  }

  async list(actor, filter = {}) {
    return this.documents.filter((document) => (
      document.tenant_id === actor.tenant_id
      && Object.entries(filter).every(([key, value]) => document[key] === value)
    )).map(structuredClone)
  }

  async publishDraft(actor, id, version, now) {
    const document = this.documents.find((candidate) => (
      candidate.tenant_id === actor.tenant_id && candidate[this.identityField] === id
      && candidate.version === version && candidate.status === 'draft'
    ))
    if (!document) return null
    document.status = 'published'
    document.published_at = now
    return structuredClone(document)
  }
}

function curriculumFixture() {
  const allowed = new Set([primaryId, supportingId])
  return {
    async requireCompetencyTargets(_actor, targets) {
      if (targets.some((item) => !allowed.has(item.competency_id))) throw new LearningV2Error('VALIDATION_ERROR')
    },
  }
}

function services() {
  let tick = 0
  const now = () => new Date(Date.UTC(2026, 7, 24, 12, 0, tick++))
  const objectivesRepository = new MemoryDefinitionRepository('objective_id')
  const objectives = new ObjectiveService(objectivesRepository, curriculumFixture(), { now })
  const taskRepository = new MemoryDefinitionRepository('task_id')
  const sourceState = {
    revision: 3,
    question_id: generateDomainId('wqi'),
    prompt: 'Wie viel ist 7 + 5?',
  }
  const contentAdapter = {
    async resolveWorksheetQuestion(actor, source) {
      if (actor.tenant_id !== tenantA || source.worksheet_id !== 'worksheet-a') throw new LearningV2Error('NOT_FOUND')
      const question = { question_id: sourceState.question_id, type: 'open', question: sourceState.prompt, answer: '12', points: 1 }
      return {
        kind: 'worksheet_question', worksheet_id: 'worksheet-a', question_id: sourceState.question_id,
        source_revision: sourceState.revision, content_hash: worksheetQuestionContentHash(question),
        hash_version: 'worksheet-question-sha256-v1', audit_snapshot: { type: 'open', prompt: sourceState.prompt, answer: '12', points: 1 },
      }
    },
    async assertSourceCurrent(actor, source) {
      const current = await this.resolveWorksheetQuestion(actor, { worksheet_id: source.worksheet_id })
      if (current.content_hash !== source.content_hash) throw new LearningV2Error('CONFLICT')
      return current
    },
  }
  const tasks = new TaskService(taskRepository, objectivesRepository, contentAdapter, { now })
  return { objectivesRepository, objectives, taskRepository, tasks, sourceState }
}

test('objective versions are immutable after publication and stale edits conflict', async () => {
  const { objectives, objectivesRepository } = services()
  const draft = await objectives.create(teacherA, objectiveInput())
  const published = await objectives.publish(teacherA, draft.objective_id, 1)
  assert.equal(published.status, 'published')
  const version2 = await objectives.createVersion(teacherA, draft.objective_id, {
    ...objectiveInput({ title: 'Addition sicher erklären' }), expected_version: 1,
  })
  assert.equal(version2.version, 2)
  assert.equal(version2.status, 'draft')
  const old = await objectivesRepository.findVersion(teacherA, draft.objective_id, 1)
  assert.equal(old.title, 'Addition erklären')
  assert.equal(old.status, 'published')
  await assert.rejects(
    objectives.createVersion(teacherA, draft.objective_id, { ...objectiveInput(), expected_version: 1 }),
    (error) => error.code === 'CONFLICT',
  )
})

test('objective validation enforces exactly one primary and preserves supporting competencies', async () => {
  assert.equal(competencyTargetsSchema.safeParse([target(primaryId, 'supporting')]).success, false)
  assert.equal(competencyTargetsSchema.safeParse([target(primaryId, 'primary'), target(supportingId, 'primary')]).success, false)
  const { objectives } = services()
  const objective = await objectives.create(teacherA, objectiveInput())
  assert.deepEqual(objective.competency_targets.map((item) => item.role), ['primary', 'supporting'])
})

test('invalid curriculum references and request-owned authority fields are rejected', async () => {
  const { objectives } = services()
  await assert.rejects(
    objectives.create(teacherA, objectiveInput({ competency_targets: [target(generateDomainId('cmp'), 'primary')] })),
    (error) => error.code === 'VALIDATION_ERROR',
  )
  assert.equal(createObjectiveRequestSchema.safeParse({ ...objectiveInput(), tenant_id: tenantB }).success, false)
  assert.equal(createObjectiveRequestSchema.safeParse({ ...objectiveInput(), created_by: 'attacker' }).success, false)
})

test('objective and task write operations are teacher-only', async () => {
  const { objectives, tasks } = services()
  await assert.rejects(objectives.create(studentA, objectiveInput()), (error) => error.code === 'FORBIDDEN')
  const objective = await objectives.create(teacherA, objectiveInput())
  await objectives.publish(teacherA, objective.objective_id, 1)
  await assert.rejects(tasks.create(studentA, taskInput(objective)), (error) => error.code === 'FORBIDDEN')
})

test('draft definitions are hidden from students and tasks require a published objective', async () => {
  const { objectives, tasks } = services()
  const objective = await objectives.create(teacherA, objectiveInput())
  await assert.rejects(objectives.get(studentA, objective.objective_id, 1), (error) => error.code === 'NOT_FOUND')
  await assert.rejects(tasks.create(teacherA, taskInput(objective)), (error) => error.code === 'VALIDATION_ERROR')
  await objectives.publish(teacherA, objective.objective_id, 1)
  assert.equal((await objectives.get(studentA, objective.objective_id, 1)).status, 'published')
})

test('task versions pin one primary plus supporting competencies and remain immutable', async () => {
  const { objectives, tasks, taskRepository, sourceState } = services()
  const objective = await objectives.create(teacherA, objectiveInput())
  await objectives.publish(teacherA, objective.objective_id, 1)
  const task = await tasks.create(teacherA, taskInput(objective))
  const published = await tasks.publish(teacherA, task.task_id, 1)
  assert.equal(published.competency_targets.filter((item) => item.role === 'primary').length, 1)
  assert.equal(published.competency_targets.filter((item) => item.role === 'supporting').length, 1)

  sourceState.prompt = 'Wie viel ist 8 + 6?'
  sourceState.revision += 1
  const version2 = await tasks.createVersion(teacherA, task.task_id, { ...taskInput(objective), expected_version: 1 })
  assert.equal(version2.version, 2)
  const old = await taskRepository.findVersion(teacherA, task.task_id, 1)
  assert.equal(old.source.audit_snapshot.prompt, 'Wie viel ist 7 + 5?')
  assert.notEqual(old.source.content_hash, version2.source.content_hash)
})

test('task publication rejects a stale source and duplicate or stale versions conflict', async () => {
  const { objectives, tasks, taskRepository, sourceState } = services()
  const objective = await objectives.create(teacherA, objectiveInput())
  await objectives.publish(teacherA, objective.objective_id, 1)
  const task = await tasks.create(teacherA, taskInput(objective))
  sourceState.prompt = 'Die Frage wurde geändert.'
  sourceState.revision += 1
  await assert.rejects(tasks.publish(teacherA, task.task_id, 1), (error) => error.code === 'CONFLICT')

  const fresh = await tasks.create(teacherA, taskInput(objective))
  taskRepository.failNextInsertWithDuplicate = true
  await assert.rejects(
    tasks.createVersion(teacherA, fresh.task_id, { ...taskInput(objective), expected_version: 1 }),
    (error) => error.code === 'CONFLICT',
  )
})

test('cross-tenant objective, task and worksheet access is denied without disclosure', async () => {
  const { objectives, tasks } = services()
  const objective = await objectives.create(teacherA, objectiveInput())
  await objectives.publish(teacherA, objective.objective_id, 1)
  await assert.rejects(objectives.get(teacherB, objective.objective_id, 1), (error) => error.code === 'NOT_FOUND')
  await assert.rejects(tasks.create(teacherB, taskInput(objective)), (error) => ['VALIDATION_ERROR', 'NOT_FOUND'].includes(error.code))
})

test('worksheet question identity is stable and content hashes track authored changes only', () => {
  const first = reconcileWorksheetQuestionIds({ questions: [
    { number: 1, type: 'open', question: 'Erkläre 7 + 5.', answer: '12' },
    { number: 2, type: 'open', question: 'Erkläre 8 + 6.', answer: '14' },
  ] })
  assert.equal(hasStableWorksheetQuestionIds(first), true)
  const reordered = reconcileWorksheetQuestionIds({ questions: [
    { ...first.questions[1], number: 1 },
    { ...first.questions[0], number: 2, question: 'Erkläre 7 + 5 mit einer anderen Strategie.' },
  ] }, first)
  assert.equal(reordered.questions[0].question_id, first.questions[1].question_id)
  assert.equal(reordered.questions[1].question_id, first.questions[0].question_id)
  assert.equal(worksheetQuestionContentHash({ ...first.questions[0], number: 99 }), worksheetQuestionContentHash(first.questions[0]))
  assert.notEqual(worksheetQuestionContentHash(reordered.questions[1]), worksheetQuestionContentHash(first.questions[0]))
})

test('existing content adapter backfills stable IDs without changing the worksheet revision', async () => {
  const worksheet = {
    id: 'worksheet-a', user_id: 'teacher-a', revision: 7, updated_at: new Date('2026-08-24T10:00:00Z'),
    content: { questions: [{ number: 1, type: 'open', question: 'Wie viel ist 7 + 5?', answer: '12' }] },
  }
  const collection = {
    async findOne(query) {
      return query.id === worksheet.id && query.user_id === worksheet.user_id ? structuredClone(worksheet) : null
    },
    async updateOne(query, update) {
      if (query.id !== worksheet.id || query.user_id !== worksheet.user_id || query.revision !== worksheet.revision) return { matchedCount: 0 }
      Object.assign(worksheet, structuredClone(update.$set))
      return { matchedCount: 1 }
    },
  }
  const adapter = new ExistingContentAdapter({ client: { startSession() { return { async withTransaction(fn) { return fn() }, async endSession() {} } } }, collection(name) { if (name === 'users') return { async findOneAndUpdate() { return { id: 'teacher-a' } } }; return { ...collection, find() { return { async toArray() { return [worksheet] } } } } } })
  const first = await adapter.resolveWorksheetQuestion(teacherA, { kind: 'worksheet_question', worksheet_id: 'worksheet-a', question_index: 0 })
  const second = await adapter.resolveWorksheetQuestion(teacherA, { kind: 'worksheet_question', worksheet_id: 'worksheet-a', question_id: first.question_id })
  assert.equal(first.question_id, second.question_id)
  assert.equal(first.content_hash, second.content_hash)
  assert.equal(first.source_revision, 7)
  assert.equal(worksheet.revision, 7)
})

test('development curriculum is explicitly non-authoritative and graph validation rejects required cycles', () => {
  assert.equal(DEVELOPMENT_CURRICULUM_SUBSET.framework.authoritative, false)
  assert.equal(DEVELOPMENT_CURRICULUM_SUBSET.framework.name.includes('NON-AUTHORITATIVE'), true)
  assert.equal(validateCurriculumGraph(DEVELOPMENT_CURRICULUM_SUBSET.nodes), true)
  const cyclic = [
    { competency_id: primaryId, prerequisites: [{ competency_id: supportingId, kind: 'required' }] },
    { competency_id: supportingId, prerequisites: [{ competency_id: primaryId, kind: 'required' }] },
  ]
  assert.throws(() => validateCurriculumGraph(cyclic), (error) => error.code === 'VALIDATION_ERROR')
})

test('development curriculum writes are teacher-only and impossible in production', async () => {
  assert.throws(() => requireDevelopmentCurriculumSeedAllowed({ NODE_ENV: 'production', LEARNING_V2_ALLOW_DEV_CURRICULUM: '1' }))
  assert.throws(() => requireDevelopmentCurriculumSeedAllowed({ NODE_ENV: 'development' }))
  assert.doesNotThrow(() => requireDevelopmentCurriculumSeedAllowed({ NODE_ENV: 'development', LEARNING_V2_ALLOW_DEV_CURRICULUM: '1' }))
  const service = new CurriculumService({ async installDevelopmentSubset() { return DEVELOPMENT_CURRICULUM_SUBSET.framework } })
  await assert.rejects(
    service.installDevelopmentSubset(studentA, { NODE_ENV: 'development', LEARNING_V2_ALLOW_DEV_CURRICULUM: '1' }),
    (error) => error.code === 'FORBIDDEN',
  )
})

test('Phase 1 and Phase 2 collections remain present after the authorized Phase 3 extension', () => {
  const names = Object.keys(learningV2IndexSpecifications()).sort()
  assert.deepEqual(names, [
    'curriculum_frameworks', 'curriculum_nodes', 'evidence_events', 'learning_attempts', 'learning_events',
    'learning_objectives', 'learning_tasks', 'learning_v2_tenant_memberships', 'learning_v2_tenants',
    'student_knowledge_states', 'submissions', 'tutor_policies', 'tutor_sessions',
  ])
  assert.deepEqual(names.filter((name) => /tutor/i.test(name)), ['tutor_policies', 'tutor_sessions'])
  assert.equal(names.some((name) => /reflection|misconception|recommendation/i.test(name)), false)
})

test('feature flag remains disabled by default and independent from Phase 1 payloads', () => {
  assert.equal(isLearningV2Enabled({ ...localHostingEnvironment,}), false)
  assert.equal(isLearningV2Enabled({ ...localHostingEnvironment, LEARNING_V2_ENABLED: 'false', LEARNING_V2_ALLOW_DEV_CURRICULUM: '1' }), false)
  assert.throws(() => requireLearningV2Enabled({ ...localHostingEnvironment, LEARNING_V2_ENABLED: '0' }), (error) => error.code === 'NOT_FOUND')
})

test('worksheet quality behavior remains compatible while identity metadata stays additive', () => {
  const prepared = prepareWorksheetContent({
    title: 'Rechnen', teacher_notes: 'Lösen und begründen.',
    questions: [{ type: 'open', question: 'Wie viel ist sieben plus fünf?', answer: '12', points: 1 }],
  }, 1)
  assert.equal(prepared.quality.passed, true)
  const identified = reconcileWorksheetQuestionIds(prepared.content)
  assert.equal(identified.questions[0].question, prepared.content.questions[0].question)
  assert.equal(identified.questions[0].answer, prepared.content.questions[0].answer)
})
