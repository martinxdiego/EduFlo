import { randomBytes, createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { parse, bindingSchema, collectorRequestSchema, digest, nonProduction, blocked, result, immutable, authority, VERSION, canonical } from './contracts.mjs'
import { decodeNativeObservation } from './native-wire.mjs'
import { decodeNativeLaunchOutcome } from './native-launch-wire.mjs'
import { assessNativeRequiredFacts } from './native-acceptance.mjs'

const requests = new WeakMap(), observations = new WeakMap()
const launches = new WeakMap(), launchOutcomes = new WeakMap()
const launchSchema = z.object({ binding: bindingSchema, role: z.enum(['RUNNER', 'COORDINATOR', 'ATTACKER_DEVELOPER', 'ATTACKER_SERVICE']), ticket: digest.refine(v => v !== '0'.repeat(64)) }).strict()
const launchRoles = Object.freeze({ RUNNER: 2, COORDINATOR: 3, ATTACKER_DEVELOPER: 5, ATTACKER_SERVICE: 6 })
const require = createRequire(import.meta.url)
const bridgePath = fileURLToPath(new URL('../../../native/qualification/bin/bridge.node', import.meta.url))
const bindingHash = value => createHash('sha256').update('EduFlow qualification native v4\0').update(canonical(value)).digest()
function nativeEnvironment() { nonProduction(); if (process.env.NODE_ENV !== 'development') throw blocked('NATIVE_COMPONENT_ENVIRONMENT_REQUIRED') }

export function createNativeQualificationRequest(binding) {
  nativeEnvironment(); const fixed = parse(bindingSchema, binding)
  const request = immutable({ version: VERSION, binding: fixed, challenge: randomBytes(32).toString('hex'), verb: 'INSPECT' })
  requests.set(request, fixed); return request
}

// A private request and a successfully authenticated native exchange are both
// required. Never load a .tmp build or accept an injected addon/peer/callback.
function nativeRequestBytes(request) {
  const bytes = Buffer.alloc(176)
  bytes.writeUInt32LE(0x51464445, 0); bytes.writeUInt32LE(4, 4); bytes.writeUInt32LE(176, 8); bytes.writeUInt32LE(1, 12)
  Buffer.from(request.challenge, 'hex').copy(bytes, 16); Buffer.from(request.binding.profile, 'hex').copy(bytes, 48)
  bindingHash({ epoch: request.binding.epoch }).copy(bytes, 80)
  bindingHash({ fixture: request.binding.fixture, reservation: request.binding.reservation }).copy(bytes, 112)
  bindingHash({ boot: request.binding.boot }).copy(bytes, 144)
  return bytes
}

// No stdout/JSON fallback. Real IPC must arrive from the separately deployed, authenticated native broker.
export function collectWindowsQualification(request) {
  const registered = requests.delete(request) // Burn even on an environment switch or parse failure.
  nonProduction(); const parsed = parse(collectorRequestSchema, request)
  if (process.env.NODE_ENV !== 'development' || !registered) return result('BLOCKED', 'REGISTERED_NATIVE_REQUEST_REQUIRED')
  try {
    const addon = require(bridgePath)
    if (!Object.isFrozen(addon) || Object.keys(addon).length !== 1 || typeof addon.exchange !== 'function') throw blocked('NATIVE_BRIDGE_SHAPE')
    const wire = nativeRequestBytes(parsed), bytes = addon.exchange(wire), decoded = decodeNativeObservation(bytes)
    for (const [name, offset] of [['challenge', 16], ['profile', 48], ['epoch', 80], ['fixture', 112], ['boot', 144]]) {
      if (decoded.binding[name] !== wire.subarray(offset, offset + 32).toString('hex')) throw blocked('NATIVE_BINDING_MISMATCH')
    }
    const acceptance = assessNativeRequiredFacts(bytes)
    if (acceptance.status !== 'COMPLETE') return Object.freeze({ status: 'BLOCKED', reason: acceptance.reason, acceptance, ...authority })
    const proof = Object.freeze({ scope: 'AUTHENTICATED_NATIVE_COMPONENT_OBSERVATION', ...authority })
    observations.set(proof, immutable({ ...decoded, scope: proof.scope, registered_binding: parsed.binding }))
    return Object.freeze({ status: 'OBSERVED', observation: proof, ...authority })
  } catch { return result('BLOCKED', 'AUTHENTICATED_NATIVE_BROKER_UNAVAILABLE') }
}
export function nativeResolvedObservation(proof) { nativeEnvironment(); const value = observations.get(proof); if (!value) throw blocked('AUTHENTICATED_NATIVE_OBSERVATION_REQUIRED'); return value }

export function createNativeLaunchRequest(input) {
  nativeEnvironment(); const fixed = parse(launchSchema, input)
  // The ticket is an opaque locator only. The native broker requires online,
  // authenticated controller redemption; this factory gives it no authority.
  const request = immutable({ version: VERSION, ...fixed, challenge: randomBytes(32).toString('hex'), verb: 'LAUNCH' })
  launches.set(request, request); return request
}
export function launchNativeQualification(request) {
  const registered = launches.get(request); launches.delete(request)
  nonProduction()
  if (process.env.NODE_ENV !== 'development' || !registered) return result('BLOCKED', 'REGISTERED_NATIVE_LAUNCH_REQUIRED')
  try {
    const addon = require(bridgePath)
    if (!Object.isFrozen(addon) || Object.keys(addon).length !== 1 || typeof addon.exchange !== 'function') throw blocked('NATIVE_BRIDGE_SHAPE')
    const wire = Buffer.alloc(216); nativeRequestBytes(registered).copy(wire); wire.writeUInt32LE(2, 12)
    wire.writeUInt32LE(launchRoles[registered.role], 176); Buffer.from(registered.ticket, 'hex').copy(wire, 184)
    const decoded = decodeNativeLaunchOutcome(addon.exchange(wire), wire)
    const proof = Object.freeze({ scope: 'AUTHENTICATED_NATIVE_COMPONENT_EXIT', ...authority })
    launchOutcomes.set(proof, immutable({ ...decoded, scope: proof.scope, registered_binding: registered.binding }))
    return Object.freeze({ status: 'EXIT_RECORDED', outcome: proof, ...authority })
  } catch { return result('BLOCKED', 'AUTHENTICATED_NATIVE_LAUNCH_UNAVAILABLE') }
}
export function nativeResolvedLaunch(proof) { nativeEnvironment(); const value = launchOutcomes.get(proof); if (!value) throw blocked('AUTHENTICATED_NATIVE_LAUNCH_REQUIRED'); return value }
export async function exchangeSyntheticCollector({ resolver, binding, peer, reply }) {
  nonProduction()
  if (process.env.NODE_ENV !== 'test' || typeof reply !== 'function') throw blocked('SYNTHETIC_ONLY')
  const request = resolver.request(binding)
  return resolver.accept(request, await reply(request), peer)
}
