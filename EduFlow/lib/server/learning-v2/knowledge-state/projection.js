import { KNOWLEDGE_STATE_SCHEMA_VERSION, PHASE_2_COEFFICIENTS, knowledgeStateDocumentSchema } from '../contracts/phase2.js'
import {
  TEACHER_CALIBRATION_STATUS,
  TEACHER_ONLY_CONFIDENCE_CAP,
  teacherEvidenceWeight,
} from '../contracts/phase4.js'
import { stableInputHash } from '../idempotency.js'
import { projectionAsOf, selectProjectorConfiguration, validateProjectionInput } from './projector-contract.js'

function rounded(value) { return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000 }
function dateValue(value) { return value instanceof Date ? value : new Date(value) }
export function evidenceWeight(item) {
  if (item.type === 'teacher_assessment') return teacherEvidenceWeight(item)
  if (item.type === 'correct_after_hint') return Number(item.tutor_weight)
  if (item.type === 'support_required') return 0
  return PHASE_2_COEFFICIENTS.eligible_selected_response_weight
}

function bandFor(mastery, confidence, evidenceCount) {
  if (!evidenceCount) return { band: 'not_yet_demonstrated', qualifier: 'no_active_evidence' }
  if (mastery < 0.35) return { band: 'difficulty_signal', qualifier: confidence >= 0.70 ? 'well_supported' : 'needs_confirmation' }
  if (mastery < 0.65) return { band: 'developing', qualifier: 'mixed_or_developing' }
  if (mastery < 0.80) return { band: 'demonstrated', qualifier: confidence >= 0.70 ? 'well_supported' : 'provisional' }
  if (confidence >= PHASE_2_COEFFICIENTS.secure_confidence_threshold) return { band: 'secure', qualifier: 'selected_response_only' }
  return { band: 'appears_strong', qualifier: 'needs_confirmation' }
}

export function projectKnowledgeState({ tenantId, studentId, competencyRef, evidence, now, configurationId }) {
  now = projectionAsOf(now)
  validateProjectionInput({ tenantId, studentId, competencyRef, evidence })
  const configuration = selectProjectorConfiguration(evidence, configurationId)
  const active = (evidence || []).filter((item) => item.status === 'active')
    .sort((left, right) => left.evidence_id.localeCompare(right.evidence_id))
  const contributing = active.filter((item) => evidenceWeight(item) > 0)
  const positive = contributing.filter((item) => item.claim?.result === 'supports')
  const negative = contributing.filter((item) => item.claim?.result === 'challenges')
  const weightedVolume = rounded(contributing.reduce((sum, item) => sum + evidenceWeight(item), 0))
  const weightedPositive = rounded(positive.reduce((sum, item) => sum + evidenceWeight(item), 0))
  const mastery = rounded((
    PHASE_2_COEFFICIENTS.neutral_prior_weight * PHASE_2_COEFFICIENTS.neutral_prior_mastery + weightedPositive
  ) / (PHASE_2_COEFFICIENTS.neutral_prior_weight + weightedVolume))
  const tasks = new Set(contributing.filter((item) => item.source?.task_id && item.source?.task_version)
    .map((item) => `${item.source.task_id}:${item.source.task_version}`))
  const modalities = new Set(contributing.map((item) => item.response_modality))
  const producers = new Set(contributing.map((item) => item.provenance.producer))
  const recentCutoff = new Date(now.getTime() - PHASE_2_COEFFICIENTS.recent_evidence_days * 86_400_000)
  const hasRecent = contributing.some((item) => dateValue(item.occurred_at) >= recentCutoff)
  let rawConfidence = Math.min(PHASE_2_COEFFICIENTS.confidence_volume_ceiling, PHASE_2_COEFFICIENTS.confidence_volume_rate * weightedVolume)
  if (contributing.some((item) => item.independence.level === 'independent')) rawConfidence += PHASE_2_COEFFICIENTS.independent_bonus
  if (hasRecent) rawConfidence += PHASE_2_COEFFICIENTS.recent_bonus
  rawConfidence += PHASE_2_COEFFICIENTS.distinct_task_bonus * Math.min(2, Math.max(0, tasks.size - 1))
  if (positive.length && negative.length) rawConfidence += PHASE_2_COEFFICIENTS.mixed_outcome_bonus
  const selectedResponseOnly = contributing.length
    ? contributing.every((item) => item.response_modality === 'selected_response')
    : !active.some((item) => item.type === 'teacher_assessment')
  const teacherOnly = contributing.length > 0 && contributing.every((item) => item.type === 'teacher_assessment')
  const caps = []
  if (selectedResponseOnly) caps.push({ code: 'selected_response_only', value: PHASE_2_COEFFICIENTS.selected_response_only_cap })
  if (contributing.length && tasks.size === 1) caps.push({ code: 'single_task_only', value: PHASE_2_COEFFICIENTS.one_task_cap })
  if (teacherOnly) caps.push({ code: 'teacher_assessment_only', value: TEACHER_ONLY_CONFIDENCE_CAP })
  const confidence = contributing.length
    ? rounded(Math.min(rawConfidence, ...caps.map((cap) => cap.value), PHASE_2_COEFFICIENTS.absolute_confidence_cap))
    : 0
  const band = bandFor(mastery, confidence, contributing.length)
  if (band.band === 'secure' && !selectedResponseOnly) band.qualifier = 'current_evidence_scope_only'
  const limitations = []
  if (selectedResponseOnly) limitations.push('selected_response_only')
  if (modalities.size <= 1) limitations.push('single_modality_evidence')
  if (!contributing.length) limitations.push('no_active_evidence')
  if (active.some((item) => item.type === 'support_required')) limitations.push('support_required_neutral_evidence')
  if (active.some((item) => item.type === 'teacher_assessment' && item.claim?.result === 'no_demonstration')) limitations.push('teacher_no_demonstration')
  if (teacherOnly) limitations.push('teacher_assessment_only')
  if (tasks.size === 1) limitations.push('single_task_only')
  if (confidence < PHASE_2_COEFFICIENTS.secure_confidence_threshold) limitations.push('confidence_below_secure_threshold')
  const reasonCodes = [
    contributing.length ? 'NEUTRAL_PRIOR_AND_WEIGHTED_CORRECTNESS' : 'NO_ACTIVE_EVIDENCE',
    ...(active.some((item) => item.type === 'correct_after_hint') ? ['ASSISTED_SUCCESS_DEVELOPMENT_WEIGHTS_NOT_EDUCATOR_CALIBRATED'] : []),
    ...(active.some((item) => item.type === 'teacher_assessment' && item.claim?.result === 'supports') ? ['TEACHER_ASSESSMENT_SUPPORTS'] : []),
    ...(active.some((item) => item.type === 'teacher_assessment' && item.claim?.result === 'challenges') ? ['TEACHER_ASSESSMENT_CHALLENGES'] : []),
    ...(active.some((item) => item.type === 'teacher_assessment' && item.claim?.result === 'no_demonstration') ? ['TEACHER_ASSESSMENT_NO_DEMONSTRATION'] : []),
    ...(positive.length && negative.length ? ['CONFLICTING_ACTIVE_EVIDENCE'] : []),
    'CONFIDENCE_IS_ESTIMATE_CERTAINTY_NOT_PERFORMANCE',
    ...caps.map((cap) => `CONFIDENCE_CAP_${cap.code.toUpperCase()}`),
  ]
  const recencySignature = active.map((item) => [item.evidence_id, dateValue(item.occurred_at) >= recentCutoff])
  const inputSet = active.map((item) => ({ evidence_id: item.evidence_id, status: item.status, type: item.type,
    target: item.target, claim: item.claim, independence: item.independence, source: item.source,
    modality: item.response_modality, occurred_at: dateValue(item.occurred_at).toISOString(),
    policy_version: item.provenance.evidence_policy_version, weight: evidenceWeight(item) }))
  const inputSetHash = stableInputHash({ input_set: inputSet, recency_signature: recencySignature })
  const lastCorrect = positive.filter((item) => item.independence.level === 'independent').sort((a, b) => dateValue(b.occurred_at) - dateValue(a.occurred_at))[0]
  const lastIncorrect = negative.filter((item) => item.independence.level === 'independent').sort((a, b) => dateValue(b.occurred_at) - dateValue(a.occurred_at))[0]
  const lastEvidence = [...active].sort((a, b) => dateValue(b.occurred_at) - dateValue(a.occurred_at))[0]

  const state = {
    schema_version: KNOWLEDGE_STATE_SCHEMA_VERSION,
    tenant_id: tenantId,
    student_id: studentId,
    competency_id: competencyRef.competency_id,
    framework_id: competencyRef.framework_id,
    framework_version: competencyRef.framework_version,
    mastery,
    confidence,
    band: band.band,
    qualifier: band.qualifier,
    evidence_count: contributing.length,
    weighted_evidence_volume: weightedVolume,
    positive_count: positive.length,
    negative_count: negative.length,
    distinct_task_count: tasks.size,
    distinct_modality_count: modalities.size,
    distinct_producer_count: producers.size,
    last_evidence_at: lastEvidence ? dateValue(lastEvidence.occurred_at) : null,
    last_correct_independent_at: lastCorrect ? dateValue(lastCorrect.occurred_at) : null,
    last_incorrect_independent_at: lastIncorrect ? dateValue(lastIncorrect.occurred_at) : null,
    limitations: [...new Set(limitations)],
    reason_codes: [...new Set(reasonCodes)],
    confidence_caps: caps,
    projection: {
      configuration_id: configuration.configuration_id,
      policy_version: configuration.policy_version,
      as_of: now,
      algorithm: PHASE_2_COEFFICIENTS.algorithm,
      algorithm_version: configuration.algorithm_version,
      coefficient_set_version: configuration.coefficient_set_version,
      calibration_status: active.some((item) => item.type === 'teacher_assessment') ? TEACHER_CALIBRATION_STATUS : PHASE_2_COEFFICIENTS.calibration_status,
      input_set_hash: inputSetHash,
      evidence_watermark: active.at(-1)?.evidence_id || null,
      calculated_at: now,
    },
    contribution_summary: contributing.slice(-100).map((item) => ({
      evidence_id: item.evidence_id,
      type: item.type,
      direction: item.claim?.result || (item.type === 'correct_answer' ? 'supports' : 'challenges'),
      weight: evidenceWeight(item),
      task_id: item.source.task_id || null,
    })),
  }
  const parsed = knowledgeStateDocumentSchema.safeParse(state)
  if (!parsed.success) throw new TypeError('Invalid Learning V2 knowledge-state projection')
  return parsed.data
}

export function projectionComparable(state) {
  const clone = structuredClone(state)
  delete clone._id
  delete clone.created_at
  delete clone.updated_at
  if (clone.projection) delete clone.projection.calculated_at
  return clone
}
