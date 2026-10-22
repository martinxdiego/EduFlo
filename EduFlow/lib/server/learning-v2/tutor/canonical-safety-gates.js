import { tutorProviderResponseSchema, TUTOR_ACTION_BY_LEVEL, TUTOR_REASON_BY_LEVEL } from '../contracts/phase3.js'

export const TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION = 'tutor-canonical-safety-gates-v1'
export const TUTOR_STRICT_VALUE_MENTION_CONTRACT_VERSION = 'tutor-direct-answer-leakage-v1'
export const TUTOR_STRICT_VALUE_MENTION_POLICY = 'STRICT_VALUE_MENTION'

export const TUTOR_CANONICAL_SAFETY_GATE_ORDER = Object.freeze([
  'STRICT_SCHEMA',
  'HINT_LEVEL',
  'ACTION',
  'REASON',
  'DIRECT_ANSWER',
  'ANSWER_INDEX',
  'ELIMINATION',
  'UNSAFE_OUTPUT',
  'FORBIDDEN_AUTHORITY',
  'FULL_SOLUTION',
  'LOCALE_DE_CH',
])

export const TUTOR_CANONICAL_FAILURE_GATE_BY_CODE = Object.freeze({
  SCHEMA_INVALID: 'STRICT_SCHEMA',
  WRONG_LEVEL: 'HINT_LEVEL',
  WRONG_ACTION: 'ACTION',
  WRONG_REASON: 'REASON',
  DIRECT_ANSWER_LEAKAGE: 'DIRECT_ANSWER',
  ANSWER_INDEX_LEAKAGE: 'ANSWER_INDEX',
  ELIMINATION_LEAKAGE: 'ELIMINATION',
  UNSAFE_OUTPUT: 'UNSAFE_OUTPUT',
  FORBIDDEN_AUTHORITY: 'FORBIDDEN_AUTHORITY',
  FULL_SOLUTION: 'FULL_SOLUTION',
  LOCALE_DE_CH_VIOLATION: 'LOCALE_DE_CH',
})

export const TUTOR_CANONICAL_SAFETY_CONTRACT = Object.freeze({
  contract_version: TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
  leakage_contract_version: TUTOR_STRICT_VALUE_MENTION_CONTRACT_VERSION,
  leakage_policy: TUTOR_STRICT_VALUE_MENTION_POLICY,
  gate_order: TUTOR_CANONICAL_SAFETY_GATE_ORDER,
  provider_candidate_is_untrusted: true,
  rejected_candidate_action: 'DISCARD_WHOLE_CANDIDATE',
  sanitization_allowed: false,
  final_output_must_pass: true,
})

const FORBIDDEN_AUTHORITY = /\b(?:tenant|identity|identität|rolle|role|policy|richtlinie|mastery|beherrschung|confidence|konfidenz|evidence|evidenz|grade|note|bewertung)\b/iu
const FULL_SOLUTION = /(?:vollständige|komplette|ganze)\s+(?:lösung|rechnung)|(?:lösung|antwort)\s*(?:ist|lautet)|schritt\s*1\s*[:.)].*schritt\s*2/isu

function normalized(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('de-CH').replace(/\s+/g, ' ').trim()
}

function escaped(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function pointBefore(value, index) { return Array.from(value.slice(0, index)).at(-1) || '' }
function pointAfter(value, index) { return Array.from(value.slice(index)).at(0) || '' }
function isUnicodeBoundary(value) { return !value || !/[\p{L}\p{N}]/u.test(value) }

function boundaryClass(value, edge) {
  if (!value) return edge
  if (/\s/u.test(value)) return 'WHITESPACE'
  if (/\p{P}/u.test(value)) return 'PUNCTUATION'
  if (/\p{S}/u.test(value)) return 'SYMBOL'
  return 'OTHER'
}

function answerRepresentationClass(answer) {
  if (/^[+-]?(?:\d+(?:[.,]\d+)?)$/u.test(answer)) return 'NUMERIC'
  if (/\s/u.test(answer)) return 'PHRASE'
  if (/^[\p{L}\p{N}]+$/u.test(answer)) return answer.length < 3 ? 'SHORT_TOKEN' : 'LONG_TOKEN'
  return 'OTHER'
}

function answerLengthBucket(length) {
  if (length <= 2) return '1_2'
  if (length <= 5) return '3_5'
  if (length <= 20) return '6_20'
  return 'GT_20'
}

function longBoundaryMatches(message, answer) {
  const matches = []
  for (let offset = 0; offset <= message.length - answer.length;) {
    const index = message.indexOf(answer, offset)
    if (index < 0) break
    const left = pointBefore(message, index)
    const right = pointAfter(message, index + answer.length)
    if (isUnicodeBoundary(left) && isUnicodeBoundary(right)) matches.push({ index, left, right })
    offset = index + Math.max(answer.length, 1)
  }
  return matches
}

function shortCuedMatches(message, answer) {
  const matches = []
  const expression = new RegExp(`(?:antwort|lösung|wähle|ist)\\s*(${escaped(answer)})(?:\\b|$)`, 'giu')
  for (const match of message.matchAll(expression)) {
    const relative = match[0].lastIndexOf(match[1])
    const index = match.index + relative
    matches.push({ index, left: pointBefore(message, index), right: pointAfter(message, index + answer.length) })
  }
  return matches
}

function directAnswerMatch(message, answer) {
  if (!answer) return null
  let leakageSubcode
  let matches
  if (answer.length < 3 && message === answer) {
    leakageSubcode = 'FULL_MESSAGE'
    matches = [{ index: 0, left: '', right: '' }]
  } else if (answer.length < 3) {
    leakageSubcode = 'SHORT_CUED'
    matches = shortCuedMatches(message, answer)
  } else {
    leakageSubcode = 'LONG_UNICODE_BOUNDARY'
    matches = longBoundaryMatches(message, answer)
  }
  if (!matches.length) return null
  const first = matches[0]
  const cuePrefix = message.slice(0, first.index)
  return Object.freeze({
    leakage_contract_version: TUTOR_STRICT_VALUE_MENTION_CONTRACT_VERSION,
    leakage_subcode: leakageSubcode,
    response_field: 'learner_message',
    answer_representation_class: answerRepresentationClass(answer),
    normalized_answer_length_bucket: answerLengthBucket(answer.length),
    cue_present: leakageSubcode === 'SHORT_CUED' || /(?:antwort|lösung|wähle|ist)\s*$/iu.test(cuePrefix),
    left_boundary_class: boundaryClass(first.left, 'STRING_START'),
    right_boundary_class: boundaryClass(first.right, 'STRING_END'),
    match_count_bucket: matches.length === 1 ? 'ONE' : 'MULTIPLE',
    raw_answer_retained: false,
    raw_response_retained: false,
  })
}

export function canonicalGateResults(code = null) {
  const failedGate = code ? TUTOR_CANONICAL_FAILURE_GATE_BY_CODE[code] : null
  if (code && !failedGate) throw new Error('CANONICAL_SAFETY_GATE_CODE_UNMAPPED')
  const failedIndex = failedGate ? TUTOR_CANONICAL_SAFETY_GATE_ORDER.indexOf(failedGate) : -1
  return Object.freeze(TUTOR_CANONICAL_SAFETY_GATE_ORDER.map((gate, index) => Object.freeze({
    gate,
    state: failedIndex < 0 ? 'PASS' : index < failedIndex ? 'PASS' : index === failedIndex ? 'FAIL' : 'NOT_REACHED',
  })))
}

export function canonicalNotReachedGateResults() {
  return Object.freeze(TUTOR_CANONICAL_SAFETY_GATE_ORDER.map((gate) => Object.freeze({ gate, state: 'NOT_REACHED' })))
}

function result({ code = null, value, failureDetail = null }) {
  return Object.freeze({
    contract_version: TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
    passed: code === null,
    code,
    gate_results: canonicalGateResults(code),
    failure_detail: failureDetail,
    ...(code === null ? { value } : {}),
  })
}

export function evaluateTutorCandidateSafety(candidate, { level, correctAnswer, options = [] }) {
  const parsed = tutorProviderResponseSchema.safeParse(candidate)
  if (!parsed.success) return result({ code: 'SCHEMA_INVALID' })
  if (parsed.data.hint_level !== level) return result({ code: 'WRONG_LEVEL' })
  if (parsed.data.action !== TUTOR_ACTION_BY_LEVEL[level]) return result({ code: 'WRONG_ACTION' })
  if (parsed.data.reason_code !== TUTOR_REASON_BY_LEVEL[level]) return result({ code: 'WRONG_REASON' })

  const message = normalized(parsed.data.learner_message)
  const answer = normalized(correctAnswer)
  const directAnswer = directAnswerMatch(message, answer)
  if (directAnswer) return result({ code: 'DIRECT_ANSWER_LEAKAGE', failureDetail: directAnswer })

  const correctIndex = options.findIndex((option) => normalized(option) === answer)
  if (correctIndex >= 0) {
    const letter = String.fromCharCode(65 + correctIndex)
    const alias = new RegExp(`(?:antwort|option|lösung|wähle|ist)\\s*(?:${correctIndex + 1}|${letter})\\b|\\b${letter}\\)`, 'i')
    if (alias.test(parsed.data.learner_message)) return result({ code: 'ANSWER_INDEX_LEAKAGE' })
  }

  const wrongOptions = options.filter((option) => normalized(option) !== answer).map(normalized).filter(Boolean)
  const eliminated = wrongOptions.filter((option) => new RegExp(`(?:nicht|falsch|scheidet\\s+aus)[^.]{0,60}${escaped(option)}|${escaped(option)}[^.]{0,60}(?:nicht|falsch|scheidet\\s+aus)`, 'i').test(message))
  if (wrongOptions.length && eliminated.length === wrongOptions.length) return result({ code: 'ELIMINATION_LEAKAGE' })
  if (/ignoriere|system[- ]?prompt|interne regel|richtige antwort|lösung lautet/i.test(message)) return result({ code: 'UNSAFE_OUTPUT' })
  if (FORBIDDEN_AUTHORITY.test(message)) return result({ code: 'FORBIDDEN_AUTHORITY' })
  if (FULL_SOLUTION.test(message)) return result({ code: 'FULL_SOLUTION' })
  if (/ß/u.test(parsed.data.learner_message)) return result({ code: 'LOCALE_DE_CH_VIOLATION' })
  return result({ value: parsed.data })
}
