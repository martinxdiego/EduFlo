import { generateDomainId } from '../contracts/ids.js'
import { LearningV2Error, validationError } from '../contracts/errors.js'
import {
  PHASE_1_SCHEMA_VERSION,
  createObjectiveRequestSchema,
  createObjectiveVersionRequestSchema,
} from '../contracts/phase1.js'
import { requireTeacher } from '../auth/learning-authorization.js'

function parse(schema, input) {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw validationError(parsed.error)
  return parsed.data
}

function definitionFromInput(input) {
  const { schema_version, expected_version, ...definition } = input
  return definition
}

export function objectiveDto(document) {
  if (!document) return document
  const { _id, ...dto } = document
  for (const key of ['created_at', 'published_at']) {
    if (dto[key] instanceof Date) dto[key] = dto[key].toISOString()
  }
  return dto
}

function duplicateConflict(error) {
  if (error?.code === 11000) throw new LearningV2Error('CONFLICT')
  throw error
}

export class ObjectiveService {
  constructor(repository, curriculumService, options = {}) {
    this.repository = repository
    this.curriculumService = curriculumService
    this.generateId = options.generateId || generateDomainId
    this.now = options.now || (() => new Date())
  }

  async create(actor, rawInput) {
    requireTeacher(actor)
    const input = parse(createObjectiveRequestSchema, rawInput)
    await this.curriculumService.requireCompetencyTargets(actor, input.competency_targets)
    const now = this.now()
    const document = {
      objective_id: this.generateId('obj'),
      version: 1,
      tenant_id: actor.tenant_id,
      status: 'draft',
      definition_schema_version: PHASE_1_SCHEMA_VERSION,
      ...definitionFromInput(input),
      created_by: actor.teacher_id,
      created_at: now,
      published_at: null,
    }
    try {
      await this.repository.insert(actor, document)
    } catch (error) {
      duplicateConflict(error)
    }
    return objectiveDto(document)
  }

  async createVersion(actor, objectiveId, rawInput) {
    requireTeacher(actor)
    const input = parse(createObjectiveVersionRequestSchema, rawInput)
    const latest = await this.repository.findLatest(actor, objectiveId)
    if (!latest) throw new LearningV2Error('NOT_FOUND')
    if (latest.version !== input.expected_version) throw new LearningV2Error('CONFLICT')
    await this.curriculumService.requireCompetencyTargets(actor, input.competency_targets)
    const document = {
      objective_id: objectiveId,
      version: latest.version + 1,
      tenant_id: actor.tenant_id,
      status: 'draft',
      definition_schema_version: PHASE_1_SCHEMA_VERSION,
      ...definitionFromInput(input),
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
    return objectiveDto(document)
  }

  async publish(actor, objectiveId, expectedVersion) {
    requireTeacher(actor)
    const latest = await this.repository.findLatest(actor, objectiveId)
    if (!latest) throw new LearningV2Error('NOT_FOUND')
    if (latest.version !== expectedVersion || latest.status !== 'draft') throw new LearningV2Error('CONFLICT')
    await this.curriculumService.requireCompetencyTargets(actor, latest.competency_targets)
    const published = await this.repository.publishDraft(actor, objectiveId, expectedVersion, this.now())
    if (!published) throw new LearningV2Error('CONFLICT')
    return objectiveDto(published)
  }

  async get(actor, objectiveId, version) {
    const document = version
      ? await this.repository.findVersion(actor, objectiveId, version)
      : await this.repository.findLatest(actor, objectiveId, actor.actor_type === 'student' ? 'published' : undefined)
    if (!document || (actor.actor_type === 'student' && (document.status !== 'published' || document.visibility !== 'tenant'))) {
      throw new LearningV2Error('NOT_FOUND')
    }
    return objectiveDto(document)
  }

  async list(actor, filter = {}, limit = 50) {
    const safeFilter = actor.actor_type === 'student' ? { ...filter, status: 'published', visibility: 'tenant' } : filter
    return (await this.repository.list(actor, safeFilter, limit)).map(objectiveDto)
  }
}
