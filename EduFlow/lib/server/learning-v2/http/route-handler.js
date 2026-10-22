import { randomUUID } from 'crypto'
import { getDatabase } from '../../database.js'
import { ensureLearningV2Indexes } from '../database/bootstrap.js'
import { requireLearningV2Capability } from '../feature-flags/learning-v2.js'
import { requireAuthenticatedActor } from '../auth/learning-authorization.js'
import { learningV2ErrorResponse } from '../contracts/errors.js'
import { learningV2Log } from '../privacy/logger.js'
import { learningV2RouteId } from './route-identity.js'
import { withHostingPolicy } from '../../hosting-route-policy.js'
import { resolveHostingCapabilities } from '../../hosting-capabilities-v1.js'

async function learningRoute(request, capability, operation) {
  const requestId = request.headers.get('x-vercel-id') || randomUUID()
  try {
    requireLearningV2Capability(capability)
    const db = await getDatabase()
    await ensureLearningV2Indexes(db)
    const actor = await requireAuthenticatedActor(request, { db, createPersonalTenant: resolveHostingCapabilities().environment !== 'staging' })
    const result = await operation({ actor, db, requestId })
    return Response.json(result, { headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } })
  } catch (error) {
    learningV2Log(error?.status >= 500 ? 'error' : 'warn', 'learning_v2.request_rejected', {
      request_id: requestId,
      route_id: learningV2RouteId(request),
      error_code: error?.code || 'INTERNAL_ERROR',
      error,
    })
    return learningV2ErrorResponse(error, requestId)
  }
}

export const handleLearningV2Route = withHostingPolicy(learningRoute)
