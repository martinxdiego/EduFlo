import { handleLearningV2Route } from '@/lib/server/learning-v2/http/route-handler'
import { resolveLearningV2Capabilities } from '@/lib/server/learning-v2/feature-flags/learning-v2'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  return handleLearningV2Route(request, 'definitions', async ({ actor }) => ({
    capabilities: resolveLearningV2Capabilities(),
    actor: {
      actor_id: actor.actor_id,
      actor_type: actor.actor_type,
      role: actor.role,
      tenant_id: actor.tenant_id,
      teacher_id: actor.teacher_id,
      student_id: actor.student_id,
      permissions: actor.permissions,
    },
  }))
}
