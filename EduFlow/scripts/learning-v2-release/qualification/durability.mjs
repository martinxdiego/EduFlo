import { z } from 'zod'
import { storageSchema, parse, digest, ref, testOnly, nonProduction, blocked, immutable, authority, hash } from './contracts.mjs'

export const FAULT_POINTS = Object.freeze(['BEFORE_CREATE', 'AFTER_CREATE', 'MID_WRITE', 'BEFORE_SYNC', 'SYNC_AMBIGUOUS', 'AFTER_SYNC', 'AFTER_CLOSE',
  'PREPARED_VERIFIED', 'SETTLEMENT_VERIFIED', 'RESTART_INSPECTION', 'STORAGE_IO_FAILURE', 'VM_RESET', 'POWER_LOSS'])
const observationSchema = z.object({ phase: z.enum(['PREPARE', 'SETTLE']), point: z.enum(FAULT_POINTS),
  acknowledged: z.boolean(), present: z.boolean(), bytes_match: z.boolean(), binding_match: z.boolean(), independent: z.boolean(),
  fault_evidence: ref.nullable(), storage_profile: digest }).strict()
export function durabilityPlan(profile) {
  nonProduction(); const storage = parse(storageSchema, profile)
  return immutable({ storage, writer: 'EXISTING_PAID_ARTIFACT_BYTE_WRITER', phases: ['PREPARE', 'SETTLE'], faults: [...FAULT_POINTS],
    forbidden: ['PROVIDER', 'RESUME', 'REPAIR', 'EXTRA_SUBJECT_FLUSH'], ...authority })
}
export function createSyntheticDurabilityHarness(profile) {
  testOnly(); const plan = durabilityPlan(profile)
  let prepared = false, settled = false, stopped = false, failed = false, sent = false, next = false
  const observations = []
  return Object.freeze({
    observe(input) {
      testOnly(); const value = parse(observationSchema, input)
      if (value.storage_profile !== hash(plan.storage)) { stopped = true; return 'BLOCKED' }
      observations.push(value)
      if (value.acknowledged && (!value.present || !value.bytes_match || !value.binding_match)) { stopped = true; failed = true; return 'FAILED' }
      if (!value.independent || !value.fault_evidence) { stopped = true; return 'BLOCKED' }
      if (value.point === 'PREPARED_VERIFIED' && value.phase === 'PREPARE' && value.acknowledged && !stopped) prepared = true
      if (value.point === 'SETTLEMENT_VERIFIED' && value.phase === 'SETTLE' && prepared && value.acknowledged && !stopped) settled = true
      if (!value.acknowledged || ['RESTART_INSPECTION', 'STORAGE_IO_FAILURE', 'VM_RESET', 'POWER_LOSS', 'SYNC_AMBIGUOUS'].includes(value.point)) stopped = true
      return 'NOT_PERFORMED' // Synthetic protocol evidence cannot qualify real persistence.
    },
    transportSentinel() { testOnly(); if (!prepared || stopped || sent) throw blocked('DURABLE_PREPARE_REQUIRED'); sent = true; return 'SYNTHETIC_NONTRANSPORT_SENTINEL' },
    nextPrepareSentinel() { testOnly(); if (!settled || stopped || next) throw blocked('DURABLE_SETTLEMENT_REQUIRED'); next = true; return 'SYNTHETIC_NEXT_PREPARE_SENTINEL' },
    inspect() { testOnly(); return immutable({ status: failed ? 'FAILED' : stopped ? 'BLOCKED' : 'NOT_PERFORMED', observations: structuredClone(observations), prepared, settled, ...authority }) },
    plan,
  })
}

// Descriptors are not executable reset commands. A separately authorized laboratory
// must bind the external actuator and independent post-restart inspector.
export function externalFaultPlan(profile, point) {
  nonProduction(); const plan = durabilityPlan(profile)
  if (!['VM_RESET', 'POWER_LOSS', 'RESTART_INSPECTION'].includes(point)
    || (point === 'VM_RESET' && plan.storage.kind !== 'VM')) throw blocked('FAULT_PROFILE_CLASS')
  return immutable({ status: 'NOT_PERFORMED', point, storage_profile: hash(plan.storage), method: plan.storage.fault_method,
    controller_outside_subject_failure_domain: 'REQUIRED', evidence_outside_subject_failure_domain: 'REQUIRED',
    acknowledgement_source: 'EXTERNAL_CONTROLLER', verification: 'INDEPENDENT_REOPEN_AFTER_RESTART',
    inspect: ['BYTES', 'NAMESPACE', 'IDENTITY_BINDING', 'CONSUMPTION_HISTORY'], repair: false, retry: false, ...authority })
}
