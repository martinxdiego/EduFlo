const arr = value => Array.isArray(value) ? value : []
const text = value => String(value || '').trim()

export function evaluateStudioArtifact(artifact) {
  const errors = []
  const warnings = []
  if (!text(artifact?.title) || !text(artifact?.summary)) errors.push('Titel oder Zusammenfassung fehlt.')
  if (arr(artifact?.learningGoals).length < 3) errors.push('Mindestens drei Lernziele sind erforderlich.')
  if (arr(artifact?.slides).length < 5) errors.push('Mindestens fünf Folien sind erforderlich.')
  if (arr(artifact?.flashcards).length < 5) warnings.push('Weniger als fünf Lernkarten.')
  if (arr(artifact?.quiz).length < 4) errors.push('Mindestens vier Quizfragen sind erforderlich.')
  arr(artifact?.slides).forEach((slide, index) => {
    if (!text(slide.title) || arr(slide.bullets).length < 2) errors.push(`Folie ${index + 1} ist unvollständig.`)
  })
  arr(artifact?.quiz).forEach((item, index) => {
    if (arr(item.options).length !== 4) errors.push(`Quizfrage ${index + 1} braucht vier Optionen.`)
    if (!arr(item.options).includes(item.answer)) errors.push(`Antwort von Quizfrage ${index + 1} stimmt mit keiner Option überein.`)
  })
  return { passed: errors.length === 0, errors, warnings, score: Math.max(0, 100 - errors.length * 12 - warnings.length * 4) }
}
