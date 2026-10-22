import fs from 'node:fs/promises'
import path from 'node:path'
import { fork, execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { assertPaidNonProduction, paidBlocked, paidPaths } from '../../lib/server/learning-v2/tutor/evaluation/paid-execution-contract.js'
import { consumeQualificationFixture, validateConsumedQualificationBarrier } from './paid-qualification-fixtures.mjs'
import { qualificationMatrix } from './qualification/matrix.mjs'

const self = fileURLToPath(import.meta.url), exec = promisify(execFile)
export function paidQualificationAttackPlan(runId) {
  return qualificationMatrix({ runId })
}
function fixture(root, runId) {
  assertPaidNonProduction(); paidQualificationAttackPlan(runId)
  if (!path.isAbsolute(root) || !path.basename(root).startsWith('paid-execution-test-')) throw paidBlocked('OPERATIONS_NOT_READY')
  return path.resolve(root)
}
function message(child, wanted) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('BARRIER_TIMEOUT')), 15000)
    const onMessage = v => { if (v.event === wanted) finish(null, v); else if (v.event === 'ERROR') finish(new Error(v.code)) }
    const onExit = () => finish(new Error('WORKER_EXIT'))
    const onError = error => finish(error)
    function finish(error, value) { clearTimeout(timer); child.off('message', onMessage); child.off('exit', onExit); child.off('error', onError); error ? reject(error) : resolve(value) }
    child.on('message', onMessage); child.on('exit', onExit); child.on('error', onError)
  })
}

// An observations harness, not a provisioning tool or an authorization/qualification signer.
// Start this process under the designated restricted test identity after separate provisioning.
// Its child inherits that actual token; repeat under representative untrusted identities.
export async function runPaidWindowsQualification({ root, runId, attackIndex = 0 }) {
  fixture(root, runId)
  if (!Number.isSafeInteger(attackIndex) || !paidQualificationAttackPlan(runId)[attackIndex]) throw paidBlocked('OPERATIONS_NOT_READY')
  // No trusted real fixture resolver/protected consumption store is installed. A path
  // or synthetic test capability cannot unlock the Windows attack subprocess.
  return { status: 'BLOCKED', actual_platform_qualification: 'NOT_PERFORMED', provider_calls: 0,
    reason: 'TRUSTED_QUALIFICATION_FIXTURE_RESOLVER_NOT_CONFIGURED', paid_authorization: false }
}
export async function runInternalPaidQualificationTest({ root, runId, attackIndex = 0, fixtureAuthority, attack,
  afterConsumption = null, onBarrier = null }) {
  if (process.env.NODE_ENV !== 'test' || typeof attack !== 'function'
    || (afterConsumption !== null && typeof afterConsumption !== 'function') || (onBarrier !== null && typeof onBarrier !== 'function')) throw paidBlocked('OPERATIONS_NOT_READY')
  return runQualification({ root, runId, attackIndex, fixtureAuthority }, attack, afterConsumption, onBarrier)
}
// Retained bounded Windows adapter, unreachable until a separately reviewed real resolver exists.
async function windowsAttack(item, root, runId) {
  const worker = path.join(path.dirname(self), 'paid-windows-qualification-worker.ps1')
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', worker,
    '-Root', root, '-RunId', runId, '-ParentRef', item.parent || '.', '-Action', item.action], { windowsHide: true, timeout: 15000, maxBuffer: 8192 })
  return JSON.parse(stdout.trim())
}
async function runQualification({ root, runId, attackIndex, fixtureAuthority }, attackRunner, afterConsumption, onBarrier) {
  root = fixture(root, runId)
  const observations = []
  const plan = paidQualificationAttackPlan(runId)
  if (!Number.isSafeInteger(attackIndex) || !plan[attackIndex]) throw paidBlocked('OPERATIONS_NOT_READY')
  const ticket = await consumeQualificationFixture({ root, runId, attackIndex, fixtureAuthority })
  if (afterConsumption) await afterConsumption()
  // Each indexed case consumes a fresh separately provisioned fixture. Never reset security after an attack.
  for (const item of plan.slice(attackIndex, attackIndex + 1)) {
    const child = fork(self, ['--worker', root, runId], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true })
    try {
      const validated = message(child, 'PARENT_VALIDATED'); child.send({ command: 'VALIDATE', ticket }); await validated
      if (onBarrier) await onBarrier({ workerPid: child.pid })
      const attack = await attackRunner(item, root, runId); observations.push({ ...item, ...attack })
      // Never continue the create after a successful mutation or unsupported/ambiguous attack.
      if (attack.outcome !== 'DENIED') break
      const created = message(child, 'CREATED'); child.send({ command: 'CREATE' }); await created
      // A create-once test slot is intentionally not recycled. A fresh fixture is required per successful create.
      break
    } finally {
      if (child.exitCode === null && child.signalCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited }
    }
  }
  return { status: 'BLOCKED', observations, actual_platform_qualification: 'NOT_PERFORMED',
    outside_root_mutations: null, reason: 'INDEPENDENT_TOKEN_DEVICE_TRACE_DURABILITY_QUALIFICATION_REQUIRED',
    trace_requirement: 'Independently collected filesystem trace must cover transient and zero-byte mutations; snapshots alone cannot attest zero.',
    paid_authorization: false, provider_calls: 0 }
}

if (process.argv[2] === '--worker') {
  const root = fixture(process.argv[3], process.argv[4]), refs = paidPaths(process.argv[4])
  const target = path.join(root, refs.checkpoints, '001.prepared.json')
  let state = 'INITIAL'
  process.on('message', async value => {
    try {
      if (value.command === 'VALIDATE' && state === 'INITIAL') {
        state = 'VALIDATING'
        await validateConsumedQualificationBarrier(root, process.argv[4], value.ticket)
        const parent = path.dirname(target), st = await fs.lstat(parent)
        if (!st.isDirectory() || st.isSymbolicLink() || path.resolve(await fs.realpath(parent)) !== parent) throw paidBlocked()
        state = 'VALIDATED'; process.send({ event: 'PARENT_VALIDATED' })
      } else if (value.command === 'CREATE' && state === 'VALIDATED') {
        state = 'CONSUMED'
        const h = await fs.open(target, 'wx')
        try { await h.writeFile('SYNTHETIC QUALIFICATION ONLY\n'); await h.sync() } finally { await h.close() }
        await fs.readFile(target); process.send({ event: 'CREATED' })
      } else throw paidBlocked()
    } catch (e) { state = 'BLOCKED'; process.send({ event: 'ERROR', code: e.code || 'BLOCKED' }) }
  })
} else if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  if (process.argv[2] === '--plan') {
    console.log(JSON.stringify({ attacks: paidQualificationAttackPlan(process.argv[3]), actual_platform_qualification: 'NOT_PERFORMED', provider_calls: 0 }))
  } else if (process.argv[2] === '--execute-disposable') {
    console.log(JSON.stringify(await runPaidWindowsQualification({ root: process.argv[3], runId: process.argv[4], attackIndex: Number(process.argv[5]) })))
  } else console.log(JSON.stringify({ status: 'BLOCKED', actual_platform_qualification: 'NOT_PERFORMED', provider_calls: 0 }))
}
