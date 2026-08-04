import test from 'node:test'
import assert from 'node:assert/strict'
import { deduplicateDossierQuestions, evaluateDossier, prepareDossierSection, validateDossierOutline } from '../lib/server/dossier-quality.js'

test('validates a pedagogical outline', () => {
  const result = validateDossierOutline({ title: 'Wasser', sections: [
    { type: 'objectives', title: 'Lernziele' }, { type: 'theory', title: 'Einstieg' },
    { type: 'exercises', title: 'Ueben I' }, { type: 'theory', title: 'Vertiefung' },
    { type: 'exercises', title: 'Ueben II' }, { type: 'summary', title: 'Rueckblick' },
  ] })
  assert.equal(result.passed, true)
})

test('rejects exercise sections without enough solved questions', () => {
  const result = prepareDossierSection({ blocks: [{ type: 'heading', content: { text: 'Uebungen' } }, { type: 'question', content: { type: 'open', question: 'Warum?' } }] }, { sectionType: 'exercises' })
  assert.equal(result.quality.passed, false)
  assert.match(result.quality.errors.join(' '), /Musterloesung/)
})

test('drops malformed optional questions from theory sections', () => {
  const result = prepareDossierSection({ blocks: [
    { type: 'heading', content: { text: 'Theorie' } },
    { type: 'text', content: { html: 'Ein ausreichend langer Erklaertext. '.repeat(30) } },
    { type: 'question', content: {} },
  ] }, { sectionType: 'theory' })
  assert.equal(result.quality.passed, true)
  assert.equal(result.content.blocks.some(block => block.type === 'question'), false)
})

test('keeps source texts usable when optional comprehension questions are malformed', () => {
  const result = prepareDossierSection({ blocks: [
    { type: 'heading', content: { text: 'Quellentext' } },
    { type: 'text', content: { html: 'Ein ausfuehrlicher und sachlich verwertbarer Quellentext. '.repeat(30) } },
    { type: 'question', content: { answer: 'Eine optionale Musterloesung ohne Frage.' } },
  ] }, { sectionType: 'source_text', grade: 8 })
  assert.equal(result.quality.passed, true)
  assert.equal(result.content.blocks.some(block => block.type === 'question'), false)
  assert.match(result.quality.warnings.join(' '), /optionale Aufgaben/)
})

test('evaluates complete dossiers and detects duplicates', () => {
  const sections = Array.from({ length: 6 }, (_, i) => ({ blocks: i === 2 ? Array.from({ length: 5 }, () => ({ type: 'question', content: { question: 'Gleich?', answer: 'Ja' } })) : [] }))
  const result = evaluateDossier(sections, ['Ich kann es.'])
  assert.equal(result.passed, false)
  assert.match(result.errors.join(' '), /Doppelte/)
})

test('removes duplicate questions across sections without mutating the input', () => {
  const sections = [
    { title: 'A', blocks: [{ type: 'question', content: { question: 'Was ist Wasser?', answer: 'H2O' } }] },
    { title: 'B', blocks: [
      { type: 'heading', content: { text: 'B' } },
      { type: 'question', content: { question: '  WAS IST WASSER? ', answer: 'H2O' } },
      { type: 'question', content: { question: 'Wie verdunstet Wasser?', answer: 'Durch Waerme' } },
    ] },
  ]
  const result = deduplicateDossierQuestions(sections)
  assert.equal(result.removed, 1)
  assert.equal(result.sections.flatMap(section => section.blocks).filter(block => block.type === 'question').length, 2)
  assert.equal(sections[1].blocks.length, 3)
})
