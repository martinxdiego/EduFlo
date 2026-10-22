import { z } from 'zod'
import { competencyIdSchema } from '@/lib/server/learning-v2/contracts/ids'
import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { parseLearningV2Value } from '@/lib/server/learning-v2/http/request-validation'
import { createPhase2Services } from '@/lib/server/learning-v2/phase2-services'
import { requireLearningV2Phase2DevelopmentEnabled } from '@/lib/server/learning-v2/feature-flags/learning-v2'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const paramsSchema = z.object({
  studentId: z.string().trim().min(1).max(100),
  competencyId: competencyIdSchema,
}).strict()

export async function GET(request, { params }) {
  return handleLearningV2Route(request, 'ingestion', async ({ actor, db }) => {
    requireLearningV2Phase2DevelopmentEnabled()
    const identity = parseLearningV2Value(paramsSchema, await params)
    return { explanation: await createPhase2Services(db).explanations.explain(actor, identity.studentId, identity.competencyId) }
  })
}
