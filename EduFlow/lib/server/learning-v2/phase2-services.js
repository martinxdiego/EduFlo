import { AssignmentBindingService } from './assignments/assignment-binding-service.js'
import { AttemptRepository } from './attempts/attempt-repository.js'
import { AttemptService } from './attempts/attempt-service.js'
import { EvidenceRepository } from './evidence/evidence-repository.js'
import { EvidenceService } from './evidence/evidence-service.js'
import { LearningEventRepository } from './events/learning-event-repository.js'
import { ExplanationService } from './knowledge-state/explanation-service.js'
import { ProjectionRepository } from './knowledge-state/projection-repository.js'
import { ProjectionService } from './knowledge-state/projection-service.js'

export function createPhase2Services(db, options = {}) {
  const events = new LearningEventRepository(db, options)
  const attemptsRepository = new AttemptRepository(db)
  const evidenceRepository = new EvidenceRepository(db)
  const projectionRepository = new ProjectionRepository(db)
  const attempts = new AttemptService(attemptsRepository, events, options)
  const evidence = new EvidenceService(evidenceRepository, events, options)
  const projection = new ProjectionService(evidenceRepository, projectionRepository, events, options)
  return {
    assignments: new AssignmentBindingService(db, options),
    attempts,
    attemptRepository: attemptsRepository,
    evidence,
    evidenceRepository,
    events,
    projection,
    projectionRepository,
    explanations: new ExplanationService(evidenceRepository, projectionRepository, db, options),
  }
}
