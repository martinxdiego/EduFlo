import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKeyPairSync, sign } from 'node:crypto'
import { stagingFixture } from './helpers/hosting-staging-fixture.mjs'
import { canonical, CORE_FEATURES } from '../lib/server/hosting-binding-shared.js'
import { ACTIVATION_BINDING_CONTRACT, ACTIVATION_GRANT_CONTRACT, MAX_ACTIVATION_MS,
  stagingCandidateDigest, stagingActivationBindingSchema, verifyStagingActivationGrant } from '../lib/server/hosting-activation-v2.js'
import { inspectHostingConfiguration, resolveHostingCapabilities, withVerifiedHostingDatabase } from '../lib/server/hosting-capabilities-v1.js'
import { resolveLearningV2Capabilities } from '../lib/server/learning-v2/feature-flags/learning-v2.js'

function fixture() {
  const f = stagingFixture()
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  delete f.binding.deployment_id
  Object.assign(f.binding, { contract_version: ACTIVATION_BINDING_CONTRACT, features: [...CORE_FEATURES],
    activation: { store_id: 'ecfg_synthetic123456', item_key: 'synthetic_approval', key_id: 'synthetic-key-1',
      public_key: publicKey.export({ format: 'der', type: 'spki' }).toString('base64') } })
  Object.assign(f.environment, { EDUFLOW_HOSTING_BINDING: JSON.stringify(f.binding),
    EDUFLOW_HOSTING_ACTIVATION_REQUIRED: 'true', EDUFLOW_STAGING_APPROVAL_READ_TOKEN: 'synthetic-read-token-only',
    VERCEL_DEPLOYMENT_ID: 'dpl_synthetic123456' })
  const now = Date.now()
  const payload = { contract_version: ACTIVATION_GRANT_CONTRACT, candidate_digest: stagingCandidateDigest(f.binding),
    deployment_id: f.environment.VERCEL_DEPLOYMENT_ID, project_id: f.binding.project_id, revision: f.binding.revision,
    staging_epoch: f.binding.staging_epoch, key_id: f.binding.activation.key_id, review_ref: 'synthetic-independent-review',
    issued_at: now - 1000, expires_at: now + 60_000 }
  const envelope = () => ({ payload: structuredClone(payload), signature: sign(null, Buffer.from(canonical(payload)), privateKey).toString('base64url') })
  return { ...f, privateKey, payload, envelope }
}
const denied = { code: 'HOSTING_CAPABILITY_DENIED' }
const json = (value) => Response.json(value)

test('V2 signed exact deployment plus real request DB proof grants only core features, then loses authority', async (t) => {
  const f = fixture()
  let reads = 0
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    reads++
    assert.equal(url, `https://global-config.vercel.com/${f.binding.activation.store_id}/item/${f.binding.activation.item_key}`)
    assert.equal(options.headers.Authorization, `Bearer ${f.environment.EDUFLOW_STAGING_APPROVAL_READ_TOKEN}`)
    assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal)
    return json(f.envelope())
  })
  assert.equal(resolveHostingCapabilities(f.environment).environment, 'deny')
  await withVerifiedHostingDatabase(f.db, () => {
    const c = resolveHostingCapabilities(f.environment)
    assert.equal(c.environment, 'staging'); assert.equal(c.contract_version, ACTIVATION_BINDING_CONTRACT)
    assert.deepEqual(c.features, CORE_FEATURES)
    assert.ok(Object.values(resolveLearningV2Capabilities(f.environment)).every((enabled) => !enabled))
    for (const key of ['provider_transport', 'paid_authority', 'runtime_approval', 'ai_grading', 'live_tutor']) assert.equal(c[key], false)
  }, f.environment)
  assert.equal(resolveHostingCapabilities(f.environment).environment, 'deny')
  await withVerifiedHostingDatabase(f.db, () => {}, f.environment)
  assert.equal(reads, 2, 'Every request must fetch a new approval')
})

for (const field of ['candidate_digest', 'deployment_id', 'project_id', 'revision', 'staging_epoch', 'key_id']) {
  test(`V2 independently signed mismatched ${field} is rejected`, () => {
    const f = fixture()
    f.payload[field] = field === 'revision' ? 'b'.repeat(40) : field === 'candidate_digest' ? `sha256:${'b'.repeat(64)}`
      : field === 'deployment_id' ? 'dpl_another123456' : 'other-value'
    assert.throws(() => verifyStagingActivationGrant(f.envelope(), f.binding, f.environment.VERCEL_DEPLOYMENT_ID))
  })
}

for (const change of ['features', 'configuration', 'database', 'branch', 'source', 'public_key']) {
  test(`V2 candidate ${change} drift cannot reuse an existing grant`, () => {
    const f = fixture(); const envelope = f.envelope()
    if (change === 'features') f.binding.features.pop()
    if (change === 'configuration') f.binding.configuration_version += '-changed'
    if (change === 'database') f.binding.database.principal.user += '-changed'
    if (change === 'branch') f.binding.branch = 'untrusted'
    if (change === 'source') f.binding.activation.store_id += 'changed'
    if (change === 'public_key') f.binding.activation.public_key = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
    assert.throws(() => verifyStagingActivationGrant(envelope, f.binding, f.environment.VERCEL_DEPLOYMENT_ID))
  })
}

test('V2 signatures cannot be tampered, signed by a different key, or extended with extra claims', () => {
  const f = fixture(); const e = f.envelope()
  e.payload.review_ref += '-tampered'
  assert.throws(() => verifyStagingActivationGrant(e, f.binding, f.environment.VERCEL_DEPLOYMENT_ID))
  const foreign = sign(null, Buffer.from(canonical(f.payload)), generateKeyPairSync('ed25519').privateKey).toString('base64url')
  assert.throws(() => verifyStagingActivationGrant({ payload: f.payload, signature: foreign }, f.binding, f.environment.VERCEL_DEPLOYMENT_ID))
  assert.throws(() => verifyStagingActivationGrant({ ...f.envelope(), approved: true }, f.binding, f.environment.VERCEL_DEPLOYMENT_ID))
  f.payload.approved = true
  assert.throws(() => verifyStagingActivationGrant(f.envelope(), f.binding, f.environment.VERCEL_DEPLOYMENT_ID))
})

test('V2 time boundaries, future issuance and the twelve-hour overnight test maximum fail closed', () => {
  const f = fixture(); const now = Date.now()
  Object.assign(f.payload, { issued_at: now, expires_at: now + MAX_ACTIVATION_MS })
  assert.ok(verifyStagingActivationGrant(f.envelope(), f.binding, f.environment.VERCEL_DEPLOYMENT_ID, now))
  for (const at of [now - 1, now + MAX_ACTIVATION_MS, now + MAX_ACTIVATION_MS + 1, NaN]) {
    assert.throws(() => verifyStagingActivationGrant(f.envelope(), f.binding, f.environment.VERCEL_DEPLOYMENT_ID, at))
  }
  f.payload.expires_at++
  assert.throws(() => verifyStagingActivationGrant(f.envelope(), f.binding, f.environment.VERCEL_DEPLOYMENT_ID, now))
  f.payload.expires_at = now
  assert.throws(() => verifyStagingActivationGrant(f.envelope(), f.binding, f.environment.VERCEL_DEPLOYMENT_ID, now))
})

test('V2 cannot include a deployment ID in its pre-deployment candidate or enable V2/Provider features', () => {
  const f = fixture()
  for (const invalid of [{ ...f.binding, deployment_id: f.environment.VERCEL_DEPLOYMENT_ID },
    { ...f.binding, features: [...CORE_FEATURES, 'learning_v2.tutor'] }, { ...f.binding, features: ['provider'] },
    { ...f.binding, features: ['auth', 'auth'] }, { ...f.binding, paid_authority: true }]) {
    assert.equal(stagingActivationBindingSchema.safeParse(invalid).success, false)
  }
})

test('V2 missing required source configuration never falls back to V1 or self-approval', () => {
  for (const key of ['EDUFLOW_HOSTING_ACTIVATION_REQUIRED', 'EDUFLOW_STAGING_APPROVAL_READ_TOKEN', 'VERCEL_DEPLOYMENT_ID']) {
    const f = fixture(); delete f.environment[key]
    assert.equal(inspectHostingConfiguration(f.environment).environment, 'deny')
  }
  const v1 = stagingFixture(); v1.environment.EDUFLOW_HOSTING_ACTIVATION_REQUIRED = 'true'
  assert.equal(inspectHostingConfiguration(v1.environment).environment, 'deny')
})

for (const mode of ['missing', 'network', 'redirect', 'unauthorized', 'malformed', 'oversized', 'chunked-oversized', 'wrong-type']) {
  test(`V2 ${mode} approval response denies before database proof and operation`, async (t) => {
    const f = fixture()
    let queries = 0
    f.db.command = async () => { queries++; throw new Error('Must not query') }
    t.mock.method(globalThis, 'fetch', async () => {
      if (mode === 'network') throw new Error('synthetic failure, no credential details')
      if (mode === 'missing') return json(null)
      if (mode === 'redirect') return new Response(null, { status: 302 })
      if (mode === 'unauthorized') return new Response(null, { status: 401 })
      if (mode === 'malformed') return new Response('{', { headers: { 'Content-Type': 'application/json' } })
      if (mode === 'oversized') return new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '20000' } })
      if (mode === 'chunked-oversized') return new Response(' '.repeat(20000), { headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify(f.envelope()), { headers: { 'Content-Type': 'text/html' } })
    })
    await assert.rejects(withVerifiedHostingDatabase(f.db, () => assert.fail('operation'), f.environment), denied)
    assert.equal(queries, 0)
  })
}

test('V2 removal is read again and fails closed; a previously valid response is never cached', async (t) => {
  const f = fixture(); let removed = false
  t.mock.method(globalThis, 'fetch', async () => json(removed ? null : f.envelope()))
  await withVerifiedHostingDatabase(f.db, () => {}, f.environment)
  removed = true
  await assert.rejects(withVerifiedHostingDatabase(f.db, () => assert.fail('removed grant'), f.environment), denied)
})

test('V2 expired grant after slow Mongo observations cannot enter operation', async (t) => {
  const f = fixture(); const now = Date.now()
  f.payload.issued_at = now - 1000; f.payload.expires_at = now + 1000
  t.mock.method(globalThis, 'fetch', async () => json(f.envelope()))
  const originalCommand = f.db.command
  f.db.command = async (command) => {
    const result = await originalCommand(command)
    if (command.connectionStatus) t.mock.method(Date, 'now', () => now + 1000)
    return result
  }
  await assert.rejects(withVerifiedHostingDatabase(f.db, () => assert.fail('expired'), f.environment), denied)
})

test('V2 resolver rechecks expiry and configuration drift within an authorized request', async (t) => {
  const f = fixture(); const now = Date.now()
  t.mock.method(globalThis, 'fetch', async () => json(f.envelope()))
  await withVerifiedHostingDatabase(f.db, () => {
    assert.equal(resolveHostingCapabilities(f.environment).environment, 'staging')
    t.mock.method(Date, 'now', () => f.payload.expires_at)
    assert.equal(resolveHostingCapabilities(f.environment).environment, 'deny')
    t.mock.method(Date, 'now', () => now)
    f.environment.EDUFLOW_STAGING_APPROVAL_READ_TOKEN += '-changed'
    assert.equal(resolveHostingCapabilities(f.environment).environment, 'deny')
  }, f.environment)
})

test('V2 production always wins and valid approval does not bypass foreign Mongo identity', async (t) => {
  const f = fixture()
  t.mock.method(globalThis, 'fetch', async () => json(f.envelope()))
  f.observations.hello.setName = 'foreign'
  await assert.rejects(withVerifiedHostingDatabase(f.db, () => assert.fail('foreign db'), f.environment), denied)
  for (const key of ['VERCEL_ENV', 'VERCEL_TARGET_ENV', 'EDUFLOW_APP_ENV']) {
    const env = { ...f.environment, [key]: 'production' }
    assert.equal(inspectHostingConfiguration(env).environment, 'production')
  }
})

test('V2 hosted caller cannot swap approval token, source or pinned key', () => {
  const f = fixture(); const saved = { ...process.env }
  try {
    Object.assign(process.env, f.environment)
    for (const key of ['EDUFLOW_STAGING_APPROVAL_READ_TOKEN', 'EDUFLOW_HOSTING_ACTIVATION_REQUIRED', 'EDUFLOW_HOSTING_BINDING']) {
      const env = { ...f.environment, [key]: 'caller-controlled' }
      assert.equal(inspectHostingConfiguration(env).reason, 'CALLER_OVERRIDE_DENIED')
    }
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
  }
})
