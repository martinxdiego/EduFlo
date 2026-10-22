import assert from 'node:assert/strict'
import test from 'node:test'
import { submissionTotals } from '../lib/server/submission-grading.js'
import { deterministicWorksheetGrade, shuffledMatchingRight, shuffledOrderingItems, studentMaterialContent } from '../lib/student-material.js'

test('student delivery never spreads teacher-only fields or unknown provider fields', () => {
  const delivered = studentMaterialContent({ title: 'Wasser', teacher_notes: 'SECRET', answer_key: 'SECRET', solutions: ['SECRET'],
    questions: [{ type: 'true_false', question: 'Eine Aussage.', answer: false, explanation: 'SECRET', options: ['True', 'False'] }],
  })
  assert.equal(JSON.stringify(delivered).includes('SECRET'), false)
  assert.equal('answer' in delivered.questions[0], false)
  assert.deepEqual(delivered.questions[0].options, ['Wahr', 'Falsch'])
})

test('ordering and matching are repeatable but never delivered in their original order', () => {
  for (let number = 0; number < 50; number++) {
    const question = { number, answer: ['A', 'B', 'C'] }
    assert.notDeepEqual(shuffledOrderingItems(question), question.answer)
    assert.deepEqual(shuffledOrderingItems(question), shuffledOrderingItems(question))
    const matching = { number, answer: [['A', '1'], ['B', '2']] }
    assert.notDeepEqual(shuffledMatchingRight(matching).map(item => item.origIdx), [0, 1])
  }
})

test('grades legacy arrays, false and zero correctly and requires exact answer counts', () => {
  assert.equal(deterministicWorksheetGrade({ type: 'true_false', answer: false }, 'Falsch'), true)
  assert.equal(deterministicWorksheetGrade({ type: 'math', answer: 0 }, 0), true)
  assert.equal(deterministicWorksheetGrade({ type: 'math', answer: '3 × 14 = 42' }, '42'), null)
  assert.equal(deterministicWorksheetGrade({ type: 'ordering', answer: ['A', 'B'] }, ['A', 'B']), true)
  assert.equal(deterministicWorksheetGrade({ type: 'fill_blank', answer: ['A', 'B'] }, ['A', 'B', 'C']), false)
  assert.equal(deterministicWorksheetGrade({ type: 'ordering', answer: [] }, []), null)
})

test('matching grading rejects duplicate numeric aliases instead of granting points', () => {
  const question = { number: 1, type: 'matching', answer: [['A', '1'], ['B', '2']] }
  const right = shuffledMatchingRight(question)
  const correct = Object.fromEntries(right.map((item, index) => [String(item.origIdx), index]))
  assert.equal(deterministicWorksheetGrade(question, { matches: correct }), true)
  assert.equal(deterministicWorksheetGrade(question, { matches: { 0: correct[0], '00': correct[0] } }), false)
})


test('decorative image blocks neither award points nor require grading', () => {
  const result = { type: 'image_block', isInformational: true, maxPoints: 0, pointsAwarded: 0, isCorrect: null, needsManualReview: false }
  const totals = submissionTotals([result, { type: 'multiple_choice', maxPoints: 1, pointsAwarded: 1, isCorrect: true }])
  assert.equal(totals.totalPoints, 1)
  assert.equal(totals.scorePercentage, 100)
  assert.equal(totals.needsReview, false)
  assert.equal(submissionTotals([result]).swissGrade, null)
})
