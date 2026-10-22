import { createPhase2Services } from './phase2-services.js'
import { OpenAITutorProvider } from './tutor/providers/openai-tutor-provider.js'
import { TutorPolicyRepository } from './tutor/tutor-policy-repository.js'
import { TutorPolicyService } from './tutor/tutor-policy-service.js'
import { TutorRateLimiter } from './tutor/tutor-rate-limiter.js'
import { TutorSessionRepository } from './tutor/tutor-session-repository.js'
import { TutorService } from './tutor/tutor-service.js'
import { TutorTelemetry } from './tutor/tutor-telemetry.js'
import { createTutorRuntimeApprovalGate } from './tutor/governance/runtime-approval.js'

export function createPhase3Services(db, options = {}) {
  const phase2 = createPhase2Services(db, options)
  const policyRepository = new TutorPolicyRepository(db, options)
  const sessionRepository = new TutorSessionRepository(db)
  const policies = new TutorPolicyService(db, policyRepository, options)
  const provider = options.provider || new OpenAITutorProvider(options)
  const runtimeApprovalGate = options.runtimeApprovalGate || createTutorRuntimeApprovalGate(options)
  const tutor = new TutorService(db, {
    ...phase2, policyRepository, sessionRepository, provider, runtimeApprovalGate,
    rateLimiter: options.rateLimiter || new TutorRateLimiter(db, options),
    telemetry: options.telemetry || new TutorTelemetry(db, options),
  }, options)
  return { ...phase2, policies, policyRepository, sessions: sessionRepository, tutor, provider }
}
