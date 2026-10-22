import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fixturePlan, fixtureState, enumerateHistories, compareAssignments, captureDisposition, compareControls, HANDLE_POLICY, inspectHandlePolicy, RESULTS } from './model.mjs'
import { decodeNotifications, decodeUsn, checkJournalContinuity } from './raw.mjs'
import { packFrames, unpackFrames } from './evidence.mjs'
const id = n => '1'.repeat(16) + ':' + n.toString(16).padStart(32, '0')
const make = (kind = 'rename') => {
  const initial = { 'source-a': id(1), target: id(2) }
  if (kind === 'concurrent-rename') initial['source-b'] = id(3)
  if (kind === 'link-alias') initial['victim-alias'] = id(2)
  const final = { ...initial, 'source-a': kind === 'link-alias' ? id(1) : null, target: id(1) }
  if (kind === 'concurrent-rename') { final['source-b'] = null; final.target = id(3) }
  const operations = [{ source: 'source-a', information_class: kind === 'link-alias' ? 11 : kind === 'posix-rename' ? 65 : 10, flags: kind === 'posix-rename' ? 3 : 1, result: 'SUCCESS' }]
  if (kind === 'concurrent-rename') operations.push({ ...operations[0], source: 'source-b' })
  return { kind, parent: { before: id(8), after: id(8) }, initial, final, operations, retained: kind === 'posix-rename' ? { before: id(2), after: id(2) } : null }
}

test('eight fresh off/on slots, fixed four cases, synthetic scope and no authority', () => {
  const p = fixturePlan(); assert.equal(p.length, 8); assert.equal(new Set(p.map(x => x.slot)).size, 8)
  assert.equal(p.filter(x => x.observer).length, 4); assert(p.every(x => !x.paid_authority && x.cleanup === 'RETAIN'))
})
test('fixture replay consumes before start, never resets or grants execution', () => {
  assert.equal(fixtureState(['RESERVE', 'CONSUME']).consumed, true)
  assert.equal(fixtureState(['RESERVE', 'CONSUME', 'START', 'CAPTURED', 'SEAL']).state, 'RETAINED')
  assert.equal(fixtureState(['RESERVE', 'CONSUME', 'ABORT']).executable, false)
  for (const events of [['START'], ['RESERVE', 'START'], ['RESERVE', 'CONSUME', 'CONSUME'], ['RESERVE', 'CONSUME', 'ABORT', 'RESERVE']]) assert.throws(() => fixtureState(events))
})
for (const kind of ['rename', 'posix-rename', 'link-alias', 'concurrent-rename']) test(`independent graph reconstruction: ${kind}`, () => {
  const r = enumerateHistories(make(kind)); assert.equal(r.histories.length, 1); assert.equal(r.assignments[0]['source-a'], id(2))
  if (kind === 'concurrent-rename') assert.equal(r.assignments[0]['source-b'], id(1))
  if (kind === 'link-alias') assert.equal(r.histories[0].final['victim-alias'], id(2))
})
test('concurrent reverse final winner gives reverse victim chain', () => {
  const e = make('concurrent-rename'); e.final.target = id(1)
  assert.deepEqual(enumerateHistories(e).assignments, [{ 'source-b': id(2), 'source-a': id(3) }])
})
test('unavailable concurrent final ID enumerates both assignments without choosing', () => {
  const e = make('concurrent-rename'); e.final.target = '?'
  const r = enumerateHistories(e); assert.equal(r.status, 'AMBIGUOUS'); assert.equal(r.histories.length, 2); assert.equal(r.assignments.length, 2)
  assert.equal(compareAssignments(e, [{ 'source-a': id(2), 'source-b': id(1) }]), 'AMBIGUOUS')
})
test('failed actor has no assumed namespace effect, unknown failure is unsupported', () => {
  const e = make('concurrent-rename'); e.operations[1].result = 'NO_EFFECT_FAILURE'; e.final['source-b'] = id(3); e.final.target = id(1)
  assert.equal(enumerateHistories(e).assignments.length, 1)
  assert.equal(enumerateHistories(e).assignments[0]['source-b'], null)
  e.operations[1].result = 'UNKNOWN'; assert.throws(() => enumerateHistories(e))
})
for (const key of ['notifications', 'usn', 'candidate_victim', 'timestamp', 'complete']) test(`oracle rejects candidate/control injection ${key}`, () => assert.throws(() => enumerateHistories({ ...make(), [key]: true })))
for (const mutate of [e => e.initial.target = '?', e => e.operations[0].flags = 3, e => e.operations[0].information_class = 65, e => e.operations.push(e.operations[0]), e => e.retained = { before: id(2), after: id(2) }, e => e.initial['source-a'] = e.initial.target]) test(`reject malformed independent evidence ${mutate}`, () => {
  const e = make(); mutate(e); assert.throws(() => enumerateHistories(e))
})
test('retained victim must remain old object, not newly installed source', () => { const e = make('posix-rename'); e.retained.after = id(1); assert.throws(() => enumerateHistories(e)) })
test('inconsistent final graph does not synthesize a history', () => { const e = make(); e.final.target = id(9); assert.equal(enumerateHistories(e).status, 'UNSUPPORTED') })
test('parent replacement and cross-volume identities rejected', () => {
  const e = make(); e.parent.after = id(9); assert.throws(() => enumerateHistories(e))
  e.parent.after = e.parent.before; e.initial.target = '2'.repeat(16) + ':' + '2'.repeat(32); assert.throws(() => enumerateHistories(e))
})
test('candidate ambiguity is not resolved using the unique independent answer', () => assert.equal(compareAssignments(make(), [{ 'source-a': id(2) }, { 'source-a': id(9) }]), 'AMBIGUOUS'))
test('matching assignments alone cannot become positive research or platform proof', () => {
  const assignment = compareAssignments(make(), [{ 'source-a': id(2) }]); assert.equal(assignment, 'ASSIGNMENT_MATCH_ONLY')
  assert.equal(captureDisposition({ unsupported: false, interference: false, loss: false, drain: 'CANCEL_COMPLETED', assignment }), 'UNSUPPORTED')
  assert.throws(() => captureDisposition({ unsupported: false, interference: false, loss: false, drain: 'COMPLETE', assignment }))
})
test('all six requested result names frozen', () => assert.deepEqual(RESULTS, ['SUPPORTED_CORRELATION', 'AMBIGUOUS', 'MISSING_REQUIRED_IDENTITY', 'OBSERVATION_LOSS', 'OBSERVER_INTERFERENCE', 'UNSUPPORTED']))
test('observed loss/interference cannot be overridden by matching IDs', () => {
  assert.equal(captureDisposition({ unsupported: false, interference: false, loss: true, drain: 'UNPROVEN', assignment: 'ASSIGNMENT_MATCH_ONLY' }), 'OBSERVATION_LOSS')
  assert.equal(captureDisposition({ unsupported: false, interference: true, loss: false, drain: 'UNPROVEN', assignment: 'ASSIGNMENT_MATCH_ONLY' }), 'OBSERVER_INTERFERENCE')
})
const watch = () => ({ kind: 'watch', ...HANDLE_POLICY.watch, inherited: false, critical_interval: true })
test('exact observer share/access policy and identity-handle exclusion', () => {
  assert.equal(inspectHandlePolicy([watch()]), true)
  for (const changes of [{ access: 0x10000000 }, { share: 3 }, { inherited: true }, { flags: 0 }, { disposition: 4 }]) assert.equal(inspectHandlePolicy([{ ...watch(), ...changes }]), false)
  assert.equal(inspectHandlePolicy([{ kind: 'identity', ...HANDLE_POLICY.identity, inherited: false, critical_interval: true }]), false)
})
const controls = () => {
  const operations = [{ source: 'source-a', information_class: 10, flags: 1, native_status: 0 }]
  return [{ slot: 'research-stage1-1-off', kind: 'rename', observer: false, operations, handles: [] }, { slot: 'research-stage1-1-on', kind: 'rename', observer: true, operations: structuredClone(operations), handles: [watch()] }]
}
test('control comparison neither opens handles nor grants noninterference proof', () => assert.equal(compareControls(...controls()), 'NO_DIFFERENCE_OBSERVED'))
test('changed actor return status fails observer comparison', () => { const [off, on] = controls(); on.operations[0].native_status = 5; assert.equal(compareControls(off, on), 'OBSERVER_INTERFERENCE') })
test('control reuse and observer activity in off fixture rejected', () => {
  const [off, on] = controls(); off.handles = [watch()]; assert.equal(compareControls(off, on), 'OBSERVER_INTERFERENCE')
  off.slot = on.slot; assert.throws(() => compareControls(off, on))
})
test('empty or duplicate control actor evidence rejected', () => {
  const [off, on] = controls(); off.operations = []; assert.throws(() => compareControls(off, on))
  off.operations = [on.operations[0], on.operations[0]]; assert.throws(() => compareControls(off, on))
})

function notify() { const b = Buffer.alloc(96); b.writeUInt32LE(2, 4); b.writeBigUInt64LE(23n, 64); b.writeBigUInt64LE(7n, 72); b.writeUInt32LE(12, 80); b.write('target', 84, 'utf16le'); return b }
test('extended notification preserves parent/file IDs and raw offsets', () => assert.deepEqual(decodeNotifications(notify()), [{ offset: 0, action: 2, file_id64: '1700000000000000', parent_id64: '0700000000000000', name: 'target' }]))
test('every truncated notification rejects, including empty overflow completion', () => { const b = notify(); for (let i = 0; i < b.length; i++) assert.throws(() => decodeNotifications(b.subarray(0, i))) })
for (const [name, mutate] of [['next', b => b.writeUInt32LE(4)], ['action', b => b.writeUInt32LE(9, 4)], ['odd name', b => b.writeUInt32LE(3, 80)], ['nul', b => b.writeUInt16LE(0, 84)], ['surrogate', b => b.writeUInt16LE(0xd800, 84)]]) test(`notify rejects ${name}`, () => { const b = notify(); mutate(b); assert.throws(() => decodeNotifications(b)) })
function usn(major = 2) {
  const base = major === 2 ? 60 : 76, size = base + 12; const b = Buffer.alloc(8 + size)
  b.writeBigInt64LE(200n); b.writeUInt32LE(size, 8); b.writeUInt16LE(major, 12)
  b.writeBigUInt64LE(23n, 16); b.writeBigUInt64LE(7n, major === 2 ? 24 : 32)
  b.writeBigInt64LE(100n, 8 + (major === 2 ? 24 : 40)); b.writeUInt32LE(0x200, 8 + (major === 2 ? 40 : 56))
  b.writeUInt16LE(12, 8 + base - 4); b.writeUInt16LE(base, 8 + base - 2); b.write('target', 8 + base, 'utf16le'); return b
}
for (const version of [2, 3]) test(`USN v${version} keeps native ID width and interval boundary`, () => { const r = decodeUsn(usn(version), 100n, 150n); assert.equal(r.records[0].file_id.length, version === 2 ? 16 : 32); assert.equal(r.records[0].parent_id.length, version === 2 ? 16 : 32); assert.equal(r.records[0].name, 'target'); assert.equal(r.reached_cut, true) })
test('every nonempty truncated USN record rejects', () => { const b = usn(); for (let i = 0; i < b.length; i++) { if (i === 8) continue; assert.throws(() => decodeUsn(b.subarray(0, i), 100n, 150n)) } })
for (const [name, mutate] of [['version', b => b.writeUInt16LE(4, 12)], ['length', b => b.writeUInt32LE(8, 8)], ['offset', b => b.writeUInt16LE(0, 66)], ['cursor', b => b.writeBigInt64LE(50n)], ['minor', b => b.writeUInt16LE(1, 14)]]) test(`USN rejects ${name}`, () => { const b = usn(); mutate(b); assert.throws(() => decodeUsn(b, 100n, 150n)) })
test('journal recreation, truncation and stamped discontinuity fail', () => {
  const a = { id: '1'.repeat(16), first: 10n, lowest: 10n, next: 100n }
  assert(checkJournalContinuity(a, a, 100n))
  for (const b of [{ ...a, id: '2'.repeat(16) }, { ...a, first: 101n, next: 200n }, { ...a, lowest: 101n, next: 200n }, { ...a, next: 90n }]) assert.equal(checkJournalContinuity(a, b, 100n), false)
})
test('raw evidence round trip preserves bytes, errors and chain', () => {
  const f = [{ sequence: 1, kind: 6, status: 0, bytes: notify() }, { sequence: 2, kind: 9, status: 5, bytes: Buffer.alloc(0) }]
  assert.deepEqual(unpackFrames(packFrames(f)), f)
})
for (const mutate of [e => e.records[0].bytes = 'AA==', e => e.records[0].status = 5, e => e.records[0].sequence = 2, e => e.head = '0'.repeat(64), e => e.platform_qualification = true, e => e.records[0].bytes += '\n']) test(`reject evidence mutation ${mutate}`, () => {
  const e = packFrames([{ sequence: 1, kind: 6, status: 0, bytes: notify() }]); mutate(e); assert.throws(() => unpackFrames(e))
})
test('native preflight executable has no execution branch; acquisition uses only read journal controls', () => {
  const entry = readFileSync(new URL('./preflight.cpp', import.meta.url), 'utf8'), adapter = readFileSync(new URL('./acquisition.hpp', import.meta.url), 'utf8')
  assert(entry.includes('L"--self-test"')); assert(!entry.includes('directory_capture capture'))
  assert(adapter.includes('ReadDirectoryChangesExW')); assert(adapter.includes('FSCTL_READ_USN_JOURNAL'))
  assert(!/FSCTL_(CREATE|DELETE)_USN_JOURNAL|FSCTL_REQUEST_OPLOCK|LockFile|SetSecurityInfo|SetFileInformationByHandle|CreateProcess/.test(adapter))
})
