export const CONFIDENCE_MEANING = 'How well-supported and stable is this estimate?'

const MASTERY_LABELS = Object.freeze({
  not_yet_demonstrated: 'No demonstration yet',
  difficulty_signal: 'Current Evidence shows difficulty',
  developing: 'Mixed or developing demonstration',
  demonstrated: 'Demonstrated in current tasks',
  appears_strong: 'Positive Evidence; confirmation needed',
  secure: 'Consistently demonstrated in the current Evidence scope',
})

const LIMITATION_LABELS = Object.freeze({
  selected_response_only: 'Evidence is limited to selected-response tasks; explanation, transfer and broader modality mastery are not demonstrated.',
  single_modality_evidence: 'Evidence currently comes from one response modality.',
  no_active_evidence: 'There is not enough active Evidence to support an estimate.',
  support_required_neutral_evidence: 'A Tutor Session ended with support still required; this does not lower Mastery by itself.',
  single_task_only: 'Evidence comes from only one task, which limits Confidence.',
  confidence_below_secure_threshold: 'The estimate needs more support before it can be considered stable.',
  teacher_assessment_only: 'The estimate is based only on teacher assessment Evidence and Confidence is capped at 0.60.',
  teacher_no_demonstration: 'A teacher recorded an observation that did not provide a demonstration.',
})

export function masteryLabel(state) {
  return MASTERY_LABELS[state?.band] || 'No demonstration yet'
}

export function confidenceLabel(state) {
  if (!state || state.evidence_count === 0) return 'Not enough Evidence to estimate'
  if (state.confidence < 0.40) return 'Limited support for the estimate'
  if (state.confidence < 0.70) return 'Moderately supported estimate'
  return 'Well-supported estimate'
}

export function limitationLabels(limitations = []) {
  return limitations.map((code) => LIMITATION_LABELS[code] || code.replaceAll('_', ' '))
}

export function teacherReasonStatements(evidence = [], state) {
  const active = evidence.filter((item) => item.status === 'active')
  const statements = []
  const independentCorrect = active.filter((item) => item.type === 'correct_answer')
  const independentErrors = active.filter((item) => item.type === 'incorrect_answer')
  const errorTasks = new Set(independentErrors.map((item) => item.source?.task_id).filter(Boolean))
  const assisted = active.filter((item) => item.type === 'correct_after_hint')
  const teacher = active.filter((item) => item.type === 'teacher_assessment')
  if (independentCorrect.length) statements.push('Recent independent correct Evidence supports this estimate.')
  if (independentErrors.length >= 2 && errorTasks.size >= 2) statements.push('Independent errors across distinct tasks challenge the current estimate.')
  if (assisted.length && !independentCorrect.length) statements.push('Successful performance is currently demonstrated only after Tutor assistance.')
  for (const level of [1, 2, 3]) {
    if (assisted.some((item) => item.hint_level === level)) statements.push(`A successful result followed Level ${level} assistance and contributes less than independent Evidence.`)
  }
  if (state?.limitations?.includes('selected_response_only')) statements.push('Evidence is limited to selected-response application; explanation and transfer are not demonstrated.')
  if (state?.limitations?.includes('single_task_only')) statements.push('Evidence comes from only one task, which limits Confidence.')
  if (evidence.some((item) => item.status === 'invalidated')) statements.push('Invalidated Evidence remains in the audit timeline and does not contribute to the current estimate.')
  if (!state || state.evidence_count === 0) statements.push('There is not enough contributing Evidence to support a stable estimate.')
  if (active.some((item) => item.claim?.result === 'supports') && active.some((item) => item.claim?.result === 'challenges')) statements.push('Active Evidence contains both supporting and challenging results.')
  if (active.some((item) => item.type === 'support_required')) statements.push('A Tutor Session ended with support still required; this is visible but does not lower Mastery by itself.')
  if (teacher.some((item) => item.claim.result === 'supports')) statements.push('A teacher assessment supports this competency.')
  if (teacher.some((item) => item.claim.result === 'challenges')) statements.push('A teacher assessment challenges this competency.')
  if (teacher.some((item) => item.claim.result === 'no_demonstration')) statements.push('A teacher recorded that an observation did not provide a demonstration; it did not change Mastery or Confidence.')
  return [...new Set(statements)]
}

export function changeExplanation(before, after, evidence) {
  if (!before && after) return `A Knowledge State was created after ${evidence.type.replaceAll('_', ' ')} was recorded.`
  if (!after) return 'No Knowledge State is currently available.'
  if (before?.mastery === after.mastery && before?.confidence === after.confidence) {
    return 'The Evidence audit trail changed, but the calculated Mastery and Confidence estimates did not.'
  }
  return `The calculated estimate changed from ${masteryLabel(before)} to ${masteryLabel(after)} because active Evidence was rebuilt.`
}

export function roundEstimate(value) {
  return Math.round(Number(value || 0) * 100) / 100
}
