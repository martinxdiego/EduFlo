import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { tutorSyntheticEvalCases } from '../lib/server/learning-v2/tutor/eval-fixtures.js'
import { localTutorFallback } from '../lib/server/learning-v2/tutor/fallback-registry.js'
import { TUTOR_HUMAN_REVIEW_DIMENSIONS_V2 } from '../lib/server/learning-v2/tutor/governance/human-review-rubric-v2.js'
import {
  TUTOR_HUMAN_REVIEW_RECORD_DOMAIN,
  buildTutorHumanReviewRecord,
  buildTutorHumanReviewSubmissionArtifact,
  createTutorHumanReviewSubmission,
  verifyTutorHumanReviewRecord,
} from '../lib/server/learning-v2/tutor/governance/human-review-record-v1.js'
import {
  buildTutorHumanReviewAssignmentArtifact,
  buildTutorHumanReviewClaimArtifact,
  createTrustedTutorHumanReviewCoordinator,
  verifyTutorHumanReviewOperationsReadiness,
} from '../lib/server/learning-v2/tutor/governance/human-review-coordinator.js'
import { createTutorHumanReviewLocalRunner } from '../lib/server/learning-v2/tutor/governance/human-review-local-runner.js'
import { finalizeTutorHumanReviewFromRepository } from '../lib/server/learning-v2/tutor/governance/human-review-finalizer.js'
import { jcsCanonicalize, jcsUtf8Bytes, domainSeparatedJcsSha256 } from '../lib/server/learning-v2/tutor/evaluation/human-review-canonical.js'
import {
  TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST,
  tutorReviewCapableEvaluationManifestSchema,
} from '../lib/server/learning-v2/tutor/evaluation/human-review-evaluation-contract.js'
import {
  projectTutorReviewCaptureToRepository,
  runTutorReviewCapableProviderFreeCapture,
  tutorReviewCapableResultV5Schema,
  verifyTutorReviewCapableResultV5,
} from '../lib/server/learning-v2/tutor/evaluation/human-review-evaluator-v7.js'
import {
  createTutorHumanReviewArtifact,
  createTutorHumanReviewExecutionArtifact,
  createTutorHumanReviewRepositoryTestSeam,
  createTutorHumanReviewSourceResultArtifact,
  loadActiveTutorHumanReviewPacket,
  readTutorHumanReviewArtifact,
  readTutorHumanReviewExecutionArtifact,
} from '../lib/server/learning-v2/tutor/evaluation/human-review-repository.js'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const fixtures = tutorSyntheticEvalCases()
const timestamp = '2026-09-09T10:00:00.000Z'
const expiresAt = '2026-12-01T00:00:00.000Z'
const token = (value) => `opaque-token-${String(value).padStart(40, '0')}`

function allPassRatings() {
  return TUTOR_HUMAN_REVIEW_DIMENSIONS_V2.map((dimension) => ({
    dimension, rating: 'PASS', not_applicable_reason: null, critical_findings: [],
  }))
}

function operationsAttestation() {
  const proof = (value) => ({ status: 'OPERATOR_ATTESTED', evidence_ref: value, attested_at: timestamp })
  return {
    attestation_contract_version: 'tutor-human-review-operations-attestation-v1',
    repository_private: proof('private-repository-attestation'),
    authoritative_branch_protected: proof('protected-branch-attestation'),
    designated_single_coordinator: proof('single-coordinator-attestation'),
    reviewer_direct_repository_access_absent: proof('reviewer-access-attestation'),
    external_properties_technically_proven: false,
  }
}

function providerPass(fixture) { return { kind: 'PROVIDER_CANDIDATE', candidate: localTutorFallback(fixture.level) } }

async function temporaryRoot() { return fs.mkdtemp(path.join(tmpdir(), 'eduflow-hr-tv-')) }

async function materializeReview({ eventForFixture = providerPass } = {}) {
  const root = await temporaryRoot()
  const sourceRunId = 'verification-source-run'
  const reviewRef = 'verification-review'
  const handle = runTutorReviewCapableProviderFreeCapture({ sourceRunId, fixtures, providerEventForFixture: eventForFixture })
  await createTutorHumanReviewSourceResultArtifact({ repositoryRoot: root, sourceRunId, value: handle.result })
  const projected = await projectTutorReviewCaptureToRepository({ repositoryRoot: root, handle, packetCreatedAt: timestamp })
  const packet = (await readTutorHumanReviewArtifact({ repositoryRoot: root, sourceRunId, artifactName: 'review-packet.json' })).value
  const claim = buildTutorHumanReviewClaimArtifact({
    review_ref: reviewRef, coordinator_ref: 'coordinator-one', source_run_id: sourceRunId,
    source_result_sha256: handle.result ? (await readTutorHumanReviewArtifact({ repositoryRoot: root, sourceRunId, artifactName: 'sample-manifest.json' })).value.source_result_sha256 : null,
    sample_manifest_sha256: projected.sample_manifest_sha256, packet_sha256: projected.packet_sha256,
    review_item_refs: packet.items.map((item) => item.review_item_ref), review_ref_created_at: timestamp,
    operations_attestation: operationsAttestation(),
  })
  await createTutorHumanReviewExecutionArtifact({ repositoryRoot: root, sourceRunId, reviewRef, kind: 'claim', value: claim })
  return { root, sourceRunId, reviewRef, handle, packet, claim }
}

async function persistAssignment(context, { tokenValue, reviewerRef, phase, itemRef, independent = [] }) {
  const assignment = buildTutorHumanReviewAssignmentArtifact({ claim: context.claim,
    opaqueAssignmentToken: tokenValue, reviewerRef, phase, reviewItemRef: itemRef,
    expiresAt, independentFromReviewerRefs: independent })
  await createTutorHumanReviewExecutionArtifact({ repositoryRoot: context.root, sourceRunId: context.sourceRunId,
    reviewRef: context.reviewRef, kind: 'assignment', submissionRef: assignment.assignment_ref, value: assignment })
  return assignment
}

test('HR-TV-01 v9 manifest rejects every unknown authority and raw-content canary', () => {
  const canaries = ['approved_for_runtime', 'runtime_approval', 'human_approval', 'production_approval',
    'raw_prompt', 'raw_provider_response', 'raw_provider_error', 'rejected_provider_candidate', 'learner_answer',
    'hidden_answer', 'tenant_id', 'student_id', 'teacher_id', 'mastery', 'confidence', 'evidence', 'policy_override']
  assert.doesNotThrow(() => tutorReviewCapableEvaluationManifestSchema.parse(TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST))
  for (const field of canaries) assert.equal(tutorReviewCapableEvaluationManifestSchema.safeParse({
    ...TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST, [field]: field,
  }).success, false, field)
})

test('HR-TV-02 provider PASS capture is executable and Result v5 retains no final text', () => {
  const handle = runTutorReviewCapableProviderFreeCapture({ sourceRunId: 'provider-pass-source', fixtures, providerEventForFixture: providerPass })
  assert.equal(verifyTutorReviewCapableResultV5(handle.result).system_safety_pass, true)
  const serialized = JSON.stringify(handle.result)
  assert.doesNotMatch(serialized, /"learner_message"\s*:/u)
  assert.equal(serialized.includes(localTutorFallback(1).learner_message), false)
  const contradictory = structuredClone(handle.result)
  contradictory.cases[0].final_gate_results[0].state = 'FAIL'
  assert.throws(() => tutorReviewCapableResultV5Schema.parse(contradictory))
})

test('HR-TV-02 provider rejection discards candidate and uses canonical local fallback', () => {
  const marker = 'REJECTED-CANDIDATE-MUST-DISAPPEAR'
  const handle = runTutorReviewCapableProviderFreeCapture({ sourceRunId: 'provider-reject-source', fixtures,
    providerEventForFixture: (fixture) => fixture.case_id === fixtures[0].case_id
      ? { kind: 'PROVIDER_CANDIDATE', candidate: { ...localTutorFallback(fixture.level), learner_message: `${fixture.correctAnswer} ${marker}` } }
      : providerPass(fixture) })
  assert.equal(handle.result.cases[0].final_source, 'LOCAL_FALLBACK_ACCEPTED')
  assert.equal(JSON.stringify(handle.result).includes(marker), false)
})

test('HR-TV-02 provider technical failure degrades locally without raw error retention', () => {
  const handle = runTutorReviewCapableProviderFreeCapture({ sourceRunId: 'provider-failure-source', fixtures,
    providerEventForFixture: (fixture) => fixture.case_id === fixtures[0].case_id
      ? { kind: 'PROVIDER_FAILURE', code: 'PROVIDER_TIMEOUT', raw_error: 'secret' } : providerPass(fixture) })
  assert.equal(handle.result.cases[0].final_source, 'LOCAL_FALLBACK_ACCEPTED')
  assert.equal(JSON.stringify(handle.result).includes('secret'), false)
})

test('HR-TV-02 sampling retains only selected final messages and drops every non-selected message', async () => {
  const context = await materializeReview()
  try {
    assert.ok(context.packet.items.length < fixtures.length)
    assert.equal(new Set(context.packet.items.map((item) => item.synthetic_case_ref)).size, context.packet.items.length)
    assert.doesNotMatch(JSON.stringify(context.handle.result), /"learner_message"\s*:/u)
    const selected = new Set(context.packet.items.map((item) => item.synthetic_case_ref))
    assert.ok(fixtures.some((fixture) => !selected.has(fixture.case_id)))
  } finally { await fs.rm(context.root, { recursive: true, force: true }) }
})

test('HR-TV-02 final fallback failure blocks packet projection', async () => {
  const root = await temporaryRoot()
  try {
    const handle = runTutorReviewCapableProviderFreeCapture({ sourceRunId: 'fallback-fail-source', fixtures,
      providerEventForFixture: () => ({ kind: 'PROVIDER_FAILURE', code: 'PROVIDER_TIMEOUT' }), fallbackFactory: () => ({}) })
    assert.equal(handle.result.final_outcome_fail_count, 120)
    await createTutorHumanReviewSourceResultArtifact({ repositoryRoot: root, sourceRunId: 'fallback-fail-source', value: handle.result })
    await assert.rejects(() => projectTutorReviewCaptureToRepository({ repositoryRoot: root, handle, packetCreatedAt: timestamp }))
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('HR-TV-03 raw and duck-typed Coordinator objects cannot instantiate runner', () => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  try {
    assert.throws(() => createTutorHumanReviewLocalRunner({ coordinator: { resolveAssignment() {}, createSubmission() {} } }))
    assert.throws(() => createTutorHumanReviewSubmission({ grant: { authority_source: 'TRUSTED_REVIEW_COORDINATOR' } }),
      (error) => error.code === 'REVIEW_AUTHORITY_INVALID')
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous }
})

test('HR-TV-03 unknown opaque assignment token is repository-verified and rejected', async () => {
  const context = await materializeReview()
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  try {
    const coordinator = await createTrustedTutorHumanReviewCoordinator({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef })
    const runner = createTutorHumanReviewLocalRunner({ coordinator })
    await assert.rejects(() => runner.projectFirstPass({ assignmentToken: token('unknown') }),
      (error) => error.code === 'BLOCKED')
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous
    await fs.rm(context.root, { recursive: true, force: true })
  }
})

test('HR-TV-03/05 trusted token yields blind First Pass and persisted-only Second Pass', async () => {
  const context = await materializeReview()
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  try {
    const itemRef = context.packet.items[0].review_item_ref
    const firstToken = token('first-one')
    await persistAssignment(context, { tokenValue: firstToken, reviewerRef: 'reviewer-one', phase: 'FIRST_PASS', itemRef })
    const coordinator = await createTrustedTutorHumanReviewCoordinator({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef })
    const runner = createTutorHumanReviewLocalRunner({ coordinator })
    const projection = await runner.projectFirstPass({ assignmentToken: firstToken })
    assert.equal(projection.review_ref, context.reviewRef)
    assert.equal(projection.review_item_ref, itemRef)
    const serialized = JSON.stringify(projection)
    for (const field of ['synthetic_case_ref', 'provider_id', 'model_id', 'final_source', 'repository_path']) assert.equal(serialized.includes(field), false)
    const secondToken = token('second-one')
    await persistAssignment(context, { tokenValue: secondToken, reviewerRef: 'reviewer-one', phase: 'SECOND_PASS', itemRef })
    await assert.rejects(() => runner.projectSecondPass({ assignmentToken: secondToken }))
    await runner.submitFirstPass({ assignmentToken: firstToken, reviewItemRef: itemRef, ratings: allPassRatings() })
    const second = await runner.projectSecondPass({ assignmentToken: secondToken })
    assert.equal(second.first_pass_ratings_read_only, true)
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous
    await fs.rm(context.root, { recursive: true, force: true })
  }
})

test('HR-TV-05 Second Pass rejects a persisted First-Pass artifact with wrong digest', async () => {
  const context = await materializeReview()
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  try {
    const itemRef = context.packet.items[0].review_item_ref
    const firstToken = token('digest-first')
    await persistAssignment(context, { tokenValue: firstToken, reviewerRef: 'reviewer-one', phase: 'FIRST_PASS', itemRef })
    const secondToken = token('digest-second')
    await persistAssignment(context, { tokenValue: secondToken, reviewerRef: 'reviewer-one', phase: 'SECOND_PASS', itemRef })
    const coordinator = await createTrustedTutorHumanReviewCoordinator({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef })
    const runner = createTutorHumanReviewLocalRunner({ coordinator })
    const committed = await runner.submitFirstPass({ assignmentToken: firstToken, reviewItemRef: itemRef,
      ratings: allPassRatings() })
    const artifact = await readTutorHumanReviewExecutionArtifact({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef, kind: 'first-pass', submissionRef: committed.submission_ref })
    await fs.writeFile(artifact.artifactPath, JSON.stringify({ ...artifact.value,
      submission_sha256: `sha256:${'0'.repeat(64)}` }))
    await assert.rejects(() => runner.projectSecondPass({ assignmentToken: secondToken }),
      (error) => error.code === 'BLOCKED')
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous
    await fs.rm(context.root, { recursive: true, force: true })
  }
})

test('Coordinator submission race has one winner and an Assignment cannot cross review_ref', async () => {
  const context = await materializeReview()
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  try {
    const itemRef = context.packet.items[0].review_item_ref
    const assignmentToken = token('race-submission')
    await persistAssignment(context, { tokenValue: assignmentToken, reviewerRef: 'reviewer-one', phase: 'FIRST_PASS', itemRef })
    const coordinator = await createTrustedTutorHumanReviewCoordinator({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef })
    const runner = createTutorHumanReviewLocalRunner({ coordinator })
    const submissions = await Promise.allSettled([1, 2].map(() => runner.submitFirstPass({
      assignmentToken, reviewItemRef: itemRef, ratings: allPassRatings(),
    })))
    assert.equal(submissions.filter((item) => item.status === 'fulfilled').length, 1)
    assert.equal(submissions.find((item) => item.status === 'rejected').reason.code, 'BLOCKED')

    const otherReviewRef = 'verification-review-two'
    const otherClaim = buildTutorHumanReviewClaimArtifact({ ...context.claim, review_ref: otherReviewRef })
    await createTutorHumanReviewExecutionArtifact({ repositoryRoot: context.root, sourceRunId: context.sourceRunId,
      reviewRef: otherReviewRef, kind: 'claim', value: otherClaim })
    const otherCoordinator = await createTrustedTutorHumanReviewCoordinator({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: otherReviewRef })
    const otherRunner = createTutorHumanReviewLocalRunner({ coordinator: otherCoordinator })
    await assert.rejects(() => otherRunner.projectFirstPass({ assignmentToken }),
      (error) => error.code === 'BLOCKED')
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous
    await fs.rm(context.root, { recursive: true, force: true })
  }
})

test('HR-TV-04 caller cannot build COMPLETE and malformed claim cannot finalize', async () => {
  assert.throws(() => buildTutorHumanReviewRecord({ lifecycle_state: 'COMPLETE' }),
    (error) => error.code === 'ARTIFACT_DERIVATION_REQUIRED')
  const root = await temporaryRoot()
  try {
    await createTutorHumanReviewExecutionArtifact({ repositoryRoot: root, sourceRunId: 'source-run', reviewRef: 'review-one', kind: 'claim', value: {} })
    await assert.rejects(() => finalizeTutorHumanReviewFromRepository({ repositoryRoot: root,
      sourceRunId: 'source-run', reviewRef: 'review-one' }), (error) => error.code === 'BLOCKED')
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('HR-TV-04/K finalizer rejects a missing Claim and a submission stored under the wrong immutable identity', async () => {
  const missingClaim = await materializeReview()
  try {
    await fs.rm(path.join(missingClaim.root, 'docs', 'evaluation-results', 'human-review', missingClaim.sourceRunId,
      'reviews', missingClaim.reviewRef, 'claim.json'))
    await assert.rejects(() => finalizeTutorHumanReviewFromRepository({ repositoryRoot: missingClaim.root,
      sourceRunId: missingClaim.sourceRunId, reviewRef: missingClaim.reviewRef }),
    (error) => error.code === 'BLOCKED')
  } finally { await fs.rm(missingClaim.root, { recursive: true, force: true }) }

  const wrongIdentity = await materializeReview()
  try {
    const itemRef = wrongIdentity.packet.items[0].review_item_ref
    const assignment = await persistAssignment(wrongIdentity, { tokenValue: token('wrong-file-identity'),
      reviewerRef: 'reviewer-one', phase: 'FIRST_PASS', itemRef })
    const submission = buildTutorHumanReviewSubmissionArtifact({ ...assignment,
      review_claim_sha256: wrongIdentity.claim.claim_sha256, submitted_at: timestamp,
      ratings: allPassRatings(), synthetic_note: null })
    const wrongSubmissionRef = `hrs-${'f'.repeat(64)}`
    assert.notEqual(wrongSubmissionRef, submission.submission_ref)
    await createTutorHumanReviewExecutionArtifact({ repositoryRoot: wrongIdentity.root,
      sourceRunId: wrongIdentity.sourceRunId, reviewRef: wrongIdentity.reviewRef,
      kind: 'first-pass', submissionRef: wrongSubmissionRef, value: submission })
    await assert.rejects(() => finalizeTutorHumanReviewFromRepository({ repositoryRoot: wrongIdentity.root,
      sourceRunId: wrongIdentity.sourceRunId, reviewRef: wrongIdentity.reviewRef }),
    (error) => error.reasonCode === 'SOURCE_BINDING_MISMATCH')
  } finally { await fs.rm(wrongIdentity.root, { recursive: true, force: true }) }
})

test('HR-TV-04 artifact-derived finalizer rejects missing submissions', async () => {
  const context = await materializeReview()
  try {
    await assert.rejects(() => finalizeTutorHumanReviewFromRepository({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef }),
    (error) => error.code === 'BLOCKED')
  } finally { await fs.rm(context.root, { recursive: true, force: true }) }
})

test('HR-TV-04 final Record is derived from all immutable artifacts and contradictions fail schema', async () => {
  const context = await materializeReview()
  try {
    let ordinal = 0
    for (const item of context.packet.items) {
      for (const reviewerRef of ['reviewer-one', 'reviewer-two']) {
        const firstToken = token(`f${ordinal}`)
        const firstAssignment = await persistAssignment(context, { tokenValue: firstToken, reviewerRef, phase: 'FIRST_PASS', itemRef: item.review_item_ref })
        const ratings = allPassRatings()
        if (ordinal === 0) ratings[3] = { dimension: 'COGNITIVE_WORK_PRESERVATION', rating: 'FAIL',
          not_applicable_reason: null, critical_findings: ['HR_SUBSTANTIVE_COGNITIVE_WORK_SUBSTITUTION'] }
        const first = buildTutorHumanReviewSubmissionArtifact({ ...firstAssignment, review_claim_sha256: context.claim.claim_sha256,
          submitted_at: timestamp, ratings, synthetic_note: null })
        await createTutorHumanReviewExecutionArtifact({ repositoryRoot: context.root, sourceRunId: context.sourceRunId,
          reviewRef: context.reviewRef, kind: 'first-pass', submissionRef: first.submission_ref, value: first })
        const secondToken = token(`s${ordinal}`)
        const secondAssignment = await persistAssignment(context, { tokenValue: secondToken, reviewerRef, phase: 'SECOND_PASS', itemRef: item.review_item_ref })
        const second = buildTutorHumanReviewSubmissionArtifact({ ...secondAssignment, review_claim_sha256: context.claim.claim_sha256,
          submitted_at: timestamp, first_pass_submission_sha256: first.submission_sha256, synthetic_note: null })
        await createTutorHumanReviewExecutionArtifact({ repositoryRoot: context.root, sourceRunId: context.sourceRunId,
          reviewRef: context.reviewRef, kind: 'second-pass', submissionRef: second.submission_ref, value: second })
        ordinal += 1
      }
    }
    await assert.rejects(() => finalizeTutorHumanReviewFromRepository({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef }),
    (error) => error.reasonCode === 'ADJUDICATION_INTEGRITY_FAILURE')
    const adjudicationAssignment = await persistAssignment(context, { tokenValue: token('adjudication'),
      reviewerRef: 'reviewer-three', phase: 'ADJUDICATION', itemRef: context.packet.items[0].review_item_ref,
      independent: ['reviewer-one', 'reviewer-two'] })
    const adjudication = buildTutorHumanReviewSubmissionArtifact({ ...adjudicationAssignment,
      review_claim_sha256: context.claim.claim_sha256, submitted_at: timestamp,
      dimension_rating: { dimension: 'COGNITIVE_WORK_PRESERVATION', rating: 'PASS',
        not_applicable_reason: null, critical_findings: [] }, synthetic_note: null })
    await createTutorHumanReviewExecutionArtifact({ repositoryRoot: context.root, sourceRunId: context.sourceRunId,
      reviewRef: context.reviewRef, kind: 'adjudication', submissionRef: adjudication.submission_ref, value: adjudication })
    const record = await finalizeTutorHumanReviewFromRepository({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef })
    assert.equal(record.lifecycle_state, 'COMPLETE')
    assert.equal(record.outcome, 'HUMAN_QUALITY_COMPLETE_NO_FINDINGS')
    assert.equal(record.completed_first_pass_submissions, record.expected_first_pass_submissions)
    const { record_sha256: _digest, ...contradictoryUnsigned } = { ...record,
      outcome: 'HUMAN_QUALITY_COMPLETE_NO_FINDINGS', finding_count: 1,
      confirmed_critical_findings: [{ review_item_ref: context.packet.items[0].review_item_ref,
        dimension: 'AUTHORITY_BOUNDARY', finding_code: 'HR_TUTOR_POLICY_AUTHORITY' }] }
    assert.throws(() => verifyTutorHumanReviewRecord({ ...contradictoryUnsigned,
      record_sha256: domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_RECORD_DOMAIN, contradictoryUnsigned) }))
    assert.throws(() => tutorReviewCapableResultV5Schema.parse({ ...context.handle.result, approved_for_runtime: true }))
    assert.notEqual(domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_RECORD_DOMAIN, { forged: true }), record.record_sha256)
  } finally { await fs.rm(context.root, { recursive: true, force: true }) }
})

test('HR-TV-06 read rejects a source-run Junction that escapes the fixed root', async () => {
  const context = await materializeReview()
  const outside = await temporaryRoot()
  try {
    const runPath = path.join(context.root, 'docs', 'evaluation-results', 'human-review', context.sourceRunId)
    const moved = path.join(outside, 'moved-run')
    await fs.rename(runPath, moved)
    await fs.symlink(moved, runPath, 'junction')
    await assert.rejects(() => readTutorHumanReviewArtifact({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, artifactName: 'review-packet.json' }), (error) => error.code === 'BLOCKED')
  } finally { await fs.rm(context.root, { recursive: true, force: true }); await fs.rm(outside, { recursive: true, force: true }) }
})

test('HR-TV-06 rejects Junctions at reviews/review_ref and a symlink file target', async () => {
  for (const targetKind of ['reviews', 'review-ref', 'file']) {
    const context = await materializeReview()
    const outside = await temporaryRoot()
    try {
      const runPath = path.join(context.root, 'docs', 'evaluation-results', 'human-review', context.sourceRunId)
      if (targetKind === 'reviews') {
        const target = path.join(runPath, 'reviews'); const moved = path.join(outside, 'reviews')
        await fs.rename(target, moved); await fs.symlink(moved, target, 'junction')
        await assert.rejects(() => readTutorHumanReviewExecutionArtifact({ repositoryRoot: context.root,
          sourceRunId: context.sourceRunId, reviewRef: context.reviewRef, kind: 'claim' }), (error) => error.code === 'BLOCKED')
      } else if (targetKind === 'review-ref') {
        const target = path.join(runPath, 'reviews', context.reviewRef); const moved = path.join(outside, context.reviewRef)
        await fs.rename(target, moved); await fs.symlink(moved, target, 'junction')
        await assert.rejects(() => readTutorHumanReviewExecutionArtifact({ repositoryRoot: context.root,
          sourceRunId: context.sourceRunId, reviewRef: context.reviewRef, kind: 'claim' }), (error) => error.code === 'BLOCKED')
      } else {
        const target = path.join(runPath, 'review-packet.json')
        const seam = createTutorHumanReviewRepositoryTestSeam({ lstat: async (candidate) => candidate === target
          ? { isSymbolicLink: () => true, isDirectory: () => false, isFile: () => false }
          : fs.lstat(candidate) })
        await assert.rejects(() => seam.readArtifact({ repositoryRoot: context.root,
          sourceRunId: context.sourceRunId, artifactName: 'review-packet.json' }), (error) => error.code === 'BLOCKED')
      }
    } finally { await fs.rm(context.root, { recursive: true, force: true }); await fs.rm(outside, { recursive: true, force: true }) }
  }
})

test('HR-TV-06 malformed paths and arbitrary artifact names fail closed', async () => {
  const root = await temporaryRoot()
  try {
    for (const sourceRunId of ['../escape', 'nested/path', 'nested\\path', 'réview', path.resolve(root)]) {
      await assert.rejects(() => readTutorHumanReviewArtifact({ repositoryRoot: root, sourceRunId, artifactName: 'review-packet.json' }))
    }
    await assert.rejects(() => readTutorHumanReviewArtifact({ repositoryRoot: root, sourceRunId: 'safe-run', artifactName: '../claim.json' }))
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('HR-TV filesystem races have exactly one winner and bounded loser', async () => {
  const root = await temporaryRoot()
  try {
    const attempts = await Promise.allSettled([1, 2].map(() => createTutorHumanReviewArtifact({ repositoryRoot: root,
      sourceRunId: 'race-run', artifactName: 'sample-manifest.json', value: { race: true } })))
    assert.equal(attempts.filter((item) => item.status === 'fulfilled').length, 1)
    const loser = attempts.find((item) => item.status === 'rejected').reason
    assert.equal(loser.code, 'BLOCKED')
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('HR-TV filesystem partial readback and write failures map to bounded BLOCKED', async () => {
  const root = await temporaryRoot()
  try {
    const mismatchSeam = createTutorHumanReviewRepositoryTestSeam({
      open: async (...args) => {
        const handle = await fs.open(...args)
        if ((args[1] & constants.O_RDONLY) === constants.O_RDONLY && (args[1] & constants.O_WRONLY) === 0) {
          return { stat: () => handle.stat(), readFile: async () => Buffer.from('mismatch'), close: () => handle.close() }
        }
        return handle
      },
    })
    await assert.rejects(() => mismatchSeam.createArtifact({ repositoryRoot: root, sourceRunId: 'partial-run',
      artifactName: 'sample-manifest.json', value: { expected: true } }), (error) => error.code === 'BLOCKED')
    const secondRoot = await temporaryRoot()
    try {
      const writeSeam = createTutorHumanReviewRepositoryTestSeam({ open: async (...args) => {
        const handle = await fs.open(...args)
        return { writeFile: async () => { throw Object.assign(new Error('disk detail'), { code: 'EIO' }) },
          sync: () => handle.sync(), close: () => handle.close(), stat: () => handle.stat(), readFile: () => handle.readFile() }
      } })
      await assert.rejects(() => writeSeam.createArtifact({ repositoryRoot: secondRoot, sourceRunId: 'write-run',
        artifactName: 'sample-manifest.json', value: { expected: true } }), (error) => error.code === 'BLOCKED' && !error.message.includes('disk detail'))
    } finally { await fs.rm(secondRoot, { recursive: true, force: true }) }
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('HR-TV-07 actual production process rejects runner despite injected test environment', () => {
  const script = `import { createTutorHumanReviewLocalRunner } from './lib/server/learning-v2/tutor/governance/human-review-local-runner.js'; import { readTutorHumanReviewArtifact } from './lib/server/learning-v2/tutor/evaluation/human-review-repository.js'; let blocked=0; try { createTutorHumanReviewLocalRunner({ environment: { NODE_ENV: 'test' }, coordinator: {} }) } catch { blocked++ } try { await readTutorHumanReviewArtifact({ repositoryRoot: '.', sourceRunId: 'source-run', artifactName: 'review-packet.json' }) } catch { blocked++ } process.exit(blocked === 2 ? 0 : 2)`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: projectRoot, env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
})

test('HR-TV-08 packet loader requires exact review_ref and derives terminal expiry', async () => {
  assert.equal((await import('../lib/server/learning-v2/tutor/evaluation/human-review-repository.js')).TUTOR_HUMAN_REVIEW_PACKET_TERMINAL_SCOPE, 'EXACT_BOUND_REVIEW_REF')
  await assert.rejects(() => loadActiveTutorHumanReviewPacket({ repositoryRoot: projectRoot,
    sourceRunId: 'verification-source-run' }))
})

test('HR-TV-09 RFC-8785 Unicode, ordering and canonical UTF-8 vectors are strict', () => {
  assert.equal(jcsCanonicalize({ '\u20ac': '€', a: '\b\n', z: 0 }), '{"a":"\\b\\n","z":0,"€":"€"}')
  assert.deepEqual(jcsUtf8Bytes({ text: 'Grüezi' }), Buffer.from('{"text":"Grüezi"}', 'utf8'))
  assert.equal(jcsCanonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}')
  assert.equal(jcsCanonicalize({ minusZero: -0, max: Number.MAX_SAFE_INTEGER }), '{"max":9007199254740991,"minusZero":0}')
  assert.throws(() => jcsCanonicalize('\uD800'))
  assert.throws(() => jcsCanonicalize('\uDC00'))
  assert.throws(() => jcsCanonicalize({ ['bad\uD800']: true }))
  assert.equal(jcsCanonicalize('\uD83D\uDE00'), '"😀"')
})

test('Operations readiness is explicit, externally attested, and missing proof is NOT_READY', async () => {
  const root = await temporaryRoot()
  try {
    const readiness = await verifyTutorHumanReviewOperationsReadiness({ repositoryRoot: root,
      sourceRunId: 'missing-source', reviewRef: 'missing-review' })
    assert.equal(readiness.ready, false)
    assert.equal(readiness.status, 'BLOCKED')
    assert.equal(readiness.external_properties_technically_proven, false)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('HR-TV modules retain no Learning Truth write paths or paid transport adapter', async () => {
  const roots = [path.join(projectRoot, 'lib', 'server', 'learning-v2', 'tutor', 'evaluation'),
    path.join(projectRoot, 'lib', 'server', 'learning-v2', 'tutor', 'governance')]
  const names = []
  for (const root of roots) for (const name of await fs.readdir(root)) if (/human-review.*\.js$/u.test(name)) names.push(path.join(root, name))
  const source = (await Promise.all(names.map((name) => fs.readFile(name, 'utf8')))).join('\n')
  assert.doesNotMatch(source, /insertOne|updateOne|findOneAndUpdate|learning_attempts|learning_evidence|knowledge_state/u)
  assert.doesNotMatch(source, /OPENAI_API_KEY|https:\/\/api\.openai\.com|new OpenAI/u)
})
