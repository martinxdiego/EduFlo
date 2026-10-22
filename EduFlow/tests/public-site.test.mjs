import assert from 'node:assert/strict'
import test from 'node:test'
import { publicSiteOrigin } from '../lib/public-site.js'

test('indexing requires an explicit HTTPS site origin without credentials or path', () => {
  assert.equal(publicSiteOrigin('https://school.example'), 'https://school.example')
  for (const value of ['', 'invalid', 'http://school.example', 'https://user:pass@school.example', 'https://school.example/private', 'https://school.example/?token=secret']) {
    assert.equal(publicSiteOrigin(value), null)
  }
})
