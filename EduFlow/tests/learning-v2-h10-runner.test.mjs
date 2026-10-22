import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { once } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import { RELEASE_PROFILES } from '../scripts/learning-v2-release/manifest-v1.mjs'
import { PUBLIC_V2_ROUTES, routeMethodCount } from '../scripts/learning-v2-release/routes-v1.mjs'
import { assertPublicV2RouteManifest } from '../scripts/learning-v2-release/route-discovery.mjs'
import {
  assertAllowedTestEndpoint, assertExactCounts, createDisposableNextDirectory, dropAndVerifyDatabase,
  guardedDatabaseName, removeDisposableNextDirectory, resolveStandaloneServer, runNodeTestStep, syntheticEnvironment, TEST_DB_PATTERN,
  verifyReleaseHandshake,
} from '../scripts/learning-v2-release/runner-core.mjs'
import { paidEvaluationReadiness } from '../lib/server/learning-v2/tutor/evaluation/evaluation-manifest.js'

const projectRoot = path.resolve(import.meta.dirname, '..')

test('H10 route manifest exactly covers all 35 public V2 method contracts', async () => {
  const result = await assertPublicV2RouteManifest(projectRoot, PUBLIC_V2_ROUTES)
  assert.equal(result.discovered.length, 30)
  assert.equal(routeMethodCount(), 35)
})

test('H10 route discovery rejects a new unmanifested public V2 route', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eduflow-h10-route-'))
  try {
    const directory = path.join(root, 'app', 'api', 'v2', 'unknown')
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, 'route.js'), 'export async function GET() {}\n')
    await assert.rejects(assertPublicV2RouteManifest(root, []), { code: 'H10_ROUTE_MANIFEST_MISMATCH' })
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('H10 exact required counts accept only the frozen no-skip result', () => {
  assert.equal(assertExactCounts({ tests: 3, pass: 3, fail: 0, skipped: 0 }, { tests: 3, pass: 3, fail: 0, skipped: 0 }), true)
})

test('H10 skip-only required result fails closed instead of reporting PASS', () => {
  assert.throws(() => assertExactCounts({ tests: 1, pass: 0, fail: 0, skipped: 1 }, { tests: 1, pass: 0, fail: 0, skipped: 1 }), /zero checks|unexpected skips/)
})

test('H10 wrong frozen count fails closed', () => {
  assert.throws(() => assertExactCounts({ tests: 2, pass: 2, fail: 0, skipped: 0 }, { tests: 3, pass: 3, fail: 0, skipped: 0 }), /Exact count mismatch/)
})

test('H10 missing required gate is rejected before the test process starts', async () => {
  await assert.rejects(runNodeTestStep(projectRoot, {
    id: 'missing-gate', gate: 'RUN_INTEGRATION_TESTS', files: [], expected: { tests: 1, pass: 1, fail: 0, skipped: 0 },
  }, { ...process.env, RUN_INTEGRATION_TESTS: '0' }), /Missing required gate/)
})

test('H10 failed child test cannot be converted into a passing profile', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eduflow-h10-failure-'))
  try {
    await writeFile(path.join(root, 'failure.test.mjs'), "import test from 'node:test'; import assert from 'node:assert/strict'; test('fails',()=>assert.fail('synthetic'));\n")
    await assert.rejects(runNodeTestStep(root, {
      id: 'synthetic-failure', files: ['failure.test.mjs'], expected: { tests: 1, pass: 1, fail: 0, skipped: 0 },
    }, process.env), /exited 1/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('H10 guarded database identity rejects malformed and foreign names', () => {
  assert.match(guardedDatabaseName('phase3b', '012345abcdef'), TEST_DB_PATTERN)
  assert.ok(guardedDatabaseName('production-all-requested-on', '012345abcdef').length <= 63)
  assert.throws(() => guardedDatabaseName('phase3b', 'not-a-valid-nonce'), /Unsafe disposable database name/)
  assert.equal(TEST_DB_PATTERN.test('eduflow'), false)
})

test('H10 endpoint allowlist rejects non-loopback HTTP and Mongo targets', () => {
  assert.doesNotThrow(() => assertAllowedTestEndpoint('http://127.0.0.1:3000', 'http:'))
  assert.doesNotThrow(() => assertAllowedTestEndpoint('mongodb://localhost:27017', 'mongodb:'))
  assert.throws(() => assertAllowedTestEndpoint('https://example.com', 'http:'), /not explicitly allowed/)
  assert.throws(() => assertAllowedTestEndpoint('mongodb://db.example.com:27017', 'mongodb:'), /not explicitly allowed/)
})

test('H10 handshake rejects a foreign server even when it returns plausible JSON', async () => {
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ profile_id: 'foreign', manifest_version: 'foreign', synthetic: true, flags: {}, database: { name: 'foreign' } }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  try {
    await assert.rejects(verifyReleaseHandshake(baseUrl, {
      token: 'a'.repeat(48), profileId: 'phase2', manifestVersion: 'v1', databaseName: guardedDatabaseName('phase2', '012345abcdef'), capabilities: {},
    }, { timeoutMs: 300 }), /Release handshake failed/)
  } finally { await new Promise((resolve) => server.close(resolve)) }
})

test('H10 failed database cleanup is a release failure and never targets a broad name', async () => {
  const databaseName = guardedDatabaseName('cleanup', '012345abcdef')
  await assert.rejects(dropAndVerifyDatabase('mongodb://127.0.0.1:27017', databaseName, { simulateFailure: true }), /Simulated cleanup failure/)
  await assert.rejects(dropAndVerifyDatabase('mongodb://127.0.0.1:27017', 'eduflow', { simulateFailure: true }), /Refusing to drop unsafe database/)
})

test('H10 gives every development server a unique guarded Next compiler directory and removes only its owned path', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eduflow-h10-next-root-'))
  try {
    const first = await createDisposableNextDirectory(root)
    const second = await createDisposableNextDirectory(root)
    assert.notEqual(first.distPath, second.distPath)
    assert.match(first.relativeDistDir, /^\.eduflow-release-next\/next-[a-f0-9]{24}$/)
    await assert.rejects(removeDisposableNextDirectory(first.tempRoot, root), /Refusing unsafe/)
    await removeDisposableNextDirectory(first.tempRoot, first.distPath)
    await removeDisposableNextDirectory(second.tempRoot, second.distPath)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('H10 resolves the traced standalone app entry and rejects invalid or missing build output', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eduflow-h10-standalone-'))
  const appRoot = path.join(root, 'EduFlow')
  const distRoot = path.join(appRoot, '.next')
  const manifestPath = path.join(distRoot, 'required-server-files.json')
  const standaloneRoot = path.join(distRoot, 'standalone')
  const writeManifest = (traceRoot, relativeAppDir, output = 'standalone') => writeFile(manifestPath, JSON.stringify({
    config: { output, outputFileTracingRoot: traceRoot }, relativeAppDir,
  }))
  try {
    for (const traceRoot of [appRoot, root]) {
      const relativeAppDir = path.relative(traceRoot, appRoot)
      const entry = path.join(standaloneRoot, relativeAppDir, 'server.js')
      await mkdir(path.dirname(entry), { recursive: true })
      await writeFile(entry, '// synthetic server entry\n')
      await writeManifest(traceRoot, relativeAppDir)
      assert.equal(await resolveStandaloneServer(appRoot), entry)
    }
    const tracedEntry = path.join(standaloneRoot, 'EduFlow', 'server.js')
    await rm(tracedEntry)
    // The old top-level entry still exists: missing traced output must not fall back to it.
    await assert.rejects(resolveStandaloneServer(appRoot), { code: 'ENOENT' })
    await writeManifest(root, '../outside')
    await assert.rejects(resolveStandaloneServer(appRoot), /Invalid Next standalone build manifest/)
    await writeManifest(root, 'EduFlow', 'export')
    await assert.rejects(resolveStandaloneServer(appRoot), /Invalid Next standalone build manifest/)
    await writeManifest(root, 'EduFlow')
    await symlink(path.join(standaloneRoot, 'server.js'), tracedEntry)
    await assert.rejects(resolveStandaloneServer(appRoot), /Invalid Next standalone server entry/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('H10 manifest keeps current security checks, required profiles and optional paid NOT-RUN semantics', async () => {
  const byId = new Map(RELEASE_PROFILES.map((profile) => [profile.id, profile]))
  const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'))
  const securityFiles = [...packageJson.scripts['test:security'].matchAll(/\btests\/[a-z0-9.-]+\.mjs\b/g)].map(([file]) => file)
  assert.ok(securityFiles.length > 0, 'the direct security script must register actual checks')
  assert.deepEqual(new Set(byId.get('unit-default').steps.find((step) => step.id === 'security-unit').files), new Set(securityFiles),
    'the required release must run every security check from test:security')
  for (const id of ['unit-default', 'mongo-invariants', 'phase2', 'phase3-baseline', 'phase3b', 'phase4', 'phase5', 'base-disabled', 'no-tutor', 'no-teacher', 'production-all-off', 'production-all-requested-on', 'unavailable-db', 'standalone-mongo']) {
    assert.equal(byId.get(id)?.required, true, id)
  }
  assert.notDeepEqual(byId.get('phase3-baseline').flags, byId.get('phase3b').flags)
  assert.equal(byId.get('paid-provider-evaluation').required, false)
  assert.equal(byId.get('paid-provider-evaluation').optInEnv, 'RUN_TUTOR_PROVIDER_EVALS')
  assert.equal(byId.get('paid-provider-evaluation').preflight, 'paid-tutor-governance')
  assert.equal(paidEvaluationReadiness({}).reasonCode, 'OPT_IN_REQUIRED')
  const paidBlocked = paidEvaluationReadiness({ NODE_ENV: 'test', RUN_TUTOR_PROVIDER_EVALS: '1', OPENAI_API_KEY: 'synthetic' })
  assert.equal(paidBlocked.status, 'BLOCKED')
  assert.equal(paidBlocked.reasonCode, 'PAID_EVALUATION_AUTHORIZATION_REQUIRED')
  assert.equal(paidBlocked.maximum_cost, 9.8304)
  const context = { token: 'a'.repeat(48), mongoUri: '', databaseName: '', baseUrl: '', manifestVersion: 'test' }
  for (const profile of RELEASE_PROFILES.filter((item) => item.required)) {
    const environment = syntheticEnvironment(profile, context, { LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '1', OPENAI_API_KEY: 'must-be-cleared', GOOGLE_API_KEY: 'must-be-cleared', GEMINI_API_KEY: 'must-be-cleared', RESEND_API_KEY: 'must-be-cleared', RUN_TUTOR_PROVIDER_EVALS: '1', RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE: '1', RUN_TUTOR_PROVIDER_EVAL_RUN_2: '1', RUN_TUTOR_PROVIDER_EVAL_V2_PROMPT_RUN_1: '1', RUN_TUTOR_PROVIDER_EVAL_V5_RUN_1: '1', RUN_TUTOR_PROVIDER_EVAL_V7_R1_R2_RUN_1: '1', RUN_TUTOR_PROVIDER_EVAL_V8_R1_R2_RUN_1: '1', EDUFLOW_RELEASE_NEXT_DIST_DIR: '../foreign' })
    assert.equal(environment.RUN_TUTOR_PROVIDER_EVALS, '0', profile.id)
    assert.equal(environment.LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED, '0', profile.id)
    assert.equal(environment.RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE, '0', profile.id)
    assert.equal(environment.RUN_TUTOR_PROVIDER_EVAL_RUN_2, '0', profile.id)
    assert.equal(environment.RUN_TUTOR_PROVIDER_EVAL_V2_PROMPT_RUN_1, '0', profile.id)
    assert.equal(environment.RUN_TUTOR_PROVIDER_EVAL_V5_RUN_1, '0', profile.id)
    assert.equal(environment.RUN_TUTOR_PROVIDER_EVAL_V7_R1_R2_RUN_1, '0', profile.id)
    assert.equal(environment.RUN_TUTOR_PROVIDER_EVAL_V8_R1_R2_RUN_1, '0', profile.id)
    assert.equal(environment.EDUFLOW_RELEASE_NEXT_DIST_DIR, '', profile.id)
    const withApprovalToken = syntheticEnvironment(profile, context, { EDUFLOW_STAGING_APPROVAL_READ_TOKEN: 'must-be-cleared', EDUFLOW_HOSTING_ACTIVATION_REQUIRED: 'true' })
    assert.equal(withApprovalToken.EDUFLOW_STAGING_APPROVAL_READ_TOKEN, undefined, profile.id)
    assert.equal(withApprovalToken.EDUFLOW_HOSTING_ACTIVATION_REQUIRED, undefined, profile.id)
    assert.equal(environment.OPENAI_API_KEY, '', profile.id)
    assert.equal(environment.GOOGLE_API_KEY, '', profile.id)
    assert.equal(environment.GEMINI_API_KEY, '', profile.id)
    assert.equal(environment.RESEND_API_KEY, '', profile.id)
  }
  assert.equal(byId.has('all-on-functional'), false)
})
