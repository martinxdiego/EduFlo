import pptxgen from 'pptxgenjs'

const C = {
  navy: '102A43', blue: '2563EB', cyan: '38BDF8', ink: '172033', muted: '52606D',
  pale: 'EFF6FF', white: 'FFFFFF', amber: 'F59E0B', green: '059669', line: 'D9E2EC',
}

const arr = value => Array.isArray(value) ? value : []
const clean = (value, fallback = '') => String(value || fallback).replace(/\s+/g, ' ').trim()

function footer(slide, label, page) {
  slide.addShape('line', { x: 0.7, y: 7.02, w: 11.9, h: 0, line: { color: C.line, width: 1 } })
  slide.addText(label, { x: 0.72, y: 7.11, w: 9.8, h: 0.18, fontFace: 'Aptos', fontSize: 8, color: C.muted, margin: 0 })
  slide.addText(String(page), { x: 11.8, y: 7.11, w: 0.7, h: 0.18, align: 'right', fontFace: 'Aptos', fontSize: 8, color: C.muted, margin: 0 })
}

function title(slide, value, kicker) {
  if (kicker) slide.addText(clean(kicker).toUpperCase(), { x: 0.72, y: 0.45, w: 3.6, h: 0.22, fontSize: 10, bold: true, color: C.blue, charSpacing: 1.2, margin: 0 })
  slide.addText(clean(value, 'Unterrichtsfolie'), { x: 0.72, y: 0.78, w: 11.85, h: 0.62, fontFace: 'Aptos Display', fontSize: 35, bold: true, color: C.ink, margin: 0, breakLine: false, fit: 'shrink' })
}

function bulletRuns(items) {
  return arr(items).slice(0, 5).map(item => ({ text: clean(item), options: { bullet: { indent: 18 }, hanging: 4, breakLine: true } }))
}

function addCover(pptx, artifact, page) {
  const slide = pptx.addSlide('COVER')
  slide.addShape(pptx.ShapeType.arc, { x: 9.4, y: -1.1, w: 5.5, h: 5.5, adjustPoint: 0.28, rotate: 28, fill: { color: C.cyan, transparency: 22 }, line: { transparency: 100 } })
  slide.addText(clean(artifact.title, 'Studio-Material'), { x: 0.8, y: 1.65, w: 10.5, h: 1.35, fontFace: 'Aptos Display', fontSize: 50, bold: true, color: C.white, margin: 0, fit: 'shrink' })
  const meta = [artifact.subject, artifact.grade].filter(Boolean).join('  |  ') || 'EduFlow Studio'
  slide.addText(meta, { x: 0.82, y: 3.2, w: 7.5, h: 0.35, fontSize: 18, color: 'BFDBFE', margin: 0 })
  slide.addText(clean(artifact.summary).slice(0, 360), { x: 0.82, y: 4.15, w: 8.6, h: 1.15, fontSize: 18, color: C.white, breakLine: false, fit: 'shrink', margin: 0 })
  footer(slide, 'EduFlow Studio | Unterrichtspraesentation', page)
  return slide
}

function addGoals(pptx, artifact, page) {
  const slide = pptx.addSlide('CONTENT')
  title(slide, 'Was die Lernenden am Ende koennen', 'Lernziele')
  const goals = arr(artifact.learningGoals).slice(0, 4)
  goals.forEach((goal, index) => {
    const y = 1.72 + index * 1.18
    slide.addShape(pptx.ShapeType.ellipse, { x: 0.82, y, w: 0.54, h: 0.54, fill: { color: index % 2 ? C.cyan : C.blue }, line: { transparency: 100 } })
    slide.addText(String(index + 1), { x: 0.82, y: y + 0.08, w: 0.54, h: 0.22, align: 'center', fontSize: 13, bold: true, color: C.white, margin: 0 })
    slide.addText(clean(goal), { x: 1.58, y: y - 0.02, w: 10.5, h: 0.7, fontSize: 21, color: C.ink, margin: 0, fit: 'shrink' })
  })
  footer(slide, 'EduFlow Studio | Lernziele', page)
  return slide
}

function addConceptSlide(pptx, item, index, page) {
  const slide = pptx.addSlide('CONTENT')
  title(slide, clean(item.title, `Folie ${index + 1}`), `Lernschritt ${index + 1}`)
  const bullets = bulletRuns(item.bullets)
  const hasVisual = Boolean(item.imageData || item.imageUrl || item.visualPrompt)
  slide.addText(bullets.length ? bullets : [{ text: 'Inhalt gemeinsam erschliessen.', options: { bullet: { indent: 18 }, breakLine: true } }], {
    x: 0.82, y: 1.72, w: hasVisual ? 7.05 : 11.4, h: 4.7,
    fontFace: 'Aptos', fontSize: 22, color: C.ink, breakLine: false,
    paraSpaceAfterPt: 16, breakLineOnOverflow: false, fit: 'shrink', margin: 0.06,
  })
  if (item.imageData) {
    slide.addImage({ data: item.imageData, x: 8.35, y: 1.75, w: 4.05, h: 3.85, sizing: 'contain' })
  } else if (hasVisual) {
    slide.addShape(pptx.ShapeType.roundRect, { x: 8.35, y: 1.75, w: 4.05, h: 3.85, rectRadius: 0.08, fill: { color: C.pale }, line: { color: 'BFDBFE', width: 1.2 } })
    slide.addShape(pptx.ShapeType.ellipse, { x: 9.6, y: 2.35, w: 1.55, h: 1.55, fill: { color: C.cyan, transparency: 15 }, line: { transparency: 100 } })
    slide.addShape(pptx.ShapeType.chevron, { x: 9.05, y: 3.55, w: 2.7, h: 1.25, fill: { color: C.blue, transparency: 12 }, line: { transparency: 100 } })
    slide.addText(clean(item.visualPrompt, 'Visualisierung zum Inhalt'), { x: 8.73, y: 5.25, w: 3.3, h: 0.7, align: 'center', fontSize: 11, italic: true, color: C.muted, margin: 0.03, fit: 'shrink' })
  }
  if (item.speakerNotes) slide.addNotes(clean(item.speakerNotes))
  footer(slide, 'EduFlow Studio', page)
  return slide
}

function addActivity(pptx, artifact, page) {
  const slide = pptx.addSlide('CONTENT')
  title(slide, 'Jetzt anwenden und erklaeren', 'Lernaktivitaet')
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.82, y: 1.72, w: 7.1, h: 4.65, rectRadius: 0.08, fill: { color: C.pale }, line: { color: 'BFDBFE' } })
  slide.addText('Arbeitsauftrag', { x: 1.18, y: 2.08, w: 3, h: 0.34, fontSize: 24, bold: true, color: C.blue, margin: 0 })
  slide.addText(clean(artifact.teachingNotes, 'Erklaert die Kernaussagen in eigenen Worten und belegt sie mit der Quelle.').slice(0, 650), { x: 1.18, y: 2.68, w: 6.35, h: 2.85, fontSize: 19, color: C.ink, valign: 'mid', margin: 0.04, fit: 'shrink' })
  slide.addText('DENKEN', { x: 8.55, y: 1.95, w: 3.1, h: 0.28, fontSize: 14, bold: true, color: C.amber, margin: 0 })
  slide.addText('AUSTAUSCHEN', { x: 8.55, y: 3.1, w: 3.1, h: 0.28, fontSize: 14, bold: true, color: C.blue, margin: 0 })
  slide.addText('SICHERN', { x: 8.55, y: 4.25, w: 3.1, h: 0.28, fontSize: 14, bold: true, color: C.green, margin: 0 })
  slide.addText('Notiere eine begruendete Antwort.', { x: 8.55, y: 2.32, w: 3.45, h: 0.5, fontSize: 17, color: C.ink, margin: 0 })
  slide.addText('Vergleiche sie mit einer Partnerperson.', { x: 8.55, y: 3.47, w: 3.45, h: 0.5, fontSize: 17, color: C.ink, margin: 0 })
  slide.addText('Formuliert eine gemeinsame Kernaussage.', { x: 8.55, y: 4.62, w: 3.45, h: 0.7, fontSize: 17, color: C.ink, margin: 0 })
  footer(slide, 'EduFlow Studio | Transfer', page)
  return slide
}

function addQuiz(pptx, quiz, pageStart) {
  let page = pageStart
  arr(quiz).slice(0, 4).forEach((item, index) => {
    const slide = pptx.addSlide('CONTENT')
    title(slide, clean(item.question, `Quizfrage ${index + 1}`), `Lerncheck ${index + 1}`)
    arr(item.options).slice(0, 4).forEach((option, optionIndex) => {
      const col = optionIndex % 2
      const row = Math.floor(optionIndex / 2)
      const x = 0.82 + col * 6.0
      const y = 1.85 + row * 2.0
      slide.addShape(pptx.ShapeType.roundRect, { x, y, w: 5.55, h: 1.45, rectRadius: 0.06, fill: { color: optionIndex % 2 ? 'F8FAFC' : C.pale }, line: { color: C.line } })
      slide.addText(String.fromCharCode(65 + optionIndex), { x: x + 0.3, y: y + 0.38, w: 0.55, h: 0.35, fontSize: 22, bold: true, color: C.blue, margin: 0 })
      slide.addText(clean(option), { x: x + 1.0, y: y + 0.22, w: 4.15, h: 0.92, fontSize: 17, color: C.ink, valign: 'mid', margin: 0.02, fit: 'shrink' })
    })
    slide.addNotes(`Loesung: ${clean(item.answer)}\n\n${clean(item.explanation)}`)
    footer(slide, 'EduFlow Studio | Lerncheck (Loesung in Notizen)', page++)
  })
  return page
}

function addClose(pptx, artifact, page) {
  const slide = pptx.addSlide('CLOSING')
  slide.addText('Das Wichtigste in einem Satz', { x: 0.85, y: 1.25, w: 11.6, h: 0.55, fontSize: 24, bold: true, color: 'BFDBFE', margin: 0, align: 'center' })
  slide.addText(clean(artifact.summary).slice(0, 420), { x: 1.3, y: 2.25, w: 10.7, h: 2.15, fontSize: 30, bold: true, color: C.white, align: 'center', valign: 'mid', margin: 0.05, fit: 'shrink' })
  slide.addText('Welche neue Frage nimmst du mit?', { x: 2.4, y: 5.35, w: 8.5, h: 0.45, fontSize: 20, color: 'DBEAFE', align: 'center', margin: 0 })
  footer(slide, 'EduFlow Studio | Abschluss', page)
  return slide
}

export async function buildStudioPresentation(artifact) {
  const pptx = new pptxgen()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'EduFlow'
  pptx.company = 'EduFlow'
  pptx.subject = clean(artifact.subject)
  pptx.title = clean(artifact.title, 'EduFlow Studio')
  pptx.lang = 'de-CH'
  pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'de-CH' }
  pptx.defineSlideMaster({ title: 'COVER', background: { color: C.navy }, objects: [{ rect: { x: 0, y: 0, w: 13.333, h: 0.13, fill: { color: C.cyan }, line: { color: C.cyan } } }] })
  pptx.defineSlideMaster({ title: 'CONTENT', background: { color: C.white }, objects: [{ rect: { x: 0, y: 0, w: 0.16, h: 7.5, fill: { color: C.blue }, line: { color: C.blue } } }] })
  pptx.defineSlideMaster({ title: 'CLOSING', background: { color: C.navy }, objects: [{ rect: { x: 0, y: 7.36, w: 13.333, h: 0.14, fill: { color: C.cyan }, line: { color: C.cyan } } }] })

  let page = 1
  addCover(pptx, artifact, page++)
  if (arr(artifact.learningGoals).length) addGoals(pptx, artifact, page++)
  arr(artifact.slides).slice(0, 10).forEach((item, index) => addConceptSlide(pptx, item, index, page++))
  addActivity(pptx, artifact, page++)
  page = addQuiz(pptx, artifact.quiz, page)
  addClose(pptx, artifact, page)
  return pptx.write({ outputType: 'nodebuffer' })
}
