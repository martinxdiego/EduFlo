import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { curriculumFrameworkQuerySchema } from '@/lib/server/learning-v2/contracts/phase1'
import { learningV2SearchParams, parseLearningV2Value } from '@/lib/server/learning-v2/http/request-validation'
import { createPhase1Services } from '@/lib/server/learning-v2/phase1-services'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  return handleLearningV2Route(request, 'definitions', async ({ actor, db }) => {
    const query = parseLearningV2Value(curriculumFrameworkQuerySchema, learningV2SearchParams(request))
    const filter = {
      ...(query.framework_id ? { framework_id: query.framework_id } : {}),
      ...(query.version ? { version: query.version } : {}),
    }
    return { frameworks: await createPhase1Services(db).curriculum.listFrameworks(actor, filter, query.limit) }
  })
}
