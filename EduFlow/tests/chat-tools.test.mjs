import test from 'node:test'
import assert from 'node:assert/strict'
import { validateChatToolCall } from '../lib/chat-tools.js'

test('bounds question additions', () => {
  assert.throws(() => validateChatToolCall('add_questions', { count: 99, type: 'open' }), /1 bis 5/)
  assert.deepEqual(validateChatToolCall('add_questions', { count: 3, type: 'open', difficulty: 'hard' }), { count: 3, type: 'open', topic: '', difficulty: 'hard' })
})

test('prevents out-of-range worksheet edits', () => {
  assert.throws(() => validateChatToolCall('modify_question', { questionIndex: 4, action: 'easier' }, { questionCount: 2 }), /Fragenindex/)
})
