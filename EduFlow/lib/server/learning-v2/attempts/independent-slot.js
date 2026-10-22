// Independent slots belong to learner + assignment. Deleting a legacy response
// does not erase the immutable Attempt's claim on that slot. Tutor numbering is
// separate and deliberately excluded from this high-water mark.
export async function nextIndependentAttemptSlot(db, actor, assignmentId, legacyCount = 0) {
  const canonical = await db.collection('learning_attempts').find({ tenant_id: actor.tenant_id, student_id: actor.student_id,
    'source.assignment_id': assignmentId, 'source.kind': 'legacy_submission_question' })
    .sort({ 'source.learning_v2_attempt_no': -1 }).limit(1).next()
  const submission = await db.collection('submissions').find({ assignment_id: assignmentId, student_id: actor.student_id,
    learning_v2_tenant_id: actor.tenant_id, learning_v2_attempt_no: { $type: 'number' } })
    .sort({ learning_v2_attempt_no: -1 }).limit(1).next()
  return Math.max(legacyCount, canonical?.source?.learning_v2_attempt_no || 0, submission?.learning_v2_attempt_no || 0) + 1
}
