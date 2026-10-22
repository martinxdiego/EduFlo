import { z } from 'zod'
import { handleRecommendationRoute } from '@/lib/server/learning-v2/http/recommendation-route'
import { parseLearningV2Value, readLearningV2Json } from '@/lib/server/learning-v2/http/request-validation'
import { createPhase5Services } from '@/lib/server/learning-v2/phase5-services'
import { competencyIdSchema } from '@/lib/server/learning-v2/contracts/ids'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const paramsSchema = z.object({ studentId: z.string().trim().min(1).max(100), competencyId: competencyIdSchema }).strict()

export async function POST(request, { params }) {
  return handleRecommendationRoute(request, async ({ actor, db }) => {
    const identity = parseLearningV2Value(paramsSchema, await params)
    return createPhase5Services(db).recommendations.evaluate(actor, identity.studentId, identity.competencyId, await readLearningV2Json(request))
  })
}

