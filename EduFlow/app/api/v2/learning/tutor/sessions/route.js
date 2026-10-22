import { requireLearningV2Phase3DevelopmentEnabled } from '@/lib/server/learning-v2/feature-flags/learning-v2'
import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { readLearningV2Json } from '@/lib/server/learning-v2/http/request-validation'
import { createPhase3Services } from '@/lib/server/learning-v2/phase3-services'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  return handleLearningV2Route(request, 'tutor', async ({ actor, db }) => {
    requireLearningV2Phase3DevelopmentEnabled()
    return { session: await createPhase3Services(db).tutor.start(actor, await readLearningV2Json(request)) }
  })
}

