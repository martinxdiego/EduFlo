import { LearningV2Error, learningV2ErrorResponse } from '../contracts/errors.js'
import { handleLearningV2Route } from './route-handler.js'

export async function handleRecommendationRoute(request, operation) {
  // The shared boundary verifies hosting before resolving the capability. A
  // staging capability exists only inside that authenticated database scope.
  const response = await handleLearningV2Route(request, 'recommendations', async (context) => {
    try { return await operation(context) }
    catch (error) { if (error instanceof LearningV2Error) throw error; throw new LearningV2Error('SERVICE_UNAVAILABLE') }
  })
  // Connection/bootstrap failures are operational unavailability too.
  return response.status >= 500 ? learningV2ErrorResponse(new LearningV2Error('SERVICE_UNAVAILABLE')) : response
}
