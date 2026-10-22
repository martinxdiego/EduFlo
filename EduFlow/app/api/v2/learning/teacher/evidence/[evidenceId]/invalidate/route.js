import { z } from 'zod'
import { evidenceIdSchema } from '@/lib/server/learning-v2/contracts/ids'
import { requireLearningV2Phase4DevelopmentEnabled } from '@/lib/server/learning-v2/feature-flags/learning-v2'
import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { parseLearningV2Value, readLearningV2Json } from '@/lib/server/learning-v2/http/request-validation'
import { createPhase4Services } from '@/lib/server/learning-v2/phase4-services'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const paramsSchema = z.object({ evidenceId: evidenceIdSchema }).strict()

export async function POST(request, { params }) {
  return handleLearningV2Route(request, 'teacher', async ({ actor, db }) => {
    requireLearningV2Phase4DevelopmentEnabled()
    const { evidenceId } = parseLearningV2Value(paramsSchema, await params)
    return createPhase4Services(db).teacherLearning.invalidateEvidence(actor, evidenceId, await readLearningV2Json(request))
  })
}
