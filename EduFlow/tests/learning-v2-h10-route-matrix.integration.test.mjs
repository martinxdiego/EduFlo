import assert from 'node:assert/strict'
import test from 'node:test'
import { PUBLIC_V2_ROUTES, routeMethodCount } from '../scripts/learning-v2-release/routes-v1.mjs'

const enabled = process.env.RUN_INTEGRATION_TESTS === '1'

test('H10 live public V2 route matrix matches the effective capability profile', { skip: !enabled }, async () => {
  const baseUrl = process.env.TEST_BASE_URL
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname))
  const expectedCapabilities = JSON.parse(process.env.H10_EXPECTED_CAPABILITIES || '{}')
  assert.deepEqual(Object.keys(expectedCapabilities).sort(), ['definitions', 'ingestion', 'recommendations', 'reflection', 'teacher', 'tutor'])
  assert.equal(routeMethodCount(), 35)
  for (const route of PUBLIC_V2_ROUTES) {
    for (const method of route.methods) {
      const response = await fetch(`${baseUrl}${route.path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        ...(method === 'GET' ? {} : { body: '{}' }),
      })
      const expected = expectedCapabilities[route.capability] ? 401 : 404
      assert.equal(response.status, expected, `${method} ${route.path} (${route.capability})`)
      assert.equal(response.headers.get('cache-control'), 'no-store')
    }
  }
})
