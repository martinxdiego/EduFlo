import { z } from 'zod'
import { tutorSessionIdSchema } from '@/lib/server/learning-v2/contracts/ids'
import { requireLearningV2Phase4DevelopmentEnabled } from '@/lib/server/learning-v2/feature-flags/learning-v2'
import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { parseLearningV2Value } from '@/lib/server/learning-v2/http/request-validation'
import { createPhase4Services } from '@/lib/server/learning-v2/phase4-services'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const paramsSchema = z.object({ studentId: z.string().trim().min(1).max(100), sessionId: tutorSessionIdSchema }).strict()

export async function GET(request, { params }) {
  return handleLearningV2Route(request, 'teacher', async ({ actor, db }) => {
    requireLearningV2Phase4DevelopmentEnabled()
    const identity = parseLearningV2Value(paramsSchema, await params)
    return createPhase4Services(db).teacherLearning.getTutorSession(actor, identity.studentId, identity.sessionId)
  })
}
