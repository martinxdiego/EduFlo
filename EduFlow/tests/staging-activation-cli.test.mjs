import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stagingFixture } from './helpers/hosting-staging-fixture.mjs'
import { createSignedStagingGrant, createStagingSigningKey, runStagingActivationTool } from '../scripts/staging-activation.mjs'
import { CORE_FEATURES } from '../lib/server/hosting-binding-shared.js'
import { ACTIVATION_BINDING_CONTRACT, stagingCandidateDigest, verifyStagingActivationGrant } from '../lib/server/hosting-activation-v2.js'

function fixture() {
  const { binding } = stagingFixture()
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  delete binding.deployment_id
  Object.assign(binding, { contract_version: ACTIVATION_BINDING_CONTRACT, features: [...CORE_FEATURES],
    activation: { store_id: 'ecfg_synthetic123456', item_key: 'synthetic_approval', key_id: 'synthetic-key',
      public_key: publicKey.export({ format: 'der', type: 'spki' }).toString('base64') } })
  const now = Date.now()
  return { binding, now, privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    reviewedDigest: stagingCandidateDigest(binding), reviewedDeploymentId: 'dpl_synthetic123456', reviewRef: 'synthetic-review-reference',
    observation: { contract_version: 'staging-deployment-observation-v1', observed_at: now,
      deployment_id: 'dpl_synthetic123456', project_id: binding.project_id, revision: binding.revision,
      branch: binding.branch, repository: binding.repository, target: 'preview', state: 'READY',
      sso_protection: 'all', candidate_digest: stagingCandidateDigest(binding),
      configuration_version: binding.configuration_version, staging_epoch: binding.staging_epoch } }
}

test('operator signs only the reviewed candidate/observed exact protected Preview; runtime verifies signature', () => {
  const f = fixture()
  const grant = createSignedStagingGrant(f)
  const verified = verifyStagingActivationGrant(grant, f.binding, f.observation.deployment_id, f.now)
  assert.equal(verified.candidate_digest, f.reviewedDigest)
  assert.equal(verified.expires_at - verified.issued_at, 43_200_000)
  assert.equal(verified.review_ref, f.reviewRef)
})

for (const key of ['deployment_id', 'project_id', 'revision', 'branch', 'repository', 'target', 'state', 'sso_protection', 'candidate_digest', 'configuration_version', 'staging_epoch']) {
  test(`operator refuses unreviewed or mismatched observation: ${key}`, () => {
    const f = fixture()
    f.observation[key] = key === 'repository' ? { provider: 'github', owner: 'other', slug: 'other' } : 'other'
    assert.throws(() => createSignedStagingGrant(f))
  })
}

test('operator requires explicit matching review digest, reviewer reference and recent nonfuture observation', () => {
  for (const change of ['reviewedDigest', 'reviewedDeploymentId', 'reviewRef', 'old', 'future']) {
    const f = fixture()
    if (change === 'reviewedDigest') f.reviewedDigest = 'not-reviewed'
    if (change === 'reviewedDeploymentId') f.reviewedDeploymentId = 'dpl_other123456'
    if (change === 'reviewRef') f.reviewRef = ' '
    if (change === 'old') f.observation.observed_at = f.now - 600_001
    if (change === 'future') f.observation.observed_at = f.now + 1
    assert.throws(() => createSignedStagingGrant(f))
  }
})

test('operator rejects unknown or mistyped flags before creating a key or reading files', async () => {
  await assert.rejects(runStagingActivationTool(['keygen', '--unexpected', 'value']), /INVALID_ARGUMENTS/)
  await assert.rejects(runStagingActivationTool(['sign', '--ttl-sec', '30']), /INVALID_ARGUMENTS/)
})

test('operator cannot sign with another private key or authorize an overlong lease', () => {
  const f = fixture()
  f.privateKey = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' })
  assert.throws(() => createSignedStagingGrant(f))
  for (const ttlSeconds of [0, -1, 1.5, 43_201, NaN]) assert.throws(() => createSignedStagingGrant({ ...fixture(), ttlSeconds }))
})

test('operator key files are private, separate and exclusive; existing keys are never overwritten', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'eduflow-activation-key-test-'))
  try {
    const metadata = await createStagingSigningKey(directory)
    const before = await readFile(join(directory, 'private-key.pem'), 'utf8')
    assert.match(before, /^-----BEGIN PRIVATE KEY-----/)
    assert.equal((await stat(join(directory, 'private-key.pem'))).mode & 0o777, 0o600)
    assert.equal(JSON.parse(await readFile(join(directory, 'public-key.json'), 'utf8')).public_key, metadata.public_key)
    await assert.rejects(createStagingSigningKey(directory), { code: 'EEXIST' })
    assert.equal(await readFile(join(directory, 'private-key.pem'), 'utf8'), before)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
