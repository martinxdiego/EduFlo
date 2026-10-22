import { decodeNativeObservation } from './native-wire.mjs'
import { authority, immutable } from './contracts.mjs'

// A diagnostic projection of strictly decoded bytes, never a capability. In
// particular, a caller cannot supply a "complete" flag or an expected ACL.
const WRITE = 0x000d0156, DELETE = 0x10000, WRITE_DAC = 0x40000, DELETE_CHILD = 0x40
const integrity = sid => /^S-1-16-(0|[1-9]\d*)$/.test(sid) ? Number(sid.slice(7)) : null
function aclMetadata(encoded) {
  const sd = Buffer.from(encoded, 'base64'), start = sd.readUInt32LE(16), count = sd.readUInt16LE(start + 4)
  let at = start + 8, ownerRights = false, inherited = 0, unsupportedFlags = false
  for (let n = 0; n < count; n++) {
    const flags = sd[at + 1], sid = at + 8, size = sd.readUInt16LE(at + 2)
    const text = `S-1-${sd.readUIntBE(sid + 2, 6)}${Array.from({ length: sd[sid + 1] }, (_, i) => `-${sd.readUInt32LE(sid + 8 + i * 4)}`).join('')}`
    if (!(flags & 8) && text === 'S-1-3-4') ownerRights = true
    if (flags & 16) inherited++
    if (flags & ~31) unsupportedFlags = true
    at += size
  }
  return { ownerRights, inherited, unsupportedFlags }
}
function accessProjection(object, token, mask, label, acl, native) {
  const tokenLevel = integrity(token.integrity), objectLevel = label.present ? integrity(label.integrity) : 8192
  // An absent label has the Windows default medium/no-write-up semantics.
  const policy = label.present ? label.mask : 1
  const lower = tokenLevel !== null && objectLevel !== null && tokenLevel < objectLevel
  const ownerCandidate = token.user === object.owner || token.groups.some(g => g.sid === object.owner && (g.attributes & 4) && !(g.attributes & 16))
  const ownerPotential = ownerCandidate && !acl.ownerRights
  const micWriteBlocked = lower && Boolean(native.tokenPolicy & 1)
  const diagnosticMask = micWriteBlocked ? mask & ~WRITE : mask
  return {
    access_check_mask: mask, diagnostic_mask: diagnosticMask,
    token_integrity: tokenLevel, object_integrity: objectLevel, mandatory_policy: policy, mic_write_blocked: micWriteBlocked,
    owner_candidate: ownerCandidate, owner_rights_ace: acl.ownerRights,
    owner_write_dac_potential: ownerPotential && !micWriteBlocked,
    delete_on_object: Boolean(diagnosticMask & DELETE),
    write_dac_potential: Boolean(diagnosticMask & WRITE_DAC) || (ownerPotential && !micWriteBlocked),
    privileges_present: token.privileges.length,
    disabled_privileges_present: token.privileges.some(p => !(p.attributes & 2) && !(p.attributes & 4)),
    restricted: token.restricted.length > 0,
    native_composite: native,
    // The native assessment is bound to token/descriptor/parent facts, but is
    // not an independent file-operation or retained-authority proof.
    authority_proof: false,
  }
}
export function assessNativeRequiredFacts(bytes) {
  const decoded = decodeNativeObservation(bytes)
  const fact = (kind, index) => decoded.facts.find(f => f.kind === kind && f.index === index).value
  const issues = new Set(), objects = decoded.objects.map(object => {
    const acl = aclMetadata(object.descriptor), label = fact(3, object.index), resolution = fact(1, object.index), volume = fact(2, object.index)
    if (acl.unsupportedFlags) issues.add('UNSUPPORTED_ACE_FLAGS')
    if (object.reparseTag || (object.attributes & 0x400)) issues.add('REPARSE_RESOLUTION_NOT_QUALIFIED')
    if ([0, 14, 15, 16, 17, 18].includes(volume.bus)) issues.add('STORAGE_STACK_NOT_DESCRIBED')
    if ([volume.volumeName, volume.descriptor, volume.firmware, volume.extents].some(v => /^0+$/.test(v))) issues.add('MISSING_STORAGE_IDENTITY')
    if (!volume.cacheType || !volume.cacheEnabled || !volume.cacheChangeable || !volume.writeThrough) issues.add('UNKNOWN_STORAGE_SEMANTICS')
    const roles = decoded.tokens.map((effective, index) => {
      const primary = fact(6, index), context = fact(7, index)
      const composite = fact(8, object.index)[index]
      const value = { role: effective.role, primary: accessProjection(object, primary, object.primaryAccess[index], label, acl, composite[0]), effective: accessProjection(object, effective, object.access[index], label, acl, composite[1]) }
      for (const kind of ['primary', 'effective']) {
        if (value[kind].token_integrity === null || value[kind].object_integrity === null) issues.add('UNSUPPORTED_INTEGRITY_SID')
        if (value[kind].privileges_present) issues.add('PRIVILEGE_AUTHORITY_NOT_RESOLVED')
        if (value[kind].restricted || value[kind].owner_rights_ace) issues.add('COMPOSITE_ACCESS_NOT_RESOLVED')
        if (value[kind].native_composite.unresolved) issues.add('NATIVE_ACCESS_SEMANTICS_UNRESOLVED')
      }
      if (context.uiAccess.some(Boolean) || context.virtualizationEnabled.some(Boolean)) issues.add('UNSUPPORTED_TOKEN_CONTEXT')
      return value
    })
    return { index: object.index, parent: resolution.root ? null : resolution.parent, inherited_ace_count: acl.inherited, roles }
  })
  for (const object of objects) for (const value of object.roles) for (const kind of ['primary', 'effective']) {
    const parent = object.parent === null ? null : objects[object.parent].roles.find(v => v.role === value.role)[kind]
    value[kind].parent_delete_child = parent === null ? false : Boolean(parent.diagnostic_mask & DELETE_CHILD)
    value[kind].delete_route_present = value[kind].delete_on_object || value[kind].parent_delete_child
  }
  // Wire v4 adds a native composite assessment, not all required proofs.
  // No caller-supplied hash, empty handle list, or authenticated transport can
  // make them true. A later implementation must extend the native contract.
  const missing = ['COMPLETE_STORAGE_DEVICE_PROFILE', 'NATIVE_COMPOSITE_ACCESS_PROOF',
    'RETAINED_HANDLE_OBJECT_LIFETIME', 'SEALED_RUNTIME_DEPENDENCY_CLOSURE']
  return immutable({ status: 'BLOCKED', reason: 'REQUIRED_NATIVE_FACTS_INCOMPLETE',
    scope: 'NATIVE_REQUIRED_FACT_DIAGNOSTIC', wire_version: decoded.version,
    missing_required_facts: missing, unsupported_semantics: [...issues].sort(), objects, ...authority })
}
