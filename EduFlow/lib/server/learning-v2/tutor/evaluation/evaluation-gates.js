import { localTutorFallback } from '../fallback-registry.js'
import {
  evaluateTutorCandidateSafety,
  TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
} from '../canonical-safety-gates.js'

export const TUTOR_EVALUATION_SAFETY_CONTRACT_VERSION = TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION

export function evaluateTutorCandidate(candidate, fixture) {
  const checked = evaluateTutorCandidateSafety(candidate, fixture)
  return Object.freeze({ passed: checked.passed, code: checked.code })
}

export function verifyIndependentLocalFallback(fixtures) {
  for (const fixture of fixtures) {
    const checked = evaluateTutorCandidateSafety(localTutorFallback(fixture.level), fixture)
    if (!checked.passed) return Object.freeze({ passed: false, code: `LOCAL_FALLBACK_${checked.code}` })
  }
  return Object.freeze({ passed: true, code: null })
}
