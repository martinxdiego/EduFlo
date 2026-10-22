import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test, { before, after } from 'node:test'
import { createInternalPaidExecutionTestHarness, createPaidExecutionSession, inspectPaidExecution,
  reconcilePaidExecution, paidExecutionReadiness } from '../lib/server/learning-v2/tutor/evaluation/paid-execution-framework.js'
import { createInternalPaidFilesystemFault, createPaidRepository } from '../lib/server/learning-v2/tutor/evaluation/paid-execution-repository.js'
import { collectPaidWindowsProtectionEvidence, paidProtectionLayout, verifyPaidProtection } from '../lib/server/learning-v2/tutor/evaluation/paid-execution-protection.js'
import { sealPaidArtifact, paidFileHash, PAID_PROOF_NAMES, paidBlocked } from '../lib/server/learning-v2/tutor/evaluation/paid-execution-contract.js'
import { jcsUtf8Bytes } from '../lib/server/learning-v2/tutor/evaluation/human-review-canonical.js'
import { localTutorFallback } from '../lib/server/learning-v2/tutor/fallback-registry.js'
import { LEARNING_V2_DATA_INVENTORY_VERSION, LEARNING_V2_DATA_INVENTORY } from '../lib/server/learning-v2/privacy/data-inventory-v1.js'
import { paidQualificationAttackPlan } from '../scripts/learning-v2-release/paid-windows-qualification.mjs'

const roots = [], previous = process.env.NODE_ENV
let serial = 0, full
const good = f => ({ kind: 'PROVIDER_CANDIDATE', candidate: localTutorFallback(f.level), usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140 } })
async function setup(fault = null, event = good) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'paid-execution-test-fixes-')); roots.push(root)
  const runId = `test-paid-fixes-${++serial}`; let calls = 0
  const h = await createInternalPaidExecutionTestHarness({ repositoryRoot: root, runId, eventForFixture: f => { calls++; return event(f) }, faultCapability: fault, fallbackFactory: null })
  return { root, runId, h, r: h.repository, args: { repositoryRoot: root, runId, authority: h.authority }, calls: () => calls }
}
const filename = (c, ref) => path.join(c.root, ref)
const unsigned = value => { const v = structuredClone(value); delete v.artifact_digest; return v }
async function next(s) { const p = await s.prepare(); await s.invoke(p); await s.settle() }
async function altered(c, ref, bytes, fn) {
  const target = filename(c, ref), original = await fs.readFile(target)
  try { await fs.writeFile(target, bytes); return await fn() } finally { await fs.writeFile(target, original) }
}
before(async () => {
  process.env.NODE_ENV = 'test'
  full = await setup(); full.s = await createPaidExecutionSession(full.args)
  for (let i = 0; i < 120; i++) await next(full.s)
  await full.s.complete()
})
after(async () => {
  for (const root of roots) {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()))
    assert.ok(path.basename(root).startsWith('paid-execution-test-fixes-'))
    await fs.rm(root, { recursive: true, force: true })
  }
  if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous
})

test('IV-01 live terminal requires independent finalization evidence and rejects future time', async () => {
  const c = await setup(createInternalPaidFilesystemFault((stage, ref) => {
    if (stage === 'before-create' && ref.endsWith('001.prepared.json')) throw new Error('synthetic')
  }))
  const s = await createPaidExecutionSession(c.args); await assert.rejects(s.prepare()); const t = await s.finalize()
  assert.deepEqual((await inspectPaidExecution(c.args)).terminal, t)
  const forged = sealPaidArtifact({ ...unsigned(t), terminalized_at: '2099-01-01T00:00:00.000Z' })
  await altered(c, c.r.refs.execution, jcsUtf8Bytes(forged), async () => assert.equal((await inspectPaidExecution(c.args)).terminal_state, 'BLOCKED_INVALID'))
})
for (const [field, value] of [['operator_ref', 'test-paid-forged-operator'], ['evidence_ref', 'test-paid-forged-evidence'],
  ['verified_at', '2099-01-01T00:00:00.000Z']]) {
  test(`IV-01 reconciliation rejects independently forged ${field}`, async () => {
    const c = await setup(), s = await createPaidExecutionSession(c.args), proof = c.h.crash(s)
    const input = { ...c.args, reconciliationAuthority: proof, commit: true }
    const t = await reconcilePaidExecution(input), b = unsigned(t); b.reconciliation_authority[field] = value
    await altered(c, c.r.refs.execution, jcsUtf8Bytes(sealPaidArtifact(b)), async () => {
      assert.equal((await inspectPaidExecution(c.args)).terminal_state, 'BLOCKED_INVALID'); await assert.rejects(reconcilePaidExecution(input))
    })
    assert.deepEqual(await reconcilePaidExecution(input), t)
  })
}
for (const mode of ['LIVE_OWNER_WITH_PROOF', 'RECONCILIATION_WITHOUT_PROOF']) {
  test(`IV-01 mode/proof mismatch ${mode}`, async () => {
    const c = await setup(), s = await createPaidExecutionSession(c.args), proof = c.h.crash(s)
    const t = await reconcilePaidExecution({ ...c.args, reconciliationAuthority: proof, commit: true }), b = unsigned(t)
    if (mode === 'LIVE_OWNER_WITH_PROOF') b.terminalization_mode = 'LIVE_OWNER'; else b.reconciliation_authority = null
    await altered(c, c.r.refs.execution, jcsUtf8Bytes(sealPaidArtifact(b)), async () => assert.equal((await inspectPaidExecution(c.args)).terminal_state, 'BLOCKED_INVALID'))
  })
}
for (const kind of ['torn', 'corrupt']) for (const artifact of ['result', 'packet']) {
  test(`IV-02 ${kind} ${artifact} preserves verified upstream accounting`, async () => {
    const bytes = Buffer.from(kind === 'torn' ? '{' : '{"fake":true}')
    await altered(full, full.r.refs[artifact], bytes, async () => {
      const v = await inspectPaidExecution(full.args)
      assert.equal(v.claim_state, 'CONSUMED_VERIFIED'); assert.equal(v.accounting.completed_case_count, 120)
      assert.equal(v.accounting.known_actual_cost_usd_micros, 81600)
      assert.equal(v.accounting.actual_cost_status, 'KNOWN'); assert.equal(v.blocking_integrity_state, 'BLOCKED')
      assert.equal(v.result_verified, artifact === 'packet'); assert.equal(v.system_safety_pass, artifact === 'packet' ? true : null)
      assert.equal(v.review_material_ready, false); assert.equal(v.replay_allowed, false)
      const r = await reconcilePaidExecution({ ...full.args, reconciliationAuthority: null, commit: false })
      assert.equal(r.accounting.completed_case_count, 120); assert.equal(r.result_verified, artifact === 'packet')
      assert.deepEqual(await fs.readFile(filename(full, full.r.refs[artifact])), bytes)
    })
  })
}
for (const [stage, reason] of [['before-create', 'ARTIFACT_WRITE_FAILURE'], ['before-readback', 'ARTIFACT_READBACK_FAILURE'],
  ['digest', 'DIGEST_MISMATCH']]) {
  test(`IV-03 zero-call controlled ${reason} is exact and consumed`, async () => {
    let fired = false
    const c = await setup(createInternalPaidFilesystemFault((point, ref) => {
      if (!fired && ref.endsWith('001.prepared.json') && point === (stage === 'digest' ? 'before-readback' : stage)) {
        fired = true; if (stage === 'digest') throw paidBlocked('DIGEST_MISMATCH'); throw new Error('synthetic only')
      }
    })), s = await createPaidExecutionSession(c.args)
    await assert.rejects(s.prepare()); const t = await s.finalize()
    assert.equal(t.terminal_cause, reason); assert.equal(t.terminal_phase, 'CASE_CHECKPOINT')
    assert.equal(t.accounting.confirmed_started_transport_count, 0); assert.equal(t.accounting.possibly_started_transport_count, 0)
    assert.equal(c.calls(), 0); assert.equal((await c.r.read(c.r.refs.claim)).value.authorization_consumed, true)
    assert.equal((await inspectPaidExecution(c.args)).terminal.terminal_cause, reason)
    assert.equal((await inspectPaidExecution(c.args)).accounting.possibly_started_transport_count, 0)
    await assert.rejects(createPaidExecutionSession(c.args)); await assert.rejects(s.prepare())
  })
}
test('IV-03 partial controlled failure retains settled costs and exact phase/case', async () => {
  const c = await setup(createInternalPaidFilesystemFault((stage, ref) => {
    if (stage === 'before-create' && ref.endsWith('002.prepared.json')) throw new Error('synthetic')
  })), s = await createPaidExecutionSession(c.args)
  await next(s); await assert.rejects(s.prepare()); const t = await s.finalize()
  assert.equal(t.terminal_cause, 'ARTIFACT_WRITE_FAILURE'); assert.equal(t.terminal_phase, 'CASE_CHECKPOINT')
  assert.equal(t.accounting.known_actual_cost_usd_micros, 680); assert.equal(t.accounting.confirmed_started_transport_count, 1)
  assert.equal(t.execution_completion, 'PARTIAL'); assert.ok(t.terminal_case_id)
})
test('IV-03 public caller cannot create a failure capability or choose terminal fields', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args)
  for (const input of [{ terminal_cause: 'ARTIFACT_WRITE_FAILURE' }, { terminal_phase: 'CASE_CHECKPOINT' },
    { terminal_case_id: 'test-paid-case' }, { terminalized_at: '2026-01-01T00:00:00.000Z' }, { failure: {} }]) await assert.rejects(s.finalize(input))
  await assert.rejects(s.finalize()); assert.equal(await c.r.rawRead(c.r.refs.execution, true), null)
})
test('IV-03 controlled failure cannot authenticate a replaced accounting prefix', async () => {
  const c = await setup(createInternalPaidFilesystemFault((stage, ref) => {
    if (stage === 'before-create' && ref.endsWith('002.prepared.json')) throw new Error('synthetic')
  })), s = await createPaidExecutionSession(c.args)
  await next(s); await assert.rejects(s.prepare())
  const ref = `${c.r.refs.checkpoints}/001.settled.json`, b = unsigned((await c.r.read(ref)).value)
  Object.assign(b.facts, { known_input_tokens: 200, known_total_tokens: 240, known_actual_cost_usd_micros: 880 })
  await fs.writeFile(filename(c, ref), jcsUtf8Bytes(sealPaidArtifact(b)))
  await assert.rejects(s.finalize(), e => e.reason_code === 'AUTHORIZATION_INVALID')
  assert.equal(await c.r.rawRead(c.r.refs.execution, true), null)
})
test('one settlement winner preserves one invocation and one settled checkpoint', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args), permission = await s.prepare()
  await s.invoke(permission)
  const outcomes = await Promise.allSettled([s.settle(), s.settle()])
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1)
  assert.equal(c.calls(), 1); assert.equal((await c.r.checkpointEntries()).length, 2)
  assert.equal((await inspectPaidExecution(c.args)).accounting.confirmed_started_transport_count, 1)
})
for (const [input, output] of [[40001, 40], [100, 161]]) {
  test(`IV-04 known over-bound ${input}/${output} retains expenditure and forbids continuation`, async () => {
    const c = await setup(null, f => ({ ...good(f), usage: { input_tokens: input, output_tokens: output, total_tokens: input + output } })), s = await createPaidExecutionSession(c.args)
    await next(s); const v = await inspectPaidExecution(c.args)
    assert.equal(v.accounting.known_actual_cost_usd_micros, 2 * input + 12 * output)
    await assert.rejects(s.prepare()); assert.equal((await s.finalize()).terminal_cause, 'TOKEN_LIMIT')
  })
  test(`IV-04 resealed later prepare after ${input}/${output} is rejected despite aggregate headroom`, async () => {
    const c = await setup(), s = await createPaidExecutionSession(c.args); await next(s); await s.prepare()
    const ref = `${c.r.refs.checkpoints}/001.settled.json`, b = unsigned((await c.r.read(ref)).value)
    Object.assign(b.facts, { known_input_tokens: input, known_output_tokens: output, known_total_tokens: input + output, known_actual_cost_usd_micros: 2 * input + 12 * output })
    const bytes = jcsUtf8Bytes(sealPaidArtifact(b)); await fs.writeFile(filename(c, ref), bytes)
    const nextRef = `${c.r.refs.checkpoints}/002.prepared.json`, n = unsigned((await c.r.read(nextRef)).value)
    n.previous_checkpoint_sha256 = paidFileHash(bytes); await fs.writeFile(filename(c, nextRef), jcsUtf8Bytes(sealPaidArtifact(n)))
    const blocked = await inspectPaidExecution(c.args)
    assert.equal(blocked.first_invalid_checkpoint_reason, 'TOKEN_LIMIT')
    assert.equal(blocked.first_invalid_checkpoint_ref, nextRef)
    assert.equal(blocked.verified_checkpoint_count, 2)
    assert.equal(blocked.accounting.known_actual_cost_usd_micros, 2 * input + 12 * output)
    assert.equal(blocked.blocking_integrity_state, 'BLOCKED')
    await assert.rejects(s.prepare())
  })
}
test('IV-04 inconsistent total and cost cannot be resealed as trustworthy settlement', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args); await next(s)
  const b = unsigned((await c.r.read(`${c.r.refs.checkpoints}/001.settled.json`)).value)
  b.facts.known_total_tokens++; assert.throws(() => sealPaidArtifact(b))
  b.facts.known_total_tokens--; b.facts.known_actual_cost_usd_micros++; assert.throws(() => sealPaidArtifact(b))
})
for (const [field, value] of [['root', 'test-paid-wrong-root'], ['volume', 'test-paid-wrong-volume'], ['device_binding', 'test-paid-wrong-device'],
  ['owner', 'test-paid-runner'], ['effective_mutation_rights', ['DELETE_CHILD']], ['inherited_mutation_rights', ['WRITE_DAC']],
  ['execution_identity', 'test-paid-other'], ['token_privileges', ['SeRestorePrivilege']], ['reparse_objects', ['test-paid-parent']],
  ['revision', 'b'.repeat(40)], ['code_profile', 'test-paid-code-drift'], ['configuration_profile', 'test-paid-config-drift'],
  ['namespace_qualification', null], ['durability', { readback: 'PASS' }], ['operator_evidence_ref', 'test-paid-forged']]) {
  test(`IV-05 synthetic unsafe ${field} blocks before Claim`, async () => {
    const c = await setup(); c.h.protection.alterObservation(field, value)
    const readiness = await paidExecutionReadiness({ runId: c.runId, authority: c.h.authority })
    assert.equal(readiness.ready, false); assert.equal(readiness.actual_platform_qualification, 'NOT_PERFORMED')
    await assert.rejects(createPaidExecutionSession(c.args)); assert.equal(c.calls(), 0)
    await assert.rejects(fs.stat(filename(c, c.r.refs.claim)), { code: 'ENOENT' })
  })
}
for (const mode of ['missing', 'altered']) test(`IV-05 ${mode} guard blocks without repair`, async () => {
  const c = await setup(), ref = paidProtectionLayout(c.runId).guards[1]
  if (mode === 'missing') await fs.unlink(filename(c, ref)); else await fs.writeFile(filename(c, ref), 'altered')
  await assert.rejects(createPaidExecutionSession(c.args)); assert.equal(c.calls(), 0)
  if (mode === 'missing') await assert.rejects(fs.stat(filename(c, ref)), { code: 'ENOENT' })
  else assert.equal(await fs.readFile(filename(c, ref), 'utf8'), 'altered')
})
test('IV-05 missing parent remains absent; runtime never provisions it', async () => {
  const c = await setup(), target = filename(c, c.r.refs.checkpoints)
  await fs.rename(target, target + '-held'); await assert.rejects(createPaidExecutionSession(c.args))
  await assert.rejects(fs.stat(target), { code: 'ENOENT' })
})
test('IV-05 only the exact guard is exempt; arbitrary hidden checkpoint entry rejects', async () => {
  const c = await setup(); assert.equal((await c.r.checkpointEntries()).length, 0)
  await fs.writeFile(filename(c, `${c.r.refs.checkpoints}/.ignored`), '')
  await assert.rejects(createPaidExecutionSession(c.args)); assert.equal(c.calls(), 0)
})
test('IV-05 unexpected root and Human Review entries also block readiness', async () => {
  for (const leaf of ['docs/evaluation-results', 'human-review']) {
    const c = await setup(), ref = leaf === 'human-review' ? path.posix.dirname(c.r.refs.packet) : leaf
    await fs.writeFile(filename(c, `${ref}/.namespace-guard-extra`), '')
    assert.equal((await paidExecutionReadiness({ runId: c.runId, authority: c.h.authority })).ready, false)
    await assert.rejects(createPaidExecutionSession(c.args)); assert.equal(c.calls(), 0)
  }
})
test('IV-05 guard never grants evidence or changes 244 checkpoint cardinality', async () => {
  assert.equal((await full.r.checkpointEntries()).length, 244)
  assert.equal((await inspectPaidExecution(full.args)).checkpoint_count, 244)
  await assert.rejects(full.r.rawRead(`${full.r.refs.checkpoints}/.namespace-guard`))
  assert.equal((await full.r.read(full.r.refs.attestation)).value.external_properties_technically_proven, false)
  assert.equal(PAID_PROOF_NAMES.length, 4)
})
test('IV-05 ordinary checkout and caller safe=true never acquire protection authority', async () => {
  const root = path.resolve('.'), runId = 'test-paid-ordinary'
  const r = createPaidRepository({ repositoryRoot: root, runId, faultCapability: null })
  await assert.rejects(r.readiness()); await assert.rejects(verifyPaidProtection(root, runId, { safe: true }))
  assert.equal(collectPaidWindowsProtectionEvidence().actual_platform_qualification, 'NOT_PERFORMED')
  assert.equal((await paidExecutionReadiness({ runId, authority: { safe: true } })).ready, false)
})
test('IV-05 actual production denies repository, owner, reconciliation and qualification authority', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args), p = await s.prepare()
  process.env.NODE_ENV = 'production'
  try {
    assert.throws(() => createPaidRepository({ repositoryRoot: c.root, runId: c.runId, faultCapability: null }))
    assert.throws(() => collectPaidWindowsProtectionEvidence())
    for (const fn of [() => s.invoke(p), () => s.finalize(), () => createPaidExecutionSession(c.args),
      () => reconcilePaidExecution({ ...c.args, reconciliationAuthority: {}, commit: true })]) await assert.rejects(fn())
    assert.equal(c.calls(), 0); assert.equal((await paidExecutionReadiness({ runId: c.runId, authority: c.h.authority })).ready, false)
  } finally { process.env.NODE_ENV = 'test' }
})
test('H12 v22 inventories protection infrastructure without learning or production authority', () => {
  assert.equal(LEARNING_V2_DATA_INVENTORY_VERSION, 'learning-v2-data-inventory-v23')
  assert.match(JSON.stringify(LEARNING_V2_DATA_INVENTORY), /tutor_paid_execution_protection/)
})
test('qualification v2 matrix covers distinct roles and all three write boundaries and rejects real identities', () => {
  const plan = paidQualificationAttackPlan('test-paid-plan')
  assert.equal(plan.length, 1068)
  assert.equal(new Set(plan.map(p => p.writeBoundary)).size, 3)
  assert.equal(new Set(plan.map(p => p.role)).size, 4)
  for (const action of ['rename', 'replace-junction', 'delete-child', 'dacl', 'owner', 'guard-remove', 'guard-change',
    'child-directory', 'direct-reparse', 'remove-reparse', 'device-redirection']) assert.ok(plan.some(p => p.action === action))
  assert.ok(plan.some(p => p.parent.endsWith('human-review/test-paid-plan')))
  assert.throws(() => paidQualificationAttackPlan('not-a-test-run'))
})
test('qualification worker rejects an unregistered fixture before the IPC barrier', async () => {
  const c = await setup()
  const worker = fileURLToPath(new URL('../scripts/learning-v2-release/paid-windows-qualification.mjs', import.meta.url))
  const child = fork(worker, ['--worker', c.root, c.runId], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true })
  const wait = expected => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('barrier timeout')), 10000)
    child.once('message', value => { clearTimeout(timer); try { assert.equal(value.event, expected); resolve(value) } catch (e) { reject(e) } })
  })
  try {
    const pending = wait('ERROR'); child.send({ command: 'VALIDATE' }); await pending
    const target = filename(c, `${c.r.refs.checkpoints}/001.prepared.json`)
    await assert.rejects(fs.stat(target), { code: 'ENOENT' })
    assert.equal(collectPaidWindowsProtectionEvidence().actual_platform_qualification, 'NOT_PERFORMED')
  } finally { child.kill(); await new Promise(resolve => child.once('exit', resolve)) }
})
