import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { assessNativeRequiredFacts } from '../scripts/learning-v2-release/qualification/native-acceptance.mjs'
import { nativeObservationFixture } from './helpers/qualification-native-wire.mjs'

function fixture(change = () => {}) { const value = nativeObservationFixture(); change(value.bytes, value.offsets);
  for (const [source, target, token, policy] of [[480, 4, 'primary', 8], [416, 76, 'token', 12]]) {
    const b = value.bytes, o = value.offsets, mask = b.readUInt32LE(o.object + source)
    const sid = b.subarray(o[token] + 808, o[token] + 1176).toString('utf16le').split('\0')[0], level = Number(sid.slice(7)), mandatory = b.readUInt32LE(o.context + policy)
    const denied = level < 8192 && (mandatory & 1) ? 0xd0156 : 0
    b.writeUInt32LE(mask, o.access + target + 8); b.writeUInt32LE(denied, o.access + target + 12); b.writeUInt32LE(mask & ~denied, o.access + target + 16)
    b.writeUInt32LE(Number.isSafeInteger(level) ? level : 0, o.access + target + 48); b.writeUInt32LE(mandatory, o.access + target + 56)
  }
  return assessNativeRequiredFacts(value.bytes) }
test('QI-A authenticated framing cannot stand in for required native facts', () => {
  const value = fixture()
  assert.equal(value.status, 'BLOCKED'); assert.equal(value.scope, 'NATIVE_REQUIRED_FACT_DIAGNOSTIC')
  assert.deepEqual(value.missing_required_facts, ['COMPLETE_STORAGE_DEVICE_PROFILE', 'NATIVE_COMPOSITE_ACCESS_PROOF', 'RETAINED_HANDLE_OBJECT_LIFETIME', 'SEALED_RUNTIME_DEPENDENCY_CLOSURE'])
  assert.equal(value.paid_authority, false); assert.equal(value.provider_calls, 0)
  assert.ok(Object.isFrozen(value)); assert.ok(Object.isFrozen(value.objects))
})
test('QI-A caller flags, hashes, paths and synthetic provenance cannot satisfy the gate', () => {
  for (const input of [{ complete: true }, { status: 'COMPLETE', storage: 'a'.repeat(64) }, { scope: 'AUTHENTICATED_NATIVE_COMPONENT_OBSERVATION' }, { path: 'C:\\trusted' }, { synthetic: false }]) {
    assert.throws(() => assessNativeRequiredFacts(input), /NATIVE_MESSAGE_BOUND/)
  }
})
test('QI-A every truncated native message is rejected before diagnostic projection', () => {
  const { bytes } = nativeObservationFixture()
  for (let length = 0; length < bytes.length; length++) assert.throws(() => assessNativeRequiredFacts(bytes.subarray(0, length)), /NATIVE_/)
})
test('QI-A ownership remains visible even when AccessCheck reports zero rights', () => {
  const role = fixture().objects[0].roles[0]
  for (const token of [role.primary, role.effective]) {
    assert.equal(token.access_check_mask, 0); assert.equal(token.owner_candidate, true)
    assert.equal(token.owner_write_dac_potential, true); assert.equal(token.authority_proof, false)
  }
})
test('QI-A MIC default label prevents a lower-integrity owner becoming write proof', () => {
  const value = fixture((b, o) => { for (const at of [o.token, o.primary]) { b.fill(0, at + 808, at + 1176); b.write('S-1-16-4096', at + 808, 'utf16le') } b.writeUInt32LE(1, o.context + 8); b.writeUInt32LE(1, o.context + 12) })
  const access = value.objects[0].roles[0].primary
  assert.equal(access.object_integrity, 8192); assert.equal(access.mic_write_blocked, true)
  assert.equal(access.owner_write_dac_potential, false); assert.equal(value.status, 'BLOCKED')
})
test('QI-A object DELETE is represented without granting qualification authority', () => {
  const value = fixture((b, o) => { b.writeUInt32LE(0x10000, o.object + 416); b.writeUInt32LE(0x10000, o.object + 480) })
  const access = value.objects[0].roles[0].primary
  assert.equal(access.delete_route_present, true); assert.equal(access.parent_delete_child, false)
  assert.equal(value.status, 'BLOCKED')
})
function parentFixture(parentMask, childMask = 0) {
  const { bytes, offsets: o } = nativeObservationFixture()
  const header = Buffer.from(bytes.subarray(0, 232)), token = Buffer.from(bytes.subarray(o.token, o.object))
  const parent = Buffer.from(bytes.subarray(o.object, o.resolutionHeader)), child = Buffer.from(parent)
  for (const at of [416, 480]) { parent.writeUInt32LE(parentMask, at); child.writeUInt32LE(childMask, at) }
  child.writeUInt32LE(1, 0); child[32] ^= 1
  const firstFacts = Buffer.from(bytes.subarray(o.resolutionHeader))
  const extraFacts = []
  for (const name of ['resolution', 'volume', 'mandatory', 'filters', 'access']) {
    const start = o[`${name}Header`], size = bytes.readUInt32LE(start + 8), frame = Buffer.from(bytes.subarray(start, start + 16 + size))
    frame.writeUInt32LE(1, 4)
    if (name === 'resolution') { frame.writeUInt32LE(0, 16); frame.writeUInt32LE(0, 20); frame[32] ^= 1 }
    if (name === 'access') for (const at of [20, 92]) {
      frame.writeUInt32LE(childMask, at + 8); frame.writeUInt32LE(childMask | (parentMask & 0x40 ? 0x10000 : 0) | (parentMask & 1 ? 0x80 : 0), at + 16)
      frame.writeUInt32LE(parentMask, at + 20); frame.writeUInt32LE(Number(Boolean(parentMask & 0x40)), at + 24); frame.writeUInt32LE(Number(Boolean(parentMask & 1)), at + 28)
    }
    extraFacts.push(frame)
  }
  for (const at of [4, 76]) { firstFacts.writeUInt32LE(parentMask, o.access - o.resolutionHeader + at + 8); firstFacts.writeUInt32LE(parentMask, o.access - o.resolutionHeader + at + 16) }
  header.writeUInt32LE(2, 184); header.writeUInt32LE(13, 228)
  const result = Buffer.concat([header, token, parent, child, firstFacts, ...extraFacts]); result.writeUInt32LE(result.length - 232, 192)
  return result
}
test('QI-A parent DELETE_CHILD remains a separate route despite no child DELETE', () => {
  const value = assessNativeRequiredFacts(parentFixture(0x40))
  const access = value.objects[1].roles[0].primary
  assert.equal(access.delete_on_object, false); assert.equal(access.parent_delete_child, true)
  assert.equal(access.delete_route_present, true); assert.equal(value.status, 'BLOCKED')
})
test('QI-A absent parent DELETE_CHILD does not invent a deletion route', () => {
  const access = assessNativeRequiredFacts(parentFixture(0)).objects[1].roles[0].effective
  assert.equal(access.delete_route_present, false)
})
test('QI-A volume identity hashes alone cannot complete a storage profile', () => {
  const value = fixture((b, o) => { b.fill(12, o.volume + 60, o.volume + 188) })
  assert.equal(value.unsupported_semantics.includes('MISSING_STORAGE_IDENTITY'), false)
  assert.equal(value.status, 'BLOCKED'); assert.ok(value.missing_required_facts.includes('COMPLETE_STORAGE_DEVICE_PROFILE'))
})
for (const bus of [0, 14, 15, 16, 17, 18]) test(`QI-A unresolved storage bus ${bus} blocks acceptance`, () => {
  assert.ok(fixture((b, o) => b.writeUInt32LE(bus, o.volume + 24)).unsupported_semantics.includes('STORAGE_STACK_NOT_DESCRIBED'))
})
test('QI-A non-integrity SIDs cannot become a numeric integrity level', () => {
  assert.throws(() => fixture((b, o) => { for (const at of [o.token, o.primary]) { b.fill(0, at + 808, at + 1176); b.write('S-1-5-18', at + 808, 'utf16le') } }), /NATIVE_SCHEMA/)
})
test('QI-A empty retained-handle inventory does not prove lifetime closure', () => {
  assert.ok(fixture().missing_required_facts.includes('RETAINED_HANDLE_OBJECT_LIFETIME'))
})
test('QI-A independent primary/effective masks are preserved', () => {
  const value = fixture((b, o) => { b.writeUInt32LE(2, o.token + 12); b.writeUInt32LE(3, o.token + 20); b.writeUInt32LE(0x10000, o.object + 480) })
  const role = value.objects[0].roles[0]
  assert.equal(role.primary.delete_on_object, true); assert.equal(role.effective.delete_on_object, false)
})
test('QI-A actual production rejects even required-fact observation', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import {assessNativeRequiredFacts} from './scripts/learning-v2-release/qualification/native-acceptance.mjs';try{assessNativeRequiredFacts(Buffer.alloc(0));process.exit(2)}catch(e){if(!/PRODUCTION/.test(e.message))process.exit(3)}`], { env: { ...process.env, NODE_ENV: 'production' }, windowsHide: true, encoding: 'utf8' })
  assert.equal(child.status, 0, child.stderr)
})
