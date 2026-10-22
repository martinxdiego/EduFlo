import { requireStudent, requireTeacher } from '../auth/learning-authorization.js'
import { LearningV2Error, validationError } from '../contracts/errors.js'
import { generateDomainId } from '../contracts/ids.js'
import { PHASE_1_SCHEMA_VERSION, createTaskVersionRequestSchema, taskDefinitionRequestSchema } from '../contracts/phase1.js'

function parse(schema, input) {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw validationError(parsed.error)
  return parsed.data
}

function duplicateConflict(error) {
  if (error?.code === 11000) throw new LearningV2Error('CONFLICT')
  throw error
}

export function taskDto(document) {
  if (!document) return document
  const fields = ['task_id', 'version', 'tenant_id', 'status', 'definition_schema_version', 'source', 'objective_refs', 'competency_targets',
    'task_type', 'response_modality', 'difficulty', 'estimated_effort_minutes', 'created_by', 'created_at', 'published_at', 'supersedes_version']
  const dto = Object.fromEntries(fields.filter((key) => document[key] !== undefined).map((key) => [key, structuredClone(document[key])]))
  for (const key of ['created_at', 'published_at']) {
    if (dto[key] instanceof Date) dto[key] = dto[key].toISOString()
  }
  return dto
}

export function studentTaskDto(document, delivery) {
  return {
    task_id: document.task_id, version: document.version, status: 'published',
    task_type: document.task_type, response_modality: document.response_modality,
    objective_refs: document.objective_refs.map(({ objective_id, version }) => ({ objective_id, version })),
    content: { prompt: delivery.prompt, options: [...delivery.options] },
  }
}

function definitionFromInput(input, source, objective) {
  return {
    source,
    objective_refs: [{ objective_id: objective.objective_id, version: objective.version }],
    competency_targets: structuredClone(objective.competency_targets),
    task_type: input.task_type,
    response_modality: input.response_modality,
    ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
    ...(input.estimated_effort_minutes !== undefined ? { estimated_effort_minutes: input.estimated_effort_minutes } : {}),
  }
}

export class TaskService {
  constructor(repository, objectiveRepository, contentAdapter, options = {}) {
    this.repository = repository
    this.objectiveRepository = objectiveRepository
    this.contentAdapter = contentAdapter
    this.generateId = options.generateId || generateDomainId
    this.now = options.now || (() => new Date())
  }

  async publishedObjective(actor, reference) {
    const objective = await this.objectiveRepository.findVersion(actor, reference.objective_id, reference.version)
    if (!objective || objective.status !== 'published' || objective.visibility !== 'tenant') {
      throw new LearningV2Error('VALIDATION_ERROR')
    }
    const primaryCount = objective.competency_targets?.filter((target) => target.role === 'primary').length
    if (primaryCount !== 1) throw new LearningV2Error('VALIDATION_ERROR')
    return objective
  }

  async create(actor, rawInput) {
    requireTeacher(actor)
    const input = parse(taskDefinitionRequestSchema, rawInput)
    const objective = await this.publishedObjective(actor, input.objective_ref)
    const source = await this.contentAdapter.resolveWorksheetQuestion(actor, input.source)
    const now = this.now()
    const document = {
      task_id: this.generateId('tsk'),
      version: 1,
      tenant_id: actor.tenant_id,
      status: 'draft',
      definition_schema_version: PHASE_1_SCHEMA_VERSION,
      ...definitionFromInput(input, source, objective),
      created_by: actor.teacher_id,
      created_at: now,
      published_at: null,
    }
    try {
      await this.repository.insert(actor, document)
    } catch (error) {
      duplicateConflict(error)
    }
    return taskDto(document)
  }

  async createVersion(actor, taskId, rawInput) {
    requireTeacher(actor)
    const input = parse(createTaskVersionRequestSchema, rawInput)
    const latest = await this.repository.findLatest(actor, taskId)
    if (!latest || latest.created_by !== actor.teacher_id) throw new LearningV2Error('NOT_FOUND')
    if (latest.version !== input.expected_version) throw new LearningV2Error('CONFLICT')
    const objective = await this.publishedObjective(actor, input.objective_ref)
    const source = await this.contentAdapter.resolveWorksheetQuestion(actor, input.source)
    const document = {
      task_id: taskId,
      version: latest.version + 1,
      tenant_id: actor.tenant_id,
      status: 'draft',
      definition_schema_version: PHASE_1_SCHEMA_VERSION,
      ...definitionFromInput(input, source, objective),
      created_by: actor.teacher_id,
      created_at: this.now(),
      published_at: null,
      supersedes_version: latest.version,
    }
    try {
      await this.repository.insert(actor, document)
    } catch (error) {
      duplicateConflict(error)
    }
    return taskDto(document)
  }

  async publish(actor, taskId, expectedVersion) {
    requireTeacher(actor)
    const latest = await this.repository.findLatest(actor, taskId)
    if (!latest || latest.created_by !== actor.teacher_id) throw new LearningV2Error('NOT_FOUND')
    if (latest.version !== expectedVersion || latest.status !== 'draft') throw new LearningV2Error('CONFLICT')
    await this.publishedObjective(actor, latest.objective_refs[0])
    await this.contentAdapter.assertSourceCurrent(actor, latest.source)
    const published = await this.repository.publishDraft(actor, taskId, expectedVersion, this.now())
    if (!published) throw new LearningV2Error('CONFLICT')
    return taskDto(published)
  }

  async get(actor, taskId, version) {
    if (actor?.actor_type === 'student') requireStudent(actor)
    else requireTeacher(actor)
    const document = version
      ? await this.repository.findVersion(actor, taskId, version)
      : await this.repository.findLatest(actor, taskId, actor.actor_type === 'student' ? 'published' : undefined)
    if (!document || (actor.actor_type === 'student' && document.status !== 'published')) {
      throw new LearningV2Error('NOT_FOUND')
    }
    if (actor.actor_type === 'student') {
      const delivery = await this.repository.studentDelivery(actor, document, this.now())
      if (!delivery) throw new LearningV2Error('NOT_FOUND')
      return studentTaskDto(document, delivery)
    }
    if (document.created_by !== actor.teacher_id) throw new LearningV2Error('NOT_FOUND')
    return taskDto(document)
  }

  async list(actor, filter = {}, limit = 50) {
    if (actor?.actor_type !== 'student') {
      requireTeacher(actor)
      return (await this.repository.list(actor, { ...filter, created_by: actor.teacher_id }, limit)).map(taskDto)
    }
    requireStudent(actor)
    const tasks = await this.repository.list(actor, { ...filter, status: 'published' }, limit)
    const delivered = []
    for (const task of tasks) {
      const delivery = await this.repository.studentDelivery(actor, task, this.now())
      if (delivery) delivered.push(studentTaskDto(task, delivery))
    }
    return delivered
  }
}
