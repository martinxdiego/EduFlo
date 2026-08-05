const asArray = value => Array.isArray(value) ? value : []
const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim()

export const MATERIAL_STATUSES = new Set(['draft', 'review', 'ready', 'archived'])

export function normalizeMaterialMetadata(input = {}) {
  const tags = [...new Set(asArray(input.tags).map(cleanText).filter(Boolean))].slice(0, 8)
  const status = MATERIAL_STATUSES.has(input.status) ? input.status : 'draft'
  return {
    status,
    folder: cleanText(input.folder).slice(0, 60),
    tags: tags.map(tag => tag.slice(0, 30)),
    favorite: Boolean(input.favorite),
    archived: status === 'archived' || Boolean(input.archived),
    reviewed_at: input.reviewed_at ? new Date(input.reviewed_at) : null,
  }
}

export function materialQualityChecklist(material = {}) {
  const questions = asArray(material?.content?.questions)
  const normalizedQuestions = questions.map(question => cleanText(question?.question).toLowerCase()).filter(Boolean)
  const checks = [
    { id: 'questions', label: 'Aufgaben sind vollständig formuliert', passed: questions.length > 0 && questions.every(question => cleanText(question?.question).length >= 8) },
    { id: 'solutions', label: 'Jede Aufgabe besitzt eine Musterlösung', passed: questions.length > 0 && questions.every(question => cleanText(question?.answer).length > 0) },
    { id: 'duplicates', label: 'Keine doppelten Aufgaben erkannt', passed: new Set(normalizedQuestions).size === normalizedQuestions.length },
    { id: 'level', label: 'Klassenstufe und Fach sind festgelegt', passed: Boolean(cleanText(material.grade) && cleanText(material.subject)) },
    { id: 'quality', label: 'Automatische Qualitätsprüfung bestanden', passed: !material?.content?.quality || Number(material.content.quality.score || 0) >= 80 },
  ]
  const passed = checks.filter(check => check.passed).length
  return { checks, passed, total: checks.length, score: Math.round((passed / checks.length) * 100), ready: passed === checks.length }
}

export function materialSearchText(material = {}) {
  const questions = asArray(material?.content?.questions).flatMap(question => [question?.question, question?.answer])
  return [material.title, material.topic, material.subject, material.folder, ...asArray(material.tags), ...questions]
    .map(cleanText).filter(Boolean).join(' ').toLowerCase()
}

export function filterMaterials(materials, filters = {}) {
  const query = cleanText(filters.search).toLowerCase()
  return asArray(materials).filter(material => {
    if (filters.archivedOnly && !(material.archived || material.status === 'archived')) return false
    if (!filters.showArchived && (material.archived || material.status === 'archived')) return false
    if (filters.favoriteOnly && !material.favorite) return false
    if (filters.folder && filters.folder !== 'all' && cleanText(material.folder) !== filters.folder) return false
    if (filters.status && filters.status !== 'all' && (material.status || 'draft') !== filters.status) return false
    return !query || materialSearchText(material).includes(query)
  })
}
