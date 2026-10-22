import { CurriculumRepository } from './curriculum/curriculum-repository.js'
import { CurriculumService } from './curriculum/curriculum-service.js'
import { ObjectiveRepository } from './objectives/objective-repository.js'
import { ObjectiveService } from './objectives/objective-service.js'
import { ExistingContentAdapter } from './tasks/existing-content-adapter.js'
import { TaskRepository } from './tasks/task-repository.js'
import { TaskService } from './tasks/task-service.js'

export function createPhase1Services(db) {
  const curriculumRepository = new CurriculumRepository(db)
  const curriculum = new CurriculumService(curriculumRepository)
  const objectiveRepository = new ObjectiveRepository(db)
  const objectives = new ObjectiveService(objectiveRepository, curriculum)
  const content = new ExistingContentAdapter(db)
  const tasks = new TaskService(new TaskRepository(db), objectiveRepository, content)
  return { curriculum, objectives, tasks }
}
