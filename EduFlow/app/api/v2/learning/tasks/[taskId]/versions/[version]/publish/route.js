import { z } from 'zod'
import { LearningV2Error } from '@/lib/server/learning-v2/contracts/errors'
import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { publishDefinitionRequestSchema, taskIdParamSchema } from '@/lib/server/learning-v2/contracts/phase1'
import { parseLearningV2Value, readLearningV2Json } from '@/lib/server/learning-v2/http/request-validation'
import { createPhase1Services } from '@/lib/server/learning-v2/phase1-services'

export const dynamic = 'force-dynamic'

export async function POST(request, { params }) {
  return handleLearningV2Route(request, 'definitions', async ({ actor, db }) => {
    const { taskId: rawId, version: rawVersion } = await params
    const taskId = parseLearningV2Value(taskIdParamSchema, rawId)
    const version = parseLearningV2Value(z.coerce.number().int().min(1), rawVersion)
    const body = parseLearningV2Value(publishDefinitionRequestSchema, await readLearningV2Json(request))
    if (body.expected_version !== version) throw new LearningV2Error('CONFLICT')
    return { task: await createPhase1Services(db).tasks.publish(actor, taskId, version) }
  })
}
