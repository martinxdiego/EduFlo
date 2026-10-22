import { localHostingEnvironment } from './helpers/local-hosting-environment.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { evaluateRecommendationRules as evaluate, attachCandidate } from '../lib/server/learning-v2/recommendations/rules.js'
import { selectRecommendationTasks } from '../lib/server/learning-v2/recommendations/task-selector.js'
import { EVIDENCE_PROJECTION, ATTEMPT_PROJECTION, SESSION_PROJECTION, ACTIVITY_EVENT_TYPES, normalizedSession } from '../lib/server/learning-v2/recommendations/input-reader.js'
import { RECOMMENDATION_INDEXES } from '../lib/server/learning-v2/recommendations/repository.js'
import { recommendationApprovalSchema, recommendationEvaluationSchema, recommendationDismissalSchema, RECOMMENDATION_FRESHNESS_MS } from '../lib/server/learning-v2/contracts/phase5.js'
import { isLearningV2Phase5DevelopmentEnabled } from '../lib/server/learning-v2/feature-flags/learning-v2.js'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'
import { phase5Fixture, mutation } from './helpers/phase5-fixture.mjs'

const now = new Date('2026-08-27T10:00:00Z'); const f = phase5Fixture(now)
const state = { band: 'developing', confidence: .4, limitations: [] }
const run = (evidence, overrides = {}) => evaluate({ state, evidence, now, ...overrides })
const success = (task = f.tasks[0], date = now) => f.evidence(f.attempt(task, true, date))
const error = (task = f.tasks[0], date = now) => f.evidence(f.attempt(task, false, date))
const teacher = (claim, date = now) => ({ ...success(f.tasks[0], date), type: 'teacher_assessment', claim: { result: claim }, assessment_basis: 'single_observation', independence: { level: 'teacher_assessment' } })
const assisted = (level, date = now) => ({ ...success(f.tasks[0], date), type: 'correct_after_hint', hint_level: level, tutor_weight: .3, independence: { level: 'supported' } })
const support = () => ({ ...assisted(3), type: 'support_required', tutor_weight: 0, claim: { result: 'neutral' } })

test('Phase 5 flags default off, require base and Phase 4, and fail closed in production', () => {
  const enabled = { ...localHostingEnvironment, NODE_ENV: 'development', LEARNING_V2_ENABLED: 'true', LEARNING_V2_PHASE_4_ENABLED: 'true', LEARNING_V2_PHASE_5_ENABLED: 'true' }
  assert.equal(isLearningV2Phase5DevelopmentEnabled(enabled), true)
  for (const key of ['LEARNING_V2_ENABLED', 'LEARNING_V2_PHASE_4_ENABLED', 'LEARNING_V2_PHASE_5_ENABLED']) assert.equal(isLearningV2Phase5DevelopmentEnabled({ ...localHostingEnvironment, ...enabled, [key]: 'false' }), false)
  assert.equal(isLearningV2Phase5DevelopmentEnabled({ ...localHostingEnvironment,}), false)
  assert.equal(isLearningV2Phase5DevelopmentEnabled({ ...localHostingEnvironment, ...enabled, NODE_ENV: 'production' }), false)
  assert.equal(RECOMMENDATION_FRESHNESS_MS, 86400000)
})
test('strict requests reject all authority injection and unbounded input', () => {
  for (const schema of [recommendationApprovalSchema, recommendationEvaluationSchema, recommendationDismissalSchema]) {
    assert.equal(schema.safeParse(mutation()).success, true)
    for (const key of ['tenant_id', 'student_id', 'teacher_id', 'type', 'rule', 'priority', 'task', 'mastery', 'confidence', 'evidence', 'expiry', 'status']) assert.equal(schema.safeParse({ ...mutation(), [key]: 'injected' }).success, false)
    assert.equal(schema.safeParse(mutation('x'.repeat(161))).success, false)
  }
})
test('R1 exact teacher/automatic opposition wins priority; invalidated and neutral teacher evidence do not', () => {
  assert.equal(run([teacher('challenges'), success()]).rule_id, 'P5-R1')
  assert.equal(run([teacher('supports'), error()]).rule_id, 'P5-R1')
  assert.notEqual(run([{ ...teacher('challenges'), status: 'invalidated' }, success()]).rule_id, 'P5-R1')
  assert.notEqual(run([teacher('no_demonstration'), success()]).rule_id, 'P5-R1')
})
test('R2 requires canonical current Level-3 unresolved support; active tutoring vetoes every rule', () => {
  const item = support()
  assert.equal(run([item], { canonicalSupportIds: [item.evidence_id] }).rule_id, 'P5-R2')
  assert.equal(run([item]).type, 'NO_RECOMMENDATION')
  assert.equal(run([item], { canonicalSupportIds: [item.evidence_id], latestProcessAt: new Date(now.getTime() + 1) }).type, 'NO_RECOMMENDATION')
  assert.equal(run([item], { canonicalSupportIds: [item.evidence_id], activeTutor: true }).reason_codes[0], 'ACTIVE_TUTOR_SESSION')
  const old = { ...item, occurred_at: new Date(now.getTime() - 90 * 86400000 - 1) }
  assert.equal(run([old], { canonicalSupportIds: [item.evidence_id] }).type, 'NO_RECOMMENDATION')
  for (const later of [success(f.tasks[1], new Date(now.getTime() + 1)), teacher('supports', new Date(now.getTime() + 1))]) assert.notEqual(run([item, later], { canonicalSupportIds: [item.evidence_id] }).rule_id, 'P5-R2')
})
for (const confidence of [.399999, .40]) test(`R3 confidence boundary ${confidence}`, () => {
  const result = run([error(f.tasks[0]), error(f.tasks[1])], { state: { ...state, band: 'difficulty_signal', confidence } })
  assert.equal(result.type, confidence < .4 ? 'NO_RECOMMENDATION' : 'REVIEW_CONCEPT')
})
for (const delta of [-1, 0, 1]) test(`R3 inclusive 90-day boundary offset ${delta}ms`, () => {
  const time = new Date(now.getTime() - 90 * 86400000 + delta)
  assert.equal(run([error(f.tasks[0], time), error(f.tasks[1], time)], { state: { ...state, band: 'difficulty_signal' } }).type, delta < 0 ? 'NO_RECOMMENDATION' : 'REVIEW_CONCEPT')
})
test('R3 excludes one error, one task, assisted errors, old errors and later support', () => {
  const difficulty = { state: { ...state, band: 'difficulty_signal' } }
  for (const items of [[error()], [error(), error()], [{ ...error(), independence: { level: 'supported' } }, error(f.tasks[1])]]) assert.notEqual(run(items, difficulty).rule_id, 'P5-R3')
  for (const later of [success(f.tasks[2], new Date(now.getTime() + 1)), teacher('supports', new Date(now.getTime() + 1))]) assert.notEqual(run([error(), error(f.tasks[1]), later], difficulty).rule_id, 'P5-R3')
  assert.equal(run([error(), error(f.tasks[1]), teacher('supports')], difficulty).rule_id, 'P5-R1')
})
for (const level of [1, 2, 3]) test(`R4 assistance Level ${level} direct trigger`, () => {
  const result = run([assisted(level)])
  assert.equal(result.rule_id, level === 1 ? 'P5-R5' : 'P5-R4')
})
test('R4 latest support and recency, not all historic assisted success', () => {
  assert.notEqual(run([assisted(2, new Date(now.getTime() - 1)), success(f.tasks[1])]).rule_id, 'P5-R4')
  assert.notEqual(run([assisted(3, new Date(now.getTime() - 90 * 86400000 - 1))]).rule_id, 'P5-R4')
  assert.equal(run([assisted(2, new Date(now.getTime() - 90 * 86400000))]).rule_id, 'P5-R4')
})
test('R5 positive low confidence and single task; no fall-through when required task missing', () => {
  assert.equal(run([success(), success(f.tasks[1])], { state: { ...state, band: 'demonstrated', confidence: .699999 } }).rule_id, 'P5-R5')
  assert.equal(run([success()]).rule_id, 'P5-R5')
  const result = attachCandidate(run([assisted(2)]), { candidates: [], exclusion_codes: ['AMBIGUOUS_TASK_VERSION'] })
  assert.equal(result.type, 'NO_RECOMMENDATION'); assert.equal(result.failed_rule_id, 'P5-R4')
  assert.equal(Object.hasOwn(result, 'alternatives'), false)
})
test('neutral no evidence, teacher no demonstration, generic mixed, secure selected-response and diverse abstentions', () => {
  assert.equal(run([]).reason_codes[0], 'NO_ACTIVE_EVIDENCE')
  assert.equal(run([teacher('no_demonstration')]).reason_codes[0], 'TEACHER_NO_DEMONSTRATION_ONLY')
  assert.equal(run([success(), error(f.tasks[1])]).reason_codes[0], 'CONFLICTING_EVIDENCE_REQUIRES_REVIEW')
  const items = [success(), success(f.tasks[1])]
  assert.ok(run(items, { state: { band: 'secure', confidence: .7, limitations: ['selected_response_only'] } }).reason_codes.includes('TRANSFER_TASK_TYPE_UNSUPPORTED'))
  assert.equal(run(items, { state: { band: 'secure', confidence: .8, limitations: [] } }).reason_codes[0], 'CURRENT_SCOPE_SECURE_NO_CALIBRATED_CHALLENGE')
})

const select = (tasks, overrides = {}) => selectRecommendationTasks({ actor: f.actor, competencyRef: f.competencyRef, objectiveRef: f.objectiveRef, tasks, usedTaskKeys: new Set(), verifySource: async () => true, countPublishedVersions: async () => 1, countSourceBindings: async () => 1, ...overrides })
test('selector returns stable publication/id/version order, not difficulty, and pins no content', async () => {
  const selected = await select([...f.tasks].reverse().map((item, index) => ({ ...item, difficulty: index / 3 })))
  assert.deepEqual(selected.candidates.map((item) => item.task_id), f.tasks.map((item) => item.task_id))
  assert.equal(JSON.stringify(selected).includes('HIDDEN_ANSWER_CANARY'), false)
  const equal = f.tasks.map((item) => ({ ...item, published_at: now }))
  assert.deepEqual((await select(equal.reverse())).candidates.map((item) => item.task_id), f.tasks.map((item) => item.task_id).sort())
})
const selectorMutations = {
  'wrong tenant': { tenant_id: generateDomainId('ten') }, 'draft': { status: 'draft' }, 'retired': { status: 'retired' }, 'unpublished': { published_at: null },
  'wrong objective': { objective_refs: [{ objective_id: generateDomainId('obj'), version: 1 }] },
  'wrong competency': { competency_targets: [{ ...f.competencyRef, competency_id: generateDomainId('cmp'), role: 'primary' }] },
  'wrong framework version': { competency_targets: [{ ...f.competencyRef, framework_version: 'foreign', role: 'primary' }] },
  'unsupported type': { task_type: 'transfer' }, 'unsupported modality': { response_modality: 'text' }, 'unsupported source': { source: { kind: 'generated' } },
}
for (const [name, change] of Object.entries(selectorMutations)) test(`selector rejects ${name}`, async () => assert.equal((await select([{ ...f.tasks[0], ...change }])).candidates.length, 0))
for (const [name, overrides] of Object.entries({ 'attempted/evidenced task': { usedTaskKeys: new Set([`${f.tasks[0].task_id}:1`]) }, 'stale source': { verifySource: async () => false }, 'duplicate source binding': { countSourceBindings: async () => 2 }, 'ambiguous published versions': { countPublishedVersions: async () => 2 } })) test(`selector rejects ${name}`, async () => assert.equal((await select([f.tasks[0]], overrides)).candidates.length, 0))
test('Reflection completion normalizes to identical pedagogical activity; only non-Reflection envelopes are queried', () => {
  const base = { session_id: 's', outcome: 'correct_after_hint', status: 'active' }
  assert.deepEqual(normalizedSession(base), normalizedSession({ ...base, status: 'completed' }))
  assert.equal(ACTIVITY_EVENT_TYPES.some((type) => type.includes('REFLECTION') || type === 'TUTOR_SESSION_COMPLETED'), false)
  for (const projection of [EVIDENCE_PROJECTION, ATTEMPT_PROJECTION, SESSION_PROJECTION]) assert.doesNotMatch(JSON.stringify(projection), /teacher_note|invalidation|answer|reflection|last_hint|last_retry|model_config|prerequisite|difficulty/)
})
test('indexes enforce semantic and decision uniqueness and open-primary without TTL deletion', () => {
  assert.equal(RECOMMENDATION_INDEXES.filter((item) => item.unique).length, 4)
  assert.equal(RECOMMENDATION_INDEXES.some((item) => 'expireAfterSeconds' in item), false)
  assert.deepEqual(RECOMMENDATION_INDEXES.find((item) => item.name === 'recommendation_open_primary_unique').partialFilterExpression, { is_primary: true, status: 'presented' })
})
test('recommendation modules never import providers or learner mutation services; exactly three POST routes and bounded panel', async () => {
  const dir = new URL('../lib/server/learning-v2/recommendations/', import.meta.url)
  for (const file of await readdir(dir)) {
    const content = await readFile(new URL(file, dir), 'utf8')
    assert.doesNotMatch(content, /import[^\n]*(?:openai|gemini|phase[234]-services|assignment.*service|tutor.*service|reflection.*service)/i)
  }
  for (const route of ['teacher/students/[studentId]/competencies/[competencyId]/recommendations', 'teacher/recommendations/[recommendationId]/approve', 'teacher/recommendations/[recommendationId]/dismiss']) {
    const content = await readFile(new URL(`../app/api/v2/learning/${route}/route.js`, import.meta.url), 'utf8')
    assert.match(content, /await params/); assert.match(content, /handleRecommendationRoute/); assert.match(content, /export async function POST/)
  }
  const panel = await readFile(new URL('../components/learning-v2/teacher/RecommendationPanel.jsx', import.meta.url), 'utf8')
  assert.match(panel, /aria-live="polite"/); assert.match(panel, /role="alert"/); assert.match(panel, /focus-visible/); assert.match(panel, /TechnicalProvenanceDisclosure/)
  assert.doesNotMatch(panel, /setInterval|dangerouslySetInnerHTML/)
  assert.match(panel, /Eine Freigabe weist keine Arbeit zu/)
})
