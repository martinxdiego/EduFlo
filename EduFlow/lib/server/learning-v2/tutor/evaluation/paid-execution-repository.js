import * as fs from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { verifyPaidProtection, PAID_NAMESPACE_GUARD } from './paid-execution-protection.js'
import { jcsUtf8Bytes } from './human-review-canonical.js'
import { assertPaidNonProduction, paidPaths, paidBlocked, paidFileHash, verifyPaidArtifact, verifyPaidArtifactBytes,
  exactInput } from './paid-execution-contract.js'

const phaseFiles = ['result.prepared.json', 'result.verified.json', 'review-material.prepared.json', 'review-material.settled.json']
const faultCapabilities = new WeakMap()
export function createInternalPaidFilesystemFault(inject) {
  if (process.env.NODE_ENV !== 'test' || typeof inject !== 'function') throw paidBlocked('OPERATIONS_NOT_READY')
  const token = Object.freeze({}); faultCapabilities.set(token, inject); return token
}
export function paidCheckpointName(index) {
  if (!Number.isInteger(index) || index < 1 || index > 244) throw paidBlocked('EXECUTION_DRIFT')
  if (index > 240) return phaseFiles[index - 241]
  return `${String(Math.ceil(index / 2)).padStart(3, '0')}.${index % 2 ? 'prepared' : 'settled'}.json`
}
export function createPaidRepository(args) {
  assertPaidNonProduction()
  exactInput(args, ['repositoryRoot', 'runId', 'faultCapability'])
  const { repositoryRoot, runId, faultCapability } = args
  if (typeof repositoryRoot !== 'string' || !path.isAbsolute(repositoryRoot)) throw paidBlocked('OPERATIONS_NOT_READY')
  const root = path.resolve(repositoryRoot), refs = paidPaths(runId)
  const inject = faultCapability == null ? null : faultCapabilities.get(faultCapability)
  if (faultCapability != null && (!inject || process.env.NODE_ENV !== 'test')) throw paidBlocked('OPERATIONS_NOT_READY')
  const allowed = new Set([...Object.values(refs).filter(v => v !== refs.checkpoints),
    ...Array.from({ length: 244 }, (_, i) => `${refs.checkpoints}/${paidCheckpointName(i + 1)}`)])
  const check = ref => { assertPaidNonProduction(); if (!allowed.has(ref)) throw paidBlocked('EXECUTION_DRIFT'); return path.join(root, ...ref.split('/')) }
  async function fault(stage, ref) { assertPaidNonProduction(); if (inject) { if (process.env.NODE_ENV !== 'test') throw paidBlocked(); await inject(stage, ref) } }
  const readiness = () => verifyPaidProtection(root, runId)
  async function directory(target) {
    const components = path.relative(root, target).split(path.sep).filter(Boolean)
    let current = root
    for (const part of [null, ...components]) {
      if (part !== null) current = path.join(current, part)
      const s = await fs.lstat(current).catch(() => { throw paidBlocked('OPERATIONS_NOT_READY') })
      if (s.isSymbolicLink() || !s.isDirectory() || path.resolve(await fs.realpath(current)) !== current) throw paidBlocked('OPERATIONS_NOT_READY')
    }
  }
  async function rawRead(ref, optional = false, parentAlreadyChecked = false) {
    const target = check(ref); let handle
    try {
      if (!parentAlreadyChecked) await readiness()
      if (!parentAlreadyChecked) await directory(path.dirname(target), false)
      const s = await fs.lstat(target)
      if (s.isSymbolicLink() || !s.isFile() || path.resolve(await fs.realpath(target)) !== target) throw paidBlocked('OPERATIONS_NOT_READY')
      if (s.size > 1048576) throw paidBlocked('ARTIFACT_READBACK_FAILURE')
      handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
      const opened = await handle.stat()
      if (!opened.isFile() || opened.ino !== s.ino || opened.dev !== s.dev) throw paidBlocked('ARTIFACT_READBACK_FAILURE')
      const bytes = await handle.readFile()
      if (!parentAlreadyChecked) await directory(path.dirname(target), false)
      if (path.resolve(await fs.realpath(target)) !== target) throw paidBlocked('OPERATIONS_NOT_READY')
      return { ref, bytes, sha256: paidFileHash(bytes) }
    } catch (e) {
      if (optional && e.code === 'ENOENT') return null
      throw e.code === 'BLOCKED' ? e : paidBlocked('ARTIFACT_READBACK_FAILURE')
    } finally { await handle?.close() }
  }
  async function read(ref, optional = false) {
    const a = await rawRead(ref, optional)
    return a ? { ...a, value: verifyPaidArtifactBytes(a.bytes) } : null
  }
  async function writeBytes(ref, bytes) {
    const target = check(ref); let handle, readingBack = false
    try {
      await fault('before-create', ref)
      await readiness()
      await directory(path.dirname(target))
      handle = await fs.open(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW || 0), 0o600)
      await directory(path.dirname(target), false)
      if (path.resolve(await fs.realpath(target)) !== target) throw paidBlocked('OPERATIONS_NOT_READY')
      await fault('after-create', ref)
      await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null
      // POSIX namespace durability. Windows durability requires the separately attested local filesystem policy.
      if (process.platform !== 'win32') { const dir = await fs.open(path.dirname(target), constants.O_RDONLY); try { await dir.sync() } finally { await dir.close() } }
      readingBack = true
      await fault('before-readback', ref)
      const a = await rawRead(ref)
      if (!a.bytes.equals(bytes)) throw paidBlocked('ARTIFACT_READBACK_FAILURE')
      return a
    } catch (e) {
      if (e.code === 'EEXIST') throw paidBlocked('CLAIM_CONFLICT')
      throw e.code === 'BLOCKED' ? e : paidBlocked(readingBack ? 'ARTIFACT_READBACK_FAILURE' : 'ARTIFACT_WRITE_FAILURE')
    } finally { await handle?.close().catch(() => {}) }
  }
  async function write(ref, value) {
    const v = verifyPaidArtifact(value)
    if (v.run_id !== runId) throw paidBlocked('EXECUTION_DRIFT')
    const fixed = { AUTHORIZATION: refs.authorization, OPERATIONS_ATTESTATION: refs.attestation, CLAIM: refs.claim, TERMINAL_RECORD: refs.execution }
    const expected = fixed[v.artifact_kind] || `${refs.checkpoints}/${paidCheckpointName(v.sequence)}`
    if (ref !== expected) throw paidBlocked('EXECUTION_DRIFT')
    const a = await writeBytes(ref, jcsUtf8Bytes(v))
    return { ...a, value: verifyPaidArtifactBytes(a.bytes) }
  }
  async function checkpointEntries() {
    assertPaidNonProduction()
    const dir = path.join(root, ...refs.checkpoints.split('/'))
    try {
      await readiness()
      await directory(dir, false)
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const e of entries) if (!e.isFile() || e.isSymbolicLink()
        || (e.name !== PAID_NAMESPACE_GUARD && !allowed.has(`${refs.checkpoints}/${e.name}`))) throw paidBlocked('EXECUTION_DRIFT')
      return entries.filter(e => e.name !== PAID_NAMESPACE_GUARD).map(e => e.name)
    } catch (e) { if (e.code === 'ENOENT') return []; throw e.code === 'BLOCKED' ? e : paidBlocked('ARTIFACT_READBACK_FAILURE') }
  }
  async function readCheckpoints() {
    const entries = await checkpointEntries(), artifacts = []
    if (!entries.length) return artifacts
    // Validate the common directory chain once on each side of the bounded scan;
    // every file still gets lstat, no-follow open, inode and realpath checks, bytes and digest verification.
    const dir = path.join(root, ...refs.checkpoints.split('/'))
    await directory(dir, false)
    for (let start = 0; start < entries.length; start += 16) {
      artifacts.push(...await Promise.all(entries.slice(start, start + 16).map(async name => {
        const a = await rawRead(`${refs.checkpoints}/${name}`, false, true)
        return { ...a, value: verifyPaidArtifactBytes(a.bytes) }
      })))
    }
    await directory(dir, false)
    return artifacts
  }
  async function scanCheckpoints() {
    const order = Array.from({ length: 244 }, (_, i) => paidCheckpointName(i + 1))
    const names = (await checkpointEntries()).sort((a, b) => {
      return order.indexOf(a) - order.indexOf(b)
    })
    const artifacts = []
    await readiness()
    for (let start = 0; start < names.length; start += 16) {
      const batch = await Promise.allSettled(names.slice(start, start + 16).map(async name => {
        const a = await rawRead(`${refs.checkpoints}/${name}`, false, true)
        return { ...a, value: verifyPaidArtifactBytes(a.bytes) }
      }))
      for (const [offset, result] of batch.entries()) {
        if (result.status === 'rejected') {
          if (result.reason.reason_code === 'OPERATIONS_NOT_READY') throw result.reason
          await readiness()
          const reason = result.reason.reason_code
          return { artifacts, failure: { layer: 'EXECUTION_PREFIX', checkpoint_ref: `${refs.checkpoints}/${names[start + offset]}`,
            reason_code: ['ARTIFACT_READBACK_FAILURE', 'DIGEST_MISMATCH', 'EXECUTION_DRIFT', 'AUTHORIZATION_INVALID'].includes(reason) ? reason : 'DIGEST_MISMATCH' } }
        }
        artifacts.push(result.value)
      }
    }
    await readiness()
    return { artifacts, failure: null }
  }
  return Object.freeze({ refs, readiness, read, rawRead: (ref, optional = false) => rawRead(ref, optional), write, writeBytes,
    checkpointEntries, readCheckpoints, scanCheckpoints })
}
