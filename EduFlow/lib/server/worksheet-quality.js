import { z } from 'zod'
import { answerItems, matchingPairs, normalizeQuestion, usesSwissSpelling } from '../worksheet-answers.js'

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
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function comparable(value) {
  return String(value || '')
    .toLocaleLowerCase('de-CH')
    .replace(/[^a-z0-9äöüéèàç]+/gi, ' ')
    .trim()
}

export function normalizeWorksheetContent(input, requestedQuestionCount, { subject } = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const questions = Array.isArray(source.questions) ? source.questions : []
  const limit = Number.isInteger(Number(requestedQuestionCount)) && Number(requestedQuestionCount) > 0
    ? Number(requestedQuestionCount)
    : questions.length

  const normalizedQuestions = questions.slice(0, limit).map((question, index) => {
    const item = question && typeof question === 'object' ? question : {}
    const rawType = comparable(item.type).replace(/\s+/g, '_') || 'open'
    const type = TYPE_ALIASES[rawType] || rawType
    const normalizedItem = normalizeQuestion({ ...item, type }, { swissSpelling: usesSwissSpelling(subject) })
    const options = Array.isArray(normalizedItem.options)
      ? [...new Set(normalizedItem.options.map(cleanText).filter(Boolean))]
      : undefined

    return {
      ...normalizedItem,
      number: index + 1,
      type,
      question: cleanText(normalizedItem.question),
      ...(options ? { options } : {}),
      answer: normalizedItem.answer.trim(),
      points: Math.max(1, Math.min(10, Number(item.points) || 1)),
    }
  })

  const authoredText = value => {
    const text = cleanText(value)
    return usesSwissSpelling(subject) ? text.replaceAll('ß', 'ss').replaceAll('ẞ', 'SS') : text
  }
  return {
    ...source,
    title: authoredText(source.title || 'Unterrichtsmaterial'),
    questions: normalizedQuestions,
    teacher_notes: authoredText(source.teacher_notes || source.teacherNotes || ''),
    total_points: normalizedQuestions.reduce((sum, question) => sum + question.points, 0),
  }
}

const normalizedQuestionSchema = z.object({
  type: z.enum([...SUPPORTED_TYPES]),
  question: z.string().min(1),
  answer: z.string(),
  points: z.number().finite().min(1).max(10),
  options: z.array(z.string().min(1)).optional(),
  tableHeaders: z.array(z.string()).optional(),
  tableRows: z.array(z.array(z.string())).optional(),
}).passthrough().superRefine((question, ctx) => {
  if (question.type === 'table' && (!question.tableHeaders?.length || !question.tableRows?.length
    || question.tableRows.some(row => row.length !== question.tableHeaders.length))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Die Tabelle benötigt Spalten und passende Zeilen.' })
  }
  if (question.type === 'either_or' && (question.options?.length !== 2 || !question.options.includes(question.answer))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Entweder-Oder benötigt zwei Optionen und eine passende Lösung.' })
  }
})

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
    if (question?.type !== 'image_block' && !cleanText(question?.answer)) errors.push(`${label} enthält keine Musterlösung.`)

    if (question?.type === 'multiple_choice') {
      const options = Array.isArray(question.options) ? question.options : []
      if (options.length < 3) errors.push(`${label} benötigt mindestens drei unterschiedliche Antwortoptionen.`)
      if (!options.includes(question.answer)) errors.push(`${label}: Die Musterlösung passt zu keiner Antwortoption.`)
      if (new Set(options.map(option => comparable(option).replace(/^[a-d][.)\s-]+/i, ''))).size !== options.length) {
        errors.push(`${label}: Die Antwortoptionen müssen sich unterscheiden.`)
      }
    }

    if (question?.type === 'true_false' && !/^(wahr|falsch)$/i.test(String(question.answer ?? '').trim())) {
      errors.push(`${label}: Die Wahr/Falsch-Lösung ist nicht eindeutig.`)
    }

    const contract = normalizedQuestionSchema.safeParse(question)
    if (!contract.success) errors.push(`${label}: Die Aufgabenstruktur ist ungültig.`)
    if (['ordering', 'fill_blank'].includes(question?.type)) {
      const items = answerItems(question.answer)
      const minimum = question.type === 'ordering' ? 2 : 1
      if (items.length < minimum || items.some(item => !item)) errors.push(`${label}: Die Lösungsliste ist unvollständig.`)
    }
    if (question?.type === 'matching') {
      const pairs = matchingPairs(question.answer)
      if (pairs.length < 2 || pairs.some(pair => pair.some(item => !item))) errors.push(`${label}: Es fehlen vollständige Zuordnungspaare.`)
    }

    if (String(question?.question || '').length > 500) warnings.push(`${label} ist ungewöhnlich lang.`)
  })

  if (!cleanText(content?.teacher_notes)) warnings.push('Hinweise für die Lehrperson fehlen.')
  const score = Math.max(0, 100 - (errors.length * 18) - (warnings.length * 4))

  return { passed: errors.length === 0 && score >= 80, score, errors, warnings }
}

export function prepareWorksheetContent(input, requestedQuestionCount, options) {
  const content = normalizeWorksheetContent(input, requestedQuestionCount, options)
  const quality = assessWorksheetQuality(content, requestedQuestionCount)
  return { content, quality }
}
