import { tutorSessionIdSchema } from '@/lib/server/learning-v2/contracts/ids'
import { requireLearningV2Phase3DevelopmentEnabled } from '@/lib/server/learning-v2/feature-flags/learning-v2'
import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { parseLearningV2Value } from '@/lib/server/learning-v2/http/request-validation'
import { createPhase3Services } from '@/lib/server/learning-v2/phase3-services'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
async function id(params) { return parseLearningV2Value(tutorSessionIdSchema, (await params).sessionId) }

export async function GET(request, { params }) {
  return handleLearningV2Route(request, 'tutor', async ({ actor, db }) => {
    requireLearningV2Phase3DevelopmentEnabled()
    return { session: await createPhase3Services(db).tutor.get(actor, await id(params)) }
  })
}

