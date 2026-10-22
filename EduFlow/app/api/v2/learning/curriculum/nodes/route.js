import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { curriculumNodeQuerySchema } from '@/lib/server/learning-v2/contracts/phase1'
import { learningV2SearchParams, parseLearningV2Value } from '@/lib/server/learning-v2/http/request-validation'
import { createPhase1Services } from '@/lib/server/learning-v2/phase1-services'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  return handleLearningV2Route(request, 'definitions', async ({ actor, db }) => {
    const query = parseLearningV2Value(curriculumNodeQuerySchema, learningV2SearchParams(request))
    const filter = {
      ...(query.framework_id ? { 'framework_ref.framework_id': query.framework_id } : {}),
      ...(query.version ? { 'framework_ref.version': query.version } : {}),
      ...(query.node_type ? { node_type: query.node_type } : {}),
    }
    return { nodes: await createPhase1Services(db).curriculum.listNodes(actor, filter, query.limit) }
  })
}
