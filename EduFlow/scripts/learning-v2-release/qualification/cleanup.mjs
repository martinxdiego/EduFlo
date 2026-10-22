import { testOnly, nonProduction, blocked, equal, immutable } from './contracts.mjs'
import { resolvedObservation } from './resolver.mjs'
import { assertController } from './controller.mjs'
import { verifiedSyntheticPackage } from './evidence.mjs'

const plans = new WeakMap(), approvals = new WeakMap()
export function approveSyntheticCleanup({ controller, fixture, evidenceDigest, verifierObservation, sealedEvidence }) {
  testOnly(); assertController(controller)
  const sealed = verifiedSyntheticPackage(sealedEvidence)
  const state = controller.query(fixture), observed = resolvedObservation(verifierObservation)
  const verifier = observed.tokens.find(t => t.role === 'VERIFIER')
  if (!state.journal_complete || state.state !== 'FINALIZED' || !state.evidence.includes(evidenceDigest)
    || sealed.digest !== evidenceDigest || !equal(sealed.evidence.binding, state.binding)
    || !equal(state.binding, observed.binding) || !verifier || verifier.impersonation !== 'NONE'
    || observed.tokens.some(t => t.role !== 'VERIFIER' && t.sid === verifier.sid)) throw blocked('INDEPENDENT_VERIFIER_REQUIRED')
  const approval = Object.freeze({})
  approvals.set(approval, { controller, fixture, evidenceDigest, binding: observed.binding, used: false })
  return approval
}
export function prepareSyntheticCleanup({ controller, fixture, evidenceDigest, before, current, activeHandles, approval }) {
  testOnly(); assertController(controller)
  const authorization = approvals.get(approval)
  if (!authorization || authorization.used || authorization.controller !== controller || authorization.fixture !== fixture
    || authorization.evidenceDigest !== evidenceDigest) throw blocked('INDEPENDENT_CLEANUP_APPROVAL_REQUIRED')
  authorization.used = true
  const state = controller.query(fixture), a = resolvedObservation(before), b = resolvedObservation(current)
  if (!state.journal_complete || state.state !== 'FINALIZED' || !state.evidence.includes(evidenceDigest) || activeHandles !== 0
    || !equal(a.binding, b.binding) || !equal(state.binding, b.binding) || !equal(a.objects, b.objects)
    || b.objects.some(o => o.reparse_tag !== 0) || !b.tokens.some(t => t.role === 'VERIFIER')) throw blocked('CLEANUP_CONTAINMENT_OR_AUTHORITY')
  const plan = Object.freeze({})
  plans.set(plan, { binding: b.binding, objects: b.objects, used: false, controller, fixture })
  return plan
}
export async function executeSyntheticCleanup(plan, { recheck, removeBoundObject }) {
  testOnly(); const p = plans.get(plan)
  if (!p || p.used || typeof recheck !== 'function' || typeof removeBoundObject !== 'function') throw blocked('CLEANUP_PLAN')
  p.used = true
  // Object identity callbacks only. No path/recursive deletion is performed by this module.
  for (const expected of [...p.objects].reverse()) {
    nonProduction(); const actual = await recheck(expected.ref)
    if (!equal(actual, expected) || actual.reparse_tag !== 0) throw blocked('CLEANUP_IDENTITY_CHANGED')
    await removeBoundObject(immutable(structuredClone(expected)))
  }
  if (p.controller.query(p.fixture).state !== 'FINALIZED') throw blocked('CONSUMPTION_HISTORY_LOST')
  return immutable({ cleanup: 'SYNTHETIC_COMPLETE', fixture: p.fixture, ledger_reset: false, real_component_lab_verification: 'NOT_PERFORMED' })
}
