import { VERSION, hash } from '../../scripts/learning-v2-release/qualification/contracts.mjs'
import { createSyntheticJournal } from '../../scripts/learning-v2-release/qualification/ledger.mjs'
import { createSyntheticController } from '../../scripts/learning-v2-release/qualification/controller.mjs'
import { createSyntheticCollectorPeer, createSyntheticResolver } from '../../scripts/learning-v2-release/qualification/resolver.mjs'

export const d = value => hash({ synthetic: value })
export function binding(epoch = 'qualification-epoch-unit', id = 'test-paid-unit') { return { fixture: id, profile: d('profile'), epoch, boot: 'qualification-boot-unit', reservation: d(id) } }
export function observation(b = binding()) {
  return { version: VERSION, binding: b, challenge: d('challenge'), collector_image: d('collector'), device_profile: b.profile,
    status: 'OBSERVED', complete: true, reason: 'NONE',
    objects: ['inside', 'outside'].map((name, i) => ({ ref: `qualification-${name}`, volume: 'qualification-volume', file_id: d(name), parent: null,
      type: 'DIRECTORY', attributes: 16, reparse_tag: 0, owner: 'S-1-5-21-100', descriptor: 'QUJD', descriptor_hash: d('descriptor'), inherited: false,
      effective_denied: ['DELETE', 'DELETE_CHILD', 'ADD_SUBDIRECTORY', 'WRITE_DAC', 'WRITE_OWNER', 'REPARSE', 'GUARD_WRITE'], guard_digest: null })),
    tokens: ['PROVISIONER', 'RUNNER', 'COORDINATOR', 'VERIFIER', 'ATTACKER_DEVELOPER', 'ATTACKER_SERVICE'].map((role, i) => ({
      role, sid: `S-1-5-21-${100 + i}`, pid: i + 1, tid: i + 1, process_start: `qualification-process-${i}`, image: d(role), groups: [], restricted: [], privileges: [],
      integrity: 'S-1-16-8192', elevation: 'LIMITED', impersonation: 'NONE', token_id: d(i), inherited_handles: [] })) }
}
export function resolved(b = binding(), change = null) {
  const value = observation(b); if (change) change(value)
  const peer = createSyntheticCollectorPeer(value), resolver = createSyntheticResolver(peer), request = resolver.request(b)
  const response = { ...value, challenge: request.challenge }
  return { value, peer, resolver, request, response, proof: resolver.accept(request, response, peer) }
}
export async function controllerFixture(id = 'test-paid-unit', options) {
  const journal = createSyntheticJournal(options), controller = await createSyntheticController(journal.capability), b = binding(controller.epoch, id)
  await controller.register({ binding: b })
  return { journal, controller, binding: b }
}
export function event({ sequence = 1, operation = 1, phase = 'PRE', kind = 'CREATE', outside = false, effect = 'NONE', status = 'PENDING', epoch = 'qualification-epoch-unit' } = {}) {
  return { version: VERSION, epoch, sequence, operation, phase, kind, pid: 2, tid: 2, process_start: 'qualification-process-1',
    object: d(outside ? 'outside' : 'inside'), volume: 'qualification-volume', path: `qualification-${outside ? 'outside' : 'inside'}`,
    destination: null, status, effect, bytes: 0, outside }
}
export function health(epoch = 'qualification-epoch-unit', sequence = 0) { return { epoch, drops: 0, allocation_failures: 0, overflows: 0,
  etw_events_lost: 0, etw_buffers_lost: 0, etw_realtime_lost: 0, attached: true, disconnected: false, unloaded: false, drained: true, last_sequence: sequence } }
export function storage() { return { version: VERSION, id: 'qualification-storage', kind: 'PHYSICAL', filesystem: 'NTFS', device: 'qualification-device',
  controller: 'qualification-controller', firmware: 'qualification-firmware', cache_policy: 'QUALIFIED_FLUSH', host: 'qualification-host',
  hypervisor: null, virtual_controller: null, backing_storage: null, filters: [], assumptions: ['qualification-assumption'], fault_method: 'qualification-power-method',
  persistence_documents: [{ ref: 'qualification-document', digest: d('doc') }], namespace_contract: 'qualification-namespace', data_contract: 'qualification-data', binding_contract: 'qualification-binding' } }
