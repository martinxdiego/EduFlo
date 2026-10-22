import test from 'node:test'
import assert from 'node:assert/strict'
import { answerItems, joinAnswerItems, normalizeQuestion, normalizeWorksheet, matchingPairs } from '../lib/worksheet-answers.js'
import { prepareWorksheetContent } from '../lib/server/worksheet-quality.js'

test('opens the saved Wasserkreislauf ordering answer without mutating the original', () => {
  const saved = { id: 'saved', revision: 3, content: { questions: [
    { question_id: 'original-id', type: 'ordering', question: 'Ordne die Schritte des Wasserkreislaufs.', answer: ['Verdunstung', 'Kondensation', 'Niederschlag'] },
  ] } }
  const opened = normalizeWorksheet(saved)
  assert.equal(opened.content.questions[0].answer, 'Verdunstung, Kondensation, Niederschlag')
  assert.deepEqual(answerItems(opened.content.questions[0].answer), saved.content.questions[0].answer)
  assert.equal(opened.content.questions[0].question_id, 'original-id')
  assert.equal(opened.revision, 3)
  assert.ok(Array.isArray(saved.content.questions[0].answer))
})

test('list answers preserve commas, quotes and empty slots when edited and saved', () => {
  const items = ['Wasser, das verdunstet', 'Eine "Wolke"', '', 'Regen']
  assert.deepEqual(answerItems(joinAnswerItems(items)), items)
  assert.deepEqual(answerItems(items), items)
  assert.deepEqual(answerItems('Verdunstung, Kondensation, Niederschlag'), ['Verdunstung', 'Kondensation', 'Niederschlag'])
})

test('normalizes boolean solutions and options together, including false', () => {
  for (const [raw, expected] of [[true, 'Wahr'], [false, 'Falsch'], ['True', 'Wahr'], ['False', 'Falsch']]) {
    const question = normalizeQuestion({ type: 'true_false', answer: raw, options: ['True', 'False'] })
    assert.equal(question.answer, expected)
    assert.deepEqual(question.options, ['Wahr', 'Falsch'])
  }
})

test('normalizes matching pairs without turning objects into display text', () => {
  const question = normalizeQuestion({ type: 'matching', answer: [{ left: 'Regen, Schnee', right: 'Niederschlag' }, ['Sonne', 'Energie']] })
  assert.deepEqual(matchingPairs(question.answer), [['Regen, Schnee', 'Niederschlag'], ['Sonne', 'Energie']])
  assert.equal(normalizeQuestion({ type: 'open', answer: { invalid: true } }).answer, '')
})

test('quality gate rejects malformed answers instead of saving unusable material', () => {
  for (const answer of [{ invalid: true }, [], [{ invalid: true }]]) {
    const { quality } = prepareWorksheetContent({ title: 'Wasser', questions: [
      { type: 'ordering', question: 'Ordne die Schritte des Wasserkreislaufs.', answer },
    ], teacher_notes: 'Gemeinsam besprechen.' }, 1)
    assert.equal(quality.passed, false)
  }
})

test('all eleven supported types pass their valid answer contract', () => {
  const fixtures = [
    ['multiple_choice', 'Wolken', { options: ['Wolken', 'Steine', 'Sand'] }],
    ['true_false', false], ['open', 'Das Wasser verdunstet.'], ['math', 0],
    ['image', 'Eine Wolke.'], ['matching', [['Sonne', 'Energie'], ['Regen', 'Niederschlag']]],
    ['fill_blank', ['Wasser', 'Wolken']], ['ordering', ['Verdunstung', 'Kondensation', 'Niederschlag']],
    ['either_or', 'Ja', { options: ['Ja', 'Nein'] }], ['table', 'Flüssig: Wasser; gasförmig: Dampf', { tableHeaders: ['Zustand', 'Beispiel'], tableRows: [['flüssig', 'Wasser']] }],
    ['image_block', '', { imageUrl: '/test-wolke.png' }],
  ]
  for (const [type, answer, extra] of fixtures) {
    const { content, quality } = prepareWorksheetContent({ title: 'Wasserkreislauf', questions: [
      { type, question: 'Was passiert mit dem Wasser?', answer, ...extra },
    ], teacher_notes: 'Gemeinsam besprechen.' }, 1)
    assert.equal(quality.passed, true, `${type}: ${quality.errors.join('; ')}`)
    assert.equal(typeof content.questions[0].answer, 'string')
  }
})

test('Swiss spelling is scoped to German authored content', () => {
  const worksheet = { title: 'Wasser fließt', subject: 'NMG', content: { title: 'Wasser fließt', questions: [
    { type: 'open', question: 'Wohin fließt das Wasser?', answer: 'Es fließt ins Tal.', imageUrl: 'https://example.com/ß.png' },
  ], teacher_notes: 'Große Bilder verwenden.' } }
  const normalized = normalizeWorksheet(worksheet, { swissSpelling: true })
  assert.equal(normalized.title, 'Wasser fliesst')
  assert.equal(normalized.content.questions[0].answer, 'Es fliesst ins Tal.')
  assert.equal(normalized.content.questions[0].imageUrl, 'https://example.com/ß.png')
  assert.equal(normalizeWorksheet({ ...worksheet, subject: 'Englisch' }, { swissSpelling: true }).content.questions[0].answer, 'Es fließt ins Tal.')
})


test('multiple choice letters resolve to exact option values and partial matches fail', () => {
  assert.equal(normalizeQuestion({ type: 'multiple_choice', answer: 'A', options: ['Wolken', 'Sand', 'Steine'] }).answer, 'Wolken')
  assert.equal(normalizeQuestion({ type: 'multiple_choice', answer: 'Wolken', options: ['A) Wolken', 'B) Sand', 'C) Steine'] }).answer, 'A) Wolken')
  const { quality } = prepareWorksheetContent({ title: 'Wasser', teacher_notes: 'Besprechen.', questions: [
    { type: 'multiple_choice', question: 'Welche Aussage ist korrekt?', options: ['Nicht richtig', 'Anders', 'Unpassend'], answer: 'richtig' },
  ] }, 1)
  assert.equal(quality.passed, false)
})


test('malformed display fields cannot inject objects into rendered content', () => {
  const question = normalizeQuestion({ type: { invalid: true }, question: { invalid: true }, answer: {}, points: {}, imageCaption: {}, tableHeaders: {}, tableRows: [null, { invalid: true }] })
  assert.equal(question.type, 'open')
  assert.equal(question.question, '')
  assert.equal(question.answer, '')
  assert.equal(question.imageCaption, '')
  assert.equal(question.points, 1)
  assert.deepEqual(question.tableHeaders, [])
  assert.deepEqual(question.tableRows, [])
  assert.equal(normalizeWorksheet('invalid'), null)
})
