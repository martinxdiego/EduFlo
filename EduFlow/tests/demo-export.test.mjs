import assert from 'node:assert/strict'
import test from 'node:test'
import { unzipSync, strFromU8 } from 'fflate'
import { createDemoWorksheet } from '../lib/demo-store.js'
import { buildDemoPDF, buildDemoDOCXBlob } from '../lib/demo-export.js'

async function wordXml(material, options) {
  const blob = await buildDemoDOCXBlob(material, options)
  return strFromU8(unzipSync(new Uint8Array(await blob.arrayBuffer()))['word/document.xml'])
}

test('both exports retain the image-block assignment as well as its placeholder', async () => {
  const material = createDemoWorksheet('water')
  material.content.questions[10].question = 'DRAW_WATER_CYCLE_ENDMARKER'
  for (const solutions of [false, true]) {
    assert.match(buildDemoPDF(material, { solutions }).output(), /DRAW_WATER_CYCLE_ENDMARKER/)
    assert.match(await wordXml(material, { solutions }), /DRAW_WATER_CYCLE_ENDMARKER/)
  }
})

test('long questions, solutions and table cells retain their last words across PDF pages', async () => {
  const material = createDemoWorksheet('water')
  material.content.questions[3].question = 'A complete question. '.repeat(260) + 'QUESTION_ENDMARKER'
  material.content.questions[3].answer = 'A complete explanation. '.repeat(240) + 'ANSWER_ENDMARKER'
  material.content.questions[9].tableRows[0][1] = 'A cell value. '.repeat(65) + 'CELL_ENDMARKER'
  const pdf = buildDemoPDF(material, { solutions: true })
  const text = pdf.output()
  for (const marker of ['QUESTION_ENDMARKER', 'ANSWER_ENDMARKER', 'CELL_ENDMARKER']) assert.ok(text.includes(marker), marker)
  assert.ok(pdf.getNumberOfPages() > 3)
  const xml = await wordXml(material, { solutions: true })
  assert.match(xml, /CELL_ENDMARKER/)
})

test('exports preserve falsy and structured answers without network access or input mutation', async () => {
  const material = createDemoWorksheet('water')
  material.content.questions[8].imageUrl = 'https://example.invalid/tracker.png'
  const before = JSON.stringify(material)
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = () => { calls++; throw new Error('NETWORK_FORBIDDEN') }
  try {
    const pdf = buildDemoPDF(material, { solutions: true }).output()
    const xml = await wordXml(material, { solutions: true })
    assert.match(pdf, /Falsch/)
    assert.match(xml, /Falsch/)
    assert.match(xml, /<w:t[^>]*>Lösung: 0<\/w:t>/)
    for (const value of ['Sonne', 'Energie', 'Verdunstung']) assert.ok(xml.includes(value), value)
    assert.ok(!xml.includes('[object Object]'))
    assert.ok(!pdf.includes('https://example.invalid'))
    assert.ok(!xml.includes('https://example.invalid'))
    assert.equal(calls, 0)
    assert.equal(JSON.stringify(material), before)
  } finally { globalThis.fetch = originalFetch }
})
