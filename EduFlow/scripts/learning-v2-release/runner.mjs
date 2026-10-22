import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { RELEASE_MANIFEST_VERSION, RELEASE_PROFILES, getReleaseProfile } from './manifest-v1.mjs'
import { PUBLIC_V2_ROUTES } from './routes-v1.mjs'
import { canonicalizeTestTempDirectory } from './test-temp-directory.mjs'
import { assertPublicV2RouteManifest } from './route-discovery.mjs'
import { paidEvaluationReadiness } from '../../lib/server/learning-v2/tutor/evaluation/evaluation-manifest.js'
import {
  assertValidatorsRestored, credentialFingerprints, dropAndVerifyDatabase, freeLoopbackPort, guardedDatabaseName, runNodeTestStep,
  runProcess, resolveNextBinary, snapshotValidators, startDisposableMongo, startNextServer, stopInfrastructure, syntheticEnvironment,
  verifyReleaseHandshake,
} from './runner-core.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
let productionBuildReady = false

function expectedCapabilities(profile) {
  const requested = (name) => profile.flags?.[name] === '1'
  const definitions = profile.nodeEnv !== 'production' && requested('LEARNING_V2_ENABLED')
  const ingestion = definitions && requested('LEARNING_V2_PHASE_2_ENABLED')
  const tutor = definitions && requested('LEARNING_V2_PHASE_3_ENABLED')
  const reflection = tutor && requested('LEARNING_V2_PHASE_3B_ENABLED')
  const teacher = definitions && requested('LEARNING_V2_PHASE_4_ENABLED')
  const recommendations = teacher && requested('LEARNING_V2_PHASE_5_ENABLED')
  return { definitions, ingestion, tutor, reflection, teacher, recommendations }
}

async function ensureProductionBuild(profile, context) {
  if (productionBuildReady) return
  const environment = syntheticEnvironment(profile, context)
  const nextBin = resolveNextBinary(projectRoot)
  const result = await runProcess(process.execPath, [nextBin, 'build', '--webpack'], { cwd: projectRoot, env: environment })
  if (result.exitCode !== 0) throw new Error(`Next production build failed\n${result.stdout}\n${result.stderr}`)
  productionBuildReady = true
}

async function runProfile(profile) {
  if (!profile.required && process.env[profile.optInEnv] !== '1') {
    return { profile: profile.id, status: 'NOT RUN', reason: `${profile.optInEnv}=1 was not supplied` }
  }
  if (profile.preflight === 'paid-tutor-governance') {
    const readiness = paidEvaluationReadiness({ ...process.env, NODE_ENV: profile.nodeEnv })
    if (!readiness.runnable) {
      return { profile: profile.id, status: 'NOT RUN', reason: `${readiness.status}: ${readiness.reasonCode}` }
    }
  }
  const token = randomBytes(24).toString('hex')
  const databaseName = profile.mongo ? guardedDatabaseName(profile.id) : ''
  const context = { token, databaseName, manifestVersion: RELEASE_MANIFEST_VERSION, mongoUri: '', baseUrl: '' }
  const infrastructure = { mongo: null, next: null }
  const result = { profile: profile.id, required: profile.required, status: 'FAIL', steps: [], cleanup: { status: 'PENDING' } }
  let validators = {}
  try {
    if (profile.mongo) {
      infrastructure.mongo = await startDisposableMongo(profile.mongo, databaseName)
      context.mongoUri = infrastructure.mongo.uri
    }
    if (profile.server) {
      const port = await freeLoopbackPort()
      context.baseUrl = `http://127.0.0.1:${port}`
      if (profile.server === 'production') await ensureProductionBuild(profile, context)
      const serverEnvironment = syntheticEnvironment(profile, context)
      infrastructure.next = await startNextServer(projectRoot, profile, serverEnvironment, port)
      const effectiveCapabilities = expectedCapabilities(profile)
      if (profile.expectedCapabilities && JSON.stringify(profile.expectedCapabilities) !== JSON.stringify(effectiveCapabilities)) {
        throw new Error(`Manifest capability expectation is inconsistent for ${profile.id}`)
      }
      await verifyReleaseHandshake(context.baseUrl, {
        token, profileId: profile.id, manifestVersion: RELEASE_MANIFEST_VERSION, databaseName,
        capabilities: effectiveCapabilities,
        credentialFingerprints: credentialFingerprints(token),
        databaseStatus: profile.mongo === 'unavailable' ? 'unavailable' : 'available',
        transactionCapable: profile.mongo === 'replica-set' ? true : profile.mongo === 'standalone' ? false : undefined,
      })
    }
    if (profile.mongo && profile.mongo !== 'unavailable') validators = await snapshotValidators(context.mongoUri, databaseName)
    const testEnvironment = syntheticEnvironment(profile, context)
    for (const step of profile.steps) result.steps.push(await runNodeTestStep(projectRoot, step, testEnvironment, profile.required))
    result.status = 'PASS'
  } catch (error) {
    result.error = error.message
    if (error.counts) result.observedCounts = error.counts
    if (error.output) result.testOutput = error.output.slice(-30_000)
    if (infrastructure.next) result.serverOutput = `${infrastructure.next.logs.stdout}\n${infrastructure.next.logs.stderr}`.slice(-30_000)
  } finally {
    const cleanupErrors = []
    if (profile.mongo && profile.mongo !== 'unavailable' && infrastructure.mongo) {
      try { await assertValidatorsRestored(context.mongoUri, databaseName, validators) } catch (error) { cleanupErrors.push(error) }
      try { result.cleanup.database = await dropAndVerifyDatabase(context.mongoUri, databaseName) } catch (error) { cleanupErrors.push(error) }
    }
    try { await stopInfrastructure(infrastructure) } catch (error) {
      if (error instanceof AggregateError) cleanupErrors.push(...error.errors)
      else cleanupErrors.push(error)
    }
    if (cleanupErrors.length) {
      result.status = 'FAIL'
      result.cleanup = { status: 'FAIL', errors: cleanupErrors.map((error) => error.message) }
    } else result.cleanup.status = 'PASS'
  }
  return result
}

async function main() {
  await canonicalizeTestTempDirectory()
  await assertPublicV2RouteManifest(projectRoot, PUBLIC_V2_ROUTES)
  const requested = process.argv.slice(2)
  const profiles = !requested.length || requested.includes('--required')
    ? RELEASE_PROFILES.filter((item) => item.required)
    : requested.includes('--all') ? RELEASE_PROFILES : requested.map((id) => {
      const found = getReleaseProfile(id)
      if (!found) throw new Error(`Unknown release profile: ${id}`)
      return found
    })
  const results = []
  for (const profile of profiles) {
    process.stdout.write(`H10 ${profile.id}: RUNNING\n`)
    const result = await runProfile(profile)
    results.push(result)
    process.stdout.write(`H10 ${profile.id}: ${result.status}\n`)
    if (result.status === 'FAIL') process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  }
  const summary = {
    manifest_version: RELEASE_MANIFEST_VERSION,
    status: results.some((item) => item.status === 'FAIL')
      ? 'FAIL'
      : results.some((item) => item.status === 'PASS') ? 'PASS' : 'NOT RUN',
    profiles: results.map(({ profile, status, steps, cleanup, reason }) => ({
      profile, status, reason, counts: steps?.map((item) => ({ step: item.id, ...item.counts })), cleanup,
    })),
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  if (summary.status === 'FAIL') process.exitCode = 1
}

main().catch((error) => {
  process.stderr.write(`H10 runner failed closed: ${error.stack || error.message}\n`)
  process.exitCode = 1
})
