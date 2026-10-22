import { requireFact } from './model.mjs'

const MAX_BYTES = 1024 * 1024
const hex = (b, offset, length) => b.subarray(offset, offset + length).toString('hex')
function bounded(b) { requireFact(Buffer.isBuffer(b) && b.length <= MAX_BYTES, 'bounded raw buffer required') }
function name(b, start, size, end) {
  requireFact(size > 0 && size % 2 === 0 && start + size <= end, 'invalid UTF-16 length')
  const s = b.subarray(start, start + size).toString('utf16le')
  requireFact(!s.includes('\0') && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s), 'invalid UTF-16')
  return s
}

// Returned objects reference raw byte offsets. IDs retain their native width;
// no implicit 64-to-128 bit conversion or timestamp-based join exists.
export function decodeNotifications(raw) {
  bounded(raw); requireFact(raw.length > 0, 'OBSERVATION_LOSS: empty notify completion')
  const result = []; let offset = 0
  while (true) {
    requireFact(offset + 84 <= raw.length && result.length < 4096, 'truncated/bounded notification')
    const next = raw.readUInt32LE(offset), action = raw.readUInt32LE(offset + 4), length = raw.readUInt32LE(offset + 80)
    requireFact(action >= 1 && action <= 5, 'unsupported notify action')
    const end = next ? offset + next : raw.length
    requireFact(end <= raw.length && end > offset && (!next || (next % 4 === 0 && next >= 84)), 'invalid notification offset')
    result.push({ offset, action, file_id64: hex(raw, offset + 64, 8), parent_id64: hex(raw, offset + 72, 8), name: name(raw, offset + 84, length, end) })
    if (!next) { requireFact(end - (offset + 84 + length) < 4, 'unexpected notification tail'); return result }
    requireFact(end - (offset + 84 + length) < 4, 'unexpected notification padding')
    offset = end
  }
}

export function decodeUsn(raw, start, stop) {
  bounded(raw)
  requireFact(typeof start === 'bigint' && typeof stop === 'bigint' && start >= 0n && stop >= start, 'invalid journal interval')
  requireFact(raw.length >= 8, 'truncated USN cursor')
  const next = raw.readBigInt64LE(0)
  requireFact(next >= start, 'USN cursor regressed')
  const records = []; let previous = start - 1n
  for (let offset = 8; offset < raw.length;) {
    requireFact(offset + 8 <= raw.length && records.length < 4096, 'truncated USN record')
    const length = raw.readUInt32LE(offset), major = raw.readUInt16LE(offset + 4), minor = raw.readUInt16LE(offset + 6)
    requireFact([2, 3].includes(major) && minor === 0, 'unsupported USN version')
    const base = major === 2 ? 60 : 76, idBytes = major === 2 ? 8 : 16
    requireFact(length >= base && length % 8 === 0 && offset + length <= raw.length, 'invalid USN size')
    const usnOffset = major === 2 ? 24 : 40, reasonOffset = major === 2 ? 40 : 56
    const usn = raw.readBigInt64LE(offset + usnOffset)
    requireFact(usn >= start && usn > previous && usn < next, 'USN record order/cursor mismatch')
    previous = usn
    const size = raw.readUInt16LE(offset + base - 4), nameOffset = raw.readUInt16LE(offset + base - 2)
    requireFact(nameOffset >= base && nameOffset % 2 === 0, 'invalid USN name offset')
    records.push({ offset, length, major, file_id: hex(raw, offset + 8, idBytes), parent_id: hex(raw, offset + 8 + idBytes, idBytes), usn: usn.toString(), reason: raw.readUInt32LE(offset + reasonOffset), name: name(raw, offset + nameOffset, size, offset + length), within_interval: usn < stop })
    offset += length
  }
  requireFact(next !== start || records.length === 0, 'journal stalled with records')
  return { next: next.toString(), records, reached_cut: next >= stop }
}

export function checkJournalContinuity(before, after, cursor) {
  for (const x of [before, after]) {
    requireFact(Object.keys(x).sort().join('|') === 'first|id|lowest|next', 'journal metadata schema')
    requireFact(typeof x.id === 'string' && /^[0-9a-f]{16}$/.test(x.id), 'journal ID required')
    for (const k of ['first', 'lowest', 'next']) requireFact(typeof x[k] === 'bigint' && x[k] >= 0n, 'USN integer required')
    requireFact(x.first <= x.next && x.lowest <= x.next, 'invalid journal range')
  }
  requireFact(typeof cursor === 'bigint', 'cursor required')
  return before.id === after.id && after.next >= before.next && cursor >= before.first && cursor >= before.lowest && cursor >= after.first && cursor >= after.lowest
}
