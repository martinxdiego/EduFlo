import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspectStagingObservation, stagingTargetSchema } from '../scripts/verify-atlas-staging.mjs'

function fixture() {
  const target = {
    project_id: 'a'.repeat(24), cluster_name: 'synthetic-fixture',
    database_name: 'eduflow_learning_v2_test_stg_fixture',
    srv_hostname: 'synthetic.fixture.mongodb.net', replica_set: 'fixture-rs',
    hosts: ['a.fixture.mongodb.net:27017', 'b.fixture.mongodb.net:27017'],
    principal: { user: 'synthetic-fixture', db: 'admin' },
  }
  return {
    target,
    hello: { setName: target.replica_set, hosts: [...target.hosts].reverse(), isWritablePrimary: true, logicalSessionTimeoutMinutes: 30 },
    connection: { authInfo: {
      authenticatedUsers: [target.principal],
      authenticatedUserRoles: [{ role: 'readWrite', db: target.database_name }],
      authenticatedUserPrivileges: [{ resource: { db: target.database_name, collection: '' }, actions: ['find', 'insert'] }],
    } },
  }
}

test('accepts an isolated synthetic identity and emits no connection credentials', () => {
  const f = fixture()
  const result = inspectStagingObservation(f.target, f.hello, f.connection)
  assert.equal(result.database.name, f.target.database_name)
  assert.match(result.database.privileges_digest, /^sha256:[a-f0-9]{64}$/)
  assert.equal(JSON.stringify(result).includes('password'), false)
  assert.equal(JSON.stringify(result).includes('mongodb+srv'), false)
})

test('rejects production names, the former overlong name, and foreign endpoints', () => {
  const { target } = fixture()
  for (const patch of [
    { database_name: 'production' },
    { database_name: 'eduflow_learning_v2_test_staging_20261021' },
    { srv_hostname: 'example.com' },
  ]) assert.equal(stagingTargetSchema.safeParse({ ...target, ...patch }).success, false)
})

test('rejects wrong topology, identity, broader roles and privileges', () => {
  const cases = [
    (f) => { f.hello.hosts = ['foreign.fixture.mongodb.net:27017'] },
    (f) => { f.hello.isWritablePrimary = false },
    (f) => { f.connection.authInfo.authenticatedUsers = [{ user: 'administrator', db: 'admin' }] },
    (f) => { f.connection.authInfo.authenticatedUserRoles = [{ role: 'atlasAdmin', db: 'admin' }] },
    (f) => { f.connection.authInfo.authenticatedUserPrivileges.push({ resource: { db: 'production', collection: '' }, actions: ['find'] }) },
    (f) => { f.connection.authInfo.authenticatedUserPrivileges.push({ resource: { cluster: true }, actions: ['serverStatus'] }) },
  ]
  for (const modify of cases) {
    const f = fixture()
    modify(f)
    assert.throws(() => inspectStagingObservation(f.target, f.hello, f.connection), /STAGING_/)
  }
})

test('CLI refuses a blank password before connecting and never loads app environment secrets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'eduflow-atlas-preflight-'))
  try {
    const target = join(directory, 'target.json')
    const password = join(directory, 'password.json')
    const output = join(directory, 'observation.json')
    await writeFile(target, JSON.stringify(fixture().target))
    await writeFile(password, JSON.stringify({ password: '' }), { mode: 0o600 })
    const result = spawnSync(process.execPath, ['scripts/verify-atlas-staging.mjs', target, password, output], {
      cwd: new URL('..', import.meta.url), encoding: 'utf8',
      env: { ...process.env, MONGO_URL: 'SYNTHETIC_SECRET_SENTINEL', DB_NAME: 'production' },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /STAGING_PASSWORD_MISSING/)
    assert.equal((result.stdout + result.stderr).includes('SYNTHETIC_SECRET_SENTINEL'), false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
