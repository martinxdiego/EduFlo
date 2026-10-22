import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { generateDomainId } from '../contracts/ids.js'
import { LearningV2Error } from '../contracts/errors.js'

export const SUBMISSION_INTENT_VERSION = 'learning-v2-submission-intent-v1'
const DEFAULT_TTL_SECONDS = 2 * 60 * 60

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
}

function encode(value) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decode(value) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function intentSecret(environment = process.env) {
  const secret = environment.LEARNING_V2_SUBMISSION_INTENT_SECRET || environment.JWT_SECRET
  if (typeof secret !== 'string' || secret.length < 16) throw new LearningV2Error('INTERNAL_ERROR')
  return secret
}

function signature(payload, secret) {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('base64url')
}

export function assignmentPinsHash(taskPins) {
  const pins = [...(taskPins || [])]
    .map((pin) => ({
      question_id: pin.question_id,
      worksheet_id: pin.worksheet_id,
      task_id: pin.task_id,
      task_version: pin.task_version,
      content_hash: pin.content_hash,
      hash_version: pin.hash_version,
    }))
    .sort((left, right) => left.question_id.localeCompare(right.question_id))
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(pins))).digest('hex')}`
}

export function issueSubmissionIntent({ actor, assignment, attemptNo, now = new Date(), environment = process.env, generateId = generateDomainId }) {
  if (actor?.actor_type !== 'student' || actor.student_id !== actor.actor_id) throw new LearningV2Error('FORBIDDEN')
  if (!assignment?.learning_v2?.enabled || assignment.learning_v2.tenant_id !== actor.tenant_id) throw new LearningV2Error('FORBIDDEN')
  if (!Number.isInteger(attemptNo) || attemptNo < 1) throw new LearningV2Error('CONFLICT')
  const issuedAt = Math.floor(now.getTime() / 1000)
  const ttl = Math.min(Math.max(Number(environment.LEARNING_V2_SUBMISSION_INTENT_TTL_SECONDS) || DEFAULT_TTL_SECONDS, 300), 86_400)
  const claims = {
    version: SUBMISSION_INTENT_VERSION,
    intent_id: generateId('int'),
    tenant_id: actor.tenant_id,
    student_id: actor.student_id,
    assignment_id: assignment.id,
    learning_v2_attempt_no: attemptNo,
    pins_hash: assignmentPinsHash(assignment.learning_v2.task_pins),
    issued_at: issuedAt,
    expires_at: issuedAt + ttl,
  }
  const payload = encode(JSON.stringify(claims))
  return { token: `${payload}.${signature(payload, intentSecret(environment))}`, claims }
}

export function verifySubmissionIntent(token, { actor, assignment, now = new Date(), environment = process.env }) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 8_000) throw new LearningV2Error('VALIDATION_ERROR')
  const parts = token.split('.')
  if (parts.length !== 2) throw new LearningV2Error('VALIDATION_ERROR')
  const [payload, providedSignature] = parts
  const expectedSignature = signature(payload, intentSecret(environment))
  const expected = Buffer.from(expectedSignature)
  const provided = Buffer.from(providedSignature)
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) throw new LearningV2Error('VALIDATION_ERROR')
  let claims
  try { claims = JSON.parse(decode(payload)) } catch { throw new LearningV2Error('VALIDATION_ERROR') }
  const nowSeconds = Math.floor(now.getTime() / 1000)
  if (claims.version !== SUBMISSION_INTENT_VERSION
    || typeof claims.intent_id !== 'string'
    || claims.tenant_id !== actor?.tenant_id
    || claims.student_id !== actor?.student_id
    || claims.assignment_id !== assignment?.id
    || !Number.isInteger(claims.learning_v2_attempt_no)
    || claims.learning_v2_attempt_no < 1
    || !Number.isInteger(claims.issued_at)
    || !Number.isInteger(claims.expires_at)
    || claims.issued_at > nowSeconds + 60
    || claims.expires_at < nowSeconds
    || claims.pins_hash !== assignmentPinsHash(assignment?.learning_v2?.task_pins)) {
    throw new LearningV2Error('VALIDATION_ERROR')
  }
  return Object.freeze(claims)
}
