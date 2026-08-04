import { randomUUID } from 'crypto'

function safeError(error) {
  if (!error) return undefined
  return {
    name: error.name || 'Error',
    message: String(error.message || error).slice(0, 500),
    code: error.code,
    status: error.status,
  }
}

export function requestContext(request, route, extra = {}) {
  return {
    requestId: request?.headers?.get?.('x-vercel-id') || randomUUID(),
    route,
    startedAt: Date.now(),
    ...extra,
  }
}

export function logEvent(level, message, context = {}) {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  }
  if (payload.error instanceof Error) payload.error = safeError(payload.error)
  const output = JSON.stringify(payload)
  if (level === 'error') console.error(output)
  else if (level === 'warn') console.warn(output)
  else console.log(output)
}

export function logComplete(context, extra = {}) {
  logEvent('info', 'request.completed', {
    ...context,
    durationMs: Date.now() - context.startedAt,
    startedAt: undefined,
    ...extra,
  })
}

export function logFailure(context, error, extra = {}) {
  logEvent('error', 'request.failed', {
    ...context,
    durationMs: Date.now() - context.startedAt,
    startedAt: undefined,
    error,
    ...extra,
  })
}
