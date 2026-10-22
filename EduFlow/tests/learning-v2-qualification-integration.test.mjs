import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { VERSION, LIMITS, parse, collectorRequestSchema, collectorResponseSchema, storageSchema, hash } from '../scripts/learning-v2-release/qualification/contracts.mjs'
import { createSyntheticJournal } from '../scripts/learning-v2-release/qualification/ledger.mjs'
import { createSyntheticController } from '../scripts/learning-v2-release/qualification/controller.mjs'
import { createSyntheticCollectorPeer, createSyntheticResolver } from '../scripts/learning-v2-release/qualification/resolver.mjs'
import { createSyntheticLaunchPlan, launchSyntheticQualification } from '../scripts/learning-v2-release/qualification/launcher.mjs'
import { createSyntheticObserver, observedTrace } from '../scripts/learning-v2-release/qualification/observer-client.mjs'
import { qualificationMatrix, classifyAttack } from '../scripts/learning-v2-release/qualification/matrix.mjs'
import { verifyPositiveControl } from '../scripts/learning-v2-release/qualification/positive-controls.mjs'
import { createSyntheticDurabilityHarness, durabilityPlan, externalFaultPlan, FAULT_POINTS } from '../scripts/learning-v2-release/qualification/durability.mjs'
import { evidenceSchema, sealSyntheticEvidence, retentionDisposition } from '../scripts/learning-v2-release/qualification/evidence.mjs'
import { prepareSyntheticCleanup, executeSyntheticCleanup, approveSyntheticCleanup } from '../scripts/learning-v2-release/qualification/cleanup.mjs'
import { exerciseSyntheticWriterFault, SYNTHETIC_IO_FAULTS } from '../scripts/learning-v2-release/qualification/fault-client.mjs'
import { bindSyntheticWriter, writeSyntheticBoundary } from '../scripts/learning-v2-release/qualification/worker.mjs'
import { qualificationDeploymentReadiness } from '../scripts/learning-v2-release/qualification/readiness.mjs'
import { provisionInternalPaidProtectionTest } from '../lib/server/learning-v2/tutor/evaluation/paid-execution-protection.js'
import { createPaidRepository } from '../lib/server/learning-v2/tutor/evaluation/paid-execution-repository.js'
import { LEARNING_V2_DATA_INVENTORY_VERSION, inventoryEntry } from '../lib/server/learning-v2/privacy/data-inventory-v1.js'
import { d, binding, observation, resolved, controllerFixture, event, health, storage } from './helpers/qualification-fixtures.mjs'

const previous = process.env.NODE_ENV
before(() => { process.env.NODE_ENV = 'test' })
after(() => { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous })
const request = () => ({ version: VERSION, binding: binding(), challenge: d('challenge'), verb: 'INSPECT' })
for (const [key, value] of [['safe', true], ['trusted', true], ['path', 'C:\\arbitrary'], ['sid', 'S-1-5-18'], ['expected_acl', {}]]) test(`collector rejects caller ${key} authority`, () => {
  assert.throws(() => parse(collectorRequestSchema, { ...request(), [key]: value }), { code: 'BLOCKED' })
})
for (const mutation of [q => q.version = 'wrong', q => q.challenge = 'short', q => q.verb = 'WRITE', q => q.binding.fixture = 'real-run']) test(`collector rejects protocol mutation ${mutation.toString()}`, () => {
  const q = request(); mutation(q); assert.throws(() => parse(collectorRequestSchema, q))
})
test('collector rejects oversized/partial messages and excessive object/token counts', () => {
  assert.throws(() => parse(collectorRequestSchema, ' '.repeat(LIMITS.message + 1)))
  assert.throws(() => parse(collectorRequestSchema, '{'))
  const r = observation(); r.objects = Array(257).fill(r.objects[0]); assert.throws(() => parse(collectorResponseSchema, r))
  r.objects = []; r.tokens = Array(17).fill(r.tokens[0]); assert.throws(() => parse(collectorResponseSchema, r))
})
for (const attack of ['challenge', 'peer', 'replay', 'image', 'binding', 'partial', 'token']) test(`resolver blocks ${attack}`, () => {
  const value = observation(), peer = createSyntheticCollectorPeer(value), resolver = createSyntheticResolver(peer), q = resolver.request(value.binding)
  const r = { ...value, challenge: q.challenge }
  if (attack === 'replay') resolver.accept(q, r, peer)
  if (attack === 'challenge') r.challenge = d('other')
  if (attack === 'image') r.collector_image = d('other')
  if (attack === 'binding') r.binding = { ...r.binding, boot: 'qualification-other' }
  if (attack === 'partial') r.complete = false
  if (attack === 'token') r.tokens = []
  assert.throws(() => resolver.accept(q, r, attack === 'peer' ? {} : peer))
  assert.throws(() => resolver.accept(q, { ...value, challenge: q.challenge }, peer))
})
test('journal has one serialization authority and one concurrent consume/redeem winner', async () => {
  const c = await controllerFixture()
  try {
    await assert.rejects(createSyntheticController(c.journal.capability))
    const calls = await Promise.allSettled(Array.from({ length: 12 }, () => c.controller.consume({ fixture: c.binding.fixture, test: 'test-paid-race', boot: c.binding.boot })))
    assert.equal(calls.filter(v => v.status === 'fulfilled').length, 1)
    const ticket = calls.find(v => v.status === 'fulfilled').value
    const redemptions = await Promise.allSettled(Array.from({ length: 8 }, () => c.controller.redeem(ticket, c.binding)))
    assert.equal(redemptions.filter(v => v.status === 'fulfilled').length, 1)
  } finally { c.controller.close() }
})
test('journal recovery reconstructs consumption and rejects old tickets/epochs/path reservations', async () => {
  const c = await controllerFixture(); const ticket = await c.controller.consume({ fixture: c.binding.fixture, test: 'test-paid-test', boot: c.binding.boot }); c.controller.close()
  const next = await createSyntheticController(c.journal.capability)
  try {
    assert.equal(next.query(c.binding.fixture).state, 'CONSUMED')
    await assert.rejects(next.redeem(ticket, c.binding))
    await assert.rejects(next.register({ binding: { ...c.binding, epoch: next.epoch, fixture: 'test-paid-recreated' } }))
  } finally { next.close() }
})
for (const failAt of [2, 3, 4, 5]) test(`journal torn write ${failAt} never grants reusable authority`, async () => {
  const journal = createSyntheticJournal({ failAt }), c = await createSyntheticController(journal.capability), b = binding(c.epoch)
  try {
    try { await c.register({ binding: b }); const t = await c.consume({ fixture: b.fixture, test: 'test-paid-test', boot: b.boot }); await c.redeem(t, b) } catch (e) { assert.equal(e.code, 'BLOCKED') }
  } finally { c.close() }
  const recovered = await createSyntheticController(journal.capability)
  try { assert.equal(recovered.query(b.fixture).journal_complete, false); assert.throws(() => recovered.register({ binding: b })) } finally { recovered.close() }
})
test('journal digest corruption preserves only verified prefix and blocks all mutation', async () => {
  const c = await controllerFixture(); c.controller.close(); const bytes = c.journal.snapshot(); bytes[10] ^= 1; c.journal.corrupt(bytes)
  const recovered = await createSyntheticController(c.journal.capability)
  try { assert.equal(recovered.query(c.binding.fixture).journal_complete, false); assert.throws(() => recovered.consume({})) } finally { recovered.close() }
})
for (const defect of ['shared-sid', 'image', 'handles', 'impersonation']) test(`launcher burns ticket and blocks ${defect}`, async () => {
  const c = await controllerFixture(), obs = resolved(c.binding, r => {
    if (defect === 'shared-sid') r.tokens[2].sid = r.tokens[1].sid
    if (defect === 'image') r.tokens[1].image = d('evil')
    if (defect === 'handles') r.tokens[1].inherited_handles = ['qualification-privileged-handle']
    if (defect === 'impersonation') r.tokens[1].impersonation = 'IMPERSONATION'
  })
  const plan = createSyntheticLaunchPlan({ binding: c.binding, images: observation().tokens.map(t => ({ role: t.role, image: t.image, inherited_handles: [] })) })
  const ticket = await c.controller.consume({ fixture: c.binding.fixture, test: 'test-paid-test', boot: c.binding.boot }); let launched = 0
  try {
    await assert.rejects(launchSyntheticQualification({ controller: c.controller, ticket, plan, observation: obs.proof, role: 'RUNNER', worker: () => launched++ }))
    assert.equal(launched, 0); await assert.rejects(c.controller.redeem(ticket, c.binding))
  } finally { c.controller.close() }
})
test('valid fixed synthetic launcher has no command line or paid capability', async () => {
  const c = await controllerFixture(), obs = resolved(c.binding), plan = createSyntheticLaunchPlan({ binding: c.binding, images: obs.value.tokens.map(t => ({ role: t.role, image: t.image, inherited_handles: [] })) })
  const ticket = await c.controller.consume({ fixture: c.binding.fixture, test: 'test-paid-test', boot: c.binding.boot })
  try { const r = await launchSyntheticQualification({ controller: c.controller, ticket, plan, observation: obs.proof, role: 'RUNNER', worker: data => Object.keys(data) }); assert.equal(r.paid_authority, false); assert.deepEqual(r.outcome, ['role', 'image']) } finally { c.controller.close() }
})
function trace({ b = binding(), kind = 'CREATE', effect = 'NONE', status = 'DENIED', outside = false } = {}) {
  const o = createSyntheticObserver({ observation: resolved(b).proof, epoch: b.epoch, outsideObjects: [d('outside')] })
  o.ingest(event({ epoch: b.epoch, kind, outside })); o.ingest(event({ epoch: b.epoch, sequence: 2, phase: 'POST', kind, outside, effect, status }))
  return o.finish(health(b.epoch, 2))
}
for (const kind of ['CREATE', 'WRITE', 'RENAME', 'DELETE', 'DIRECTORY', 'SECURITY', 'OWNER', 'REPARSE_SET', 'REPARSE_REMOVE']) test(`synthetic observer records ${kind} including zero-byte effects`, () => {
  const r = observedTrace(trace({ kind, effect: 'MODIFIED', status: 'SUCCESS', outside: true }))
  assert.equal(r.outside_root_mutations, 1); assert.equal(r.status, 'FAILED'); assert.equal(r.actual_platform_qualification, 'NOT_PERFORMED')
})
test('transient create/delete never disappears from trace when final snapshot is clean', () => {
  const o = createSyntheticObserver({ observation: resolved().proof, epoch: binding().epoch, outsideObjects: [d('outside')] })
  for (const [i, kind, effect] of [[0, 'CREATE', 'CREATED'], [2, 'DELETE', 'DELETED']]) {
    o.ingest(event({ sequence: i + 1, operation: i + 1, kind, outside: true }))
    o.ingest(event({ sequence: i + 2, operation: i + 1, phase: 'POST', kind, outside: true, effect, status: 'SUCCESS' }))
  }
  assert.equal(observedTrace(o.finish(health(binding().epoch, 4))).outside_root_mutations, 2)
})
for (const field of ['drops', 'allocation_failures', 'overflows', 'etw_events_lost', 'etw_buffers_lost', 'etw_realtime_lost', 'disconnected', 'unloaded', 'attached', 'drained']) test(`observer ${field} loss/state blocks`, () => {
  const o = createSyntheticObserver({ observation: resolved().proof, epoch: binding().epoch }), h = health()
  h[field] = typeof h[field] === 'boolean' ? !h[field] : 1
  assert.throws(() => o.finish(h))
})
for (const defect of ['sequence', 'pid', 'process_start', 'object', 'epoch', 'outside']) test(`observer rejects unresolved ${defect}`, () => {
  const o = createSyntheticObserver({ observation: resolved().proof, epoch: binding().epoch }), e = event()
  e[defect] = typeof e[defect] === 'number' ? 99 : typeof e[defect] === 'boolean' ? true : d('bad')
  assert.throws(() => o.ingest(e)); assert.throws(() => o.finish(health()))
})
test('observer missing post cannot drain into success', () => {
  const o = createSyntheticObserver({ observation: resolved().proof, epoch: binding().epoch }); o.ingest(event()); assert.throws(() => o.finish(health(binding().epoch, 1)))
})
test('matrix includes full supplied ancestors, guard targets, four tokens and all fixed leaves', () => {
  const m = qualificationMatrix({ runId: 'test-paid-matrix', ancestors: ['qualification-machine-parent'] })
  assert.ok(m.length > 1068); assert.ok(m.every(c => c.mandatory && c.positiveControl === 'SEPARATE_FRESH_FIXTURE'))
  for (const action of ['retained-handle', 'duplicate-handle', 'inherited-handle', 'impersonation', 'helper-escalation', 'device-redirection']) assert.ok(m.some(c => c.action === action))
  assert.ok(m.some(c => c.parent.startsWith('@ancestor/'))); assert.ok(m.some(c => c.targetType === 'GUARD' && c.action === 'owner'))
  assert.equal(new Set(m.map(c => c.writeBoundary)).size, 3)
})
for (const code of [4390, 1, 87, 0, 145]) test(`oracle code ${code} alone never passes`, () => {
  assert.equal(classifyAttack({ code, applicable: true, partialMutation: false, observedMutation: false, positiveControl: true, nonemptyQualified: false }), 'BLOCKED')
})
test('oracle preserves partial mutation and demands positive control for legitimate denial', () => {
  assert.equal(classifyAttack({ code: 5, partialMutation: true }), 'FAILED')
  assert.equal(classifyAttack({ code: 5, applicable: true, positiveControl: false }), 'BLOCKED')
  assert.equal(classifyAttack({ code: 5, applicable: true, positiveControl: true }), 'PREVENTED')
  assert.equal(classifyAttack({ code: 145, applicable: true, positiveControl: true, nonemptyQualified: true }), 'PREVENTED')
})
test('positive controls require separate fresh identity and observed successful mutation', () => {
  const a = trace({ b: binding(undefined, 'test-paid-positive'), status: 'SUCCESS', effect: 'CREATED' }), b = trace()
  assert.equal(verifyPositiveControl({ control: a, protectedTrace: b, kind: 'CREATE' }).real_component_lab_verification, 'NOT_PERFORMED')
  assert.throws(() => verifyPositiveControl({ control: a, protectedTrace: a, kind: 'CREATE' }))
  assert.throws(() => verifyPositiveControl({ control: b, protectedTrace: trace({ b: binding(undefined, 'test-paid-other') }), kind: 'CREATE' }))
})
test('storage profile rejects NTFS shortcut, missing documents and incomplete VM binding', () => {
  assert.throws(() => parse(storageSchema, { NTFS: true }))
  const p = storage(); p.persistence_documents = []; assert.throws(() => durabilityPlan(p))
  p.persistence_documents = storage().persistence_documents; p.kind = 'VM'; assert.throws(() => durabilityPlan(p))
})
for (const point of FAULT_POINTS) test(`durability ${point} cannot claim real persistence from synthetic readback`, () => {
  const h = createSyntheticDurabilityHarness(storage())
  assert.throws(() => h.transportSentinel())
  const r = h.observe({ phase: 'PREPARE', point, acknowledged: true, present: true, bytes_match: true, binding_match: true,
    independent: false, fault_evidence: null, storage_profile: hash(storage()) })
  assert.equal(r, 'BLOCKED'); assert.throws(() => h.transportSentinel()); assert.notEqual(h.inspect().status, 'PASS')
})
test('durability lost acknowledged reservation fails even with a surviving controller', () => {
  const h = createSyntheticDurabilityHarness(storage())
  assert.equal(h.observe({ phase: 'PREPARE', point: 'POWER_LOSS', acknowledged: true, present: false, bytes_match: false, binding_match: false,
    independent: true, fault_evidence: 'qualification-fault', storage_profile: hash(storage()) }), 'FAILED')
  assert.throws(() => h.transportSentinel())
})
test('durability sentinels enforce prepare then settlement exactly once without transport', () => {
  const h = createSyntheticDurabilityHarness(storage()), common = { acknowledged: true, present: true, bytes_match: true, binding_match: true, independent: true, fault_evidence: 'qualification-fault', storage_profile: hash(storage()) }
  h.observe({ ...common, phase: 'PREPARE', point: 'PREPARED_VERIFIED' }); assert.match(h.transportSentinel(), /NONTRANSPORT/); assert.throws(() => h.transportSentinel()); assert.throws(() => h.nextPrepareSentinel())
  h.observe({ ...common, phase: 'SETTLE', point: 'SETTLEMENT_VERIFIED' }); h.nextPrepareSentinel(); assert.throws(() => h.nextPrepareSentinel()); assert.equal(h.inspect().status, 'NOT_PERFORMED')
})
function evidence(b = binding()) { return { version: VERSION, id: 'qualification-evidence', binding: b, host_profile: d('profile'), collector_image: d('collector'), observer_image: d('observer'), launcher_image: d('launcher'),
  token_evidence: d('tokens'), object_evidence: d('objects'), descriptor_evidence: d('descriptors'), matrix: d('matrix'), positive_controls: d('controls'), trace: d('trace'), loss_status: 'COMPLETE', outside_root_mutations: 0,
  durability: 'NOT_PERFORMED', ledger: d('ledger'), cleanup: 'PENDING', verifier: 'qualification-verifier', exceptions: [], items: [], scope: 'SYNTHETIC_TEST_ONLY', real_component_lab_verification: 'NOT_PERFORMED', actual_platform_qualification: 'NOT_PERFORMED', paid_authority: false, external_properties_technically_proven: false } }
test('evidence limits are inclusive and reject overflow instead of truncating', () => {
  const v = evidence(), item = { ref: 'qualification-trace', digest: d('trace'), bytes: LIMITS.trace, kind: 'TRACE' }; v.items = [item]
  assert.equal(sealSyntheticEvidence(v, trace()).evidence.items[0].bytes, LIMITS.trace)
  v.items[0].bytes++; assert.throws(() => parse(evidenceSchema, v)); v.items = Array(513).fill(item); assert.throws(() => parse(evidenceSchema, v))
})
for (const field of ['learner_message', 'learner_answer', 'hidden_answer', 'prompt', 'provider_error', 'credentials', 'write_buffer']) test(`evidence rejects ${field}`, () => {
  assert.throws(() => parse(evidenceSchema, { ...evidence(), [field]: 'canary' }))
})
test('retention preserves active/held/minimal history and requires approval after 90 days', () => {
  const r = { active: false, hold: false, closed_at: 1, revoked_at: null, outcome: 'FAILED', minimal_history: false }, now = 1 + 90 * 86400000
  assert.equal(retentionDisposition(r, now), 'ELIGIBLE_FOR_INDEPENDENT_APPROVAL')
  assert.equal(retentionDisposition(r, now - 1), 'RETAIN')
  assert.equal(retentionDisposition({ ...r, hold: true }, now), 'RETAIN')
  assert.equal(retentionDisposition({ ...r, active: true }, now), 'RETAIN')
  assert.equal(retentionDisposition({ ...r, minimal_history: true }, now), 'RETAIN_SYSTEM_LIFETIME')
})
test('cleanup requires finalized evidence and rechecks each object without resetting history', async () => {
  const c = await controllerFixture(), proof = resolved(c.binding).proof; let removed = 0
  const sealedEvidence = sealSyntheticEvidence(evidence(c.binding), trace({ b: c.binding })), evidenceDigest = sealedEvidence.digest
  try {
    assert.throws(() => prepareSyntheticCleanup({ controller: c.controller, fixture: c.binding.fixture, evidenceDigest, before: proof, current: proof, activeHandles: 0 }))
    await c.controller.consume({ fixture: c.binding.fixture, test: 'test-paid-test', boot: c.binding.boot }); await c.controller.appendEvidence({ fixture: c.binding.fixture, evidence: evidenceDigest }); await c.controller.finalize({ fixture: c.binding.fixture, evidence: evidenceDigest })
    assert.throws(() => prepareSyntheticCleanup({ controller: c.controller, fixture: c.binding.fixture, evidenceDigest, before: proof, current: proof, activeHandles: 0, approval: {} }))
    assert.throws(() => approveSyntheticCleanup({ controller: c.controller, fixture: c.binding.fixture, evidenceDigest, verifierObservation: proof, sealedEvidence: structuredClone(sealedEvidence) }))
    const approval = approveSyntheticCleanup({ controller: c.controller, fixture: c.binding.fixture, evidenceDigest, verifierObservation: proof, sealedEvidence })
    const plan = prepareSyntheticCleanup({ controller: c.controller, fixture: c.binding.fixture, evidenceDigest, before: proof, current: proof, activeHandles: 0, approval })
    await assert.rejects(executeSyntheticCleanup(plan, { recheck: () => ({ changed: true }), removeBoundObject: () => removed++ }))
    assert.equal(removed, 0); assert.equal(c.controller.query(c.binding.fixture).state, 'FINALIZED')
    await assert.rejects(executeSyntheticCleanup(plan, { recheck() {}, removeBoundObject() {} }))
  } finally { c.controller.close() }
})
for (const boundary of ['EVALUATION', 'CHECKPOINT', 'HUMAN_REVIEW']) test(`existing writer exercises the actual ${boundary} fixed synthetic leaf`, async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'paid-execution-test-integration-')), runId = `test-paid-boundary-${boundary.toLowerCase().replace('_', '-')}`
  try {
    await provisionInternalPaidProtectionTest({ repositoryRoot: root, runId })
    const repository = createPaidRepository({ repositoryRoot: root, runId, faultCapability: null }), writer = bindSyntheticWriter({ repository, runId })
    const output = await writeSyntheticBoundary(writer, boundary)
    assert.equal((await fs.readFile(path.join(root, output.ref), 'utf8')), 'SYNTHETIC QUALIFICATION ONLY\n')
    if (boundary === 'HUMAN_REVIEW') assert.match(output.ref, /human-review/)
    if (boundary === 'CHECKPOINT') assert.match(output.ref, /execution-checkpoints/)
    await assert.rejects(writeSyntheticBoundary(writer, boundary)); assert.equal(output.provider_calls, 0)
  } finally { assert.equal(path.dirname(root), path.resolve(tmpdir())); assert.ok(path.basename(root).startsWith('paid-execution-test-integration-')); await fs.rm(root, { recursive: true, force: true }) }
})
test('H12 v22 records qualification metadata with no Mongo or learning authority', () => {
  assert.equal(LEARNING_V2_DATA_INVENTORY_VERSION, 'learning-v2-data-inventory-v23'); const e = inventoryEntry('windows_qualification_governance')
  assert.equal(e.learning_authority, 'none'); assert.notEqual(e.storage_kind, 'mongodb_collection'); assert.match(e.retention.current_behavior, /90-calendar-day/)
})
test('synthetic complete protocols cannot produce deployment readiness', () => { assert.equal(qualificationDeploymentReadiness().status, 'BLOCKED') })
test('actual NODE_ENV=production rejects authority operations in every new component', () => {
  const source = `
    const base = './scripts/learning-v2-release/qualification/';
    const checks = [['ledger','createSyntheticJournal',[]],['controller','externalControllerReadiness',[]],['launcher','nativeLauncherReadiness',[]],
      ['collector-client','collectWindowsQualification',[{}]],['observer-client','createSyntheticObserver',[{}]],['durability','durabilityPlan',[{}]],
      ['evidence','retentionDisposition',[{},0]],['cleanup','prepareSyntheticCleanup',[{}]],['readiness','qualificationDeploymentReadiness',[]]];
    for (const [file, fn, args] of checks) { let denied=false; try { await (await import(base+file+'.mjs'))[fn](...args); } catch(e) { denied=e.code==='BLOCKED'; } if(!denied) process.exit(2); }
    console.log('9/9 PRODUCTION BLOCKED');`
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', source], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8', windowsHide: true })
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /9\/9/)
})

for (const boundary of ['EVALUATION', 'CHECKPOINT', 'HUMAN_REVIEW']) for (const fault of SYNTHETIC_IO_FAULTS) test(`isolated existing writer ${boundary} reaches ${fault} and preserves tombstone without permission`, async () => {
  const r = await exerciseSyntheticWriterFault({ boundary, fault })
  assert.equal(r.fault_reached, true); assert.equal(r.writer_returned, false)
  assert.equal(r.independent_after_process_exit, true); assert.equal(r.transport_sentinel, false); assert.equal(r.next_prepare_sentinel, false)
  assert.equal(r.present, fault !== 'BEFORE_CREATE')
  if (['AFTER_CREATE', 'STORAGE_IO_FAILURE', 'BEFORE_CREATE'].includes(fault)) assert.equal(r.length, 0)
  else if (fault === 'MID_WRITE') { assert.ok(r.length > 0 && r.length < 29); assert.equal(r.complete_bytes, false) }
  else assert.equal(r.complete_bytes, true)
  assert.equal(r.sync_completed, ['SYNC_AMBIGUOUS', 'AFTER_SYNC', 'AFTER_CLOSE'].includes(fault))
  assert.equal(r.actual_platform_qualification, 'NOT_PERFORMED'); assert.equal(r.provider_calls, 0)
})

test('controller rollback to a valid earlier snapshot cannot restore fixture eligibility', async () => {
  const c = await controllerFixture(), older = c.journal.snapshot()
  await c.controller.consume({ fixture: c.binding.fixture, test: 'test-paid-rollback', boot: c.binding.boot }); c.controller.close()
  c.journal.corrupt(older)
  const recovered = await createSyntheticController(c.journal.capability)
  try { assert.equal(recovered.query(c.binding.fixture).journal_complete, false); assert.throws(() => recovered.consume({ fixture: c.binding.fixture, test: 'test-paid-retry', boot: c.binding.boot })) }
  finally { recovered.close() }
})
test('runtime ambiguous consume is immediately visible and recovery preserves prior registration', async () => {
  const c = await controllerFixture('test-paid-ambiguous', { failAt: 4 })
  await assert.rejects(c.controller.consume({ fixture: c.binding.fixture, test: 'test-paid-fault', boot: c.binding.boot }))
  assert.equal(c.controller.query(c.binding.fixture).journal_complete, false)
  assert.equal(c.controller.query(c.binding.fixture).state, 'CONSUMED'); c.controller.close()
  const next = await createSyntheticController(c.journal.capability)
  try { assert.equal(next.query(c.binding.fixture).journal_complete, false); assert.deepEqual(next.query(c.binding.fixture).binding, c.binding) }
  finally { next.close() }
})
test('closing an old controller twice cannot release the new serialization authority', async () => {
  const c = await controllerFixture(); c.controller.close(); const next = await createSyntheticController(c.journal.capability)
  try { c.controller.close(); await assert.rejects(createSyntheticController(c.journal.capability)) } finally { next.close() }
})
test('durability wrong storage binding blocks and a known loss remains FAILED on inspection', () => {
  const h = createSyntheticDurabilityHarness(storage()), value = { phase: 'PREPARE', point: 'PREPARED_VERIFIED', acknowledged: true, present: true,
    bytes_match: true, binding_match: true, independent: true, fault_evidence: 'qualification-fault', storage_profile: d('wrong') }
  assert.equal(h.observe(value), 'BLOCKED'); assert.throws(() => h.transportSentinel())
  const failed = createSyntheticDurabilityHarness(storage())
  assert.equal(failed.observe({ ...value, storage_profile: hash(storage()), present: false }), 'FAILED')
  assert.equal(failed.inspect().status, 'FAILED')
})
test('observer metadata alone counts toward trace bounds and changed destinations block', () => {
  const o = createSyntheticObserver({ observation: resolved().proof, epoch: binding().epoch })
  o.ingest({ ...event(), bytes: LIMITS.trace })
  assert.throws(() => o.ingest(event({ sequence: 2, phase: 'POST', status: 'DENIED' })))
  const second = createSyntheticObserver({ observation: resolved().proof, epoch: binding().epoch })
  second.ingest(event({ kind: 'RENAME' }))
  assert.throws(() => second.ingest({ ...event({ sequence: 2, phase: 'POST', kind: 'RENAME', status: 'SUCCESS', effect: 'RENAMED' }), destination: 'qualification-outside' }))
})
test('positive control evidence is single-use even after a successful synthetic pairing', () => {
  const control = trace({ b: binding(undefined, 'test-paid-fresh-control'), effect: 'CREATED', status: 'SUCCESS' }), protectedTrace = trace()
  verifyPositiveControl({ control, protectedTrace, kind: 'CREATE' })
  assert.throws(() => verifyPositiveControl({ control, protectedTrace: trace({ b: binding(undefined, 'test-paid-other-protected') }), kind: 'CREATE' }))
})
test('malformed oracle inputs cannot be coerced into prevention', () => {
  for (const input of [{ code: 5, applicable: 'true', positiveControl: true }, { code: 5, applicable: true, positiveControl: true, trusted: true }, { code: -1 }, { code: Number.MAX_SAFE_INTEGER + 1 }]) assert.equal(classifyAttack(input), 'BLOCKED')
})
test('external reset plans require exact storage class and grant no executable fault authority', () => {
  assert.throws(() => externalFaultPlan(storage(), 'VM_RESET'))
  const vm = { ...storage(), kind: 'VM', hypervisor: 'qualification-hypervisor', virtual_controller: 'qualification-virtual-controller', backing_storage: 'qualification-backing-storage' }
  for (const [profile, point] of [[vm, 'VM_RESET'], [storage(), 'POWER_LOSS'], [storage(), 'RESTART_INSPECTION']]) {
    const plan = externalFaultPlan(profile, point)
    assert.equal(plan.status, 'NOT_PERFORMED'); assert.equal(plan.storage_profile, hash(profile)); assert.equal(plan.retry, false)
    assert.equal(plan.controller_outside_subject_failure_domain, 'REQUIRED'); assert.equal(plan.paid_authority, false)
  }
})
test('synthetic capabilities reject use after leaving explicit NODE_ENV=test boundary', async () => {
  const c = await controllerFixture(), r = resolved(), h = createSyntheticDurabilityHarness(storage())
  const o = createSyntheticObserver({ observation: r.proof, epoch: binding().epoch })
  process.env.NODE_ENV = 'development'
  try {
    for (const fn of [() => c.controller.query(c.binding.fixture), () => c.journal.snapshot(), () => r.resolver.request(binding()),
      () => observedTrace({}), () => o.finish(health()), () => h.inspect()]) assert.throws(fn, { code: 'BLOCKED' })
  } finally { process.env.NODE_ENV = 'test'; c.controller.close() }
})
