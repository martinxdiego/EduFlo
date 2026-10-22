import { z } from 'zod'
import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { parseLearningV2Value, readLearningV2Json } from '@/lib/server/learning-v2/http/request-validation'
import { createPhase2Services } from '@/lib/server/learning-v2/phase2-services'
import { requireLearningV2Phase2DevelopmentEnabled } from '@/lib/server/learning-v2/feature-flags/learning-v2'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const assignmentIdSchema = z.string().trim().min(1).max(100)

async function assignmentId(params) {
  const values = await params
  return parseLearningV2Value(assignmentIdSchema, values.assignmentId)
}

export async function GET(request, { params }) {
  return handleLearningV2Route(request, 'ingestion', async ({ actor, db }) => {
    requireLearningV2Phase2DevelopmentEnabled()
    return { binding: await createPhase2Services(db).assignments.get(actor, await assignmentId(params)) }
  })
}

export async function POST(request, { params }) {
  return handleLearningV2Route(request, 'ingestion', async ({ actor, db }) => {
    requireLearningV2Phase2DevelopmentEnabled()
    return { binding: await createPhase2Services(db).assignments.bind(actor, await assignmentId(params), await readLearningV2Json(request)) }
  })
}

export async function DELETE(request, { params }) {
  return handleLearningV2Route(request, 'ingestion', async ({ actor, db }) => {
    requireLearningV2Phase2DevelopmentEnabled()
    return { binding: await createPhase2Services(db).assignments.disable(actor, await assignmentId(params)) }
  })
}
