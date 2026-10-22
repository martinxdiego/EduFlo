// Shared by the editor, exports and server. Keep the persisted v1 answer string
// compatible with existing materials; encode list delimiters without losing text.
function scalarText(value) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return String(value)
  return ''
}

export function answerItems(value) {
  if (Array.isArray(value)) return value.map(scalarText)
  const text = scalarText(value)
  if (!text) return []
  const items = []
  let current = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"' && (quoted || !current.trim())) {
      if (quoted && text[index + 1] === '"') { current += '"'; index++ }
      else quoted = !quoted
    } else if (char === ',' && !quoted) {
      items.push(current.trim())
      current = ''
    } else current += char
  }
  items.push(current.trim())
  return items
}

export function joinAnswerItems(items) {
  return items.map(scalarText).map(text => /[,"\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text).join(', ')
}

export function trueFalseLabel(value) {
  const text = scalarText(value)
  if (/^(true|wahr|richtig)$/i.test(text)) return 'Wahr'
  if (/^(false|falsch)$/i.test(text)) return 'Falsch'
  return text
}

function matchingEntry(value) {
  if (Array.isArray(value) && value.length === 2) return value.map(scalarText)
  if (value && typeof value === 'object') return [scalarText(value.left), scalarText(value.right)]
  const text = scalarText(value)
  const delimiter = text.includes('→') ? '→' : text.includes(' - ') ? ' - ' : '-'
  const index = text.indexOf(delimiter)
  return index < 0 ? [text, ''] : [text.slice(0, index).trim(), text.slice(index + delimiter.length).trim()]
}

export function matchingPairs(answer) {
  return (Array.isArray(answer) ? answer : answerItems(answer)).map(matchingEntry)
}

export function normalizeQuestion(question, { swissSpelling = false } = {}) {
  const item = question && typeof question === 'object' && !Array.isArray(question)
    ? { ...question, type: typeof question.type === 'string' ? question.type : 'open' } : { type: 'open' }
  const rawAnswer = item.answer ?? item.solution ?? ''
  let answer
  if (item.type === 'matching') {
    const pairs = matchingPairs(rawAnswer)
    answer = pairs.length && pairs.every(pair => pair.every(Boolean))
      ? joinAnswerItems(pairs.map(([left, right]) => `${left} → ${right}`)) : ''
  } else if (['ordering', 'fill_blank'].includes(item.type) && Array.isArray(rawAnswer)) {
    answer = rawAnswer.every(value => scalarText(value)) ? joinAnswerItems(rawAnswer) : ''
  } else answer = scalarText(rawAnswer)
  if (item.type === 'true_false') answer = trueFalseLabel(answer)
  const text = value => {
    const normalized = scalarText(value)
    return swissSpelling ? normalized.replaceAll('ß', 'ss').replaceAll('ẞ', 'SS') : normalized
  }
  const normalized = { ...item, question: text(item.question ?? item.title), answer: text(answer), points: Math.max(1, Math.min(10, Number(item.points) || 1)) }
  if (Array.isArray(item.options)) normalized.options = item.options.map(value => text(item.type === 'true_false' ? trueFalseLabel(value) : value)).filter(Boolean)
  else if (item.options != null) normalized.options = []
  if (item.type === 'true_false') normalized.options = ['Wahr', 'Falsch']
  if (item.type === 'multiple_choice' && normalized.options?.length) {
    const value = normalized.answer
    const letter = /^[a-z]$/i.test(value) ? value.toUpperCase().charCodeAt(0) - 65 : -1
    const comparableOption = option => option.replace(/^[a-z][.)]\s*/i, '').trim().toLocaleLowerCase('de-CH')
    normalized.answer = normalized.options[letter] || normalized.options.find(option => comparableOption(option) === comparableOption(value)) || value
  }
  if (item.tableHeaders != null) normalized.tableHeaders = Array.isArray(item.tableHeaders) ? item.tableHeaders.map(text) : []
  if (item.tableRows != null) normalized.tableRows = Array.isArray(item.tableRows) ? item.tableRows.filter(Array.isArray).map(row => row.map(text)) : []
  for (const field of ['explanation', 'imageCaption', 'caption', 'alt']) {
    if (item[field] != null) normalized[field] = text(item[field])
  }
  return normalized
}

export function usesSwissSpelling(subject) {
  return !/englisch|französisch|franzoesisch|italienisch|english|french|italian/i.test(String(subject || ''))
}

export function normalizeWorksheet(worksheet, { swissSpelling = false } = {}) {
  if (!worksheet || typeof worksheet !== 'object' || Array.isArray(worksheet)) return null
  const swiss = swissSpelling && usesSwissSpelling(worksheet.subject)
  const text = value => swiss ? scalarText(value).replaceAll('ß', 'ss').replaceAll('ẞ', 'SS') : scalarText(value)
  const source = worksheet.content && typeof worksheet.content === 'object' ? worksheet.content : {}
  return {
    ...worksheet,
    title: text(worksheet.title),
    content: {
      ...source,
      ...(source.title != null ? { title: text(source.title) } : {}),
      ...(source.teacher_notes != null ? { teacher_notes: text(source.teacher_notes) } : {}),
      questions: (Array.isArray(source.questions) ? source.questions : []).map(question => normalizeQuestion(question, { swissSpelling: swiss })),
    },
  }
}
