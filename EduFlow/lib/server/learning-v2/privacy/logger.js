import { logEvent } from '../../logger.js'
import { redactLearningV2LogMetadata } from './redaction.js'

export function learningV2Log(level, event, metadata = {}, sink = logEvent) {
  const safe = redactLearningV2LogMetadata({ learning_v2: true, ...metadata })
  sink(level, event, safe)
  return safe
}
