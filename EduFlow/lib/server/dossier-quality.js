const BLOCK_TYPES = new Set(['heading', 'text', 'info_box', 'table', 'question', 'objectives_checklist', 'creative_task', 'reflection', 'glossary'])
const QUESTION_TYPES = new Set(['multiple_choice', 'open', 'fill_blank', 'matching', 'ordering', 'true_false'])

const arr = value => Array.isArray(value) ? value : []
const text = value => String(value || '').replace(/\s+/g, ' ').trim()

export function validateDossierOutline(outline) {
  const errors = []
  const sections = arr(outline?.sections)
  if (!text(outline?.title)) errors.push('Titel fehlt.')
  if (sections.length < 6 || sections.length > 12) errors.push('Der Plan braucht 6 bis 12 Sektionen.')
  if (sections[0]?.type !== 'objectives') errors.push('Die erste Sektion muss Lernziele enthalten.')
  if (!sections.some(section => ['summary', 'glossary'].includes(section.type))) errors.push('Eine Abschluss- oder Glossarsektion fehlt.')
  const titles = sections.map(section => text(section.title).toLowerCase()).filter(Boolean)
  if (new Set(titles).size !== titles.length) errors.push('Sektionsueberschriften duerfen sich nicht wiederholen.')
  return { passed: errors.length === 0, errors, score: Math.max(0, 100 - errors.length * 20) }
}

function normalizeBlock(block, index) {
  const type = BLOCK_TYPES.has(block?.type) ? block.type : 'text'
  const content = block?.content && typeof block.content === 'object' ? { ...block.content } : { html: text(block?.content) }
  if (type === 'heading') {
    content.text = text(content.text || content.html || `Abschnitt ${index + 1}`)
    content.level = Math.min(3, Math.max(1, Number(content.level) || 2))
  }
  if (type === 'text') content.html = String(content.html || content.text || '').trim()
  if (type === 'question') {
    content.type = QUESTION_TYPES.has(content.type) ? content.type : 'open'
    content.question = text(content.question)
    content.answer = text(content.answer)
    content.explanation = text(content.explanation)
    content.answerLines = Math.min(12, Math.max(1, Number(content.answerLines) || 3))
    if (content.type === 'multiple_choice') content.options = arr(content.options).map(text).filter(Boolean).slice(0, 5)
  }
  return { type, content }
}

export function prepareDossierSection(sectionContent, { sectionType = 'theory', grade = 5 } = {}) {
  let blocks = arr(sectionContent?.blocks).map(normalizeBlock)
  const errors = []
  const warnings = []
  if (!['exercises', 'source_text'].includes(sectionType)) {
    const before = blocks.length
    blocks = blocks.filter(block => block.type !== 'question' || (text(block.content.question) && text(block.content.answer)))
    if (blocks.length < before) warnings.push('Unvollständige optionale Aufgaben wurden aus dieser Sektion entfernt.')
  }
  if (blocks.length < 2) errors.push('Die Sektion hat zu wenig Inhalt.')
  if (!blocks.some(block => block.type === 'heading')) errors.push('Eine klare Ueberschrift fehlt.')
  const questions = blocks.filter(block => block.type === 'question')
  if (sectionType === 'exercises' && questions.length < 3) errors.push('Eine Uebungssektion braucht mindestens drei Aufgaben.')
  questions.forEach((block, index) => {
    if (!block.content.question) errors.push(`Aufgabe ${index + 1} hat keinen Fragetext.`)
    if (!block.content.answer) errors.push(`Aufgabe ${index + 1} hat keine Musterloesung.`)
    if (block.content.type === 'multiple_choice') {
      if (block.content.options.length !== 4) errors.push(`Multiple-Choice-Aufgabe ${index + 1} braucht vier Optionen.`)
      if (block.content.options.length && !block.content.options.includes(block.content.answer)) errors.push(`Die Loesung der Multiple-Choice-Aufgabe ${index + 1} muss exakt einer Option entsprechen.`)
    }
  })
  const plain = blocks.map(block => text(block.content?.html || block.content?.text || block.content?.question)).join(' ')
  if (['theory', 'source_text'].includes(sectionType) && plain.length < (Number(grade) >= 7 ? 700 : 450)) warnings.push('Der Theorieteil ist eher knapp.')
  const score = Math.max(0, 100 - errors.length * 18 - warnings.length * 5)
  return { content: { blocks, summary: text(sectionContent?.summary) }, quality: { passed: errors.length === 0, errors, warnings, score } }
}

export function evaluateDossier(sections, objectives = []) {
  const errors = []
  const allBlocks = arr(sections).flatMap(section => arr(section.blocks))
  const questions = allBlocks.filter(block => block.type === 'question').map(block => block.content || {})
  if (arr(sections).length < 6) errors.push('Dossier hat zu wenig Sektionen.')
  if (!arr(objectives).length) errors.push('Lernziele fehlen.')
  if (questions.length < 5) errors.push('Dossier hat zu wenig Aufgaben.')
  if (questions.some(question => !text(question.answer))) errors.push('Mindestens eine Aufgabe hat keine Loesung.')
  const normalized = questions.map(question => text(question.question).toLowerCase()).filter(Boolean)
  if (new Set(normalized).size !== normalized.length) errors.push('Doppelte Aufgaben erkannt.')
  return { passed: errors.length === 0, errors, score: Math.max(0, 100 - errors.length * 15), questionCount: questions.length, sectionCount: arr(sections).length }
}
