import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test, { after, before } from 'node:test'
import { tutorSyntheticEvalCases } from '../lib/server/learning-v2/tutor/eval-fixtures.js'
import { localTutorFallback } from '../lib/server/learning-v2/tutor/fallback-registry.js'
import { TUTOR_HUMAN_REVIEW_DIMENSIONS_V2 } from '../lib/server/learning-v2/tutor/governance/human-review-rubric-v2.js'
import {
  buildTutorHumanReviewAssignmentArtifact,
  buildTutorHumanReviewClaimArtifact,
  createTrustedTutorHumanReviewCoordinator,
  verifyTutorHumanReviewOperationsReadiness,
} from '../lib/server/learning-v2/tutor/governance/human-review-coordinator.js'
import { createTutorHumanReviewLocalRunner } from '../lib/server/learning-v2/tutor/governance/human-review-local-runner.js'
import { finalizeTutorHumanReviewFromRepository } from '../lib/server/learning-v2/tutor/governance/human-review-finalizer.js'
import {
  buildTutorHumanReviewSubmissionArtifact,
  verifyTutorHumanReviewRecord,
} from '../lib/server/learning-v2/tutor/governance/human-review-record-v1.js'
import {
  projectTutorReviewCaptureToRepository,
  runTutorReviewCapableProviderFreeCapture,
} from '../lib/server/learning-v2/tutor/evaluation/human-review-evaluator-v7.js'
import {
  createTutorHumanReviewExecutionArtifact,
  createTutorHumanReviewSourceResultArtifact,
  loadActiveTutorHumanReviewPacket,
  readTutorHumanReviewArtifact,
  readTutorHumanReviewExecutionArtifact,
} from '../lib/server/learning-v2/tutor/evaluation/human-review-repository.js'
import { createTutorHumanReviewTrustedClockTestHarness } from './helpers/human-review-trusted-clock.mjs'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const fixtures = tutorSyntheticEvalCases()
const packetCreatedAt = '2026-09-09T10:00:00.000Z'
const trustedNow = '2026-09-10T10:00:00.000Z'
const futureExpiry = '2026-12-01T00:00:00.000Z'
const token = (value) => `opaque-token-${String(value).padStart(40, '0')}`
const temporalCanaries = ['now', 'submittedAt', 'submitted_at', 'terminalAt', 'terminal_at',
  'currentTime', 'current_time', 'timestamp']
let previousNodeEnv

before(() => { previousNodeEnv = process.env.NODE_ENV; process.env.NODE_ENV = 'test' })
after(() => { if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv })

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

async function materializeReview({ reviewRef = 'clock-review' } = {}) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'eduflow-hr-clock-'))
  const sourceRunId = 'clock-source-run'
  const handle = runTutorReviewCapableProviderFreeCapture({ sourceRunId, fixtures, providerEventForFixture: providerPass })
  await createTutorHumanReviewSourceResultArtifact({ repositoryRoot: root, sourceRunId, value: handle.result })
  const projected = await projectTutorReviewCaptureToRepository({ repositoryRoot: root, handle, packetCreatedAt })
  const packet = (await readTutorHumanReviewArtifact({ repositoryRoot: root, sourceRunId,
    artifactName: 'review-packet.json' })).value
  const sample = (await readTutorHumanReviewArtifact({ repositoryRoot: root, sourceRunId,
    artifactName: 'sample-manifest.json' })).value
  const claim = buildTutorHumanReviewClaimArtifact({
    review_ref: reviewRef, coordinator_ref: 'clock-coordinator', source_run_id: sourceRunId,
    source_result_sha256: sample.source_result_sha256, sample_manifest_sha256: projected.sample_manifest_sha256,
    packet_sha256: projected.packet_sha256, review_item_refs: packet.items.map((item) => item.review_item_ref),
    review_ref_created_at: packetCreatedAt, operations_attestation: operationsAttestation(),
  })
  await createTutorHumanReviewExecutionArtifact({ repositoryRoot: root, sourceRunId, reviewRef,
    kind: 'claim', value: claim })
  return { root, sourceRunId, reviewRef, packet, claim }
}

async function persistAssignment(context, {
  tokenValue, reviewerRef, phase, itemRef, expiresAt = futureExpiry, independent = [],
}) {
  const assignment = buildTutorHumanReviewAssignmentArtifact({ claim: context.claim,
    opaqueAssignmentToken: tokenValue, reviewerRef, phase, reviewItemRef: itemRef,
    expiresAt, independentFromReviewerRefs: independent })
  await createTutorHumanReviewExecutionArtifact({ repositoryRoot: context.root, sourceRunId: context.sourceRunId,
    reviewRef: context.reviewRef, kind: 'assignment', submissionRef: assignment.assignment_ref, value: assignment })
  return assignment
}

async function completeReviewArtifacts(context) {
  let ordinal = 0
  for (const item of context.packet.items) {
    for (const reviewerRef of ['reviewer-one', 'reviewer-two']) {
      const firstAssignment = await persistAssignment(context, { tokenValue: token(`complete-first-${ordinal}`),
        reviewerRef, phase: 'FIRST_PASS', itemRef: item.review_item_ref })
      const first = buildTutorHumanReviewSubmissionArtifact({ ...firstAssignment,
        review_claim_sha256: context.claim.claim_sha256, submitted_at: trustedNow,
        ratings: allPassRatings(), synthetic_note: null })
      await createTutorHumanReviewExecutionArtifact({ repositoryRoot: context.root, sourceRunId: context.sourceRunId,
        reviewRef: context.reviewRef, kind: 'first-pass', submissionRef: first.submission_ref, value: first })
      const secondAssignment = await persistAssignment(context, { tokenValue: token(`complete-second-${ordinal}`),
        reviewerRef, phase: 'SECOND_PASS', itemRef: item.review_item_ref })
      const second = buildTutorHumanReviewSubmissionArtifact({ ...secondAssignment,
        review_claim_sha256: context.claim.claim_sha256, submitted_at: trustedNow,
        first_pass_submission_sha256: first.submission_sha256, synthetic_note: null })
      await createTutorHumanReviewExecutionArtifact({ repositoryRoot: context.root, sourceRunId: context.sourceRunId,
        reviewRef: context.reviewRef, kind: 'second-pass', submissionRef: second.submission_ref, value: second })
      ordinal += 1
    }
  }
}

test('trusted-clock public boundaries reject every temporal authority canary', async () => {
  const context = await materializeReview()
  try {
    const itemRef = context.packet.items[0].review_item_ref
    const assignmentToken = token('canary-first')
    await persistAssignment(context, { tokenValue: assignmentToken, reviewerRef: 'reviewer-one',
      phase: 'FIRST_PASS', itemRef })
    const harness = createTutorHumanReviewTrustedClockTestHarness(trustedNow)
    const coordinator = await harness.createCoordinator({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef })
    const runner = createTutorHumanReviewLocalRunner({ coordinator })
    for (const field of temporalCanaries) {
      assert.throws(() => runner.projectFirstPass({ assignmentToken, [field]: packetCreatedAt }), undefined, field)
      assert.throws(() => runner.submitFirstPass({ assignmentToken, reviewItemRef: itemRef,
        ratings: allPassRatings(), [field]: packetCreatedAt }), undefined, field)
      await assert.rejects(() => coordinator.submit({ assignmentToken, phase: 'FIRST_PASS', reviewItemRef: itemRef,
        clientInput: { ratings: allPassRatings(), synthetic_note: null, [field]: packetCreatedAt } }), undefined, field)
      await assert.rejects(() => loadActiveTutorHumanReviewPacket({ repositoryRoot: context.root,
        sourceRunId: context.sourceRunId, reviewRef: context.reviewRef, [field]: packetCreatedAt }), undefined, field)
      await assert.rejects(() => finalizeTutorHumanReviewFromRepository({ repositoryRoot: context.root,
        sourceRunId: context.sourceRunId, reviewRef: context.reviewRef, [field]: packetCreatedAt }), undefined, field)
    }
    await assert.rejects(() => createTrustedTutorHumanReviewCoordinator({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef, now: packetCreatedAt }))
    await assert.rejects(() => verifyTutorHumanReviewOperationsReadiness({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef, current_time: packetCreatedAt }))
  } finally { await fs.rm(context.root, { recursive: true, force: true }) }
})

test('expired First-Pass Assignment rejects caller backdated now and submittedAt', async () => {
  const context = await materializeReview()
  try {
    const itemRef = context.packet.items[0].review_item_ref
    const assignmentToken = token('expired-first')
    await persistAssignment(context, { tokenValue: assignmentToken, reviewerRef: 'reviewer-one',
      phase: 'FIRST_PASS', itemRef, expiresAt: packetCreatedAt })
    const coordinator = await createTutorHumanReviewTrustedClockTestHarness(trustedNow).createCoordinator({
      repositoryRoot: context.root, sourceRunId: context.sourceRunId, reviewRef: context.reviewRef })
    const runner = createTutorHumanReviewLocalRunner({ coordinator })
    assert.throws(() => runner.projectFirstPass({ assignmentToken, now: '2026-09-01T00:00:00.000Z' }))
    assert.throws(() => runner.submitFirstPass({ assignmentToken, reviewItemRef: itemRef,
      ratings: allPassRatings(), submittedAt: '2026-09-01T00:00:00.000Z' }))
    await assert.rejects(() => runner.projectFirstPass({ assignmentToken }), (error) => error.reasonCode === 'REVIEW_AUTHORITY_INVALID')
    await assert.rejects(() => runner.submitFirstPass({ assignmentToken, reviewItemRef: itemRef,
      ratings: allPassRatings() }), (error) => error.reasonCode === 'REVIEW_AUTHORITY_INVALID')
  } finally { await fs.rm(context.root, { recursive: true, force: true }) }
})

test('expired Adjudication Assignment rejects backdated time', async () => {
  const context = await materializeReview()
  try {
    const itemRef = context.packet.items[0].review_item_ref
    const assignmentToken = token('expired-adjudication')
    await persistAssignment(context, { tokenValue: assignmentToken, reviewerRef: 'reviewer-three',
      phase: 'ADJUDICATION', itemRef, expiresAt: packetCreatedAt,
      independent: ['reviewer-one', 'reviewer-two'] })
    const coordinator = await createTutorHumanReviewTrustedClockTestHarness(trustedNow).createCoordinator({
      repositoryRoot: context.root, sourceRunId: context.sourceRunId, reviewRef: context.reviewRef })
    const runner = createTutorHumanReviewLocalRunner({ coordinator })
    const dimensionRating = { dimension: 'CLARITY', rating: 'PASS', not_applicable_reason: null, critical_findings: [] }
    assert.throws(() => runner.submitAdjudication({ assignmentToken, reviewItemRef: itemRef,
      dimensionRating, currentTime: '2026-09-01T00:00:00.000Z' }))
    await assert.rejects(() => runner.submitAdjudication({ assignmentToken, reviewItemRef: itemRef, dimensionRating }),
      (error) => error.reasonCode === 'REVIEW_AUTHORITY_INVALID')
  } finally { await fs.rm(context.root, { recursive: true, force: true }) }
})

test('expired Second-Pass Assignment rejects backdated time before unlock', async () => {
  const context = await materializeReview()
  try {
    const itemRef = context.packet.items[0].review_item_ref
    const assignmentToken = token('expired-second')
    await persistAssignment(context, { tokenValue: assignmentToken, reviewerRef: 'reviewer-one',
      phase: 'SECOND_PASS', itemRef, expiresAt: packetCreatedAt })
    const coordinator = await createTutorHumanReviewTrustedClockTestHarness(trustedNow).createCoordinator({
      repositoryRoot: context.root, sourceRunId: context.sourceRunId, reviewRef: context.reviewRef })
    const runner = createTutorHumanReviewLocalRunner({ coordinator })
    assert.throws(() => runner.projectSecondPass({ assignmentToken, timestamp: '2026-09-01T00:00:00.000Z' }))
    assert.throws(() => runner.submitSecondPass({ assignmentToken, reviewItemRef: itemRef,
      terminal_at: '2026-09-01T00:00:00.000Z' }))
    await assert.rejects(() => runner.projectSecondPass({ assignmentToken }),
      (error) => error.reasonCode === 'REVIEW_AUTHORITY_INVALID')
    await assert.rejects(() => runner.submitSecondPass({ assignmentToken, reviewItemRef: itemRef }),
      (error) => error.reasonCode === 'REVIEW_AUTHORITY_INVALID')
  } finally { await fs.rm(context.root, { recursive: true, force: true }) }
})

test('trusted_now equal to expires_at rejects every Assignment phase', async () => {
  const context = await materializeReview()
  try {
    const itemRef = context.packet.items[0].review_item_ref
    const harness = createTutorHumanReviewTrustedClockTestHarness(trustedNow)
    const coordinator = await harness.createCoordinator({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef })
    const runner = createTutorHumanReviewLocalRunner({ coordinator })
    const cases = [
      ['FIRST_PASS', token('equal-first'), 'reviewer-one', []],
      ['ADJUDICATION', token('equal-adjudication'), 'reviewer-three', ['reviewer-one', 'reviewer-two']],
      ['SECOND_PASS', token('equal-second'), 'reviewer-one', []],
    ]
    for (const [phase, assignmentToken, reviewerRef, independent] of cases) {
      await persistAssignment(context, { tokenValue: assignmentToken, reviewerRef, phase, itemRef,
        expiresAt: trustedNow, independent })
      if (phase === 'FIRST_PASS') await assert.rejects(() => runner.projectFirstPass({ assignmentToken }),
        (error) => error.reasonCode === 'REVIEW_AUTHORITY_INVALID')
      else if (phase === 'ADJUDICATION') await assert.rejects(() => runner.submitAdjudication({ assignmentToken,
        reviewItemRef: itemRef, dimensionRating: { dimension: 'CLARITY', rating: 'PASS',
          not_applicable_reason: null, critical_findings: [] } }), (error) => error.reasonCode === 'REVIEW_AUTHORITY_INVALID')
      else await assert.rejects(() => runner.projectSecondPass({ assignmentToken }),
        (error) => error.reasonCode === 'REVIEW_AUTHORITY_INVALID')
    }
  } finally { await fs.rm(context.root, { recursive: true, force: true }) }
})

test('trusted clock owns First-Pass, Adjudication and Second-Pass submitted_at', async () => {
  const context = await materializeReview()
  try {
    const itemRef = context.packet.items[0].review_item_ref
    const harness = createTutorHumanReviewTrustedClockTestHarness(trustedNow)
    const coordinator = await harness.createCoordinator({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef })
    const runner = createTutorHumanReviewLocalRunner({ coordinator })
    const firstToken = token('positive-first')
    await persistAssignment(context, { tokenValue: firstToken, reviewerRef: 'reviewer-one', phase: 'FIRST_PASS', itemRef })
    const firstProjection = await runner.projectFirstPass({ assignmentToken: firstToken })
    assert.equal(firstProjection.projection_version, 'tutor-human-review-first-pass-projection-v1')
    assert.equal(firstProjection.review_ref, context.reviewRef)
    assert.equal(firstProjection.review_item_ref, itemRef)
    const firstCommit = await runner.submitFirstPass({ assignmentToken: firstToken, reviewItemRef: itemRef,
      ratings: allPassRatings() })
    const first = (await readTutorHumanReviewExecutionArtifact({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef, kind: 'first-pass',
      submissionRef: firstCommit.submission_ref })).value
    assert.equal(first.submitted_at, trustedNow)

    const adjudicationToken = token('positive-adjudication')
    await persistAssignment(context, { tokenValue: adjudicationToken, reviewerRef: 'reviewer-three',
      phase: 'ADJUDICATION', itemRef, independent: ['reviewer-one', 'reviewer-two'] })
    const adjudicationCommit = await runner.submitAdjudication({ assignmentToken: adjudicationToken,
      reviewItemRef: itemRef, dimensionRating: { dimension: 'CLARITY', rating: 'PASS',
        not_applicable_reason: null, critical_findings: [] } })
    const adjudication = (await readTutorHumanReviewExecutionArtifact({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef, kind: 'adjudication',
      submissionRef: adjudicationCommit.submission_ref })).value
    assert.equal(adjudication.submitted_at, trustedNow)

    const secondToken = token('positive-second')
    await persistAssignment(context, { tokenValue: secondToken, reviewerRef: 'reviewer-one', phase: 'SECOND_PASS', itemRef })
    assert.equal((await runner.projectSecondPass({ assignmentToken: secondToken })).review_item_ref, itemRef)
    const secondCommit = await runner.submitSecondPass({ assignmentToken: secondToken, reviewItemRef: itemRef })
    const second = (await readTutorHumanReviewExecutionArtifact({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef, kind: 'second-pass',
      submissionRef: secondCommit.submission_ref })).value
    assert.equal(second.submitted_at, trustedNow)
  } finally { await fs.rm(context.root, { recursive: true, force: true }) }
})

test('Packet loader rejects caller backdating and trusted_now equal to delete_at', async () => {
  const context = await materializeReview()
  try {
    await assert.rejects(() => loadActiveTutorHumanReviewPacket({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef, now: packetCreatedAt }))
    const equality = createTutorHumanReviewTrustedClockTestHarness('2027-03-08T10:00:00.000Z')
    await assert.rejects(() => equality.loadActivePacket({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef }),
    (error) => error.reasonCode === 'REVIEW_MATERIAL_EXPIRED')
  } finally { await fs.rm(context.root, { recursive: true, force: true }) }
})

test('Finalizer rejects caller terminal time and persists only trusted terminal_at', async () => {
  const context = await materializeReview()
  try {
    await completeReviewArtifacts(context)
    for (const field of ['terminalAt', 'terminal_at', 'timestamp']) {
      await assert.rejects(() => finalizeTutorHumanReviewFromRepository({ repositoryRoot: context.root,
        sourceRunId: context.sourceRunId, reviewRef: context.reviewRef, [field]: '2099-01-01T00:00:00.000Z' }))
    }
    const record = await createTutorHumanReviewTrustedClockTestHarness(trustedNow).finalize({
      repositoryRoot: context.root, sourceRunId: context.sourceRunId, reviewRef: context.reviewRef })
    assert.equal(verifyTutorHumanReviewRecord(record).terminal_at, trustedNow)
  } finally { await fs.rm(context.root, { recursive: true, force: true }) }
})

test('exact terminal record shortens Packet life without a caller hint', async () => {
  const context = await materializeReview()
  try {
    await completeReviewArtifacts(context)
    await createTutorHumanReviewTrustedClockTestHarness(trustedNow).finalize({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef })
    const expiry = createTutorHumanReviewTrustedClockTestHarness('2026-10-10T10:00:00.000Z')
    await assert.rejects(() => expiry.loadActivePacket({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef }),
    (error) => error.reasonCode === 'REVIEW_MATERIAL_EXPIRED')
  } finally { await fs.rm(context.root, { recursive: true, force: true }) }
})

test('terminal record for another review does not shorten the bound review lifetime', async () => {
  const context = await materializeReview({ reviewRef: 'terminal-review-one' })
  try {
    await completeReviewArtifacts(context)
    await createTutorHumanReviewTrustedClockTestHarness(trustedNow).finalize({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: context.reviewRef })
    const later = createTutorHumanReviewTrustedClockTestHarness('2026-10-10T10:00:00.000Z')
    const packet = await later.loadActivePacket({ repositoryRoot: context.root,
      sourceRunId: context.sourceRunId, reviewRef: 'terminal-review-two' })
    assert.equal(packet.packet_sha256, context.packet.packet_sha256)
  } finally { await fs.rm(context.root, { recursive: true, force: true }) }
})

test('malformed exact terminal record fails closed', async () => {
  const context = await materializeReview({ reviewRef: 'malformed-terminal-review' })
  try {
    await createTutorHumanReviewExecutionArtifact({ repositoryRoot: context.root, sourceRunId: context.sourceRunId,
      reviewRef: context.reviewRef, kind: 'final-record', value: {} })
    await assert.rejects(() => createTutorHumanReviewTrustedClockTestHarness(trustedNow).loadActivePacket({
      repositoryRoot: context.root, sourceRunId: context.sourceRunId, reviewRef: context.reviewRef }),
    (error) => error.code === 'BLOCKED')
  } finally { await fs.rm(context.root, { recursive: true, force: true }) }
})

test('trusted-clock hardening preserves create-once exactly-one-winner semantics', async () => {
  const context = await materializeReview()
  try {
    const itemRef = context.packet.items[0].review_item_ref
    const assignmentToken = token('clock-race')
    await persistAssignment(context, { tokenValue: assignmentToken, reviewerRef: 'reviewer-one',
      phase: 'FIRST_PASS', itemRef })
    const coordinator = await createTutorHumanReviewTrustedClockTestHarness(trustedNow).createCoordinator({
      repositoryRoot: context.root, sourceRunId: context.sourceRunId, reviewRef: context.reviewRef })
    const runner = createTutorHumanReviewLocalRunner({ coordinator })
    const attempts = await Promise.allSettled([1, 2].map(() => runner.submitFirstPass({ assignmentToken,
      reviewItemRef: itemRef, ratings: allPassRatings() })))
    assert.equal(attempts.filter((item) => item.status === 'fulfilled').length, 1)
    assert.equal(attempts.filter((item) => item.status === 'rejected').length, 1)
    assert.equal(attempts.find((item) => item.status === 'rejected').reason.code, 'BLOCKED')
  } finally { await fs.rm(context.root, { recursive: true, force: true }) }
})

test('test clock is absent from public runner input and unavailable outside test process', async () => {
  const context = await materializeReview()
  try {
    const coordinator = await createTutorHumanReviewTrustedClockTestHarness(trustedNow).createCoordinator({
      repositoryRoot: context.root, sourceRunId: context.sourceRunId, reviewRef: context.reviewRef })
    assert.throws(() => createTutorHumanReviewLocalRunner({ coordinator, clock: { read: () => new Date(0) } }))
    const script = `import { createInternalTutorHumanReviewTestClock } from './lib/server/learning-v2/tutor/governance/human-review-clock.js'; let blocked=false; try { createInternalTutorHumanReviewTestClock('${trustedNow}') } catch { blocked=true } process.exit(blocked ? 0 : 2)`
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: projectRoot, env: { ...process.env, NODE_ENV: 'development' }, encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
  } finally { await fs.rm(context.root, { recursive: true, force: true }) }
})

test('actual Production process cannot inject or construct a test clock', () => {
  const script = `import { createInternalTutorHumanReviewTestClock } from './lib/server/learning-v2/tutor/governance/human-review-clock.js'; import { createTutorHumanReviewLocalRunner } from './lib/server/learning-v2/tutor/governance/human-review-local-runner.js'; let blocked=0; try { createInternalTutorHumanReviewTestClock('${trustedNow}') } catch { blocked++ } try { createTutorHumanReviewLocalRunner({ coordinator: {}, clock: { read: () => new Date(0) } }) } catch { blocked++ } process.exit(blocked === 2 ? 0 : 2)`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: projectRoot, env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
})
