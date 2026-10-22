import { localHostingEnvironment } from './helpers/local-hosting-environment.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { resolveLearningV2Capabilities } from '../lib/server/learning-v2/feature-flags/learning-v2.js'
import { tutorSyntheticEvalCases } from '../lib/server/learning-v2/tutor/eval-fixtures.js'
import { localTutorFallback } from '../lib/server/learning-v2/tutor/fallback-registry.js'
import {
  TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
  TUTOR_CANONICAL_SAFETY_GATE_ORDER,
  TUTOR_STRICT_VALUE_MENTION_POLICY,
} from '../lib/server/learning-v2/tutor/canonical-safety-gates.js'
import {
  ConservativeEvaluationBudget,
  TUTOR_EVALUATION_ACCOUNTING_CONTRACT_VERSION,
} from '../lib/server/learning-v2/tutor/evaluation/evaluation-accounting-contract.js'
import {
  tutorEvaluationScopeFingerprint,
  TUTOR_PAID_EVALUATION_MANIFEST,
  TUTOR_PAID_EVALUATION_MANIFEST_V7,
} from '../lib/server/learning-v2/tutor/evaluation/evaluation-manifest.js'
import { runSyntheticTutorEvaluationVerification } from '../lib/server/learning-v2/tutor/evaluation/paid-evaluation.js'
import { TUTOR_FALLBACK_RATE_THRESHOLD_STATUS } from '../lib/server/learning-v2/tutor/evaluation/system-safety-evaluation-contract.js'
import { TUTOR_RUNTIME_APPROVAL_CONTRACT } from '../lib/server/learning-v2/tutor/governance/runtime-approval.js'
import {
  TUTOR_PROMPT_V1_DIGEST,
  TUTOR_PROMPT_V2_DIGEST,
  TUTOR_PROMPT_V3_DIGEST,
} from '../lib/server/learning-v2/tutor/prompt-registry.js'
import { assertPublicV2RouteManifest } from '../scripts/learning-v2-release/route-discovery.mjs'
import {
  createDisposableNextDirectory,
  removeDisposableNextDirectory,
  syntheticEnvironment,
} from '../scripts/learning-v2-release/runner-core.mjs'
import { PUBLIC_V2_ROUTES, routeMethodCount } from '../scripts/learning-v2-release/routes-v1.mjs'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const fixtures = tutorSyntheticEvalCases()
const exactUsage = Object.freeze({ input_tokens: 300, output_tokens: 100, total_tokens: 400 })

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

function offlineProvider(behavior) {
  let calls = 0
  return {
    syntheticEvaluationDouble: true,
    available() { return true },
    async generate(context, options) {
      calls += 1
      await options.beforeTransport()
      return behavior({ call: calls, context })
    },
    calls() { return calls },
  }
}

function safeResult(context, usage = exactUsage) {
  return { candidate: localTutorFallback(context.decision.hint_level), usage }
}

test('accepted prospective tuple is v8/v6/v4/accounting-v1 and is not a v7 continuation or authorization', () => {
  const manifest = TUTOR_PAID_EVALUATION_MANIFEST
  assert.equal(manifest.eval_manifest_version, 'tutor-paid-evaluation-v8')
  assert.equal(manifest.evaluator_version, 'tutor-paid-evaluator-v6')
  assert.equal(manifest.result_contract_version, 'tutor-paid-evaluation-result-v4')
  assert.equal(manifest.accounting_contract_version, 'tutor-paid-evaluation-accounting-v1')
  assert.equal(manifest.canonical_safety_contract_version, TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION)
  assert.equal(manifest.prompt_version, 'tutor-guidance-v3')
  assert.equal(manifest.leakage_policy, TUTOR_STRICT_VALUE_MENTION_POLICY)
  assert.equal(manifest.scope_fingerprint, 'sha256:223b56b37707171dddb94ecdd4f3e32f689159ce1ffb2219debac477e67cba6c')
  assert.equal(tutorEvaluationScopeFingerprint(manifest), manifest.scope_fingerprint)
  assert.equal(manifest.supersedes_manifest_version, 'tutor-paid-evaluation-v7')
  assert.equal(manifest.evaluation_authorization.status, 'NOT_AUTHORIZED')
  assert.equal(TUTOR_FALLBACK_RATE_THRESHOLD_STATUS, 'PRODUCT_DECISION_PENDING')
})

test('trustworthy usage applies exact frozen pricing and adds no unknown reservation', () => {
  const budget = new ConservativeEvaluationBudget(TUTOR_PAID_EVALUATION_MANIFEST)
  assert.equal(budget.beforeCall(), true)
  budget.markTransport()
  budget.recordUsage({ input_tokens: 1_000, output_tokens: 100, total_tokens: 1_100 })
  const snapshot = budget.snapshot()
  assert.equal(snapshot.actual_cost_status, 'COMPLETE')
  assert.equal(snapshot.actual_cost, 0.0032)
  assert.equal(snapshot.known_actual_cost, 0.0032)
  assert.equal(snapshot.known_actual_input_tokens, 1_000)
  assert.equal(snapshot.known_actual_output_tokens, 100)
  assert.equal(snapshot.known_actual_total_tokens, 1_100)
  assert.equal(snapshot.unknown_usage_call_count, 0)
  assert.equal(snapshot.conservative_unknown_usage_cost, 0)
  assert.equal(snapshot.conservative_total_cost_upper_bound, 0.0032)
})

test('mixed exact-unknown-exact-unknown accounting is monotonic and never labels the upper bound actual', () => {
  const budget = new ConservativeEvaluationBudget(TUTOR_PAID_EVALUATION_MANIFEST)
  const snapshots = []
  const exact = (usage) => {
    assert.equal(budget.beforeCall(), true)
    budget.markTransport()
    budget.recordUsage(usage)
    snapshots.push(budget.snapshot())
  }
  const unknown = () => {
    assert.equal(budget.beforeCall(), true)
    budget.markTransport()
    budget.recordUnknownUsage()
    snapshots.push(budget.snapshot())
  }
  exact({ input_tokens: 1_000, output_tokens: 100, total_tokens: 1_100 })
  unknown()
  exact({ input_tokens: 500, output_tokens: 50, total_tokens: 550 })
  unknown()

  const final = snapshots.at(-1)
  assert.equal(final.actual_cost_status, 'PARTIAL_UNKNOWN')
  assert.equal(final.actual_cost, null)
  assert.equal(final.known_actual_cost, 0.0048)
  assert.equal(final.conservative_unknown_usage_cost, 0.16384)
  assert.equal(final.conservative_total_cost_upper_bound, 0.16864)
  assert.equal(final.remaining_cost_budget_upper_bound, 9.83136)
  assert.equal(final.known_actual_input_tokens, 1_500)
  assert.equal(final.known_actual_output_tokens, 150)
  assert.equal(final.known_actual_total_tokens, 1_650)
  assert.equal(final.unknown_usage_call_count, 2)
  assert.equal(final.unknown_usage_reserved_input_tokens, 80_000)
  assert.equal(final.unknown_usage_reserved_output_tokens, 320)
  assert.equal(final.unknown_usage_reserved_total_tokens, 80_320)
  for (let index = 1; index < snapshots.length; index += 1) {
    assert.ok(snapshots[index].unknown_usage_call_count >= snapshots[index - 1].unknown_usage_call_count)
    assert.ok(snapshots[index].conservative_unknown_usage_cost >= snapshots[index - 1].conservative_unknown_usage_cost)
    assert.ok(snapshots[index].conservative_total_cost_upper_bound >= snapshots[index - 1].conservative_total_cost_upper_bound)
  }
  assert.notEqual(final.actual_cost, final.conservative_total_cost_upper_bound)
})

test('all accepted authorization caps allow exactly 120 full reservations and reject call 121 without off-by-one', () => {
  const budget = new ConservativeEvaluationBudget(TUTOR_PAID_EVALUATION_MANIFEST)
  for (let call = 1; call <= 120; call += 1) {
    assert.equal(budget.beforeCall(), true, `reservation ${call}`)
    budget.markTransport()
    budget.recordUnknownUsage()
  }
  const boundary = budget.snapshot()
  assert.equal(boundary.http_calls, 120)
  assert.equal(boundary.authorization_input_tokens_upper_bound, 4_800_000)
  assert.equal(boundary.authorization_output_tokens_upper_bound, 19_200)
  assert.equal(boundary.authorization_total_tokens_upper_bound, 4_819_200)
  assert.equal(boundary.conservative_total_cost_upper_bound, 9.8304)
  assert.equal(boundary.unknown_usage_call_count, 120)
  assert.equal(budget.beforeCall(), false)
  assert.equal(budget.snapshot().http_calls, 120)
})

test('each cap independently blocks the next fixture before a second provider invocation', async () => {
  const capVariants = [
    ['HTTP', { max_http_calls: 1 }],
    ['INPUT', { max_input_tokens: 40_000 }],
    ['OUTPUT', { max_output_tokens: 160 }],
    ['TOTAL', { max_total_tokens: 40_160 }],
    ['COST', { max_cost: 0.08192 }],
  ]
  for (const [name, override] of capVariants) {
    const manifest = { ...TUTOR_PAID_EVALUATION_MANIFEST, ...override }
    const provider = offlineProvider(() => { throw new DOMException(`${name}-timeout`, 'AbortError') })
    const result = await runSyntheticTutorEvaluationVerification({ manifest, provider, fixtures })
    assert.equal(result.status, 'FAIL', name)
    assert.equal(result.reason_code, 'BUDGET_CAP_REACHED_BEFORE_TRANSPORT', name)
    assert.equal(provider.calls(), 1, name)
    assert.equal(result.budget.http_calls, 1, name)
    assert.equal(result.budget.unknown_usage_call_count, 1, name)
    assert.equal(result.metrics.completed_case_count, 1, name)
    assert.equal(result.metrics.r1_provider_candidate_quality.provider_failure_count, 1, name)
    assert.equal(result.metrics.r1_provider_candidate_quality.provider_candidate_pass_count, 0, name)
    assert.equal(result.metrics.r2_final_tutor_system_safety.final_safe_count, 1, name)
    assert.equal(result.retries, 0, name)
    assert.equal(result.provider_failover, false, name)
  }
})

test('deterministic timeout and missing-usage cases continue with one reservation each and no retry', async () => {
  const provider = offlineProvider(({ call, context }) => {
    if ([2, 5].includes(call)) throw new DOMException(`timeout-${call}`, 'AbortError')
    if ([4, 6].includes(call)) return safeResult(context, null)
    return safeResult(context)
  })
  const result = await runSyntheticTutorEvaluationVerification({
    manifest: TUTOR_PAID_EVALUATION_MANIFEST,
    provider,
    fixtures,
  })
  assert.equal(result.status, 'PASS_TECHNICAL')
  assert.equal(provider.calls(), 120)
  assert.equal(result.retries, 0)
  assert.equal(result.provider_failover, false)
  assert.equal(result.metrics.completed_case_count, 120)
  assert.equal(result.metrics.r1_provider_candidate_quality.provider_candidate_pass_count, 116)
  assert.equal(result.metrics.r1_provider_candidate_quality.provider_failure_count, 4)
  assert.deepEqual(result.metrics.r1_provider_candidate_quality.rejection_reason_distribution, {
    PROVIDER_TIMEOUT: 2,
    PROVIDER_USAGE_MISSING: 2,
  })
  assert.equal(result.metrics.r1_provider_candidate_quality.fallback_count, 4)
  assert.equal(result.metrics.r2_final_tutor_system_safety.final_safe_count, 120)
  assert.equal(result.metrics.r2_final_tutor_system_safety.system_safety_pass, true)
  assert.equal(result.budget.actual_cost_status, 'PARTIAL_UNKNOWN')
  assert.equal(result.budget.actual_cost, null)
  assert.equal(result.budget.known_actual_cost, 0.2088)
  assert.equal(result.budget.unknown_usage_call_count, 4)
  assert.equal(result.budget.conservative_unknown_usage_cost, 0.32768)
  assert.equal(result.budget.conservative_total_cost_upper_bound, 0.53648)
})

test('rejected provider text is never learner-visible and canonical fallback safety stays unchanged', async () => {
  const canary = 'NEVER-RETAIN-THIS Mastery ist sicher bestimmt'
  const provider = offlineProvider(({ call, context }) => {
    if (call !== 1) return safeResult(context)
    return {
      candidate: { ...localTutorFallback(context.decision.hint_level), learner_message: canary },
      usage: exactUsage,
    }
  })
  const result = await runSyntheticTutorEvaluationVerification({
    manifest: TUTOR_PAID_EVALUATION_MANIFEST,
    provider,
    fixtures,
  })
  assert.equal(result.status, 'PASS_TECHNICAL')
  assert.equal(result.canonical_safety_contract_version, 'tutor-canonical-safety-gates-v1')
  assert.equal(TUTOR_CANONICAL_SAFETY_GATE_ORDER.length, 11)
  assert.equal(result.metrics.r1_provider_candidate_quality.provider_candidate_fail_count, 1)
  assert.deepEqual(result.metrics.r1_provider_candidate_quality.rejection_reason_distribution, { FORBIDDEN_AUTHORITY: 1 })
  assert.equal(result.case_results[0].final_outcome.status, 'LOCAL_FALLBACK_ACCEPTED')
  assert.equal(result.case_results[0].final_outcome.gate_results.every(({ state }) => state === 'PASS'), true)
  assert.equal(result.case_results[0].provider_candidate.raw_provider_response_retained, false)
  assert.equal(result.case_results[0].final_outcome.raw_output_retained, false)
  assert.equal(JSON.stringify(result).includes(canary), false)
})

test('accounting verification has no Learning Truth writes or governance authority', async () => {
  const source = await readFile(new URL('../lib/server/learning-v2/tutor/evaluation/paid-evaluation.js', import.meta.url), 'utf8')
  for (const forbidden of ['getDatabase(', '.collection(', 'insertOne(', 'updateOne(', 'deleteOne(', 'attempts', 'evidence_events', 'knowledge_states']) {
    assert.equal(source.includes(forbidden), false, forbidden)
  }
  const approvalBefore = JSON.stringify(TUTOR_RUNTIME_APPROVAL_CONTRACT)
  const provider = offlineProvider(({ context }) => safeResult(context))
  const result = await runSyntheticTutorEvaluationVerification({ manifest: TUTOR_PAID_EVALUATION_MANIFEST, provider, fixtures })
  assert.equal(result.learning_truth_mutations, 0)
  assert.equal(result.runtime_approval_changed, false)
  assert.equal(result.human_approval_changed, false)
  assert.equal(JSON.stringify(TUTOR_RUNTIME_APPROVAL_CONTRACT), approvalBefore)
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.approved_for_runtime, false)
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.human_review.status, 'NOT_REVIEWED')
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.human_review.reviewer_ref, null)
  assert.equal(TUTOR_RUNTIME_APPROVAL_CONTRACT.human_review.review_ref, null)
  const production = resolveLearningV2Capabilities({ ...localHostingEnvironment,
    NODE_ENV: 'production', LEARNING_V2_ENABLED: '1', LEARNING_V2_PHASE_2_ENABLED: '1',
    LEARNING_V2_PHASE_3_ENABLED: '1', LEARNING_V2_PHASE_3B_ENABLED: '1',
    LEARNING_V2_PHASE_4_ENABLED: '1', LEARNING_V2_PHASE_5_ENABLED: '1',
  })
  assert.equal(Object.values(production).every((value) => value === false), true)
})

test('all historical paid artifacts and prompt digests remain immutable and v7 stays PARTIAL_RUN', async () => {
  const expected = new Map([
    ['../docs/evaluation-results/tutor-paid-diagnostic-probe-v1.claim.json', '1c97cfd5119234556f3a0f4e88f240482c2e3b1f513f2ffd6f37bbb0d042674d'],
    ['../docs/evaluation-results/tutor-paid-diagnostic-probe-v1.result.json', '723532484bdf4e9c4858f5546c9f7df6b03a93d0ae460ab380352787e2869e06'],
    ['../docs/evaluation-results/tutor-paid-evaluation-run-2-v1.claim.json', '54a3544773e93af6ed39d33921e7f3e5fb88a07b4d77a9fd0b41a35a058e5803'],
    ['../docs/evaluation-results/tutor-paid-evaluation-run-2-v1.result.json', '63ae14d3d1aabf303ffba051cf8e9dc71718ead4ca734d81305165ea96d95e8b'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v2-prompt-run-1-v1.claim.json', 'f71b646bc850176510a166918a219b89b999163983f44e6e0ca0ede60f624f50'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v2-prompt-run-1-v1.result.json', '922181411312c88c13f3bad50c8d8858c463af90ff5e9cd89537f62c98dcda2f'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v5-run-1-v1.claim.json', '9ffceba7bacb3bdabbe0d49269c8887157bdac0f15129f5eb44227574b3e4561'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v5-run-1-v1.result.json', '9df02a8cb3a935857e7935b85e7113550a42711c629511e5f8c4e2a6f23e4687'],
    ['../docs/evaluation-results/tutor-paid-prompt-v3-fixture-006-probe-v1.claim.json', '7ba3c7d2662bf77fad500528493b9a23277d02e907dd9e27a27648b081cc1de4'],
    ['../docs/evaluation-results/tutor-paid-prompt-v3-fixture-006-probe-v1.result.json', 'd8b5d4a923bb9b2aa0ccab67c43322a42f456bff4c6224111853e5238b26776c'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v7-r1-r2-run-1-v1.claim.json', '6cd2c0d2c0076eb4c5d29847a48750d175bc15cd73d615a3a7bd4d0ba2b1710d'],
    ['../docs/evaluation-results/tutor-paid-evaluation-v7-r1-r2-run-1-v1.result.json', 'b8afd4742757cb52e1c6344e04603f0ce11ba59eb9ca999515e3076ccf1c2d24'],
    ['../docs/LEARNING_V2_HARDENING_H14B_V7_R1_R2_FULL_PAID_SYNTHETIC_EVALUATION_REPORT.md', '57f037b7a7445a682022f26324354850d596e5ef8d7da1743fb5216a94701298'],
  ])
  for (const [relative, digest] of expected) {
    assert.equal(sha256(await readFile(new URL(relative, import.meta.url))), digest, relative)
  }
  assert.equal(TUTOR_PROMPT_V1_DIGEST, 'sha256:9a1669df540d623d9dda668954bd010484053df682c3af22560a4ede7798136b')
  assert.equal(TUTOR_PROMPT_V2_DIGEST, 'sha256:0332e4f354c8b495e5592f30bf3c41150810528864ac453837f74ce0b1d95c2b')
  assert.equal(TUTOR_PROMPT_V3_DIGEST, 'sha256:2a355b1df7560cbb1692869ec0e61fe4561226a5e04fd8602d78663193fe160b')
  const historical = JSON.parse(await readFile(new URL('../docs/evaluation-results/tutor-paid-evaluation-v7-r1-r2-run-1-v1.result.json', import.meta.url), 'utf8'))
  assert.equal(historical.result.status, 'PARTIAL_RUN')
  assert.equal(historical.result.reason_code, 'REQUIRED_USAGE_ACCOUNTING_UNTRUSTWORTHY')
  assert.equal(historical.result.source_evaluation_manifest_version, 'tutor-paid-evaluation-v7')
  assert.equal(historical.result.evaluator_version, 'tutor-paid-evaluator-v5')
  assert.equal(historical.result.result_contract_version, 'tutor-paid-evaluation-result-v3')
  assert.equal('accounting_contract_version' in historical.result, false)
  assert.equal(TUTOR_PAID_EVALUATION_MANIFEST_V7.eval_manifest_version, 'tutor-paid-evaluation-v7')
})

test('H10 owns distinct disposable compiler directories, clears inheritance and retains complete route truth', async () => {
  const scratchRoot = await mkdtemp(path.join(tmpdir(), 'eduflow-h10-distdir-'))
  const originalDistDir = process.env.EDUFLOW_RELEASE_NEXT_DIST_DIR
  const require = createRequire(import.meta.url)
  const configPath = path.join(projectRoot, 'next.config.js')
  const configKey = require.resolve(configPath)
  const loadConfig = (value) => {
    if (value === undefined) delete process.env.EDUFLOW_RELEASE_NEXT_DIST_DIR
    else process.env.EDUFLOW_RELEASE_NEXT_DIST_DIR = value
    delete require.cache[configKey]
    return require(configKey)
  }
  let first
  let second
  try {
    first = await createDisposableNextDirectory(scratchRoot)
    second = await createDisposableNextDirectory(scratchRoot)
    assert.notEqual(first.distPath, second.distPath)
    assert.notEqual(first.relativeDistDir, second.relativeDistDir)
    assert.match(first.relativeDistDir, /^\.eduflow-release-next\/next-[a-f0-9]{24}$/)
    assert.match(second.relativeDistDir, /^\.eduflow-release-next\/next-[a-f0-9]{24}$/)

    const profile = { id: 'verify-distdir', server: 'development', flags: {}, steps: [] }
    const environment = syntheticEnvironment(profile, {
      manifestVersion: 'verify', token: 'synthetic', mongoUri: '', databaseName: '', baseUrl: '',
    }, { EDUFLOW_RELEASE_NEXT_DIST_DIR: '../foreign', OPENAI_API_KEY: 'must-clear' })
    assert.equal(environment.EDUFLOW_RELEASE_NEXT_DIST_DIR, '')
    assert.equal(environment.OPENAI_API_KEY, '')

    await assert.rejects(removeDisposableNextDirectory(first.tempRoot, first.tempRoot), /Refusing unsafe/)
    await assert.rejects(removeDisposableNextDirectory(first.tempRoot, path.join(first.tempRoot, 'not-owned')), /Refusing unsafe/)
    await removeDisposableNextDirectory(first.tempRoot, first.distPath)
    await assert.rejects(access(first.distPath), { code: 'ENOENT' })
    await access(second.distPath)
    await removeDisposableNextDirectory(second.tempRoot, second.distPath)
    await assert.rejects(access(second.distPath), { code: 'ENOENT' })

    assert.equal(loadConfig(undefined).distDir, '.next')
    assert.equal(loadConfig('.eduflow-release-next/next-0123456789abcdef01234567').distDir,
      '.eduflow-release-next/next-0123456789abcdef01234567')
    assert.throws(() => loadConfig('../foreign'), /Invalid EDUFLOW_RELEASE_NEXT_DIST_DIR/)

    const routeDiff = await assertPublicV2RouteManifest(projectRoot, PUBLIC_V2_ROUTES)
    assert.equal(routeDiff.unknown.length, 0)
    assert.equal(routeDiff.missing.length, 0)
    assert.equal(routeDiff.methodMismatches.length, 0)
    assert.equal(routeMethodCount(PUBLIC_V2_ROUTES), 35)
    assert.ok(PUBLIC_V2_ROUTES.some((route) => route.file
      === 'app/api/v2/learning/teacher/students/[studentId]/competencies/[competencyId]/evidence/route.js'))
  } finally {
    delete require.cache[configKey]
    if (originalDistDir === undefined) delete process.env.EDUFLOW_RELEASE_NEXT_DIST_DIR
    else process.env.EDUFLOW_RELEASE_NEXT_DIST_DIR = originalDistDir
    await rm(scratchRoot, { recursive: true, force: true })
  }
})
