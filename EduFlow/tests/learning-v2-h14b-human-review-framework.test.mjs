import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { tutorSyntheticEvalCases } from '../lib/server/learning-v2/tutor/eval-fixtures.js'
import { TUTOR_CANONICAL_SAFETY_GATE_ORDER } from '../lib/server/learning-v2/tutor/canonical-safety-gates.js'
import { TUTOR_RUNTIME_APPROVAL_CONTRACT } from '../lib/server/learning-v2/tutor/governance/runtime-approval.js'
import {
  TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2,
  TUTOR_HUMAN_REVIEW_DIMENSIONS_V2,
  TUTOR_HUMAN_REVIEW_RATINGS_V2,
  TUTOR_HUMAN_REVIEW_RUBRIC_V2,
  validateTutorHumanReviewRatingsV2,
} from '../lib/server/learning-v2/tutor/governance/human-review-rubric-v2.js'
import {
  TUTOR_HUMAN_REVIEW_TRANSITIONS_V2,
  TUTOR_HUMAN_REVIEW_WORKFLOW_V2,
  assertTutorHumanReviewTransition,
  deriveTutorHumanReviewStateFromArtifacts,
  tutorHumanReviewRequiredAdjudications,
} from '../lib/server/learning-v2/tutor/governance/human-review-workflow-v2.js'
import {
  TUTOR_HUMAN_QUALITY_OUTCOMES,
  TUTOR_HUMAN_REVIEW_BLOCKED_REASONS,
  assertTutorHumanReviewerIndependence,
  buildTutorHumanReviewRecord,
  createTutorHumanReviewSubmission,
  deriveTutorHumanQualityOutcome,
  verifyTutorHumanReviewRecord,
} from '../lib/server/learning-v2/tutor/governance/human-review-record-v1.js'
import {
  TUTOR_HUMAN_REVIEW_PACKET_RETENTION_DAYS,
  TUTOR_HUMAN_REVIEW_RECORD_RETENTION_DAYS,
  assertTutorHumanReviewMaterialActive,
  tutorHumanReviewPacketDeleteAt,
  tutorHumanReviewRecordDeleteAt,
} from '../lib/server/learning-v2/tutor/governance/human-review-retention.js'
import {
  TUTOR_HUMAN_REVIEW_SAMPLE_MANIFEST_DOMAIN,
  TUTOR_HUMAN_REVIEW_SAMPLE_RANK_DOMAIN,
  buildTutorHumanReviewSampleManifest,
  compareTutorHumanReviewRankedCases,
  tutorHumanReviewRankingSha256,
} from '../lib/server/learning-v2/tutor/evaluation/human-review-sampling.js'
import {
  TUTOR_HUMAN_REVIEW_PACKET_DOMAIN,
  buildTutorHumanReviewPacket,
  verifyTutorHumanReviewPacket,
} from '../lib/server/learning-v2/tutor/evaluation/human-review-packet.js'
import {
  TUTOR_HUMAN_REVIEW_REPOSITORY_GOVERNANCE,
  createTutorHumanReviewArtifact,
  createTutorHumanReviewExecutionArtifact,
  loadActiveTutorHumanReviewPacket,
} from '../lib/server/learning-v2/tutor/evaluation/human-review-repository.js'
import {
  createTutorHumanReviewFirstPassProjection,
  createTutorHumanReviewSecondPassProjection,
} from '../lib/server/learning-v2/tutor/governance/human-review-projection-v1.js'
import { createTutorHumanReviewLocalRunner } from '../lib/server/learning-v2/tutor/governance/human-review-local-runner.js'
import {
  TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST,
  TUTOR_REVIEW_CAPABLE_RESULT_CONTRACT,
  TUTOR_REVIEW_CAPTURE_SEMANTICS,
} from '../lib/server/learning-v2/tutor/evaluation/human-review-evaluation-contract.js'
import { jcsCanonicalize, domainSeparatedJcsSha256 } from '../lib/server/learning-v2/tutor/evaluation/human-review-canonical.js'
import {
  LEARNING_V2_DATA_INVENTORY_VERSION,
  inventoryEntry,
} from '../lib/server/learning-v2/privacy/data-inventory-v1.js'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const sha = (character) => `sha256:${character.repeat(64)}`
const fixtures = tutorSyntheticEvalCases()
const fixtureHash = `sha256:${hash(JSON.stringify(fixtures))}`
const sourceResultBytes = Buffer.from('{"bounded_synthetic_result":true}', 'utf8')
const sourceResultSha = `sha256:${hash(sourceResultBytes)}`
const timestamp = '2026-09-09T10:00:00.000Z'

function allPassRatings() {
  return TUTOR_HUMAN_REVIEW_DIMENSIONS_V2.map((dimension) => ({
    dimension,
    rating: 'PASS',
    not_applicable_reason: null,
    critical_findings: [],
  }))
}

function gateProof() {
  return {
    canonical_safety_contract_version: 'tutor-canonical-safety-gates-v1',
    gates: TUTOR_CANONICAL_SAFETY_GATE_ORDER.map((gate) => ({ gate, status: 'PASS' })),
  }
}

function samplingInput({ localCount = 2 } = {}) {
  return {
    source_run_id: 'review-capable-source-run-v1',
    source_result_sha256: sourceResultSha,
    fixture_set_version: 'tutor-synthetic-fixtures-v1',
    fixture_set_sha256: fixtureHash,
    cases: fixtures.map((fixture, index) => ({
      case_id: fixture.case_id,
      final_source: index < localCount ? 'LOCAL_FALLBACK_ACCEPTED' : 'PROVIDER_ACCEPTED',
      subject_category: fixture.subject,
      hint_level: fixture.level,
      bounded_cause_class: index < localCount ? 'PROVIDER_TECHNICAL_FAILURE' : null,
      bounded_cause_code: index < localCount ? 'PROVIDER_TIMEOUT' : null,
    })),
  }
}

function packetFixture(options = {}) {
  const sampling = samplingInput(options)
  const sample = buildTutorHumanReviewSampleManifest(sampling)
  const byId = new Map(fixtures.map((fixture) => [fixture.case_id, fixture]))
  const selected = sample.selected_cases.map((sampled) => {
    const fixture = byId.get(sampled.case_id)
    return {
      synthetic_case_ref: fixture.case_id,
      subject_category: fixture.subject,
      hint_level: fixture.level,
      expected_tutor_action: fixture.expected_action,
      learner_message: 'Welche Beziehung erkennst du zwischen den Angaben?',
      final_gate_pass_proof: gateProof(),
    }
  })
  const packet = buildTutorHumanReviewPacket({
    source: {
      source_run_id: sample.source_run_id,
      source_result_sha256: sample.source_result_sha256,
      source_evaluation_manifest_version: 'tutor-paid-evaluation-v9',
      source_evaluator_version: 'tutor-paid-evaluator-v7',
      source_result_contract_version: 'tutor-paid-evaluation-result-v5',
      fixture_set_version: sample.fixture_set_version,
      fixture_set_sha256: sample.fixture_set_sha256,
      fixtures_expected: 120,
      fixtures_completed: 120,
      coverage_complete: true,
      final_outcome_fail_count: 0,
      system_safety_pass: true,
      source_result_persisted: true,
      source_result_hash_verified: true,
    },
    source_result_bytes: sourceResultBytes,
    sample_manifest: sample,
    sampling_input: sampling,
    selected_final_outputs: selected,
    packet_created_at: timestamp,
  })
  return { sampling, sample, packet, selected }
}

function grant(packet, overrides = {}) {
  return {
    authority_source: 'TRUSTED_REVIEW_COORDINATOR',
    reviewer_role: 'EDUFLOW_PEDAGOGICAL_REVIEWER',
    reviewer_ref: 'opaque-reviewer-one',
    review_ref: 'review-execution-one',
    source_run_id: packet.source_run_id,
    source_result_sha256: packet.source_result_sha256,
    sample_manifest_sha256: packet.sample_manifest_sha256,
    packet_sha256: packet.packet_sha256,
    phase: 'FIRST_PASS',
    independent_from_reviewer_refs: [],
    allowed_review_item_refs: packet.items.map((item) => item.review_item_ref),
    expires_at: '2026-10-01T00:00:00.000Z',
    packet_expires_at: packet.packet_expires_at,
    direct_repository_access: false,
    unblinded_source_access: false,
    ...overrides,
  }
}

test('JCS canonicalization is deterministic, UTF-8 based and rejects unsafe numeric values', () => {
  assert.equal(jcsCanonicalize({ z: 1, a: ['ä', true, null] }), '{"a":["ä",true,null],"z":1}')
  assert.equal(Buffer.from(jcsCanonicalize({ text: 'Grüezi' }), 'utf8')[0], 0x7b)
  assert.throws(() => jcsCanonicalize({ value: 1.5 }), /safe integers/)
  assert.throws(() => jcsCanonicalize({ value: Number.NaN }), /safe integers/)
})

test('sampling uses the exact frozen rank and manifest domain separation prefixes', () => {
  assert.equal(TUTOR_HUMAN_REVIEW_SAMPLE_RANK_DOMAIN, 'EDUFLOW\0H14B\0HUMAN_REVIEW_SAMPLE_RANK\0v1\0')
  assert.equal(TUTOR_HUMAN_REVIEW_SAMPLE_MANIFEST_DOMAIN, 'EDUFLOW\0H14B\0HUMAN_REVIEW_SAMPLE_MANIFEST\0v1\0')
  assert.equal(TUTOR_HUMAN_REVIEW_PACKET_DOMAIN, 'EDUFLOW\0H14B\0HUMAN_REVIEW_PACKET\0v1\0')
  assert.notEqual(domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_SAMPLE_RANK_DOMAIN, { a: 1 }), domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_SAMPLE_MANIFEST_DOMAIN, { a: 1 }))
})

test('ranking is byte-for-byte deterministic and case-sensitive', () => {
  const input = samplingInput()
  const first = input.cases[0]
  assert.equal(tutorHumanReviewRankingSha256(input, first), tutorHumanReviewRankingSha256(structuredClone(input), structuredClone(first)))
  assert.throws(() => tutorHumanReviewRankingSha256(input, { ...first, case_id: 'Tutor-Synthetic-001' }))
})

test('sampling selects every local fallback and at most two provider cases per actual stratum without refill', () => {
  const manifest = buildTutorHumanReviewSampleManifest(samplingInput({ localCount: 3 }))
  assert.equal(manifest.selected_cases.filter((item) => item.final_source === 'LOCAL_FALLBACK_ACCEPTED').length, 3)
  const providerCounts = new Map()
  for (const item of manifest.selected_cases.filter((candidate) => candidate.final_source === 'PROVIDER_ACCEPTED')) {
    const key = `${item.subject_category}\0${item.hint_level}`
    providerCounts.set(key, (providerCounts.get(key) || 0) + 1)
  }
  assert.ok([...providerCounts.values()].every((count) => count >= 1 && count <= 2))
})

test('duplicate cases fail closed and equal ranking hashes tie-break by exact UTF-8 case_id', () => {
  const input = samplingInput()
  input.cases[1] = { ...input.cases[1], case_id: input.cases[0].case_id }
  assert.throws(() => buildTutorHumanReviewSampleManifest(input), /Duplicate/)
  const ranking_sha256 = 'a'.repeat(64)
  assert.ok(compareTutorHumanReviewRankedCases({ ranking_sha256, case_id: 'case-a' }, { ranking_sha256, case_id: 'case-b' }) < 0)
})

test('Review Packet root and item schemas are exact allowlists', () => {
  const { packet } = packetFixture()
  assert.deepEqual(Object.keys(packet).sort(), ['canonical_safety_contract_version', 'fixture_set_sha256', 'fixture_set_version', 'items', 'packet_contract_version', 'packet_created_at', 'packet_expires_at', 'packet_sha256', 'sample_manifest_sha256', 'sampling_contract_version', 'source_evaluation_manifest_version', 'source_evaluator_version', 'source_result_contract_version', 'source_result_sha256', 'source_run_id', 'synthetic_data_only'].sort())
  assert.deepEqual(Object.keys(packet.items[0]).sort(), ['expected_tutor_action', 'final_gate_pass_proof', 'hint_level', 'learner_message', 'review_item_ref', 'subject_category', 'synthetic_case_ref'].sort())
  assert.throws(() => verifyTutorHumanReviewPacket({ ...packet, provider_id: 'openai' }))
  assert.throws(() => verifyTutorHumanReviewPacket({ ...packet, items: [{ ...packet.items[0], correct_answer: 'secret' }, ...packet.items.slice(1)] }))
})

test('Review Packet enforces text, word, item and encoded size bounds', () => {
  const { packet } = packetFixture()
  assert.throws(() => verifyTutorHumanReviewPacket({ ...packet, items: [{ ...packet.items[0], learner_message: 'x'.repeat(281) }, ...packet.items.slice(1)] }))
  assert.throws(() => verifyTutorHumanReviewPacket({ ...packet, items: [{ ...packet.items[0], learner_message: Array(61).fill('x').join(' ') }, ...packet.items.slice(1)] }))
  assert.throws(() => verifyTutorHumanReviewPacket({ ...packet, items: [] }))
})

test('every Packet item requires all eleven canonical gates exactly PASS in order', () => {
  const { packet } = packetFixture()
  assert.equal(packet.items[0].final_gate_pass_proof.gates.length, 11)
  const failed = structuredClone(packet)
  failed.items[0].final_gate_pass_proof.gates[2].status = 'FAIL'
  assert.throws(() => verifyTutorHumanReviewPacket(failed))
  const reordered = structuredClone(packet)
  ;[reordered.items[0].final_gate_pass_proof.gates[0], reordered.items[0].final_gate_pass_proof.gates[1]] = [reordered.items[0].final_gate_pass_proof.gates[1], reordered.items[0].final_gate_pass_proof.gates[0]]
  assert.throws(() => verifyTutorHumanReviewPacket(reordered))
})

test('rejected Provider candidates have no retained field in capture or Packet contracts', () => {
  const { sampling, sample, selected } = packetFixture()
  assert.equal(TUTOR_REVIEW_CAPTURE_SEMANTICS.rejected_provider_candidate_retained, false)
  assert.throws(() => buildTutorHumanReviewPacket({
    source: {}, source_result_bytes: sourceResultBytes, sample_manifest: sample, sampling_input: sampling, selected_final_outputs: [{ ...selected[0], rejected_provider_candidate: 'raw' }], packet_created_at: timestamp,
  }))
})

test('non-selected final outputs cannot enter the Review Packet', () => {
  const { sampling, sample, selected } = packetFixture()
  const selectedIds = new Set(sample.selected_cases.map((item) => item.case_id))
  const nonSelected = fixtures.find((fixture) => !selectedIds.has(fixture.case_id))
  assert.ok(nonSelected)
  assert.throws(() => buildTutorHumanReviewPacket({
    source: {
      source_run_id: sample.source_run_id, source_result_sha256: sample.source_result_sha256,
      source_evaluation_manifest_version: 'tutor-paid-evaluation-v9', source_evaluator_version: 'tutor-paid-evaluator-v7', source_result_contract_version: 'tutor-paid-evaluation-result-v5',
      fixture_set_version: sample.fixture_set_version, fixture_set_sha256: sample.fixture_set_sha256,
      fixtures_expected: 120, fixtures_completed: 120, coverage_complete: true, final_outcome_fail_count: 0,
      system_safety_pass: true, source_result_persisted: true, source_result_hash_verified: true,
    }, source_result_bytes: sourceResultBytes, sample_manifest: sample, sampling_input: sampling,
    selected_final_outputs: [...selected, { synthetic_case_ref: nonSelected.case_id, subject_category: nonSelected.subject, hint_level: nonSelected.level, expected_tutor_action: nonSelected.expected_action, learner_message: 'extra', final_gate_pass_proof: gateProof() }],
    packet_created_at: timestamp,
  }), /Only and all sampled/)
})

test('repository Packet persistence is create-once and never overwrites', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'eduflow-hr-'))
  try {
    const { packet } = packetFixture()
    await createTutorHumanReviewArtifact({ repositoryRoot: root, sourceRunId: packet.source_run_id, artifactName: 'review-packet.json', value: packet })
    await assert.rejects(() => createTutorHumanReviewArtifact({ repositoryRoot: root, sourceRunId: packet.source_run_id, artifactName: 'review-packet.json', value: packet }), (error) => error.code === 'BLOCKED')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('repository flush/readback preserves and verifies the Packet digest', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'eduflow-hr-'))
  try {
    const { packet } = packetFixture()
    const written = await createTutorHumanReviewArtifact({ repositoryRoot: root, sourceRunId: packet.source_run_id, artifactName: 'review-packet.json', value: packet })
    const loaded = await loadActiveTutorHumanReviewPacket({ repositoryRoot: root, sourceRunId: packet.source_run_id, reviewRef: 'review-one' })
    assert.equal(loaded.packet_sha256, packet.packet_sha256)
    await writeFile(written.artifactPath, (await readFile(written.artifactPath, 'utf8')).replace('Welche', 'WELCHE'))
    await assert.rejects(() => loadActiveTutorHumanReviewPacket({ repositoryRoot: root, sourceRunId: packet.source_run_id, reviewRef: 'review-one' }), (error) => error.code === 'BLOCKED')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('retention uses 180-day Packet and 365-day Record active-branch engineering periods', () => {
  assert.equal(TUTOR_HUMAN_REVIEW_PACKET_RETENTION_DAYS, 180)
  assert.equal(TUTOR_HUMAN_REVIEW_RECORD_RETENTION_DAYS, 365)
  assert.equal(tutorHumanReviewPacketDeleteAt(timestamp), '2027-03-08T10:00:00.000Z')
  assert.equal(tutorHumanReviewPacketDeleteAt(timestamp, '2026-09-20T10:00:00.000Z'), '2026-10-20T10:00:00.000Z')
  assert.equal(tutorHumanReviewRecordDeleteAt(timestamp), '2027-09-09T10:00:00.000Z')
  assert.throws(() => assertTutorHumanReviewMaterialActive('2026-09-10T00:00:00.000Z', new Date('2026-09-10T00:00:00.000Z')), (error) => error.code === 'REVIEW_MATERIAL_EXPIRED')
})

test('repository paths reject traversal, Unicode, absolute identifiers and symlink roots', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'eduflow-hr-'))
  const target = await mkdtemp(path.join(tmpdir(), 'eduflow-hr-target-'))
  try {
    for (const sourceRunId of ['../escape', 'with/slash', 'review_underscore', 'réview', path.resolve(root)]) {
      await assert.rejects(() => createTutorHumanReviewArtifact({ repositoryRoot: root, sourceRunId, artifactName: 'review-packet.json', value: {} }))
    }
    await mkdir(path.join(root, 'docs', 'evaluation-results'), { recursive: true })
    await symlink(target, path.join(root, 'docs', 'evaluation-results', 'human-review'), 'junction')
    await assert.rejects(() => createTutorHumanReviewArtifact({ repositoryRoot: root, sourceRunId: 'safe-run', artifactName: 'review-packet.json', value: {} }), (error) => error.code === 'BLOCKED')
  } finally { await rm(root, { recursive: true, force: true }); await rm(target, { recursive: true, force: true }) }
})

test('Rubric v2 contains exactly the nine frozen dimensions and four ratings', () => {
  assert.equal(TUTOR_HUMAN_REVIEW_RUBRIC_V2.rubric_version, 'tutor-human-review-rubric-v2')
  assert.deepEqual(TUTOR_HUMAN_REVIEW_RUBRIC_V2.dimensions, TUTOR_HUMAN_REVIEW_DIMENSIONS_V2)
  assert.equal(TUTOR_HUMAN_REVIEW_DIMENSIONS_V2.length, 9)
  assert.deepEqual(TUTOR_HUMAN_REVIEW_RATINGS_V2, ['PASS', 'CONCERN', 'FAIL', 'NOT_APPLICABLE'])
})

test('NOT_APPLICABLE is only factual correctness with NO_FACTUAL_CLAIM_PRESENT', () => {
  const valid = allPassRatings()
  valid[4] = { dimension: 'FACTUAL_CORRECTNESS', rating: 'NOT_APPLICABLE', not_applicable_reason: 'NO_FACTUAL_CLAIM_PRESENT', critical_findings: [] }
  assert.doesNotThrow(() => validateTutorHumanReviewRatingsV2(valid))
  const invalid = allPassRatings()
  invalid[0] = { dimension: 'CLARITY', rating: 'NOT_APPLICABLE', not_applicable_reason: 'NO_FACTUAL_CLAIM_PRESENT', critical_findings: [] }
  assert.throws(() => validateTutorHumanReviewRatingsV2(invalid))
})

test('Critical Finding codes reject cross-dimension and non-FAIL assignments', () => {
  const cross = allPassRatings()
  cross[4] = { dimension: 'FACTUAL_CORRECTNESS', rating: 'FAIL', not_applicable_reason: null, critical_findings: ['HR_DIRECT_ANSWER_DISCLOSURE'] }
  assert.throws(() => validateTutorHumanReviewRatingsV2(cross))
  const nonFail = allPassRatings()
  nonFail[4] = { dimension: 'FACTUAL_CORRECTNESS', rating: 'CONCERN', not_applicable_reason: null, critical_findings: ['HR_FACTUAL_INCORRECTNESS'] }
  assert.throws(() => validateTutorHumanReviewRatingsV2(nonFail))
  assert.equal(Object.values(TUTOR_HUMAN_REVIEW_CRITICAL_FINDINGS_V2).flat().length, 10)
})

test('Workflow v2 transition matrix is exact and terminal states have no exits', () => {
  assert.deepEqual(TUTOR_HUMAN_REVIEW_TRANSITIONS_V2, {
    NONE: ['PREPARED'], PREPARED: ['FIRST_PASS_IN_PROGRESS', 'BLOCKED'], FIRST_PASS_IN_PROGRESS: ['FIRST_PASS_COMPLETE', 'BLOCKED'],
    FIRST_PASS_COMPLETE: ['ADJUDICATION_REQUIRED', 'SECOND_PASS_IN_PROGRESS', 'BLOCKED'], ADJUDICATION_REQUIRED: ['ADJUDICATION_IN_PROGRESS', 'BLOCKED'],
    ADJUDICATION_IN_PROGRESS: ['SECOND_PASS_IN_PROGRESS', 'BLOCKED'], SECOND_PASS_IN_PROGRESS: ['COMPLETE', 'BLOCKED'], COMPLETE: [], BLOCKED: [],
  })
  assert.equal(assertTutorHumanReviewTransition(null, 'PREPARED'), true)
  assert.throws(() => assertTutorHumanReviewTransition('COMPLETE', 'PREPARED'))
  assert.equal(deriveTutorHumanReviewStateFromArtifacts({ claim: {}, reviewItemRefs: ['item-one'] }), 'PREPARED')
  const first = { phase: 'FIRST_PASS', review_item_ref: 'item-one', reviewer_ref: 'reviewer-one', ratings: allPassRatings() }
  const second = { phase: 'FIRST_PASS', review_item_ref: 'item-one', reviewer_ref: 'reviewer-two', ratings: allPassRatings() }
  assert.equal(deriveTutorHumanReviewStateFromArtifacts({ claim: {}, reviewItemRefs: ['item-one'], firstPassSubmissions: [first, second] }), 'FIRST_PASS_COMPLETE')
  assert.equal(deriveTutorHumanReviewStateFromArtifacts({ claim: {}, reviewItemRefs: ['item-one'], firstPassSubmissions: [first, second], secondPassCompletion: { complete: true, first_pass_ratings_rewritten: false } }), 'SECOND_PASS_IN_PROGRESS')
})

test('raw First-Pass Grant submission API is removed and fail closed', () => {
  const { packet } = packetFixture()
  const authority = grant(packet)
  assert.throws(() => createTutorHumanReviewSubmission({ grant: authority, reviewItemRef: packet.items[0].review_item_ref, clientInput: { ratings: allPassRatings(), synthetic_note: null }, submittedAt: timestamp }), (error) => error.code === 'REVIEW_AUTHORITY_INVALID')
})

test('critical disagreement and PASS-to-FAIL disagreement require adjudication', () => {
  const first = { ratings: allPassRatings() }
  const secondRatings = allPassRatings()
  secondRatings[3] = { ...secondRatings[3], rating: 'CONCERN' }
  secondRatings[0] = { ...secondRatings[0], rating: 'FAIL' }
  assert.deepEqual(tutorHumanReviewRequiredAdjudications(first, { ratings: secondRatings }), ['CLARITY', 'COGNITIVE_WORK_PRESERVATION'])
})

test('reviewer 1, reviewer 2 and adjudicator independence is fail closed', () => {
  assert.equal(assertTutorHumanReviewerIndependence({ first_reviewer_refs: ['reviewer-one', 'reviewer-two'], adjudicator_ref: 'reviewer-three' }), true)
  assert.throws(() => assertTutorHumanReviewerIndependence({ first_reviewer_refs: ['same', 'same'] }), (error) => error.code === 'REVIEWER_INDEPENDENCE_VIOLATION')
  assert.throws(() => assertTutorHumanReviewerIndependence({ first_reviewer_refs: ['one', 'two'], adjudicator_ref: 'two' }), (error) => error.code === 'REVIEWER_INDEPENDENCE_VIOLATION')
})

test('client input cannot set role, refs, phase, source, tenant or authority', () => {
  const { packet } = packetFixture()
  assert.throws(() => createTutorHumanReviewSubmission({
    grant: grant(packet),
    reviewItemRef: packet.items[0].review_item_ref,
    clientInput: { ratings: allPassRatings(), synthetic_note: null, reviewer_ref: 'client-choice', tenant: 'tenant-x' },
    submittedAt: timestamp,
  }))
  assert.throws(() => createTutorHumanReviewSubmission({ grant: { ...grant(packet), authority_source: 'CLIENT' }, reviewItemRef: packet.items[0].review_item_ref, clientInput: { ratings: allPassRatings(), synthetic_note: null }, submittedAt: timestamp }))
})

test('direct First-Pass projection constructor cannot bypass Coordinator authority', () => {
  const { packet } = packetFixture()
  assert.throws(() => createTutorHumanReviewFirstPassProjection({ packet, fixtures, grant: grant(packet), reviewItemRef: packet.items[0].review_item_ref }), (error) => error.code === 'REVIEW_AUTHORITY_INVALID')
})

test('direct Second-Pass projection cannot trust a caller-provided First-Pass object', () => {
  const { packet } = packetFixture()
  const secondGrant = grant(packet, { phase: 'SECOND_PASS' })
  assert.throws(() => createTutorHumanReviewSecondPassProjection({ grant: secondGrant, reviewItemRef: packet.items[0].review_item_ref, firstPassSubmission: { phase: 'FIRST_PASS' } }), (error) => error.code === 'REVIEW_AUTHORITY_INVALID')
})

test('Production processes are forbidden from repository Review artifacts and no public route imports them', async () => {
  assert.equal(TUTOR_HUMAN_REVIEW_REPOSITORY_GOVERNANCE.production_process_access, false)
  assert.throws(() => createTutorHumanReviewLocalRunner({ environment: { NODE_ENV: 'production' }, coordinator: {} }))
  const routeFiles = (await import('node:fs/promises')).readdir(path.join(projectRoot, 'app', 'api'), { recursive: true })
  const names = await routeFiles
  const sources = await Promise.all(names.filter((name) => /\.(?:js|ts)$/u.test(name)).map((name) => readFile(path.join(projectRoot, 'app', 'api', name), 'utf8')))
  assert.equal(sources.some((source) => /human-review|human_review|review-packet/u.test(source)), false)
})

test('Student and Teacher DTO/API sources do not expose Human Review artifacts or governance refs', async () => {
  const roots = [path.join(projectRoot, 'app', 'api'), path.join(projectRoot, 'lib', 'server', 'learning-v2')]
  const files = []
  const fs = await import('node:fs/promises')
  for (const root of roots) {
    for (const name of await fs.readdir(root, { recursive: true })) {
      if (/\.(?:js|ts)$/u.test(name) && !name.includes('human-review')) files.push(path.join(root, name))
    }
  }
  const routeOrDtoFiles = files.filter((name) => /(?:route|dto|projection)/iu.test(name))
  const sources = await Promise.all(routeOrDtoFiles.map((name) => readFile(name, 'utf8')))
  assert.equal(sources.some((source) => /reviewer_ref|review_packet|sample_manifest_sha256/u.test(source)), false)
})

test('Human Review framework modules have no database or Learning Truth write path', async () => {
  const moduleRoot = path.join(projectRoot, 'lib', 'server', 'learning-v2', 'tutor')
  const fs = await import('node:fs/promises')
  const names = await fs.readdir(moduleRoot, { recursive: true })
  const reviewFiles = names.filter((name) => /human-review.*\.js$/u.test(name))
  const source = (await Promise.all(reviewFiles.map((name) => readFile(path.join(moduleRoot, name), 'utf8')))).join('\n')
  assert.doesNotMatch(source, /insertOne|updateOne|findOneAndUpdate|learning_attempts|learning_evidence|knowledge_state/u)
})

test('historical v8 claim, result and report hashes remain unchanged', async () => {
  const expected = new Map([
    ['docs/evaluation-results/tutor-paid-evaluation-v8-r1-r2-run-1-v1.claim.json', '88dd9d188bf858abfa72e47869ad2adc79828a4e8d7939edd7ad62045e99ce09'],
    ['docs/evaluation-results/tutor-paid-evaluation-v8-r1-r2-run-1-v1.result.json', '92b7546f60b1e6cd2e279b54feeb3a48bec539fbdde7f1856a81d085ac8bbc55'],
    ['docs/LEARNING_V2_HARDENING_H14B_V8_FULL_PAID_SYNTHETIC_R1_R2_EVALUATION_REPORT.md', '1eb9d7f95dd76e49f1b7eab286872f15dda2142a4de69b55f00d03c18f6f953b'],
  ])
  for (const [name, expectedHash] of expected) assert.equal(hash(await readFile(path.join(projectRoot, name))), expectedHash)
})

test('Human Review framework has no numeric quality thresholds', () => {
  assert.deepEqual(TUTOR_HUMAN_REVIEW_RUBRIC_V2.numeric_thresholds, [])
  assert.equal(TUTOR_HUMAN_REVIEW_RUBRIC_V2.nonabsolute_policy, 'NONE_ABSOLUTE')
  assert.equal(TUTOR_HUMAN_REVIEW_RUBRIC_V2.nonabsolute_status, 'REVIEW_UNCALIBRATED')
})

test('all Human Review outcomes and prospective contracts have no automatic approval effects', () => {
  assert.equal(TUTOR_HUMAN_QUALITY_OUTCOMES.length, 7)
  assert.equal(TUTOR_HUMAN_REVIEW_BLOCKED_REASONS.length, 11)
  assert.equal(deriveTutorHumanQualityOutcome({ state: 'COMPLETE', confirmedCriticalFail: true, hasFindings: true, ratingsSubmitted: 2 }), 'HUMAN_QUALITY_CRITICAL_FAIL_CONFIRMED')
  assert.equal(TUTOR_HUMAN_REVIEW_WORKFLOW_V2.approval_effect, 'NONE')
  assert.equal(TUTOR_REVIEW_CAPABLE_RESULT_CONTRACT.runtime_approval_effect, 'NONE')
  assert.equal(TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST.review_capture.governance.review_execution_authorized, false)
  assert.equal(TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST.evaluation_authorization.status, 'NOT_AUTHORIZED')
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.approved_for_runtime, false)
})

test('H12 v20 inventories Packet and Record as synthetic non-learning Development/Evaluation artifacts', () => {
  assert.equal(LEARNING_V2_DATA_INVENTORY_VERSION, 'learning-v2-data-inventory-v23')
  const packet = inventoryEntry('tutor_human_review_packet')
  const record = inventoryEntry('tutor_human_review_record')
  assert.equal(packet.learning_authority, 'none')
  assert.equal(record.learning_authority, 'none')
  assert.match(packet.retention.current_behavior, /180 days/u)
  assert.match(record.retention.current_behavior, /365 days/u)
  assert.equal(packet.production_blocker, true)
  assert.equal(record.production_blocker, true)
})

test('v9/v7/v5 is prospective, preserves v8 caps and remains non-executable', () => {
  const manifest = TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST
  assert.equal(manifest.eval_manifest_version, 'tutor-paid-evaluation-v9')
  assert.equal(manifest.evaluator_version, 'tutor-paid-evaluator-v7')
  assert.equal(manifest.result_contract_version, 'tutor-paid-evaluation-result-v5')
  assert.equal(manifest.max_http_calls, 120)
  assert.equal(manifest.max_cost, 10)
  assert.equal(manifest.evaluation_authorization.status, 'NOT_AUTHORIZED')
  assert.equal(manifest.review_capture.governance.review_status, 'NOT_REVIEWED')
})

test('Review execution artifacts use the frozen nested create-only repository layout', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'eduflow-hr-'))
  try {
    const result = await createTutorHumanReviewExecutionArtifact({ repositoryRoot: root, sourceRunId: 'source-run', reviewRef: 'review-one', kind: 'first-pass', submissionRef: 'submission-one', value: { bounded: true } })
    assert.equal(result.artifactPath, path.join(root, 'docs', 'evaluation-results', 'human-review', 'source-run', 'reviews', 'review-one', 'first-pass', 'submission-one.json'))
    await assert.rejects(() => createTutorHumanReviewExecutionArtifact({ repositoryRoot: root, sourceRunId: 'source-run', reviewRef: 'review-one', kind: 'first-pass', submissionRef: 'submission-one', value: { bounded: false } }), (error) => error.reasonCode === 'DUPLICATE_SUBMISSION')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('Review Record cannot be caller-constructed', () => {
  assert.throws(() => buildTutorHumanReviewRecord({}), (error) => error.code === 'ARTIFACT_DERIVATION_REQUIRED')
  assert.throws(() => verifyTutorHumanReviewRecord({}))
})
