import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import test, { before, after } from 'node:test'
import { createInternalPaidExecutionTestHarness, createPaidExecutionSession, inspectPaidExecution, reconcilePaidExecution, paidExecutionReadiness } from '../lib/server/learning-v2/tutor/evaluation/paid-execution-framework.js'
import { PAID_EXECUTION_DOMAIN } from '../lib/server/learning-v2/tutor/evaluation/paid-execution-contract.js'
import { provisionInternalPaidProtectionTest, verifyPaidProtection } from '../lib/server/learning-v2/tutor/evaluation/paid-execution-protection.js'
import { localTutorFallback } from '../lib/server/learning-v2/tutor/fallback-registry.js'
import { runInternalPaidQualificationTest, runPaidWindowsQualification } from '../scripts/learning-v2-release/paid-windows-qualification.mjs'
import { registerInternalQualificationFixtureTest } from '../scripts/learning-v2-release/paid-qualification-fixtures.mjs'
const roots = [], prior = process.env.NODE_ENV
let full, serial = 0
const hash = b => 'sha256:' + createHash('sha256').update(b).digest('hex')
const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v)
function reseal(value) {
  const b = structuredClone(value); delete b.artifact_digest
  return Buffer.from(canonical({ ...b, artifact_digest: hash(Buffer.concat([Buffer.from(PAID_EXECUTION_DOMAIN), Buffer.from(canonical(b))])) }))
}
async function setup(pure = false, register = true) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'paid-execution-test-rv-')); roots.push(root)
  const runId = `test-paid-rv-${++serial}`; let calls = 0
  if (pure) {
    await provisionInternalPaidProtectionTest({ repositoryRoot: root, runId })
    await fs.mkdir(root + '-outside-probe'); roots.push(root + '-outside-probe')
    return { root, runId, fixtureAuthority: register ? await registerInternalQualificationFixtureTest({ root, runId }) : null }
  }
  const h = await createInternalPaidExecutionTestHarness({ repositoryRoot: root, runId, faultCapability: null, fallbackFactory: null,
    eventForFixture: f => { calls++; return { kind: 'PROVIDER_CANDIDATE', candidate: localTutorFallback(f.level), usage: { input_tokens: 70, output_tokens: 30, total_tokens: 100 } } } })
  return { root, runId, h, r: h.repository, args: { repositoryRoot: root, runId, authority: h.authority }, calls: () => calls }
}
const file = (c, ref) => path.join(c.root, ref)
const round = async s => { const p = await s.prepare(); await s.invoke(p); await s.settle() }
before(async () => {
  process.env.NODE_ENV = 'test'; full = await setup(); full.s = await createPaidExecutionSession(full.args)
  for (let n = 0; n < 120; n++) await round(full.s)
  await full.s.complete(); full.t = await full.s.finalize()
})
after(async () => {
  for (const root of roots) {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir())); assert.ok(path.basename(root).startsWith('paid-execution-test-rv-'))
    await fs.rm(root, { recursive: true, force: true })
  }
  // Qualification registration/consumption/barrier tombstones are intentionally retained outside fixtures.
  if (prior === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prior
})
for (const damage of ['torn', 'digest', 'authority']) test(`RV01 ${damage} terminal preserves all independently valid upstream layers`, async () => {
  const target = file(full, full.r.refs.execution), saved = await fs.readFile(target)
  const bytes = damage === 'torn' ? Buffer.from('{') : damage === 'digest'
    ? Buffer.from(canonical({ ...full.t, terminalized_at: '2099-01-01T00:00:00.000Z' })) : reseal({ ...full.t, terminalized_at: '2099-01-01T00:00:00.000Z' })
  try {
    await fs.writeFile(target, bytes)
    const a = await inspectPaidExecution(full.args), b = await reconcilePaidExecution({ ...full.args, reconciliationAuthority: null, commit: false })
    const { status, material_ready, ...same } = b; assert.deepEqual(a, same)
    assert.equal(a.claim_state, 'CONSUMED_VERIFIED'); assert.equal(a.accounting.completed_case_count, 120)
    assert.equal(a.accounting.known_actual_cost_usd_micros, 60000); assert.equal(a.checkpoint_count, 244)
    assert.equal(a.result_verified, true); assert.equal(a.review_material_ready, true)
    assert.equal(a.terminal_state, 'BLOCKED_INVALID'); assert.equal(a.terminal, null); assert.equal(a.blocking_integrity_state, 'BLOCKED')
    assert.equal(a.replay_allowed, false); assert.equal(a.resume_allowed, false)
    await assert.rejects(reconcilePaidExecution({ ...full.args, reconciliationAuthority: {}, commit: true }))
    await assert.rejects(createPaidExecutionSession(full.args)); assert.equal(full.calls(), 120)
    assert.deepEqual(await fs.readFile(target), bytes)
  } finally { await fs.writeFile(target, saved) }
})
test('RV01 malformed terminal with only a valid accounting prefix remains a bounded downstream failure', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args); await round(s)
  await fs.writeFile(file(c, c.r.refs.execution), '{')
  const v = await inspectPaidExecution(c.args)
  assert.equal(v.accounting.known_actual_cost_usd_micros, 500); assert.equal(v.result_verified, false)
  assert.equal(v.terminal_state, 'BLOCKED_INVALID'); await assert.rejects(s.prepare()); assert.equal(c.calls(), 1)
})
test('RV01 a malformed terminal cannot unlock a previously issued transport permission', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args), p = await s.prepare()
  await fs.writeFile(file(c, c.r.refs.execution), '{'); await assert.rejects(s.invoke(p)); assert.equal(c.calls(), 0)
})
test('RV01 absent and independently valid terminals keep distinct states and immutable reconciliation', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args)
  assert.equal((await inspectPaidExecution(c.args)).terminal_state, 'ABSENT')
  const proof = c.h.crash(s), args = { ...c.args, reconciliationAuthority: proof, commit: true }
  const t = await reconcilePaidExecution(args); assert.deepEqual(await reconcilePaidExecution(args), t)
  assert.equal((await inspectPaidExecution(c.args)).terminal_state, 'VERIFIED')
})
for (const [input, output] of [[40001, 30], [70, 161]]) test(`RV02 resealed ${input}/${output} blocks prepare before writing despite aggregate headroom`, async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args); await round(s)
  const ref = `${c.r.refs.checkpoints}/001.settled.json`, b = structuredClone((await c.r.read(ref)).value)
  Object.assign(b.facts, { known_input_tokens: input, known_output_tokens: output, known_total_tokens: input + output, known_actual_cost_usd_micros: 2 * input + 12 * output })
  await fs.writeFile(file(c, ref), reseal(b)); const before = await inspectPaidExecution(c.args)
  assert.ok(before.accounting.remaining_budget_upper_bound_usd_micros > 81920)
  await assert.rejects(s.prepare(), e => e.reason_code === 'TOKEN_LIMIT')
  assert.equal((await c.r.checkpointEntries()).length, 2); await assert.rejects(fs.stat(file(c, `${c.r.refs.checkpoints}/002.prepared.json`)))
  const after = await inspectPaidExecution(c.args); assert.equal(after.checkpoint_head, before.checkpoint_head)
  assert.equal(after.accounting.known_actual_cost_usd_micros, 2 * input + 12 * output)
  assert.equal(c.calls(), 1); const terminal = await s.finalize(); assert.equal(terminal.terminal_cause, 'TOKEN_LIMIT')
  assert.equal(terminal.terminal_case_id, b.case_id); assert.equal(terminal.accounting.known_actual_cost_usd_micros, 2 * input + 12 * output)
})
for (const parent of ['execution-checkpoints', 'human-review']) for (const name of ['.namespace-guard', '.hidden', 'unapproved.json']) test(`RV03 ${parent}/${name} rejects before Claim`, async () => {
  const c = await setup(); await fs.writeFile(file(c, `docs/evaluation-results/${parent}/${name}`), 'EDUFLOW_PAID_NAMESPACE_GUARD_V1\n')
  assert.equal((await paidExecutionReadiness({ runId: c.runId, authority: c.h.authority })).ready, false)
  await assert.rejects(createPaidExecutionSession(c.args)); await assert.rejects(fs.stat(file(c, c.r.refs.claim))); assert.equal(c.calls(), 0)
})
test('RV03 explicit retained run allowlist is preserved without granting it execution authority', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'paid-execution-test-rv-')); roots.push(root)
  const runId = `test-paid-rv-${++serial}`, retained = 'test-paid-retained-history'
  await provisionInternalPaidProtectionTest({ repositoryRoot: root, runId, retainedRunIds: [retained] })
  await fs.writeFile(path.join(root, 'docs/evaluation-results', `${retained}.execution.json`), '{}')
  assert.equal((await verifyPaidProtection(root, runId)).status, 'READY_PROVIDER_FREE_TEST_ONLY')
  await assert.rejects(verifyPaidProtection(root, retained))
})
test('RV03 only the three exact current-run guards are accepted and excluded from the chain', async () => {
  assert.equal((await full.r.checkpointEntries()).length, 244); const v = await inspectPaidExecution(full.args)
  assert.equal(v.checkpoint_head, full.t.checkpoint_head); assert.equal(v.terminal_state, 'VERIFIED')
})
test('RV04 first fresh fixture reaches the barrier before its one attacker and create', async () => {
  const c = await setup(true), events = [], slot = path.join(c.root, 'docs/evaluation-results/execution-checkpoints', c.runId, '001.prepared.json')
  const result = await runInternalPaidQualificationTest({ ...c, onBarrier: async () => { events.push('barrier'); await assert.rejects(fs.stat(slot)) },
    attack: async () => { events.push('attacker'); return { outcome: 'DENIED' } } })
  assert.deepEqual(events, ['barrier', 'attacker']); assert.match(await fs.readFile(slot, 'utf8'), /SYNTHETIC QUALIFICATION ONLY/)
  assert.equal(result.actual_platform_qualification, 'NOT_PERFORMED'); assert.equal(result.paid_authorization, false)
  assert.equal(result.provider_calls, 0); assert.equal(result.outside_root_mutations, null)
})
for (const outcome of ['DENIED', 'MUTATION_SUCCEEDED', 'UNSUPPORTED', 'AMBIGUOUS', 'WORKER_FAILURE']) test(`RV04 ${outcome} permanently consumes fixture before any second attacker`, async () => {
  const c = await setup(true); let attackers = 0
  const args = { ...c, attack: async () => { attackers++; if (outcome === 'WORKER_FAILURE') throw Error('synthetic worker failure'); return { outcome } } }
  if (outcome === 'WORKER_FAILURE') await assert.rejects(runInternalPaidQualificationTest(args)); else await runInternalPaidQualificationTest(args)
  await assert.rejects(runInternalPaidQualificationTest({ ...args, attackIndex: 1 })); assert.equal(attackers, 1)
  const slot = path.join(c.root, 'docs/evaluation-results/execution-checkpoints', c.runId, '001.prepared.json')
  if (outcome === 'DENIED') await fs.unlink(slot)
  await assert.rejects(runInternalPaidQualificationTest(args)); assert.equal(attackers, 1)
  await assert.rejects(registerInternalQualificationFixtureTest({ root: c.root, runId: c.runId }))
})
for (const marker of ['slot', '.mutated', '.ambiguous']) test(`RV04 existing ${marker} fails before attacker and cannot be repaired into freshness`, async () => {
  const c = await setup(true); let attackers = 0
  const p = marker === 'slot' ? path.join(c.root, 'docs/evaluation-results/execution-checkpoints', c.runId, '001.prepared.json') : path.join(c.root, marker)
  await fs.writeFile(p, 'prior outcome')
  const args = { ...c, attack: async () => { attackers++; return { outcome: 'DENIED' } } }
  await assert.rejects(runInternalPaidQualificationTest(args)); assert.equal(attackers, 0)
  await fs.unlink(p); await assert.rejects(runInternalPaidQualificationTest(args)); assert.equal(attackers, 0)
})
test('RV04 crash after consumption blocks same-process and fresh-process registration/reuse', async () => {
  const c = await setup(true); let attackers = 0
  const args = { ...c, attack: async () => { attackers++; return { outcome: 'DENIED' } } }
  await assert.rejects(runInternalPaidQualificationTest({ ...args, afterConsumption: () => { throw Error('synthetic crash') } }))
  await assert.rejects(runInternalPaidQualificationTest(args)); assert.equal(attackers, 0)
  const moduleUrl = new URL('../scripts/learning-v2-release/paid-qualification-fixtures.mjs', import.meta.url).href
  const source = `import { registerInternalQualificationFixtureTest as register } from ${JSON.stringify(moduleUrl)}; try { await register(JSON.parse(process.argv[1])); process.exit(2) } catch { process.stdout.write('BLOCKED') }`
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', source, JSON.stringify({ root: c.root, runId: c.runId })], { encoding: 'utf8', windowsHide: true, env: { ...process.env, NODE_ENV: 'test' } })
  assert.equal(child.status, 0); assert.equal(child.stdout, 'BLOCKED')
})
test('RV04 changed initial object identity blocks before barrier/attacker', async () => {
  const c = await setup(true), guard = path.join(c.root, 'docs/evaluation-results/.namespace-guard')
  const bytes = await fs.readFile(guard); await fs.rename(guard, guard + '-held'); await fs.writeFile(guard, bytes); await fs.unlink(guard + '-held')
  let attackers = 0; await assert.rejects(runInternalPaidQualificationTest({ ...c, attack: async () => { attackers++; return { outcome: 'DENIED' } } })); assert.equal(attackers, 0)
})
test('RV04 two independent fresh fixtures each get exactly one attempt', async () => {
  let attackers = 0
  for (let n = 0; n < 2; n++) { const c = await setup(true); await runInternalPaidQualificationTest({ ...c, attack: async () => { attackers++; return { outcome: 'UNSUPPORTED' } } }) }
  assert.equal(attackers, 2)
})
test('RV04 concurrent coordinators have one consumption and attacker winner', async () => {
  const c = await setup(true); let attackers = 0
  const args = { ...c, attack: async () => { attackers++; return { outcome: 'UNSUPPORTED' } } }
  const outcomes = await Promise.allSettled([runInternalPaidQualificationTest(args), runInternalPaidQualificationTest(args)])
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1); assert.equal(attackers, 1)
})
test('RV04 signalled worker exit remains consumed and cleanup does not wait for a second exit', { timeout: 10000 }, async () => {
  const c = await setup(true); let attackers = 0
  const args = { ...c, attack: async () => { attackers++; return { outcome: 'DENIED' } } }
  await assert.rejects(runInternalPaidQualificationTest({ ...args, onBarrier: async ({ workerPid }) => {
    process.kill(workerPid, 'SIGKILL')
    await new Promise(resolve => setTimeout(resolve, 150))
    throw Error('synthetic worker signal')
  } }))
  await assert.rejects(runInternalPaidQualificationTest(args)); assert.equal(attackers, 0)
})
test('RV04 invalid initial registration cannot be cleaned and re-enrolled', async () => {
  const c = await setup(true, false), slot = path.join(c.root, 'docs/evaluation-results/execution-checkpoints', c.runId, '001.prepared.json')
  await fs.writeFile(slot, 'already used')
  await assert.rejects(registerInternalQualificationFixtureTest({ root: c.root, runId: c.runId }))
  await fs.unlink(slot)
  await assert.rejects(registerInternalQualificationFixtureTest({ root: c.root, runId: c.runId }))
})
test('RV04 caller JSON, real identities, ordinary paths and production cannot grant harness authority', async () => {
  const c = await setup(true); let attackers = 0
  const attack = async () => { attackers++; return { outcome: 'DENIED' } }
  await assert.rejects(runInternalPaidQualificationTest({ ...c, fixtureAuthority: { safe: true }, attack }))
  await assert.rejects(runInternalPaidQualificationTest({ ...c, runId: 'not-test-paid', attack }))
  await assert.rejects(registerInternalQualificationFixtureTest({ root: process.cwd(), runId: c.runId }))
  assert.equal((await runPaidWindowsQualification(c)).reason, 'TRUSTED_QUALIFICATION_FIXTURE_RESOLVER_NOT_CONFIGURED')
  process.env.NODE_ENV = 'production'
  try { await assert.rejects(runInternalPaidQualificationTest({ ...c, attack })); await assert.rejects(registerInternalQualificationFixtureTest({ root: c.root, runId: c.runId })) }
  finally { process.env.NODE_ENV = 'test' }
  assert.equal(attackers, 0)
})
