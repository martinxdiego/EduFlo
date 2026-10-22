import { z } from 'zod'
import { domainSeparatedJcsSha256 } from '../evaluation/human-review-canonical.js'
import {
  TUTOR_HUMAN_REVIEW_CRITICAL_DIMENSIONS_V2,
  TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2,
  TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2,
  tutorHumanReviewDimensionRatingV2Schema,
  tutorHumanReviewRatingsV2Schema,
} from './human-review-rubric-v2.js'
import { TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION_V2 } from './human-review-workflow-v2.js'
import { TUTOR_HUMAN_REVIEW_PACKET_VERSION } from '../evaluation/human-review-packet.js'
import { TUTOR_HUMAN_REVIEW_SAMPLING_VERSION } from '../evaluation/human-review-sampling.js'
import {
  parseCanonicalReviewTimestamp,
  tutorHumanReviewRecordDeleteAt,
} from './human-review-retention.js'

export const TUTOR_HUMAN_REVIEW_RECORD_VERSION = 'tutor-human-review-record-v1'
export const TUTOR_HUMAN_REVIEW_RECORD_DOMAIN = 'EDUFLOW\0H14B\0HUMAN_REVIEW_RECORD\0v1\0'
export const TUTOR_HUMAN_REVIEW_SUBMISSION_DOMAIN = 'EDUFLOW\0H14B\0HUMAN_REVIEW_SUBMISSION\0v1\0'
export const TUTOR_HUMAN_REVIEW_SUBMISSION_REF_DOMAIN = 'EDUFLOW\0H14B\0HUMAN_REVIEW_SUBMISSION_REF\0v1\0'

export const TUTOR_HUMAN_QUALITY_OUTCOMES = Object.freeze([
  'HUMAN_QUALITY_NOT_ASSESSED',
  'HUMAN_QUALITY_REVIEW_INCOMPLETE',
  'HUMAN_QUALITY_ADJUDICATION_UNRESOLVED',
  'HUMAN_QUALITY_REVIEW_BLOCKED',
  'HUMAN_QUALITY_CRITICAL_FAIL_CONFIRMED',
  'HUMAN_QUALITY_COMPLETE_WITH_FINDINGS',
  'HUMAN_QUALITY_COMPLETE_NO_FINDINGS',
])

export const TUTOR_HUMAN_REVIEW_BLOCKED_REASONS = Object.freeze([
  'SOURCE_BINDING_MISMATCH', 'PACKET_INTEGRITY_FAILURE', 'SAMPLE_INTEGRITY_FAILURE',
  'RUBRIC_VERSION_MISMATCH', 'REVIEW_AUTHORITY_INVALID', 'REVIEWER_INDEPENDENCE_VIOLATION',
  'DUPLICATE_SUBMISSION', 'REVIEW_MATERIAL_EXPIRED', 'REQUIRED_SUBMISSION_MISSING_AT_DEADLINE',
  'ADJUDICATION_INTEGRITY_FAILURE', 'OPERATIONS_NOT_READY',
])
export const TUTOR_HUMAN_REVIEW_PHASES = Object.freeze(['FIRST_PASS', 'ADJUDICATION', 'SECOND_PASS'])

const identifierSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/)
const itemRefSchema = z.string().regex(/^hri-[0-9a-f]{64}$/)
const submissionRefSchema = z.string().regex(/^hrs-[0-9a-f]{64}$/)
const shaSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/)
const timestampSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

const commonSubmissionFields = {
  submission_contract_version: z.literal(TUTOR_HUMAN_REVIEW_RECORD_VERSION),
  submission_ref: submissionRefSchema,
  workflow_contract_version: z.literal(TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION_V2),
  rubric_version: z.literal(TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2),
  review_claim_sha256: shaSchema, assignment_sha256: shaSchema,
  assignment_ref: z.string().regex(/^hra-[0-9a-f]{64}$/),
  review_ref: identifierSchema, reviewer_ref: identifierSchema, source_run_id: identifierSchema,
  source_result_sha256: shaSchema, sample_manifest_sha256: shaSchema, packet_sha256: shaSchema,
  review_item_ref: itemRefSchema, submitted_at: timestampSchema,
  synthetic_note: z.string().max(500).nullable(), approval_effect: z.literal('NONE'),
  learning_authority: z.literal('NONE'), evidence_effect: z.literal('NONE'), submission_sha256: shaSchema,
}

const firstPassSubmissionSchema = z.object({
  ...commonSubmissionFields, phase: z.literal('FIRST_PASS'), ratings: tutorHumanReviewRatingsV2Schema,
  first_pass_blind_confirmed: z.literal(true),
}).strict()
const adjudicationSubmissionSchema = z.object({
  ...commonSubmissionFields, phase: z.literal('ADJUDICATION'),
  dimension_rating: tutorHumanReviewDimensionRatingV2Schema,
  independent_from_reviewer_refs: z.tuple([identifierSchema, identifierSchema]),
}).strict().superRefine((value, context) => {
  if (value.independent_from_reviewer_refs[0] === value.independent_from_reviewer_refs[1]
    || value.independent_from_reviewer_refs.includes(value.reviewer_ref)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Adjudicator independence binding is invalid' })
  }
})
const secondPassSubmissionSchema = z.object({
  ...commonSubmissionFields, phase: z.literal('SECOND_PASS'), first_pass_submission_sha256: shaSchema,
  governance_analysis_complete: z.literal(true), first_pass_ratings_rewritten: z.literal(false),
}).strict()
export const tutorHumanReviewSubmissionSchema = z.union([
  firstPassSubmissionSchema, adjudicationSubmissionSchema, secondPassSubmissionSchema,
])

function withoutDigest(value, field) {
  const { [field]: _ignored, ...unsigned } = value
  return unsigned
}

export function tutorHumanReviewSubmissionRef({ reviewRef, reviewerRef, reviewItemRef, phase }) {
  const parsed = z.object({ reviewRef: identifierSchema, reviewerRef: identifierSchema,
    reviewItemRef: itemRefSchema, phase: z.enum(TUTOR_HUMAN_REVIEW_PHASES) }).strict()
    .parse({ reviewRef, reviewerRef, reviewItemRef, phase })
  return `hrs-${domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_SUBMISSION_REF_DOMAIN, {
    review_ref: parsed.reviewRef, reviewer_ref: parsed.reviewerRef,
    review_item_ref: parsed.reviewItemRef, phase: parsed.phase,
  }).slice('sha256:'.length)}`
}

// Only the repository-backed Coordinator calls this with fields resolved from
// an opaque assignment token; no caller-supplied Grant object is accepted.
export function buildTutorHumanReviewSubmissionArtifact(bound) {
  parseCanonicalReviewTimestamp(bound.submitted_at)
  const submission_ref = tutorHumanReviewSubmissionRef({ reviewRef: bound.review_ref,
    reviewerRef: bound.reviewer_ref, reviewItemRef: bound.review_item_ref, phase: bound.phase })
  const unsigned = {
    submission_contract_version: TUTOR_HUMAN_REVIEW_RECORD_VERSION, submission_ref,
    workflow_contract_version: TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION_V2,
    rubric_version: TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2,
    review_claim_sha256: bound.review_claim_sha256, assignment_sha256: bound.assignment_sha256,
    assignment_ref: bound.assignment_ref,
    review_ref: bound.review_ref, reviewer_ref: bound.reviewer_ref, source_run_id: bound.source_run_id,
    source_result_sha256: bound.source_result_sha256, sample_manifest_sha256: bound.sample_manifest_sha256,
    packet_sha256: bound.packet_sha256, phase: bound.phase, review_item_ref: bound.review_item_ref,
    submitted_at: bound.submitted_at,
    ...(bound.phase === 'FIRST_PASS' ? { ratings: bound.ratings, first_pass_blind_confirmed: true } : {}),
    ...(bound.phase === 'ADJUDICATION' ? { dimension_rating: bound.dimension_rating,
      independent_from_reviewer_refs: bound.independent_from_reviewer_refs } : {}),
    ...(bound.phase === 'SECOND_PASS' ? { first_pass_submission_sha256: bound.first_pass_submission_sha256,
      governance_analysis_complete: true, first_pass_ratings_rewritten: false } : {}),
    synthetic_note: bound.synthetic_note ?? null, approval_effect: 'NONE',
    learning_authority: 'NONE', evidence_effect: 'NONE',
  }
  return deepFreeze(tutorHumanReviewSubmissionSchema.parse({ ...unsigned,
    submission_sha256: domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_SUBMISSION_DOMAIN, unsigned) }))
}

export function verifyTutorHumanReviewSubmission(value) {
  const parsed = tutorHumanReviewSubmissionSchema.parse(value)
  if (domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_SUBMISSION_DOMAIN, withoutDigest(parsed, 'submission_sha256')) !== parsed.submission_sha256) {
    throw new TypeError('Human Review submission digest mismatch')
  }
  if (tutorHumanReviewSubmissionRef({ reviewRef: parsed.review_ref, reviewerRef: parsed.reviewer_ref,
    reviewItemRef: parsed.review_item_ref, phase: parsed.phase }) !== parsed.submission_ref) {
    throw new TypeError('Human Review submission reference mismatch')
  }
  return parsed
}

export function createTutorHumanReviewSubmission() {
  const error = new TypeError('Raw coordinator grants are not accepted; resolve an opaque assignment token')
  error.code = 'REVIEW_AUTHORITY_INVALID'
  throw error
}

export function assertTutorHumanReviewerIndependence({ first_reviewer_refs, adjudicator_ref = null }) {
  if (!Array.isArray(first_reviewer_refs) || first_reviewer_refs.length !== 2
    || first_reviewer_refs[0] === first_reviewer_refs[1]) {
    const error = new Error('Two independent First-Pass reviewers are required')
    error.code = 'REVIEWER_INDEPENDENCE_VIOLATION'; throw error
  }
  if (adjudicator_ref !== null && first_reviewer_refs.includes(adjudicator_ref)) {
    const error = new Error('Adjudicator must be independent from both First-Pass reviewers')
    error.code = 'REVIEWER_INDEPENDENCE_VIOLATION'; throw error
  }
  return true
}

export function deriveTutorHumanQualityOutcome({ state, confirmedCriticalFail = false, hasFindings = false, ratingsSubmitted = 0 }) {
  if (state === 'BLOCKED') return 'HUMAN_QUALITY_REVIEW_BLOCKED'
  if (state === 'ADJUDICATION_REQUIRED' || state === 'ADJUDICATION_IN_PROGRESS') return 'HUMAN_QUALITY_ADJUDICATION_UNRESOLVED'
  if (state !== 'COMPLETE') return ratingsSubmitted === 0 ? 'HUMAN_QUALITY_NOT_ASSESSED' : 'HUMAN_QUALITY_REVIEW_INCOMPLETE'
  if (confirmedCriticalFail) return 'HUMAN_QUALITY_CRITICAL_FAIL_CONFIRMED'
  return hasFindings ? 'HUMAN_QUALITY_COMPLETE_WITH_FINDINGS' : 'HUMAN_QUALITY_COMPLETE_NO_FINDINGS'
}

export function hasConfirmedCriticalFail({ first, second, adjudicated = [] }) {
  const adjudicatedMap = new Map(adjudicated.map((item) => [item.dimension, item.rating]))
  for (const dimension of TUTOR_HUMAN_REVIEW_CRITICAL_DIMENSIONS_V2) {
    const left = first.ratings.find((item) => item.dimension === dimension)?.rating
    const right = second.ratings.find((item) => item.dimension === dimension)?.rating
    if ((left === 'FAIL' && right === 'FAIL') || adjudicatedMap.get(dimension) === 'FAIL') return true
  }
  return false
}

const criticalFindingSchema = z.object({ review_item_ref: itemRefSchema,
  dimension: z.enum(TUTOR_HUMAN_REVIEW_CRITICAL_DIMENSIONS_V2),
  finding_code: z.enum(Object.values(TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2).flat()) }).strict()
export const tutorHumanReviewRecordSchema = z.object({
  record_contract_version: z.literal(TUTOR_HUMAN_REVIEW_RECORD_VERSION),
  workflow_contract_version: z.literal(TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION_V2),
  rubric_version: z.literal(TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2),
  sampling_contract_version: z.literal(TUTOR_HUMAN_REVIEW_SAMPLING_VERSION),
  packet_contract_version: z.literal(TUTOR_HUMAN_REVIEW_PACKET_VERSION), review_claim_sha256: shaSchema,
  source_run_id: identifierSchema, source_result_sha256: shaSchema, sample_manifest_sha256: shaSchema,
  packet_sha256: shaSchema, review_ref: identifierSchema, review_ref_created_at: timestampSchema,
  terminal_at: timestampSchema, record_expires_at: timestampSchema, synthetic_data_only: z.literal(true),
  lifecycle_state: z.enum(['COMPLETE', 'BLOCKED']), outcome: z.enum(TUTOR_HUMAN_QUALITY_OUTCOMES),
  blocked_reason: z.enum(TUTOR_HUMAN_REVIEW_BLOCKED_REASONS).nullable(), selected_item_count: z.number().int().min(1).max(120),
  expected_first_pass_submissions: z.number().int().min(2).max(240), completed_first_pass_submissions: z.number().int().min(0).max(240),
  open_first_pass_submissions: z.number().int().min(0).max(240), required_adjudications: z.number().int().min(0).max(1080),
  completed_adjudications: z.number().int().min(0).max(1080), open_adjudications: z.number().int().min(0).max(1080),
  expected_second_pass_submissions: z.number().int().min(2).max(240), completed_second_pass_submissions: z.number().int().min(0).max(240),
  open_second_pass_submissions: z.number().int().min(0).max(240), confirmed_critical_findings: z.array(criticalFindingSchema).max(1080),
  finding_count: z.number().int().min(0).max(3240), approval_effect: z.literal('NONE'), runtime_approval_effect: z.literal('NONE'),
  production_approval_effect: z.literal('NONE'), learning_authority: z.literal('NONE'), evidence_effect: z.literal('NONE'),
  learning_truth_mutations: z.literal(0), record_sha256: shaSchema,
}).strict().superRefine((value, context) => {
  const exact = value.selected_item_count * 2
  if (value.expected_first_pass_submissions !== exact || value.expected_second_pass_submissions !== exact
    || value.completed_first_pass_submissions + value.open_first_pass_submissions !== exact
    || value.completed_adjudications + value.open_adjudications !== value.required_adjudications
    || value.completed_second_pass_submissions + value.open_second_pass_submissions !== exact) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Human Review counts are not internally derivable' })
  }
  const complete = value.lifecycle_state === 'COMPLETE'
  if (complete && (value.blocked_reason !== null || value.open_first_pass_submissions || value.open_adjudications || value.open_second_pass_submissions)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'COMPLETE requires every immutable artifact' })
  }
  if (!complete && value.blocked_reason === null) context.addIssue({ code: z.ZodIssueCode.custom, message: 'BLOCKED requires a bounded reason' })
  if (complete && value.outcome === 'HUMAN_QUALITY_REVIEW_BLOCKED') context.addIssue({ code: z.ZodIssueCode.custom, message: 'COMPLETE cannot have blocked outcome' })
  if (!complete && value.outcome !== 'HUMAN_QUALITY_REVIEW_BLOCKED') context.addIssue({ code: z.ZodIssueCode.custom, message: 'BLOCKED requires blocked outcome' })
  if (value.outcome === 'HUMAN_QUALITY_COMPLETE_NO_FINDINGS'
    && (value.confirmed_critical_findings.length || value.finding_count)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'NO_FINDINGS contradicts retained findings' })
  if ((value.outcome === 'HUMAN_QUALITY_CRITICAL_FAIL_CONFIRMED') !== (value.confirmed_critical_findings.length > 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Critical outcome and findings contradict each other' })
  }
  for (const finding of value.confirmed_critical_findings) if (!TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2[finding.dimension]?.includes(finding.finding_code)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Confirmed Critical Finding is assigned to the wrong dimension' })
  }
})

export function verifyTutorHumanReviewRecord(value) {
  const parsed = tutorHumanReviewRecordSchema.parse(value)
  const createdAt = parseCanonicalReviewTimestamp(parsed.review_ref_created_at)
  const terminalAt = parseCanonicalReviewTimestamp(parsed.terminal_at)
  parseCanonicalReviewTimestamp(parsed.record_expires_at)
  if (terminalAt.getTime() < createdAt.getTime()
    || parsed.record_expires_at !== tutorHumanReviewRecordDeleteAt(parsed.review_ref_created_at)) {
    throw new TypeError('Human Review Record retention binding mismatch')
  }
  if (domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_RECORD_DOMAIN, withoutDigest(parsed, 'record_sha256')) !== parsed.record_sha256) throw new TypeError('Human Review Record digest mismatch')
  return parsed
}

export function buildTutorHumanReviewRecord() {
  const error = new TypeError('Human Review records must be derived from immutable repository artifacts')
  error.code = 'ARTIFACT_DERIVATION_REQUIRED'; throw error
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}
