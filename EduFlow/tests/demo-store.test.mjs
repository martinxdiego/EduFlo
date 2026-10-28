import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import {
  createDemoLibrary,
  readDemoLibrary,
  saveDemoLibrary,
  createDemoWorksheet,
  createDemoQuestion,
  serializeDemoBackup,
  parseDemoBackup,
} from '../lib/demo-store.js'

const questionTypes = [
  'multiple_choice', 'true_false', 'open', 'math', 'image', 'matching',
  'fill_blank', 'ordering', 'either_or', 'table', 'image_block',
]

class MemoryStorage {
  constructor(value = null) { this.value = value; this.calls = [] }
  getItem(key) { this.calls.push({ operation: 'get', key }); return this.value }
  setItem(key, value) { this.calls.push({ operation: 'set', key }); this.value = String(value) }
  removeItem(key) { this.calls.push({ operation: 'remove', key }); this.value = null }
}

function assertUsableLibrary(state) {
  assert.equal(state.version, 1)
  assert.ok(Array.isArray(state.materials) && state.materials.length > 0)
  assert.ok(state.materials.some(({ id }) => id === state.selectedId))
  assert.equal(new Set(state.materials.map(({ id }) => id)).size, state.materials.length)
}

function singleMaterialState(material = createDemoWorksheet('water')) {
  return { version: 1, materials: [material], selectedId: material.id }
}

function backupObject(state = createDemoLibrary()) {
  return JSON.parse(serializeDemoBackup(state))
}

function addOwnProperty(object, name, value) {
  Object.defineProperty(object, name, { enumerable: true, configurable: true, writable: true, value })
}

test('fresh libraries have valid selection, independent IDs and independent editable content', () => {
  const first = createDemoLibrary()
  const second = createDemoLibrary()
  assertUsableLibrary(first)
  assertUsableLibrary(second)
  const firstIds = new Set(first.materials.map(({ id }) => id))
  assert.ok(second.materials.every(({ id }) => !firstIds.has(id)), 'A new visitor must not reuse another visitor\'s material IDs')
  const untouched = structuredClone(second)
  first.materials[0].title = 'Nur in diesem Browser'
  first.materials[0].content.questions[0].question = 'Meine eigene Formulierung'
  assert.deepEqual(second, untouched, 'Editing a new library must not mutate a shared template')
})

test('all three worksheet factories produce fresh independently editable materials', () => {
  const ids = new Set()
  for (const kind of ['water', 'math', 'german']) {
    const first = createDemoWorksheet(kind)
    const second = createDemoWorksheet(kind)
    assert.equal(typeof first.id, 'string')
    assert.ok(first.id.length > 0)
    assert.notEqual(first.id, second.id)
    assert.ok(!ids.has(first.id) && !ids.has(second.id))
    ids.add(first.id); ids.add(second.id)
    assert.ok(first.content.questions.length > 0)
    const before = structuredClone(second)
    first.content.questions[0].question = 'Geändert'
    assert.deepEqual(second, before)
    assertUsableLibrary(parseDemoBackup(serializeDemoBackup(singleMaterialState(second))))
  }
})

test('backup round trip preserves every supported question type and falsy or structured answers', () => {
  const worksheet = createDemoWorksheet('water')
  worksheet.content.questions = questionTypes.map((type) => createDemoQuestion(type))
  const byType = Object.fromEntries(worksheet.content.questions.map((question) => [question.type, question]))
  assert.deepEqual(Object.keys(byType).sort(), [...questionTypes].sort())
  byType.true_false.answer = false
  byType.math.answer = 0
  byType.ordering.answer = ['Verdunstung', 'Kondensation', 'Niederschlag']
  byType.fill_blank.answer = ['Wasser, flüssig', 'Eine "Wolke"', '']
  byType.matching.answer = [{ left: 'Sonne', right: 'Energie' }, { left: 'Regen, Schnee', right: 'Niederschlag' }]
  byType.open.question = 'Literal erhalten: <strong>Wasser</strong> & "Wolken"'
  const state = singleMaterialState(worksheet)
  const original = structuredClone(state)
  const restored = parseDemoBackup(serializeDemoBackup(state))
  assert.deepEqual(restored, original)
  assert.deepEqual(state, original, 'Serializing must not normalize or mutate the editor state')
  assert.equal(restored.materials[0].content.questions.find(({ type }) => type === 'true_false').answer, false)
  assert.equal(restored.materials[0].content.questions.find(({ type }) => type === 'math').answer, 0)
})

test('new questions never share mutable answer, option or table arrays', () => {
  for (const type of questionTypes) {
    const first = createDemoQuestion(type)
    const second = createDemoQuestion(type)
    assert.equal(first.type, type)
    assert.equal(second.type, type)
    const untouched = structuredClone(second)
    for (const key of ['answer', 'options', 'tableHeaders', 'tableRows']) {
      if (Array.isArray(first[key])) first[key].push('Nur im ersten Entwurf')
    }
    assert.deepEqual(second, untouched, `${type} must not alias a shared default array`)
  }
})

test('reading an empty browser creates a usable library without writing any storage', () => {
  const storage = new MemoryStorage()
  const { state, warning } = readDemoLibrary(storage)
  assertUsableLibrary(state)
  assert.ok(!warning)
  assert.ok(storage.calls.some(({ operation }) => operation === 'get'))
  assert.ok(storage.calls.every(({ operation }) => operation === 'get'))
  assert.equal(storage.value, null)
})

test('save and read restore the actual edited material without read-time writes', () => {
  const storage = new MemoryStorage()
  const state = createDemoLibrary()
  state.materials[0].title = 'Mein bearbeitetes Material'
  state.materials[0].content.questions[0].question = 'Diese Änderung muss nach Neuladen bleiben.'
  const original = structuredClone(state)
  const result = saveDemoLibrary(storage, state)
  assert.equal(result.ok, true)
  assert.ok(storage.calls.some(({ operation }) => operation === 'set'))
  storage.calls = []
  const restored = readDemoLibrary(storage)
  assert.ok(!restored.warning)
  assert.deepEqual(restored.state, original)
  assert.deepEqual(state, original)
  assert.ok(storage.calls.every(({ operation }) => operation === 'get'))
})

test('quota failure is reported without success, input mutation or deletion of the old backup', () => {
  const state = createDemoLibrary()
  state.materials[0].content.questions[0].question = 'Noch nicht gespeichert'
  const original = structuredClone(state)
  const storage = new MemoryStorage('vorheriger gespeicherter Stand')
  storage.setItem = function (key) {
    this.calls.push({ operation: 'set', key })
    throw Object.assign(new Error('Quota reached'), { name: 'QuotaExceededError' })
  }
  const result = saveDemoLibrary(storage, state)
  assert.equal(result.ok, false)
  assert.equal(typeof result.error, 'string')
  assert.ok(result.error.length > 0)
  assert.deepEqual(state, original)
  assert.equal(storage.value, 'vorheriger gespeicherter Stand')
  assert.ok(storage.calls.every(({ operation }) => operation !== 'remove'))
})

test('corrupt or oversized browser data recovers with a warning but is not silently overwritten', () => {
  for (const raw of ['{kaputt', JSON.stringify({ version: 99 }), ' '.repeat(500_001) + '{}']) {
    const storage = new MemoryStorage(raw)
    const result = readDemoLibrary(storage)
    assertUsableLibrary(result.state)
    assert.equal(typeof result.warning, 'string')
    assert.ok(result.warning.length > 0)
    assert.equal(storage.value, raw)
    assert.ok(storage.calls.every(({ operation }) => operation === 'get'))
  }
})

test('a browser that denies storage access remains usable and explains the persistence limitation', () => {
  const storage = new MemoryStorage()
  storage.getItem = () => { throw Object.assign(new Error('Storage blocked'), { name: 'SecurityError' }) }
  const result = readDemoLibrary(storage)
  assertUsableLibrary(result.state)
  assert.ok(typeof result.warning === 'string' && result.warning.length > 0)
  assert.equal(storage.calls.length, 0)
})

test('imports reject malformed JSON, wrong root types and an unsupported contract version', () => {
  for (const text of ['', '{', 'null', '[]', '42', '"worksheet"', JSON.stringify({ ...createDemoLibrary(), version: 2 })]) {
    assert.throws(() => parseDemoBackup(text), `Unexpectedly accepted malformed backup: ${text.slice(0, 45)}`)
  }
})

test('the import size ceiling counts the complete file, including otherwise valid JSON whitespace', () => {
  const valid = serializeDemoBackup(createDemoLibrary())
  assert.throws(() => parseDemoBackup(' '.repeat(500_001) + valid))
})

test('the 500 KB limit uses UTF-8 bytes rather than JavaScript string length on import and save', () => {
  const materials = Array.from({ length: 20 }, () => createDemoWorksheet('water'))
  for (const material of materials) {
    for (const question of material.content.questions) question.question = '水'.repeat(1000)
  }
  const state = { version: 1, materials, selectedId: materials[0].id }
  const text = JSON.stringify(state)
  assert.ok(text.length < 500_000, 'This fixture must stay below the character count limit')
  assert.ok(Buffer.byteLength(text, 'utf8') > 500_000, 'This fixture must exceed the actual byte limit')
  const original = structuredClone(state)
  assert.throws(() => parseDemoBackup(text))
  assert.throws(() => serializeDemoBackup(state))
  const storage = new MemoryStorage('vorheriger Stand')
  assert.equal(saveDemoLibrary(storage, state).ok, false)
  assert.equal(storage.value, 'vorheriger Stand')
  assert.ok(storage.calls.every(({ operation }) => operation !== 'set'))
  assert.deepEqual(state, original)
})

test('invalid selected IDs and duplicate material IDs cannot be imported or saved successfully', () => {
  const invalidSelection = createDemoLibrary()
  invalidSelection.selectedId = 'kein-vorhandenes-material'
  const duplicate = createDemoLibrary()
  duplicate.materials = [duplicate.materials[0], structuredClone(duplicate.materials[0])]
  for (const state of [invalidSelection, duplicate]) {
    assert.throws(() => parseDemoBackup(JSON.stringify(state)))
    const storage = new MemoryStorage('alter Stand')
    const before = structuredClone(state)
    const result = saveDemoLibrary(storage, state)
    assert.equal(result.ok, false)
    assert.ok(result.error)
    assert.equal(storage.value, 'alter Stand')
    assert.ok(storage.calls.every(({ operation }) => operation !== 'set' && operation !== 'remove'))
    assert.deepEqual(state, before)
  }
})

test('twenty independent materials round-trip while a twenty-first is refused', () => {
  const materials = Array.from({ length: 20 }, (_, index) => createDemoWorksheet(['water', 'math', 'german'][index % 3]))
  const state = { version: 1, materials, selectedId: materials[0].id }
  assert.deepEqual(parseDemoBackup(serializeDemoBackup(state)), state)
  const tooMany = { ...state, materials: [...materials, createDemoWorksheet('math')] }
  assert.throws(() => parseDemoBackup(JSON.stringify(tooMany)))
  const storage = new MemoryStorage()
  assert.equal(saveDemoLibrary(storage, tooMany).ok, false)
  assert.ok(storage.calls.every(({ operation }) => operation !== 'set'))
})

test('an imported material cannot contain duplicate question identities', () => {
  const state = singleMaterialState()
  const first = state.materials[0].content.questions[0]
  assert.equal(typeof first.id, 'string')
  state.materials[0].content.questions = [first, { ...structuredClone(first), question: 'Andere Frage, gleiche Identität' }]
  assert.throws(() => parseDemoBackup(JSON.stringify(state)))
})

test('prototype-related keys are rejected at the library and nested-question boundaries', () => {
  assert.equal(Object.prototype.eduflowDemoPolluted, undefined)
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const root = backupObject()
    addOwnProperty(root, key, { eduflowDemoPolluted: true })
    assert.throws(() => parseDemoBackup(JSON.stringify(root)), `Root key ${key} must not be imported`)
    const nested = backupObject()
    addOwnProperty(nested.materials[0].content.questions[0], key, { eduflowDemoPolluted: true })
    assert.throws(() => parseDemoBackup(JSON.stringify(nested)), `Question key ${key} must not be imported`)
  }
  assert.equal(Object.prototype.eduflowDemoPolluted, undefined)
})

test('import cannot make a demo question load a remote image or a protocol-relative tracker', () => {
  for (const type of ['image', 'image_block']) {
    for (const imageUrl of ['https://tracker.invalid/image.png', 'http://tracker.invalid/image.png', '//tracker.invalid/image.png']) {
      const state = singleMaterialState()
      const question = createDemoQuestion(type)
      question.imageUrl = imageUrl
      state.materials[0].content.questions = [question]
      assert.throws(() => parseDemoBackup(JSON.stringify(state)), `${type} must reject external image sources`)
    }
  }
})

test('discarding a duplicate never marks an unpersisted original edit as safely saved', () => {
  // Execute the actual workspace handlers; mock only React state setters and browser storage.
  const source = readFileSync(new URL('../components/demo/DemoWorkspace.js', import.meta.url), 'utf8')
  const start = source.indexOf('  const selectMaterial = ')
  const end = source.indexOf('  const exportMaterial = ', start)
  assert.ok(start >= 0 && end > start, 'The real editor handlers must be present')
  const library = createDemoLibrary()
  const originalId = library.selectedId
  const storage = new MemoryStorage(serializeDemoBackup(library))
  const state = { library, draft: structuredClone(library.materials[0]), ready: true, dirty: false,
    selectedQuestionId: library.materials[0].content.questions[0].id,
    error: '', warning: '', notice: '', libraryOpen: false, mode: 'edit', pendingAction: null }
  const context = vm.createContext({ ...state, window: { localStorage: storage },
    clone: (value) => JSON.parse(JSON.stringify(value)), createDemoLibrary, createDemoQuestion, createDemoWorksheet,
    saveDemoLibrary, serializeDemoBackup, parseDemoBackup, withQuestionIds: (value) => value,
  })
  for (const key of Object.keys(state)) {
    context[`set${key[0].toUpperCase()}${key.slice(1)}`] = (update) => {
      state[key] = typeof update === 'function' ? update(state[key]) : update
      context[key] = state[key]
    }
  }
  const handlers = vm.runInContext(`${source.slice(start, end)}\n({ updateQuestions, duplicate, requestMaterial, confirmAction })`, context)
  handlers.updateQuestions(state.draft.content.questions.map((question, index) => index === 0
    ? { ...question, question: 'Meine Änderung vor dem Duplizieren.' } : question))
  assert.equal(state.dirty, true)
  handlers.duplicate()
  assert.notEqual(state.draft.id, originalId)
  handlers.requestMaterial(originalId)
  if (state.pendingAction) handlers.confirmAction()
  assert.equal(state.draft.id, originalId)
  if (!state.dirty) {
    const persisted = parseDemoBackup(storage.value).materials.find(({ id }) => id === originalId)
    assert.equal(state.draft.content.questions[0].question, persisted.content.questions[0].question,
      'A clean editor must not contain an original edit that disappears on reload')
  }
})
