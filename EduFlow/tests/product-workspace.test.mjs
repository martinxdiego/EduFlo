import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
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


test('decorative images need no answer, and an absent quality report never claims a passed check', () => {
  const material = { grade: '5', subject: 'NMG', content: { questions: [
    { type: 'open', question: 'Erkläre den Wasserkreislauf.', answer: 'Wasser verdunstet.' },
    { type: 'image_block', question: '', answer: '' },
  ] } }
  const unchecked = materialQualityChecklist(material)
  assert.equal(unchecked.checks.find(check => check.id === 'solutions').passed, true)
  assert.equal(unchecked.checks.find(check => check.id === 'quality').passed, false)
  assert.equal(unchecked.ready, false)
  assert.equal(materialQualityChecklist({ ...material, content: { ...material.content, quality: { score: 95 } } }).ready, true)
})

// Run the actual client handler without importing its JSX or mocking its logic.
// Only browser I/O and React/context state setters are replaced for this test.
function draftSaveHarness(fetchResponse) {
  const source = readFileSync(new URL('../components/views/GeneratorView.js', import.meta.url), 'utf8')
  const start = source.indexOf('  const saveDraft = async () => {')
  const end = source.indexOf('  const getWorksheetStatus = ', start)
  assert.ok(start >= 0 && end > start, 'The real draft-save handler must be present')
  const original = { id: 'worksheet-1', title: 'Wasser', status: 'review', revision: 3,
    content: { instructions: 'Bleibt erhalten.', questions: [{ type: 'open', question: 'Alte Frage', points: 1 }] } }
  const other = { id: 'worksheet-2', title: 'Anderes Material' }
  const state = {
    selectedWorksheet: original, worksheets: [original, other], worksheetStatuses: { 'worksheet-2': 'complete' },
    editedQuestions: [
      { type: 'open', question: 'Meine ungespeicherte Frage', answer: 'Wasser verdunstet.', points: 2 },
      { type: 'image_block', imageUrl: '/synthetic-image.png', points: 99 },
    ],
    saveStatus: 'unsaved', hasUnsavedChanges: true, editMode: true, error: '', successMessage: '',
  }
  const requests = []
  const setterCalls = []
  const setters = Object.fromEntries(Object.keys(state).map(key => [
    `set${key[0].toUpperCase()}${key.slice(1)}`,
    value => {
      setterCalls.push(key)
      state[key] = typeof value === 'function' ? value(state[key]) : value
      context[key] = state[key]
    },
  ]))
  const context = vm.createContext({
    ...state, ...setters, token: 'synthetic-token', console: { error() {} },
    fetch: async (url, options) => {
      requests.push({ url, ...options })
      return fetchResponse()
    },
  })
  const saveDraft = vm.runInContext(`${source.slice(start, end)}\nsaveDraft`, context)
  return { state, requests, setterCalls, saveDraft }
}

test('draft save updates the library and leaves the editor only after confirmed HTTP success', async () => {
  let confirm
  const response = new Promise(resolve => { confirm = resolve })
  const h = draftSaveHarness(() => response)
  const original = h.state.selectedWorksheet
  const questions = h.state.editedQuestions
  const other = h.state.worksheets[1]
  const pending = h.saveDraft()

  assert.equal(h.state.saveStatus, 'saving')
  assert.equal(h.state.editMode, true)
  assert.equal(h.state.hasUnsavedChanges, true)
  assert.equal(h.state.selectedWorksheet, original)
  assert.equal(h.state.successMessage, '')
  assert.equal(h.requests.length, 1)
  assert.equal(h.requests[0].url, '/api/worksheets/worksheet-1')
  assert.equal(h.requests[0].method, 'PUT')
  assert.equal(h.requests[0].headers.Authorization, 'Bearer synthetic-token')
  assert.deepEqual(JSON.parse(h.requests[0].body), {
    status: 'draft', content: { ...original.content, questions, total_points: 2 },
  })

  confirm(new Response(null, { status: 200 }))
  await pending

  assert.equal(h.state.selectedWorksheet.status, 'draft')
  assert.equal(h.state.selectedWorksheet.reviewed_at, null)
  assert.equal(h.state.selectedWorksheet.revision, 4)
  assert.equal(h.state.selectedWorksheet.content.questions, questions)
  assert.equal(h.state.selectedWorksheet.content.total_points, 2)
  assert.equal(h.state.worksheets[0], h.state.selectedWorksheet)
  assert.equal(h.state.worksheets[1], other)
  assert.equal(h.state.worksheetStatuses['worksheet-1'], 'draft')
  assert.equal(h.state.worksheetStatuses['worksheet-2'], 'complete')
  assert.equal(h.state.saveStatus, 'saved')
  assert.equal(h.state.hasUnsavedChanges, false)
  assert.equal(h.state.editMode, false)
  assert.equal(h.state.editedQuestions.length, 0)
  assert.match(h.state.successMessage, /Als Entwurf gespeichert/)
})

for (const [failure, fetchResponse] of [
  ['HTTP 403', () => new Response(null, { status: 403 })],
  ['HTTP 500', () => new Response(null, { status: 500 })],
  ['a network error', () => { throw new TypeError('Failed to fetch') }],
]) {
  test(`draft save retains the editor and every edit after ${failure}`, async () => {
    let failing = true
    const h = draftSaveHarness(() => failing ? fetchResponse() : new Response(null, { status: 200 }))
    const original = h.state.selectedWorksheet
    const worksheets = h.state.worksheets
    const statuses = h.state.worksheetStatuses
    const questions = h.state.editedQuestions

    await h.saveDraft()

    assert.equal(h.state.selectedWorksheet, original)
    assert.equal(h.state.worksheets, worksheets)
    assert.equal(h.state.worksheetStatuses, statuses)
    assert.equal(h.state.editedQuestions, questions)
    assert.equal(h.state.editMode, true)
    assert.equal(h.state.hasUnsavedChanges, true)
    assert.equal(h.state.saveStatus, 'unsaved')
    assert.match(h.state.error, /Speichern fehlgeschlagen.*erneut/)
    assert.equal(h.state.successMessage, '')
    assert.deepEqual(h.setterCalls, ['saveStatus', 'error', 'saveStatus'])

    // The still-open editor can retry the same edits when the service recovers.
    failing = false
    await h.saveDraft()
    assert.equal(h.requests.length, 2)
    assert.equal(h.requests[1].body, h.requests[0].body)
    assert.equal(h.state.selectedWorksheet.content.questions, questions)
    assert.equal(h.state.saveStatus, 'saved')
    assert.equal(h.state.editMode, false)
  })
}
