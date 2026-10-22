import { z } from 'zod'
import { requireLearningV2Phase3DevelopmentEnabled } from '@/lib/server/learning-v2/feature-flags/learning-v2'
import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { parseLearningV2Value, readLearningV2Json } from '@/lib/server/learning-v2/http/request-validation'
import { createPhase3Services } from '@/lib/server/learning-v2/phase3-services'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const idSchema = z.string().trim().min(1).max(160)
async function id(params) { return parseLearningV2Value(idSchema, (await params).assignmentId) }

export async function GET(request, { params }) {
  return handleLearningV2Route(request, 'tutor', async ({ actor, db }) => {
    requireLearningV2Phase3DevelopmentEnabled()
    return { policy: await createPhase3Services(db).policies.get(actor, await id(params)) }
  })
}

export async function PUT(request, { params }) {
  return handleLearningV2Route(request, 'tutor', async ({ actor, db }) => {
    requireLearningV2Phase3DevelopmentEnabled()
    return { policy: await createPhase3Services(db).policies.configure(actor, await id(params), await readLearningV2Json(request)) }
  })
}

