import assert from 'node:assert/strict'
import test from 'node:test'
import { paidEvaluationReadiness } from '../lib/server/learning-v2/tutor/evaluation/evaluation-manifest.js'

test('paid OpenAI Tutor evaluation requires a new run-specific authorization', () => {
  assert.equal(process.env.RUN_TUTOR_PROVIDER_EVALS, '1')
  assert.ok(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY is required when RUN_TUTOR_PROVIDER_EVALS=1')
  const readiness = paidEvaluationReadiness(process.env)
  assert.equal(readiness.runnable, false)
  assert.equal(readiness.status, 'BLOCKED')
  assert.equal(readiness.reasonCode, 'PAID_EVALUATION_AUTHORIZATION_REQUIRED')
})
