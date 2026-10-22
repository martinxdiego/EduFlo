import { z } from 'zod'
import { competencyIdSchema } from '@/lib/server/learning-v2/contracts/ids'
import { requireLearningV2Phase4DevelopmentEnabled, isLearningV2Phase5DevelopmentEnabled } from '@/lib/server/learning-v2/feature-flags/learning-v2'
import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { parseLearningV2Value } from '@/lib/server/learning-v2/http/request-validation'
import { createPhase4Services } from '@/lib/server/learning-v2/phase4-services'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const paramsSchema = z.object({ studentId: z.string().trim().min(1).max(100), competencyId: competencyIdSchema }).strict()

export async function GET(request, { params }) {
  return handleLearningV2Route(request, 'teacher', async ({ actor, db }) => {
    requireLearningV2Phase4DevelopmentEnabled()
    const identity = parseLearningV2Value(paramsSchema, await params)
    const result = await createPhase4Services(db).teacherLearning.getCompetency(actor, identity.studentId, identity.competencyId)
    return isLearningV2Phase5DevelopmentEnabled() ? { ...result, recommendations_enabled: true } : result
  })
}
