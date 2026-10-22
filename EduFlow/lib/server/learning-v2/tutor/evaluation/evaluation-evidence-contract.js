import { z } from 'zod'
import {
  evaluateTutorCandidateSafety,
  TUTOR_CANONICAL_FAILURE_GATE_BY_CODE,
  TUTOR_CANONICAL_SAFETY_GATE_ORDER,
  TUTOR_STRICT_VALUE_MENTION_CONTRACT_VERSION,
  TUTOR_STRICT_VALUE_MENTION_POLICY,
} from '../canonical-safety-gates.js'

// These contracts are historical. Prospective system-safety evaluation uses
// evaluator v5/result v3 without rewriting consumed v4/v2 evidence.
export const TUTOR_EVALUATOR_CONTRACT_VERSION = 'tutor-paid-evaluator-v4'
export const TUTOR_EVALUATION_RESULT_CONTRACT_VERSION = 'tutor-paid-evaluation-result-v2'
export const TUTOR_LEAKAGE_CONTRACT_VERSION = TUTOR_STRICT_VALUE_MENTION_CONTRACT_VERSION
export const TUTOR_LEAKAGE_POLICY = TUTOR_STRICT_VALUE_MENTION_POLICY
export const TUTOR_EVALUATION_GATE_ORDER = TUTOR_CANONICAL_SAFETY_GATE_ORDER

const gateStateSchema = z.enum(['PASS', 'FAIL', 'NOT_REACHED'])
const gateResultSchema = z.object({
  gate: z.enum(TUTOR_EVALUATION_GATE_ORDER),
  state: gateStateSchema,
}).strict()

export const tutorLeakageEvidenceSchema = z.object({
  leakage_contract_version: z.literal(TUTOR_LEAKAGE_CONTRACT_VERSION),
  leakage_subcode: z.enum(['FULL_MESSAGE', 'SHORT_CUED', 'LONG_UNICODE_BOUNDARY']),
  response_field: z.literal('learner_message'),
  answer_representation_class: z.enum(['SHORT_TOKEN', 'LONG_TOKEN', 'NUMERIC', 'PHRASE', 'OTHER']),
  normalized_answer_length_bucket: z.enum(['1_2', '3_5', '6_20', 'GT_20']),
  cue_present: z.boolean(),
  left_boundary_class: z.enum(['STRING_START', 'WHITESPACE', 'PUNCTUATION', 'SYMBOL', 'OTHER']),
  right_boundary_class: z.enum(['STRING_END', 'WHITESPACE', 'PUNCTUATION', 'SYMBOL', 'OTHER']),
  match_count_bucket: z.enum(['ONE', 'MULTIPLE']),
  raw_answer_retained: z.literal(false),
  raw_response_retained: z.literal(false),
}).strict()

export const tutorEvaluationCaseResultSchema = z.object({
  evaluator_contract_version: z.literal(TUTOR_EVALUATOR_CONTRACT_VERSION),
  result_contract_version: z.literal(TUTOR_EVALUATION_RESULT_CONTRACT_VERSION),
  leakage_policy: z.literal(TUTOR_LEAKAGE_POLICY),
  case_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/),
  repetition: z.number().int().positive(),
  passed: z.boolean(),
  code: z.enum(Object.keys(TUTOR_CANONICAL_FAILURE_GATE_BY_CODE)).nullable(),
  gate_results: z.array(gateResultSchema).length(TUTOR_EVALUATION_GATE_ORDER.length),
  leakage_evidence: tutorLeakageEvidenceSchema.nullable(),
  raw_prompt_retained: z.literal(false),
  raw_provider_response_retained: z.literal(false),
}).strict().superRefine((value, context) => {
  for (const [index, gate] of TUTOR_EVALUATION_GATE_ORDER.entries()) {
    if (value.gate_results[index]?.gate !== gate) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['gate_results', index, 'gate'], message: 'Gate order mismatch' })
    }
  }
  const failureGate = value.code ? TUTOR_CANONICAL_FAILURE_GATE_BY_CODE[value.code] : null
  const failureIndex = failureGate ? TUTOR_EVALUATION_GATE_ORDER.indexOf(failureGate) : -1
  for (const [index, gate] of value.gate_results.entries()) {
    const expected = failureIndex < 0 ? 'PASS' : index < failureIndex ? 'PASS' : index === failureIndex ? 'FAIL' : 'NOT_REACHED'
    if (gate.state !== expected) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['gate_results', index, 'state'], message: `Expected ${expected}` })
    }
  }
  if (value.passed !== (value.code === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['passed'], message: 'Passed/code mismatch' })
  }
  if ((value.code === 'DIRECT_ANSWER_LEAKAGE') !== (value.leakage_evidence !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['leakage_evidence'], message: 'Leakage evidence/code mismatch' })
  }
})

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

export function evaluateTutorCandidateWithEvidence(candidate, fixture, { repetition = 1 } = {}) {
  const checked = evaluateTutorCandidateSafety(candidate, fixture)
  const bounded = tutorEvaluationCaseResultSchema.parse({
    evaluator_contract_version: TUTOR_EVALUATOR_CONTRACT_VERSION,
    result_contract_version: TUTOR_EVALUATION_RESULT_CONTRACT_VERSION,
    leakage_policy: TUTOR_LEAKAGE_POLICY,
    case_id: fixture.case_id,
    repetition,
    passed: checked.passed,
    code: checked.code,
    gate_results: checked.gate_results,
    leakage_evidence: checked.code === 'DIRECT_ANSWER_LEAKAGE' ? checked.failure_detail : null,
    raw_prompt_retained: false,
    raw_provider_response_retained: false,
  })
  return deepFreeze(bounded)
}
