import { TUTOR_ACTION_BY_LEVEL, TUTOR_PROVIDER_SCHEMA_VERSION } from '../contracts/phase3.js'

const MESSAGES = Object.freeze({
  1: 'Welche Information in der Aufgabe ist für deine Entscheidung am wichtigsten?',
  2: 'Vergleiche die Aussagen einzeln mit dem, was die Aufgabe tatsächlich verlangt.',
  3: 'Ordne zuerst den zentralen Begriff ein und prüfe dann, welche Aussage dazu passt.',
})
const REASONS = Object.freeze({ 1: 'METACOGNITIVE_CHECK', 2: 'DIRECTIONAL_NUDGE', 3: 'CONCEPTUAL_NUDGE' })

export function localTutorFallback(level) {
  if (![1, 2, 3].includes(level)) throw new TypeError('Unsupported tutor hint level')
  return Object.freeze({
    schema_version: TUTOR_PROVIDER_SCHEMA_VERSION,
    action: TUTOR_ACTION_BY_LEVEL[level],
    hint_level: level,
    learner_message: MESSAGES[level],
    reason_code: REASONS[level],
    teacher_attention: false,
  })
}
