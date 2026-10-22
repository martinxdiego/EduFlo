import { EVIDENCE_POLICY_VERSION } from '../contracts/phase2.js'

export function correctnessEvidenceForAttempt(attempt) {
  if (attempt?.answer?.type !== 'selected_response' || attempt?.independence?.level !== 'independent') return null
  if (typeof attempt?.answer?.value !== 'string' || attempt.answer.value.length === 0) return null
  if (!['correct', 'incorrect'].includes(attempt?.outcome?.correctness)) return null
  const correct = attempt.outcome.correctness === 'correct'
  return {
    type: correct ? 'correct_answer' : 'incorrect_answer',
    target: {
      ...attempt.primary_competency_ref,
      objective_id: attempt.objective_ref.objective_id,
      objective_version: attempt.objective_ref.version,
      dimension: 'application',
    },
    claim: { result: correct ? 'supports' : 'challenges' },
    independence: { level: 'independent' },
    source: { kind: 'attempt', source_id: attempt.attempt_id, task_id: attempt.task_ref.task_id, task_version: attempt.task_ref.version },
    provenance: {
      producer: 'evidence-rules',
      producer_version: 'evidence-rules-v1',
      evidence_policy_version: EVIDENCE_POLICY_VERSION,
      grader_version: attempt.outcome.grader_version,
    },
    quality: { source_confidence: 1, mapping_confidence: 1, classification_confidence: 1, historic: false },
    response_modality: 'selected_response',
  }
}
