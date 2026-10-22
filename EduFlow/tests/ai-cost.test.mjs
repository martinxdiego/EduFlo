import assert from 'node:assert/strict'
import test from 'node:test'
import { estimateTokenCost } from '../lib/ai-cost.js'

test('unknown pricing or usage never looks like a free model call', () => {
  const prices = { synthetic: { input: 1, output: 2 } }
  assert.equal(estimateTokenCost('synthetic', { prompt_tokens: 1000, completion_tokens: 500 }, prices), 0.002)
  assert.equal(estimateTokenCost('other', { prompt_tokens: 1000, completion_tokens: 500 }, prices), null)
  assert.equal(estimateTokenCost('synthetic', {}, prices), null)
  assert.equal(estimateTokenCost('synthetic', { prompt_tokens: -1, completion_tokens: 1 }, prices), null)
  assert.equal(estimateTokenCost('synthetic', { input_tokens: 0, output_tokens: 0 }, prices), 0)
  assert.equal(estimateTokenCost('other', {}, prices, 0.015), 0.015)
  assert.equal(estimateTokenCost('other', {}, prices, -1), null)
})
