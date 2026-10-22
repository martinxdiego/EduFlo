import { createHash } from 'crypto'
import { generateDomainId, isDomainId } from './learning-v2/contracts/ids.js'

export const WORKSHEET_QUESTION_IDENTITY_VERSION = 1
export const WORKSHEET_QUESTION_HASH_VERSION = 'worksheet-question-sha256-v1'

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  )
}

function authoredQuestionContent(question) {
  const source = question && typeof question === 'object' ? question : {}
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !['question_id', 'number'].includes(key)),
  )
}

export function worksheetQuestionContentHash(question) {
  const payload = JSON.stringify(canonicalize(authoredQuestionContent(question)))
  return `sha256:${createHash('sha256').update(payload, 'utf8').digest('hex')}`
}

function boundedArray(value, maximum = 50) {
  return Array.isArray(value) ? structuredClone(value.slice(0, maximum)) : undefined
}

export function worksheetQuestionAuditSnapshot(question) {
  const item = question && typeof question === 'object' ? question : {}
  const snapshot = {
    type: typeof item.type === 'string' ? item.type : 'open',
    prompt: String(item.question || item.title || '').slice(0, 4_000),
    answer: String(item.answer ?? item.solution ?? '').slice(0, 4_000),
    points: Number.isFinite(Number(item.points)) ? Number(item.points) : 1,
  }
  const options = boundedArray(item.options)
  const pairs = boundedArray(item.pairs)
  const items = boundedArray(item.items)
  if (options) snapshot.options = options
  if (pairs) snapshot.pairs = pairs
  if (items) snapshot.items = items
  if (typeof item.explanation === 'string') snapshot.explanation = item.explanation.slice(0, 4_000)
  return Object.freeze(snapshot)
}

export function hasStableWorksheetQuestionIds(content) {
  const questions = Array.isArray(content?.questions) ? content.questions : []
  const ids = questions.map((question) => question?.question_id)
  return ids.every((id) => isDomainId(id, 'wqi')) && new Set(ids).size === ids.length
}

export function reconcileWorksheetQuestionIds(nextContent, previousContent = null, options = {}) {
  const generateId = options.generateId || (() => generateDomainId('wqi'))
  const next = nextContent && typeof nextContent === 'object' ? structuredClone(nextContent) : {}
  const previousQuestions = Array.isArray(previousContent?.questions) ? previousContent.questions : []
  const knownIds = new Set(previousQuestions.map((question) => question?.question_id).filter((id) => isDomainId(id, 'wqi')))
  const usedIds = new Set()
  const questions = Array.isArray(next.questions) ? next.questions : []

  next.questions = questions.map((question, index) => {
    const item = question && typeof question === 'object' ? question : {}
    const requestedId = item.question_id
    const positionalId = previousQuestions[index]?.question_id
    let questionId = isDomainId(requestedId, 'wqi') && knownIds.has(requestedId) && !usedIds.has(requestedId)
      ? requestedId
      : null
    if (!questionId) {
      const contentHash = worksheetQuestionContentHash(item)
      const exactMatch = previousQuestions.find((candidate) => (
        isDomainId(candidate?.question_id, 'wqi')
        && !usedIds.has(candidate.question_id)
        && worksheetQuestionContentHash(candidate) === contentHash
      ))
      if (exactMatch) questionId = exactMatch.question_id
    }
    if (!questionId && isDomainId(positionalId, 'wqi') && !usedIds.has(positionalId)) questionId = positionalId
    if (!questionId) questionId = generateId()
    usedIds.add(questionId)
    return { ...item, question_id: questionId }
  })

  return next
}
