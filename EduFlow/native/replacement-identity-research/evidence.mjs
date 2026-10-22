import { createHash } from 'node:crypto'
import { requireFact, VERSION } from './model.mjs'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const LIMIT = 16 * 1024 * 1024
// File persistence/authenticated producer binding is deliberately outside this
// codec. A digest proves byte consistency, never origin or capture completeness.
export function packFrames(frames) {
  requireFact(Array.isArray(frames) && frames.length > 0 && frames.length <= 4096, 'bounded frames required')
  let total = 0, head = '0'.repeat(64)
  const records = frames.map((frame, i) => {
    requireFact(Object.keys(frame).sort().join('|') === 'bytes|kind|sequence|status', 'raw frame schema')
    requireFact(frame.sequence === i + 1 && Number.isInteger(frame.kind) && frame.kind >= 1 && frame.kind <= 13, 'frame sequence/kind')
    requireFact(Number.isInteger(frame.status) && frame.status >= 0 && frame.status <= 0xffffffff, 'native frame status')
    requireFact(Buffer.isBuffer(frame.bytes) && (total += frame.bytes.length) <= LIMIT, 'raw evidence overflow')
    const payload = { sequence: frame.sequence, kind: frame.kind, status: frame.status, bytes: frame.bytes.toString('base64'), previous: head }
    head = digest(JSON.stringify(payload))
    return { ...payload, hash: head }
  })
  return { version: VERSION, purpose: 'RESEARCH_ONLY', records, head, raw_bytes: total, platform_qualification: false }
}
export function unpackFrames(envelope) {
  requireFact(envelope && JSON.stringify(envelope).length <= LIMIT * 2, 'bounded envelope required')
  requireFact(Object.keys(envelope).sort().join('|') === 'head|platform_qualification|purpose|raw_bytes|records|version', 'envelope schema')
  requireFact(envelope.version === VERSION && envelope.purpose === 'RESEARCH_ONLY' && envelope.platform_qualification === false, 'research boundary')
  requireFact(Array.isArray(envelope.records) && envelope.records.length > 0 && envelope.records.length <= 4096, 'bounded records required')
  const frames = envelope.records.map(r => {
    requireFact(Object.keys(r).sort().join('|') === 'bytes|hash|kind|previous|sequence|status', 'record schema')
    requireFact(typeof r.bytes === 'string' && r.bytes.length <= LIMIT * 2, 'bounded base64 required')
    const bytes = Buffer.from(r.bytes, 'base64')
    requireFact(bytes.toString('base64') === r.bytes, 'noncanonical raw bytes')
    return { sequence: r.sequence, kind: r.kind, status: r.status, bytes }
  })
  requireFact(JSON.stringify(packFrames(frames)) === JSON.stringify(envelope), 'evidence digest/shape mismatch')
  return frames
}
