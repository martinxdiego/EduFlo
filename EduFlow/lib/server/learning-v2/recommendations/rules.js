import { PHASE_2_COEFFICIENTS } from '../contracts/phase2.js'
import { teacherEvidenceWeight } from '../contracts/phase4.js'

export const evidenceTime = (item) => new Date(item.occurred_at).getTime()
export const taskKey = (id, version) => `${id}:${version}`
export const isContributing = (item) => item.type === 'teacher_assessment'
  ? teacherEvidenceWeight(item) > 0
  : item.type === 'correct_after_hint' ? item.tutor_weight > 0
    : ['correct_answer', 'incorrect_answer'].includes(item.type)
const isIndependentSupport = (item) => item.claim?.result === 'supports' && item.independence?.level === 'independent'
const isTeacherSupport = (item) => item.type === 'teacher_assessment' && item.claim?.result === 'supports' && isContributing(item)

export function abstain(...reasonCodes) {
  return { type: 'NO_RECOMMENDATION', reason_codes: reasonCodes, supporting_evidence_ids: [] }
}

// Evidence supplied here is already restricted to one exact objective/competency.
// Activity can veto freshness, but never contributes to Mastery or selects an action.
export function evaluateRecommendationRules({ state, evidence, activeTutor = false, canonicalSupportIds = [], latestProcessAt = null, now = new Date() }) {
  if (activeTutor) return abstain('ACTIVE_TUTOR_SESSION')
  const active = evidence.filter((item) => item.status === 'active').sort((a, b) => evidenceTime(a) - evidenceTime(b) || a.evidence_id.localeCompare(b.evidence_id))
  if (!active.length) return abstain('NO_ACTIVE_EVIDENCE')
  const contributing = active.filter(isContributing)
  const supporting = contributing.filter((item) => item.claim?.result === 'supports')
  const teacher = contributing.filter((item) => item.type === 'teacher_assessment')
  const automatic = contributing.filter((item) => item.type !== 'teacher_assessment')
  const cutoff = now.getTime() - PHASE_2_COEFFICIENTS.recent_evidence_days * 86_400_000
  const recent = (item) => evidenceTime(item) >= cutoff && evidenceTime(item) <= now.getTime()
  const laterSupport = (item) => contributing.some((other) => evidenceTime(other) > evidenceTime(item) && (isIndependentSupport(other) || isTeacherSupport(other)))
  const candidate = (rule, type, reasons, items) => ({
    type, rule_id: `P5-R${rule}`, priority: rule, reason_codes: reasons,
    supporting_evidence_ids: [...new Set(items.map((item) => item.evidence_id))].sort(),
  })
  const conflict = teacher.find((human) => automatic.some((auto) => ['supports', 'challenges'].includes(auto.claim?.result) && auto.claim.result !== human.claim.result))
  if (conflict) return candidate(1, 'TEACHER_INTERVENTION', ['CONFLICTING_TEACHER_AND_AUTOMATIC_EVIDENCE', 'TEACHER_REVIEW_BEFORE_NEXT_ACTION'], [conflict, ...automatic.filter((item) => item.claim.result !== conflict.claim.result)])

  const exhausted = active.filter((item) => item.type === 'support_required' && item.hint_level === 3
    && canonicalSupportIds.includes(item.evidence_id) && recent(item)).at(-1)
  if (exhausted && !laterSupport(exhausted)
    && (!latestProcessAt || evidenceTime(exhausted) >= new Date(latestProcessAt).getTime())) {
    return candidate(2, 'TEACHER_INTERVENTION', ['SUPPORT_REQUIRED', 'TEACHER_REVIEW_BEFORE_NEXT_ACTION'], [exhausted])
  }

  const errors = contributing.filter((item) => item.type === 'incorrect_answer' && item.independence?.level === 'independent' && recent(item))
  const errorTasks = new Set(errors.filter((item) => item.source?.task_id && item.source?.task_version).map((item) => taskKey(item.source.task_id, item.source.task_version)))
  // Exactly the frozen 2-errors / 2-tasks DEVELOPMENT threshold.
  if (state.band === 'difficulty_signal' && state.confidence >= 0.40 && errors.length >= 2 && errorTasks.size >= 2 && !laterSupport(errors.at(-1))) {
    return candidate(3, 'REVIEW_CONCEPT', ['REPEATED_INDEPENDENT_ERRORS', 'DIFFICULTY_SIGNAL_WELL_ENOUGH_SUPPORTED', 'CONCEPT_REVIEW_BEFORE_MORE_WORK'], errors)
  }

  const lastSupport = supporting.at(-1)
  if (lastSupport?.type === 'correct_after_hint' && [2, 3].includes(lastSupport.hint_level) && recent(lastSupport)
    && !supporting.some((item) => evidenceTime(item) > evidenceTime(lastSupport) && isIndependentSupport(item))) {
    return candidate(4, 'TRY_SIMILAR', ['ASSISTED_SUCCESS_NEEDS_INDEPENDENT_CHECK', `ASSISTANCE_LEVEL_${lastSupport.hint_level}`], [lastSupport])
  }
  const singleTask = new Set(contributing.filter((item) => item.source?.task_id && item.source?.task_version).map((item) => taskKey(item.source.task_id, item.source.task_version))).size === 1
  const lowConfidence = ['demonstrated', 'appears_strong'].includes(state.band) && state.confidence < 0.70
  if (supporting.length && (lowConfidence || singleTask)) {
    return candidate(5, 'TRY_SIMILAR', [...(lowConfidence ? ['LOW_CONFIDENCE_NEEDS_MORE_EVIDENCE'] : []), ...(singleTask ? ['SINGLE_TASK_ONLY'] : [])], supporting)
  }
  if (state.band === 'secure') return state.limitations.includes('selected_response_only')
    ? abstain('SELECTED_RESPONSE_SCOPE_LIMITATION', 'TRANSFER_TASK_TYPE_UNSUPPORTED')
    : abstain('CURRENT_SCOPE_SECURE_NO_CALIBRATED_CHALLENGE')
  if (active.every((item) => item.type === 'teacher_assessment' && item.claim?.result === 'no_demonstration')) return abstain('TEACHER_NO_DEMONSTRATION_ONLY')
  if (supporting.length && contributing.some((item) => item.claim?.result === 'challenges')) return abstain('CONFLICTING_EVIDENCE_REQUIRES_REVIEW')
  return abstain('INSUFFICIENT_EVIDENCE_FOR_RULE')
}

export function attachCandidate(result, catalog) {
  if (result.type !== 'TRY_SIMILAR') return result
  if (!catalog.candidates.length) return { ...abstain('NO_ELIGIBLE_TASK', ...catalog.exclusion_codes), failed_rule_id: result.rule_id }
  return { ...result, candidate_task_ref: catalog.candidates[0], reason_codes: [...result.reason_codes, 'ELIGIBLE_SIMILAR_TASK_FOUND'] }
}
