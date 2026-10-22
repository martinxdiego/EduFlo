import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { decodeNativeObservation } from '../scripts/learning-v2-release/qualification/native-wire.mjs'
import { nativeObservationFixture } from './helpers/qualification-native-wire.mjs'

test('QI native decoder returns metadata without provenance or paid capability', () => {
  const { bytes } = nativeObservationFixture(), value = decodeNativeObservation(bytes)
  assert.equal(value.scope, 'UNAUTHENTICATED_NATIVE_OBSERVATION')
  assert.equal(value.paid_authority, false); assert.equal(value.tokens[0].user, 'S-1-5-18')
  assert.equal(value.facts.length, 8); assert.equal(value.objects[0].volume, '1')
  assert.ok(Object.isFrozen(value)); assert.ok(Object.isFrozen(value.tokens))
  bytes.fill(0); assert.equal(value.tokens[0].image, '07'.repeat(32))
})

const mutations = [
  ['magic', 'header', 0, 0], ['version', 'header', 4, 1], ['request length', 'header', 8, 0xffffffff],
  ['verb', 'header', 12, 2], ['status', 'header', 176, 0], ['reason', 'header', 180, 1],
  ['object overflow', 'header', 184, 257], ['token overflow', 'header', 188, 17],
  ['payload overflow', 'header', 192, 0xffffffff], ['fact overflow', 'header', 228, 0xffffffff],
  ['role', 'token', 0, 7], ['PID absent', 'token', 4, 0], ['TID absent', 'token', 8, 0],
  ['token type', 'token', 12, 3], ['elevation', 'token', 16, 4], ['impersonation', 'token', 20, 5],
  ['group overflow', 'token', 24, 257], ['restricting SID overflow', 'token', 28, 257],
  ['privilege overflow', 'token', 32, 129], ['token padding', 'token', 36, 1],
  ['object index', 'object', 0, 1], ['descriptor overflow', 'object', 12, 65537],
  ['object padding', 'object', 20, 1], ['unused access slot', 'object', 420, 1],
  ['SID offset overflow', 'descriptor', 4, 0xffffffff], ['ACL offset overflow', 'descriptor', 16, 0xffffffff],
  ['missing DACL', 'descriptor', 16, 0], ['root parent', 'resolution', 0, 0],
  ['parent self cycle', 'resolution', 4, 0], ['reparse overflow', 'resolution', 8, 16385],
  ['resolution padding', 'resolution', 12, 1], ['fact kind', 'resolutionHeader', 0, 6],
  ['fact index', 'resolutionHeader', 4, 1], ['fact size', 'resolutionHeader', 8, 79],
  ['fact reserved', 'resolutionHeader', 12, 1], ['volume mismatch', 'volume', 0, 2],
  ['removable', 'volume', 28, 1], ['flush flag', 'volume', 48, 2], ['volume padding', 'volume', 188, 1],
  ['label mask', 'mandatory', 0, 8], ['label flag', 'mandatory', 4, 2],
  ['handles overflow', 'handles', 0, 257], ['filters overflow', 'filters', 0, 33],
  ['duplicate fact', 'filtersHeader', 0, 4],
  ['unused primary access slot', 'object', 484, 1], ['inconsistent nonimpersonating access', 'object', 480, 1],
  ['primary role binding', 'primary', 0, 2], ['primary PID binding', 'primary', 4, 2], ['primary TID binding', 'primary', 8, 2],
  ['primary token type', 'primary', 12, 2], ['primary token impersonation', 'primary', 20, 3], ['primary token generation', 'primary', 40, 2],
  ['primary token mismatch', 'primary', 48, 2], ['primary modified ID mismatch', 'primary', 64, 2],
  ['primary group overflow', 'primary', 24, 257], ['primary frame bounds', 'primaryHeader', 8, 1207],
  ['token context index', 'contextHeader', 4, 1], ['token context bounds', 'contextHeader', 8, 111],
  ['primary session mismatch', 'context', 0, 1], ['effective session mismatch', 'context', 4, 1],
  ['unknown mandatory policy', 'context', 8, 4], ['unknown UIAccess state', 'context', 16, 2],
  ['unsupported primary app container', 'context', 24, 1], ['unsupported effective app container', 'context', 28, 1],
  ['unknown virtualization state', 'context', 32, 2], ['primary profile mismatch', 'context', 48, 1],
]
for (const [name, section, delta, word] of mutations) test(`QI native decoder rejects ${name}`, () => {
  const { bytes, offsets } = nativeObservationFixture(); bytes.writeUInt32LE(word, offsets[section] + delta)
  assert.throws(() => decodeNativeObservation(bytes), /NATIVE_/)
})
for (const [name, start] of [['challenge', 16], ['profile', 48], ['epoch', 80], ['fixture', 112], ['boot', 144]]) {
  test(`QI native decoder rejects missing ${name} binding`, () => {
    const { bytes } = nativeObservationFixture(); bytes.fill(0, start, start + 32)
    assert.throws(() => decodeNativeObservation(bytes), /NATIVE_SCHEMA/)
  })
}
test('QI native decoder rejects every byte truncation and appended bytes', () => {
  const { bytes } = nativeObservationFixture()
  for (let n = 0; n < bytes.length; n++) assert.throws(() => decodeNativeObservation(bytes.subarray(0, n)), /NATIVE_/)
  assert.throws(() => decodeNativeObservation(Buffer.concat([bytes, Buffer.from([0])])), /NATIVE_/)
})
test('QI native decoder rejects noncanonical trailing SID data', () => {
  const { bytes, offsets } = nativeObservationFixture(); bytes[offsets.token + 104] = 1
  assert.throws(() => decodeNativeObservation(bytes), /NATIVE_SCHEMA/)
})
test('QI native decoder bounds input before allocation', () => {
  assert.throws(() => decodeNativeObservation(Buffer.alloc(1048577)), /NATIVE_MESSAGE_BOUND/)
  for (const input of [null, {}, new Uint8Array(1), 'json']) assert.throws(() => decodeNativeObservation(input), /NATIVE_MESSAGE_BOUND/)
})

test('QI native wire v3 rejects the previous single-token wire version', () => {
  const { bytes } = nativeObservationFixture(); bytes.writeUInt32LE(2, 4)
  assert.throws(() => decodeNativeObservation(bytes), /NATIVE_SCHEMA/)
})
test('QI native decoder preserves distinct primary and effective impersonation facts', () => {
  const { bytes, offsets } = nativeObservationFixture()
  bytes.writeUInt32LE(2, offsets.token + 12); bytes.writeUInt32LE(3, offsets.token + 20)
  bytes.writeBigUInt64LE(2n, offsets.token + 48); bytes.fill(0, offsets.token + 72, offsets.token + 440); bytes.write('S-1-5-19', offsets.token + 72, 'utf16le')
  bytes.writeUInt32LE(1, offsets.context + 4); bytes.fill(11, offsets.context + 80, offsets.context + 112)
  bytes.writeUInt32LE(0x10000, offsets.object + 480)
  bytes.writeUInt32LE(0x10000, offsets.access + 12); bytes.writeUInt32LE(0x10000, offsets.access + 20)
  const decoded = decodeNativeObservation(bytes), primary = decoded.facts.find(f => f.kind === 6).value, context = decoded.facts.find(f => f.kind === 7).value
  assert.equal(decoded.tokens[0].user, 'S-1-5-19'); assert.equal(primary.user, 'S-1-5-18')
  assert.equal(decoded.tokens[0].tokenId, '2'); assert.equal(primary.tokenId, '1')
  assert.deepEqual(context.session, [0, 1]); assert.notEqual(context.profiles[0], context.profiles[1])
  assert.deepEqual(decoded.objects[0].primaryAccess, [0x10000]); assert.deepEqual(decoded.objects[0].access, [0])
  assert.equal(decoded.scope, 'UNAUTHENTICATED_NATIVE_OBSERVATION')
})
test('QI native token facts cannot be replaced by a duplicate handle fact', () => {
  const { bytes, offsets } = nativeObservationFixture(); bytes.writeUInt32LE(4, offsets.primaryHeader)
  assert.throws(() => decodeNativeObservation(bytes), /NATIVE_/)
})
test('QI native context rejects absent primary and effective profile fingerprints', () => {
  for (const delta of [48, 80]) { const { bytes, offsets } = nativeObservationFixture(); bytes.fill(0, offsets.context + delta, offsets.context + delta + 32); assert.throws(() => decodeNativeObservation(bytes), /NATIVE_SCHEMA/) }
})
test('QI native decoder rejects noncanonical and overflowing SID components', () => {
  for (const sid of ['S-1-05-18', 'S-1-5-018', 'S-1-5-4294967296', 'S-1-281474976710656-1']) {
    const { bytes, offsets } = nativeObservationFixture(); bytes.fill(0, offsets.token + 72, offsets.token + 440); bytes.write(sid, offsets.token + 72, 'utf16le')
    assert.throws(() => decodeNativeObservation(bytes), /NATIVE_SCHEMA/)
  }
})
test('QI native decoder cannot acquire authority in actual production environment', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import {decodeNativeObservation} from './scripts/learning-v2-release/qualification/native-wire.mjs';
    try { decodeNativeObservation(Buffer.alloc(0)); process.exit(1) } catch(e) { if(!/PRODUCTION/.test(e.message)) process.exit(2) }
  `], { env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8' })
  assert.equal(child.status, 0, child.stderr)
})
