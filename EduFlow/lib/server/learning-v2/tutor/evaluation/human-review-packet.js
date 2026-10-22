import { z } from 'zod'
import { createHash } from 'node:crypto'
import { TUTOR_ACTIONS } from '../../contracts/phase3.js'
import {
  TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
  TUTOR_CANONICAL_SAFETY_GATE_ORDER,
} from '../canonical-safety-gates.js'
import { domainSeparatedJcsSha256, jcsUtf8Bytes } from './human-review-canonical.js'
import {
  TUTOR_HUMAN_REVIEW_SAMPLING_VERSION,
  verifyTutorHumanReviewSampleManifestAgainstInput,
} from './human-review-sampling.js'
import { tutorHumanReviewPacketDeleteAt } from '../governance/human-review-retention.js'

export const TUTOR_HUMAN_REVIEW_PACKET_VERSION = 'tutor-human-review-packet-v1'
export const TUTOR_HUMAN_REVIEW_PACKET_DOMAIN = 'EDUFLOW\0H14B\0HUMAN_REVIEW_PACKET\0v1\0'
export const TUTOR_HUMAN_REVIEW_ITEM_REF_DOMAIN = 'EDUFLOW\0H14B\0HUMAN_REVIEW_ITEM_REF\0v1\0'
export const TUTOR_HUMAN_REVIEW_PACKET_MAX_BYTES = 262_144

const identifierSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/)
const shaSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/)
const timestampSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

export const tutorHumanReviewFinalGateProofSchema = z.object({
  canonical_safety_contract_version: z.literal(TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION),
  gates: z.array(z.object({
    gate: z.enum(TUTOR_CANONICAL_SAFETY_GATE_ORDER),
    status: z.literal('PASS'),
  }).strict()).length(TUTOR_CANONICAL_SAFETY_GATE_ORDER.length),
}).strict().superRefine((value, context) => {
  if (value.gates.some((gate, index) => gate.gate !== TUTOR_CANONICAL_SAFETY_GATE_ORDER[index])) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Canonical safety gates must be PASS in canonical order' })
  }
})

const packetItemSchema = z.object({
  review_item_ref: z.string().regex(/^hri-[0-9a-f]{64}$/),
  synthetic_case_ref: identifierSchema,
  subject_category: z.string().min(1).max(80).refine((value) => value === value.normalize('NFC'), 'Subject must already be NFC'),
  hint_level: z.number().int().min(1).max(3),
  expected_tutor_action: z.enum(TUTOR_ACTIONS),
  learner_message: z.string().min(1).max(280).refine((value) => value.trim() === value, 'Learner message must be trimmed')
    .refine((value) => value.split(/\s+/u).length <= 60, 'Learner message exceeds 60 words'),
  final_gate_pass_proof: tutorHumanReviewFinalGateProofSchema,
}).strict()

export const tutorHumanReviewPacketSchema = z.object({
  packet_contract_version: z.literal(TUTOR_HUMAN_REVIEW_PACKET_VERSION),
  source_run_id: identifierSchema,
  source_result_sha256: shaSchema,
  source_evaluation_manifest_version: identifierSchema,
  source_evaluator_version: identifierSchema,
  source_result_contract_version: identifierSchema,
  canonical_safety_contract_version: z.literal(TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION),
  fixture_set_version: identifierSchema,
  fixture_set_sha256: shaSchema,
  sampling_contract_version: z.literal(TUTOR_HUMAN_REVIEW_SAMPLING_VERSION),
  sample_manifest_sha256: shaSchema,
  synthetic_data_only: z.literal(true),
  packet_created_at: timestampSchema,
  packet_expires_at: timestampSchema,
  items: z.array(packetItemSchema).min(1).max(120),
  packet_sha256: shaSchema,
}).strict()

const buildInputSchema = z.object({
  source: z.object({
    source_run_id: identifierSchema,
    source_result_sha256: shaSchema,
    source_evaluation_manifest_version: identifierSchema,
    source_evaluator_version: identifierSchema,
    source_result_contract_version: identifierSchema,
    fixture_set_version: identifierSchema,
    fixture_set_sha256: shaSchema,
    fixtures_expected: z.literal(120),
    fixtures_completed: z.literal(120),
    coverage_complete: z.literal(true),
    final_outcome_fail_count: z.literal(0),
    system_safety_pass: z.literal(true),
    source_result_persisted: z.literal(true),
    source_result_hash_verified: z.literal(true),
  }).strict(),
  source_result_bytes: z.instanceof(Uint8Array),
  sample_manifest: z.unknown(),
  sampling_input: z.unknown(),
  selected_final_outputs: z.array(z.object({
    synthetic_case_ref: identifierSchema,
    subject_category: z.string().min(1).max(80),
    hint_level: z.number().int().min(1).max(3),
    expected_tutor_action: z.enum(TUTOR_ACTIONS),
    learner_message: z.string(),
    final_gate_pass_proof: z.unknown(),
  }).strict()).min(1).max(120),
  packet_created_at: timestampSchema,
}).strict()

function withoutPacketDigest(packet) {
  const { packet_sha256: _ignored, ...unsigned } = packet
  return unsigned
}

export function verifyTutorHumanReviewPacket(value) {
  const parsed = tutorHumanReviewPacketSchema.parse(value)
  const digest = domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_PACKET_DOMAIN, withoutPacketDigest(parsed))
  if (digest !== parsed.packet_sha256) throw new TypeError('Review Packet digest mismatch')
  if (jcsUtf8Bytes(parsed).byteLength > TUTOR_HUMAN_REVIEW_PACKET_MAX_BYTES) throw new TypeError('Review Packet exceeds its UTF-8 byte limit')
  if (new Set(parsed.items.map((item) => item.synthetic_case_ref)).size !== parsed.items.length) throw new TypeError('Review Packet has duplicate cases')
  return parsed
}

export function buildTutorHumanReviewPacket(value) {
  const input = buildInputSchema.parse(value)
  const sample = verifyTutorHumanReviewSampleManifestAgainstInput(input.sample_manifest, input.sampling_input)
  const { source } = input
  const verifiedSourceHash = `sha256:${createHash('sha256').update(input.source_result_bytes).digest('hex')}`
  if (verifiedSourceHash !== source.source_result_sha256) throw new TypeError('Persisted source Result hash verification failed')
  if (source.fixtures_completed !== source.fixtures_expected) throw new TypeError('Review Packet requires complete evaluation coverage')
  if (sample.source_run_id !== source.source_run_id || sample.source_result_sha256 !== source.source_result_sha256
    || sample.fixture_set_version !== source.fixture_set_version || sample.fixture_set_sha256 !== source.fixture_set_sha256) {
    throw new TypeError('Review Packet source/sample binding mismatch')
  }
  const outputs = new Map()
  for (const output of input.selected_final_outputs) {
    if (outputs.has(output.synthetic_case_ref)) throw new TypeError('Duplicate selected final output')
    outputs.set(output.synthetic_case_ref, output)
  }
  if (outputs.size !== sample.selected_cases.length) throw new TypeError('Only and all sampled final outputs may be retained')

  const items = sample.selected_cases.map((selected) => {
    const output = outputs.get(selected.case_id)
    if (!output) throw new TypeError('Selected final output is missing')
    if (output.subject_category !== selected.subject_category || output.hint_level !== selected.hint_level) {
      throw new TypeError('Selected final output does not match sampled fixture metadata')
    }
    return packetItemSchema.parse({
      review_item_ref: `hri-${domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_ITEM_REF_DOMAIN, {
        sample_manifest_sha256: sample.sample_manifest_sha256,
        synthetic_case_ref: selected.case_id,
      }).slice('sha256:'.length)}`,
      synthetic_case_ref: selected.case_id,
      subject_category: output.subject_category,
      hint_level: output.hint_level,
      expected_tutor_action: output.expected_tutor_action,
      learner_message: output.learner_message,
      final_gate_pass_proof: output.final_gate_pass_proof,
    })
  })

  const unsigned = {
    packet_contract_version: TUTOR_HUMAN_REVIEW_PACKET_VERSION,
    source_run_id: source.source_run_id,
    source_result_sha256: source.source_result_sha256,
    source_evaluation_manifest_version: source.source_evaluation_manifest_version,
    source_evaluator_version: source.source_evaluator_version,
    source_result_contract_version: source.source_result_contract_version,
    canonical_safety_contract_version: TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
    fixture_set_version: source.fixture_set_version,
    fixture_set_sha256: source.fixture_set_sha256,
    sampling_contract_version: TUTOR_HUMAN_REVIEW_SAMPLING_VERSION,
    sample_manifest_sha256: sample.sample_manifest_sha256,
    synthetic_data_only: true,
    packet_created_at: input.packet_created_at,
    packet_expires_at: tutorHumanReviewPacketDeleteAt(input.packet_created_at),
    items,
  }
  return deepFreeze(verifyTutorHumanReviewPacket({
    ...unsigned,
    packet_sha256: domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_PACKET_DOMAIN, unsigned),
  }))
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}
