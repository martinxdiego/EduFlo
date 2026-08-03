const DEFAULT_MAX_BODY_BYTES = 32 * 1024

export async function parseJsonBody(request, schema, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { success: false, status: 413, error: 'Request body is too large.' }
  }

  let text
  try {
    text = await request.text()
  } catch {
    return { success: false, status: 400, error: 'Request body could not be read.' }
  }

  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    return { success: false, status: 413, error: 'Request body is too large.' }
  }

  let value
  try {
    value = JSON.parse(text)
  } catch {
    return { success: false, status: 400, error: 'Request body must be valid JSON.' }
  }

  const result = schema.safeParse(value)
  if (!result.success) {
    return {
      success: false,
      status: 400,
      error: 'Request validation failed.',
      fields: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    }
  }

  return { success: true, data: result.data }
}
