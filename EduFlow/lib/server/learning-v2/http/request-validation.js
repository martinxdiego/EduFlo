import { LearningV2Error, validationError } from '../contracts/errors.js'

export function parseLearningV2Value(schema, value) {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw validationError(parsed.error)
  return parsed.data
}

export async function readLearningV2Json(request) {
  try {
    return await request.json()
  } catch {
    throw new LearningV2Error('VALIDATION_ERROR')
  }
}

export function learningV2SearchParams(request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries())
}
