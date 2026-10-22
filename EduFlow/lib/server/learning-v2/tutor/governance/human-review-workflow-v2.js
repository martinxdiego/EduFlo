import { z } from 'zod'
import {
  TUTOR_HUMAN_REVIEW_CRITICAL_DIMENSIONS_V2,
  TUTOR_HUMAN_REVIEW_DIMENSIONS_V2,
  TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2,
} from './human-review-rubric-v2.js'

export const TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION_V2 = 'tutor-human-review-workflow-v2'
export const TUTOR_HUMAN_REVIEWER_ROLE_V2 = 'EDUFLOW_PEDAGOGICAL_REVIEWER'

export const TUTOR_HUMAN_REVIEW_STATES_V2 = Object.freeze([
  'PREPARED',
  'FIRST_PASS_IN_PROGRESS',
  'FIRST_PASS_COMPLETE',
  'ADJUDICATION_REQUIRED',
  'ADJUDICATION_IN_PROGRESS',
  'SECOND_PASS_IN_PROGRESS',
  'COMPLETE',
  'BLOCKED',
])

export const TUTOR_HUMAN_REVIEW_TRANSITIONS_V2 = Object.freeze({
  NONE: Object.freeze(['PREPARED']),
  PREPARED: Object.freeze(['FIRST_PASS_IN_PROGRESS', 'BLOCKED']),
  FIRST_PASS_IN_PROGRESS: Object.freeze(['FIRST_PASS_COMPLETE', 'BLOCKED']),
  FIRST_PASS_COMPLETE: Object.freeze(['ADJUDICATION_REQUIRED', 'SECOND_PASS_IN_PROGRESS', 'BLOCKED']),
  ADJUDICATION_REQUIRED: Object.freeze(['ADJUDICATION_IN_PROGRESS', 'BLOCKED']),
  ADJUDICATION_IN_PROGRESS: Object.freeze(['SECOND_PASS_IN_PROGRESS', 'BLOCKED']),
  SECOND_PASS_IN_PROGRESS: Object.freeze(['COMPLETE', 'BLOCKED']),
  COMPLETE: Object.freeze([]),
  BLOCKED: Object.freeze([]),
})

const stateSchema = z.enum(TUTOR_HUMAN_REVIEW_STATES_V2)

export const TUTOR_HUMAN_REVIEW_WORKFLOW_V2 = Object.freeze({
  workflow_contract_version: TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION_V2,
  rubric_version: TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2,
  required_reviewer_role: TUTOR_HUMAN_REVIEWER_ROLE_V2,
  lifecycle_states: TUTOR_HUMAN_REVIEW_STATES_V2,
  transitions: TUTOR_HUMAN_REVIEW_TRANSITIONS_V2,
  state_source: 'DERIVED_FROM_CREATE_ONCE_ARTIFACTS',
  mutable_status_record: false,
  first_pass_reviews_per_item: 2,
  adjudication_reviewer_count: 1,
  reviewer_independence_required: true,
  first_pass_ratings_rewritable: false,
  second_pass_can_rewrite_first_pass: false,
  review_status: 'NOT_REVIEWED',
  review_execution_authorized: false,
  approval_effect: 'NONE',
  runtime_approval_effect: 'NONE',
  production_approval_effect: 'NONE',
  learning_authority: 'NONE',
  evidence_effect: 'NONE',
})

export function assertTutorHumanReviewTransition(from, to) {
  const parsedTo = stateSchema.parse(to)
  const key = from === null ? 'NONE' : stateSchema.parse(from)
  if (!TUTOR_HUMAN_REVIEW_TRANSITIONS_V2[key].includes(parsedTo)) throw new TypeError(`Forbidden Human Review transition: ${key} -> ${parsedTo}`)
  return true
}

export function tutorHumanReviewRequiredAdjudications(first, second) {
  const byFirst = new Map(first.ratings.map((rating) => [rating.dimension, rating.rating]))
  const bySecond = new Map(second.ratings.map((rating) => [rating.dimension, rating.rating]))
  const required = []
  for (const dimension of TUTOR_HUMAN_REVIEW_DIMENSIONS_V2) {
    const left = byFirst.get(dimension)
    const right = bySecond.get(dimension)
    const criticalDisagreement = TUTOR_HUMAN_REVIEW_CRITICAL_DIMENSIONS_V2.includes(dimension) && left !== right
    const passFailDisagreement = new Set([left, right]).has('PASS') && new Set([left, right]).has('FAIL')
    if (criticalDisagreement || passFailDisagreement) required.push(dimension)
  }
  return Object.freeze(required)
}

export function deriveTutorHumanReviewState({
  prepared,
  firstPassExpected,
  firstPassCompleted,
  requiredAdjudications,
  completedAdjudications,
  secondPassCompleted,
  finalRecordExists,
  blockedReason = null,
}) {
  if (blockedReason !== null) return 'BLOCKED'
  if (!prepared) return null
  if (firstPassCompleted === 0) return 'PREPARED'
  if (firstPassCompleted < firstPassExpected) return 'FIRST_PASS_IN_PROGRESS'
  if (firstPassCompleted !== firstPassExpected) throw new TypeError('First-Pass completion count exceeds its exact requirement')
  if (requiredAdjudications > 0 && completedAdjudications === 0) return 'ADJUDICATION_REQUIRED'
  if (completedAdjudications < requiredAdjudications) return 'ADJUDICATION_IN_PROGRESS'
  if (completedAdjudications > requiredAdjudications) throw new TypeError('Adjudication count exceeds its exact requirement')
  if (!secondPassCompleted) return requiredAdjudications > 0 ? 'ADJUDICATION_IN_PROGRESS' : 'FIRST_PASS_COMPLETE'
  if (!finalRecordExists) return 'SECOND_PASS_IN_PROGRESS'
  return 'COMPLETE'
}

export function deriveTutorHumanReviewStateFromArtifacts({
  claim,
  reviewItemRefs,
  firstPassSubmissions = [],
  adjudicationSubmissions = [],
  secondPassCompletion = null,
  finalRecord = null,
  blockedReason = null,
}) {
  if (blockedReason !== null) return 'BLOCKED'
  if (!claim) return null
  if (!Array.isArray(reviewItemRefs) || !reviewItemRefs.length || new Set(reviewItemRefs).size !== reviewItemRefs.length) throw new TypeError('Review item artifact set is invalid')
  const byItem = new Map(reviewItemRefs.map((item) => [item, []]))
  for (const submission of firstPassSubmissions) {
    if (submission.phase !== 'FIRST_PASS' || !byItem.has(submission.review_item_ref)) throw new TypeError('First-Pass artifact binding is invalid')
    byItem.get(submission.review_item_ref).push(submission)
  }
  if (firstPassSubmissions.length === 0) return 'PREPARED'
  for (const submissions of byItem.values()) {
    if (submissions.length > 2 || new Set(submissions.map((item) => item.reviewer_ref)).size !== submissions.length) throw new TypeError('First-Pass artifact independence is invalid')
  }
  if ([...byItem.values()].some((submissions) => submissions.length < 2)) return 'FIRST_PASS_IN_PROGRESS'

  const required = []
  for (const [reviewItemRef, submissions] of byItem) {
    for (const dimension of tutorHumanReviewRequiredAdjudications(submissions[0], submissions[1])) required.push(`${reviewItemRef}\0${dimension}`)
  }
  const completed = new Set()
  for (const submission of adjudicationSubmissions) {
    if (submission.phase !== 'ADJUDICATION' || !byItem.has(submission.review_item_ref)) throw new TypeError('Adjudication artifact binding is invalid')
    const key = `${submission.review_item_ref}\0${submission.dimension_rating?.dimension}`
    if (!required.includes(key) || completed.has(key)) throw new TypeError('Adjudication artifact is unexpected or duplicated')
    const firstReviewerRefs = byItem.get(submission.review_item_ref).map((item) => item.reviewer_ref)
    if (firstReviewerRefs.includes(submission.reviewer_ref)) throw new TypeError('Adjudication artifact violates reviewer independence')
    completed.add(key)
  }
  if (required.length && completed.size === 0) return 'ADJUDICATION_REQUIRED'
  if (completed.size < required.length) return 'ADJUDICATION_IN_PROGRESS'
  if (secondPassCompletion === null) return required.length ? 'ADJUDICATION_IN_PROGRESS' : 'FIRST_PASS_COMPLETE'
  if (secondPassCompletion.complete !== true || secondPassCompletion.first_pass_ratings_rewritten === true) throw new TypeError('Second-Pass completion artifact is invalid')
  if (finalRecord === null) return 'SECOND_PASS_IN_PROGRESS'
  if (finalRecord.lifecycle_state !== 'COMPLETE') throw new TypeError('Final Review Record is not complete')
  return 'COMPLETE'
}
