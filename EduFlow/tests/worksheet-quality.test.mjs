import test from 'node:test'
import assert from 'node:assert/strict'
import { assessWorksheetQuality, prepareWorksheetContent } from '../lib/server/worksheet-quality.js'

const validWorksheet = {
  title: 'Der Wasserkreislauf',
  questions: [
    { number: 7, type: 'short_answer', question: 'Was geschieht bei der Verdunstung?', answer: 'Wasser wird zu Wasserdampf.', points: 2 },
    { number: 9, type: 'multiple_choice', question: 'Was entsteht durch Kondensation?', options: ['A) Wolken', 'B) Gestein', 'C) Sand'], answer: 'A) Wolken', points: 1 },
  ],
  teacher_notes: 'Auf verständliche Fachbegriffe achten.',
}

test('normalizes numbering, aliases and point totals', () => {
  const { content, quality } = prepareWorksheetContent(validWorksheet, 2)
  assert.deepEqual(content.questions.map(question => question.number), [1, 2])
  assert.equal(content.questions[0].type, 'open')
  assert.equal(content.total_points, 3)
  assert.equal(quality.passed, true)
})

test('rejects duplicates and missing solutions', () => {
  const content = {
    title: 'Test',
    questions: [
      { type: 'open', question: 'Erkläre den Wasserkreislauf.', answer: '' },
      { type: 'open', question: 'Erkläre den Wasserkreislauf.', answer: 'Antwort' },
    ],
  }
  const report = assessWorksheetQuality(content, 2)
  assert.equal(report.passed, false)
  assert.ok(report.errors.some(error => error.includes('Musterlösung')))
  assert.ok(report.errors.some(error => error.includes('Duplikat')))
})

test('rejects incomplete multiple choice questions', () => {
  const { quality } = prepareWorksheetContent({
    title: 'Test',
    questions: [{ type: 'multiple_choice', question: 'Welche Antwort ist korrekt?', options: ['A', 'B'], answer: 'C' }],
  }, 1)
  assert.equal(quality.passed, false)
  assert.ok(quality.errors.some(error => error.includes('mindestens drei')))
})
