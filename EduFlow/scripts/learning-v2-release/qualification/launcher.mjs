import { z } from 'zod'
import { bindingSchema, role, digest, ref, parse, nonProduction, testOnly, blocked, equal, immutable, authority } from './contracts.mjs'
import { resolvedObservation } from './resolver.mjs'
import { assertController } from './controller.mjs'
export { createNativeLaunchRequest, launchNativeQualification, nativeResolvedLaunch } from './collector-client.mjs'

const plans = new WeakMap()
const planSchema = z.object({ binding: bindingSchema, images: z.array(z.object({ role, image: digest,
  inherited_handles: z.array(ref).max(32) }).strict()).min(5).max(16) }).strict()
export function createSyntheticLaunchPlan(input) {
  testOnly(); const p = parse(planSchema, input)
  if (new Set(p.images.map(i => i.role)).size !== p.images.length
    || !['PROVISIONER', 'RUNNER', 'COORDINATOR', 'VERIFIER', 'ATTACKER_DEVELOPER'].every(r => p.images.some(i => i.role === r))) throw blocked('LAUNCH_ROLES')
  const cap = Object.freeze({}); plans.set(cap, immutable(p)); return cap
}
export async function launchSyntheticQualification({ controller, ticket, plan, observation, role: selectedRole, worker }) {
  testOnly(); assertController(controller)
  const fixed = plans.get(plan)
  if (!fixed) throw blocked('FIXED_PLAN_REQUIRED')
  // Delivery uncertainty and all later validation failures burn the ticket.
  await controller.redeem(ticket, fixed.binding)
  const r = resolvedObservation(observation), selected = parse(role, selectedRole)
  if (selected === 'PROVISIONER' || selected === 'VERIFIER' || typeof worker !== 'function') throw blocked('ROLE_NOT_LAUNCHABLE')
  if (!equal(r.binding, fixed.binding)) throw blocked('TOKEN_PROFILE_BINDING')
  const roleTokens = r.tokens.filter(t => ['PROVISIONER', 'RUNNER', 'COORDINATOR', 'VERIFIER'].includes(t.role))
  if (roleTokens.length !== 4 || new Set(roleTokens.map(t => t.sid)).size !== 4) throw blocked('ROLE_SEPARATION')
  const image = fixed.images.find(i => i.role === selected), token = r.tokens.find(t => t.role === selected)
  if (!image || !token || token.image !== image.image || !equal(token.inherited_handles, image.inherited_handles)
    || token.elevation === 'FULL' || token.impersonation !== 'NONE') throw blocked('LAUNCH_TOKEN_OR_HANDLES')
  const outcome = await worker(Object.freeze({ role: selected, image: image.image }))
  return immutable({ scope: 'SYNTHETIC_TEST_ONLY', outcome, ...authority })
}
export function nativeLauncherReadiness() { nonProduction(); return immutable({ status: 'BLOCKED', reason: 'FIXED_ROLE_BROKER_NOT_DEPLOYED', ...authority }) }
