import test from 'node:test'
import assert from 'node:assert/strict'
import { filterMaterials, materialQualityChecklist, normalizeMaterialMetadata } from '../lib/product-workspace.js'

test('normalizes bounded material metadata', () => {
  const result = normalizeMaterialMetadata({ status: 'ready', folder: ' Natur ', tags: ['Wasser', 'Wasser', '  Klima '], favorite: 1 })
  assert.equal(result.status, 'ready')
  assert.equal(result.folder, 'Natur')
  assert.deepEqual(result.tags, ['Wasser', 'Klima'])
  assert.equal(result.favorite, true)
})

test('quality checklist detects complete, unique and solved materials', () => {
  const result = materialQualityChecklist({ grade: '5', subject: 'NMG', content: { quality: { score: 96 }, questions: [
    { question: 'Warum verdunstet Wasser?', answer: 'Durch Wärme.' },
    { question: 'Wie entstehen Wolken?', answer: 'Durch Kondensation.' },
  ] } })
  assert.equal(result.ready, true)
  assert.equal(result.score, 100)
})

test('library filtering searches question content and respects archive and favourites', () => {
  const materials = [
    { id: 'a', title: 'Wasser', favorite: true, content: { questions: [{ question: 'Was ist Kondensation?' }] } },
    { id: 'b', title: 'Klima', archived: true },
  ]
  assert.deepEqual(filterMaterials(materials, { search: 'kondensation', favoriteOnly: true }).map(item => item.id), ['a'])
  assert.equal(filterMaterials(materials, { showArchived: false }).length, 1)
  assert.equal(filterMaterials(materials, { showArchived: true }).length, 2)
})
