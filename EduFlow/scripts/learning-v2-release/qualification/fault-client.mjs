import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { z } from 'zod'
import { parse, testOnly, blocked, immutable, authority } from './contracts.mjs'
import { paidPaths } from '../../../lib/server/learning-v2/tutor/evaluation/paid-execution-contract.js'

export const SYNTHETIC_IO_FAULTS = Object.freeze(['BEFORE_CREATE', 'AFTER_CREATE', 'MID_WRITE', 'BEFORE_SYNC', 'SYNC_AMBIGUOUS', 'AFTER_SYNC', 'AFTER_CLOSE', 'STORAGE_IO_FAILURE'])
const inputSchema = z.object({ boundary: z.enum(['EVALUATION', 'CHECKPOINT', 'HUMAN_REVIEW']), fault: z.enum(SYNTHETIC_IO_FAULTS) }).strict()
const responseSchema = z.object({ version: z.literal(1), reached: z.boolean(), synced: z.boolean(), writer_returned: z.boolean() }).strict()
export async function exerciseSyntheticWriterFault(input) {
  testOnly(); const { boundary, fault } = parse(inputSchema, input)
  const root = await fs.mkdtemp(path.join(tmpdir(), 'paid-execution-test-fault-'))
  const refs = paidPaths('test-paid-fault-worker'), targets = { EVALUATION: refs.result, CHECKPOINT: `${refs.checkpoints}/001.prepared.json`, HUMAN_REVIEW: refs.packet }
  try {
    // Auto-detected ESM emits this cosmetic warning on Node 24. Keep all other stderr fatal.
    const child = await promisify(execFile)(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', fileURLToPath(new URL('./fault-worker.mjs', import.meta.url)), root, boundary, fault],
      { env: { ...process.env, NODE_ENV: 'test' }, windowsHide: true, timeout: 15000, maxBuffer: 1048576 })
    const outcome = parse(responseSchema, child.stdout)
    if (!outcome.reached || outcome.writer_returned || child.stderr) throw blocked('FAULT_NOT_REACHED')
    const target = path.join(root, targets[boundary])
    let bytes = null
    try { bytes = await fs.readFile(target) } catch (error) { if (error.code !== 'ENOENT') throw error }
    return immutable({ scope: 'SYNTHETIC_TEST_ONLY', status: 'BLOCKED', fault, boundary,
      fault_reached: true, writer_returned: false, sync_completed: outcome.synced,
      independent_after_process_exit: true, present: bytes !== null, length: bytes?.length ?? 0,
      complete_bytes: bytes?.equals(Buffer.from('SYNTHETIC QUALIFICATION ONLY\n')) ?? false,
      transport_sentinel: false, next_prepare_sentinel: false, real_component_lab_verification: 'NOT_PERFORMED', ...authority })
  } finally {
    // This worker never runs attacks or creates reparse points. Validate the exact
    // fresh temporary root before removing this bounded synthetic fixture.
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('paid-execution-test-fault-')) throw blocked('FAULT_CLEANUP_CONTAINMENT')
    const stat = await fs.lstat(root)
    if (stat.isSymbolicLink() || path.resolve(await fs.realpath(root)) !== root) throw blocked('FAULT_CLEANUP_IDENTITY')
    await fs.rm(root, { recursive: true, force: true })
  }
}
