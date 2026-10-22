import { parse, eventSchema, healthSchema, ref, nonProduction, testOnly, blocked, equal, immutable, authority, LIMITS } from './contracts.mjs'
import { resolvedObservation } from './resolver.mjs'

const receipts = new WeakMap()
export function createSyntheticObserver({ observation, epoch, outsideObjects = [] }) {
  testOnly(); const proof = resolvedObservation(observation); parse(ref, epoch)
  if (proof.binding.epoch !== epoch) throw blocked('OBSERVER_EPOCH')
  const objects = new Map(proof.objects.map(o => [o.file_id, o])), outside = new Set(outsideObjects)
  const processes = new Map(proof.tokens.map(t => [t.pid, t.process_start]))
  let sequence = 0, bytes = 0, invalid = false, finished = false, mutations = 0
  const pending = new Map(), seenOperations = new Set(), events = []
  function fail() { invalid = true; throw blocked('CAPTURE_INCOMPLETE') }
  return Object.freeze({
    ingest(input) {
      testOnly(); if (finished || invalid) return fail()
      let e
      try { e = parse(eventSchema, input) } catch { return fail() }
      const target = objects.get(e.object)
      if (e.epoch !== epoch || e.sequence !== sequence + 1 || processes.get(e.pid) !== e.process_start
        || !target || target.volume !== e.volume || target.ref !== e.path || e.outside !== outside.has(e.object)
        || (e.destination !== null && !proof.objects.some(o => o.ref === e.destination))) return fail()
      sequence = e.sequence; bytes += Math.max(e.bytes, Buffer.byteLength(JSON.stringify(e)))
      if (bytes > LIMITS.trace || events.length >= 65536) return fail()
      if (e.phase === 'PRE') {
        if (seenOperations.has(e.operation) || e.status !== 'PENDING' || e.effect !== 'NONE') return fail()
        pending.set(e.operation, e); seenOperations.add(e.operation)
      } else {
        const prior = pending.get(e.operation)
        if (!prior || !equal([prior.kind, prior.pid, prior.tid, prior.process_start, prior.object, prior.destination], [e.kind, e.pid, e.tid, e.process_start, e.object, e.destination]) || e.status === 'PENDING') return fail()
        pending.delete(e.operation)
        const destinationOutside = e.destination && proof.objects.some(o => o.ref === e.destination && outside.has(o.file_id))
        if (e.effect !== 'NONE' && (e.outside || destinationOutside)) mutations++
      }
      events.push(e)
    },
    finish(input) {
      testOnly(); if (finished) return fail(); finished = true
      let h
      try { h = parse(healthSchema, input) } catch { return fail() }
      const lost = h.drops + h.allocation_failures + h.overflows + h.etw_events_lost + h.etw_buffers_lost + h.etw_realtime_lost
      if (invalid || pending.size || h.epoch !== epoch || h.last_sequence !== sequence || !h.attached || !h.drained || h.disconnected || h.unloaded || lost) return fail()
      const receipt = Object.freeze({})
      receipts.set(receipt, immutable({ scope: 'SYNTHETIC_TEST_ONLY', binding: proof.binding, events: structuredClone(events),
        actor_roles: Object.fromEntries(proof.tokens.map(t => [t.pid, t.role])),
        outside_root_mutations: mutations, status: mutations ? 'FAILED' : 'SYNTHETIC_COMPLETE', ...authority }))
      return receipt
    },
  })
}
export function observedTrace(receipt) { testOnly(); const r = receipts.get(receipt); if (!r) throw blocked('INDEPENDENT_TRACE_REQUIRED'); return r }
