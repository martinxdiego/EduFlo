import { z } from 'zod'
import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { readLearningV2Json, learningV2SearchParams, parseLearningV2Value } from '@/lib/server/learning-v2/http/request-validation'
import { createPhase1Services } from '@/lib/server/learning-v2/phase1-services'

export const dynamic = 'force-dynamic'

const listQuerySchema = z.object({
  status: z.enum(['draft', 'published', 'retired']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict()

export async function GET(request) {
  return handleLearningV2Route(request, 'definitions', async ({ actor, db }) => {
    const query = parseLearningV2Value(listQuerySchema, learningV2SearchParams(request))
    return { objectives: await createPhase1Services(db).objectives.list(actor, query.status ? { status: query.status } : {}, query.limit) }
  })
}

export async function POST(request) {
  return handleLearningV2Route(request, 'definitions', async ({ actor, db }) => ({
    objective: await createPhase1Services(db).objectives.create(actor, await readLearningV2Json(request)),
  }))
}
