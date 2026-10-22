import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { objectiveIdParamSchema } from '@/lib/server/learning-v2/contracts/phase1'
import { parseLearningV2Value, readLearningV2Json } from '@/lib/server/learning-v2/http/request-validation'
import { createPhase1Services } from '@/lib/server/learning-v2/phase1-services'

export const dynamic = 'force-dynamic'

export async function POST(request, { params }) {
  return handleLearningV2Route(request, 'definitions', async ({ actor, db }) => {
    const { objectiveId: rawId } = await params
    const objectiveId = parseLearningV2Value(objectiveIdParamSchema, rawId)
    return { objective: await createPhase1Services(db).objectives.createVersion(actor, objectiveId, await readLearningV2Json(request)) }
  })
}
