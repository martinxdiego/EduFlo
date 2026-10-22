import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { createPhase1Services } from '@/lib/server/learning-v2/phase1-services'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  return handleLearningV2Route(request, 'definitions', async ({ actor, db }) => ({
    framework: await createPhase1Services(db).curriculum.installDevelopmentSubset(actor),
  }))
}
