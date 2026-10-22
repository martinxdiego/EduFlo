import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { isDeepStrictEqual } from 'node:util'
import { assertPaidNonProduction, paidBlocked, paidPaths, paidFileHash, exactInput, deepFreeze } from './paid-execution-contract.js'

export const PAID_PROTECTION_VERSION = 'tutor-paid-windows-protection-v1'
export const PAID_NAMESPACE_GUARD = '.namespace-guard'
const guardBytes = Buffer.from('EDUFLOW_PAID_NAMESPACE_GUARD_V1\n', 'ascii')
const profiles = new Map()
export const PAID_PROTECTION_CLASSIFICATIONS = deepFreeze({
  code_and_tuple: 'TECHNICALLY_PROVABLE', root_profile_owner_rights_ancestors: 'TECHNICALLY_PROVABLE',
  durability_qualification: 'TECHNICALLY_PROVABLE', operator_proofs: 'TRUSTED_OPERATOR_ATTESTATION',
  filesystem_clock_capacity_credentials: 'EXECUTION_TIME_CHECK', token_guards_code_evidence_currentness: 'EXECUTION_TIME_CHECK',
})
const key = (root, runId) => `${path.resolve(root)}\0${runId}`
export function paidProtectionLayout(runId) {
  const refs = paidPaths(runId)
  const directories = ['', 'docs', 'docs/evaluation-results', 'docs/evaluation-results/execution-checkpoints',
    refs.checkpoints, 'docs/evaluation-results/human-review', path.posix.dirname(refs.packet)]
  return deepFreeze({ directories, guards: [directories[2], directories[4], directories[6]].map(p => `${p}/${PAID_NAMESPACE_GUARD}`) })
}

export function paidProtectionInventory(runIds) {
  const inventory = new Map()
  const add = (directory, name) => {
    if (!inventory.has(directory)) inventory.set(directory, new Set())
    inventory.get(directory).add(name)
  }
  for (const runId of runIds) {
    const refs = paidPaths(runId), layout = paidProtectionLayout(runId)
    for (const directory of layout.directories.slice(2)) {
      if (!inventory.has(directory)) inventory.set(directory, new Set())
      if (directory !== 'docs/evaluation-results') add(path.posix.dirname(directory), path.posix.basename(directory))
    }
    for (const ref of [...Object.values(refs).filter(v => v !== refs.checkpoints), ...layout.guards]) add(path.posix.dirname(ref), path.posix.basename(ref))
    for (let n = 1; n <= 120; n++) for (const stage of ['prepared', 'settled']) add(refs.checkpoints, `${String(n).padStart(3, '0')}.${stage}.json`)
    for (const name of ['result.prepared.json', 'result.verified.json', 'review-material.prepared.json', 'review-material.settled.json']) add(refs.checkpoints, name)
  }
  return inventory
}

// No production collector is installed. No path, boolean, JSON, or environment flag can register one.
// A later reviewed OS integration must establish actual token/access/device and qualification facts.
export function collectPaidWindowsProtectionEvidence() {
  assertPaidNonProduction()
  return deepFreeze({ status: 'BLOCKED', reason_code: 'OPERATIONS_NOT_READY',
    collector_status: 'TRUSTED_WINDOWS_COLLECTOR_NOT_CONFIGURED', actual_platform_qualification: 'NOT_PERFORMED' })
}
async function identities(root, layout) {
  return Promise.all([...layout.directories, ...layout.guards].map(async ref => {
    const target = path.join(root, ref), s = await fs.lstat(target)
    const guard = layout.guards.includes(ref)
    if (s.isSymbolicLink() || (guard ? !s.isFile() : !s.isDirectory())
      || path.resolve(await fs.realpath(target)) !== target) throw paidBlocked('OPERATIONS_NOT_READY')
    if (guard && !(await fs.readFile(target)).equals(guardBytes)) throw paidBlocked('OPERATIONS_NOT_READY')
    return { ref, device: String(s.dev), object: String(s.ino), guard_digest: guard ? paidFileHash(guardBytes) : null }
  }))
}

// Test provisioning is explicitly separate from repository execution. It does not change Windows ACLs.
// The private registration cannot issue actual platform PASS or authorize a real namespace.
export async function provisionInternalPaidProtectionTest(args) {
  exactInput(args, ['repositoryRoot', 'runId', ...(Object.hasOwn(args, 'retainedRunIds') ? ['retainedRunIds'] : [])])
  assertPaidNonProduction()
  const root = path.resolve(args.repositoryRoot)
  if (process.env.NODE_ENV !== 'test' || !/^test-paid-[a-z0-9-]+$/.test(args.runId)
    || path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('paid-execution-test-')
    || profiles.has(key(root, args.runId)) || (await fs.readdir(root)).length) throw paidBlocked('OPERATIONS_NOT_READY')
  const retained = args.retainedRunIds || []
  if (!Array.isArray(retained) || retained.length > 32 || retained.some(id => !/^test-paid-[a-z0-9-]+$/.test(id))
    || new Set([args.runId, ...retained]).size !== retained.length + 1) throw paidBlocked('OPERATIONS_NOT_READY')
  const runIds = [args.runId, ...retained]
  const layouts = runIds.map(paidProtectionLayout)
  const layout = deepFreeze({ directories: [...new Set(layouts.flatMap(l => l.directories))], guards: [...new Set(layouts.flatMap(l => l.guards))] })
  for (const ref of layout.directories.slice(1)) await fs.mkdir(path.join(root, ref), { recursive: true })
  for (const ref of layout.guards) await fs.writeFile(path.join(root, ref), guardBytes, { flag: 'wx' })
  const objectIds = await identities(root, layout)
  const evidence = deepFreeze({ version: PAID_PROTECTION_VERSION, scope: 'SYNTHETIC_TEST_ONLY', root,
    run_id: args.runId, filesystem: 'SYNTHETIC', volume: objectIds[0].device, device_binding: 'test-paid-device',
    objects: objectIds, owner: 'test-paid-provisioner', effective_mutation_rights: [], inherited_mutation_rights: [],
    execution_identity: 'test-paid-runner', provisioning_identity: 'test-paid-provisioner',
    token_privileges: [], reparse_objects: [], revision: 'a'.repeat(40), code_profile: 'test-paid-sealed-code',
    configuration_profile: 'test-paid-sealed-config', operator_evidence_ref: 'test-paid-protected-authoritative-branch-attested',
    namespace_qualification: 'SYNTHETIC_TEST_ONLY', durability: {
      exclusive_create: 'SYNTHETIC_TEST_ONLY', write: 'SYNTHETIC_TEST_ONLY', flush: 'SYNTHETIC_TEST_ONLY',
      close: 'SYNTHETIC_TEST_ONLY', readback: 'SYNTHETIC_TEST_ONLY', namespace_persistence: 'SYNTHETIC_TEST_ONLY',
      reservation_no_replay: 'SYNTHETIC_TEST_ONLY' },
    external_properties_technically_proven: false, actual_platform_qualification: 'NOT_PERFORMED' })
  const record = { root, layout, inventory: paidProtectionInventory(runIds), expected: evidence, current: structuredClone(evidence) }
  profiles.set(key(root, args.runId), record)
  return Object.freeze({
    // Adversarial testing changes observations, never the private expected policy.
    alterObservation(field, value) {
      if (process.env.NODE_ENV !== 'test' || !Object.hasOwn(record.current, field)) throw paidBlocked('OPERATIONS_NOT_READY')
      record.current[field] = structuredClone(value)
    },
    forget() { if (process.env.NODE_ENV !== 'test') throw paidBlocked(); profiles.delete(key(root, args.runId)) },
  })
}
export async function verifyPaidProtection(root, runId, evidenceRef = null) {
  assertPaidNonProduction()
  const record = typeof root === 'string' ? profiles.get(key(root, runId)) : null
  if (!record || process.env.NODE_ENV !== 'test' || !/^test-paid-/.test(runId)) throw paidBlocked('OPERATIONS_NOT_READY')
  if (!isDeepStrictEqual(record.current, record.expected) || (evidenceRef !== null && evidenceRef !== record.expected.operator_evidence_ref)) {
    throw paidBlocked('OPERATIONS_NOT_READY')
  }
  try {
    if (!isDeepStrictEqual(await identities(record.root, record.layout), record.expected.objects)) throw paidBlocked('OPERATIONS_NOT_READY')
    for (const [directory, allowed] of record.inventory) {
      for (const entry of await fs.readdir(path.join(record.root, directory), { withFileTypes: true })) {
        const isDirectory = record.layout.directories.includes(`${directory}/${entry.name}`)
        if (!allowed.has(entry.name) || entry.isSymbolicLink() || (isDirectory ? !entry.isDirectory() : !entry.isFile())) throw paidBlocked('OPERATIONS_NOT_READY')
      }
    }
  } catch { throw paidBlocked('OPERATIONS_NOT_READY') }
  return deepFreeze({ status: 'READY_PROVIDER_FREE_TEST_ONLY', classifications: PAID_PROTECTION_CLASSIFICATIONS,
    actual_platform_qualification: 'NOT_PERFORMED', external_properties_technically_proven: false })
}
