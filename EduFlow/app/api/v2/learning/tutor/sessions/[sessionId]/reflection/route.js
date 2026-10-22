import { tutorSessionIdSchema } from '@/lib/server/learning-v2/contracts/ids'
import { requireLearningV2Phase3bDevelopmentEnabled } from '@/lib/server/learning-v2/feature-flags/learning-v2'
import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { parseLearningV2Value, readLearningV2Json } from '@/lib/server/learning-v2/http/request-validation'
import { createPhase3Services } from '@/lib/server/learning-v2/phase3-services'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function id(params) {
  return parseLearningV2Value(tutorSessionIdSchema, (await params).sessionId)
}

export async function POST(request, { params }) {
  return handleLearningV2Route(request, 'reflection', async ({ actor, db }) => {
    requireLearningV2Phase3bDevelopmentEnabled()
    return createPhase3Services(db).tutor.reflect(actor, await id(params), await readLearningV2Json(request))
  })
}
