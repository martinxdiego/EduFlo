import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { taskIdParamSchema } from '@/lib/server/learning-v2/contracts/phase1'
import { parseLearningV2Value, readLearningV2Json } from '@/lib/server/learning-v2/http/request-validation'
import { createPhase1Services } from '@/lib/server/learning-v2/phase1-services'

export const dynamic = 'force-dynamic'

export async function POST(request, { params }) {
  return handleLearningV2Route(request, 'definitions', async ({ actor, db }) => {
    const { taskId: rawId } = await params
    const taskId = parseLearningV2Value(taskIdParamSchema, rawId)
    return { task: await createPhase1Services(db).tasks.createVersion(actor, taskId, await readLearningV2Json(request)) }
  })
}
