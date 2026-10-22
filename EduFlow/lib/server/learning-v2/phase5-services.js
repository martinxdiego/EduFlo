import { RecommendationService } from './recommendations/service.js'

// Deliberately independent of Tutor/provider and assignment service composition.
export function createPhase5Services(db, options = {}) {
  return { recommendations: new RecommendationService(db, options) }
}
