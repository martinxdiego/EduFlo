import { PERSONAL_TENANT_CHILDREN, unfencedDatabase } from './deletion-write-fence.js'
import { mongoTransaction } from './learning-v2/database/tenant-write.js'

// Durable scope lives on the existing account until all children and discovery
// rows have been removed. Every step is repeatable; no new collection is needed.
export async function deleteTeacherAccountData(database, userId, { afterStep = async () => {} } = {}) {
  const db = unfencedDatabase(database)
  const plan = await mongoTransaction(db, async (session) => {
    const user = await db.collection('users').findOne({ id: userId }, { session })
    if (!user) return null
    if (user.account_deletion) return user.account_deletion
    await db.collection('users').updateOne({ id: userId }, { $inc: { account_write_fence: 1 } }, { session })
    const tenants = await db.collection('learning_v2_tenants').find({ type: 'personal', owner_teacher_id: userId }, { session }).toArray()
    const scope = {
      status: 'deleting', started_at: new Date(),
      tenant_ids: tenants.map((item) => item.tenant_id),
      worksheet_ids: (await db.collection('worksheets').find({ user_id: userId }, { session }).project({ id: 1 }).toArray()).map((item) => item.id),
      assignment_ids: (await db.collection('assignments').find({ teacher_id: userId }, { session }).project({ id: 1 }).toArray()).map((item) => item.id),
      class_ids: (await db.collection('classes').find({ teacher_id: userId }, { session }).project({ id: 1 }).toArray()).map((item) => item.id),
    }
    await db.collection('learning_v2_tenants').updateMany({ tenant_id: { $in: scope.tenant_ids }, owner_teacher_id: userId },
      { $set: { status: 'deleting' }, $inc: { write_fence: 1 } }, { session })
    await db.collection('users').updateOne({ id: userId }, { $set: { account_deletion: scope } }, { session })
    return scope
  })
  if (!plan) return { acknowledged: true, deletedCount: 0 }
  await afterStep('scope')
  const tenantFilter = { tenant_id: { $in: plan.tenant_ids } }
  for (const collection of PERSONAL_TENANT_CHILDREN) {
    await db.collection(collection).deleteMany(tenantFilter)
    await afterStep(collection)
  }
  await db.collection('ai_generations').deleteMany({ $or: [{ user_id: userId }, tenantFilter] })
  await db.collection('rate_limits').deleteMany(tenantFilter)
  await afterStep('telemetry')
  await db.collection('submissions').deleteMany({ assignment_id: { $in: plan.assignment_ids } })
  for (const collection of ['comments', 'versions']) await db.collection(collection).deleteMany({
    $or: [{ user_id: userId }, { worksheet_id: { $in: plan.worksheet_ids } }],
  })
  await db.collection('shares').deleteMany({ $or: [
    { owner_id: userId }, { shared_with_id: userId }, { worksheet_id: { $in: plan.worksheet_ids } },
  ] })
  for (const collection of ['password_reset_tokens', 'generated_assets', 'studio_packages', 'dossiers']) {
    await db.collection(collection).deleteMany({ user_id: userId })
  }
  if (plan.class_ids.length) await db.collection('students').updateMany(
    { 'enrolled_classes.class_id': { $in: plan.class_ids } },
    { $pull: { enrolled_classes: { class_id: { $in: plan.class_ids } } } },
  )
  await afterStep('legacy_children')
  await db.collection('assignments').deleteMany({ teacher_id: userId })
  await db.collection('classes').deleteMany({ teacher_id: userId })
  await db.collection('worksheets').deleteMany({ user_id: userId })
  await afterStep('legacy_parents')
  await db.collection('learning_v2_tenant_memberships').deleteMany({ $or: [
    { actor_type: 'teacher', actor_id: userId }, tenantFilter,
  ] })
  await afterStep('memberships')
  await db.collection('learning_v2_tenants').deleteMany({ ...tenantFilter, owner_teacher_id: userId, status: 'deleting' })
  await afterStep('tenants')
  const result = await db.collection('users').deleteOne({ id: userId, 'account_deletion.status': 'deleting' })
  await afterStep('account')
  return result
}
