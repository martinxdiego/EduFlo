import { generateDomainId, isDomainId } from '../contracts/ids.js'
import { LearningV2Error } from '../contracts/errors.js'
import { withAccountWrite } from '../../deletion-write-fence.js'

export const TENANT_COLLECTION = 'learning_v2_tenants'
export const MEMBERSHIP_COLLECTION = 'learning_v2_tenant_memberships'

async function activeMemberships(db, actorType, actorId) {
  return db.collection(MEMBERSHIP_COLLECTION).find({
    actor_type: actorType,
    actor_id: actorId,
    status: 'active',
  }).project({ _id: 0, tenant_id: 1, role: 1 }).toArray()
}

async function tenantById(db, tenantId) {
  return db.collection(TENANT_COLLECTION).findOne(
    { tenant_id: tenantId, status: 'active' },
    { projection: { _id: 0, tenant_id: 1, type: 1, owner_teacher_id: 1 } },
  )
}

export async function ensurePersonalTenant(db, teacherId, now = new Date()) {
  if (!teacherId) throw new LearningV2Error('FORBIDDEN')
  return withAccountWrite(db, teacherId, async (session) => {
    const tenants = db.collection(TENANT_COLLECTION)
    const proposedTenantId = generateDomainId('ten')
    let tenant
    try {
      tenant = await tenants.findOneAndUpdate(
        { type: 'personal', owner_teacher_id: teacherId },
        { $setOnInsert: {
          tenant_id: proposedTenantId,
          type: 'personal',
          owner_teacher_id: teacherId,
          status: 'active',
          created_at: now,
          updated_at: now,
        } },
        { upsert: true, returnDocument: 'after', session },
      )
    } catch (error) {
      if (error?.code !== 11000) throw error
      tenant = await tenants.findOne({ type: 'personal', owner_teacher_id: teacherId, status: 'active' })
    }
    if (!tenant || tenant.status !== 'active' || !isDomainId(tenant.tenant_id, 'ten')) {
      throw new LearningV2Error('INTERNAL_ERROR')
    }

    await db.collection(MEMBERSHIP_COLLECTION).updateOne(
      { actor_type: 'teacher', actor_id: teacherId, tenant_id: tenant.tenant_id },
      { $setOnInsert: {
        actor_type: 'teacher',
        actor_id: teacherId,
        tenant_id: tenant.tenant_id,
        role: 'teacher',
        status: 'active',
        created_at: now,
      }, $set: { updated_at: now } },
      { upsert: true, session },
    )
    return { tenant_id: tenant.tenant_id, tenant_type: tenant.type }
  })
}

export async function resolveTenantContext(db, identity, options = {}) {
  const memberships = await activeMemberships(db, identity.actor_type, identity.actor_id)
  if (memberships.length === 0 && identity.actor_type === 'teacher' && options.createPersonalTenant !== false) {
    return ensurePersonalTenant(db, identity.actor_id)
  }
  if (memberships.length !== 1 || memberships[0].role !== identity.role) {
    throw new LearningV2Error('FORBIDDEN')
  }

  const membership = memberships[0]
  if (!isDomainId(membership.tenant_id, 'ten')) throw new LearningV2Error('FORBIDDEN')
  const tenant = await tenantById(db, membership.tenant_id)
  if (!tenant) throw new LearningV2Error('FORBIDDEN')
  return { tenant_id: tenant.tenant_id, tenant_type: tenant.type }
}

export function requireTenantContext(actor) {
  if (!actor || !isDomainId(actor.tenant_id, 'ten')) throw new LearningV2Error('FORBIDDEN')
  return actor
}

export function requireSameTenant(actor, resourceTenantId) {
  requireTenantContext(actor)
  if (!isDomainId(resourceTenantId, 'ten') || actor.tenant_id !== resourceTenantId) {
    // NOT_FOUND avoids confirming whether a foreign resource exists.
    throw new LearningV2Error('NOT_FOUND')
  }
  return actor
}

export function tenantScopedFilter(actor, filter = {}) {
  requireTenantContext(actor)
  if (Object.hasOwn(filter, 'tenant_id') && filter.tenant_id !== actor.tenant_id) {
    throw new LearningV2Error('NOT_FOUND')
  }
  return { ...filter, tenant_id: actor.tenant_id }
}
