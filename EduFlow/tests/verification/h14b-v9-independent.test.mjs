import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import test, { before, after } from 'node:test'
import { createInternalPaidExecutionTestHarness, createPaidExecutionSession, inspectPaidExecution, reconcilePaidExecution, paidExecutionReadiness } from '../../lib/server/learning-v2/tutor/evaluation/paid-execution-framework.js'
import { createInternalPaidFilesystemFault, createPaidRepository, paidCheckpointName } from '../../lib/server/learning-v2/tutor/evaluation/paid-execution-repository.js'
import { sealPaidArtifact, verifyPaidArtifactBytes, PAID_PROOF_NAMES, PAID_LIMITS } from '../../lib/server/learning-v2/tutor/evaluation/paid-execution-contract.js'
import { paidKnownUsage, paidUnknownFacts, derivePaidAccounting, paidNextReservationFailure } from '../../lib/server/learning-v2/tutor/evaluation/paid-execution-accounting.js'
import { localTutorFallback } from '../../lib/server/learning-v2/tutor/fallback-registry.js'

// Independent verification only. No application source or release-manifest changes.
// Every artifact mutation below is confined to a validated synthetic temporary root.
const roots = [], snapshots = new Map(), originals = new Map()
let serial = 0, full, family, proof, baseCalls = 0, mutations = 0
const oldEnv = process.env.NODE_ENV
const good = f => ({ kind: 'PROVIDER_CANDIDATE', candidate: localTutorFallback(f.level), usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140 } })
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
function canon(v) { return v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' }
const bytes = v => Buffer.from(canon(v))
const unsigned = v => { const b = structuredClone(v); delete b.artifact_digest; return b }
function reseal(v) { const b = unsigned(v); return { ...b, artifact_digest: hash(Buffer.concat([Buffer.from('EDUFLOW\0H14B\0PAID_EXECUTION_RECORD\0v1\0'), bytes(b)])) } }
async function setup(event = good, fault = null) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'paid-execution-test-independent-')); roots.push(root)
  const runId = 'test-paid-independent-' + (++serial)
  const h = await createInternalPaidExecutionTestHarness({ repositoryRoot: root, runId, eventForFixture: event, faultCapability: fault, fallbackFactory: null })
  return { root, runId, h, r: h.repository, args: { repositoryRoot: root, runId, authority: h.authority } }
}
function target(c, ref) {
  const p = path.resolve(c.root, ref), relative = path.relative(c.root, p)
  assert.ok(path.basename(c.root).startsWith('paid-execution-test-independent-'))
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  return p
}
async function overwrite(c, ref, value) { await fs.writeFile(target(c, ref), value) }
async function remove(c, ref) { await fs.rm(target(c, ref), { force: true }) }
async function next(s) { const p = await s.prepare(); await s.invoke(p); await s.settle() }
async function capture(c) {
  const refs = [c.r.refs.authorization, c.r.refs.attestation, c.r.refs.claim, c.r.refs.execution, c.r.refs.result, c.r.refs.sample, c.r.refs.packet,
    ...(await c.r.checkpointEntries()).map(n => c.r.refs.checkpoints + '/' + n)]
  const map = new Map()
  for (const ref of refs) { try { map.set(ref, await fs.readFile(target(c, ref))) } catch (e) { if (e.code !== 'ENOENT') throw e } }
  return map
}
async function restore(snapshot) {
  const all = new Set([...originals.keys(), ...(await capture(full)).keys()])
  for (const ref of all) if (!snapshot.has(ref)) await remove(full, ref)
  for (const [ref, data] of snapshot) await overwrite(full, ref, data)
}
async function viewAt(snapshot) { await restore(snapshot); return inspectPaidExecution(full.args) }
async function reconcile(c, p, commit = true) { return reconcilePaidExecution({ ...c.args, reconciliationAuthority: p, commit }) }
function prefix(n, result = false, sample = false, packet = false) {
  const out = new Map()
  for (const [ref, data] of originals) {
    if (ref === full.r.refs.execution) continue
    if (ref === full.r.refs.result && !result || ref === full.r.refs.sample && !sample || ref === full.r.refs.packet && !packet) continue
    if (ref.startsWith(full.r.refs.checkpoints + '/') && !Array.from({ length: n }, (_, i) => paidCheckpointName(i + 1)).includes(path.basename(ref))) continue
    out.set(ref, data)
  }
  return out
}
before(async () => {
  process.env.NODE_ENV = 'test'
  full = await setup(f => { baseCalls++; return good(f) })
  full.s = await createPaidExecutionSession(full.args)
  for (let i = 0; i < 120; i++) await next(full.s)
  snapshots.set('after-120', await capture(full))
  await full.s.complete(); await full.s.finalize()
  for (const [ref, data] of await capture(full)) originals.set(ref, data)
  proof = full.h.crash(full.s)
  family = [full.r.refs.authorization, full.r.refs.attestation, full.r.refs.claim, full.r.refs.execution,
    ...[1, 2, 241, 242, 243, 244].map(i => full.r.refs.checkpoints + '/' + paidCheckpointName(i))].map(ref => JSON.parse(originals.get(ref)))
})
after(async () => {
  assert.equal(baseCalls, 120)
  console.log(JSON.stringify({ independent_schema_mutations: mutations, baseline_injected_calls: baseCalls, provider_calls: 0 }))
  for (const root of roots) { assert.ok(path.basename(root).startsWith('paid-execution-test-independent-')); assert.ok(path.relative(tmpdir(), root) && !path.relative(tmpdir(), root).startsWith('..')); await fs.rm(root, { recursive: true, force: true }) }
  if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv
})

test('A/B: every family variant rejects all authority/privacy canaries recursively and uses independently calculated JCS digests', () => {
  const canaries = ['approved_for_runtime', 'production_approval', 'runtime_approval', 'tenant_id', 'student_id', 'teacher_id', 'mastery', 'confidence', 'evidence', 'learner_message', 'learner_answer', 'hidden_answer', 'raw_prompt', 'raw_request', 'raw_response', 'raw_provider_error', 'secret', 'stack', 'error_message']
  for (const original of family) {
    assert.equal(reseal(original).artifact_digest, original.artifact_digest)
    assert.deepEqual(verifyPaidArtifactBytes(bytes(original), hash(bytes(original))), original)
    const objects = []
    const walk = (v, p = []) => { if (v && typeof v === 'object') { if (!Array.isArray(v)) objects.push(p); for (const k of Object.keys(v)) walk(v[k], [...p, k]) } }
    walk(unsigned(original))
    for (const p of objects) for (const key of canaries) {
      const b = unsigned(original); let o = b; for (const k of p) o = o[k]
      o[key] = 'INDEPENDENT_CANARY'; mutations++; assert.throws(() => sealPaidArtifact(b), original.artifact_kind + ':' + p.join('.') + ':' + key)
    }
    for (const value of [undefined, 0.5, Number.MAX_SAFE_INTEGER + 1, '\ud800', '\udfff']) {
      mutations++; assert.throws(() => sealPaidArtifact({ ...unsigned(original), run_id: value }))
    }
    const tamper = { ...original, run_id: 'test-paid-tampered' }
    assert.throws(() => verifyPaidArtifactBytes(bytes(tamper)))
    assert.throws(() => verifyPaidArtifactBytes(bytes(original), 'sha256:' + 'f'.repeat(64)))
  }
})
test('C/D: flags, keys and arbitrary authority objects cannot authorize; every exact proof and trusted-file drift rejects', async () => {
  const c = await setup()
  for (const authority of [true, {}, { operator_ref: 'test-paid-operator', paid: true }, { OPENAI_API_KEY: 'SYNTHETIC_NON_CREDENTIAL' }]) {
    assert.equal(paidExecutionReadiness({ runId: c.runId, authority }).ready, false)
    await assert.rejects(createPaidExecutionSession({ ...c.args, authority }))
  }
  const original = (await c.r.read(c.r.refs.attestation)).value
  for (const proofName of PAID_PROOF_NAMES) for (const [key, value] of [['value', false], ['attested_by', 'forged-operator'], ['attested_at', '2999-01-01T00:00:00.000Z'], ['run_id', 'test-paid-foreign'], ['run_contract_hash', 'sha256:' + '0'.repeat(64)], ['evidence_ref', 'wrong-proof']]) {
    const a = structuredClone(original); a[proofName][key] = value
    await overwrite(c, c.r.refs.attestation, bytes(reseal(a)))
    await assert.rejects(createPaidExecutionSession(c.args))
  }
  assert.equal(await c.r.rawRead(c.r.refs.claim, true), null)
})
test('E/S: eight Claim contenders yield one owner; every tombstone rejects without transport', async () => {
  let invocations = 0; const c = await setup(f => { invocations++; return good(f) })
  const r = await Promise.allSettled(Array.from({ length: 8 }, () => createPaidExecutionSession(c.args)))
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1); assert.equal(invocations, 0)
  for (const data of [Buffer.alloc(0), Buffer.from('{'), Buffer.from('{}'), Buffer.from('{"artifact_digest":"bad"}')]) {
    await overwrite(c, c.r.refs.claim, data); await assert.rejects(createPaidExecutionSession(c.args)); assert.equal(invocations, 0)
    assert.deepEqual(await fs.readFile(target(c, c.r.refs.claim)), data)
  }
})
test('B/F: all sequence/owner/case/predecessor mutations reject after valid self resealing', async () => {
  for (const [key, value] of [['artifact_kind', 'RESULT_PREPARED'], ['sequence', 2], ['case_ordinal', 2], ['case_id', 'wrong-case'], ['execution_owner_ref', 'wrong-owner'], ['run_id', 'test-paid-other'], ['run_contract_hash', 'sha256:' + '0'.repeat(64)], ['previous_checkpoint_sha256', 'sha256:' + '0'.repeat(64)]]) {
    await restore(prefix(1)); const ref = full.r.refs.checkpoints + '/001.prepared.json', a = JSON.parse(originals.get(ref)); a[key] = value
    await overwrite(full, ref, bytes(reseal(a))); await assert.rejects(inspectPaidExecution(full.args))
  }
  await restore(prefix(2)); await remove(full, full.r.refs.checkpoints + '/001.prepared.json'); await assert.rejects(inspectPaidExecution(full.args))
})
for (const stage of ['before-create', 'after-create', 'before-readback']) test('G: prepared fault at ' + stage + ' causes zero invocations', async () => {
  let invocations = 0
  const f = createInternalPaidFilesystemFault((s, ref) => { if (s === stage && ref.endsWith('001.prepared.json')) throw new Error('SYNTHETIC_FAULT') })
  const c = await setup(x => { invocations++; return good(x) }, f), s = await createPaidExecutionSession(c.args)
  await assert.rejects(s.prepare()); await assert.rejects(s.invoke({})); assert.equal(invocations, 0)
})
for (const method of ['writeFile', 'sync', 'close', 'readFile']) test('G: actual FileHandle.' + method + ' failure causes zero invocations', async () => {
  let invocations = 0, injected = false
  const c = await setup(x => { invocations++; return good(x) }), s = await createPaidExecutionSession(c.args), originalOpen = fs.open
  fs.open = async function (p, ...args) {
    const h = await originalOpen.call(this, p, ...args)
    if (!String(p).endsWith('001.prepared.json')) return h
    const original = h[method].bind(h)
    h[method] = async (...values) => { if (!injected) { injected = true; throw new Error('SYNTHETIC_HANDLE_FAILURE') } return original(...values) }
    return h
  }
  syncBuiltinESMExports()
  try { await assert.rejects(s.prepare()); assert.equal(injected, true); assert.equal(invocations, 0) }
  finally { fs.open = originalOpen; syncBuiltinESMExports() }
})
test('G: corruption between flush and readback never produces invocation permission', async () => {
  let c, invocations = 0
  const fault = createInternalPaidFilesystemFault(async (stage, ref) => { if (stage === 'before-readback' && ref.endsWith('001.prepared.json')) await overwrite(c, ref, Buffer.from('{}')) })
  c = await setup(f => { invocations++; return good(f) }, fault); const s = await createPaidExecutionSession(c.args)
  await assert.rejects(s.prepare()); assert.equal(invocations, 0)
})
test('H/S: simultaneous and repeated permission use gives one client invocation; duplicate settlement has one winner', async () => {
  let calls = 0; const c = await setup(f => { calls++; return good(f) }), s = await createPaidExecutionSession(c.args), p = await s.prepare()
  const r = await Promise.allSettled([s.invoke(p), s.invoke(p), s.invoke(p)])
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1); assert.equal(calls, 1)
  const settlements = await Promise.allSettled([s.settle(), s.settle()]); assert.equal(settlements.filter(x => x.status === 'fulfilled').length, 1)
  await assert.rejects(s.invoke(p)); assert.equal(calls, 1)
})
test('H: changed prepared predecessor before invocation blocks transport', async () => {
  let calls = 0; const c = await setup(f => { calls++; return good(f) }), s = await createPaidExecutionSession(c.args), p = await s.prepare()
  const ref = c.r.refs.checkpoints + '/001.prepared.json', v = (await c.r.read(ref)).value
  await overwrite(c, ref, bytes(reseal({ ...v, previous_checkpoint_sha256: 'sha256:' + '0'.repeat(64) })))
  await assert.rejects(s.invoke(p)); assert.equal(calls, 0)
})
test('I1/I2/I3/I6/M: genuine in-memory crash simulations preserve only disk evidence and disable original/successor', async () => {
  for (const phase of ['claim', 'prepare', 'invoke', 'settle']) {
    const c = await setup(), s = await createPaidExecutionSession(c.args)
    let p; if (phase !== 'claim') p = await s.prepare()
    if (['invoke', 'settle'].includes(phase)) await s.invoke(p)
    if (phase === 'settle') await s.settle()
    const stopped = c.h.crash(s), t = await reconcile(c, stopped)
    assert.equal(t.accounting.possibly_started_transport_count, phase === 'claim' ? 0 : 1)
    assert.equal(t.accounting.started_transport_count, ['prepare', 'invoke'].includes(phase) ? null : phase === 'settle' ? 1 : 0)
    assert.equal(t.accounting.unknown_usage_call_count, ['prepare', 'invoke'].includes(phase) ? 1 : 0)
    await assert.rejects(s.prepare()); await assert.rejects(s.settle()); await assert.rejects(s.complete()); await assert.rejects(createPaidExecutionSession(c.args))
    assert.equal(c.h.transientCount(s), 0)
  }
})
test('I4/L: timeout/HTTP/network/parse/missing-usage continue after safe fallback', async () => {
  for (const code of ['PROVIDER_TIMEOUT', 'PROVIDER_HTTP_429', 'PROVIDER_HTTP_5XX', 'PROVIDER_HTTP_4XX', 'PROVIDER_NETWORK_ERROR', 'PROVIDER_SCHEMA_PARSE_ERROR', 'PROVIDER_USAGE_MISSING']) {
    const c = await setup(() => ({ kind: 'PROVIDER_FAILURE', code, usage: null })), s = await createPaidExecutionSession(c.args)
    await next(s); await next(s); const v = await inspectPaidExecution(c.args)
    assert.equal(v.accounting.completed_case_count, 2); assert.equal(v.accounting.unknown_usage_call_count, 2)
    assert.equal(v.terminal, null); assert.equal(v.cases[0].facts.provider_technical_cause, code)
  }
})
test('I5/K: failed settlement preserves unresolved full reservation and blocks next slot', async () => {
  const fault = createInternalPaidFilesystemFault((stage, ref) => { if (stage === 'before-create' && ref.endsWith('001.settled.json')) throw new Error('SYNTHETIC_SETTLE_FAILURE') })
  const c = await setup(good, fault), s = await createPaidExecutionSession(c.args), p = await s.prepare(); await s.invoke(p)
  await assert.rejects(s.settle()); await assert.rejects(s.prepare()); const v = await inspectPaidExecution(c.args)
  assert.equal(v.accounting.known_usage_call_count + v.accounting.unknown_usage_call_count, v.accounting.possibly_started_transport_count)
  assert.equal(v.accounting.conservative_total_cost_upper_bound_usd_micros, 81920)
})
for (const [label, count, result, sample, packet] of [['I7 after 120 before Result', 240, false, false, false], ['I8 after Result before VERIFIED', 241, true, false, false], ['I9 after VERIFIED before material', 242, true, false, false], ['I10 after Sample before Packet', 243, true, true, false], ['I11 after Packet before terminal', 244, true, true, true], ['I11b Packet before material settlement', 243, true, true, true]]) test(label + ': read-only persisted-prefix recovery, no replay', async () => {
  await restore(prefix(count, result, sample, packet)); const r = await reconcile(full, proof)
  assert.equal(r.accounting.completed_case_count, 120); assert.equal(r.accounting.actual_cost_usd_micros, 81600)
  assert.equal(r.result_state, result ? 'PERSISTED_VERIFIED' : 'BLOCKED')
  assert.equal(r.review_material_state, packet ? 'REVIEW_MATERIAL_READY' : result ? 'BLOCKED' : 'NOT_ELIGIBLE')
  assert.equal((await full.r.checkpointEntries()).length, count); assert.equal(baseCalls, 120)
})
test('J: exact integer arithmetic, signed headroom, unknown invariant and UNPROVABLE bounds', () => {
  assert.deepEqual(Object.values(PAID_LIMITS), [2000000, 12000000, 10000000, 81920, 9830400, 120, 40000, 160, 4800000, 19200, 4819200])
  for (const usage of [{ input_tokens: -1, output_tokens: 1, total_tokens: 0 }, { input_tokens: .1, output_tokens: 1, total_tokens: 1.1 }, { input_tokens: Number.MAX_SAFE_INTEGER + 1, output_tokens: 0, total_tokens: Number.MAX_SAFE_INTEGER + 1 }, { input_tokens: 1, output_tokens: 2, total_tokens: 4 }]) assert.equal(paidKnownUsage(usage), null)
  const known = JSON.parse(originals.get(full.r.refs.checkpoints + '/001.settled.json')).facts
  const huge = { ...known, ...paidKnownUsage({ input_tokens: 6000000, output_tokens: 0, total_tokens: 6000000 }) }
  const a = derivePaidAccounting([{ facts: huge }]); assert.equal(a.remaining_budget_upper_bound_usd_micros, -2000000)
  const b = derivePaidAccounting([{ facts: huge }, { facts: paidUnknownFacts() }]); assert.equal(b.bounds_status, 'UNPROVABLE'); assert.equal(b.conservative_total_cost_upper_bound_usd_micros, null)
  const c = derivePaidAccounting(Array.from({ length: 120 }, () => ({ facts: paidUnknownFacts() })))
  assert.equal(c.conservative_total_cost_upper_bound_usd_micros, 9830400); assert.equal(paidNextReservationFailure(c), 'CALL_LIMIT')
  assert.throws(() => derivePaidAccounting(Array.from({ length: 121 }, () => ({ facts: paidUnknownFacts() }))))
})
test('N: reconciliation rejects added write capabilities and untrusted stop proof, existing record unchanged', async () => {
  await restore(originals)
  const before = (await full.r.rawRead(full.r.refs.execution)).bytes
  assert.deepEqual(bytes(await reconcile(full, null, false)), before)
  for (const key of ['transport', 'prepare', 'settle', 'result', 'sample', 'packet', 'learner_message']) await assert.rejects(reconcilePaidExecution({ ...full.args, reconciliationAuthority: proof, commit: true, [key]: 'CANARY' }))
  await restore(prefix(0)); await assert.rejects(reconcile(full, {})); assert.equal(await full.r.rawRead(full.r.refs.execution, true), null)
})
test('O/P: Result strict binding and no accounting additions; selected text disposed', async () => {
  await restore(originals); const v = await inspectPaidExecution(full.args)
  assert.equal(v.result_verified, true); assert.equal(v.review_material_ready, true); assert.equal(full.h.transientCount(full.s), 0)
  const r = JSON.parse(originals.get(full.r.refs.result)); assert.equal('run_contract_hash' in r, false); assert.equal('accounting' in r, false)
  assert.equal(r.source_run_id, full.runId); assert.equal(r.fixtures_completed, 120)
})
test('Q: terminal totals/mode/state/cause/hash mutations reject after correct resealing', async () => {
  for (const [key, value] of [['execution_completion', 'NOT_STARTED'], ['evaluation_state', 'INCOMPLETE'], ['result_state', 'BLOCKED'], ['review_material_eligible', false], ['review_material_attempted', false], ['review_material_state', 'BLOCKED'], ['terminal_cause', 'BUDGET_LIMIT'], ['terminal_phase', 'TRANSPORT'], ['checkpoint_count', 0], ['result_sha256', 'sha256:' + '0'.repeat(64)]]) {
    await restore(originals); const t = JSON.parse(originals.get(full.r.refs.execution)); t[key] = value
    await overwrite(full, full.r.refs.execution, bytes(reseal(t))); await assert.rejects(inspectPaidExecution(full.args))
  }
})
test('Q DEFECT: future terminalized_at must reject even with recomputed public digest', async () => {
  await restore(originals); const t = JSON.parse(originals.get(full.r.refs.execution)); t.terminalized_at = '2999-01-01T00:00:00.000Z'
  await overwrite(full, full.r.refs.execution, bytes(reseal(t)))
  await assert.rejects(inspectPaidExecution(full.args))
})
test('N/Q DEFECT: arbitrary persisted reconciliation authority must not become trusted evidence', async () => {
  await restore(prefix(0)); const t = await reconcile(full, proof)
  const forged = structuredClone(t); forged.reconciliation_authority.operator_ref = 'forged-operator'; forged.reconciliation_authority.verified_at = '2999-01-01T00:00:00.000Z'
  await overwrite(full, full.r.refs.execution, bytes(reseal(forged)))
  await assert.rejects(reconcile(full, null, false))
})
test('B/F DEFECT: AUTHORIZATION bytes in Claim slot must not be accepted as CLAIM', async () => {
  const c = await setup(); await c.r.writeBytes(c.r.refs.claim, (await c.r.rawRead(c.r.refs.authorization)).bytes)
  await assert.rejects(inspectPaidExecution(c.args))
})
test('I/O/P DEFECT: torn Result must not erase verified case accounting', async () => {
  await restore(prefix(241)); await overwrite(full, full.r.refs.result, Buffer.from('{'))
  const view = await inspectPaidExecution(full.args)
  assert.equal(view.accounting.completed_case_count, 120); assert.equal(view.accounting.actual_cost_usd_micros, 81600); assert.equal(view.result_verified, false)
})
test('I/P DEFECT: torn Packet without failure settlement preserves Result/accounting and reports material blocked', async () => {
  await restore(prefix(243, true, true)); await overwrite(full, full.r.refs.packet, Buffer.from('{'))
  const view = await inspectPaidExecution(full.args)
  assert.equal(view.result_verified, true); assert.equal(view.accounting.actual_cost_usd_micros, 81600); assert.equal(view.review_material_ready, false)
})
test('Q DEFECT: original owner can terminalize a zero-call controlled pretransport persistence failure', async () => {
  const fault = createInternalPaidFilesystemFault((stage, ref) => { if (stage === 'before-create' && ref.endsWith('001.prepared.json')) throw new Error('SYNTHETIC_CONTROLLED_STOP') })
  const c = await setup(good, fault), s = await createPaidExecutionSession(c.args); await assert.rejects(s.prepare())
  const terminal = await s.finalize()
  assert.equal(terminal.terminal_cause, 'ARTIFACT_WRITE_FAILURE'); assert.equal(terminal.execution_completion, 'NOT_STARTED')
})
test('R: fixed path attacks reject, including absolute/Windows/Unicode and arbitrary slots', async () => {
  const c = await setup()
  for (const ref of ['../escape', '/tmp/escape', 'C:\\escape', 'docs\\evaluation-results\\escape.json', 'docs/evaluation-results/../escape.json', 'docs\u2215evaluation-results/escape.json', c.r.refs.checkpoints + '/121.prepared.json', c.r.refs.checkpoints + '/retry.json']) {
    await assert.rejects(c.r.rawRead(ref)); await assert.rejects(c.r.writeBytes(ref, Buffer.from('CANARY')))
  }
})
test('R: Junction into external test root rejects before outside read/write', async () => {
  const c = await setup(), other = await setup(), parent = target(c, 'docs/evaluation-results/execution-checkpoints')
  await fs.mkdir(parent); await fs.symlink(other.root, path.join(parent, c.runId), process.platform === 'win32' ? 'junction' : 'dir')
  const before = await capture(other); await assert.rejects(createPaidExecutionSession(c.args)); assert.deepEqual(await capture(other), before)
})
test('S: eight reconciliation contenders keep one immutable terminal and bounded losers', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args), stopped = c.h.crash(s)
  const r = await Promise.allSettled(Array.from({ length: 8 }, () => reconcile(c, stopped)))
  assert.ok(r.some(x => x.status === 'fulfilled')); const persisted = (await c.r.rawRead(c.r.refs.execution)).bytes
  for (const x of r.filter(x => x.status === 'fulfilled')) assert.deepEqual(bytes(x.value), persisted)
})
test('T: actual production subprocess rejects construction/authority/session/inspection/reconciliation', () => {
  const script = `import assert from 'node:assert/strict'; import * as f from './lib/server/learning-v2/tutor/evaluation/paid-execution-framework.js'; import {createPaidRepository} from './lib/server/learning-v2/tutor/evaluation/paid-execution-repository.js'; const args={repositoryRoot:process.cwd(),runId:'test-paid-prod',authority:{}}; assert.throws(()=>createPaidRepository({repositoryRoot:process.cwd(),runId:args.runId,faultCapability:null})); assert.equal(f.paidExecutionReadiness({runId:args.runId,authority:{}}).ready,false); await assert.rejects(f.createPaidExecutionSession(args)); await assert.rejects(f.inspectPaidExecution(args)); await assert.rejects(f.reconcilePaidExecution({...args,reconciliationAuthority:{},commit:true})); console.log('production denied');`
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
})
test('U/V/W: all paid artifact bytes exclude canaries and actual v9 identity is absent at every path', async () => {
  for (const a of family) for (const k of ['learner_message', 'learner_answer', 'hidden_answer', 'raw_request', 'raw_response', 'raw_provider_error', 'secret', 'tenant_id', 'student_id']) assert.equal(canon(a).includes('"' + k + '"'), false)
  const walk = async dir => { for (const e of await fs.readdir(dir, { withFileTypes: true })) { assert.equal(e.name.includes('tutor-paid-evaluation-v9-r1-r2-run-1-v1'), false); if (e.isDirectory()) await walk(path.join(dir, e.name)) } }
  await walk(path.join(process.cwd(), 'docs/evaluation-results'))
  for (const name of ['framework', 'contract', 'accounting', 'repository']) {
    const source = await fs.readFile(path.join(process.cwd(), 'lib/server/learning-v2/tutor/evaluation/paid-execution-' + name + '.js'), 'utf8')
    assert.doesNotMatch(source, /from ['"](?:mongodb|openai|node:https|node:http)['"]|\.collection\(|\bfetch\(/)
  }
})
