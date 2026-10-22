export const TUTOR_HUMAN_REVIEW_PACKET_RETENTION_DAYS = 180
export const TUTOR_HUMAN_REVIEW_TERMINAL_GRACE_DAYS = 30
export const TUTOR_HUMAN_REVIEW_RECORD_RETENTION_DAYS = 365

const DAY_MS = 24 * 60 * 60 * 1000
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

export function parseCanonicalReviewTimestamp(value) {
  if (typeof value !== 'string' || !timestampPattern.test(value)) throw new TypeError('Review timestamp must use RFC 3339 UTC milliseconds')
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new TypeError('Review timestamp is invalid or non-canonical')
  return date
}

function addDays(value, days) {
  return new Date(parseCanonicalReviewTimestamp(value).getTime() + days * DAY_MS).toISOString()
}

export function tutorHumanReviewPacketDeleteAt(packetCreatedAt, terminalAt = null) {
  const maximum = addDays(packetCreatedAt, TUTOR_HUMAN_REVIEW_PACKET_RETENTION_DAYS)
  if (terminalAt === null) return maximum
  const terminalExpiry = addDays(terminalAt, TUTOR_HUMAN_REVIEW_TERMINAL_GRACE_DAYS)
  return parseCanonicalReviewTimestamp(terminalExpiry) < parseCanonicalReviewTimestamp(maximum) ? terminalExpiry : maximum
}

export function tutorHumanReviewRecordDeleteAt(reviewRefCreatedAt) {
  return addDays(reviewRefCreatedAt, TUTOR_HUMAN_REVIEW_RECORD_RETENTION_DAYS)
}

export function assertTutorHumanReviewMaterialActive(expiresAt, trustedNow) {
  const expires = parseCanonicalReviewTimestamp(expiresAt)
  const current = trustedNow instanceof Date ? trustedNow : parseCanonicalReviewTimestamp(trustedNow)
  if (!Number.isFinite(current.getTime())) throw new TypeError('Current review time is invalid')
  if (current.getTime() >= expires.getTime()) {
    const error = new Error('Human review material has expired')
    error.code = 'REVIEW_MATERIAL_EXPIRED'
    throw error
  }
  return true
}

export const TUTOR_HUMAN_REVIEW_RETENTION_POLICY = Object.freeze({
  scope: 'DEVELOPMENT_EVALUATION_ENGINEERING_POLICY_ONLY',
  legal_retention_claim: false,
  packet_active_retention_days: TUTOR_HUMAN_REVIEW_PACKET_RETENTION_DAYS,
  packet_terminal_grace_days: TUTOR_HUMAN_REVIEW_TERMINAL_GRACE_DAYS,
  record_set_active_retention_days: TUTOR_HUMAN_REVIEW_RECORD_RETENTION_DAYS,
  deletion_scope: 'ACTIVE_BRANCH_REVIEWED_COMMIT_ONLY',
  git_history_erasure_claim: false,
  backup_erasure_claim: false,
})
