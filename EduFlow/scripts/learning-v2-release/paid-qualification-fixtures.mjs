import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { paidBlocked, deepFreeze, exactInput } from '../../lib/server/learning-v2/tutor/evaluation/paid-execution-contract.js'
import { paidProtectionLayout } from '../../lib/server/learning-v2/tutor/evaluation/paid-execution-protection.js'
import { qualificationMatrix } from './qualification/matrix.mjs'

// This durable ledger is exclusively a synthetic test authority. No real collector/resolver
// or protected coordinator store is configured. There is deliberately no reset/delete API.
const ledger = path.join(tmpdir(), 'eduflow-paid-qualification-test-ledger-v1')
const capabilities = new WeakMap(), registered = new Set()
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const keyFor = root => digest(process.platform === 'win32' ? root.toLowerCase() : root)
const guardBytes = Buffer.from('EDUFLOW_PAID_NAMESPACE_GUARD_V1\n')
function testScope(root, runId) {
  if (process.env.NODE_ENV !== 'test' || !path.isAbsolute(root) || path.dirname(path.resolve(root)) !== path.resolve(tmpdir())
    || !path.basename(root).startsWith('paid-execution-test-') || !/^test-paid-[a-z0-9-]+$/.test(runId)) throw paidBlocked('OPERATIONS_NOT_READY')
}
async function object(ref, file = false) {
  const s = await fs.lstat(ref)
  if (s.isSymbolicLink() || (file ? !s.isFile() : !s.isDirectory()) || path.resolve(await fs.realpath(ref)) !== ref) throw paidBlocked('OPERATIONS_NOT_READY')
  return { path: ref, device: String(s.dev), object: String(s.ino) }
}
async function snapshot(root, runId) {
  const layout = paidProtectionLayout(runId), result = []
  for (const ref of layout.directories) {
    const p = path.join(root, ref)
    const allowed = [...layout.directories, ...layout.guards].filter(r => r && path.posix.dirname(r) === (ref || '.')).map(r => path.posix.basename(r))
    const entries = (await fs.readdir(p)).sort()
    if (!isDeepStrictEqual(entries, allowed.sort())) throw paidBlocked('OPERATIONS_NOT_READY')
    result.push({ ...await object(p), entries })
  }
  for (const ref of layout.guards) {
    const p = path.join(root, ref), bytes = await fs.readFile(p)
    if (!bytes.equals(guardBytes)) throw paidBlocked('OPERATIONS_NOT_READY')
    result.push({ ...await object(p, true), digest: digest(bytes) })
  }
  const outside = root + '-outside-probe'
  if ((await fs.readdir(outside)).length) throw paidBlocked('OPERATIONS_NOT_READY')
  result.push(await object(outside))
  return result
}
async function read(name) {
  await object(ledger)
  const p = path.join(ledger, name); await object(p, true)
  return fs.readFile(p)
}
async function exclusive(name, bytes) {
  await object(ledger)
  let h
  try {
    h = await fs.open(path.join(ledger, name), 'wx', 0o600)
    await h.writeFile(bytes); await h.sync(); await h.close(); h = null
    if (!(await read(name)).equals(bytes)) throw paidBlocked('ARTIFACT_READBACK_FAILURE')
  } catch { throw paidBlocked('OPERATIONS_NOT_READY') }
  finally { await h?.close() }
}
export async function registerInternalQualificationFixtureTest(args) {
  exactInput(args, ['root', 'runId'])
  const root = path.resolve(args.root), runId = args.runId; testScope(root, runId)
  // The caller cannot select a new ledger to recycle a previously used fixture path.
  await fs.mkdir(ledger, { recursive: true }); const ledgerIdentity = await object(ledger)
  const key = keyFor(root)
  if (registered.has(key)) throw paidBlocked('OPERATIONS_NOT_READY')
  // Registration itself is create-once: even an invalid initial slot/namespace or
  // a crash while collecting its binding cannot be cleaned up and re-enrolled.
  await exclusive(`${key}.registered.json`, Buffer.from(JSON.stringify({ root, runId, state: 'REGISTERED', paid_authority: false })))
  registered.add(key)
  const expected = deepFreeze({ version: 'paid-qualification-fixture-test-v1', root, runId,
    scope: 'SYNTHETIC_TEST_ONLY', objects: await snapshot(root, runId), ledgerIdentity })
  const bytes = Buffer.from(JSON.stringify(expected))
  // Existing registration is a non-recyclable/ambiguous fixture, including after restart.
  await exclusive(`${key}.binding.json`, bytes)
  const capability = Object.freeze({})
  capabilities.set(capability, { expected, key, bytes, consumed: false })
  return capability
}
export async function consumeQualificationFixture({ root, runId, attackIndex, fixtureAuthority }) {
  testScope(root, runId)
  const record = capabilities.get(fixtureAuthority)
  if (!record || record.consumed || record.expected.root !== path.resolve(root) || record.expected.runId !== runId
    || !Number.isSafeInteger(attackIndex) || attackIndex < 0 || attackIndex >= qualificationMatrix({ runId }).length) throw paidBlocked('OPERATIONS_NOT_READY')
  if (!(await read(`${record.key}.binding.json`)).equals(record.bytes)
    || !isDeepStrictEqual(await object(ledger), record.expected.ledgerIdentity)) throw paidBlocked('OPERATIONS_NOT_READY')
  // Consume before any subprocess/barrier/attacker. A failed or torn write remains blocking.
  record.consumed = true
  const bytes = Buffer.from(JSON.stringify({ fixture: record.key, binding: digest(record.bytes), attackIndex, state: 'CONSUMED', paid_authority: false }))
  await exclusive(`${record.key}.consumed.json`, bytes)
  // Failed freshness checks are also permanently consumed; deleting a slot/mutation
  // marker or restoring guard bytes cannot turn an observed invalid fixture into a new one.
  if (!isDeepStrictEqual(await snapshot(root, runId), record.expected.objects)) throw paidBlocked('OPERATIONS_NOT_READY')
  return { fixture: record.key, binding: digest(record.bytes), attackIndex }
}
export async function validateConsumedQualificationBarrier(root, runId, ticket) {
  testScope(root, runId)
  const key = keyFor(path.resolve(root))
  if (!ticket || ticket.fixture !== key) throw paidBlocked('OPERATIONS_NOT_READY')
  const bytes = await read(`${key}.binding.json`), expected = JSON.parse(bytes)
  const consumed = JSON.parse(await read(`${key}.consumed.json`))
  if (ticket.binding !== digest(bytes) || consumed.binding !== ticket.binding || consumed.fixture !== key
    || consumed.attackIndex !== ticket.attackIndex || consumed.state !== 'CONSUMED' || consumed.paid_authority !== false
    || expected.root !== root || expected.runId !== runId || expected.scope !== 'SYNTHETIC_TEST_ONLY'
    || !isDeepStrictEqual(await object(ledger), expected.ledgerIdentity)
    || !isDeepStrictEqual(await snapshot(root, runId), expected.objects)) throw paidBlocked('OPERATIONS_NOT_READY')
  // A second worker cannot reopen the same barrier even if the test slot was removed.
  await exclusive(`${key}.barrier.json`, Buffer.from(JSON.stringify(ticket)))
}
