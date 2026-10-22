import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { openJournal } from './ledger.mjs'
import { bindingSchema, parse, ref, digest, equal, testOnly, nonProduction, blocked, immutable, authority } from './contracts.mjs'

const tickets = new WeakMap(), controllers = new WeakSet()
const registerSchema = z.object({ binding: bindingSchema }).strict()
const consumeSchema = z.object({ fixture: ref, test: ref, boot: ref }).strict()
const evidenceSchema = z.object({ fixture: ref, evidence: digest }).strict()
export async function createSyntheticController(journalCapability) {
  testOnly()
  const journal = openJournal(journalCapability), recovered = journal.recovered(), index = new Map(), reservations = new Set()
  const epoch = `qualification-epoch-${randomBytes(16).toString('hex')}`
  let closed = false
  const alive = () => { testOnly(); if (closed || !journal.recovered().complete) throw blocked('CONTROLLER_UNAVAILABLE') }
  for (const r of recovered.records) {
    if (r.kind === 'REGISTER_INTENT') {
      if (index.has(r.fixture) || reservations.has(r.binding?.reservation)) { journal.close(); throw blocked('JOURNAL_STATE') }
      index.set(r.fixture, { binding: r.binding, state: 'AMBIGUOUS_CONSUMED', evidence: [] }); reservations.add(r.binding.reservation)
    } else if (r.kind !== 'EPOCH') {
      const state = index.get(r.fixture)
      if (!state) { journal.close(); throw blocked('JOURNAL_STATE') }
      if (r.kind === 'REGISTERED') state.state = 'REGISTERED'
      if (['CONSUMED', 'REDEEMED'].includes(r.kind)) state.state = 'CONSUMED'
      if (r.kind === 'EVIDENCE') state.evidence.push(r.value)
      if (r.kind === 'FINALIZED') state.state = 'FINALIZED'
    }
  }
  if (recovered.complete) await journal.transaction(append => append({ kind: 'EPOCH', fixture: epoch, binding: null, test: null, value: null, epoch }))
  const record = (kind, fixture, extra = {}) => ({ kind, fixture, binding: null, test: null, value: null, epoch, ...extra })
  const api = Object.freeze({
    scope: 'SYNTHETIC_TEST_ONLY', epoch,
    register(input) {
      alive(); const { binding } = parse(registerSchema, input)
      return journal.transaction(async append => {
        alive()
        if (index.has(binding.fixture) || reservations.has(binding.reservation) || binding.epoch !== epoch) throw blocked('FIXTURE_REUSE')
        // Reserve in memory before any persistence that may become ambiguous.
        const state = { binding, state: 'AMBIGUOUS_CONSUMED', evidence: [] }
        index.set(binding.fixture, state); reservations.add(binding.reservation)
        await append(record('REGISTER_INTENT', binding.fixture, { binding }))
        await append(record('REGISTERED', binding.fixture)); state.state = 'REGISTERED'
        return immutable({ fixture: binding.fixture, state: state.state, ...authority })
      })
    },
    consume(input) {
      alive(); const args = parse(consumeSchema, input)
      return journal.transaction(async append => {
        alive(); const state = index.get(args.fixture)
        if (!state || state.state !== 'REGISTERED' || state.binding.epoch !== epoch || state.binding.boot !== args.boot) throw blocked('FIXTURE_CONSUMED')
        state.state = 'CONSUMED'
        await append(record('CONSUMED', args.fixture, { test: args.test }))
        const ticket = Object.freeze({})
        tickets.set(ticket, { controller: api, fixture: args.fixture, test: args.test, binding: state.binding, used: false })
        return ticket
      })
    },
    redeem(ticket, expected) {
      alive()
      return journal.transaction(async append => {
        alive(); const t = tickets.get(ticket)
        if (!t || t.controller !== api || t.used || !equal(t.binding, parse(bindingSchema, expected))) throw blocked('TICKET_REPLAY_OR_BINDING')
        t.used = true // A failed acknowledgement is burned, never returned to caller as reusable.
        await append(record('REDEEMED', t.fixture, { test: t.test }))
        return immutable({ binding: structuredClone(t.binding), test: t.test, ...authority })
      })
    },
    appendEvidence(input) {
      alive(); const args = parse(evidenceSchema, input)
      return journal.transaction(async append => {
        alive(); const s = index.get(args.fixture)
        if (!s || s.state !== 'CONSUMED' || s.evidence.length >= 512 || s.evidence.includes(args.evidence)) throw blocked('EVIDENCE_STATE')
        await append(record('EVIDENCE', args.fixture, { value: args.evidence })); s.evidence.push(args.evidence)
      })
    },
    finalize(input) {
      alive(); const args = parse(evidenceSchema, input)
      return journal.transaction(async append => {
        alive(); const s = index.get(args.fixture)
        if (!s || s.state !== 'CONSUMED' || !s.evidence.includes(args.evidence)) throw blocked('FINALIZE_STATE')
        await append(record('FINALIZED', args.fixture, { value: args.evidence })); s.state = 'FINALIZED'
      })
    },
    query(fixture) { testOnly(); const s = index.get(parse(ref, fixture)); return immutable({ state: s?.state || 'ABSENT',
      journal_complete: !closed && journal.recovered().complete, binding: s ? structuredClone(s.binding) : null, evidence: s ? [...s.evidence] : [], ...authority }) },
    close() { testOnly(); closed = true; journal.close() },
  })
  controllers.add(api); return api
}
export function assertController(controller) { testOnly(); if (!controllers.has(controller)) throw blocked('CONTROLLER_AUTHENTICATION') }

export function externalControllerReadiness() {
  nonProduction()
  return immutable({ status: 'BLOCKED', reason: 'PROTECTED_CONTROLLER_DEPLOYMENT_NOT_REGISTERED', ...authority })
}
