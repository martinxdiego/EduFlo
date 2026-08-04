import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateStudioArtifact } from '../lib/server/studio-quality.js'

test('studio quality requires complete slides and answer-consistent quizzes', () => {
  const base = {
    title: 'Thema', summary: 'Zusammenfassung', learningGoals: ['A', 'B', 'C'],
    slides: Array.from({ length: 5 }, (_, i) => ({ title: `Folie ${i}`, bullets: ['A', 'B'] })),
    flashcards: Array.from({ length: 5 }, (_, i) => ({ front: `${i}`, back: 'Antwort' })),
    quiz: Array.from({ length: 4 }, (_, i) => ({ question: `${i}`, options: ['A', 'B', 'C', 'D'], answer: 'A' })),
  }
  assert.equal(evaluateStudioArtifact(base).passed, true)
  base.quiz[0].answer = 'E'
  assert.equal(evaluateStudioArtifact(base).passed, false)
})
