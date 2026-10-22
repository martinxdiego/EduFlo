import { blocked, nonProduction, immutable } from './contracts.mjs'
import { observedTrace } from './observer-client.mjs'

const used = new WeakSet()
export function verifyPositiveControl({ control, protectedTrace, kind }) {
  nonProduction(); const a = observedTrace(control), b = observedTrace(protectedTrace)
  if (used.has(control) || used.has(protectedTrace)) throw blocked('CONTROL_FIXTURE_REUSE')
  used.add(control); used.add(protectedTrace)
  if (a.binding.fixture === b.binding.fixture || a.binding.reservation === b.binding.reservation
    || a.binding.profile !== b.binding.profile) throw blocked('POSITIVE_CONTROL_SEPARATION')
  const success = a.events.find(e => e.phase === 'POST' && e.kind === kind && e.status === 'SUCCESS' && e.effect !== 'NONE')
  const prevention = b.events.find(e => e.phase === 'POST' && e.kind === kind && e.status === 'DENIED' && e.effect === 'NONE')
  if (!success || !prevention || b.events.some(e => e.phase === 'POST' && e.effect !== 'NONE')) throw blocked('POSITIVE_CONTROL_OR_PREVENTION_MISSING')
  if (a.actor_roles[success.pid] !== b.actor_roles[prevention.pid]) throw blocked('POSITIVE_CONTROL_ROLE_MISMATCH')
  return immutable({ scope: 'SYNTHETIC_TEST_ONLY', status: 'SYNTHETIC_CONTROL_VERIFIED', real_component_lab_verification: 'NOT_PERFORMED' })
}
