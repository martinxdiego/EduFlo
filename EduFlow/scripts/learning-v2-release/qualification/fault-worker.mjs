// Isolated synthetic subprocess only. Instrument the runtime, never the paid writer source.
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { constants } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { testOnly, blocked } from './contracts.mjs'
import { provisionInternalPaidProtectionTest } from '../../../lib/server/learning-v2/tutor/evaluation/paid-execution-protection.js'
import { createPaidRepository, createInternalPaidFilesystemFault } from '../../../lib/server/learning-v2/tutor/evaluation/paid-execution-repository.js'
import { bindSyntheticWriter, writeSyntheticBoundary } from './worker.mjs'

testOnly()
const [root, boundary, fault] = process.argv.slice(2)
const allowed = ['BEFORE_CREATE', 'AFTER_CREATE', 'MID_WRITE', 'BEFORE_SYNC', 'SYNC_AMBIGUOUS', 'AFTER_SYNC', 'AFTER_CLOSE', 'STORAGE_IO_FAILURE']
if (process.argv.length !== 5 || !allowed.includes(fault) || !['EVALUATION', 'CHECKPOINT', 'HUMAN_REVIEW'].includes(boundary)
  || path.dirname(path.resolve(root)) !== path.resolve(tmpdir()) || !/^paid-execution-test-fault-[a-zA-Z0-9]+$/.test(path.basename(root))) throw blocked('FAULT_WORKER_BINDING')
const stat = await fs.lstat(root)
if (!stat.isDirectory() || stat.isSymbolicLink() || path.resolve(await fs.realpath(root)) !== path.resolve(root)) throw blocked('FAULT_WORKER_ROOT')
const runId = 'test-paid-fault-worker'
await provisionInternalPaidProtectionTest({ repositoryRoot: root, runId })
let reached = false, synced = false, writerReturned = false
const fail = () => { reached = true; throw Object.assign(new Error('synthetic I/O fault'), { code: 'EIO' }) }
const hooks = { BEFORE_CREATE: 'before-create', AFTER_CREATE: 'after-create', AFTER_CLOSE: 'before-readback' }
const capability = createInternalPaidFilesystemFault(stage => { if (stage === hooks[fault]) fail() })
const repository = createPaidRepository({ repositoryRoot: root, runId, faultCapability: capability })
const targets = { EVALUATION: repository.refs.result, CHECKPOINT: `${repository.refs.checkpoints}/001.prepared.json`, HUMAN_REVIEW: repository.refs.packet }
const target = path.join(root, targets[boundary]), originalOpen = fs.open
fs.open = async (filename, flags, ...args) => {
  const handle = await originalOpen(filename, flags, ...args)
  if (path.resolve(String(filename)) !== target || !(flags & constants.O_EXCL)) return handle
  const write = handle.writeFile.bind(handle), sync = handle.sync.bind(handle)
  handle.writeFile = async bytes => {
    if (fault === 'STORAGE_IO_FAILURE') fail()
    if (fault === 'MID_WRITE') { await write(bytes.subarray(0, Math.floor(bytes.length / 2))); fail() }
    return write(bytes)
  }
  handle.sync = async () => {
    if (fault === 'BEFORE_SYNC') fail()
    await sync(); synced = true
    if (fault === 'SYNC_AMBIGUOUS' || fault === 'AFTER_SYNC') fail()
  }
  return handle
}
syncBuiltinESMExports()
try { await writeSyntheticBoundary(bindSyntheticWriter({ repository, runId }), boundary); writerReturned = true }
catch (error) { if (error.code !== 'BLOCKED') throw error }
finally { fs.open = originalOpen; syncBuiltinESMExports() }
// No sentinels, continuation, repair or further writer invocation after a fault.
process.stdout.write(JSON.stringify({ version: 1, reached, synced, writer_returned: writerReturned }))
