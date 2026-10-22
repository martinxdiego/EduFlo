import assert from 'node:assert/strict'
import test from 'node:test'
import { generationFingerprint, swissMonth, validGenerationRequestKey, worksheetUsage } from '../lib/server/worksheet-usage.js'

test('monthly usage follows Zurich time, including UTC month boundaries', () => {
  assert.equal(swissMonth('2026-03-31T22:30:00Z'), '2026-04')
  assert.equal(swissMonth('2026-01-31T23:30:00Z'), '2026-02')
  const user = { subscription_tier: 'free', worksheets_used_this_month: 5, month_reset_date: '2026-03-31T21:59:00Z' }
  assert.equal(worksheetUsage(user, new Date('2026-03-31T22:01:00Z')).used, 0)
  assert.equal(worksheetUsage(user, new Date('2026-03-31T21:59:30Z')).exhausted, true)
})

test('only premium bypasses the free quota and request fingerprints are stable', () => {
  const now = new Date('2026-10-20T12:00:00Z')
  const user = { subscription_tier: 'free', worksheets_used_this_month: 5, month_reset_date: now }
  assert.equal(worksheetUsage(user, now).exhausted, true)
  assert.equal(worksheetUsage({ ...user, subscription_tier: 'premium' }, now).exhausted, false)
  assert.equal(worksheetUsage({ ...user, subscription_tier: 'unexpected' }, now).exhausted, true)
  assert.equal(generationFingerprint({ topic: 'Wasser', grade: 5 }), generationFingerprint({ grade: 5, topic: 'Wasser' }))
  assert.notEqual(generationFingerprint({ grade: 5 }), generationFingerprint({ grade: 6 }))
  assert.equal(validGenerationRequestKey('bad key'), false)
  assert.equal(validGenerationRequestKey('request-123'), true)
})
