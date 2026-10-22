import { createPhase3Services } from './phase3-services.js'
import { TeacherLearningService } from './teacher/teacher-service.js'

export function createPhase4Services(db, options = {}) {
  const phase3 = createPhase3Services(db, options)
  return {
    ...phase3,
    teacherLearning: new TeacherLearningService(db, {
      evidenceRepository: phase3.evidenceRepository,
      events: phase3.events,
      projection: phase3.projection,
      projectionRepository: phase3.projectionRepository,
      sessionRepository: phase3.sessions,
    }, options),
  }
}
