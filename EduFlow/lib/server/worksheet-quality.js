const TYPE_ALIASES = {
  short_answer: 'open',
  problem_solving: 'open',
  multiplechoice: 'multiple_choice',
  'true-false': 'true_false',
  cloze: 'fill_blank',
}

const SUPPORTED_TYPES = new Set([
  'multiple_choice', 'true_false', 'open', 'math', 'image', 'matching',
  'fill_blank', 'ordering', 'either_or', 'table', 'image_block',
])

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value
}

function comparable(value) {
  return String(value || '')
    .toLocaleLowerCase('de-CH')
    .replace(/[^a-z0-9äöüéèàç]+/gi, ' ')
    .trim()
}

export function normalizeWorksheetContent(input, requestedQuestionCount) {
  const source = input && typeof input === 'object' ? input : {}
  const questions = Array.isArray(source.questions) ? source.questions : []
  const limit = Number.isInteger(Number(requestedQuestionCount)) && Number(requestedQuestionCount) > 0
    ? Number(requestedQuestionCount)
    : questions.length

  const normalizedQuestions = questions.slice(0, limit).map((question, index) => {
    const item = question && typeof question === 'object' ? question : {}
    const rawType = comparable(item.type).replace(/\s+/g, '_') || 'open'
    const type = TYPE_ALIASES[rawType] || rawType
    const options = Array.isArray(item.options)
      ? [...new Set(item.options.map(cleanText).filter(Boolean))]
      : undefined

    return {
      ...item,
      number: index + 1,
      type,
      question: cleanText(item.question || item.title || ''),
      ...(options ? { options } : {}),
      answer: cleanText(item.answer ?? item.solution ?? ''),
      points: Math.max(1, Math.min(10, Number(item.points) || 1)),
    }
  })

  return {
    ...source,
    title: cleanText(source.title || 'Unterrichtsmaterial'),
    questions: normalizedQuestions,
    teacher_notes: cleanText(source.teacher_notes || source.teacherNotes || ''),
    total_points: normalizedQuestions.reduce((sum, question) => sum + question.points, 0),
  }
}

export function assessWorksheetQuality(content, requestedQuestionCount) {
  const questions = Array.isArray(content?.questions) ? content.questions : []
  const expected = Number(requestedQuestionCount) || questions.length
  const errors = []
  const warnings = []

  if (!cleanText(content?.title)) errors.push('Der Titel fehlt.')
  if (questions.length !== expected) errors.push(`Erwartet wurden ${expected} Fragen, erhalten wurden ${questions.length}.`)

  const seenQuestions = new Set()
  questions.forEach((question, index) => {
    const label = `Frage ${index + 1}`
    const normalizedText = comparable(question?.question)
    if (normalizedText.length < 8) errors.push(`${label} enthält keinen ausreichend klaren Fragetext.`)
    if (normalizedText && seenQuestions.has(normalizedText)) errors.push(`${label} ist ein Duplikat.`)
    seenQuestions.add(normalizedText)

    if (!SUPPORTED_TYPES.has(question?.type)) errors.push(`${label} verwendet den unbekannten Fragetyp „${question?.type || 'leer'}“.`)
    if (!cleanText(question?.answer)) errors.push(`${label} enthält keine Musterlösung.`)

    if (question?.type === 'multiple_choice') {
      const options = Array.isArray(question.options) ? question.options : []
      if (options.length < 3) errors.push(`${label} benötigt mindestens drei unterschiedliche Antwortoptionen.`)
      const answer = comparable(question.answer).replace(/^[a-d][.)\s-]+/i, '')
      const optionValues = options.map(option => comparable(option).replace(/^[a-d][.)\s-]+/i, ''))
      const answerIsLetter = /^[a-d]$/i.test(String(question.answer || '').trim())
      if (!answerIsLetter && answer && !optionValues.some(option => option === answer || option.includes(answer) || answer.includes(option))) {
        errors.push(`${label}: Die Musterlösung passt zu keiner Antwortoption.`)
      }
    }

    if (question?.type === 'true_false' && !/(wahr|falsch|richtig|true|false)/i.test(String(question.answer || ''))) {
      errors.push(`${label}: Die Wahr/Falsch-Lösung ist nicht eindeutig.`)
    }

    if (String(question?.question || '').length > 500) warnings.push(`${label} ist ungewöhnlich lang.`)
  })

  if (!cleanText(content?.teacher_notes)) warnings.push('Hinweise für die Lehrperson fehlen.')
  const score = Math.max(0, 100 - (errors.length * 18) - (warnings.length * 4))

  return { passed: errors.length === 0 && score >= 80, score, errors, warnings }
}

export function prepareWorksheetContent(input, requestedQuestionCount) {
  const content = normalizeWorksheetContent(input, requestedQuestionCount)
  const quality = assessWorksheetQuality(content, requestedQuestionCount)
  return { content, quality }
}
