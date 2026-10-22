import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { after, before } from 'node:test'
import { tutorSyntheticEvalCases } from '../lib/server/learning-v2/tutor/eval-fixtures.js'
import { localTutorFallback } from '../lib/server/learning-v2/tutor/fallback-registry.js'
import {
  TUTOR_HUMAN_REVIEW_DIMENSIONS_V2,
} from '../lib/server/learning-v2/tutor/governance/human-review-rubric-v2.js'
import {
  buildTutorHumanReviewAssignmentArtifact,
  buildTutorHumanReviewClaimArtifact,
} from '../lib/server/learning-v2/tutor/governance/human-review-coordinator.js'
import { createTutorHumanReviewLocalRunner } from '../lib/server/learning-v2/tutor/governance/human-review-local-runner.js'
import {
  tutorHumanReviewFirstPassProjectionSchema,
  verifyTutorHumanReviewFirstPassProjection,
} from '../lib/server/learning-v2/tutor/governance/human-review-projection-v1.js'
import { jcsUtf8Bytes } from '../lib/server/learning-v2/tutor/evaluation/human-review-canonical.js'
import {
  projectTutorReviewCaptureToRepository,
  runTutorReviewCapableProviderFreeCapture,
} from '../lib/server/learning-v2/tutor/evaluation/human-review-evaluator-v7.js'
import {
  createTutorHumanReviewExecutionArtifact,
  createTutorHumanReviewSourceResultArtifact,
  readTutorHumanReviewArtifact,
  readTutorHumanReviewExecutionArtifact,
} from '../lib/server/learning-v2/tutor/evaluation/human-review-repository.js'
import { createTutorHumanReviewTrustedClockTestHarness } from './helpers/human-review-trusted-clock.mjs'

const fixtures = tutorSyntheticEvalCases()
const packetCreatedAt = '2026-09-09T10:00:00.000Z'
const trustedNow = '2026-09-10T10:00:00.000Z'
const futureExpiry = '2026-12-01T00:00:00.000Z'
const assignmentToken = `opaque-token-${'first-pass-binding'.padStart(40, '0')}`
let previousNodeEnv
let context
let assignment
let runner
let projection

function allPassRatings() {
  return TUTOR_HUMAN_REVIEW_DIMENSIONS_V2.map((dimension) => ({
    dimension, rating: 'PASS', not_applicable_reason: null, critical_findings: [],
  }))
}

function operationsAttestation() {
  const proof = (value) => ({ status: 'OPERATOR_ATTESTED', evidence_ref: value, attested_at: packetCreatedAt })
  return {
    attestation_contract_version: 'tutor-human-review-operations-attestation-v1',
    repository_private: proof('private-repository-attestation'),
    authoritative_branch_protected: proof('protected-branch-attestation'),
    designated_single_coordinator: proof('single-coordinator-attestation'),
    reviewer_direct_repository_access_absent: proof('reviewer-access-attestation'),
    external_properties_technically_proven: false,
  }
}

function providerPass(fixture) {
  return { kind: 'PROVIDER_CANDIDATE', candidate: localTutorFallback(fixture.level) }
}

async function createClaim(reviewRef) {
  const claim = buildTutorHumanReviewClaimArtifact({
    review_ref: reviewRef,
    coordinator_ref: 'binding-coordinator',
    source_run_id: context.sourceRunId,
    source_result_sha256: context.sample.source_result_sha256,
    sample_manifest_sha256: context.projected.sample_manifest_sha256,
    packet_sha256: context.projected.packet_sha256,
    review_item_refs: context.packet.items.map((item) => item.review_item_ref),
    review_ref_created_at: packetCreatedAt,
    operations_attestation: operationsAttestation(),
  })
  await createTutorHumanReviewExecutionArtifact({ repositoryRoot: context.root, sourceRunId: context.sourceRunId,
    reviewRef, kind: 'claim', value: claim })
  return claim
}

before(async () => {
  previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'
  const root = await fs.mkdtemp(path.join(tmpdir(), 'eduflow-hr-binding-'))
  const sourceRunId = 'binding-source-run'
  const reviewRef = 'binding-review-a'
  const handle = runTutorReviewCapableProviderFreeCapture({ sourceRunId, fixtures, providerEventForFixture: providerPass })
  await createTutorHumanReviewSourceResultArtifact({ repositoryRoot: root, sourceRunId, value: handle.result })
  const projected = await projectTutorReviewCaptureToRepository({ repositoryRoot: root, handle, packetCreatedAt })
  const packet = (await readTutorHumanReviewArtifact({ repositoryRoot: root, sourceRunId,
    artifactName: 'review-packet.json' })).value
  const sample = (await readTutorHumanReviewArtifact({ repositoryRoot: root, sourceRunId,
    artifactName: 'sample-manifest.json' })).value
  context = { root, sourceRunId, reviewRef, projected, packet, sample }
  const claim = await createClaim(reviewRef)
  context.claim = claim
  assignment = buildTutorHumanReviewAssignmentArtifact({ claim, opaqueAssignmentToken: assignmentToken,
    reviewerRef: 'reviewer-one', phase: 'FIRST_PASS', reviewItemRef: packet.items[0].review_item_ref,
    expiresAt: futureExpiry, independentFromReviewerRefs: [] })
  await createTutorHumanReviewExecutionArtifact({ repositoryRoot: root, sourceRunId, reviewRef,
    kind: 'assignment', submissionRef: assignment.assignment_ref, value: assignment })
  const coordinator = await createTutorHumanReviewTrustedClockTestHarness(trustedNow).createCoordinator({
    repositoryRoot: root, sourceRunId, reviewRef })
  runner = createTutorHumanReviewLocalRunner({ coordinator })
  projection = await runner.projectFirstPass({ assignmentToken })
})

after(async () => {
  if (context?.root) await fs.rm(context.root, { recursive: true, force: true })
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = previousNodeEnv
})

test('HR-RV-01 valid projection has the exact Assignment review_ref', () => {
  assert.equal(projection.review_ref, assignment.review_ref)
  assert.equal(projection.review_ref, context.reviewRef)
  assert.equal(Object.isFrozen(projection), true)
  assert.equal(Object.isFrozen(projection.synthetic_task_context), true)
})

test('HR-RV-01 valid projection has the exact Assignment item ref and survives canonical serialization', () => {
  assert.equal(projection.review_item_ref, assignment.review_item_ref)
  const canonical = jcsUtf8Bytes(projection)
  const reparsed = verifyTutorHumanReviewFirstPassProjection(JSON.parse(canonical.toString('utf8')))
  assert.equal(reparsed.review_ref, assignment.review_ref)
  assert.equal(reparsed.review_item_ref, assignment.review_item_ref)
  assert.deepEqual(jcsUtf8Bytes(reparsed), canonical)
})

test('HR-RV-01 strict Projection schema rejects a missing review_ref', () => {
  const candidate = structuredClone(projection)
  delete candidate.review_ref
  assert.equal(tutorHumanReviewFirstPassProjectionSchema.safeParse(candidate).success, false)
})

test('HR-RV-01 strict Projection schema rejects a missing review_item_ref', () => {
  const candidate = structuredClone(projection)
  delete candidate.review_item_ref
  assert.equal(tutorHumanReviewFirstPassProjectionSchema.safeParse(candidate).success, false)
})

test('HR-RV-01 strict Projection schema rejects undefined and empty review_ref', () => {
  assert.equal(tutorHumanReviewFirstPassProjectionSchema.safeParse({ ...structuredClone(projection), review_ref: undefined }).success, false)
  assert.equal(tutorHumanReviewFirstPassProjectionSchema.safeParse({ ...structuredClone(projection), review_ref: '' }).success, false)
})

test('HR-RV-01 strict Projection schema rejects undefined and empty review_item_ref', () => {
  assert.equal(tutorHumanReviewFirstPassProjectionSchema.safeParse({ ...structuredClone(projection), review_item_ref: undefined }).success, false)
  assert.equal(tutorHumanReviewFirstPassProjectionSchema.safeParse({ ...structuredClone(projection), review_item_ref: '' }).success, false)
})

test('HR-RV-01 strict Projection schema rejects extra and blinded fields', () => {
  const forbidden = ['final_source', 'cause', 'provider_id', 'model_id', 'r1_aggregate', 'repository_path',
    'synthetic_case_ref', 'raw_provider_content']
  for (const field of forbidden) {
    assert.equal(tutorHumanReviewFirstPassProjectionSchema.safeParse({ ...structuredClone(projection),
      [field]: `forbidden-${field}` }).success, false, field)
  }
})

test('HR-RV-01 Projection from Review A cannot be used for Review B', async () => {
  const otherReviewRef = 'binding-review-b'
  await createClaim(otherReviewRef)
  const otherCoordinator = await createTutorHumanReviewTrustedClockTestHarness(trustedNow).createCoordinator({
    repositoryRoot: context.root, sourceRunId: context.sourceRunId, reviewRef: otherReviewRef })
  const otherRunner = createTutorHumanReviewLocalRunner({ coordinator: otherCoordinator })
  await assert.rejects(() => otherRunner.projectFirstPass({ assignmentToken }), (error) => error.code === 'BLOCKED')
  assert.throws(() => runner.projectFirstPass({ assignmentToken, review_ref: otherReviewRef }))
})

test('HR-RV-01 Projection item A cannot submit ratings for item B', async () => {
  await assert.rejects(() => runner.submitFirstPass({ assignmentToken,
    reviewItemRef: context.packet.items[1].review_item_ref, ratings: allPassRatings() }),
  (error) => error.reasonCode === 'REVIEW_AUTHORITY_INVALID')
})

test('HR-RV-01 matching immutable refs submit and caller binding overrides reject', async () => {
  assert.throws(() => runner.submitFirstPass({ assignmentToken, reviewItemRef: projection.review_item_ref,
    reviewRef: 'caller-review', ratings: allPassRatings() }))
  const committed = await runner.submitFirstPass({ assignmentToken, reviewItemRef: projection.review_item_ref,
    ratings: allPassRatings() })
  const stored = (await readTutorHumanReviewExecutionArtifact({ repositoryRoot: context.root,
    sourceRunId: context.sourceRunId, reviewRef: context.reviewRef, kind: 'first-pass',
    submissionRef: committed.submission_ref })).value
  assert.equal(stored.review_ref, projection.review_ref)
  assert.equal(stored.review_item_ref, projection.review_item_ref)
  assert.equal(stored.assignment_ref, assignment.assignment_ref)
})
