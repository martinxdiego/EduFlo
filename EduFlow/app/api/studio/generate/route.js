import { withHostingPolicy } from '@/lib/server/hosting-route-policy'
import { providerDeniedResponse } from '@/lib/server/provider-denial'
import { applyCorsHeaders, verifyAuthToken } from '@/lib/server/security'

export const runtime = 'nodejs'

export async function OPTIONS(request) {
  return applyCorsHeaders(new Response(null, { status: 204 }), request)
}

async function POSTHandler(request) {
  const actor = verifyAuthToken(request)
  if (!actor?.userId || actor.role === 'student') {
    return applyCorsHeaders(Response.json({ error: 'Unauthorized' }, { status: 401 }), request)
  }
  return applyCorsHeaders(providerDeniedResponse(), request)
}

export const POST = withHostingPolicy(POSTHandler)
