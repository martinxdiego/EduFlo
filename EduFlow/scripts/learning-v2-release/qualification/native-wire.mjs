import { nonProduction, blocked, immutable, LIMITS } from './contracts.mjs'

// Decoding is not authentication. Only the broker bridge may attach provenance.
export const NATIVE_WIRE_VERSION = 4
const MAGIC = 0x51464445
export function decodeNativeObservation(input) {
  nonProduction()
  if (!Buffer.isBuffer(input) || input.length > LIMITS.message) throw blocked('NATIVE_MESSAGE_BOUND')
  const b = Buffer.from(input); let offset = 0
  const take = size => { if (!Number.isSafeInteger(size) || size < 0 || size > b.length - offset) throw blocked('NATIVE_LENGTH'); const v = b.subarray(offset, offset + size); offset += size; return v }
  const u32 = () => take(4).readUInt32LE(), u64 = () => take(8).readBigUInt64LE().toString(), hex = n => take(n).toString('hex')
  const reject = condition => { if (!condition) throw blocked('NATIVE_SCHEMA') }
  const text = (bytes, allowEmpty = false) => {
    const data = take(bytes); let end = -1
    for (let i = 0; i < data.length; i += 2) if (data.readUInt16LE(i) === 0) { end = i; break }
    reject(end >= 0 && (allowEmpty || end > 0) && data.subarray(end).every(x => x === 0))
    return data.subarray(0, end).toString('utf16le')
  }
  const sid = (allowEmpty = false) => {
    const s = text(368, allowEmpty); if (allowEmpty && s === '') return s
    reject(/^S-1-(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*)){1,15}$/.test(s))
    const parts = s.slice(4).split('-').map(BigInt); reject(parts[0] <= 281474976710655n && parts.slice(1).every(n => n <= 4294967295n)); return s
  }
  reject(u32() === MAGIC && u32() === NATIVE_WIRE_VERSION && u32() === 176 && u32() === 1)
  const binding = { challenge: hex(32), profile: hex(32), epoch: hex(32), fixture: hex(32), boot: hex(32) }
  reject(Object.values(binding).every(v => v !== '0'.repeat(64)))
  reject(u32() === 1 && u32() === 0)
  const objectCount = u32(), tokenCount = u32(), payloadBytes = u32(), collectorImage = hex(32), factCount = u32()
  reject(objectCount > 0 && objectCount <= 256 && tokenCount > 0 && tokenCount <= 16 && factCount === 3 * tokenCount + 5 * objectCount && payloadBytes === b.length - offset)
  const tokens = [], objects = [], facts = [], roles = new Set()
  function token() {
    const role = u32(), pid = u32(), tid = u32(), tokenType = u32(), elevation = u32(), impersonation = u32()
    const groupCount = u32(), restrictedCount = u32(), privilegeCount = u32(); reject(u32() === 0) // x64 padding
    reject(role >= 1 && role <= 6 && pid > 0 && tid > 0 && elevation >= 1 && elevation <= 3 && (tokenType === 1 ? impersonation === 0 : tokenType === 2 && impersonation >= 1 && impersonation <= 4))
    reject(groupCount <= 256 && restrictedCount <= 256 && privilegeCount <= 128)
    const value = { role, pid, tid, tokenType, elevation, impersonation, processCreated: u64(), tokenId: u64(), authenticationId: u64(), modifiedId: u64(), user: sid(), owner: sid(), integrity: sid(), image: hex(32), groups: [], restricted: [], privileges: [] }
    reject(value.processCreated !== '0' && value.tokenId !== '0')
    for (let n = 0; n < groupCount; n++) value.groups.push({ sid: sid(), attributes: u32() })
    for (let n = 0; n < restrictedCount; n++) value.restricted.push({ sid: sid(), attributes: u32() })
    for (let n = 0; n < privilegeCount; n++) value.privileges.push({ luid: hex(8), attributes: u32() })
    for (const [items, key] of [[value.groups, 'sid'], [value.restricted, 'sid'], [value.privileges, 'luid']]) reject(new Set(items.map(v => v[key])).size === items.length)
    return value
  }
  for (let i = 0; i < tokenCount; i++) { const value = token(); reject(!roles.has(value.role)); roles.add(value.role); tokens.push(value) }
  function descriptor(bytes, control, owner) {
    reject(bytes.length >= 20 && bytes.length <= 65536 && bytes[0] === 1 && (bytes.readUInt16LE(2) & 0x8004) === 0x8004)
    reject(bytes[1] === 0 && control === bytes.readUInt16LE(2))
    const ranges = [], range = (start, end) => { reject(!ranges.some(([a, z]) => start < z && a < end)); ranges.push([start, end]) }
    const binarySid = at => {
      reject(at >= 20 && at % 4 === 0 && at + 8 <= bytes.length && bytes[at] === 1 && bytes[at + 1] <= 15 && at + 8 + bytes[at + 1] * 4 <= bytes.length)
      const count = bytes[at + 1], authority = bytes.readUIntBE(at + 2, 6)
      return { end: at + 8 + count * 4, text: `S-1-${authority}${Array.from({ length: count }, (_, n) => `-${bytes.readUInt32LE(at + 8 + n * 4)}`).join('')}` }
    }
    reject(bytes.readUInt32LE(4) !== 0)
    for (const field of [4, 8]) { const at = bytes.readUInt32LE(field); if (at) { const value = binarySid(at); range(at, value.end); if (field === 4) reject(value.text === owner) } }
    reject(bytes.readUInt32LE(16) !== 0)
    for (const [field, sacl] of [[12, true], [16, false]]) {
      const start = bytes.readUInt32LE(field); if (!start) continue
      reject(start >= 20 && start % 4 === 0 && start + 8 <= bytes.length && [2, 4].includes(bytes[start]))
      const length = bytes.readUInt16LE(start + 2), count = bytes.readUInt16LE(start + 4)
      reject(length >= 8 && length % 4 === 0 && start + length <= bytes.length); range(start, start + length); let position = start + 8
      for (let i = 0; i < count; i++) {
        reject(position + 16 <= start + length); const type = bytes[position], size = bytes.readUInt16LE(position + 2)
        reject((sacl ? type === 17 : [0, 1].includes(type)) && size >= 16 && size % 4 === 0 && position + size <= start + length)
        const value = binarySid(position + 8); reject(value.end === position + size); position += size
      }
      reject(position === start + length)
    }
    return bytes.toString('base64')
  }
  for (let i = 0; i < objectCount; i++) {
    const index = u32(), attributes = u32(), reparseTag = u32(), descriptorBytes = u32(), descriptorControl = u32(); reject(index === i && u32() === 0)
    const volume = u64(), fileId = hex(16), owner = sid(), access = Array.from({ length: 16 }, u32), primaryAccess = Array.from({ length: 16 }, u32)
    reject(volume !== '0' && [...access.slice(tokenCount), ...primaryAccess.slice(tokenCount)].every(v => v === 0))
    objects.push({ index, attributes, reparseTag, descriptorControl, volume, fileId, owner, access: access.slice(0, tokenCount), primaryAccess: primaryAccess.slice(0, tokenCount), descriptor: descriptor(take(descriptorBytes), descriptorControl, owner) })
  }
  const seen = new Set()
  for (let i = 0; i < factCount; i++) {
    const kind = u32(), index = u32(), length = u32(); reject(u32() === 0)
    const key = `${kind}:${index}`; reject(kind >= 1 && kind <= 8 && index < ([4, 6, 7].includes(kind) ? tokenCount : objectCount) && !seen.has(key)); seen.add(key)
    const end = offset + length; reject(end <= b.length); let value
    if (kind === 1) { const parent = u32(), root = u32(), reparseBytes = u32(); reject(u32() === 0 && root <= 1 && reparseBytes <= 16384 && (root ? parent === 0xffffffff : parent < objectCount && parent !== index)); value = { parent, root, reparseBytes, name: hex(32), reparse: hex(32) } }
    if (kind === 2) {
      value = { volume: u64() }
      for (const name of ['filesystemFlags', 'deviceType', 'deviceNumber', 'partition', 'bus', 'removable', 'cacheType', 'cacheEnabled', 'cacheChangeable', 'writeThrough', 'flushSupported', 'powerProtection', 'nvCache']) value[name] = u32()
      for (const name of ['volumeName', 'descriptor', 'firmware', 'extents']) value[name] = hex(32)
      reject(value.volume === objects[index].volume && value.removable === 0 && [value.flushSupported, value.powerProtection, value.nvCache].every(v => v <= 1)); reject(u32() === 0) // trailing x64 alignment
    }
    if (kind === 3) { const mask = u32(), present = u32(); reject(present <= 1 && (mask & ~7) === 0); value = { mask, present, integrity: sid(!present) } }
    if (kind === 4) { const count = u32(); reject(count <= 256); const handles = []; let previous = 0n
      for (let n = 0; n < count; n++) { const handle = u64(), attributes = u32(), access = u32(), type = u32(), targetPid = u32(), targetCreated = u64(), typeName = hex(32), objectName = hex(32); reject(BigInt(handle) > previous && type <= 6); previous = BigInt(handle); handles.push({ handle, attributes, access, type, targetPid, targetCreated, typeName, objectName }) } value = handles
    }
    if (kind === 5) { const count = u32(); reject(count <= 32); value = Array.from({ length: count }, () => hex(32)) }
    if (kind === 6) {
      value = token(); const effective = tokens[index]
      reject(value.tokenType === 1 && value.impersonation === 0)
      for (const key of ['role', 'pid', 'tid', 'processCreated', 'image']) reject(value[key] === effective[key])
      if (!effective.impersonation) reject(JSON.stringify(value) === JSON.stringify(effective))
    }
    if (kind === 7) {
      value = {}
      for (const key of ['session', 'mandatory', 'uiAccess', 'appContainer', 'virtualizationAllowed', 'virtualizationEnabled']) value[key] = [u32(), u32()]
      reject(value.mandatory.every(v => (v & ~3) === 0) && value.appContainer.every(v => v === 0))
      for (const key of ['uiAccess', 'virtualizationAllowed', 'virtualizationEnabled']) reject(value[key].every(v => v <= 1))
      value.profiles = [hex(32), hex(32)]; reject(value.profiles.every(v => v !== '0'.repeat(64)))
      if (!tokens[index].impersonation) reject(Object.values(value).every(pair => pair[0] === pair[1]))
    }
    if (kind === 8) {
      reject(u32() === tokenCount); value = []
      for (let n = 0; n < tokenCount; n++) { const pair = []
        for (let p = 0; p < 2; p++) {
          const access = {}; for (const field of ['version', 'size', 'dac', 'micDenied', 'current', 'parentCurrent', 'parentDeleteChild', 'parentReadAttributes', 'ownerMember', 'ownerRightsAce', 'privilegeCurrent', 'privilegePotential', 'tokenIntegrity', 'objectIntegrity', 'tokenPolicy', 'objectPolicy', 'unresolved', 'reserved']) access[field] = u32()
          reject(access.version === 1 && access.size === 72 && !access.reserved && !(access.unresolved & ~7) && !(access.tokenPolicy & ~3) && !(access.objectPolicy & ~7))
          reject([access.parentDeleteChild, access.parentReadAttributes, access.ownerMember, access.ownerRightsAce].every(v => v <= 1))
          reject(access.dac === (p === 0 ? objects[index].primaryAccess[n] : objects[index].access[n]))
          reject(access.parentDeleteChild === Number(Boolean(access.parentCurrent & 0x40)) && access.parentReadAttributes === Number(Boolean(access.parentCurrent & 1)))
          reject(access.current === ((access.dac & ~access.micDenied) | (access.parentDeleteChild ? 0x10000 : 0) | (access.parentReadAttributes ? 0x80 : 0)) >>> 0)
          reject(!(access.privilegeCurrent & ~access.privilegePotential)); pair.push(access)
          reject(!((access.dac | access.current | access.parentCurrent | access.privilegePotential) & ~0x011f01ff))
        }
        value.push(pair)
      }
    }
    reject(offset === end); facts.push({ kind, index, value })
  }
  reject(offset === b.length)
  for (let i = 0; i < tokenCount; i++) if (!tokens[i].impersonation) reject(objects.every(o => o.access[i] === o.primaryAccess[i]))
  // Reject cycles and parent bindings that switch volume or escape the supplied inventory.
  for (let i = 0; i < objectCount; i++) { let cursor = i; const visited = new Set()
    for (;;) { reject(!visited.has(cursor)); visited.add(cursor); const r = facts.find(f => f.kind === 1 && f.index === cursor).value; if (r.root) break; reject(objects[r.parent].volume === objects[cursor].volume); cursor = r.parent }
  }
  const fact = (kind, index) => facts.find(f => f.kind === kind && f.index === index).value
  const level = sid => { reject(/^S-1-16-(0|[1-9]\d*)$/.test(sid)); return Number(sid.slice(7)) }
  for (const object of objects) {
    const sd = Buffer.from(object.descriptor, 'base64'), label = fact(3, object.index)
    const binarySid = at => `S-1-${sd.readUIntBE(at + 2, 6)}${Array.from({ length: sd[at + 1] }, (_, n) => `-${sd.readUInt32LE(at + 8 + n * 4)}`).join('')}`
    let objectLevel = 8192, policy = 1, ownerRights = false, present = false
    for (const [field, sacl] of [[12, true], [16, false]]) {
      const start = sd.readUInt32LE(field); if (!start) continue
      let at = start + 8
      for (let n = 0; n < sd.readUInt16LE(start + 4); n++) {
        const flags = sd[at + 1]; reject(!(flags & ~31))
        if (!(flags & 8)) {
          if (sacl) { reject(!present); present = true; objectLevel = level(binarySid(at + 8)); policy = sd.readUInt32LE(at + 4); reject(!(policy & ~7)) }
          else if (binarySid(at + 8) === 'S-1-3-4') ownerRights = true
        }
        at += sd.readUInt16LE(at + 2)
      }
    }
    reject(Boolean(label.present) === present)
    if (present) reject(level(label.integrity) === objectLevel && label.mask === policy)
    else reject(!label.mask && label.integrity === '')
    const resolution = fact(1, object.index), composites = fact(8, object.index)
    for (let t = 0; t < tokenCount; t++) for (let p = 0; p < 2; p++) {
      const c = composites[t][p], token = p ? tokens[t] : fact(6, t)
      reject(c.tokenIntegrity === level(token.integrity) && c.tokenPolicy === fact(7, t).mandatory[p]
        && c.objectIntegrity === objectLevel && c.objectPolicy === policy && c.ownerRightsAce === Number(ownerRights))
      let denied = 0
      if (c.tokenIntegrity < objectLevel && (c.tokenPolicy & 1)) { denied = 0xd0156; if (policy & 2) denied |= 0x20089; if (policy & 4) denied |= 0x20 }
      reject(c.micDenied === denied)
      const parent = resolution.root ? null : fact(8, resolution.parent)[t][p]
      reject(c.parentCurrent === (parent ? (parent.dac & ~parent.micDenied) >>> 0 : 0))
      if (!tokens[t].impersonation) reject(JSON.stringify(c) === JSON.stringify(composites[t][0]))
    }
  }
  return immutable({ scope: 'UNAUTHENTICATED_NATIVE_OBSERVATION', version: NATIVE_WIRE_VERSION, binding, collectorImage, tokens, objects, facts, paid_authority: false })
}
