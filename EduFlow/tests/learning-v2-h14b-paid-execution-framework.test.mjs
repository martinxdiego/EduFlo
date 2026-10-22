import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import test, { before, after } from 'node:test'
import { createInternalPaidExecutionTestHarness, createPaidExecutionSession, inspectPaidExecution,
  reconcilePaidExecution, paidExecutionReadiness } from '../lib/server/learning-v2/tutor/evaluation/paid-execution-framework.js'
import { createInternalPaidFilesystemFault, createPaidRepository, paidCheckpointName } from '../lib/server/learning-v2/tutor/evaluation/paid-execution-repository.js'
import { PAID_EXECUTION_DOMAIN, PAID_EXECUTION_VERSION, PAID_EXECUTION_CAUSES, PAID_EXECUTION_PHASES, PAID_PROOF_NAMES,
  paidArtifactSchemas, paidCaseFactsSchema, sealPaidArtifact, verifyPaidArtifact, verifyPaidArtifactBytes,
  paidFileHash, paidPaths, paidBlocked } from '../lib/server/learning-v2/tutor/evaluation/paid-execution-contract.js'
import { paidKnownUsage, derivePaidAccounting, paidUnknownFacts, paidNextReservationFailure } from '../lib/server/learning-v2/tutor/evaluation/paid-execution-accounting.js'
import { jcsUtf8Bytes } from '../lib/server/learning-v2/tutor/evaluation/human-review-canonical.js'
import { localTutorFallback } from '../lib/server/learning-v2/tutor/fallback-registry.js'
import { LEARNING_V2_DATA_INVENTORY_VERSION, LEARNING_V2_DATA_INVENTORY } from '../lib/server/learning-v2/privacy/data-inventory-v1.js'

const roots = [], oldEnv = process.env.NODE_ENV
let serial = 0, full, failedSafety, failedPacket, family
const good = f => ({ kind: 'PROVIDER_CANDIDATE', candidate: localTutorFallback(f.level), usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140 } })
async function setup(event = good, fault = null, fallback = null) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'paid-execution-test-')); roots.push(root)
  const runId = `test-paid-v9-${String(++serial).padStart(3, '0')}`
  const h = await createInternalPaidExecutionTestHarness({ repositoryRoot: root, runId, eventForFixture: event,
    faultCapability: fault, fallbackFactory: fallback })
  return { root, runId, h, args: { repositoryRoot: root, runId, authority: h.authority }, r: h.repository }
}
async function next(s) { const p = await s.prepare(); await s.invoke(p); return s.settle() }
async function all(ctx) { ctx.s = await createPaidExecutionSession(ctx.args); for (let i = 0; i < 120; i++) await next(ctx.s); await ctx.s.complete(); return ctx }
function unsigned(a) { const { artifact_digest, ...b } = structuredClone(a); return b }
async function artifact(ctx, name) { return (await ctx.r.read(ctx.r.refs[name])).value }
async function overwrite(ctx, ref, bytes) { await fs.writeFile(path.join(ctx.root, ...ref.split('/')), bytes) }
const facts = usage => ({ transport_started: true, transport_outcome: 'RESPONSE_RECEIVED', usage_status: 'KNOWN', ...paidKnownUsage(usage),
  unknown_reservation_applied: false, provider_technical_cause: null, fallback_used: false, final_outcome_status: 'PROVIDER_ACCEPTED', case_completed: true })
before(async () => {
  process.env.NODE_ENV = 'test'
  full = await all(await setup())
  full.terminal = await full.s.finalize()
  const files = await full.r.checkpointEntries()
  family = [await artifact(full, 'authorization'), await artifact(full, 'attestation'), await artifact(full, 'claim'), full.terminal]
  for (const i of [1, 2, 241, 242, 243, 244]) family.push((await full.r.read(`${full.r.refs.checkpoints}/${paidCheckpointName(i)}`)).value)
  assert.equal(files.length, 244)
})
after(async () => {
  if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv
  for (const root of roots) {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()))
    assert.ok(path.basename(root).startsWith('paid-execution-test-'))
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('all ten strict tagged family variants validate and reject unknown kinds', () => {
  assert.equal(Object.keys(paidArtifactSchemas).length, 10)
  for (const a of family) assert.equal(verifyPaidArtifact(a).artifact_kind, a.artifact_kind)
  assert.throws(() => sealPaidArtifact({ ...unsigned(family[0]), artifact_kind: 'RAW_EVENT' }))
})
test('root and nested unknown fields fail closed for every family variant', () => {
  for (const a of family) assert.throws(() => sealPaidArtifact({ ...unsigned(a), raw_error: 'CANARY' }))
  const a = unsigned(family[0]); a.limits.secret = 'CANARY'; assert.throws(() => sealPaidArtifact(a))
  const b = unsigned(family[1]); b[PAID_PROOF_NAMES[0]].tenant_id = 'CANARY'; assert.throws(() => sealPaidArtifact(b))
})
test('self digest uses the exact NUL domain and complete file hash includes the embedded digest', () => {
  assert.equal(PAID_EXECUTION_DOMAIN, 'EDUFLOW\0H14B\0PAID_EXECUTION_RECORD\0v1\0')
  const a = family[0], body = unsigned(a)
  const expected = 'sha256:' + createHash('sha256').update(Buffer.from(PAID_EXECUTION_DOMAIN)).update(jcsUtf8Bytes(body)).digest('hex')
  assert.equal(a.artifact_digest, expected); assert.notEqual(paidFileHash(jcsUtf8Bytes(a)), expected)
})
test('complete-file verification rejects whitespace, corruption and wrong cross digest', () => {
  const bytes = jcsUtf8Bytes(family[0]); assert.deepEqual(verifyPaidArtifactBytes(bytes, paidFileHash(bytes)), family[0])
  assert.throws(() => verifyPaidArtifactBytes(Buffer.concat([bytes, Buffer.from('\n')])))
  assert.throws(() => verifyPaidArtifactBytes(bytes, 'sha256:' + '0'.repeat(64)))
})
test('fractional numbers and invalid Unicode cannot enter any signed record', () => {
  const a = unsigned(family[0]); a.limits.budget_cap_usd_micros = 1.5; assert.throws(() => sealPaidArtifact(a))
  a.approved_by = '\uD800'; assert.throws(() => sealPaidArtifact(a))
})
test('operations proof shape and nested exact run/hash binding are enforced', () => {
  const a = unsigned(family[1]); a[PAID_PROOF_NAMES[0]].value = false; assert.throws(() => sealPaidArtifact(a))
  const b = unsigned(family[1]); b[PAID_PROOF_NAMES[0]].run_id = 'test-paid-other'; assert.throws(() => sealPaidArtifact(b))
})
test('fake operator and Boolean environment authority cannot create a Claim', async () => {
  const c = await setup()
  await assert.rejects(createPaidExecutionSession({ ...c.args, authority: { approved: true, apiKey: 'fake' } }))
  const a = unsigned(await artifact(c, 'attestation')); a[PAID_PROOF_NAMES[0]].attested_by = 'fake-operator'
  await overwrite(c, c.r.refs.attestation, jcsUtf8Bytes(sealPaidArtifact(a)))
  await assert.rejects(createPaidExecutionSession(c.args))
  assert.equal(await c.r.rawRead(c.r.refs.claim, true), null)
})
test('authorization pins exact tuple, limits, paths and trusted creation time', async () => {
  for (const [key, value] of [['model', 'other'], ['prompt_digest', 'sha256:' + '0'.repeat(64)], ['max_retries', 1], ['result_ref', 'docs/evaluation-results/foreign.result.json']]) {
    assert.throws(() => sealPaidArtifact({ ...unsigned(family[0]), [key]: value }))
  }
  const c = await setup(); await assert.rejects(createPaidExecutionSession({ ...c.args, claimed_at: '2000-01-01T00:00:00.000Z' }))
})
test('one exclusive Claim winner; loser performs zero injected transport', async () => {
  let calls = 0; const c = await setup(f => { calls++; return good(f) })
  const winners = await Promise.allSettled([createPaidExecutionSession(c.args), createPaidExecutionSession(c.args)])
  assert.equal(winners.filter(x => x.status === 'fulfilled').length, 1); assert.equal(calls, 0)
})
test('partial/empty Claim is an immutable consumed-or-ambiguous tombstone', async () => {
  const c = await setup(); await c.r.writeBytes(c.r.refs.claim, Buffer.alloc(0))
  await assert.rejects(createPaidExecutionSession(c.args)); assert.equal((await c.r.rawRead(c.r.refs.claim)).bytes.length, 0)
})
test('fixed paths reject traversal, arbitrary artifact name, wrong-kind target and oversized artifact', async () => {
  assert.throws(() => paidPaths('../escape'))
  const c = await setup(); await assert.rejects(c.r.writeBytes('docs/evaluation-results/escape.json', Buffer.alloc(0)))
  await assert.rejects(c.r.write(c.r.refs.claim, await artifact(c, 'authorization')))
  assert.throws(() => paidCheckpointName(245))
})
test('symlink or Windows Junction directory traversal is rejected', async () => {
  const c = await setup(), dest = await fs.mkdtemp(path.join(tmpdir(), 'paid-execution-test-')); roots.push(dest)
  const parent = path.join(c.root, 'docs/evaluation-results/execution-checkpoints')
  await fs.rename(path.join(parent, c.runId), path.join(parent, c.runId + '-held'))
  await fs.symlink(dest, path.join(parent, c.runId), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(createPaidExecutionSession(c.args))
})
test('sequence ordinal, predecessor and kind cannot be supplied by callers', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args)
  await assert.rejects(s.prepare({ case_ordinal: 2, previous_checkpoint_sha256: 'sha256:' + '0'.repeat(64) }))
  assert.equal((await c.r.checkpointEntries()).length, 0)
})
test('preparation is durable before the transport double and starts remain ambiguous until settlement', async () => {
  let observed = false, c
  c = await setup(async f => { const v = await inspectPaidExecution(c.args); observed = v.accounting.unknown_usage_call_count === 1; return good(f) })
  const s = await createPaidExecutionSession(c.args), p = await s.prepare()
  assert.equal((await inspectPaidExecution(c.args)).accounting.started_transport_count, null)
  await s.invoke(p); await s.settle(); assert.equal(observed, true)
})
test('duplicate prepare has one slot winner and cannot create a second permission', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args)
  const r = await Promise.allSettled([s.prepare(), s.prepare()]); assert.equal(r.filter(x => x.status === 'fulfilled').length, 1)
  assert.equal((await c.r.checkpointEntries()).length, 1)
})
test('existing prepared checkpoint cannot reauthorize a new session', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args); await s.prepare()
  await assert.rejects(createPaidExecutionSession(c.args))
})
test('transport guard consumes permission before invocation and rejects duplicate use', async () => {
  let calls = 0; const c = await setup(f => { calls++; return good(f) }), s = await createPaidExecutionSession(c.args), p = await s.prepare()
  await s.invoke(p); await assert.rejects(s.invoke(p)); assert.equal(calls, 1)
})
test('no next case before durable settlement and no caller-supplied settlement facts', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args), p = await s.prepare(); await s.invoke(p)
  await assert.rejects(s.prepare()); assert.equal((await c.r.checkpointEntries()).length, 1)
  const d = await setup(), t = await createPaidExecutionSession(d.args); await assert.rejects(t.settle({ case_completed: true }))
})
test('known accounting uses exact integer micros and old COMPLETE maps to KNOWN', () => {
  const a = derivePaidAccounting([{ facts: facts({ input_tokens: 100, output_tokens: 40, total_tokens: 140 }) }])
  assert.equal(a.known_actual_cost_usd_micros, 680); assert.equal(a.actual_cost_status, 'KNOWN'); assert.equal(a.actual_cost_usd_micros, 680)
})
test('unknown accounting preserves known costs separately and reserves full amount', () => {
  const a = derivePaidAccounting([{ facts: facts({ input_tokens: 100, output_tokens: 40, total_tokens: 140 }) }, { facts: paidUnknownFacts() }])
  assert.equal(a.actual_cost_status, 'PARTIAL_UNKNOWN'); assert.equal(a.actual_cost_usd_micros, null)
  assert.equal(a.known_actual_cost_usd_micros, 680); assert.equal(a.conservative_total_cost_upper_bound_usd_micros, 82600)
})
test('zero-call accounting is known zero independent of consumed Claim', () => {
  const a = derivePaidAccounting([]); assert.equal(a.actual_cost_usd_micros, 0); assert.equal(a.completed_case_count, 0)
})
test('120 unknown reservations cost 9830400 micros and a 121st call is refused', () => {
  const a = derivePaidAccounting(Array.from({ length: 120 }, () => ({ facts: paidUnknownFacts() })))
  assert.equal(a.conservative_total_cost_upper_bound_usd_micros, 9830400); assert.equal(a.remaining_budget_upper_bound_usd_micros, 169600)
  assert.equal(paidNextReservationFailure(a), 'CALL_LIMIT')
})
test('TOKEN and BUDGET constraints fail closed without hiding negative headroom', () => {
  const a = derivePaidAccounting([{ facts: facts({ input_tokens: 6000000, output_tokens: 0, total_tokens: 6000000 }) }])
  assert.equal(a.remaining_budget_upper_bound_usd_micros, -2000000); assert.equal(paidNextReservationFailure(a), 'TOKEN_LIMIT')
  const b = { ...derivePaidAccounting([]), conservative_total_cost_upper_bound_usd_micros: 9999999, remaining_budget_upper_bound_usd_micros: 1 }
  assert.equal(paidNextReservationFailure(b), 'BUDGET_LIMIT')
})
test('per-call breach plus unknown usage makes bounds UNPROVABLE and prevents continuation', () => {
  const a = derivePaidAccounting([{ facts: facts({ input_tokens: 40001, output_tokens: 0, total_tokens: 40001 }) }, { facts: paidUnknownFacts() }])
  assert.equal(a.bounds_status, 'UNPROVABLE'); assert.equal(a.conservative_total_cost_upper_bound_usd_micros, null)
  assert.equal(a.remaining_budget_upper_bound_usd_micros, null); assert.ok(paidNextReservationFailure(a))
})
test('cross-field settlement contradictions are rejected', () => {
  const f = facts({ input_tokens: 100, output_tokens: 40, total_tokens: 140 })
  for (const patch of [{ transport_started: false }, { case_completed: false }, { unknown_reservation_applied: true },
    { known_total_tokens: 141 }, { fallback_used: true }, { transport_outcome: 'TIMEOUT' }]) assert.equal(paidCaseFactsSchema.safeParse({ ...f, ...patch }).success, false)
})
test('crash after Claim preserves consumed authorization and zero starts', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args), proof = c.h.crash(s)
  const r = await reconcilePaidExecution({ ...c.args, reconciliationAuthority: proof, commit: true })
  assert.equal(r.execution_completion, 'NOT_STARTED'); assert.equal(r.accounting.started_transport_count, 0)
  await assert.rejects(createPaidExecutionSession(c.args))
})
test('crash after prepare reserves a possibly-started call even before actual invocation', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args); await s.prepare(); const proof = c.h.crash(s)
  const r = await reconcilePaidExecution({ ...c.args, reconciliationAuthority: proof, commit: true })
  assert.equal(r.accounting.unknown_usage_call_count, 1); assert.equal(r.accounting.started_transport_count, null)
  assert.equal(r.accounting.conservative_total_cost_upper_bound_usd_micros, 81920)
})
test('crash after invocation cannot upgrade accounting from lost response memory', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args), p = await s.prepare(); await s.invoke(p)
  const proof = c.h.crash(s), r = await reconcilePaidExecution({ ...c.args, reconciliationAuthority: proof, commit: true })
  assert.equal(r.accounting.known_actual_cost_usd_micros, 0); assert.equal(r.accounting.actual_cost_usd_micros, null)
  assert.equal(c.h.transientCount(s), 0)
})
test('missing usage safely falls back and continues within the same live process', async () => {
  const c = await setup(f => ({ ...good(f), usage: null })), s = await createPaidExecutionSession(c.args)
  const first = await next(s); assert.equal(first.final_outcome_status, 'LOCAL_FALLBACK_ACCEPTED')
  await next(s); const v = await inspectPaidExecution(c.args); assert.equal(v.accounting.unknown_usage_call_count, 2)
})
test('settlement persistence failure prevents another case and preserves reservation', async () => {
  const fault = createInternalPaidFilesystemFault((stage, ref) => { if (stage === 'before-create' && ref.endsWith('001.settled.json')) throw paidBlocked('ARTIFACT_WRITE_FAILURE') })
  const c = await setup(good, fault), s = await createPaidExecutionSession(c.args), p = await s.prepare(); await s.invoke(p)
  await assert.rejects(s.settle()); await assert.rejects(s.prepare()); assert.equal(c.h.transientCount(s), 0)
  assert.equal((await inspectPaidExecution(c.args)).accounting.unknown_usage_call_count, 1)
})
test('crash between settled cases prohibits original and successor transport', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args); await next(s); c.h.crash(s)
  await assert.rejects(s.prepare()); await assert.rejects(createPaidExecutionSession(c.args))
  assert.equal((await inspectPaidExecution(c.args)).accounting.started_transport_count, 1)
})
test('reconciliation cannot accept transport, counts, cause, time or fake stopped-owner proof', async () => {
  const c = await setup(); await createPaidExecutionSession(c.args)
  await assert.rejects(reconcilePaidExecution({ ...c.args, reconciliationAuthority: {}, commit: true }))
  await assert.rejects(reconcilePaidExecution({ ...c.args, reconciliationAuthority: null, commit: false, transport: () => {}, terminal_cause: 'COMPLETED' }))
  const v = await reconcilePaidExecution({ ...c.args, reconciliationAuthority: null, commit: false }); assert.equal(v.status, 'PROVISIONAL')
  assert.equal(await c.r.rawRead(c.r.refs.execution, true), null)
})
test('partial execution cannot produce Result v5 or pad missing cases', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args); await next(s); await assert.rejects(s.complete())
  assert.equal(await c.r.rawRead(c.r.refs.result, true), null)
})
test('full Result v5 is exact, complete-file bound, transitive run-bound and schema unchanged', async () => {
  const r = await full.r.rawRead(full.r.refs.result), v = JSON.parse(r.bytes)
  assert.equal(v.fixtures_completed, 120); assert.equal(v.source_run_id, full.runId); assert.equal('run_contract_hash' in v, false)
  assert.equal(full.terminal.result_sha256, r.sha256); assert.equal(full.terminal.run_contract_hash, family[2].run_contract_hash)
})
test('full 120-case safety-fail Result is allowed but Packet is prohibited', async () => {
  failedSafety = await all(await setup(f => f.case_id.endsWith('120') ? { kind: 'PROVIDER_FAILURE', code: 'PROVIDER_TIMEOUT', usage: null } : good(f), null, () => ({})))
  const r = JSON.parse((await failedSafety.r.rawRead(failedSafety.r.refs.result)).bytes)
  assert.equal(r.coverage_complete, true); assert.equal(r.system_safety_pass, false)
  assert.equal(await failedSafety.r.rawRead(failedSafety.r.refs.packet, true), null)
  const final = await failedSafety.s.finalize(); assert.equal(final.terminal_cause, 'FINAL_FALLBACK_SAFETY_FAILURE')
})
test('material intent precedes sample and Packet writes; final references are verified', async () => {
  const mp = (await full.r.read(`${full.r.refs.checkpoints}/review-material.prepared.json`)).value
  assert.equal(mp.sequence, 243); assert.equal(mp.sample_sha256, (await full.r.rawRead(full.r.refs.sample)).sha256)
  assert.equal(mp.packet_sha256, (await full.r.rawRead(full.r.refs.packet)).sha256)
  assert.equal(full.terminal.review_material_state, 'REVIEW_MATERIAL_READY')
})
test('Packet write failure preserves complete Result and exact accounting, blocks material without replay', async () => {
  let calls = 0
  const fault = createInternalPaidFilesystemFault((stage, ref) => { if (stage === 'after-create' && ref.endsWith('/review-packet.json')) throw paidBlocked('ARTIFACT_WRITE_FAILURE') })
  failedPacket = await all(await setup(f => { calls++; return good(f) }, fault))
  const final = await failedPacket.s.finalize()
  assert.equal(calls, 120); assert.equal(final.result_state, 'PERSISTED_VERIFIED'); assert.equal(final.review_material_state, 'BLOCKED')
  assert.equal(final.accounting.actual_cost_usd_micros, 81600); assert.equal(final.terminal_cause, 'ARTIFACT_WRITE_FAILURE')
  assert.equal((await failedPacket.r.rawRead(failedPacket.r.refs.packet)).bytes.length, 0)
})
test('transient output pool is disposed after success, safety failure and Packet failure', () => {
  for (const c of [full, failedSafety, failedPacket]) assert.equal(c.h.transientCount(c.s), 0)
})
test('terminal record cannot take caller-derived lifecycle, totals or timestamp', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args)
  await assert.rejects(s.finalize({ terminal_cause: 'COMPLETED', terminalized_at: '2000-01-01T00:00:00.000Z' }))
  assert.equal(await c.r.rawRead(c.r.refs.execution, true), null)
})
test('resealed forged terminal totals fail artifact-chain verification', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args), proof = c.h.crash(s)
  const a = await reconcilePaidExecution({ ...c.args, reconciliationAuthority: proof, commit: true })
  const b = unsigned(a); b.accounting.known_actual_cost_usd_micros = 1
  await overwrite(c, c.r.refs.execution, jcsUtf8Bytes(sealPaidArtifact(b)))
  assert.equal((await inspectPaidExecution(c.args)).terminal_state, 'BLOCKED_INVALID')
  assert.equal((await reconcilePaidExecution({ ...c.args, reconciliationAuthority: null, commit: false })).terminal_state, 'BLOCKED_INVALID')
})
test('terminal causes are closed and provider failures do not become automatic run aborts', async () => {
  assert.equal(PAID_EXECUTION_CAUSES.includes('PROVIDER_TIMEOUT'), false); assert.equal(PAID_EXECUTION_PHASES.includes('RECONCILIATION'), true)
  for (const code of ['PROVIDER_TIMEOUT', 'PROVIDER_NETWORK_ERROR', 'PROVIDER_SCHEMA_PARSE_ERROR']) {
    const c = await setup(() => ({ kind: 'PROVIDER_FAILURE', code, usage: null })), s = await createPaidExecutionSession(c.args)
    await next(s); await next(s); assert.equal((await inspectPaidExecution(c.args)).accounting.completed_case_count, 2)
  }
})
test('one terminal-record race winner and repeated read is idempotent', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args), proof = c.h.crash(s)
  const input = { ...c.args, reconciliationAuthority: proof, commit: true }
  const outcomes = await Promise.allSettled([reconcilePaidExecution(input), reconcilePaidExecution(input)])
  assert.ok(outcomes.some(x => x.status === 'fulfilled'))
  const bytes = (await c.r.rawRead(c.r.refs.execution)).bytes; await reconcilePaidExecution(input)
  assert.deepEqual((await c.r.rawRead(c.r.refs.execution)).bytes, bytes)
})
test('invalid terminal file is never replaced', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args), proof = c.h.crash(s)
  await c.r.writeBytes(c.r.refs.execution, Buffer.from('{'))
  await assert.rejects(reconcilePaidExecution({ ...c.args, reconciliationAuthority: proof, commit: true }))
  assert.equal((await c.r.rawRead(c.r.refs.execution)).bytes.toString(), '{')
})
test('cross-run authority, permission and checkpoint transplantation fail closed', async () => {
  const c = await setup(), d = await setup(); await assert.rejects(createPaidExecutionSession({ ...c.args, authority: d.h.authority }))
  const s = await createPaidExecutionSession(c.args), t = await createPaidExecutionSession(d.args), p = await s.prepare()
  await assert.rejects(t.invoke(p))
})
test('missing operations proof is classified as BLOCKED without alternate store or real authority', async () => {
  const c = await setup(); c.h.setOperationsReady(false)
  assert.equal((await paidExecutionReadiness({ runId: c.runId, authority: c.h.authority })).ready, false)
  await assert.rejects(createPaidExecutionSession(c.args))
  assert.equal((await paidExecutionReadiness({ runId: 'test-paid-x', authority: {} })).classifications.operator_proofs, 'TRUSTED_OPERATOR_ATTESTATION')
})
test('all accounting artifacts exclude messages, raw Provider data and Learning Truth authority', () => {
  const bytes = JSON.stringify(family)
  for (const forbidden of ['learner_message', 'correctAnswer', 'raw_response', 'raw_error', 'prompt_text', 'tenant_id', 'student_id']) assert.equal(bytes.includes('"' + forbidden + '"'), false)
  assert.equal(full.terminal.learning_authority, 'NONE'); assert.equal(full.terminal.evidence_effect, 'NONE'); assert.equal(full.terminal.learning_truth_mutations, 0)
})
test('framework imports no database or HTTP client and introduces no Mongo collection', async () => {
  for (const file of ['paid-execution-contract.js', 'paid-execution-accounting.js', 'paid-execution-repository.js', 'paid-execution-framework.js']) {
    const source = await fs.readFile(new URL('../lib/server/learning-v2/tutor/evaluation/' + file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /from ['"](?:mongodb|openai|node:https|node:http)['"]|\.collection\(|\bfetch\(/)
  }
})
test('Production process cannot instantiate or use framework and test authority cannot escape test mode', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    "import {paidExecutionReadiness} from './lib/server/learning-v2/tutor/evaluation/paid-execution-framework.js'; console.log(JSON.stringify(await paidExecutionReadiness({runId:'test-paid-x',authority:{}})));"],
  { cwd: new URL('..', import.meta.url), env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8' })
  assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).ready, false)
})
test('real proposed v9 identity remains absent and cannot be used by test provisioning', async () => {
  const run = 'tutor-paid-evaluation-v9-r1-r2-run-1-v1'
  assert.equal((await fs.readdir(new URL('../docs/evaluation-results/', import.meta.url))).some(n => n.includes(run)), false)
  await assert.rejects(createInternalPaidExecutionTestHarness({ repositoryRoot: full.root, runId: run, eventForFixture: good, faultCapability: null, fallbackFactory: null }))
})
test('H12 v22 inventories the no-expiry paid audit family separately from Human Review retention', () => {
  assert.equal(LEARNING_V2_DATA_INVENTORY_VERSION, 'learning-v2-data-inventory-v23')
  const e = LEARNING_V2_DATA_INVENTORY.entries.find(e => e.id === 'tutor_paid_execution_artifacts')
  assert.ok(e); assert.equal(e.learning_authority, 'none'); assert.equal(e.retention.status, 'no_automatic_expiry')
})
