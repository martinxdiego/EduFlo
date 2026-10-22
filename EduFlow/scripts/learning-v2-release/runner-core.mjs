import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, readFile, lstat, rm, rmdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { MongoClient } from 'mongodb'
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server'

export const TEST_DB_PATTERN = /^eduflow_learning_v2_test_[a-z0-9_-]+_[a-f0-9]{12}$/
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
const DISPOSABLE_MONGO_DIRECTORY_PATTERN = /^mongo-[a-f0-9]{24}$/
const DISPOSABLE_NEXT_DIRECTORY_PATTERN = /^next-[a-f0-9]{24}$/

async function createDisposableMongoDirectory() {
  // Keep disposable WiredTiger files on the workspace volume. The OS temp
  // volume can be too small even though the isolated test database is valid.
  const tempRoot = path.resolve(process.cwd(), '.eduflow-release-temp')
  const dbPath = path.join(tempRoot, `mongo-${randomBytes(12).toString('hex')}`)
  if (path.dirname(dbPath) !== tempRoot || !DISPOSABLE_MONGO_DIRECTORY_PATTERN.test(path.basename(dbPath))) {
    throw new Error('Unsafe disposable Mongo directory')
  }
  await mkdir(tempRoot, { recursive: true })
  await mkdir(dbPath)
  return { tempRoot, dbPath }
}

async function removeDisposableMongoDirectory(tempRoot, dbPath) {
  if (path.dirname(dbPath) !== tempRoot || !DISPOSABLE_MONGO_DIRECTORY_PATTERN.test(path.basename(dbPath))) {
    throw new Error('Refusing unsafe disposable Mongo directory cleanup')
  }
  // Windows may release WiredTiger handles a fraction after mongod exits.
  // Bounded native retries keep cleanup part of the result without weakening it.
  await rm(dbPath, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  await rmdir(tempRoot).catch((error) => {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error
  })
}

export async function createDisposableNextDirectory(projectRoot) {
  const tempRoot = path.resolve(projectRoot, '.eduflow-release-next')
  const directoryName = `next-${randomBytes(12).toString('hex')}`
  const distPath = path.join(tempRoot, directoryName)
  if (path.dirname(distPath) !== tempRoot || !DISPOSABLE_NEXT_DIRECTORY_PATTERN.test(path.basename(distPath))) {
    throw new Error('Unsafe disposable Next directory')
  }
  await mkdir(tempRoot, { recursive: true })
  await mkdir(distPath)
  return {
    tempRoot,
    distPath,
    relativeDistDir: `.eduflow-release-next/${directoryName}`,
  }
}

export async function removeDisposableNextDirectory(tempRoot, distPath) {
  const resolvedRoot = path.resolve(tempRoot)
  const resolvedPath = path.resolve(distPath)
  if (path.dirname(resolvedPath) !== resolvedRoot
    || !DISPOSABLE_NEXT_DIRECTORY_PATTERN.test(path.basename(resolvedPath))) {
    throw new Error('Refusing unsafe disposable Next directory cleanup')
  }
  await rm(resolvedPath, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  await rmdir(resolvedRoot).catch((error) => {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error
  })
}

export function parseTapCounts(output) {
  const value = (name) => {
    const matches = [...output.matchAll(new RegExp(`^# ${name} (\\d+)\\r?$`, 'gm'))]
    return matches.length ? Number(matches.at(-1)[1]) : null
  }
  return { tests: value('tests'), pass: value('pass'), fail: value('fail'), skipped: value('skipped') }
}

export function assertExactCounts(actual, expected, { required = true } = {}) {
  for (const key of ['tests', 'pass', 'fail', 'skipped']) {
    if (!Number.isInteger(actual[key])) throw new Error(`Missing TAP summary count: ${key}`)
    if (actual[key] !== expected[key]) throw new Error(`Exact count mismatch for ${key}: expected ${expected[key]}, observed ${actual[key]}`)
  }
  const executed = actual.pass + actual.fail
  if (required && executed === 0) throw new Error('Required test step executed zero checks')
  if (required && actual.skipped !== 0) throw new Error(`Required test step reported ${actual.skipped} unexpected skips`)
  if (actual.fail !== 0) throw new Error(`Test step reported ${actual.fail} failures`)
  return true
}

export function guardedDatabaseName(profileId, nonce = randomBytes(6).toString('hex')) {
  const prefix = 'eduflow_learning_v2_test_'
  const maxProfileLength = 63 - prefix.length - 1 - nonce.length
  const safeProfile = String(profileId).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, maxProfileLength)
  const name = `eduflow_learning_v2_test_${safeProfile}_${nonce}`
  if (!TEST_DB_PATTERN.test(name) || name.length > 63) throw new Error(`Unsafe disposable database name: ${name}`)
  return name
}

export function assertAllowedTestEndpoint(uri, protocol) {
  const parsed = new URL(uri)
  if (parsed.protocol !== protocol || !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`Test endpoint is not explicitly allowed: ${parsed.protocol}//${parsed.host}`)
  }
  return parsed
}

export async function freeLoopbackPort() {
  const server = createServer()
  server.unref()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

export async function runProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const [exitCode, signal] = await once(child, 'close')
  return { exitCode, signal, stdout, stderr }
}

export async function runNodeTestStep(projectRoot, step, environment, required = true) {
  if (step.gate && environment[step.gate] !== '1') throw new Error(`Missing required gate ${step.gate} for ${step.id}`)
  const args = ['--test', '--test-reporter=tap', '--test-concurrency=1', ...step.files]
  const childEnvironment = { ...environment, NO_COLOR: '1' }
  delete childEnvironment.NODE_TEST_CONTEXT
  const processResult = await runProcess(process.execPath, args, { cwd: projectRoot, env: childEnvironment })
  const combined = `${processResult.stdout}\n${processResult.stderr}`
  const counts = parseTapCounts(combined)
  if (processResult.exitCode !== 0) {
    const error = new Error(`Test process ${step.id} exited ${processResult.exitCode}`)
    error.output = combined
    error.counts = counts
    throw error
  }
  try {
    assertExactCounts(counts, step.expected, { required })
  } catch (error) {
    error.output = combined
    error.counts = counts
    throw error
  }
  return { id: step.id, counts, output: combined }
}

export async function startDisposableMongo(kind, databaseName) {
  if (!TEST_DB_PATTERN.test(databaseName)) throw new Error(`Refusing unsafe database name: ${databaseName}`)
  if (kind === 'unavailable') {
    const port = await freeLoopbackPort()
    const uri = `mongodb://127.0.0.1:${port}/?directConnection=true&serverSelectionTimeoutMS=500&connectTimeoutMS=500`
    assertAllowedTestEndpoint(uri, 'mongodb:')
    return { kind, uri, server: null }
  }
  const disposable = await createDisposableMongoDirectory()
  try {
    const server = kind === 'standalone'
      ? await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbPath: disposable.dbPath } })
      : await MongoMemoryReplSet.create({
        instanceOpts: [{ dbPath: disposable.dbPath }],
        replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
      })
    const uri = server.getUri()
    assertAllowedTestEndpoint(uri, 'mongodb:')
    return { kind, uri, server, ...disposable }
  } catch (error) {
    await removeDisposableMongoDirectory(disposable.tempRoot, disposable.dbPath).catch(() => {})
    throw error
  }
}

async function stopChild(child, timeoutMs = 10_000) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = once(child, 'exit').then(() => true)
  const timedOut = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs))
  if (await Promise.race([exited, timedOut])) return
  child.kill('SIGKILL')
  await once(child, 'exit').catch(() => {})
}

function childLogs(child) {
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-30_000) })
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-30_000) })
  return { get stdout() { return stdout }, get stderr() { return stderr } }
}

export function syntheticEnvironment(profile, context, inherited = process.env) {
  const serverNodeEnv = profile.server === 'production' ? 'production' : 'development'
  return {
    ...Object.fromEntries(Object.entries(inherited).filter(([key]) => !key.startsWith('VERCEL') && !key.startsWith('EDUFLOW_HOSTING_')
      && !key.startsWith('EDUFLOW_STAGING_APPROVAL_') && !['EDUFLOW_APP_ENV', 'EDUFLOW_STAGING_EPOCH'].includes(key))),
    EDUFLOW_HOSTING_PROFILE: 'local-synthetic', EDUFLOW_SYNTHETIC_DATA: 'true',
    NODE_ENV: profile.server ? serverNodeEnv : (profile.nodeEnv || 'test'),
    ...profile.flags,
    RUN_INTEGRATION_TESTS: profile.steps.some((item) => item.gate === 'RUN_INTEGRATION_TESTS') ? '1' : '0',
    RUN_LEARNING_V2_MONGO_TESTS: profile.steps.some((item) => item.gate === 'RUN_LEARNING_V2_MONGO_TESTS') ? '1' : '0',
    RUN_TUTOR_PROVIDER_EVALS: profile.optInEnv && inherited[profile.optInEnv] === '1' ? '1' : '0',
    RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE: '0',
    RUN_TUTOR_PROVIDER_EVAL_RUN_2: '0',
    RUN_TUTOR_PROVIDER_EVAL_V2_PROMPT_RUN_1: '0',
    RUN_TUTOR_PROVIDER_EVAL_V5_RUN_1: '0',
    RUN_TUTOR_PROVIDER_PROMPT_V3_FIXTURE_006_PROBE: '0',
    RUN_TUTOR_PROVIDER_EVAL_V7_R1_R2_RUN_1: '0',
    RUN_TUTOR_PROVIDER_EVAL_V8_R1_R2_RUN_1: '0',
    LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '0',
    EDUFLOW_RELEASE_NEXT_DIST_DIR: '',
    MONGO_URL: context.mongoUri || 'mongodb://127.0.0.1:1',
    DB_NAME: context.databaseName || 'eduflow_learning_v2_test_unit_offline',
    LEARNING_V2_TEST_DB_NAME: context.databaseName || 'eduflow_learning_v2_test_unit_offline',
    TEST_BASE_URL: context.baseUrl || '',
    CORS_ORIGINS: context.baseUrl || '',
    JWT_SECRET: `h10-synthetic-jwt-${context.token}`,
    LEARNING_V2_SUBMISSION_INTENT_SECRET: `h10-synthetic-intent-${context.token}`,
    LEARNING_V2_RELEASE_SYNTHETIC: '1',
    LEARNING_V2_RELEASE_PROFILE_ID: profile.id,
    LEARNING_V2_RELEASE_MANIFEST_VERSION: context.manifestVersion,
    LEARNING_V2_RELEASE_HANDSHAKE_TOKEN: context.token,
    H10_EXPECTED_CAPABILITIES: JSON.stringify(profile.expectedCapabilities || {}),
    OPENAI_API_KEY: profile.id === 'paid-provider-evaluation' ? (inherited.OPENAI_API_KEY || '') : '',
    GOOGLE_API_KEY: '', GEMINI_API_KEY: '', RESEND_API_KEY: '',
  }
}

export function resolveNextBinary(projectRoot) {
  return createRequire(path.join(projectRoot, 'package.json')).resolve('next/dist/bin/next')
}

export async function resolveStandaloneServer(projectRoot) {
  const distRoot = path.join(projectRoot, '.next')
  const manifest = JSON.parse(await readFile(path.join(distRoot, 'required-server-files.json'), 'utf8'))
  const traceRoot = manifest.config?.outputFileTracingRoot
  const relativeAppDir = manifest.relativeAppDir
  if (manifest.config?.output !== 'standalone' || typeof traceRoot !== 'string' || !path.isAbsolute(traceRoot)
    || typeof relativeAppDir !== 'string' || path.isAbsolute(relativeAppDir)
    || relativeAppDir !== path.relative(traceRoot, projectRoot)
    || (relativeAppDir && relativeAppDir.split(/[\\/]/).some((part) => part === '..' || part === '.'))) {
    throw new Error('Invalid Next standalone build manifest')
  }
  const serverPath = path.join(distRoot, 'standalone', relativeAppDir, 'server.js')
  const stat = await lstat(serverPath)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid Next standalone server entry')
  return serverPath
}

export async function startNextServer(projectRoot, profile, environment, port) {
  const nextBin = resolveNextBinary(projectRoot)
  const production = profile.server === 'production'
  const disposableNext = production ? null : await createDisposableNextDirectory(projectRoot)
  const args = production
    ? [await resolveStandaloneServer(projectRoot)]
    : [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port), '--webpack']
  const childEnvironment = production
    ? { ...environment, HOSTNAME: '127.0.0.1', PORT: String(port) }
    : { ...environment, EDUFLOW_RELEASE_NEXT_DIST_DIR: disposableNext.relativeDistDir }
  const child = spawn(process.execPath, args, { cwd: projectRoot, env: childEnvironment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const logs = childLogs(child)
  return { child, logs, baseUrl: `http://127.0.0.1:${port}`, disposableNext }
}

export async function verifyReleaseHandshake(baseUrl, expected, options = {}) {
  assertAllowedTestEndpoint(baseUrl, 'http:')
  const timeoutMs = options.timeoutMs || 60_000
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/internal/learning-v2-release-profile`, {
        headers: { Authorization: `Bearer ${expected.token}` }, signal: AbortSignal.timeout(2_000),
      })
      if (response.status !== 200) throw new Error(`Handshake returned HTTP ${response.status}`)
      const body = await response.json()
      if (body.profile_id !== expected.profileId) throw new Error(`Foreign profile: ${body.profile_id}`)
      if (body.manifest_version !== expected.manifestVersion) throw new Error(`Foreign manifest: ${body.manifest_version}`)
      if (body.database?.name !== expected.databaseName) throw new Error(`Foreign database: ${body.database?.name}`)
      if (body.synthetic !== true) throw new Error('Server did not attest synthetic mode')
      if (JSON.stringify(body.flags) !== JSON.stringify(expected.capabilities)) throw new Error(`Effective flag mismatch: ${JSON.stringify(body.flags)}`)
      if (expected.credentialFingerprints && JSON.stringify(body.credential_fingerprints) !== JSON.stringify(expected.credentialFingerprints)) {
        throw new Error('Synthetic credential fingerprint mismatch')
      }
      if (expected.databaseStatus && body.database?.status !== expected.databaseStatus) throw new Error(`Database status mismatch: ${body.database?.status}`)
      if (expected.transactionCapable !== undefined && body.database?.transaction_capable !== expected.transactionCapable) {
        throw new Error(`Transaction capability mismatch: ${body.database?.transaction_capable}`)
      }
      return body
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error(`Release handshake failed: ${lastError?.message || 'timeout'}`)
}

export function credentialFingerprints(token) {
  const fingerprint = (value) => createHash('sha256').update(value).digest('hex').slice(0, 16)
  return {
    jwt: fingerprint(`h10-synthetic-jwt-${token}`),
    submission_intent: fingerprint(`h10-synthetic-intent-${token}`),
  }
}

export async function snapshotValidators(uri, databaseName) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2_000 })
  await client.connect()
  try {
    const collections = await client.db(databaseName).listCollections({}, { nameOnly: false }).toArray()
    return Object.fromEntries(collections.map((item) => [item.name, {
      validator: item.options?.validator || {},
      validationLevel: item.options?.validationLevel || 'strict',
      validationAction: item.options?.validationAction || 'error',
    }]))
  } finally { await client.close() }
}

export async function assertValidatorsRestored(uri, databaseName, before) {
  const after = await snapshotValidators(uri, databaseName)
  for (const [name, expected] of Object.entries(before)) {
    if (!after[name]) throw new Error(`Collection removed before cleanup: ${name}`)
    if (JSON.stringify(after[name]) !== JSON.stringify(expected)) throw new Error(`Validator not restored for ${name}`)
  }
  const defaultValidation = { validator: {}, validationLevel: 'strict', validationAction: 'error' }
  for (const [name, actual] of Object.entries(after)) {
    if (!before[name] && JSON.stringify(actual) !== JSON.stringify(defaultValidation)) {
      throw new Error(`New collection retained a non-default validator: ${name}`)
    }
  }
}

export async function dropAndVerifyDatabase(uri, databaseName, options = {}) {
  if (!TEST_DB_PATTERN.test(databaseName)) throw new Error(`Refusing to drop unsafe database: ${databaseName}`)
  if (options.simulateFailure) throw new Error('Simulated cleanup failure')
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2_000 })
  await client.connect()
  try {
    await client.db(databaseName).dropDatabase()
    const names = (await client.db('admin').admin().listDatabases({ nameOnly: true })).databases.map((item) => item.name)
    if (names.includes(databaseName)) throw new Error(`Disposable database still exists after drop: ${databaseName}`)
  } finally { await client.close() }
  return { databaseDropped: true, verifiedAbsent: true }
}

export async function stopInfrastructure(infrastructure) {
  const errors = []
  try { await stopChild(infrastructure.next?.child) } catch (error) { errors.push(error) }
  try {
    if (infrastructure.next?.disposableNext) {
      await removeDisposableNextDirectory(
        infrastructure.next.disposableNext.tempRoot,
        infrastructure.next.disposableNext.distPath,
      )
    }
  } catch (error) { errors.push(error) }
  // Custom dbPath cleanup is owned by the guarded deletion below. Asking
  // mongodb-memory-server to delete a caller-supplied path fails closed by
  // design, so stop the process first and then remove our exact random path.
  try { if (infrastructure.mongo?.server) await infrastructure.mongo.server.stop({ doCleanup: false, force: true }) } catch (error) { errors.push(error) }
  try {
    if (infrastructure.mongo?.dbPath) {
      await removeDisposableMongoDirectory(infrastructure.mongo.tempRoot, infrastructure.mongo.dbPath)
    }
  } catch (error) { errors.push(error) }
  if (errors.length) throw new AggregateError(errors, 'Infrastructure cleanup failed')
}
