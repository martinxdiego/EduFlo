import assert from 'node:assert/strict'
import test from 'node:test'

const enabled = process.env.RUN_INTEGRATION_TESTS === '1'

test('H10 unavailable database fails closed without exposing infrastructure details', { skip: !enabled }, async () => {
  const response = await fetch(`${process.env.TEST_BASE_URL}/api/v2/learning/context`)
  assert.equal(response.status, 500)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const payload = await response.json()
  assert.equal(payload.error.code, 'INTERNAL_ERROR')
  const serialized = JSON.stringify(payload)
  assert.equal(serialized.includes('Mongo'), false)
  assert.equal(serialized.includes(process.env.DB_NAME), false)
  assert.equal(serialized.includes('127.0.0.1'), false)
})
