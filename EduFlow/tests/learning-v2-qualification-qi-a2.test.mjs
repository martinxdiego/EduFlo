import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeNativeObservation } from '../scripts/learning-v2-release/qualification/native-wire.mjs'
import { assessNativeRequiredFacts } from '../scripts/learning-v2-release/qualification/native-acceptance.mjs'
import { nativeObservationFixture } from './helpers/qualification-native-wire.mjs'

// Independent corruption of serialized records, not native producer callbacks.
const mutate = change => { const f = nativeObservationFixture(); change(f.bytes, f.offsets); return f.bytes }
const both = (b, o, field, value) => { for (const base of [4, 76]) b.writeUInt32LE(value, o.access + base + field * 4) }
test('QI-A2 v4 carries two bound native composite assessments without authority', () => {
  const { bytes } = nativeObservationFixture(), value = decodeNativeObservation(bytes)
  assert.equal(value.version, 4)
  const pair = value.facts.find(f => f.kind === 8).value[0]
  assert.equal(pair.length, 2); assert.equal(pair[0].objectIntegrity, 8192)
  const gate = assessNativeRequiredFacts(bytes)
  assert.deepEqual(gate.objects[0].roles[0].primary.native_composite, pair[0])
  assert.equal(gate.status, 'BLOCKED'); assert.equal(gate.paid_authority, false)
})
for (const version of [1, 2, 3, 5]) test(`QI-A2 rejects collector dialect ${version}`, () => {
  assert.throws(() => decodeNativeObservation(mutate(b => b.writeUInt32LE(version, 4))), /NATIVE_SCHEMA/)
})
for (const [name, field, value] of [
  ['record version', 0, 2], ['record length', 1, 76], ['raw DAC binding', 2, 1],
  ['MIC mask', 3, 1], ['current mask', 4, 1], ['root parent rights', 5, 2],
  ['parent deletion flag', 6, 1], ['parent read flag', 7, 1], ['owner boolean', 8, 2],
  ['OWNER RIGHTS binding', 9, 1], ['active privilege without potential', 10, 1],
  ['privilege mask overflow', 11, 0x80000000], ['token integrity binding', 12, 4096],
  ['object integrity binding', 13, 4096], ['token policy binding', 14, 1],
  ['object policy binding', 15, 0], ['unknown uncertainty bit', 16, 8], ['reserved bytes', 17, 1],
]) test(`QI-A2 rejects inconsistent ${name}`, () => {
  assert.throws(() => decodeNativeObservation(mutate((b, o) => both(b, o, field, value))), /NATIVE_SCHEMA/)
})
test('QI-A2 internally consistent forged parent DELETE_CHILD still fails root binding', () => {
  const bytes = mutate((b, o) => { both(b, o, 5, 0x40); both(b, o, 6, 1); both(b, o, 4, 0x10000) })
  assert.throws(() => decodeNativeObservation(bytes), /NATIVE_SCHEMA/)
})
test('QI-A2 internally consistent forged MIC still fails descriptor/token composition', () => {
  const bytes = mutate((b, o) => { both(b, o, 3, 0xd0156); both(b, o, 4, 0) })
  assert.throws(() => decodeNativeObservation(bytes), /NATIVE_SCHEMA/)
})
test('QI-A2 no impersonation forbids different primary/effective assessments', () => {
  assert.throws(() => decodeNativeObservation(mutate((b, o) => b.writeUInt32LE(1, o.access + 76 + 64))), /NATIVE_SCHEMA/)
})
test('QI-A2 unresolved native privilege semantics remain an explicit block', () => {
  const result = assessNativeRequiredFacts(mutate((b, o) => both(b, o, 16, 1)))
  assert.ok(result.unsupported_semantics.includes('NATIVE_ACCESS_SEMANTICS_UNRESOLVED'))
  assert.equal(result.status, 'BLOCKED'); assert.equal(result.provider_calls, 0)
})
test('QI-A2 a separate MIC label cannot contradict the serialized descriptor', () => {
  assert.throws(() => decodeNativeObservation(mutate((b, o) => {
    b.writeUInt32LE(1, o.mandatory); b.writeUInt32LE(1, o.mandatory + 4); b.write('S-1-16-8192', o.mandatory + 8, 'utf16le')
  })), /NATIVE_SCHEMA/)
})
test('QI-A2 complete-looking hashes and empty samples cannot satisfy missing lifetime/closure', () => {
  const result = assessNativeRequiredFacts(mutate((b, o) => b.fill(17, o.volume + 60, o.volume + 188)))
  for (const missing of ['COMPLETE_STORAGE_DEVICE_PROFILE', 'RETAINED_HANDLE_OBJECT_LIFETIME', 'SEALED_RUNTIME_DEPENDENCY_CLOSURE']) assert.ok(result.missing_required_facts.includes(missing))
  assert.equal(result.status, 'BLOCKED'); assert.equal(result.paid_authority, false)
})
