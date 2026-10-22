import { getDatabase } from './database.js'
import { inspectHostingConfiguration, resolveHostingCapabilities, withVerifiedHostingDatabase, HostingCapabilityError } from './hosting-capabilities-v1.js'
import { stagingRouteFeature, stagingFeatureAllowed } from './staging-feature-policy.js'
import { requireAuthenticatedActor } from './learning-v2/auth/learning-authorization.js'
import { resolveTenantContext } from './learning-v2/auth/tenant-context.js'
import { applyCorsHeaders } from './security.js'
import { LearningV2Error, learningV2ErrorResponse } from './learning-v2/contracts/errors.js'

const loginPaths = new Set(['/api/auth/login', '/api/student/login'])
async function syntheticActor(db, identity) {
  const record = await db.collection(identity.actor_type === 'teacher' ? 'users' : 'students')
    .findOne({ id: identity.actor_id, synthetic_data: true })
  if (!record || record.disabled_at || record.deleted_at || record.account_deletion || ['disabled', 'deleted'].includes(record.status)) throw new HostingCapabilityError()
  const tenant = await resolveTenantContext(db, identity, { createPersonalTenant: false })
  if (!await db.collection('learning_v2_tenants').findOne({ tenant_id: tenant.tenant_id, status: 'active', synthetic_data: true })) throw new HostingCapabilityError()
  return tenant
}

async function sameOwnerTenant(db, actor, resource, ownerField) {
  if (!resource || (resource.tenant_id && resource.tenant_id !== actor.tenant_id)
    || (resource.learning_v2?.tenant_id && resource.learning_v2.tenant_id !== actor.tenant_id)) throw new HostingCapabilityError()
  const tenant = await syntheticActor(db, { actor_id: resource[ownerField], actor_type: 'teacher', role: 'teacher' })
  if (tenant.tenant_id !== actor.tenant_id) throw new HostingCapabilityError()
}

async function checkStudentReferences(request, pathname, db, actor) {
  if (actor.actor_type !== 'student') return
  if (!pathname.startsWith('/api/student/') && !pathname.startsWith('/api/v2/')) throw new HostingCapabilityError()
  const body = ['POST', 'PUT'].includes(request.method) ? await request.clone().json().catch(() => ({})) : {}
  if (pathname.startsWith('/api/student/assignment/') || pathname === '/api/student/submit') {
    const code = (pathname.startsWith('/api/student/assignment/') ? pathname.split('/').at(-1) : body.assignmentCode)?.trim().toUpperCase()
    await sameOwnerTenant(db, actor, await db.collection('assignments').findOne({ code }), 'teacher_id')
  }
  if (pathname === '/api/student/my-results' || pathname === '/api/student/class-assignments' || pathname === '/api/student/my-classes') {
    const submissions = await db.collection('submissions').find({ student_id: actor.student_id }).limit(501).toArray()
    const classes = await db.collection('classes').find({ 'enrolled_students.student_id': actor.student_id }).limit(501).toArray()
    if (submissions.length > 500 || classes.length > 500) throw new HostingCapabilityError()
    for (const cls of classes) await sameOwnerTenant(db, actor, cls, 'teacher_id')
    for (const id of new Set(submissions.map((item) => item.assignment_id))) {
      await sameOwnerTenant(db, actor, await db.collection('assignments').findOne({ id }), 'teacher_id')
    }
  }
  if (pathname.endsWith('/join-class') || pathname.endsWith('/leave-class')) {
    const filter = pathname.endsWith('/join-class') ? { join_code: String(body.joinCode || '').trim().toUpperCase() } : { id: body.classId }
    await sameOwnerTenant(db, actor, await db.collection('classes').findOne(filter), 'teacher_id')
  }
}

export function withHostingPolicy(handler) {
  return async function hostingRequest(request, ...args) {
    const pathname = new URL(request.url).pathname
    const configuration = inspectHostingConfiguration()
    if (configuration.environment === 'development') return handler(request, ...args)
    const denied = () => pathname.startsWith('/api/v2/') ? learningV2ErrorResponse(new LearningV2Error('NOT_FOUND'))
      : applyCorsHeaders(Response.json({ error: 'Hosting capability denied.', code: 'HOSTING_CAPABILITY_DENIED' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }), request)
    const feature = stagingRouteFeature(pathname, request.method)
    if (configuration.environment !== 'staging_candidate' || !feature || !configuration.binding.features.includes(feature)) return denied()
    try {
      const db = await getDatabase()
      return await withVerifiedHostingDatabase(db, async () => {
        if (!stagingFeatureAllowed(resolveHostingCapabilities(), feature)) throw new HostingCapabilityError()
        if (loginPaths.has(pathname)) {
          const response = await handler(request, ...args)
          if (response.status === 200) {
            const body = await response.clone().json()
            const student = pathname === '/api/student/login'
            await syntheticActor(db, { actor_id: student ? body.student?.id : body.user?.id,
              actor_type: student ? 'student' : 'teacher', role: student ? 'student' : 'teacher' })
          }
          return response
        }
        const actor = await requireAuthenticatedActor(request, { db, createPersonalTenant: false })
        await syntheticActor(db, actor)
        await checkStudentReferences(request, pathname, db, actor)
        return handler(request, ...args)
      })
    } catch { return denied() }
  }
}
