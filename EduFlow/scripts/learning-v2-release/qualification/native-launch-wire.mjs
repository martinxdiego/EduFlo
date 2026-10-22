import { blocked, immutable, nonProduction } from './contracts.mjs'

// Structural decoding grants no provenance, launch permission or PASS.
export function decodeNativeLaunchOutcome(input, request) {
  nonProduction()
  const reject = condition => { if (!condition) throw blocked('NATIVE_LAUNCH_SCHEMA') }
  reject(Buffer.isBuffer(input) && input.length === 432 && Buffer.isBuffer(request) && request.length === 216)
  const b = Buffer.from(input), r = Buffer.from(request), u = offset => b.readUInt32LE(offset)
  reject(r.readUInt32LE(0) === 0x51464445 && r.readUInt32LE(4) === 4 && r.readUInt32LE(8) === 176 && r.readUInt32LE(12) === 2)
  const role = r.readUInt32LE(176)
  reject([2, 3, 5, 6].includes(role) && r.readUInt32LE(180) === 0)
  for (const offset of [16, 48, 80, 112, 144, 184]) reject(r.subarray(offset, offset + 32).some(x => x !== 0))
  reject(u(0) === 0x51464445 && u(4) === 1 && u(8) === 432 && u(12) === 1 && u(16) === role)
  reject(b.readBigUInt64LE(24) > 0n && b.readBigUInt64LE(32) > 0n)
  reject(b.subarray(40, 72).equals(r.subarray(48, 80)) && b.subarray(72, 104).equals(r.subarray(184, 216)))
  reject(u(200) === 1 && u(204) === 0 && u(208) === 0 && u(212) === 0 && b.subarray(216).equals(r))
  for (const offset of [104, 136, 168]) reject(b.subarray(offset, offset + 32).some(x => x !== 0))
  return immutable({ role, exit_code: u(20), pid: b.readBigUInt64LE(24).toString(), created: b.readBigUInt64LE(32).toString(),
    profile: b.subarray(40, 72).toString('hex'), ticket: b.subarray(72, 104).toString('hex'),
    image: b.subarray(104, 136).toString('hex'), token: b.subarray(136, 168).toString('hex'), handles: b.subarray(168, 200).toString('hex') })
}
