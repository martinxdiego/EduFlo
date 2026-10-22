import {
  createTrustedTutorHumanReviewCoordinatorWithInternalClock,
  verifyTutorHumanReviewOperationsReadinessWithInternalClock,
} from '../../lib/server/learning-v2/tutor/governance/human-review-coordinator.js'
import { finalizeTutorHumanReviewFromRepositoryWithInternalClock } from '../../lib/server/learning-v2/tutor/governance/human-review-finalizer.js'
import { createInternalTutorHumanReviewTestClock } from '../../lib/server/learning-v2/tutor/governance/human-review-clock.js'
import { loadActiveTutorHumanReviewPacketWithInternalClock } from '../../lib/server/learning-v2/tutor/evaluation/human-review-repository.js'

// The clock capability stays closed over by this test-only module. Test callers
// receive operations, never an injectable clock accepted by a review boundary.
export function createTutorHumanReviewTrustedClockTestHarness(timestamp) {
  const clock = createInternalTutorHumanReviewTestClock(timestamp)
  return Object.freeze({
    createCoordinator: (args) => createTrustedTutorHumanReviewCoordinatorWithInternalClock(args, clock),
    verifyReadiness: (args) => verifyTutorHumanReviewOperationsReadinessWithInternalClock(args, clock),
    loadActivePacket: (args) => loadActiveTutorHumanReviewPacketWithInternalClock(args, clock),
    finalize: (args) => finalizeTutorHumanReviewFromRepositoryWithInternalClock(args, clock),
  })
}
