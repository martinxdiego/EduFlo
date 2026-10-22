import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import test, { before, after } from 'node:test'
import { createInternalPaidExecutionTestHarness, createPaidExecutionSession, inspectPaidExecution, reconcilePaidExecution } from '../lib/server/learning-v2/tutor/evaluation/paid-execution-framework.js'
import { paidCheckpointName } from '../lib/server/learning-v2/tutor/evaluation/paid-execution-repository.js'
import { PAID_EXECUTION_DOMAIN } from '../lib/server/learning-v2/tutor/evaluation/paid-execution-contract.js'
import { localTutorFallback } from '../lib/server/learning-v2/tutor/fallback-registry.js'
const prior = process.env.NODE_ENV, roots = []
let serial = 0, full
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v)
// Independent adversarial encoding: intentionally bypass schema validation and the app sealer.
function reseal(value) {
  const b = structuredClone(value); delete b.artifact_digest
  return Buffer.from(canonical({ ...b, artifact_digest: hash(Buffer.concat([Buffer.from(PAID_EXECUTION_DOMAIN), Buffer.from(canonical(b))])) }))
}
const file = (c, ref) => path.join(c.root, ref)
const checkpoint = (c, index) => `${c.r.refs.checkpoints}/${paidCheckpointName(index)}`
async function setup(unknown = false) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'paid-execution-test-fia01-')); roots.push(root)
  const runId = `test-paid-fia01-${++serial}`; let calls = 0
  const h = await createInternalPaidExecutionTestHarness({ repositoryRoot: root, runId, faultCapability: null, fallbackFactory: null,
    eventForFixture: f => { calls++; return { kind: 'PROVIDER_CANDIDATE', candidate: localTutorFallback(f.level), usage: unknown ? null : { input_tokens: 70, output_tokens: 30, total_tokens: 100 } } } })
  return { root, runId, h, r: h.repository, args: { repositoryRoot: root, runId, authority: h.authority }, calls: () => calls }
}
async function round(s) { const p = await s.prepare(); await s.invoke(p); await s.settle() }
async function bytesSnapshot(c) {
  const refs = [...Object.values(c.r.refs).filter(v => v !== c.r.refs.checkpoints), ...(await c.r.checkpointEntries()).map(n => `${c.r.refs.checkpoints}/${n}`)]
  return Object.fromEntries(await Promise.all(refs.map(async ref => {
    try { return [ref, hash(await fs.readFile(file(c, ref)))] } catch (e) { if (e.code === 'ENOENT') return [ref, null]; throw e }
  })))
}
async function projection(c, expectedCount, invalidRef, knownCost, unknownCalls = 0) {
  const a = await inspectPaidExecution(c.args), b = await reconcilePaidExecution({ ...c.args, reconciliationAuthority: null, commit: false })
  const { status, material_ready, ...same } = b; assert.equal(status, 'PROVISIONAL'); assert.deepEqual(a, same)
  assert.equal(a.claim_state, 'CONSUMED_VERIFIED'); assert.equal(a.execution_prefix_state, 'BLOCKED_VALID_PREFIX')
  assert.equal(a.verified_checkpoint_count, expectedCount); assert.equal(a.checkpoint_count, expectedCount)
  assert.equal(a.accounting_state, 'VERIFIED_PREFIX_ONLY'); assert.equal(a.blocking_integrity_state, 'BLOCKED')
  assert.equal(a.first_invalid_checkpoint_ref, invalidRef); assert.ok(['DIGEST_MISMATCH', 'EXECUTION_DRIFT', 'TOKEN_LIMIT', 'ARTIFACT_READBACK_FAILURE', 'AUTHORIZATION_INVALID'].includes(a.first_invalid_checkpoint_reason))
  assert.equal(a.checkpoint_head, hash(await fs.readFile(file(c, expectedCount ? checkpoint(c, expectedCount) : c.r.refs.claim))))
  assert.equal(a.accounting.known_actual_cost_usd_micros, knownCost); assert.equal(a.accounting.unknown_usage_call_count, unknownCalls)
  assert.equal(a.next_checkpoint_state, 'PRESENT_BUT_INVALID'); assert.equal(a.terminal_evidence_state, 'BLOCKED_PREFIX_INVALID')
  assert.equal(a.terminal_verified, false); assert.equal(a.replay_allowed, false); assert.equal(a.resume_allowed, false)
  return a
}
async function blockedOwner(c, s, permission) {
  const before = await bytesSnapshot(c), calls = c.calls()
  if (permission) await assert.rejects(s.invoke(permission))
  await assert.rejects(s.prepare()); await assert.rejects(s.settle()); await assert.rejects(s.complete()); await assert.rejects(s.finalize())
  await assert.rejects(createPaidExecutionSession(c.args))
  const proof = c.h.crash(s)
  await assert.rejects(reconcilePaidExecution({ ...c.args, reconciliationAuthority: proof, commit: true }))
  assert.deepEqual(await bytesSnapshot(c), before); assert.equal(c.calls(), calls)
}
before(async () => {
  process.env.NODE_ENV = 'test'; full = await setup(); full.s = await createPaidExecutionSession(full.args)
  for (let n = 0; n < 120; n++) await round(full.s)
  await full.s.complete(); full.t = await full.s.finalize()
})
after(async () => {
  for (const root of roots) { assert.equal(path.dirname(root), path.resolve(tmpdir())); assert.ok(path.basename(root).startsWith('paid-execution-test-fia01-')); await fs.rm(root, { recursive: true, force: true }) }
  if (prior === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prior
})
const corruptions = [
  ['predecessor', b => { b.previous_checkpoint_sha256 = 'sha256:' + 'f'.repeat(64) }],
  ['Claim hash', b => { b.claim_sha256 = 'sha256:' + 'f'.repeat(64) }],
  ['Authorization hash', b => { b.authorization_sha256 = 'sha256:' + 'f'.repeat(64) }],
  ['Authorization ref', b => { b.authorization_ref = 'test-paid-forged-authorization' }],
  ['case_id', b => { b.case_id = 'test-paid-wrong-case' }],
  ['ordinal', b => { b.case_ordinal = 3 }],
  ['owner', b => { b.execution_owner_ref = 'test-paid-wrong-owner' }],
  ['run_id', b => { b.run_id = 'test-paid-wrong-run' }],
  ['run contract hash', b => { b.run_contract_hash = 'sha256:' + 'f'.repeat(64) }],
  ['backdated timestamp', b => { b.created_at = '2000-01-01T00:00:00.000Z' }],
  ['future timestamp', b => { b.created_at = '2099-01-01T00:00:00.000Z' }],
  ['duplicate sequence', b => { b.sequence = 2 }],
  ['skipped sequence', b => { b.sequence = 4 }],
  ['schema invalid', b => { delete b.reservation }],
  ['malformed JSON', () => Buffer.from('{')],
  ['self digest mismatch', b => Buffer.from(canonical({ ...b, artifact_digest: 'sha256:' + 'f'.repeat(64) }))],
  ['noncanonical complete bytes', b => Buffer.from(JSON.stringify(b, null, 2))],
  ['illegal phase transition', b => { b.artifact_kind = 'RESULT_PREPARED'; delete b.reservation; delete b.case_id; delete b.case_ordinal; b.result_ref = `docs/evaluation-results/${b.run_id}.result.json`; b.result_sha256 = 'sha256:' + 'f'.repeat(64) }],
]
for (const [name, corrupt] of corruptions) test(`FIA01 ${name}: two verified checkpoints survive with no later facts or continuation`, async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args); await round(s); await round(s); const permission = await s.prepare()
  const ref = checkpoint(c, 3), b = structuredClone((await c.r.read(ref)).value), result = corrupt(b)
  await fs.writeFile(file(c, ref), Buffer.isBuffer(result) ? result : reseal(b))
  const before = await bytesSnapshot(c), a = await projection(c, 2, ref, 500)
  assert.equal(a.accounting.completed_case_count, 1); assert.equal(a.cases.length, 1); assert.equal(a.result_verified, false)
  assert.equal(a.review_material_eligible, false); assert.equal(a.review_material_ready, false)
  assert.deepEqual(await bytesSnapshot(c), before); await blockedOwner(c, s, permission)
})
test('FIA01 missing interior file cannot skip to a later present sequence', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args); await round(s); await round(s)
  await fs.unlink(file(c, checkpoint(c, 3)))
  await projection(c, 2, checkpoint(c, 4), 500); await blockedOwner(c, s)
  await assert.rejects(fs.stat(file(c, checkpoint(c, 3))))
})
test('FIA01 complete prepared-file hash mismatch stops settlement and retains its unknown reservation', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args); await round(s); await round(s)
  const ref = checkpoint(c, 4), b = structuredClone((await c.r.read(ref)).value); b.prepared_sha256 = 'sha256:' + 'f'.repeat(64)
  await fs.writeFile(file(c, ref), reseal(b)); const a = await projection(c, 3, ref, 500, 1)
  assert.equal(a.accounting.conservative_unknown_usage_cost_usd_micros, 81920); assert.equal(a.cases[1].settled_ref, null); await blockedOwner(c, s)
})
test('FIA01 earlier semantic corruption wins over later malformed JSON', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args); await round(s); await round(s)
  const ref = checkpoint(c, 3), b = structuredClone((await c.r.read(ref)).value); b.case_id = 'test-paid-forged'
  await fs.writeFile(file(c, ref), reseal(b)); await fs.writeFile(file(c, checkpoint(c, 4)), '{')
  const a = await projection(c, 2, ref, 500); assert.equal(a.first_invalid_checkpoint_reason, 'EXECUTION_DRIFT'); await blockedOwner(c, s)
})
test('FIA01 valid unknown-cost settlement survives a later semantic failure', async () => {
  const c = await setup(true), s = await createPaidExecutionSession(c.args); await round(s); await s.prepare()
  const ref = checkpoint(c, 3), b = structuredClone((await c.r.read(ref)).value); b.execution_owner_ref = 'test-paid-forged'
  await fs.writeFile(file(c, ref), reseal(b)); const a = await projection(c, 2, ref, 0, 1)
  assert.equal(a.accounting.completed_case_count, 1); assert.equal(a.accounting.actual_cost_usd_micros, null)
  assert.equal(a.accounting.conservative_total_cost_upper_bound_usd_micros, 81920); await blockedOwner(c, s)
})
test('FIA01 absent next checkpoint is a normal prefix, not an invalid presence', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args); await round(s)
  const a = await inspectPaidExecution(c.args)
  assert.equal(a.verified_checkpoint_count, 2); assert.equal(a.next_checkpoint_state, 'ABSENT'); assert.equal(a.first_invalid_checkpoint_ref, null)
  assert.equal(a.first_invalid_checkpoint_reason, null); assert.equal(a.blocking_integrity_state, 'CLEAR'); assert.equal(a.accounting.known_actual_cost_usd_micros, 500)
  await s.prepare(); assert.equal((await inspectPaidExecution(c.args)).verified_checkpoint_count, 3)
})
for (const index of [1, 2, 119, 240, 241, 242, 243, 244]) test(`FIA01 corruption at sequence ${index} preserves exact upstream layers from the full run`, async () => {
  const ref = checkpoint(full, index), old = await fs.readFile(file(full, ref)), b = JSON.parse(old)
  b.previous_checkpoint_sha256 = 'sha256:' + 'f'.repeat(64)
  try {
    await fs.writeFile(file(full, ref), reseal(b)); const before = await bytesSnapshot(full)
    const settled = Math.min(120, Math.floor((index - 1) / 2)), unknown = index <= 240 && index % 2 === 0 ? 1 : 0
    const a = await projection(full, index - 1, ref, settled * 500, unknown)
    assert.equal(a.accounting.completed_case_count, settled)
    assert.equal(a.result_verified, index >= 242); assert.equal(a.review_material_ready, index >= 244)
    assert.equal(a.terminal_state, 'BLOCKED_INVALID'); assert.equal(a.terminal, null)
    await assert.rejects(full.s.finalize()); await assert.rejects(createPaidExecutionSession(full.args))
    await assert.rejects(reconcilePaidExecution({ ...full.args, reconciliationAuthority: {}, commit: true }))
    assert.deepEqual(await bytesSnapshot(full), before)
  } finally { await fs.writeFile(file(full, ref), old) }
})
for (const index of [242, 243, 244]) test(`FIA01 inconsistent cross-phase digest at sequence ${index} stops before trusting the checkpoint`, async () => {
  const ref = checkpoint(full, index), old = await fs.readFile(file(full, ref)), b = JSON.parse(old)
  if (index === 244) b.packet_sha256 = 'sha256:' + 'f'.repeat(64); else b.result_sha256 = 'sha256:' + 'f'.repeat(64)
  try { await fs.writeFile(file(full, ref), reseal(b)); await projection(full, index - 1, ref, 60000) }
  finally { await fs.writeFile(file(full, ref), old) }
})
test('FIA01 terminal corruption preserves the complete verified chain and Material', async () => {
  const ref = full.r.refs.execution, old = await fs.readFile(file(full, ref))
  try {
    await fs.writeFile(file(full, ref), '{'); const before = await bytesSnapshot(full)
    const a = await inspectPaidExecution(full.args), b = await reconcilePaidExecution({ ...full.args, reconciliationAuthority: null, commit: false })
    assert.equal(a.verified_checkpoint_count, 244); assert.equal(a.first_invalid_checkpoint_ref, null); assert.equal(a.terminal_state, 'BLOCKED_INVALID')
    assert.equal(a.accounting.known_actual_cost_usd_micros, 60000); assert.equal(a.result_verified, true); assert.equal(a.review_material_ready, true)
    assert.deepEqual(a.accounting, b.accounting); await assert.rejects(reconcilePaidExecution({ ...full.args, reconciliationAuthority: {}, commit: true }))
    assert.deepEqual(await bytesSnapshot(full), before)
  } finally { await fs.writeFile(file(full, ref), old) }
})
test('FIA01 intact full chain keeps its terminal idempotently readable', async () => {
  const a = await inspectPaidExecution(full.args)
  assert.equal(a.verified_checkpoint_count, 244); assert.equal(a.next_checkpoint_state, 'CHAIN_COMPLETE'); assert.equal(a.first_invalid_checkpoint_reason, null)
  assert.deepEqual(a.terminal, full.t); assert.deepEqual(await reconcilePaidExecution({ ...full.args, reconciliationAuthority: null, commit: true }), full.t)
})
