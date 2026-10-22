import { createHash } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { tutorSyntheticEvalCases } from '../eval-fixtures.js'
import {
  TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2,
  TUTOR_HUMAN_REVIEW_DIMENSIONS_V2,
  TUTOR_HUMAN_REVIEW_NA_REASON_V2,
  TUTOR_HUMAN_REVIEW_RATINGS_V2,
  TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2,
  tutorHumanReviewDimensionRatingV2Schema,
  tutorHumanReviewRatingsV2Schema,
} from './human-review-rubric-v2.js'
import {
  TUTOR_HUMAN_REVIEWER_ROLE_V2,
  TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION_V2,
} from './human-review-workflow-v2.js'
import {
  buildTutorHumanReviewSubmissionArtifact,
  tutorHumanReviewSubmissionRef,
  verifyTutorHumanReviewSubmission,
} from './human-review-record-v1.js'
import {
  TUTOR_HUMAN_REVIEW_FIRST_PASS_PROJECTION_VERSION,
  TUTOR_HUMAN_REVIEW_SECOND_PASS_PROJECTION_VERSION,
  verifyTutorHumanReviewFirstPassProjection,
} from './human-review-projection-v1.js'
import { domainSeparatedJcsSha256 } from '../evaluation/human-review-canonical.js'
import { verifyTutorHumanReviewPacket } from '../evaluation/human-review-packet.js'
import { verifyTutorHumanReviewSampleManifest } from '../evaluation/human-review-sampling.js'
import { verifyTutorReviewCapableResultV5 } from '../evaluation/human-review-evaluator-v7.js'
import {
  createTutorHumanReviewExecutionArtifact,
  loadActiveTutorHumanReviewPacketWithInternalClock,
  readOptionalTutorHumanReviewExecutionArtifact,
  readTutorHumanReviewArtifact,
  readTutorHumanReviewExecutionArtifact,
  readTutorHumanReviewSourceResultArtifact,
  tutorHumanReviewBlocked,
  verifyTutorHumanReviewRepositoryRoot,
} from '../evaluation/human-review-repository.js'
import {
  assertTrustedTutorHumanReviewClock,
  readTrustedTutorHumanReviewNow,
  snapshotTrustedTutorHumanReviewClock,
  tutorHumanReviewServerClock,
} from './human-review-clock.js'

export const TUTOR_HUMAN_REVIEW_CLAIM_VERSION = 'tutor-human-review-claim-v1'
export const TUTOR_HUMAN_REVIEW_ASSIGNMENT_VERSION = 'tutor-human-review-assignment-v1'
export const TUTOR_HUMAN_REVIEW_OPERATIONS_ATTESTATION_VERSION = 'tutor-human-review-operations-attestation-v1'
export const TUTOR_HUMAN_REVIEW_CLAIM_DOMAIN = 'EDUFLOW\0H14B\0HUMAN_REVIEW_CLAIM\0v1\0'
export const TUTOR_HUMAN_REVIEW_ASSIGNMENT_DOMAIN = 'EDUFLOW\0H14B\0HUMAN_REVIEW_ASSIGNMENT\0v1\0'
export const TUTOR_HUMAN_REVIEW_ASSIGNMENT_TOKEN_DOMAIN = 'EDUFLOW\0H14B\0HUMAN_REVIEW_ASSIGNMENT_TOKEN\0v1\0'

const identifierSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/)
const itemRefSchema = z.string().regex(/^hri-[0-9a-f]{64}$/)
const shaSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/)
const timestampSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
const opaqueTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,160}$/)

function exactBoundaryInput(value, allowedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} input must be an object`)
  const keys = Object.keys(value)
  if (keys.some((key) => !allowedKeys.includes(key)) || allowedKeys.some((key) => !(key in value))) {
    throw new TypeError(`${label} input contains missing or caller-controlled fields`)
  }
  return value
}
const firstPassClientSchema = z.object({
  ratings: tutorHumanReviewRatingsV2Schema,
  synthetic_note: z.string().max(500).nullable(),
}).strict()
const adjudicationClientSchema = z.object({
  dimension_rating: tutorHumanReviewDimensionRatingV2Schema,
  synthetic_note: z.string().max(500).nullable(),
}).strict()
const secondPassClientSchema = z.object({
  governance_analysis_complete: z.literal(true),
  synthetic_note: z.string().max(500).nullable(),
}).strict()
const proofSchema = z.object({
  status: z.literal('OPERATOR_ATTESTED'),
  evidence_ref: identifierSchema,
  attested_at: timestampSchema,
}).strict()
export const tutorHumanReviewOperationsAttestationSchema = z.object({
  attestation_contract_version: z.literal(TUTOR_HUMAN_REVIEW_OPERATIONS_ATTESTATION_VERSION),
  repository_private: proofSchema,
  authoritative_branch_protected: proofSchema,
  designated_single_coordinator: proofSchema,
  reviewer_direct_repository_access_absent: proofSchema,
  external_properties_technically_proven: z.literal(false),
}).strict()

export const tutorHumanReviewClaimSchema = z.object({
  claim_contract_version: z.literal(TUTOR_HUMAN_REVIEW_CLAIM_VERSION),
  workflow_contract_version: z.literal(TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION_V2),
  rubric_version: z.literal(TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2),
  review_ref: identifierSchema, coordinator_ref: identifierSchema, source_run_id: identifierSchema,
  source_result_sha256: shaSchema, sample_manifest_sha256: shaSchema, packet_sha256: shaSchema,
  review_item_refs: z.array(itemRefSchema).min(1).max(120),
  review_ref_created_at: timestampSchema, synthetic_data_only: z.literal(true),
  operations_attestation: tutorHumanReviewOperationsAttestationSchema,
  approval_effect: z.literal('NONE'), runtime_approval_effect: z.literal('NONE'),
  production_approval_effect: z.literal('NONE'), learning_authority: z.literal('NONE'),
  evidence_effect: z.literal('NONE'), claim_sha256: shaSchema,
}).strict().superRefine((value, context) => {
  if (new Set(value.review_item_refs).size !== value.review_item_refs.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Review Claim item bindings must be unique' })
  }
})

export const tutorHumanReviewAssignmentSchema = z.object({
  assignment_contract_version: z.literal(TUTOR_HUMAN_REVIEW_ASSIGNMENT_VERSION),
  assignment_ref: z.string().regex(/^hra-[0-9a-f]{64}$/), assignment_token_sha256: shaSchema,
  claim_sha256: shaSchema, review_ref: identifierSchema, reviewer_ref: identifierSchema,
  reviewer_role: z.literal(TUTOR_HUMAN_REVIEWER_ROLE_V2), source_run_id: identifierSchema,
  source_result_sha256: shaSchema, sample_manifest_sha256: shaSchema, packet_sha256: shaSchema,
  phase: z.enum(['FIRST_PASS', 'ADJUDICATION', 'SECOND_PASS']), review_item_ref: itemRefSchema,
  independent_from_reviewer_refs: z.array(identifierSchema).max(2), expires_at: timestampSchema,
  direct_repository_access: z.literal(false), unblinded_source_access: z.literal(false),
  assignment_sha256: shaSchema,
}).strict().superRefine((value, context) => {
  if (value.phase === 'ADJUDICATION') {
    if (value.independent_from_reviewer_refs.length !== 2
      || new Set(value.independent_from_reviewer_refs).size !== 2
      || value.independent_from_reviewer_refs.includes(value.reviewer_ref)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Adjudicator independence is invalid' })
    }
  } else if (value.independent_from_reviewer_refs.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Only adjudication may carry independence bindings' })
  }
})

function without(value, field) { const { [field]: _ignored, ...unsigned } = value; return unsigned }
const digestBytes = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
function verifySubmissionBounded(value) {
  try { return verifyTutorHumanReviewSubmission(value) } catch {
    throw tutorHumanReviewBlocked('SOURCE_BINDING_MISMATCH', 'Persisted Review submission verification failed')
  }
}
function assignmentTokenSha256(token) {
  return domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_ASSIGNMENT_TOKEN_DOMAIN, { opaque_assignment_token: opaqueTokenSchema.parse(token) })
}
export function tutorHumanReviewAssignmentRef(token) { return `hra-${assignmentTokenSha256(token).slice('sha256:'.length)}` }

export function buildTutorHumanReviewClaimArtifact(value) {
  const unsigned = {
    claim_contract_version: TUTOR_HUMAN_REVIEW_CLAIM_VERSION,
    workflow_contract_version: TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION_V2,
    rubric_version: TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2,
    review_ref: value.review_ref, coordinator_ref: value.coordinator_ref, source_run_id: value.source_run_id,
    source_result_sha256: value.source_result_sha256, sample_manifest_sha256: value.sample_manifest_sha256,
    packet_sha256: value.packet_sha256, review_item_refs: value.review_item_refs,
    review_ref_created_at: value.review_ref_created_at, synthetic_data_only: true,
    operations_attestation: value.operations_attestation, approval_effect: 'NONE', runtime_approval_effect: 'NONE',
    production_approval_effect: 'NONE', learning_authority: 'NONE', evidence_effect: 'NONE',
  }
  return tutorHumanReviewClaimSchema.parse({ ...unsigned,
    claim_sha256: domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_CLAIM_DOMAIN, unsigned) })
}
export function verifyTutorHumanReviewClaim(value) {
  const parsed = tutorHumanReviewClaimSchema.parse(value)
  const createdAt = new Date(parsed.review_ref_created_at)
  if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== parsed.review_ref_created_at) {
    throw new TypeError('Review Claim timestamp is invalid')
  }
  for (const proof of Object.values(parsed.operations_attestation).filter((entry) => entry && typeof entry === 'object')) {
    if ('attested_at' in proof) {
      const attestedAt = new Date(proof.attested_at)
      if (!Number.isFinite(attestedAt.getTime()) || attestedAt.toISOString() !== proof.attested_at) {
        throw new TypeError('Review operations attestation timestamp is invalid')
      }
    }
  }
  if (domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_CLAIM_DOMAIN, without(parsed, 'claim_sha256')) !== parsed.claim_sha256) throw new TypeError('Review Claim digest mismatch')
  return parsed
}

export function buildTutorHumanReviewAssignmentArtifact({ claim, opaqueAssignmentToken, reviewerRef, phase, reviewItemRef, expiresAt, independentFromReviewerRefs = [] }) {
  const verifiedClaim = verifyTutorHumanReviewClaim(claim)
  if (!verifiedClaim.review_item_refs.includes(reviewItemRef)) throw new TypeError('Assignment item is outside Review Claim')
  const tokenSha = assignmentTokenSha256(opaqueAssignmentToken)
  const unsigned = {
    assignment_contract_version: TUTOR_HUMAN_REVIEW_ASSIGNMENT_VERSION,
    assignment_ref: tutorHumanReviewAssignmentRef(opaqueAssignmentToken), assignment_token_sha256: tokenSha,
    claim_sha256: verifiedClaim.claim_sha256, review_ref: verifiedClaim.review_ref,
    reviewer_ref: reviewerRef, reviewer_role: TUTOR_HUMAN_REVIEWER_ROLE_V2,
    source_run_id: verifiedClaim.source_run_id, source_result_sha256: verifiedClaim.source_result_sha256,
    sample_manifest_sha256: verifiedClaim.sample_manifest_sha256, packet_sha256: verifiedClaim.packet_sha256,
    phase, review_item_ref: reviewItemRef, independent_from_reviewer_refs: independentFromReviewerRefs,
    expires_at: expiresAt, direct_repository_access: false, unblinded_source_access: false,
  }
  return tutorHumanReviewAssignmentSchema.parse({ ...unsigned,
    assignment_sha256: domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_ASSIGNMENT_DOMAIN, unsigned) })
}
export function verifyTutorHumanReviewAssignment(value) {
  const parsed = tutorHumanReviewAssignmentSchema.parse(value)
  const expiresAt = new Date(parsed.expires_at)
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.toISOString() !== parsed.expires_at
    || parsed.assignment_ref !== `hra-${parsed.assignment_token_sha256.slice('sha256:'.length)}`) {
    throw new TypeError('Review Assignment identity or expiry is invalid')
  }
  if (domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_ASSIGNMENT_DOMAIN, without(parsed, 'assignment_sha256')) !== parsed.assignment_sha256) throw new TypeError('Review Assignment digest mismatch')
  return parsed
}

async function loadBoundArtifacts(args, clock) {
  const { repositoryRoot, sourceRunId, reviewRef } = exactBoundaryInput(args,
    ['repositoryRoot', 'sourceRunId', 'reviewRef'], 'Human Review artifact binding')
  assertTrustedTutorHumanReviewClock(clock)
  const [sourceArtifact, sampleArtifact, packet, claimArtifact] = await Promise.all([
    readTutorHumanReviewSourceResultArtifact({ repositoryRoot, sourceRunId }),
    readTutorHumanReviewArtifact({ repositoryRoot, sourceRunId, artifactName: 'sample-manifest.json' }),
    loadActiveTutorHumanReviewPacketWithInternalClock({ repositoryRoot, sourceRunId, reviewRef }, clock),
    readTutorHumanReviewExecutionArtifact({ repositoryRoot, sourceRunId, reviewRef, kind: 'claim' }),
  ])
  const source = verifyTutorReviewCapableResultV5(sourceArtifact.value)
  const sourceSha = digestBytes(sourceArtifact.bytes)
  const sample = verifyTutorHumanReviewSampleManifest(sampleArtifact.value)
  const claim = verifyTutorHumanReviewClaim(claimArtifact.value)
  if (source.source_run_id !== sourceRunId || sourceSha !== claim.source_result_sha256
    || sample.source_result_sha256 !== sourceSha || packet.source_result_sha256 !== sourceSha
    || sample.sample_manifest_sha256 !== claim.sample_manifest_sha256 || packet.sample_manifest_sha256 !== claim.sample_manifest_sha256
    || packet.packet_sha256 !== claim.packet_sha256 || claim.review_ref !== reviewRef
    || JSON.stringify(claim.review_item_refs) !== JSON.stringify(packet.items.map((item) => item.review_item_ref))) {
    throw tutorHumanReviewBlocked('SOURCE_BINDING_MISMATCH', 'Review binding chain is invalid')
  }
  tutorHumanReviewOperationsAttestationSchema.parse(claim.operations_attestation)
  return { source, sample, packet: verifyTutorHumanReviewPacket(packet), claim }
}

async function verifyOperationsReadinessWithClock(args, clock) {
  const { repositoryRoot, sourceRunId, reviewRef } = exactBoundaryInput(args,
    ['repositoryRoot', 'sourceRunId', 'reviewRef'], 'Human Review operations readiness')
  const operationClock = snapshotTrustedTutorHumanReviewClock(assertTrustedTutorHumanReviewClock(clock))
  try {
    await verifyTutorHumanReviewRepositoryRoot({ repositoryRoot, sourceRunId })
    const artifacts = await loadBoundArtifacts({ repositoryRoot, sourceRunId, reviewRef }, operationClock)
    return Object.freeze({ status: 'READY_WITH_TRUSTED_OPERATOR_ATTESTATIONS', ready: true,
      external_properties_technically_proven: false, coordinator_ref: artifacts.claim.coordinator_ref,
      claim_sha256: artifacts.claim.claim_sha256 })
  } catch (error) {
    return Object.freeze({ status: 'BLOCKED', ready: false, reason_code: error?.reasonCode || 'OPERATIONS_NOT_READY',
      external_properties_technically_proven: false })
  }
}

export async function verifyTutorHumanReviewOperationsReadiness(args) {
  return verifyOperationsReadinessWithClock(args, tutorHumanReviewServerClock())
}

export async function verifyTutorHumanReviewOperationsReadinessWithInternalClock(args, clock) {
  return verifyOperationsReadinessWithClock(args, clock)
}

const trustedCoordinators = new WeakSet()
export function assertTrustedTutorHumanReviewCoordinator(value) {
  if (!trustedCoordinators.has(value)) throw new TypeError('A repository-verified Human Review Coordinator is required')
  return value
}

function firstPassProjection({ authority, fixture }) {
  return verifyTutorHumanReviewFirstPassProjection({
    projection_version: TUTOR_HUMAN_REVIEW_FIRST_PASS_PROJECTION_VERSION,
    rubric_version: TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2, review_ref: authority.assignment.review_ref,
    review_item_ref: authority.assignment.review_item_ref, subject_category: authority.item.subject_category,
    hint_level: authority.item.hint_level, expected_tutor_action: authority.item.expected_tutor_action,
    synthetic_task_context: Object.freeze({ task: fixture.prompt, options: fixture.options }),
    final_learner_message: authority.item.learner_message,
    factual_leakage_review_view: Object.freeze({ synthetic_correct_answer_context: fixture.correctAnswer,
      permitted_dimensions: Object.freeze(['FACTUAL_CORRECTNESS', 'SOLUTION_LEAKAGE']) }),
    dimensions: TUTOR_HUMAN_REVIEW_DIMENSIONS_V2, allowed_ratings: TUTOR_HUMAN_REVIEW_RATINGS_V2,
    not_applicable_rule: Object.freeze({ dimension: 'FACTUAL_CORRECTNESS', reason: TUTOR_HUMAN_REVIEW_NA_REASON_V2 }),
    critical_findings: TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2,
  })
}

function resolveAssignment({ assignmentToken, expectedPhase }) {
  const assignmentRef = tutorHumanReviewAssignmentRef(assignmentToken)
  // The token does not reveal source/review paths. Locate a candidate only under
  // the coordinator's fixed scope, supplied when it was constructed.
  return { assignmentRef, tokenSha: assignmentTokenSha256(assignmentToken), expectedPhase }
}

async function createCoordinatorWithClock(args, clock) {
  const { repositoryRoot, sourceRunId, reviewRef } = exactBoundaryInput(args,
    ['repositoryRoot', 'sourceRunId', 'reviewRef'], 'Human Review Coordinator')
  if (process.env.NODE_ENV === 'production') throw new TypeError('Human Review Coordinator is unavailable in Production')
  assertTrustedTutorHumanReviewClock(clock)
  const readiness = await verifyOperationsReadinessWithClock({ repositoryRoot, sourceRunId, reviewRef }, clock)
  if (!readiness.ready) throw tutorHumanReviewBlocked(readiness.reason_code, 'Human Review operations are not ready')

  async function authorityFor(assignmentToken, expectedPhase) {
    const operationClock = snapshotTrustedTutorHumanReviewClock(clock)
    const trustedNow = readTrustedTutorHumanReviewNow(operationClock)
    const lookup = resolveAssignment({ assignmentToken, expectedPhase })
    const assignmentArtifact = await readTutorHumanReviewExecutionArtifact({ repositoryRoot, sourceRunId, reviewRef,
      kind: 'assignment', submissionRef: lookup.assignmentRef })
    const assignment = verifyTutorHumanReviewAssignment(assignmentArtifact.value)
    const artifacts = await loadBoundArtifacts({ repositoryRoot, sourceRunId, reviewRef }, operationClock)
    if (assignment.assignment_token_sha256 !== lookup.tokenSha || assignment.phase !== expectedPhase
      || assignment.claim_sha256 !== artifacts.claim.claim_sha256 || assignment.review_ref !== reviewRef
      || assignment.source_run_id !== sourceRunId || assignment.source_result_sha256 !== artifacts.claim.source_result_sha256
      || assignment.sample_manifest_sha256 !== artifacts.claim.sample_manifest_sha256
      || assignment.packet_sha256 !== artifacts.claim.packet_sha256
      || !artifacts.claim.review_item_refs.includes(assignment.review_item_ref)
      || trustedNow.getTime() >= new Date(assignment.expires_at).getTime()) {
      throw tutorHumanReviewBlocked('REVIEW_AUTHORITY_INVALID', 'Opaque Review Assignment is invalid or expired')
    }
    const item = artifacts.packet.items.find((candidate) => candidate.review_item_ref === assignment.review_item_ref)
    if (!item) throw tutorHumanReviewBlocked('SOURCE_BINDING_MISMATCH', 'Assigned item is absent from Packet')
    return Object.freeze({ assignment, ...artifacts, item, trusted_now: trustedNow.toISOString() })
  }

  async function persistedFirstPassFor(authority) {
    const firstRef = tutorHumanReviewSubmissionRef({ reviewRef, reviewerRef: authority.assignment.reviewer_ref,
      reviewItemRef: authority.item.review_item_ref, phase: 'FIRST_PASS' })
    const firstArtifact = await readTutorHumanReviewExecutionArtifact({ repositoryRoot, sourceRunId, reviewRef,
      kind: 'first-pass', submissionRef: firstRef })
    const first = verifySubmissionBounded(firstArtifact.value)
    const firstAssignmentArtifact = await readTutorHumanReviewExecutionArtifact({ repositoryRoot, sourceRunId, reviewRef,
      kind: 'assignment', submissionRef: first.assignment_ref })
    let firstAssignment
    try { firstAssignment = verifyTutorHumanReviewAssignment(firstAssignmentArtifact.value) } catch {
      throw tutorHumanReviewBlocked('REVIEW_AUTHORITY_INVALID', 'Persisted First-Pass Assignment verification failed')
    }
    const valid = path.basename(firstArtifact.artifactPath) === `${first.submission_ref}.json`
      && path.basename(firstAssignmentArtifact.artifactPath) === `${firstAssignment.assignment_ref}.json`
      && first.submission_ref === firstRef && first.phase === 'FIRST_PASS'
      && first.review_ref === reviewRef && first.reviewer_ref === authority.assignment.reviewer_ref
      && first.review_item_ref === authority.item.review_item_ref && first.source_run_id === sourceRunId
      && first.review_claim_sha256 === authority.claim.claim_sha256
      && first.source_result_sha256 === authority.claim.source_result_sha256
      && first.sample_manifest_sha256 === authority.claim.sample_manifest_sha256
      && first.packet_sha256 === authority.packet.packet_sha256
      && first.assignment_ref === firstAssignment.assignment_ref
      && first.assignment_sha256 === firstAssignment.assignment_sha256
      && firstAssignment.claim_sha256 === authority.claim.claim_sha256
      && firstAssignment.review_ref === reviewRef && firstAssignment.reviewer_ref === first.reviewer_ref
      && firstAssignment.source_run_id === sourceRunId
      && firstAssignment.source_result_sha256 === authority.claim.source_result_sha256
      && firstAssignment.sample_manifest_sha256 === authority.claim.sample_manifest_sha256
      && firstAssignment.packet_sha256 === authority.packet.packet_sha256
      && firstAssignment.phase === 'FIRST_PASS' && firstAssignment.review_item_ref === first.review_item_ref
      && new Date(first.submitted_at).getTime() < new Date(firstAssignment.expires_at).getTime()
    if (!valid) throw tutorHumanReviewBlocked('SOURCE_BINDING_MISMATCH', 'Persisted First-Pass binding is invalid')
    return first
  }

  const coordinator = {
    async projectFirstPass(args) {
      const { assignmentToken } = exactBoundaryInput(args, ['assignmentToken'], 'First-Pass projection')
      const authority = await authorityFor(assignmentToken, 'FIRST_PASS')
      const fixtures = tutorSyntheticEvalCases()
      const fixture = fixtures.find((candidate) => candidate.case_id === authority.item.synthetic_case_ref)
      const fixtureSha = digestBytes(Buffer.from(JSON.stringify(fixtures)))
      if (!fixture || fixtureSha !== authority.packet.fixture_set_sha256) throw tutorHumanReviewBlocked('SOURCE_BINDING_MISMATCH', 'Fixture binding is invalid')
      return firstPassProjection({ authority, fixture })
    },
    async submit(args) {
      const { assignmentToken, phase, reviewItemRef, clientInput } = exactBoundaryInput(args,
        ['assignmentToken', 'phase', 'reviewItemRef', 'clientInput'], 'Human Review submission')
      const authority = await authorityFor(assignmentToken, phase)
      if (reviewItemRef !== authority.assignment.review_item_ref) throw tutorHumanReviewBlocked('REVIEW_AUTHORITY_INVALID', 'Client item selection is forbidden')
      const payload = phase === 'FIRST_PASS' ? firstPassClientSchema.parse(clientInput)
        : phase === 'ADJUDICATION' ? adjudicationClientSchema.parse(clientInput) : secondPassClientSchema.parse(clientInput)
      const base = { ...authority.assignment, review_claim_sha256: authority.claim.claim_sha256,
        assignment_sha256: authority.assignment.assignment_sha256, submitted_at: authority.trusted_now,
        synthetic_note: payload.synthetic_note }
      let firstPassSha
      if (phase === 'SECOND_PASS') {
        const first = await persistedFirstPassFor(authority)
        firstPassSha = first.submission_sha256
      }
      const submission = buildTutorHumanReviewSubmissionArtifact({ ...base,
        ...(phase === 'FIRST_PASS' ? { ratings: payload.ratings } : {}),
        ...(phase === 'ADJUDICATION' ? { dimension_rating: payload.dimension_rating,
          independent_from_reviewer_refs: authority.assignment.independent_from_reviewer_refs } : {}),
        ...(phase === 'SECOND_PASS' ? { first_pass_submission_sha256: firstPassSha } : {}),
      })
      await createTutorHumanReviewExecutionArtifact({ repositoryRoot, sourceRunId, reviewRef,
        kind: phase === 'FIRST_PASS' ? 'first-pass' : phase === 'ADJUDICATION' ? 'adjudication' : 'second-pass',
        submissionRef: submission.submission_ref, value: submission })
      return Object.freeze({ submission_ref: submission.submission_ref, committed: true })
    },
    async projectSecondPass(args) {
      const { assignmentToken } = exactBoundaryInput(args, ['assignmentToken'], 'Second-Pass projection')
      const authority = await authorityFor(assignmentToken, 'SECOND_PASS')
      const first = await persistedFirstPassFor(authority)
      if (first.assignment_sha256 === authority.assignment.assignment_sha256) {
        throw tutorHumanReviewBlocked('SOURCE_BINDING_MISMATCH', 'Persisted First-Pass cannot unlock Second Pass')
      }
      const resultCase = authority.source.cases.find((item) => item.case_id === authority.item.synthetic_case_ref)
      return Object.freeze({ projection_version: TUTOR_HUMAN_REVIEW_SECOND_PASS_PROJECTION_VERSION,
        review_ref: reviewRef, review_item_ref: authority.item.review_item_ref,
        first_pass_submission_sha256: first.submission_sha256, first_pass_ratings_read_only: true,
        final_source: resultCase.final_source,
        bounded_cause_class: resultCase.bounded_cause_class, bounded_cause_code: resultCase.bounded_cause_code,
        governance_policy_version: 'tutor-cause-specific-quality-policy-v1' })
    },
  }
  Object.freeze(coordinator); trustedCoordinators.add(coordinator); return coordinator
}

export async function createTrustedTutorHumanReviewCoordinator(args) {
  return createCoordinatorWithClock(args, tutorHumanReviewServerClock())
}

export async function createTrustedTutorHumanReviewCoordinatorWithInternalClock(args, clock) {
  return createCoordinatorWithClock(args, clock)
}

export async function assertNoExistingTutorHumanReviewFinalRecord({ repositoryRoot, sourceRunId, reviewRef }) {
  const existing = await readOptionalTutorHumanReviewExecutionArtifact({ repositoryRoot, sourceRunId, reviewRef, kind: 'final-record' })
  if (existing) throw tutorHumanReviewBlocked('DUPLICATE_SUBMISSION', 'Final Review Record already exists')
  return true
}
