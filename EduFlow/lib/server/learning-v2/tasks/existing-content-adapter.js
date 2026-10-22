import { deletionFencedDatabase } from '../../deletion-write-fence.js'
import { LearningV2Error } from '../contracts/errors.js'
import { multipleChoiceEligibility } from '../assignments/assignment-binding-service.js'
import {
  WORKSHEET_QUESTION_HASH_VERSION,
  WORKSHEET_QUESTION_IDENTITY_VERSION,
  hasStableWorksheetQuestionIds,
  reconcileWorksheetQuestionIds,
  worksheetQuestionAuditSnapshot,
  worksheetQuestionContentHash,
} from '../../worksheet-question-identity.js'

function worksheetRevision(worksheet) {
  const revision = Number(worksheet?.revision)
  return Number.isInteger(revision) && revision > 0 ? revision : 1
}

export class ExistingContentAdapter {
  constructor(db) { db = deletionFencedDatabase(db);
    this.worksheets = db.collection('worksheets')
  }

  async loadOwnedWorksheet(actor, worksheetId) {
    const worksheet = await this.worksheets.findOne({ id: worksheetId, user_id: actor.teacher_id })
    if (!worksheet) throw new LearningV2Error('NOT_FOUND')
    return worksheet
  }

  async ensureQuestionIdentity(actor, worksheet) {
    if (hasStableWorksheetQuestionIds(worksheet.content)) return worksheet
    const revision = worksheetRevision(worksheet)
    const content = reconcileWorksheetQuestionIds(worksheet.content, worksheet.content)
    const filter = { id: worksheet.id, user_id: actor.teacher_id }
    if (worksheet.revision !== undefined) filter.revision = worksheet.revision
    const result = await this.worksheets.updateOne(filter, {
      $set: {
        content,
        revision,
        question_identity_version: WORKSHEET_QUESTION_IDENTITY_VERSION,
        updated_at: worksheet.updated_at || new Date(),
      },
    })
    if (result.matchedCount !== 1) {
      const current = await this.loadOwnedWorksheet(actor, worksheet.id)
      if (!hasStableWorksheetQuestionIds(current.content)) throw new LearningV2Error('CONFLICT')
      return current
    }
    return { ...worksheet, content, revision, question_identity_version: WORKSHEET_QUESTION_IDENTITY_VERSION }
  }

  async resolveWorksheetQuestion(actor, source) {
    let worksheet = await this.loadOwnedWorksheet(actor, source.worksheet_id)
    worksheet = await this.ensureQuestionIdentity(actor, worksheet)
    const questions = worksheet.content?.questions || []
    let question = source.question_id
      ? questions.find((candidate) => candidate.question_id === source.question_id)
      : questions[source.question_index]
    if (!question) throw new LearningV2Error('NOT_FOUND')
    if (source.question_id && source.question_index !== undefined && questions[source.question_index]?.question_id !== source.question_id) {
      throw new LearningV2Error('CONFLICT')
    }
    return {
      kind: 'worksheet_question',
      worksheet_id: worksheet.id,
      question_id: question.question_id,
      source_revision: worksheetRevision(worksheet),
      content_hash: worksheetQuestionContentHash(question),
      hash_version: WORKSHEET_QUESTION_HASH_VERSION,
      audit_snapshot: worksheetQuestionAuditSnapshot(question),
    }
  }

  async assertSourceCurrent(actor, storedSource) {
    const current = await this.resolveWorksheetQuestion(actor, {
      kind: 'worksheet_question',
      worksheet_id: storedSource.worksheet_id,
      question_id: storedSource.question_id,
    })
    if (current.content_hash !== storedSource.content_hash || current.hash_version !== storedSource.hash_version) {
      throw new LearningV2Error('CONFLICT')
    }
    return current
  }

  // Read-only trust boundary. Only the selected authored question is inspected
  // internally to verify its hash/eligibility. No content or answer leaves here.
  // Unlike resolveWorksheetQuestion, this never repairs or writes source identity.
  async verifyRecommendationSource(actor, source) {
    if (source?.kind !== 'worksheet_question') return false
    const rows = await this.worksheets.aggregate([
      { $match: { id: source.worksheet_id, user_id: actor.teacher_id,
        status: { $nin: ['retired', 'deleted', 'hidden'] }, hidden: { $ne: true }, archived: { $ne: true },
        deleted_at: { $exists: false }, retired_at: { $exists: false } } },
      { $project: { _id: 0, questions: { $filter: {
        input: { $ifNull: ['$content.questions', []] }, as: 'question',
        cond: { $eq: ['$$question.question_id', source.question_id] },
      } } } },
    ]).toArray()
    if (rows.length !== 1 || rows[0].questions.length !== 1) return false
    const question = rows[0].questions[0]
    return !question.hidden && !['retired', 'hidden', 'deleted'].includes(question.status)
      && multipleChoiceEligibility(question).eligible
      && source.hash_version === WORKSHEET_QUESTION_HASH_VERSION
      && source.content_hash === worksheetQuestionContentHash(question)
  }
}
