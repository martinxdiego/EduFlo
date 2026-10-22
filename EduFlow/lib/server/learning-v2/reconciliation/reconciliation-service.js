import { requireTeacher } from '../auth/learning-authorization.js'
import { LearningV2Error, validationError } from '../contracts/errors.js'
import { reconciliationRequestSchema } from '../contracts/phase2.js'
import { processLegacySubmission } from '../integration/legacy-submission-adapter.js'
import { requireTeacherStudentAccess } from '../teacher/teacher-authorization.js'
import { stableInputHash } from '../idempotency.js'

function parse(input) {
  const parsed = reconciliationRequestSchema.safeParse(input)
  if (!parsed.success) throw validationError(parsed.error)
  return parsed.data
}

export class ReconciliationService {
  constructor(db, options = {}) { this.db = db; this.now = options.now || (() => new Date()) }

  async reconcile(actor, rawInput) {
    requireTeacher(actor)
    const input = parse(rawInput)
    const scopeHash = stableInputHash([actor.tenant_id, actor.teacher_id, input.assignment_id || null, input.submission_id || null])
    let progress = { assignment_id: '', submission_id: '', as_of: this.now().toISOString(), scope_hash: scopeHash }
    if (input.cursor) {
      try {
        progress = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'))
        if (progress.scope_hash !== scopeHash || typeof progress.assignment_id !== 'string' || typeof progress.submission_id !== 'string'
          || !Number.isFinite(new Date(progress.as_of).getTime())) throw new Error('cursor')
      } catch { throw new LearningV2Error('VALIDATION_ERROR') }
    }
    const selected = input.submission_id ? await this.db.collection('submissions').findOne({ id: input.submission_id, learning_v2_tenant_id: actor.tenant_id }) : null
    if (input.submission_id && (!selected || (input.assignment_id && selected.assignment_id !== input.assignment_id))) throw new LearningV2Error('NOT_FOUND')
    const assignmentFilter = {
      teacher_id: actor.teacher_id,
      'learning_v2.tenant_id': actor.tenant_id,
      ...(input.assignment_id || selected ? { id: input.assignment_id || selected.assignment_id }
        : progress.assignment_id ? { id: { $gte: progress.assignment_id } } : {}),
    }
    const assignments = await this.db.collection('assignments').find(assignmentFilter).sort({ id: 1 }).limit(input.limit + 1).toArray()
    if ((input.assignment_id || selected) && !assignments.length) throw new LearningV2Error('NOT_FOUND')
    const assignmentMap = new Map(assignments.map((assignment) => [assignment.id, assignment]))
    const submissions = []
    let next = null
    for (const assignment of assignments.slice(0, input.limit)) {
      const rows = await this.db.collection('submissions').find({ assignment_id: assignment.id, learning_v2_tenant_id: actor.tenant_id,
        learning_v2_submission_intent_id: { $type: 'string' }, learning_v2_attempt_no: { $type: 'number' },
        submitted_at: { $lte: new Date(progress.as_of) },
        ...(input.submission_id ? { id: input.submission_id } : progress.assignment_id === assignment.id && progress.submission_id ? { id: { $gt: progress.submission_id } } : {}),
      }).sort({ id: 1 }).limit(input.limit - submissions.length + 1).toArray()
      const capacity = input.limit - submissions.length
      submissions.push(...rows.slice(0, capacity))
      if (rows.length > capacity) { next = { assignment_id: assignment.id, submission_id: submissions.at(-1).id }; break }
      const following = assignments[assignments.indexOf(assignment) + 1]
      next = following ? { assignment_id: following.id, submission_id: '' } : null
      if (submissions.length === input.limit) break
    }
    if (input.submission_id && !submissions.length) throw new LearningV2Error('NOT_FOUND')
    // Authorize every target before any repair. A teacher-triggered operation
    // never impersonates a learner or gains a broader background-repair role.
    for (const studentId of new Set(submissions.map((submission) => submission.student_id))) {
      await requireTeacherStudentAccess(this.db, actor, studentId)
    }
    const counters = { scanned: submissions.length, processed: 0, attempts: 0, evidence: 0, skipped: 0, failed: 0, unresolved_students: 0 }
    const reason_counts = {}
    const failedSubmissionIds = []
    for (const submission of submissions) {
      const assignment = assignmentMap.get(submission.assignment_id)
      const worksheet = assignment ? { id: assignment.worksheet_id } : null
      if (!assignment || !worksheet) {
        counters.failed += 1
        failedSubmissionIds.push(submission.id)
        reason_counts.RECONCILIATION_SOURCE_UNAVAILABLE = (reason_counts.RECONCILIATION_SOURCE_UNAVAILABLE || 0) + 1
        continue
      }
      try {
        const result = await processLegacySubmission({ db: this.db, actor, assignment, worksheet, submission })
        counters.processed += 1
        counters.attempts += result.attempts?.length || 0
        counters.evidence += result.evidence?.length || 0
        counters.skipped += result.skipped?.length || 0
        for (const item of result.skipped || []) reason_counts[item.reason] = (reason_counts[item.reason] || 0) + 1
      } catch {
        counters.failed += 1
        failedSubmissionIds.push(submission.id)
        reason_counts.RECONCILIATION_PROCESSING_FAILED = (reason_counts.RECONCILIATION_PROCESSING_FAILED || 0) + 1
      }
    }
    return { ...counters, reason_counts, failed_submission_ids: failedSubmissionIds,
      coverage_as_of: progress.as_of, complete: !next,
      next_cursor: next ? Buffer.from(JSON.stringify({ ...progress, ...next })).toString('base64url') : null }
  }
}
