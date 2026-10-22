import { requireTeacher } from '../auth/learning-authorization.js'
import { LearningV2Error } from '../contracts/errors.js'
import { DEVELOPMENT_CURRICULUM_SUBSET, requireDevelopmentCurriculumSeedAllowed } from './development-subset.js'

function plain(document) {
  if (!document) return document
  const { _id, ...dto } = document
  for (const key of ['created_at', 'published_at', 'updated_at']) {
    if (dto[key] instanceof Date) dto[key] = dto[key].toISOString()
  }
  return dto
}

export function validateCurriculumGraph(nodes) {
  const byId = new Map(nodes.map((node) => [node.competency_id, node]))
  if (byId.size !== nodes.length) throw new LearningV2Error('VALIDATION_ERROR')
  for (const node of nodes) {
    if (node.parent_competency_id && !byId.has(node.parent_competency_id)) throw new LearningV2Error('VALIDATION_ERROR')
    for (const prerequisite of node.prerequisites || []) {
      if (prerequisite.competency_id === node.competency_id || !byId.has(prerequisite.competency_id)) {
        throw new LearningV2Error('VALIDATION_ERROR')
      }
    }
  }

  const visiting = new Set()
  const visited = new Set()
  function visit(id) {
    if (visiting.has(id)) throw new LearningV2Error('VALIDATION_ERROR')
    if (visited.has(id)) return
    visiting.add(id)
    const node = byId.get(id)
    for (const prerequisite of node?.prerequisites || []) {
      if (prerequisite.kind === 'required') visit(prerequisite.competency_id)
    }
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of byId.keys()) visit(id)
  return true
}

export class CurriculumService {
  constructor(repository) {
    this.repository = repository
  }

  async listFrameworks(actor, filter = {}, limit = 50) {
    return (await this.repository.listFrameworks(actor, filter, limit)).map(plain)
  }

  async listNodes(actor, filter = {}, limit = 50) {
    return (await this.repository.listNodes(actor, filter, limit)).map(plain)
  }

  async requireCompetencyTargets(actor, targets) {
    for (const target of targets) {
      const node = await this.repository.findAccessibleNode(actor, target)
      if (!node || !['competency', 'competency_level', 'curriculum_objective'].includes(node.node_type)) {
        throw new LearningV2Error('VALIDATION_ERROR')
      }
    }
  }

  async installDevelopmentSubset(actor, environment = process.env, now = new Date()) {
    requireTeacher(actor)
    try {
      requireDevelopmentCurriculumSeedAllowed(environment)
    } catch {
      throw new LearningV2Error('FORBIDDEN')
    }
    validateCurriculumGraph(DEVELOPMENT_CURRICULUM_SUBSET.nodes)
    return plain(await this.repository.installDevelopmentSubset(DEVELOPMENT_CURRICULUM_SUBSET, now))
  }
}
