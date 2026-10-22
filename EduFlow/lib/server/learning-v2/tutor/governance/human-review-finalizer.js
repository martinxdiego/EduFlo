import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  TUTOR_HUMAN_REVIEW_CRITICAL_DIMENSIONS_V2,
  TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2,
  TUTOR_HUMAN_REVIEW_DIMENSIONS_V2,
  TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2,
} from './human-review-rubric-v2.js'
import {
  TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION_V2,
  tutorHumanReviewRequiredAdjudications,
} from './human-review-workflow-v2.js'
import {
  TUTOR_HUMAN_REVIEW_RECORD_DOMAIN,
  TUTOR_HUMAN_REVIEW_RECORD_VERSION,
  deepFreeze,
  tutorHumanReviewRecordSchema,
  verifyTutorHumanReviewSubmission,
} from './human-review-record-v1.js'
import { tutorHumanReviewRecordDeleteAt } from './human-review-retention.js'
import { TUTOR_HUMAN_REVIEW_PACKET_VERSION, verifyTutorHumanReviewPacket } from '../evaluation/human-review-packet.js'
import { TUTOR_HUMAN_REVIEW_SAMPLING_VERSION, verifyTutorHumanReviewSampleManifest } from '../evaluation/human-review-sampling.js'
import { domainSeparatedJcsSha256 } from '../evaluation/human-review-canonical.js'
import { verifyTutorReviewCapableResultV5 } from '../evaluation/human-review-evaluator-v7.js'
import {
  createTutorHumanReviewExecutionArtifact,
  listTutorHumanReviewExecutionArtifacts,
  readTutorHumanReviewArtifact,
  readTutorHumanReviewExecutionArtifact,
  readTutorHumanReviewSourceResultArtifact,
  loadActiveTutorHumanReviewPacketWithInternalClock,
  tutorHumanReviewBlocked,
} from '../evaluation/human-review-repository.js'
import { verifyTutorHumanReviewAssignment, verifyTutorHumanReviewClaim } from './human-review-coordinator.js'
import {
  assertTrustedTutorHumanReviewClock,
  readTrustedTutorHumanReviewNow,
  snapshotTrustedTutorHumanReviewClock,
  tutorHumanReviewServerClock,
} from './human-review-clock.js'

const shaBytes = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

function ensure(condition, reason, message) {
  if (!condition) throw tutorHumanReviewBlocked(reason, message)
}

function exactFinalizerInput(value) {
  const allowed = ['repositoryRoot', 'sourceRunId', 'reviewRef']
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !allowed.includes(key))
    || allowed.some((key) => !(key in value))) {
    throw new TypeError('Human Review finalizer input contains missing or caller-controlled fields')
  }
  return value
}

async function loadSubmissionSet({ repositoryRoot, sourceRunId, reviewRef, kind, claim, packet }) {
  const artifacts = await listTutorHumanReviewExecutionArtifacts({ repositoryRoot, sourceRunId, reviewRef, kind })
  const submissions = []
  const identities = new Set()
  for (const artifact of artifacts) {
    let submission
    try { submission = verifyTutorHumanReviewSubmission(artifact.value) } catch {
      throw tutorHumanReviewBlocked('ADJUDICATION_INTEGRITY_FAILURE', 'Submission schema or digest is invalid')
    }
    const expectedPhase = kind === 'first-pass' ? 'FIRST_PASS' : kind === 'adjudication' ? 'ADJUDICATION' : 'SECOND_PASS'
    ensure(submission.phase === expectedPhase && submission.review_ref === reviewRef
      && submission.source_run_id === sourceRunId && submission.review_claim_sha256 === claim.claim_sha256
      && submission.source_result_sha256 === claim.source_result_sha256
      && submission.sample_manifest_sha256 === claim.sample_manifest_sha256
      && submission.packet_sha256 === packet.packet_sha256
      && path.basename(artifact.artifactPath) === `${submission.submission_ref}.json`
      && claim.review_item_refs.includes(submission.review_item_ref), 'SOURCE_BINDING_MISMATCH', 'Submission binding is invalid')
    ensure(!identities.has(submission.submission_ref), 'DUPLICATE_SUBMISSION', 'Submission identity is duplicated')
    identities.add(submission.submission_ref)
    const assignmentArtifact = await readTutorHumanReviewExecutionArtifact({ repositoryRoot, sourceRunId, reviewRef,
      kind: 'assignment', submissionRef: submission.assignment_ref })
    let assignment
    try { assignment = verifyTutorHumanReviewAssignment(assignmentArtifact.value) } catch {
      throw tutorHumanReviewBlocked('REVIEW_AUTHORITY_INVALID', 'Submission Assignment is invalid')
    }
    ensure(path.basename(assignmentArtifact.artifactPath) === `${assignment.assignment_ref}.json`
      && assignment.assignment_ref === submission.assignment_ref
      && assignment.assignment_sha256 === submission.assignment_sha256 && assignment.claim_sha256 === claim.claim_sha256
      && assignment.review_ref === reviewRef && assignment.source_run_id === sourceRunId
      && assignment.source_result_sha256 === claim.source_result_sha256
      && assignment.sample_manifest_sha256 === claim.sample_manifest_sha256
      && assignment.packet_sha256 === packet.packet_sha256
      && assignment.phase === submission.phase && assignment.reviewer_ref === submission.reviewer_ref
      && assignment.review_item_ref === submission.review_item_ref
      && (submission.phase !== 'ADJUDICATION'
        || JSON.stringify(assignment.independent_from_reviewer_refs) === JSON.stringify(submission.independent_from_reviewer_refs))
      && new Date(submission.submitted_at).getTime() < new Date(assignment.expires_at).getTime(),
    'REVIEW_AUTHORITY_INVALID', 'Submission Assignment binding is invalid')
    submissions.push(submission)
  }
  return submissions
}

function resolvedItemRatings(firstPair, adjudications, reviewItemRef) {
  const adjudicated = new Map(adjudications.filter((item) => item.review_item_ref === reviewItemRef)
    .map((item) => [item.dimension_rating.dimension, item.dimension_rating]))
  return TUTOR_HUMAN_REVIEW_DIMENSIONS_V2.map((dimension, index) => {
    const left = firstPair[0].ratings[index]
    const right = firstPair[1].ratings[index]
    const adjudication = adjudicated.get(dimension)
    if (adjudication) return adjudication
    if (left.rating === right.rating) return Object.freeze({ ...left,
      critical_findings: Object.freeze([...new Set([...left.critical_findings, ...right.critical_findings])]) })
    // Noncritical PASS/CONCERN or CONCERN/FAIL differences do not trigger the
    // frozen adjudication rule; retain the more cautious bounded finding.
    const order = { PASS: 0, NOT_APPLICABLE: 0, CONCERN: 1, FAIL: 2 }
    return order[left.rating] >= order[right.rating] ? left : right
  })
}

async function finalizeWithClock(args, clock) {
  const { repositoryRoot, sourceRunId, reviewRef } = exactFinalizerInput(args)
  const initialClock = snapshotTrustedTutorHumanReviewClock(assertTrustedTutorHumanReviewClock(clock))
  const [sourceArtifact, sampleArtifact, packet, claimArtifact] = await Promise.all([
    readTutorHumanReviewSourceResultArtifact({ repositoryRoot, sourceRunId }),
    readTutorHumanReviewArtifact({ repositoryRoot, sourceRunId, artifactName: 'sample-manifest.json' }),
    loadActiveTutorHumanReviewPacketWithInternalClock({ repositoryRoot, sourceRunId, reviewRef }, initialClock),
    readTutorHumanReviewExecutionArtifact({ repositoryRoot, sourceRunId, reviewRef, kind: 'claim' }),
  ])
  const source = verifyTutorReviewCapableResultV5(sourceArtifact.value)
  const sample = verifyTutorHumanReviewSampleManifest(sampleArtifact.value)
  verifyTutorHumanReviewPacket(packet)
  const claim = verifyTutorHumanReviewClaim(claimArtifact.value)
  const sourceSha = shaBytes(sourceArtifact.bytes)
  ensure(source.source_run_id === sourceRunId && sourceSha === claim.source_result_sha256
    && sample.source_result_sha256 === sourceSha && packet.source_result_sha256 === sourceSha
    && sample.sample_manifest_sha256 === claim.sample_manifest_sha256
    && packet.sample_manifest_sha256 === claim.sample_manifest_sha256
    && packet.packet_sha256 === claim.packet_sha256 && claim.review_ref === reviewRef
    && JSON.stringify(packet.items.map((item) => item.review_item_ref)) === JSON.stringify(claim.review_item_refs),
  'SOURCE_BINDING_MISMATCH', 'Final Record source chain is invalid')

  const [firstPass, adjudications, secondPass] = await Promise.all([
    loadSubmissionSet({ repositoryRoot, sourceRunId, reviewRef, kind: 'first-pass', claim, packet }),
    loadSubmissionSet({ repositoryRoot, sourceRunId, reviewRef, kind: 'adjudication', claim, packet }),
    loadSubmissionSet({ repositoryRoot, sourceRunId, reviewRef, kind: 'second-pass', claim, packet }),
  ])
  const firstByItem = new Map(claim.review_item_refs.map((itemRef) => [itemRef, []]))
  for (const submission of firstPass) firstByItem.get(submission.review_item_ref)?.push(submission)
  for (const pair of firstByItem.values()) ensure(pair.length === 2 && pair[0].reviewer_ref !== pair[1].reviewer_ref,
    'REQUIRED_SUBMISSION_MISSING_AT_DEADLINE', 'Exactly two independent First-Pass submissions are required per item')

  const required = []
  for (const [itemRef, pair] of firstByItem) for (const dimension of tutorHumanReviewRequiredAdjudications(pair[0], pair[1])) {
    required.push(`${itemRef}\0${dimension}`)
  }
  const adjudicatedKeys = new Set()
  for (const adjudication of adjudications) {
    const key = `${adjudication.review_item_ref}\0${adjudication.dimension_rating.dimension}`
    const reviewers = firstByItem.get(adjudication.review_item_ref).map((item) => item.reviewer_ref)
    ensure(required.includes(key) && !adjudicatedKeys.has(key)
      && adjudication.independent_from_reviewer_refs.every((reviewer) => reviewers.includes(reviewer))
      && !reviewers.includes(adjudication.reviewer_ref), 'ADJUDICATION_INTEGRITY_FAILURE', 'Adjudication is absent, duplicate or not independent')
    adjudicatedKeys.add(key)
  }
  ensure(adjudicatedKeys.size === required.length, 'ADJUDICATION_INTEGRITY_FAILURE', 'A required adjudication is missing')

  const expectedSecond = new Set(firstPass.map((item) => `${item.review_item_ref}\0${item.reviewer_ref}`))
  const completedSecond = new Set()
  for (const submission of secondPass) {
    const key = `${submission.review_item_ref}\0${submission.reviewer_ref}`
    const first = firstPass.find((item) => item.review_item_ref === submission.review_item_ref && item.reviewer_ref === submission.reviewer_ref)
    ensure(expectedSecond.has(key) && !completedSecond.has(key) && first
      && submission.first_pass_submission_sha256 === first.submission_sha256,
    'REQUIRED_SUBMISSION_MISSING_AT_DEADLINE', 'Second-Pass completion is missing or not bound to First-Pass')
    completedSecond.add(key)
  }
  ensure(completedSecond.size === expectedSecond.size, 'REQUIRED_SUBMISSION_MISSING_AT_DEADLINE', 'Every First-Pass reviewer must complete Second Pass')

  const critical = []
  let findingCount = 0
  for (const [itemRef, pair] of firstByItem) {
    for (const rating of resolvedItemRatings(pair, adjudications, itemRef)) {
      if (rating.rating !== 'PASS' && rating.rating !== 'NOT_APPLICABLE') findingCount += 1
      if (TUTOR_HUMAN_REVIEW_CRITICAL_DIMENSIONS_V2.includes(rating.dimension) && rating.rating === 'FAIL') {
        for (const finding_code of rating.critical_findings) {
          ensure(TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2[rating.dimension].includes(finding_code),
            'ADJUDICATION_INTEGRITY_FAILURE', 'Critical Finding dimension is invalid')
          critical.push({ review_item_ref: itemRef, dimension: rating.dimension, finding_code })
        }
      }
    }
  }
  const outcome = critical.length ? 'HUMAN_QUALITY_CRITICAL_FAIL_CONFIRMED'
    : findingCount ? 'HUMAN_QUALITY_COMPLETE_WITH_FINDINGS' : 'HUMAN_QUALITY_COMPLETE_NO_FINDINGS'
  const commitClock = snapshotTrustedTutorHumanReviewClock(clock)
  const activePacketAtCommit = await loadActiveTutorHumanReviewPacketWithInternalClock(
    { repositoryRoot, sourceRunId, reviewRef }, commitClock)
  ensure(activePacketAtCommit.packet_sha256 === packet.packet_sha256,
    'SOURCE_BINDING_MISMATCH', 'Review Packet changed before Final Record commit')
  const terminalAt = readTrustedTutorHumanReviewNow(commitClock).toISOString()
  const unsigned = {
    record_contract_version: TUTOR_HUMAN_REVIEW_RECORD_VERSION,
    workflow_contract_version: TUTOR_HUMAN_REVIEW_WORKFLOW_VERSION_V2,
    rubric_version: TUTOR_HUMAN_REVIEW_RUBRIC_VERSION_V2,
    sampling_contract_version: TUTOR_HUMAN_REVIEW_SAMPLING_VERSION,
    packet_contract_version: TUTOR_HUMAN_REVIEW_PACKET_VERSION,
    review_claim_sha256: claim.claim_sha256, source_run_id: sourceRunId, source_result_sha256: sourceSha,
    sample_manifest_sha256: sample.sample_manifest_sha256, packet_sha256: packet.packet_sha256,
    review_ref: reviewRef, review_ref_created_at: claim.review_ref_created_at, terminal_at: terminalAt,
    record_expires_at: tutorHumanReviewRecordDeleteAt(claim.review_ref_created_at), synthetic_data_only: true,
    lifecycle_state: 'COMPLETE', outcome, blocked_reason: null, selected_item_count: claim.review_item_refs.length,
    expected_first_pass_submissions: claim.review_item_refs.length * 2,
    completed_first_pass_submissions: firstPass.length, open_first_pass_submissions: 0,
    required_adjudications: required.length, completed_adjudications: adjudications.length, open_adjudications: 0,
    expected_second_pass_submissions: claim.review_item_refs.length * 2,
    completed_second_pass_submissions: secondPass.length, open_second_pass_submissions: 0,
    confirmed_critical_findings: critical, finding_count: findingCount, approval_effect: 'NONE',
    runtime_approval_effect: 'NONE', production_approval_effect: 'NONE', learning_authority: 'NONE',
    evidence_effect: 'NONE', learning_truth_mutations: 0,
  }
  const record = deepFreeze(tutorHumanReviewRecordSchema.parse({ ...unsigned,
    record_sha256: domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_RECORD_DOMAIN, unsigned) }))
  await createTutorHumanReviewExecutionArtifact({ repositoryRoot, sourceRunId, reviewRef, kind: 'final-record', value: record })
  return record
}

export async function finalizeTutorHumanReviewFromRepository(args) {
  return finalizeWithClock(args, tutorHumanReviewServerClock())
}

export async function finalizeTutorHumanReviewFromRepositoryWithInternalClock(args, clock) {
  return finalizeWithClock(args, clock)
}
