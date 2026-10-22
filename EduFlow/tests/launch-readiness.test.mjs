import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateLaunchReadiness, REQUIRED_LAUNCH_CHECKS } from '../lib/launch-readiness.js'

test('public release cannot pass by omitting blockers or recording empty evidence', () => {
  assert.equal(evaluateLaunchReadiness([]).ready, false)
  const checks = REQUIRED_LAUNCH_CHECKS.map(id => ({ id, status: 'verified', evidence: 'Reviewed evidence' }))
  assert.equal(evaluateLaunchReadiness(checks).ready, true)
  for (const status of ['partial', 'pending', 'blocked']) {
    assert.deepEqual(evaluateLaunchReadiness(checks.map(item => item.id === 'privacy' ? { ...item, status } : item)).blockers, ['privacy'])
  }
  assert.equal(evaluateLaunchReadiness([...checks, checks[0]]).ready, false)
  assert.equal(evaluateLaunchReadiness(checks.map(item => ({ ...item, evidence: '' }))).ready, false)
})
