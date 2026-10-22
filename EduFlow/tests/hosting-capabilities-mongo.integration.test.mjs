import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { MongoClient } from 'mongodb'
import jwt from 'jsonwebtoken'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'
import { ensureLearningV2Indexes } from '../lib/server/learning-v2/database/bootstrap.js'
import { withHostingPolicy } from '../lib/server/hosting-route-policy.js'
import { handleLearningV2Route } from '../lib/server/learning-v2/http/route-handler.js'
import { getDatabase } from '../lib/server/database.js'
import { stagingFixture } from './helpers/hosting-staging-fixture.mjs'
import { hostingDigest, resolveHostingCapabilities, withVerifiedHostingDatabase } from '../lib/server/hosting-capabilities-v1.js'
import { resolveLearningV2Capabilities } from '../lib/server/learning-v2/feature-flags/learning-v2.js'

test('HD-01 authenticated disposable replica-set proves synthetic staging and rejects foreign principal', {
  skip: process.env.RUN_LEARNING_V2_MONGO_TESTS !== '1',
}, async () => {
  const name = process.env.LEARNING_V2_TEST_DB_NAME
  assert.match(name || '', /^eduflow_learning_v2_test_[a-z0-9_-]+$/)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(process.env.MONGO_URL).hostname))
  const admin = await new MongoClient(process.env.MONGO_URL).connect()
  const user = `synthetic_${randomUUID().replaceAll('-', '')}`
  const password = randomUUID()
  let runtime
  let created = false
  try {
    const db = admin.db(name)
    await db.command({ createUser: user, pwd: password, roles: [{ role: 'readWrite', db: name }] })
    created = true
    runtime = await new MongoClient(process.env.MONGO_URL, { auth: { username: user, password }, authSource: name }).connect()
    const boundDb = runtime.db(name)
    const hello = await boundDb.command({ hello: 1 })
    const connection = await boundDb.command({ connectionStatus: 1, showPrivileges: true })
    const f = stagingFixture()
    f.binding.database = { name, replica_set: hello.setName, hosts: hello.hosts,
      principal: { user, db: name }, privileges_digest: hostingDigest(connection.authInfo.authenticatedUserPrivileges) }
    Object.assign(f.environment, { DB_NAME: name, MONGO_URL: process.env.MONGO_URL, EDUFLOW_HOSTING_BINDING: JSON.stringify(f.binding) })
    assert.equal(resolveHostingCapabilities(f.environment).environment, 'deny')
    await withVerifiedHostingDatabase(boundDb, async () => {
      assert.equal(resolveHostingCapabilities(f.environment).environment, 'staging')
      assert.ok(Object.values(resolveLearningV2Capabilities(f.environment)).every(Boolean))
      assert.equal(resolveHostingCapabilities(f.environment).provider_transport, false)
      const session = runtime.startSession()
      try {
        await session.withTransaction(async () => {
          await boundDb.collection('classes').insertOne({ id: user, synthetic_data: true }, { session })
          assert.ok(await boundDb.collection('classes').findOne({ id: user }, { session }))
          await boundDb.collection('classes').deleteOne({ id: user }, { session })
        })
      } finally { await session.endSession() }
    }, f.environment)
    assert.equal(resolveHostingCapabilities(f.environment).environment, 'deny')
    await assert.rejects(withVerifiedHostingDatabase(db, () => assert.fail('unbound mutation'), f.environment), { code: 'HOSTING_CAPABILITY_DENIED' })
    await ensureLearningV2Indexes(db)
    const teacherId = `${user}-teacher`, studentId = `${user}-student`, foreignId = `${user}-foreign`
    const tenantId = generateDomainId('ten'), foreignTenant = generateDomainId('ten')
    await db.collection('users').insertMany([{ id: teacherId, synthetic_data: true }, { id: foreignId, synthetic_data: true }])
    await db.collection('students').insertOne({ id: studentId, synthetic_data: true })
    await db.collection('learning_v2_tenants').insertMany([tenantId, foreignTenant].map((tenant_id) => ({ tenant_id, status: 'active', type: 'school', synthetic_data: true })))
    await db.collection('learning_v2_tenant_memberships').insertMany([
      { tenant_id: tenantId, actor_id: teacherId, actor_type: 'teacher', role: 'teacher', status: 'active' },
      { tenant_id: tenantId, actor_id: studentId, actor_type: 'student', role: 'student', status: 'active' },
      { tenant_id: foreignTenant, actor_id: foreignId, actor_type: 'teacher', role: 'teacher', status: 'active' },
    ])
    await db.collection('assignments').insertOne({ id: `${user}-assignment`, code: 'FOREIGN', teacher_id: foreignId })
    const saved = { ...process.env }
    let applicationDb
    try {
      const uri = new URL(process.env.MONGO_URL)
      uri.username = user; uri.password = password; uri.searchParams.set('authSource', name)
      Object.assign(process.env, f.environment, { MONGO_URL: uri.toString() })
      const token = (claims) => jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '5m' })
      const request = (path, claims = { userId: teacherId }) => new Request(`http://localhost${path}`, { headers: {
        Authorization: `Bearer ${token(claims)}`, 'x-tenant-id': foreignTenant, 'x-role': 'admin', 'x-environment': 'production',
      } })
      let calls = 0
      const core = withHostingPolicy(async () => { calls += 1; return Response.json({ environment: resolveHostingCapabilities().environment }) })
      const allowed = await core(request('/api/classes'))
      applicationDb = await getDatabase()
      assert.equal(allowed.status, 200)
      assert.equal((await allowed.json()).environment, 'staging')
      const v2 = await handleLearningV2Route(request('/api/v2/learning/context'), 'definitions', async ({ actor }) => ({ tenant: actor.tenant_id }))
      assert.equal(v2.status, 200)
      assert.equal((await v2.json()).tenant, tenantId, 'caller tenant/role headers have no authority')
      assert.equal((await core(request('/api/student/assignment/FOREIGN', { studentId, role: 'student' }))).status, 403)
      assert.equal((await core(request('/api/generate-image'))).status, 403)
      delete process.env.EDUFLOW_STAGING_EPOCH
      assert.equal((await core(request('/api/classes'))).status, 403)
      process.env.EDUFLOW_STAGING_EPOCH = f.environment.EDUFLOW_STAGING_EPOCH
      process.env.VERCEL_ENV = 'production'
      assert.equal((await core(request('/api/classes'))).status, 403)
      assert.equal(calls, 1, 'denied requests never enter the operation')
    } finally {
      if (applicationDb) await applicationDb.client.close()
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
      Object.assign(process.env, saved)
    }
    f.binding.database.principal.user = 'foreign-principal'
    f.environment.EDUFLOW_HOSTING_BINDING = JSON.stringify(f.binding)
    await assert.rejects(withVerifiedHostingDatabase(boundDb, () => assert.fail('foreign mutation'), f.environment), { code: 'HOSTING_CAPABILITY_DENIED' })
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name)
    for (const collection of ['provider_executions', 'provider_execution_events', 'provider_budgets']) assert.equal(names.includes(collection), false)
  } finally {
    if (runtime) await runtime.close()
    if (created) await admin.db(name).command({ dropUser: user })
    await admin.close()
  }
})
