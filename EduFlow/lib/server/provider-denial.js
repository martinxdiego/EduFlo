// Hosting Implementation A grants no Provider transport authority, in any environment.
// Keys, request fields and rollout flags cannot change this decision.
export class ProviderDisabledError extends Error {
  constructor() {
    super('Provider transport is disabled.')
    this.name = 'ProviderDisabledError'
    this.code = 'PROVIDER_DISABLED'
    this.status = 403
  }
}

export function requireProviderTransport() {
  throw new ProviderDisabledError()
}

export function providerDeniedResponse() {
  return Response.json({ error: 'Provider transport is disabled.', code: 'PROVIDER_DISABLED' }, { status: 403 })
}
