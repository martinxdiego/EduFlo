import { evidenceDocumentSchema, KNOWLEDGE_STATE_SCHEMA_VERSION, PHASE_2_COEFFICIENTS } from '../contracts/phase2.js'
import { TEACHER_ALGORITHM_VERSION, TEACHER_COEFFICIENT_SET_VERSION, TEACHER_EVIDENCE_POLICY_VERSION, teacherEvidenceWeight, responseModalityForTeacherBasis } from '../contracts/phase4.js'
import { LearningV2Error } from '../contracts/errors.js'

const configurations = Object.freeze({
  'selected-response-v1': Object.freeze({ schema_version: KNOWLEDGE_STATE_SCHEMA_VERSION,
    algorithm_version: PHASE_2_COEFFICIENTS.algorithm_version, coefficient_set_version: PHASE_2_COEFFICIENTS.coefficient_set_version,
    policy_version: 'weighted-evidence-policy-v1' }),
  'teacher-assessment-v1': Object.freeze({ schema_version: KNOWLEDGE_STATE_SCHEMA_VERSION,
    algorithm_version: TEACHER_ALGORITHM_VERSION, coefficient_set_version: TEACHER_COEFFICIENT_SET_VERSION,
    policy_version: 'weighted-evidence-policy-v1-teacher' }),
})

export function selectProjectorConfiguration(evidence, requested) {
  const hasTeacher = evidence.some((item) => item.status === 'active' && item.type === 'teacher_assessment')
  const id = requested ?? (hasTeacher ? 'teacher-assessment-v1' : 'selected-response-v1')
  const configuration = configurations[id]
  if (!configuration || (hasTeacher && id === 'selected-response-v1')) throw new LearningV2Error('VALIDATION_ERROR')
  return { configuration_id: id, ...configuration }
}

export function projectionAsOf(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new LearningV2Error('VALIDATION_ERROR')
  return new Date(value.getTime())
}

const inputSchema = evidenceDocumentSchema.pick({ evidence_id: true, tenant_id: true, student_id: true, type: true,
  target: true, claim: true, independence: true, source: true, response_modality: true, occurred_at: true, status: true,
  tutor_weight: true, hint_level: true, assessment_basis: true, teacher_weight: true, provenance: true }).strip()

// Validate the immutable fields used by the arithmetic, including the producer's
// semantics, before filtering inactive facts. Mongo _id/audit metadata is not input.
export function validateProjectionInput({ tenantId, studentId, competencyRef, evidence }) {
  if (!Array.isArray(evidence)) throw new LearningV2Error('VALIDATION_ERROR')
  const ids = new Set()
  for (const item of evidence) {
    const valid = inputSchema.safeParse(item)
    if (!valid.success || ids.has(item.evidence_id) || item.tenant_id !== tenantId || item.student_id !== studentId
      || ['competency_id', 'framework_id', 'framework_version'].some((key) => item.target[key] !== competencyRef[key])) throw new LearningV2Error('VALIDATION_ERROR')
    ids.add(item.evidence_id)
    const producer = item.provenance?.producer, policy = item.provenance?.evidence_policy_version
    const claim = item.claim.result
    if (['correct_answer', 'incorrect_answer'].includes(item.type)) {
      if (producer !== 'evidence-rules' || item.provenance.producer_version !== 'evidence-rules-v1' || policy !== 'evidence-policy-v1' || item.source.kind !== 'attempt'
        || item.independence.level !== 'independent' || item.response_modality !== 'selected_response'
        || claim !== (item.type === 'correct_answer' ? 'supports' : 'challenges')) throw new LearningV2Error('VALIDATION_ERROR')
    } else if (item.type === 'teacher_assessment') {
      if (producer !== 'teacher-evidence-rules' || item.provenance.producer_version !== 'teacher-evidence-rules-v1' || policy !== TEACHER_EVIDENCE_POLICY_VERSION || item.source.kind !== 'teacher_assessment'
        || item.independence.level !== 'teacher_assessment' || !item.assessment_basis
        || item.response_modality !== responseModalityForTeacherBasis(item.assessment_basis)
        || item.teacher_weight !== teacherEvidenceWeight(item) || !['supports', 'challenges', 'no_demonstration'].includes(claim)) throw new LearningV2Error('VALIDATION_ERROR')
    } else if (producer !== 'tutor-evidence-rules' || item.provenance.producer_version !== 'tutor-evidence-rules-v1' || policy !== 'evidence-policy-v2-development' || item.source.kind !== 'attempt'
      || item.response_modality !== 'selected_response' || ![1, 2, 3].includes(item.hint_level)
      || item.independence.level !== (item.hint_level <= 2 ? 'lightly_supported' : 'supported')
      || (item.type === 'correct_after_hint' ? claim !== 'supports' || item.tutor_weight !== ({ 1: 0.6, 2: 0.45, 3: 0.3 })[item.hint_level]
        : claim !== 'neutral' || item.tutor_weight !== 0 || item.hint_level !== 3)) throw new LearningV2Error('VALIDATION_ERROR')
  }
}
