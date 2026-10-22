import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { stagingFixture } from './helpers/hosting-staging-fixture.mjs'
import { localHostingEnvironment } from './helpers/local-hosting-environment.mjs'
import { inspectHostingConfiguration, resolveHostingCapabilities, withVerifiedHostingDatabase, CORE_FEATURES } from '../lib/server/hosting-capabilities-v1.js'
import { stagingRouteFeature, stagingFeatureAllowed } from '../lib/server/staging-feature-policy.js'
import { resolveLearningV2Capabilities } from '../lib/server/learning-v2/feature-flags/learning-v2.js'
import { inventoryEntry, INVENTORIED_MONGODB_COLLECTIONS, validateLearningV2DataInventory } from '../lib/server/learning-v2/privacy/data-inventory-v1.js'
import { OpenAITutorProvider } from '../lib/server/learning-v2/tutor/providers/openai-tutor-provider.js'

test('HD-01 complete Preview binding needs actual DB proof and grants only request-local synthetic capabilities', async () => {
  const f = stagingFixture()
  assert.equal(resolveHostingCapabilities(f.environment).environment, 'deny')
  await withVerifiedHostingDatabase(f.db, async () => {
    const capabilities = resolveHostingCapabilities(f.environment)
    assert.equal(capabilities.environment, 'staging')
    for (const feature of CORE_FEATURES) assert.equal(stagingFeatureAllowed(capabilities, feature), true)
    for (const key of ['runtime_approval', 'paid_authority', 'provider_transport', 'ai_grading', 'live_tutor',
      'staging_core_ready', 'staging_learning_v2_ready', 'staging_provider_ready']) assert.equal(capabilities[key], false)
    assert.ok(Object.values(resolveLearningV2Capabilities(f.environment)).every(Boolean))
  }, f.environment)
  assert.equal(resolveHostingCapabilities(f.environment).environment, 'deny')
})

for (const key of ['VERCEL', 'VERCEL_ENV', 'VERCEL_TARGET_ENV', 'NODE_ENV', 'EDUFLOW_HOSTING_BINDING', 'VERCEL_PROJECT_ID',
  'VERCEL_GIT_PROVIDER', 'VERCEL_GIT_REPO_OWNER', 'VERCEL_GIT_REPO_SLUG', 'VERCEL_GIT_COMMIT_REF', 'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_DEPLOYMENT_ID', 'DB_NAME', 'EDUFLOW_STAGING_EPOCH', 'EDUFLOW_HOSTING_CONFIG_VERSION', 'EDUFLOW_SYNTHETIC_DATA',
  'EDUFLOW_RUNTIME_APPROVAL', 'EDUFLOW_PAID_AUTHORITY']) {
  test(`HD-01 missing or mismatched ${key} fails closed`, async () => {
    for (const value of [undefined, 'untrusted']) {
      const f = stagingFixture()
      if (value === undefined) delete f.environment[key]; else f.environment[key] = value
      assert.notEqual(inspectHostingConfiguration(f.environment).environment, 'staging_candidate')
      await assert.rejects(withVerifiedHostingDatabase(f.db, () => assert.fail('mutation'), f.environment), { code: 'HOSTING_CAPABILITY_DENIED' })
      assert.ok(Object.values(resolveLearningV2Capabilities(f.environment)).every((enabled) => !enabled))
    }
  })
}

for (const key of ['VERCEL_ENV', 'VERCEL_TARGET_ENV', 'EDUFLOW_APP_ENV']) {
  test(`HD-01 ${key} Production overrides claimed staging`, () => {
    const f = stagingFixture(); f.environment[key] = 'production'
    assert.equal(resolveHostingCapabilities(f.environment).environment, 'production')
    assert.ok(Object.values(resolveLearningV2Capabilities(f.environment)).every((enabled) => !enabled))
  })
}

for (const mismatch of ['name', 'topology', 'hosts', 'principal', 'grants', 'standalone']) {
  test(`HD-01 actual Mongo ${mismatch} mismatch denies before operation`, async () => {
    const f = stagingFixture()
    if (mismatch === 'name') f.db.databaseName = 'foreign'
    if (mismatch === 'topology') f.observations.hello.setName = 'foreign'
    if (mismatch === 'hosts') f.observations.hello.hosts = ['foreign.invalid:27017']
    if (mismatch === 'principal') f.observations.connection.authInfo.authenticatedUsers[0].user = 'foreign'
    if (mismatch === 'grants') f.observations.connection.authInfo.authenticatedUserPrivileges[0].resource.db = 'foreign'
    if (mismatch === 'standalone') delete f.observations.hello.setName
    await assert.rejects(withVerifiedHostingDatabase(f.db, () => assert.fail('mutation'), f.environment), { code: 'HOSTING_CAPABILITY_DENIED' })
  })
}

test('HD-01 epoch/revision drift invalidates verified authority in the same request', async () => {
  for (const key of ['EDUFLOW_STAGING_EPOCH', 'VERCEL_GIT_COMMIT_SHA']) {
    const f = stagingFixture()
    await withVerifiedHostingDatabase(f.db, () => {
      f.environment[key] = 'drift'
      assert.equal(resolveHostingCapabilities(f.environment).environment, 'deny')
    }, f.environment)
  }
})

test('HD-01 client/header/cookie/completeness claims and NEXT_PUBLIC flags grant nothing', () => {
  const fake = { NODE_ENV: 'production', NEXT_PUBLIC_EDUFLOW_APP_ENV: 'staging', synthetic_data: true, complete: true,
    headers: { 'x-vercel-env': 'preview' }, cookies: { environment: 'staging' }, OPENAI_API_KEY: 'synthetic' }
  assert.equal(resolveHostingCapabilities(fake).environment, 'production')
  assert.ok(Object.values(resolveLearningV2Capabilities(fake)).every((value) => !value))
  const saved = process.env.VERCEL_ENV
  try {
    process.env.VERCEL_ENV = 'production'
    assert.equal(resolveHostingCapabilities(localHostingEnvironment).environment, 'production')
  } finally { if (saved === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved }
})

test('HD-01 development is explicit, synthetic, isolated and cannot absorb hosted identity', () => {
  assert.equal(resolveHostingCapabilities({ NODE_ENV: 'development' }).environment, 'deny')
  assert.equal(resolveHostingCapabilities(localHostingEnvironment).environment, 'development')
  for (const override of [{ DB_NAME: 'production' }, { MONGO_URL: 'mongodb://foreign.invalid:27017' }, { VERCEL_ENV: 'preview' }, { EDUFLOW_APP_ENV: 'custom' }]) {
    assert.equal(resolveHostingCapabilities({ ...localHostingEnvironment, ...override }).environment, 'deny')
  }
})

test('HD-02 all unlisted features including signup, exports and Provider paths are denied', async () => {
  const f = stagingFixture()
  await withVerifiedHostingDatabase(f.db, () => {
    const capabilities = resolveHostingCapabilities(f.environment)
    for (const feature of ['ai_grading', 'live_tutor', 'provider', 'worksheet_generation', 'studio_generation', 'dossiers', 'uploads', 'ocr', 'image', 'audio', 'media', 'exports', 'unknown']) {
      assert.equal(stagingFeatureAllowed(capabilities, feature), false)
    }
    for (const path of ['/api/auth/register', '/api/student/register', '/api/auth/google', '/api/auth/forgot-password',
      '/api/generate-worksheet', '/api/studio/generate', '/api/studio/packages', '/api/studio/pptx', '/api/analyze-upload', '/api/generate-image',
      '/api/tts', '/api/chat', '/api/analyze-errors', '/api/dossiers', '/api/unknown-provider', '/api/v2/learning/unlisted']) {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE']) assert.equal(stagingRouteFeature(path, method), null, `${method} ${path}`)
    }
  }, f.environment)
})

test('HD-08 reviewed feature subset preserves dependencies and never enables live Tutor', async () => {
  const f = stagingFixture()
  f.binding.features = [...CORE_FEATURES, 'learning_v2.definitions', 'learning_v2.teacher', 'learning_v2.recommendations']
  f.environment.EDUFLOW_HOSTING_BINDING = JSON.stringify(f.binding)
  await withVerifiedHostingDatabase(f.db, async () => {
    assert.deepEqual(resolveLearningV2Capabilities(f.environment), { definitions: true, ingestion: false, tutor: false, reflection: false, teacher: true, recommendations: true })
    const provider = new OpenAITutorProvider()
    assert.equal(provider.available(), false)
    await assert.rejects(provider.generate({}), { code: 'PROVIDER_DISABLED' })
  }, f.environment)
})

test('HD-08 contradictory runtime or paid flags and unsupported Provider allowlist fail closed', () => {
  for (const [key, value] of [['LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED', '1'], ['RUN_TUTOR_PROVIDER_EVALS', '1'], ['EDUFLOW_PAID_AUTHORITY', 'true']]) {
    const f = stagingFixture(); f.environment[key] = value
    assert.equal(resolveHostingCapabilities(f.environment).environment, 'deny')
  }
  const f = stagingFixture(); f.binding.features.push('provider'); f.environment.EDUFLOW_HOSTING_BINDING = JSON.stringify(f.binding)
  assert.equal(inspectHostingConfiguration(f.environment).environment, 'deny')
})

test('H12 v23 lists exactly three approved future Provider collections without registering active storage', () => {
  assert.equal(validateLearningV2DataInventory().version, 'learning-v2-data-inventory-v23')
  for (const id of ['provider_executions', 'provider_execution_events', 'provider_budgets']) {
    assert.equal(inventoryEntry(id).implementation_status, 'approved_but_not_yet_implemented')
    assert.equal(inventoryEntry(id).learning_authority, 'none')
    assert.equal(INVENTORIED_MONGODB_COLLECTIONS.includes(id), false)
  }
})

test('HD-02 every public API route enters the server hosting boundary', async () => {
  async function walk(url) {
    for (const item of await readdir(url, { withFileTypes: true })) {
      const next = new URL(`${item.name}${item.isDirectory() ? '/' : ''}`, url)
      if (item.isDirectory()) { if (item.name !== 'internal') await walk(next) }
      else if (item.name === 'route.js') {
        const source = await readFile(next, 'utf8')
        assert.match(source, /withHostingPolicy|handleLearningV2Route|handleRecommendationRoute/, next.pathname)
      }
    }
  }
  await walk(new URL('../app/api/', import.meta.url))
  assert.match(await readFile(new URL('../lib/server/learning-v2/http/recommendation-route.js', import.meta.url), 'utf8'), /await handleLearningV2Route\(request, 'recommendations'/)
})
