import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { definitionVersionQuerySchema, taskIdParamSchema } from '@/lib/server/learning-v2/contracts/phase1'
import { learningV2SearchParams, parseLearningV2Value } from '@/lib/server/learning-v2/http/request-validation'
import { createPhase1Services } from '@/lib/server/learning-v2/phase1-services'

export const dynamic = 'force-dynamic'

export async function GET(request, { params }) {
  return handleLearningV2Route(request, 'definitions', async ({ actor, db }) => {
    const { taskId: rawId } = await params
    const taskId = parseLearningV2Value(taskIdParamSchema, rawId)
    const query = parseLearningV2Value(definitionVersionQuerySchema, learningV2SearchParams(request))
    return { task: await createPhase1Services(db).tasks.get(actor, taskId, query.version) }
  })
}
