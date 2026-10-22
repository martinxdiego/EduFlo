import { createHmac } from 'crypto'
import { contextManifestSchema } from '../contracts/schemas.js'

const SENSITIVE_KEY = /(?:answer|content|display.?name|email|first.?name|last.?name|learner.?name|note|comment|password|secret|token|authorization|cookie|prompt|response|transcript|credential)/i
const DIRECT_IDENTIFIER_KEY = /(?:(?:actor|student|teacher|tenant|user|assignment|session|submission|question|task|objective|competency|evidence|recommendation|attempt|event|worksheet|class).?id|ip|device)/i
const EMAIL_VALUE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/i
const JWT_VALUE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u
const UUID_VALUE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i
const DOMAIN_ID_VALUE = /\b(?:ten|stu|tch|usr|asg|ses|sub|att|evd|rec|tsk|obj|cmp|frm|pol|evt|wqi)_[A-Za-z0-9_-]{8,}\b/u
const DESCRIPTIVE_ID_VALUE = /\b(?:tenant|student|teacher|assignment|session|submission|attempt|evidence|recommendation|question)[-_][A-Za-z0-9][A-Za-z0-9_-]{7,}\b/i
const STATIC_ROUTE_ID_VALUE = /^(?:GET|POST|PUT|PATCH|DELETE|OPTIONS) \/api\/v2\/learning(?:\/(?:[a-z0-9-]+|\[[A-Za-z][A-Za-z0-9]*\]))*$/iu
const MAX_LOG_STRING = 300

export function correlatedLearningV2LogId(value, options = {}) {
  if (value === undefined || value === null || value === '') return undefined
  const key = options.key
  const environment = options.environment
  if (typeof key !== 'string' || key.length < 32) throw new Error('Learning V2 log HMAC key must contain at least 32 characters')
  if (typeof environment !== 'string' || !environment.trim()) throw new Error('Learning V2 log HMAC environment is required')
  return `hmac256:${createHmac('sha256', key).update(`${environment.trim()}\u0000${String(value)}`).digest('hex').slice(0, 24)}`
}

export function pseudonymousLogId(value, environment = process.env) {
  return correlatedLearningV2LogId(value, {
    key: environment.LEARNING_V2_LOG_HMAC_KEY,
    environment: environment.LEARNING_V2_LOG_ENVIRONMENT || environment.NODE_ENV,
  })
}

function decoded(value) {
  try { return decodeURIComponent(value) } catch { return value }
}

function containsDynamicOrSecretValue(value) {
  const candidates = [value, decoded(value)]
  return candidates.some((candidate) => EMAIL_VALUE.test(candidate) || BEARER_VALUE.test(candidate)
    || JWT_VALUE.test(candidate) || UUID_VALUE.test(candidate) || DOMAIN_ID_VALUE.test(candidate)
    || DESCRIPTIVE_ID_VALUE.test(candidate) || /(?:^|\s)https?:\/\//iu.test(candidate)
    || /\/api\/v2\/learning\//iu.test(candidate) || /(?:^|[?&])[^=\s&]+=[^\s&]*/u.test(candidate))
}

function sanitizeValue(value, key, depth) {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]'
  if (DIRECT_IDENTIFIER_KEY.test(key)) return '[OMITTED]'
  if (depth > 5) return '[TRUNCATED]'
  if (value instanceof Error) return { name: value.name || 'Error', code: value.code }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeValue(item, key, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 100).map(([childKey, childValue]) => (
      [childKey, sanitizeValue(childValue, childKey, depth + 1)]
    )))
  }
  if (typeof value === 'string') {
    if (key === 'route_id' && STATIC_ROUTE_ID_VALUE.test(value)) return value.slice(0, MAX_LOG_STRING)
    if (containsDynamicOrSecretValue(value)) return '[REDACTED]'
    return value.slice(0, MAX_LOG_STRING)
  }
  return ['number', 'boolean'].includes(typeof value) || value == null ? value : String(value).slice(0, MAX_LOG_STRING)
}

export function redactLearningV2LogMetadata(metadata = {}) {
  return sanitizeValue(metadata, 'metadata', 0)
}

export function createContextManifest(categories, options = {}) {
  return contextManifestSchema.parse({
    context_categories: [...new Set(categories)],
    contains_direct_identifier: options.containsDirectIdentifier === true,
  })
}
