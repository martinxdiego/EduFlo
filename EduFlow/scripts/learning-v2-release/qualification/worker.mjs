import { testOnly, blocked, immutable, authority } from './contracts.mjs'
import { paidPaths } from '../../../lib/server/learning-v2/tutor/evaluation/paid-execution-contract.js'

const writers = new WeakMap()
export function bindSyntheticWriter({ repository, runId }) {
  testOnly()
  if (!/^test-paid-[a-z0-9-]+$/.test(runId) || typeof repository?.writeBytes !== 'function') throw blocked('SYNTHETIC_WRITER_REQUIRED')
  const refs = paidPaths(runId)
  const cap = Object.freeze({}); writers.set(cap, { repository, targets: { EVALUATION: refs.result, CHECKPOINT: `${refs.checkpoints}/001.prepared.json`, HUMAN_REVIEW: refs.packet } })
  return cap
}
export async function writeSyntheticBoundary(writer, boundary) {
  testOnly(); const value = writers.get(writer), target = value?.targets[boundary]
  if (!target || !Object.hasOwn(value.targets, boundary)) throw blocked('FIXED_WRITE_BOUNDARY')
  // Invoke the existing artifact byte writer; no Authorization/Claim/session constructor.
  const artifact = await value.repository.writeBytes(target, Buffer.from('SYNTHETIC QUALIFICATION ONLY\n'))
  return immutable({ boundary, ref: artifact.ref, sha256: artifact.sha256, ...authority })
}
