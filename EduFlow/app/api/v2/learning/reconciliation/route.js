import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { readLearningV2Json } from '@/lib/server/learning-v2/http/request-validation'
import { requireLearningV2Phase2DevelopmentEnabled } from '@/lib/server/learning-v2/feature-flags/learning-v2'
import { ReconciliationService } from '@/lib/server/learning-v2/reconciliation/reconciliation-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  return handleLearningV2Route(request, 'ingestion', async ({ actor, db }) => {
    requireLearningV2Phase2DevelopmentEnabled()
    return { reconciliation: await new ReconciliationService(db).reconcile(actor, await readLearningV2Json(request)) }
  })
}
