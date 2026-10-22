import { LearningV2Error } from '../contracts/errors.js'
import { resolveHostingCapabilities } from '../../hosting-capabilities-v1.js'

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on'])

// Capabilities are not a linear phase chain: teacher control can use historical
// facts while ingestion/Tutor are off; Tutor may use existing canonical Attempts.
// No production override exists, including for base definition authoring/reads.
export function resolveLearningV2Capabilities(environment = process.env) {
  const requested = (name) => ENABLED_VALUES.has(String(environment[name] || '').trim().toLowerCase())
  const hosting = resolveHostingCapabilities(environment)
  const allowed = (name) => ['development', 'staging'].includes(hosting.environment) && hosting.features.includes(`learning_v2.${name}`)
  const definitions = allowed('definitions') && requested('LEARNING_V2_ENABLED')
  const ingestion = definitions && allowed('ingestion') && requested('LEARNING_V2_PHASE_2_ENABLED')
  const tutor = definitions && allowed('tutor') && requested('LEARNING_V2_PHASE_3_ENABLED')
  const reflection = tutor && allowed('reflection') && requested('LEARNING_V2_PHASE_3B_ENABLED')
  const teacher = definitions && allowed('teacher') && requested('LEARNING_V2_PHASE_4_ENABLED')
  const recommendations = teacher && allowed('recommendations') && requested('LEARNING_V2_PHASE_5_ENABLED')
  return Object.freeze({ definitions, ingestion, tutor, reflection, teacher, recommendations })
}

export function requireLearningV2Capability(capability, environment = process.env) {
  if (resolveLearningV2Capabilities(environment)[capability] !== true) throw new LearningV2Error('NOT_FOUND')
}

export function isLearningV2Enabled(environment = process.env) {
  return resolveLearningV2Capabilities(environment).definitions
}

export function requireLearningV2Enabled(environment = process.env) {
  if (!isLearningV2Enabled(environment)) {
    // Deliberately look unavailable rather than revealing rollout state.
    throw new LearningV2Error('NOT_FOUND')
  }
}

export function isLearningV2Phase2DevelopmentEnabled(environment = process.env) {
  return resolveLearningV2Capabilities(environment).ingestion
}

export function requireLearningV2Phase2DevelopmentEnabled(environment = process.env) {
  if (!isLearningV2Phase2DevelopmentEnabled(environment)) throw new LearningV2Error('NOT_FOUND')
}

export function isLearningV2Phase3DevelopmentEnabled(environment = process.env) {
  return resolveLearningV2Capabilities(environment).tutor
}

export function requireLearningV2Phase3DevelopmentEnabled(environment = process.env) {
  if (!isLearningV2Phase3DevelopmentEnabled(environment)) throw new LearningV2Error('NOT_FOUND')
}

export function isLearningV2Phase3bDevelopmentEnabled(environment = process.env) {
  return resolveLearningV2Capabilities(environment).reflection
}

export function requireLearningV2Phase3bDevelopmentEnabled(environment = process.env) {
  if (!isLearningV2Phase3bDevelopmentEnabled(environment)) throw new LearningV2Error('NOT_FOUND')
}

export function isLearningV2Phase4DevelopmentEnabled(environment = process.env) {
  return resolveLearningV2Capabilities(environment).teacher
}

export function requireLearningV2Phase4DevelopmentEnabled(environment = process.env) {
  if (!isLearningV2Phase4DevelopmentEnabled(environment)) throw new LearningV2Error('NOT_FOUND')
}

export function isLearningV2Phase5DevelopmentEnabled(environment = process.env) {
  return resolveLearningV2Capabilities(environment).recommendations
}

export function requireLearningV2Phase5DevelopmentEnabled(environment = process.env) {
  if (!isLearningV2Phase5DevelopmentEnabled(environment)) throw new LearningV2Error('NOT_FOUND')
}
