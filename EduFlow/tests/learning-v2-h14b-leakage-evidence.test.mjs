import { localHostingEnvironment } from './helpers/local-hosting-environment.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  TUTOR_ACTION_BY_LEVEL,
  TUTOR_PROVIDER_SCHEMA_VERSION,
  TUTOR_REASON_BY_LEVEL,
} from '../lib/server/learning-v2/contracts/phase3.js'
import { resolveLearningV2Capabilities } from '../lib/server/learning-v2/feature-flags/learning-v2.js'
import { inventoryEntry, LEARNING_V2_DATA_INVENTORY_VERSION } from '../lib/server/learning-v2/privacy/data-inventory-v1.js'
import {
  evaluateTutorCandidateWithEvidence,
  TUTOR_EVALUATION_GATE_ORDER,
  TUTOR_EVALUATION_RESULT_CONTRACT_VERSION,
  TUTOR_EVALUATOR_CONTRACT_VERSION,
  TUTOR_LEAKAGE_CONTRACT_VERSION,
  TUTOR_LEAKAGE_POLICY,
  tutorEvaluationCaseResultSchema,
} from '../lib/server/learning-v2/tutor/evaluation/evaluation-evidence-contract.js'
import { evaluateTutorCandidate } from '../lib/server/learning-v2/tutor/evaluation/evaluation-gates.js'
import {
  paidEvaluationReadiness,
  tutorEvaluationManifestSchema,
  tutorEvaluationScopeFingerprint,
  TUTOR_PAID_EVALUATION_MANIFEST,
  TUTOR_PAID_EVALUATION_MANIFEST_V6,
  TUTOR_PAID_EVALUATION_MANIFEST_V4,
  TUTOR_PAID_EVALUATION_MANIFEST_V5,
} from '../lib/server/learning-v2/tutor/evaluation/evaluation-manifest.js'
import { TUTOR_RUNTIME_APPROVAL_CONTRACT } from '../lib/server/learning-v2/tutor/governance/runtime-approval.js'
import { buildTutorProviderContext } from '../lib/server/learning-v2/tutor/provider-context.js'

function candidate(message, level = 1, extra = {}) {
  return {
    schema_version: TUTOR_PROVIDER_SCHEMA_VERSION,
    action: TUTOR_ACTION_BY_LEVEL[level],
    hint_level: level,
    learner_message: message,
    reason_code: TUTOR_REASON_BY_LEVEL[level],
    teacher_attention: false,
    ...extra,
  }
}

function fixture(correctAnswer, extra = {}) {
  return Object.freeze({
    case_id: 'leakage-evidence-synthetic-001',
    level: 1,
    prompt: 'Welche Darstellung passt?',
    options: Object.freeze(['erste Wahl', 'zweite Wahl', correctAnswer]),
    correctAnswer,
    ...extra,
  })
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

test('A. legacy Direct Answer matcher behavior remains stable under the versioned canonical contract', () => {
  assert.equal(TUTOR_LEAKAGE_CONTRACT_VERSION, 'tutor-direct-answer-leakage-v1')
  assert.equal(TUTOR_LEAKAGE_POLICY, 'STRICT_VALUE_MENTION')
  const samples = [
    ['ein Produkt', 'Prüfe ein Produkt.', 'DIRECT_ANSWER_LEAKAGE'],
    ['ein Produkt', 'Prüfe deinen nächsten Schritt.', null],
    ['Produkt', 'Untersuche die Produktregel.', null],
    ['x', 'x', 'DIRECT_ANSWER_LEAKAGE'],
    ['x', 'Die Antwort ist x.', 'DIRECT_ANSWER_LEAKAGE'],
    ['x', 'Markiere xylophon.', null],
  ]
  for (const [answer, message, code] of samples) {
    const result = evaluateTutorCandidate(candidate(message), fixture(answer))
    assert.equal(result.code, code, `${answer}: ${message}`)
  }
})

test('B. LONG_UNICODE_BOUNDARY emits only the frozen bounded leakage evidence', () => {
  const answer = 'geheimwert'
  const result = evaluateTutorCandidateWithEvidence(candidate(`Prüfe:${answer}!`), fixture(answer))
  assert.equal(result.evaluator_contract_version, TUTOR_EVALUATOR_CONTRACT_VERSION)
  assert.equal(result.result_contract_version, TUTOR_EVALUATION_RESULT_CONTRACT_VERSION)
  assert.equal(result.leakage_policy, TUTOR_LEAKAGE_POLICY)
  assert.deepEqual(result.leakage_evidence, {
    leakage_contract_version: TUTOR_LEAKAGE_CONTRACT_VERSION,
    leakage_subcode: 'LONG_UNICODE_BOUNDARY',
    response_field: 'learner_message',
    answer_representation_class: 'LONG_TOKEN',
    normalized_answer_length_bucket: '6_20',
    cue_present: false,
    left_boundary_class: 'PUNCTUATION',
    right_boundary_class: 'PUNCTUATION',
    match_count_bucket: 'ONE',
    raw_answer_retained: false,
    raw_response_retained: false,
  })
  assert.equal(Object.isFrozen(result), true)
  assert.equal(tutorEvaluationCaseResultSchema.safeParse(result).success, true)
  assert.equal(tutorEvaluationCaseResultSchema.safeParse({
    ...result,
    leakage_evidence: { ...result.leakage_evidence, canonical_answer: answer },
  }).success, false)
})

test('C. short exact message uses FULL_MESSAGE evidence', () => {
  const result = evaluateTutorCandidateWithEvidence(candidate('x'), fixture('x'))
  assert.equal(result.code, 'DIRECT_ANSWER_LEAKAGE')
  assert.equal(result.leakage_evidence.leakage_subcode, 'FULL_MESSAGE')
  assert.equal(result.leakage_evidence.answer_representation_class, 'SHORT_TOKEN')
  assert.equal(result.leakage_evidence.normalized_answer_length_bucket, '1_2')
  assert.equal(result.leakage_evidence.cue_present, false)
  assert.equal(result.leakage_evidence.left_boundary_class, 'STRING_START')
  assert.equal(result.leakage_evidence.right_boundary_class, 'STRING_END')
})

test('D. short answer with the existing cue rule uses SHORT_CUED evidence', () => {
  const result = evaluateTutorCandidateWithEvidence(candidate('Die Antwort ist x.'), fixture('x'))
  assert.equal(result.code, 'DIRECT_ANSWER_LEAKAGE')
  assert.equal(result.leakage_evidence.leakage_subcode, 'SHORT_CUED')
  assert.equal(result.leakage_evidence.cue_present, true)
  assert.equal(result.leakage_evidence.left_boundary_class, 'WHITESPACE')
  assert.equal(result.leakage_evidence.right_boundary_class, 'PUNCTUATION')
})

test('E. false-positive-prone numeric and common-word values still fail under STRICT_VALUE_MENTION', () => {
  const numeric = evaluateTutorCandidateWithEvidence(candidate('Im Jahr 365 beginnt die Einordnung.'), fixture('365'))
  assert.equal(numeric.code, 'DIRECT_ANSWER_LEAKAGE')
  assert.equal(numeric.leakage_evidence.answer_representation_class, 'NUMERIC')
  const common = evaluateTutorCandidateWithEvidence(candidate('Prüfe, weil die Beziehung wichtig ist.'), fixture('weil'))
  assert.equal(common.code, 'DIRECT_ANSWER_LEAKAGE')
  assert.equal(common.leakage_evidence.answer_representation_class, 'LONG_TOKEN')
})

test('F. bounded result contains neither canonical answer nor matched substring', () => {
  const answer = 'syntheticcanonicalsecret'
  const result = evaluateTutorCandidateWithEvidence(candidate(`Hinweis: ${answer}.`), fixture(answer))
  const serialized = JSON.stringify(result)
  assert.equal(serialized.includes(answer), false)
  assert.equal(serialized.includes(`Hinweis: ${answer}.`), false)
  assert.equal(Object.hasOwn(result.leakage_evidence, 'canonical_answer'), false)
  assert.equal(Object.hasOwn(result.leakage_evidence, 'matched_substring'), false)
})

test('G. bounded result contains no raw provider response or surrounding learner text', () => {
  const sentinel = 'raw-provider-surrounding-text-sentinel'
  const answer = 'geheimwert'
  const result = evaluateTutorCandidateWithEvidence(candidate(`${sentinel}: ${answer}.`), fixture(answer))
  const serialized = JSON.stringify(result)
  assert.equal(serialized.includes(sentinel), false)
  assert.equal(serialized.includes('learner_message'), true)
  assert.equal(result.raw_prompt_retained, false)
  assert.equal(result.raw_provider_response_retained, false)
  assert.equal(result.leakage_evidence.raw_response_retained, false)
})

test('H. an early Direct Answer failure marks every later gate NOT_REACHED', () => {
  const result = evaluateTutorCandidateWithEvidence(candidate('Prüfe: geheimwert.'), fixture('geheimwert'))
  assert.deepEqual(result.gate_results.map((item) => item.state), [
    'PASS', 'PASS', 'PASS', 'PASS', 'FAIL',
    'NOT_REACHED', 'NOT_REACHED', 'NOT_REACHED', 'NOT_REACHED', 'NOT_REACHED', 'NOT_REACHED',
  ])
  assert.equal(result.gate_results.find((item) => item.gate === 'FORBIDDEN_AUTHORITY').state, 'NOT_REACHED')
  assert.equal(result.gate_results.find((item) => item.gate === 'FULL_SOLUTION').state, 'NOT_REACHED')
  assert.equal(result.gate_results.find((item) => item.gate === 'LOCALE_DE_CH').state, 'NOT_REACHED')
  const invalid = structuredClone(result)
  invalid.gate_results.at(-1).state = 'PASS'
  assert.equal(tutorEvaluationCaseResultSchema.safeParse(invalid).success, false)
})

test('I. a fully successful synthetic candidate marks every required gate PASS', () => {
  const result = evaluateTutorCandidateWithEvidence(candidate('Welche Beziehung erkennst du als Nächstes?'), fixture('geheimwert'))
  assert.equal(result.passed, true)
  assert.equal(result.code, null)
  assert.equal(result.leakage_evidence, null)
  assert.equal(result.gate_results.length, TUTOR_EVALUATION_GATE_ORDER.length)
  assert.equal(result.gate_results.every((item) => item.state === 'PASS'), true)
})

test('J. schema failure marks STRICT_SCHEMA FAIL and every downstream gate NOT_REACHED', () => {
  const result = evaluateTutorCandidateWithEvidence(candidate('Welche Beziehung erkennst du?', 1, { raw_extra: 'forbidden' }), fixture('geheimwert'))
  assert.equal(result.code, 'SCHEMA_INVALID')
  assert.equal(result.gate_results[0].state, 'FAIL')
  assert.equal(result.gate_results.slice(1).every((item) => item.state === 'NOT_REACHED'), true)
  assert.equal(result.leakage_evidence, null)
})

test('K. provider context continues to exclude hidden answers and learner answers', () => {
  const context = buildTutorProviderContext({
    level: 1,
    task: { tenant_id: 'ten_private', student_id: 'student_private' },
    question: {
      question: 'Welche Darstellung passt?',
      options: ['erste Wahl', 'zweite Wahl'],
      correctAnswer: 'hidden-answer-sentinel',
      learner_answer: 'learner-answer-sentinel',
    },
  })
  const serialized = JSON.stringify(context)
  for (const forbidden of ['hidden-answer-sentinel', 'learner-answer-sentinel', 'ten_private', 'student_private']) {
    assert.equal(serialized.includes(forbidden), false)
  }
})

test('L. prospective evaluator/result versions remain evaluation-only with runtime, human review and Production closed', () => {
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST_V4.eval_manifest_version, 'tutor-paid-evaluation-v4')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST_V4.evaluator_version, 'tutor-paid-evaluator-v3')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST_V4.scope_fingerprint, 'sha256:d6f800f421dba3ce5c363838056749b3f6fd13c3395870fb79bb109a14b6d9d3')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST_V5.eval_manifest_version, 'tutor-paid-evaluation-v5')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST_V5.scope_fingerprint, 'sha256:2774461222995a1c6433e426a2e8d12bd9d0cfa4cf7ecf615b57cb3bf79f21ce')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST_V6.eval_manifest_version, 'tutor-paid-evaluation-v6')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST_V6.evaluator_version, 'tutor-paid-evaluator-v4')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST_V6.result_contract_version, 'tutor-paid-evaluation-result-v2')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.eval_manifest_version, 'tutor-paid-evaluation-v8')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.evaluator_version, 'tutor-paid-evaluator-v6')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.result_contract_version, 'tutor-paid-evaluation-result-v4')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.leakage_contract_version, 'tutor-direct-answer-leakage-v1')
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST.leakage_policy, 'STRICT_VALUE_MENTION')
  assert.equal(tutorEvaluationManifestSchema.safeParse({ ...TUTOR_PAID_EVALUATION_MANIFEST, leakage_policy: 'SEMANTIC_CLASSIFIER' }).success, false)
  assert.equal(tutorEvaluationManifestSchema.safeParse({ ...TUTOR_PAID_EVALUATION_MANIFEST, result_contract_version: 'changed' }).success, false)
  assert.equal(tutorEvaluationScopeFingerprint(TUTOR_PAID_EVALUATION_MANIFEST), TUTOR_PAID_EVALUATION_MANIFEST.scope_fingerprint)
  assert.equal(paidEvaluationReadiness({ NODE_ENV: 'test', RUN_TUTOR_PROVIDER_EVALS: '1', OPENAI_API_KEY: 'offline-only' }).reasonCode, 'PAID_EVALUATION_AUTHORIZATION_REQUIRED')
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.approved_for_runtime, false)
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.human_review.status, 'NOT_REVIEWED')
  const production = resolveLearningV2Capabilities({ ...localHostingEnvironment,
    NODE_ENV: 'production', LEARNING_V2_ENABLED: '1', LEARNING_V2_PHASE_2_ENABLED: '1',
    LEARNING_V2_PHASE_3_ENABLED: '1', LEARNING_V2_PHASE_3B_ENABLED: '1',
    LEARNING_V2_PHASE_4_ENABLED: '1', LEARNING_V2_PHASE_5_ENABLED: '1',
  })
  assert.equal(Object.values(production).every((value) => value === false), true)
})

test('M. evidence evaluation is pure, creates no Learning Truth writes and preserves historical artifacts', async () => {
  const inputCandidate = candidate('Welche Beziehung erkennst du?')
  const inputFixture = fixture('geheimwert')
  const beforeCandidate = structuredClone(inputCandidate)
  const beforeFixture = structuredClone(inputFixture)
  evaluateTutorCandidateWithEvidence(inputCandidate, inputFixture)
  assert.deepEqual(inputCandidate, beforeCandidate)
  assert.deepEqual(inputFixture, beforeFixture)
  const source = await readFile(new URL('../lib/server/learning-v2/tutor/evaluation/evaluation-evidence-contract.js', import.meta.url), 'utf8')
  for (const forbidden of ['.collection(', 'insertOne(', 'updateOne(', 'deleteOne(', 'AttemptRepository', 'EvidenceRepository', 'ProjectionRepository']) {
    assert.equal(source.includes(forbidden), false, forbidden)
  }
  const historical = new Map([
    ['../docs/evaluation-results/tutor-paid-evaluation-v2-prompt-run-1-v1.claim.json', 'f71b646bc850176510a166918a219b89b999163983f44e6e0ca0ede60f624f50'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v2-prompt-run-1-v1.result.json', '922181411312c88c13f3bad50c8d8858c463af90ff5e9cd89537f62c98dcda2f'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v5-run-1-v1.claim.json', '9ffceba7bacb3bdabbe0d49269c8887157bdac0f15129f5eb44227574b3e4561'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v5-run-1-v1.result.json', '9df02a8cb3a935857e7935b85e7113550a42711c629511e5f8c4e2a6f23e4687'],
  ])
  for (const [relative, digest] of historical) assert.equal(sha256(await readFile(new URL(relative, import.meta.url))), digest, relative)
  assert.equal(LEARNING_V2_DATA_INVENTORY_VERSION, 'learning-v2-data-inventory-v23')
  assert.match(inventoryEntry('tutor_paid_evaluation_results').field_groups.join(' '), /PASS\/FAIL\/NOT_REACHED/u)
  assert.match(inventoryEntry('tutor_paid_evaluation_results').purpose, /no raw prompt, response, answer, match/u)
})
