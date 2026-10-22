import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createNativeQualificationRequest, collectWindowsQualification, nativeResolvedObservation, createNativeLaunchRequest, launchNativeQualification, nativeResolvedLaunch } from '../scripts/learning-v2-release/qualification/collector-client.mjs'
import { decodeNativeLaunchOutcome } from '../scripts/learning-v2-release/qualification/native-launch-wire.mjs'
import { VERSION } from '../scripts/learning-v2-release/qualification/contracts.mjs'

const binding = () => ({ fixture: 'qualification-unregistered-fixture', profile: 'a'.repeat(64), epoch: 'qualification-unregistered-epoch', boot: 'qualification-unregistered-boot', reservation: 'b'.repeat(64) })
function environment(value, fn) { const previous = process.env.NODE_ENV; process.env.NODE_ENV = value; try { return fn() } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous } }

test('native resolver requires its explicit development environment', () => {
  for (const env of ['test', 'production', 'staging', '']) environment(env, () => assert.throws(() => createNativeQualificationRequest(binding()), /ENVIRONMENT|PRODUCTION/))
})
test('native request creation accepts only bounded opaque qualification references', () => environment('development', () => {
  for (const value of [{ ...binding(), fixture: 'tutor-paid-evaluation-v9-r1-r2-run-1-v1' }, { ...binding(), path: 'C:\\arbitrary' }, { ...binding(), sid: 'S-1-5-18' }, { ...binding(), descriptor: 'trusted' }, { ...binding(), profile: 'caller says safe' }]) assert.throws(() => createNativeQualificationRequest(value), /INVALID_QUALIFICATION_MESSAGE/)
}))
test('native requests issue fresh challenges and immutable bindings', () => environment('development', () => {
  const a = createNativeQualificationRequest(binding()), b = createNativeQualificationRequest(binding())
  assert.notEqual(a.challenge, b.challenge); assert.ok(Object.isFrozen(a)); assert.ok(Object.isFrozen(a.binding))
  assert.equal(a.version, VERSION); assert.equal(a.verb, 'INSPECT')
}))
test('a caller-created request is not a registered native request', () => environment('development', () => {
  const made = { version: VERSION, binding: binding(), challenge: 'c'.repeat(64), verb: 'INSPECT' }
  assert.equal(collectWindowsQualification(made).status, 'BLOCKED')
  assert.match(collectWindowsQualification(made).reason, /REGISTERED_NATIVE_REQUEST_REQUIRED/)
}))
test('serialized native requests cannot be replayed as private requests', () => environment('development', () => {
  const request = createNativeQualificationRequest(binding())
  for (const copy of [structuredClone(request), JSON.stringify(request), Buffer.from(JSON.stringify(request))]) assert.equal(collectWindowsQualification(copy).status, 'BLOCKED')
}))
test('test environment cannot use a native request issued in development', () => {
  const request = environment('development', () => createNativeQualificationRequest(binding()))
  environment('test', () => assert.equal(collectWindowsQualification(request).status, 'BLOCKED'))
  environment('development', () => assert.match(collectWindowsQualification(request).reason, /REGISTERED_NATIVE_REQUEST_REQUIRED/))
})
test('missing packaged native bridge burns the request without a developer-build fallback', () => environment('development', () => {
  // This suite is for the ordinary checkout, never a protected deployment lab.
  assert.equal(existsSync(new URL('../native/qualification/bin/bridge.node', import.meta.url)), false)
  const request = createNativeQualificationRequest(binding()), first = collectWindowsQualification(request), second = collectWindowsQualification(request)
  assert.equal(first.status, 'BLOCKED'); assert.match(first.reason, /AUTHENTICATED_NATIVE_BROKER_UNAVAILABLE/)
  assert.equal(first.paid_authority, false); assert.equal(first.provider_calls, 0)
  assert.equal(second.status, 'BLOCKED'); assert.match(second.reason, /REGISTERED_NATIVE_REQUEST_REQUIRED/)
}))
test('caller JSON and synthetic labels cannot become authenticated native observations', () => environment('development', () => {
  for (const proof of [{}, { scope: 'AUTHENTICATED_NATIVE_COMPONENT_OBSERVATION', paid_authority: false }, { scope: 'SYNTHETIC_TEST_ONLY' }]) assert.throws(() => nativeResolvedObservation(proof), /AUTHENTICATED_NATIVE_OBSERVATION_REQUIRED/)
}))
test('native resolver remains blocked in actual NODE_ENV=production', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import * as native from './scripts/learning-v2-release/qualification/collector-client.mjs';
    for(const name of ['createNativeQualificationRequest','collectWindowsQualification','nativeResolvedObservation','createNativeLaunchRequest','launchNativeQualification','nativeResolvedLaunch']) {
      let blocked=false;try{native[name]({})}catch(e){blocked=e.code==='BLOCKED'&&e.message==='PRODUCTION_ISOLATED'}if(!blocked)process.exit(2)
    }
  `], { env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8', windowsHide: true })
  assert.equal(child.status, 0, child.stderr)
})

const launch = () => ({ binding: binding(), role: 'ATTACKER_DEVELOPER', ticket: 'd'.repeat(64) })
test('native launch accepts only fixed roles and opaque controller ticket locators', () => environment('development', () => {
  for (const value of [{ ...launch(), role: 'PROVISIONER' }, { ...launch(), role: 'VERIFIER' }, { ...launch(), role: 'SHELL' },
    { ...launch(), command: 'arbitrary' }, { ...launch(), credentials: {} }, { ...launch(), image: 'arbitrary.exe' },
    { ...launch(), handles: [] }, { ...launch(), token: 'safe' }, { ...launch(), ticket: '0'.repeat(64) }]) assert.throws(() => createNativeLaunchRequest(value), /INVALID_QUALIFICATION_MESSAGE/)
  const request = createNativeLaunchRequest(launch()); assert.ok(Object.isFrozen(request)); assert.equal(request.verb, 'LAUNCH')
  assert.notEqual(request.challenge, createNativeLaunchRequest(launch()).challenge)
}))
test('native launch environment changes consume the local request', () => {
  const request = environment('development', () => createNativeLaunchRequest(launch()))
  environment('test', () => assert.equal(launchNativeQualification(request).status, 'BLOCKED'))
  environment('development', () => assert.match(launchNativeQualification(request).reason, /REGISTERED_NATIVE_LAUNCH_REQUIRED/))
})
test('native launch cannot replay copies, caller receipts or the consumed original', () => environment('development', () => {
  const request = createNativeLaunchRequest(launch())
  for (const fake of [structuredClone(request), {}, { scope: 'SYNTHETIC_TEST_ONLY' }]) assert.match(launchNativeQualification(fake).reason, /REGISTERED_NATIVE_LAUNCH_REQUIRED/)
  assert.equal(existsSync(new URL('../native/qualification/bin/bridge.node', import.meta.url)), false)
  const first = launchNativeQualification(request); assert.equal(first.status, 'BLOCKED'); assert.equal(first.provider_calls, 0); assert.equal(first.paid_authority, false)
  assert.match(launchNativeQualification(request).reason, /REGISTERED_NATIVE_LAUNCH_REQUIRED/)
  assert.throws(() => nativeResolvedLaunch({ scope: 'AUTHENTICATED_NATIVE_COMPONENT_EXIT' }), /AUTHENTICATED_NATIVE_LAUNCH_REQUIRED/)
}))
function launchWire() {
  const r = Buffer.alloc(216); [0x51464445, 4, 176, 2].forEach((v, i) => r.writeUInt32LE(v, i * 4))
  for (const offset of [16, 48, 80, 112, 144, 184]) r.fill(offset, offset, offset + 32)
  r.writeUInt32LE(5, 176)
  const b = Buffer.alloc(432); [0x51464445, 1, 432, 1, 5, 259].forEach((v, i) => b.writeUInt32LE(v, i * 4))
  b.writeBigUInt64LE(7n, 24); b.writeBigUInt64LE(8n, 32); r.copy(b, 40, 48, 80); r.copy(b, 72, 184, 216)
  b.fill(1, 104, 200); b.writeUInt32LE(1, 200); r.copy(b, 216); return { b, r }
}
test('a structurally valid native exit including code 259 grants no PASS or provenance', () => environment('development', () => {
  const { b, r } = launchWire(), decoded = decodeNativeLaunchOutcome(b, r)
  assert.equal(decoded.exit_code, 259); assert.equal(decoded.pid, '7'); assert.equal(decoded.status, undefined); assert.equal(decoded.scope, undefined)
  assert.throws(() => nativeResolvedLaunch(decoded), /AUTHENTICATED_NATIVE_LAUNCH_REQUIRED/)
}))
test('native launch decoder rejects every truncated outcome and extra bytes', () => environment('test', () => {
  const { b, r } = launchWire()
  for (let n = 0; n < b.length; n++) assert.throws(() => decodeNativeLaunchOutcome(b.subarray(0, n), r), /NATIVE_LAUNCH_SCHEMA/)
  assert.throws(() => decodeNativeLaunchOutcome(Buffer.concat([b, Buffer.of(0)]), r), /NATIVE_LAUNCH_SCHEMA/)
}))
for (const offset of [0, 4, 8, 12, 16, 24, 32, 40, 72, 104, 136, 168, 200, 204, 208, 212, 232, 264, 296, 328, 360, 392, 400]) {
  test(`native launch rejects malformed or rebound exit field at ${offset}`, () => environment('test', () => {
    const { b, r } = launchWire()
    if ([24, 32].includes(offset)) b.fill(0, offset, offset + 8)
    else if ([104, 136, 168].includes(offset)) b.fill(0, offset, offset + 32)
    else b[offset] ^= 0xff
    assert.throws(() => decodeNativeLaunchOutcome(b, r), /NATIVE_LAUNCH_SCHEMA/)
  }))
}
test('native launch rejects malformed request bindings even when echoed consistently', () => environment('test', () => {
  for (const offset of [0, 4, 8, 12, 16, 48, 80, 112, 144, 176, 180, 184]) {
    const { b, r } = launchWire()
    if ([16, 48, 80, 112, 144, 184].includes(offset)) r.fill(0, offset, offset + 32)
    else r[offset] ^= 0xff
    r.copy(b, 216); assert.throws(() => decodeNativeLaunchOutcome(b, r), /NATIVE_LAUNCH_SCHEMA/)
  }
}))
