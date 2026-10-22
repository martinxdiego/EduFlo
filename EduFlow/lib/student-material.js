import { answerItems, matchingPairs, normalizeQuestion, trueFalseLabel } from './worksheet-answers.js'

export const STRUCTURED_GRADER_VERSION = 'worksheet-structured-v2'

export function parseMatchingPairs(answer) { return matchingPairs(answer) }

function shuffled(items, seed) {
  const result = items.map((item, index) => ({ item, index }))
  let state = (seed >>> 0) || 1
  for (let index = result.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const swap = state % (index + 1)
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  if (result.length > 1 && result.every((entry, index) => entry.index === index)) result.push(result.shift())
  return result.map(entry => entry.item)
}

export function shuffledMatchingRight(question) {
  const pairs = matchingPairs(question.answer)
  return shuffled(pairs.map((pair, origIdx) => ({ text: pair[1], origIdx })), (question.number || 0) * 7 + pairs.length)
}

export function shuffledOrderingItems(question) {
  const items = answerItems(question.answer)
  return shuffled(items, (question.number || 0) * 13 + items.length)
}

export function studentQuestion(source) {
  const question = normalizeQuestion(source)
  const result = {
    number: question.number, type: question.type, question: question.question,
    options: question.options, points: question.type === 'image_block' ? 0 : question.points,
    ...(typeof question.imageUrl === 'string' ? { imageUrl: question.imageUrl } : {}),
  }
  if (question.type === 'matching') {
    result.matching_left = matchingPairs(question.answer).map(pair => pair[0])
    result.matching_right = shuffledMatchingRight(question).map(item => item.text)
  }
  if (question.type === 'ordering') result.ordering_items = shuffledOrderingItems(question)
  if (question.type === 'either_or' && !question.options?.length) result.options = ['Ja', 'Nein']
  if (question.type === 'table') {
    result.tableHeaders = question.tableHeaders || []
    result.tableRows = question.tableRows || []
  }
  return result
}

// Explicit allowlist: provider extras, answer keys, notes and explanations must
// never reach a student simply because they exist on the stored content object.
export function studentMaterialContent(content) {
  const source = content && typeof content === 'object' ? content : {}
  return {
    ...(typeof source.title === 'string' ? { title: source.title } : {}),
    ...(typeof source.estimated_time === 'string' ? { estimated_time: source.estimated_time } : {}),
    ...(Number.isFinite(source.total_points) ? { total_points: source.total_points } : {}),
    questions: (Array.isArray(source.questions) ? source.questions : []).map(studentQuestion),
  }
}

export function deterministicWorksheetGrade(source, studentAnswer) {
  const question = normalizeQuestion(source)
  if (!question.answer && question.type !== 'image_block') return null
  if (question.type === 'true_false') {
    if (!['Wahr', 'Falsch'].includes(question.answer)) return null
    return trueFalseLabel(studentAnswer) === question.answer
  }
  if (['multiple_choice', 'either_or'].includes(question.type)) return studentAnswer === question.answer
  if (question.type === 'math') {
    const numeric = value => String(value ?? '').trim().replace(/\s/g, '').replace(',', '.')
    const answer = numeric(question.answer)
    if (!/^-?\d+(?:\.\d+)?$/.test(answer)) return null
    return numeric(studentAnswer) === answer
  }
  if (['fill_blank', 'ordering'].includes(question.type)) {
    const correct = answerItems(question.answer).map(item => item.toLocaleLowerCase('de-CH'))
    if (!correct.length || correct.some(item => !item)) return null
    const submitted = Array.isArray(studentAnswer) ? studentAnswer.map(item => String(item ?? '').trim().toLocaleLowerCase('de-CH')) : []
    return correct.length === submitted.length && correct.every((item, index) => item === submitted[index])
  }
  if (question.type === 'matching') {
    const pairs = matchingPairs(question.answer)
    if (!pairs.length || pairs.some(pair => pair.some(item => !item))) return null
    const right = shuffledMatchingRight(question)
    const matches = studentAnswer?.matches || studentAnswer
    if (!matches || typeof matches !== 'object' || Array.isArray(matches) || Object.keys(matches).length !== pairs.length) return false
    return pairs.every((_, left) => Object.hasOwn(matches, String(left)) && right[Number(matches[left])]?.origIdx === left)
  }
  return null
}
