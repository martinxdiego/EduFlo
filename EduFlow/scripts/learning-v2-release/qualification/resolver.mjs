import { randomBytes } from 'node:crypto'
export { createNativeQualificationRequest, nativeResolvedObservation } from './collector-client.mjs'
import { bindingSchema, collectorRequestSchema, collectorResponseSchema, parse, VERSION, testOnly, nonProduction, blocked, equal, immutable } from './contracts.mjs'

const peers = new WeakMap(), proofs = new WeakMap()
export function createSyntheticCollectorPeer(fixed) {
  testOnly()
  const baseline = parse(collectorResponseSchema, fixed)
  if (!baseline.complete || baseline.status !== 'OBSERVED' || baseline.reason !== 'NONE' || !baseline.objects.length || !baseline.tokens.length) throw blocked('PARTIAL_BASELINE')
  if (new Set(baseline.objects.map(o => o.ref)).size !== baseline.objects.length
    || new Set(baseline.tokens.map(t => t.role)).size !== baseline.tokens.length) throw blocked('DUPLICATE_BINDING')
  const peer = Object.freeze({}); peers.set(peer, immutable(baseline)); return peer
}
export function createSyntheticResolver(peer) {
  testOnly(); const baseline = peers.get(peer)
  if (!baseline) throw blocked('PEER_AUTHENTICATION')
  const pending = new Set()
  return Object.freeze({
    request(binding) {
      testOnly()
      if (!equal(parse(bindingSchema, binding), baseline.binding) || pending.size >= 16) throw blocked('REGISTERED_BINDING_REQUIRED')
      const challenge = randomBytes(32).toString('hex'); pending.add(challenge)
      return immutable({ version: VERSION, binding: structuredClone(baseline.binding), challenge, verb: 'INSPECT' })
    },
    accept(request, response, observedPeer) {
      testOnly(); const q = parse(collectorRequestSchema, request)
      const existed = pending.delete(q.challenge)
      if (!existed || observedPeer !== peer) throw blocked('REPLAY_OR_WRONG_PEER')
      const r = parse(collectorResponseSchema, response)
      if (!equal(q.binding, baseline.binding) || !equal(r.binding, q.binding) || r.challenge !== q.challenge
        || r.collector_image !== baseline.collector_image || r.device_profile !== baseline.device_profile
        || r.status !== 'OBSERVED' || !r.complete || r.reason !== 'NONE'
        || !equal(r.objects, baseline.objects) || !equal(r.tokens, baseline.tokens)) throw blocked('COLLECTOR_SUBSTITUTION_OR_DRIFT')
      const proof = Object.freeze({}); proofs.set(proof, immutable(structuredClone(r))); return proof
    },
  })
}
export function resolvedObservation(proof) { testOnly(); const value = proofs.get(proof); if (!value) throw blocked('RESOLVED_OBSERVATION_REQUIRED'); return value }
