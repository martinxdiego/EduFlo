import {
  evaluateTutorCandidateSafety,
  TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
} from './canonical-safety-gates.js'

export const TUTOR_RUNTIME_SAFETY_CONTRACT_VERSION = TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION

export function validateTutorCandidate(candidate, { level, correctAnswer, options = [] }) {
  const checked = evaluateTutorCandidateSafety(candidate, { level, correctAnswer, options })
  return checked.passed
    ? { valid: true, value: checked.value }
    : { valid: false, code: checked.code }
}
