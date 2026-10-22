// Operator-only tooling. Never import into the application or copy a signing key to Vercel.
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { readFile, writeFile, mkdir, lstat, realpath } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { canonical, hostingDigest } from '../lib/server/hosting-binding-shared.js'
import { stagingActivationBindingSchema, stagingCandidateDigest, ACTIVATION_GRANT_CONTRACT,
  MAX_ACTIVATION_MS, deploymentIdSchema, verifyStagingActivationGrant } from '../lib/server/hosting-activation-v2.js'

const fail = (code) => { throw new Error(code) }
const observationSchema = z.object({
  contract_version: z.literal('staging-deployment-observation-v1'), observed_at: z.number().int().safe(),
  deployment_id: deploymentIdSchema, project_id: z.string(), revision: z.string(), branch: z.string(),
  repository: z.object({ provider: z.literal('github'), owner: z.string(), slug: z.string() }).strict(),
  target: z.literal('preview'), state: z.literal('READY'), sso_protection: z.literal('all'),
  candidate_digest: z.string(), configuration_version: z.string(), staging_epoch: z.string(),
}).strict()

export function createSignedStagingGrant({ binding: raw, observation: input, privateKey, reviewRef,
  reviewedDigest, reviewedDeploymentId, ttlSeconds = MAX_ACTIVATION_MS / 1000, now = Date.now() }) {
  const binding = stagingActivationBindingSchema.parse(raw)
  const observed = observationSchema.parse(input)
  const digest = stagingCandidateDigest(binding)
  if (reviewedDigest !== digest || observed.candidate_digest !== digest || !reviewRef?.trim()
    || observed.deployment_id !== reviewedDeploymentId
    || observed.project_id !== binding.project_id || observed.revision !== binding.revision || observed.branch !== binding.branch
    || canonical(observed.repository) !== canonical(binding.repository)
    || observed.configuration_version !== binding.configuration_version || observed.staging_epoch !== binding.staging_epoch
    || !Number.isSafeInteger(now) || observed.observed_at > now || now - observed.observed_at > 600_000) fail('REVIEW_OBSERVATION_MISMATCH')
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds * 1000 > MAX_ACTIVATION_MS) fail('INVALID_GRANT_DURATION')
  const key = createPrivateKey(privateKey)
  if (key.asymmetricKeyType !== 'ed25519'
    || createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64') !== binding.activation.public_key) fail('SIGNING_KEY_MISMATCH')
  const payload = { contract_version: ACTIVATION_GRANT_CONTRACT, candidate_digest: digest,
    deployment_id: observed.deployment_id, project_id: binding.project_id, revision: binding.revision,
    staging_epoch: binding.staging_epoch, key_id: binding.activation.key_id, review_ref: reviewRef,
    issued_at: now, expires_at: now + ttlSeconds * 1000 }
  const envelope = { payload, signature: sign(null, Buffer.from(canonical(payload)), key).toString('base64url') }
  verifyStagingActivationGrant(envelope, binding, observed.deployment_id, now)
  return envelope
}

export async function createStagingSigningKey(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const publicBytes = publicKey.export({ type: 'spki', format: 'der' })
  const metadata = { key_id: `ed25519-${hostingDigest(publicBytes.toString('base64')).slice(7, 23)}`,
    public_key: publicBytes.toString('base64') }
  await writeFile(join(directory, 'private-key.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 })
  await writeFile(join(directory, 'public-key.json'), `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  return metadata
}

async function readJson(path) {
  if ((await lstat(path)).size > 65_536) fail('INPUT_TOO_LARGE')
  return JSON.parse(await readFile(path, 'utf8'))
}
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
function assertLocalOperator() {
  if (process.env.VERCEL || process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_ENV) fail('HOSTED_SIGNING_FORBIDDEN')
}
function assertReviewedSource(binding) {
  if (git('status', '--porcelain', '--untracked-files=all')) fail('SOURCE_NOT_COMMITTED')
  if (git('rev-parse', 'HEAD') !== binding.revision || git('branch', '--show-current') !== binding.branch) fail('SOURCE_REVISION_MISMATCH')
  const { owner, slug } = binding.repository
  const expected = [`https://github.com/${owner}/${slug}`, `git@github.com:${owner}/${slug}`]
  if (!expected.includes(git('remote', 'get-url', 'origin').replace(/\.git$/, ''))) fail('SOURCE_REPOSITORY_MISMATCH')
}

export async function runStagingActivationTool(argv) {
  const [command, ...rest] = argv
  const options = {}
  for (let i = 0; i < rest.length; i += 2) {
    if (!/^--[a-z-]+$/.test(rest[i]) || !rest[i + 1] || rest[i + 1].startsWith('--') || rest[i] in options) fail('INVALID_ARGUMENTS')
    options[rest[i]] = rest[i + 1]
  }
  const allowed = {
    keygen: ['--directory'], digest: ['--candidate'], verify: ['--candidate', '--grant', '--deployment-id'],
    sign: ['--candidate', '--observation', '--private-key', '--review-ref', '--reviewed-digest', '--reviewed-deployment-id', '--ttl-seconds', '--output'],
  }[command]
  if (!allowed || Object.keys(options).some((key) => !allowed.includes(key))) fail('INVALID_ARGUMENTS')
  if (command === 'keygen') {
    assertLocalOperator()
    const directory = resolve(options['--directory'] || '.tmp/staging-activation')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const actual = await realpath(directory)
    try { git('check-ignore', '--quiet', '--no-index', join(actual, 'private-key.pem')) } catch { fail('SIGNING_DIRECTORY_MUST_BE_GIT_IGNORED') }
    const metadata = await createStagingSigningKey(actual)
    return { key_id: metadata.key_id, public_key_file: join(actual, 'public-key.json'), private_key_saved_locally: true }
  }
  if (!['digest', 'sign', 'verify'].includes(command) || !options['--candidate']) fail('INVALID_ARGUMENTS')
  const binding = stagingActivationBindingSchema.parse(await readJson(options['--candidate']))
  const digest = stagingCandidateDigest(binding)
  if (command === 'digest') return { candidate_digest: digest, project_id: binding.project_id, revision: binding.revision,
    features: binding.features, runtime_approval: false, paid_authority: false, grants_access: false }
  if (command === 'verify') {
    const envelope = await readJson(options['--grant'])
    const payload = verifyStagingActivationGrant(envelope, binding, options['--deployment-id'])
    return { valid: true, deployment_id: payload.deployment_id, expires_at: payload.expires_at, grants_access_locally: false }
  }
  assertLocalOperator()
  assertReviewedSource(binding)
  const keyPath = options['--private-key']
  const stat = await lstat(keyPath)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077 || stat.size > 8192) fail('PRIVATE_KEY_FILE_UNSAFE')
  const envelope = createSignedStagingGrant({ binding, observation: await readJson(options['--observation']),
    privateKey: await readFile(keyPath, 'utf8'), reviewRef: options['--review-ref'], reviewedDigest: options['--reviewed-digest'],
    reviewedDeploymentId: options['--reviewed-deployment-id'],
    ttlSeconds: options['--ttl-seconds'] ? Number(options['--ttl-seconds']) : MAX_ACTIVATION_MS / 1000 })
  await writeFile(options['--output'], `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
  return { signed_locally: true, deployment_id: envelope.payload.deployment_id, candidate_digest: digest,
    expires_at: envelope.payload.expires_at, published: false }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runStagingActivationTool(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(/^[A-Z_]+$/.test(error.message) ? error.message : 'STAGING_ACTIVATION_TOOL_FAILED'); process.exitCode = 1 })
}
