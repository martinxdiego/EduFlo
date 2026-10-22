import { unfencedDatabase } from '../../deletion-write-fence.js'
import { requireStudent } from '../auth/learning-authorization.js'
import { LearningV2Error } from '../contracts/errors.js'
import { withTenantWrite } from '../database/tenant-write.js'

export const LEARNING_V2_SUBJECT_ERASURE_CONTRACT_VERSION = 'learning-v2-subject-erasure-v1'

export const LEARNING_V2_SUBJECT_ERASURE_CONTRACT = Object.freeze({
  version: LEARNING_V2_SUBJECT_ERASURE_CONTRACT_VERSION,
  status: 'partial_decision_required',
  safe_cleanup: Object.freeze([
    Object.freeze({ collection: 'student_knowledge_states', reason: 'deterministically rebuildable from retained valid Evidence' }),
    Object.freeze({ collection: 'ai_generations', reason: 'operational Tutor telemetry with no Learning authority' }),
  ]),
  canonical_subject_erasure: Object.freeze({
    status: 'blocked_pending_d12_05_follow_up',
    protected_collections: Object.freeze(['submissions', 'learning_attempts', 'evidence_events', 'learning_events', 'tutor_sessions']),
    rule: 'H12-B must not mutate, delete, overwrite, or pseudonymize canonical facts, Evidence, or linked process audit for individual subject erasure.',
  }),
  tenant_deletion: Object.freeze({
    status: 'existing_supported_path',
    rule: 'Exact personal-tenant cascade may fully delete tenant-owned records while the tenant write fence is active.',
  }),
})

// This is a cache/operational cleanup, not an individual erasure endpoint.
// It intentionally leaves every canonical fact, Evidence record and audit link intact.
export async function clearRebuildableLearningV2SubjectData(database, actor, subjectId) {
  requireStudent(actor)
  if (!actor.permissions?.includes('learning:write:self')) throw new LearningV2Error('FORBIDDEN')
  if (typeof subjectId !== 'string' || subjectId !== actor.student_id) throw new LearningV2Error('NOT_FOUND')
  const db = unfencedDatabase(database)
  return withTenantWrite(db, actor, async (session) => {
    const knowledgeStates = await db.collection('student_knowledge_states').deleteMany({
      tenant_id: actor.tenant_id, student_id: actor.student_id,
    }, { session })
    const telemetry = await db.collection('ai_generations').deleteMany({
      tenant_id: actor.tenant_id, user_id: actor.student_id, feature: 'learning-v2-tutor',
    }, { session })
    return {
      contract_version: LEARNING_V2_SUBJECT_ERASURE_CONTRACT_VERSION,
      deleted: {
        student_knowledge_states: knowledgeStates.deletedCount || 0,
        ai_generations: telemetry.deletedCount || 0,
      },
      canonical_learning_truth_changed: false,
    }
  })
}
