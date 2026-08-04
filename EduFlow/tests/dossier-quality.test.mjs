import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateDossier, prepareDossierSection, validateDossierOutline } from '../lib/server/dossier-quality.js'

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

test('evaluates complete dossiers and detects duplicates', () => {
  const sections = Array.from({ length: 6 }, (_, i) => ({ blocks: i === 2 ? Array.from({ length: 5 }, () => ({ type: 'question', content: { question: 'Gleich?', answer: 'Ja' } })) : [] }))
  const result = evaluateDossier(sections, ['Ich kann es.'])
  assert.equal(result.passed, false)
  assert.match(result.errors.join(' '), /Doppelte/)
})
