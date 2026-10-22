export const TUTOR_PROVIDER_DIAGNOSTIC_VERSION = 'tutor-paid-evaluation-provider-diagnostic-v1'
export const TUTOR_PROVIDER_FAILURE_CODES = Object.freeze([
  'PROVIDER_TIMEOUT',
  'PROVIDER_HTTP_429',
  'PROVIDER_HTTP_5XX',
  'PROVIDER_HTTP_4XX',
  'PROVIDER_NETWORK_ERROR',
  'PROVIDER_SCHEMA_PARSE_ERROR',
  'PROVIDER_UNKNOWN_ERROR',
  'PROVIDER_USAGE_MISSING',
])

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETDOWN', 'ENETUNREACH',
  'ENOTFOUND', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET',
])

function diagnostic(reasonCode, category, values = {}) {
  return Object.freeze({
    diagnostic_version: TUTOR_PROVIDER_DIAGNOSTIC_VERSION,
    reason_code: reasonCode,
    category,
    http_response_known: false,
    http_status: null,
    structured_output_parse_reached: false,
    raw_error_retained: false,
    ...values,
  })
}

export function paidEvaluationUsageMissingDiagnostic() {
  return diagnostic('PROVIDER_USAGE_MISSING', 'usage_missing', {
    structured_output_parse_reached: true,
  })
}

export function classifyPaidEvaluationProviderError(error) {
  const chain = []
  const seen = new Set()
  let current = error
  while (current && typeof current === 'object' && !seen.has(current) && chain.length < 5) {
    seen.add(current)
    chain.push(current)
    current = current.cause && typeof current.cause === 'object'
      ? current.cause
      : current.error && typeof current.error === 'object' ? current.error : null
  }
  const names = new Set(chain.map((item) => typeof item.name === 'string' ? item.name : '').filter(Boolean))
  const codes = new Set(chain.map((item) => typeof item.code === 'string' ? item.code : '').filter(Boolean))
  const status = Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599
    ? error.status
    : null

  if (['APIConnectionTimeoutError', 'APIUserAbortError', 'AbortError'].some((name) => names.has(name))
    || ['ABORT_ERR', 'ETIMEDOUT'].some((code) => codes.has(code))) {
    return diagnostic('PROVIDER_TIMEOUT', 'timeout')
  }
  if (status === 429) {
    return diagnostic('PROVIDER_HTTP_429', 'rate_or_quota', {
      http_response_known: true,
      http_status: status,
    })
  }
  if (status !== null && status >= 500) {
    return diagnostic('PROVIDER_HTTP_5XX', 'provider_transient', {
      http_response_known: true,
      http_status: status,
    })
  }
  if (status !== null && status >= 400) {
    return diagnostic('PROVIDER_HTTP_4XX', 'request_or_account', {
      http_response_known: true,
      http_status: status,
    })
  }
  if (names.has('APIConnectionError') || [...codes].some((code) => NETWORK_ERROR_CODES.has(code))) {
    return diagnostic('PROVIDER_NETWORK_ERROR', 'network_transport')
  }
  if (names.has('ZodError') || names.has('SyntaxError')
    || error?.message === 'Tutor provider returned no parsed output') {
    return diagnostic('PROVIDER_SCHEMA_PARSE_ERROR', 'structured_output_parse', {
      structured_output_parse_reached: true,
    })
  }
  return diagnostic('PROVIDER_UNKNOWN_ERROR', 'unknown', {
    structured_output_parse_reached: null,
  })
}
