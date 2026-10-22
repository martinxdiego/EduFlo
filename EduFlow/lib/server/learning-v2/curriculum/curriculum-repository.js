import { tenantScopedFilter } from '../auth/tenant-context.js'

export class CurriculumRepository {
  constructor(db) {
    this.frameworks = db.collection('curriculum_frameworks')
    this.nodes = db.collection('curriculum_nodes')
  }

  async listFrameworks(actor, filter = {}, limit = 50) {
    const query = {
      ...filter,
      status: 'published',
      $or: [{ scope: 'global', tenant_id: null }, tenantScopedFilter(actor, { scope: 'tenant' })],
    }
    return this.frameworks.find(query).sort({ name: 1, version: -1 }).limit(limit).toArray()
  }

  async listNodes(actor, filter = {}, limit = 50) {
    const query = {
      ...filter,
      status: 'active',
      $or: [{ tenant_id: null }, { tenant_id: actor.tenant_id }],
    }
    return this.nodes.find(query).sort({ order: 1, competency_id: 1 }).limit(limit).toArray()
  }

  async findAccessibleNode(actor, reference) {
    return this.nodes.findOne({
      competency_id: reference.competency_id,
      'framework_ref.framework_id': reference.framework_id,
      'framework_ref.version': reference.framework_version,
      status: 'active',
      $or: [{ tenant_id: null }, { tenant_id: actor.tenant_id }],
    })
  }

  async installDevelopmentSubset(subset, now) {
    const framework = { ...subset.framework, published_at: now, created_at: now }
    await this.frameworks.updateOne(
      { framework_id: framework.framework_id, version: framework.version, scope: 'global', tenant_id: null },
      { $setOnInsert: framework },
      { upsert: true },
    )
    for (const [order, node] of subset.nodes.entries()) {
      await this.nodes.updateOne(
        { competency_id: node.competency_id },
        { $setOnInsert: {
          ...node,
          framework_ref: { framework_id: framework.framework_id, version: framework.version },
          tenant_id: null,
          order,
          status: 'active',
          source_type: 'development_test',
          authoritative: false,
          created_at: now,
        } },
        { upsert: true },
      )
    }
    return framework
  }
}
