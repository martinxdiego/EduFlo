import { randomUUID } from 'crypto'

export const LEARNING_V2_ERROR_CODES = Object.freeze({
  UNAUTHENTICATED: { status: 401, message: 'Authentication is required.' },
  FORBIDDEN: { status: 403, message: 'You are not permitted to perform this operation.' },
  NOT_FOUND: { status: 404, message: 'The requested resource was not found.' },
  VALIDATION_ERROR: { status: 400, message: 'The request is invalid.' },
  CONFLICT: { status: 409, message: 'The request conflicts with the current state.' },
  OPERATION_IN_PROGRESS: { status: 409, message: 'The requested operation is already in progress.' },
  RECOMMENDATION_STALE: { status: 409, message: 'The recommendation is no longer current. Refresh the evaluation.' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'Recommendations are temporarily unavailable.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests.' },
  INTERNAL_ERROR: { status: 500, message: 'An internal error occurred.' },
})

export class LearningV2Error extends Error {
  constructor(code, options = {}) {
    const definition = LEARNING_V2_ERROR_CODES[code] || LEARNING_V2_ERROR_CODES.INTERNAL_ERROR
    super(definition.message, options.cause ? { cause: options.cause } : undefined)
    this.name = 'LearningV2Error'
    this.code = LEARNING_V2_ERROR_CODES[code] ? code : 'INTERNAL_ERROR'
    this.status = definition.status
    this.details = options.details
    this.retryAfterSeconds = options.retryAfterSeconds
  }
}

export function validationError(error) {
  const issues = Array.isArray(error?.issues)
    ? error.issues.slice(0, 20).map((issue) => ({
        path: issue.path.map(String).join('.'),
        code: String(issue.code || 'invalid'),
      }))
    : undefined
  return new LearningV2Error('VALIDATION_ERROR', { details: issues ? { issues } : undefined })
}

export function learningV2ErrorPayload(error, requestId = randomUUID()) {
  const safeError = error instanceof LearningV2Error
    ? error
    : new LearningV2Error('INTERNAL_ERROR', { cause: error })
  const payload = {
    error: {
      code: safeError.code,
      message: LEARNING_V2_ERROR_CODES[safeError.code].message,
      request_id: requestId,
    },
  }
  if (safeError.code === 'VALIDATION_ERROR' && safeError.details) {
    payload.error.details = safeError.details
  }
  const replacement = safeError.details?.replacement
  if (safeError.code === 'RECOMMENDATION_STALE' && replacement?.status === 'presented'
    && /^rec_[0-9a-f-]{36}$/.test(replacement.recommendation_id || '')
    && ['TRY_SIMILAR', 'REVIEW_CONCEPT', 'TEACHER_INTERVENTION'].includes(replacement.type)) {
    payload.error.replacement = { recommendation_id: replacement.recommendation_id, type: replacement.type, status: 'presented' }
  }
  return { status: safeError.status, payload, retryAfterSeconds: safeError.retryAfterSeconds }
}

export function learningV2ErrorResponse(error, requestId) {
  const mapped = learningV2ErrorPayload(error, requestId)
  const headers = { 'Cache-Control': 'no-store' }
  if (mapped.retryAfterSeconds) headers['Retry-After'] = String(mapped.retryAfterSeconds)
  return Response.json(mapped.payload, { status: mapped.status, headers })
}
