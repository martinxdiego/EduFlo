import { assertTrustedTutorHumanReviewCoordinator } from './human-review-coordinator.js'

export const TUTOR_HUMAN_REVIEW_LOCAL_RUNNER_VERSION = 'tutor-human-review-local-runner-v1'

function assertActualDevelopmentProcess() {
  if (!['development', 'test'].includes(process.env.NODE_ENV)) {
    throw new TypeError('Human Review runner is Development/Evaluation only')
  }
}

function assignmentToken(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{32,160}$/.test(value)) {
    throw new TypeError('Opaque coordinator assignment token is required')
  }
  return value
}

function exactRunnerInput(value, requiredKeys, optionalKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} input must be an object`)
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  if (Object.keys(value).some((key) => !allowed.has(key)) || requiredKeys.some((key) => !(key in value))) {
    throw new TypeError(`${label} input contains missing or caller-controlled fields`)
  }
  return value
}

export function createTutorHumanReviewLocalRunner(args) {
  assertActualDevelopmentProcess()
  const { coordinator } = exactRunnerInput(args, ['coordinator'], [], 'Human Review runner')
  const trusted = assertTrustedTutorHumanReviewCoordinator(coordinator)
  return Object.freeze({
    runner_version: TUTOR_HUMAN_REVIEW_LOCAL_RUNNER_VERSION,
    transport: 'LOCAL_PROJECTION_ONLY',
    reviewer_repository_access: false,
    projectFirstPass: (input) => {
      const { assignmentToken: token } = exactRunnerInput(input, ['assignmentToken'], [], 'First-Pass projection')
      return trusted.projectFirstPass({ assignmentToken: assignmentToken(token) })
    },
    submitFirstPass: (input) => {
      const { assignmentToken: token, reviewItemRef, ratings, syntheticNote = null } = exactRunnerInput(input,
        ['assignmentToken', 'reviewItemRef', 'ratings'], ['syntheticNote'], 'First-Pass submission')
      return trusted.submit({ assignmentToken: assignmentToken(token), phase: 'FIRST_PASS', reviewItemRef,
        clientInput: { ratings, synthetic_note: syntheticNote } })
    },
    submitAdjudication: (input) => {
      const { assignmentToken: token, reviewItemRef, dimensionRating, syntheticNote = null } = exactRunnerInput(input,
        ['assignmentToken', 'reviewItemRef', 'dimensionRating'], ['syntheticNote'], 'Adjudication submission')
      return trusted.submit({ assignmentToken: assignmentToken(token), phase: 'ADJUDICATION', reviewItemRef,
        clientInput: { dimension_rating: dimensionRating, synthetic_note: syntheticNote } })
    },
    projectSecondPass: (input) => {
      const { assignmentToken: token } = exactRunnerInput(input, ['assignmentToken'], [], 'Second-Pass projection')
      return trusted.projectSecondPass({ assignmentToken: assignmentToken(token) })
    },
    submitSecondPass: (input) => {
      const { assignmentToken: token, reviewItemRef, syntheticNote = null } = exactRunnerInput(input,
        ['assignmentToken', 'reviewItemRef'], ['syntheticNote'], 'Second-Pass submission')
      return trusted.submit({ assignmentToken: assignmentToken(token), phase: 'SECOND_PASS', reviewItemRef,
        clientInput: { governance_analysis_complete: true, synthetic_note: syntheticNote } })
    },
  })
}
