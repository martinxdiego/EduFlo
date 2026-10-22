import { deletionFencedDatabase } from '../../deletion-write-fence.js'
import { requireTeacher } from '../auth/learning-authorization.js'
import { LearningV2Error, validationError } from '../contracts/errors.js'
import { bindAssignmentRequestSchema, PHASE_2_SCHEMA_VERSION } from '../contracts/phase2.js'
import { WORKSHEET_QUESTION_HASH_VERSION, worksheetQuestionContentHash } from '../../worksheet-question-identity.js'

function parse(input) {
  const result = bindAssignmentRequestSchema.safeParse(input)
  if (!result.success) throw validationError(result.error)
  return result.data
}

export function multipleChoiceEligibility(question) {
  if (!question || question.type !== 'multiple_choice') return { eligible: false, reason: 'QUESTION_NOT_ELIGIBLE' }
  if (!Array.isArray(question.options) || question.options.length < 3) return { eligible: false, reason: 'QUESTION_NOT_ELIGIBLE' }
  if (question.options.some((option) => typeof option !== 'string' || option.trim().length === 0)) {
    return { eligible: false, reason: 'QUESTION_NOT_ELIGIBLE' }
  }
  if (new Set(question.options).size !== question.options.length) return { eligible: false, reason: 'QUESTION_NOT_ELIGIBLE' }
  if (typeof question.answer !== 'string' || !question.options.includes(question.answer)) {
    return { eligible: false, reason: 'QUESTION_NOT_ELIGIBLE' }
  }
  return { eligible: true }
}

function clean(document) {
  const result = structuredClone(document)
  if (result.bound_at instanceof Date) result.bound_at = result.bound_at.toISOString()
  return result
}

export class AssignmentBindingService {
  constructor(db, options = {}) { db = deletionFencedDatabase(db);
    this.db = db
    this.now = options.now || (() => new Date())
  }

  async bind(actor, assignmentId, rawInput) {
    requireTeacher(actor)
    const input = parse(rawInput)
    const assignment = await this.db.collection('assignments').findOne({ id: assignmentId, teacher_id: actor.teacher_id })
    if (!assignment) throw new LearningV2Error('NOT_FOUND')
    const worksheet = await this.db.collection('worksheets').findOne({ id: assignment.worksheet_id, user_id: actor.teacher_id })
    if (!worksheet) throw new LearningV2Error('NOT_FOUND')
    const questions = worksheet.content?.questions || []
    const questionIds = new Set()
    const taskRefs = new Set()
    const pins = []

    for (const requested of input.task_pins) {
      if (questionIds.has(requested.question_id)) throw new LearningV2Error('VALIDATION_ERROR')
      questionIds.add(requested.question_id)
      const taskKey = `${requested.task_id}:${requested.task_version}`
      if (taskRefs.has(taskKey)) throw new LearningV2Error('VALIDATION_ERROR')
      taskRefs.add(taskKey)

      const question = questions.find((candidate) => candidate?.question_id === requested.question_id)
      if (!question || !multipleChoiceEligibility(question).eligible) throw new LearningV2Error('VALIDATION_ERROR')
      const task = await this.db.collection('learning_tasks').findOne({
        tenant_id: actor.tenant_id,
        task_id: requested.task_id,
        version: requested.task_version,
        status: 'published',
      })
      const primaryTargets = task?.competency_targets?.filter((target) => target.role === 'primary') || []
      const sourceHash = worksheetQuestionContentHash(question)
      if (!task
        || task.task_type !== 'selected_response'
        || task.response_modality !== 'choice'
        || task.source?.worksheet_id !== worksheet.id
        || task.source?.question_id !== question.question_id
        || task.source?.content_hash !== sourceHash
        || task.source?.hash_version !== WORKSHEET_QUESTION_HASH_VERSION
        || primaryTargets.length !== 1) {
        throw new LearningV2Error('VALIDATION_ERROR')
      }
      pins.push({
        question_id: question.question_id,
        worksheet_id: worksheet.id,
        task_id: task.task_id,
        task_version: task.version,
        content_hash: sourceHash,
        hash_version: WORKSHEET_QUESTION_HASH_VERSION,
      })
    }

    const binding = {
      enabled: true,
      schema_version: PHASE_2_SCHEMA_VERSION,
      tenant_id: actor.tenant_id,
      task_pins: pins,
      bound_by: actor.teacher_id,
      bound_at: this.now(),
    }
    const updated = await this.db.collection('assignments').updateOne(
      { id: assignmentId, teacher_id: actor.teacher_id, learning_v2_revision: assignment.learning_v2_revision ?? { $exists: false } },
      { $set: { learning_v2: binding, updated_at: this.now() } },
    )
    if (updated.matchedCount !== 1) throw new LearningV2Error('CONFLICT')
    return clean(binding)
  }

  async get(actor, assignmentId) {
    requireTeacher(actor)
    const assignment = await this.db.collection('assignments').findOne(
      { id: assignmentId, teacher_id: actor.teacher_id },
      { projection: { _id: 0, learning_v2: 1 } },
    )
    if (!assignment) throw new LearningV2Error('NOT_FOUND')
    return assignment.learning_v2 ? clean(assignment.learning_v2) : null
  }

  async disable(actor, assignmentId) {
    requireTeacher(actor)
    const result = await this.db.collection('assignments').updateOne(
      { id: assignmentId, teacher_id: actor.teacher_id },
      { $set: { 'learning_v2.enabled': false, 'learning_v2.disabled_at': this.now(), updated_at: this.now() } },
    )
    if (result.matchedCount !== 1) throw new LearningV2Error('NOT_FOUND')
    return { enabled: false }
  }
}
