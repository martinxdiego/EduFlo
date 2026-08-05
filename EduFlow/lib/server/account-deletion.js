export async function deleteTeacherAccountData(db, userId) {
  const [worksheets, assignments, classes] = await Promise.all([
    db.collection('worksheets').find({ user_id: userId }).project({ id: 1 }).toArray(),
    db.collection('assignments').find({ teacher_id: userId }).project({ id: 1 }).toArray(),
    db.collection('classes').find({ teacher_id: userId }).project({ id: 1 }).toArray(),
  ])

  const worksheetIds = worksheets.map((item) => item.id)
  const assignmentIds = assignments.map((item) => item.id)
  const classIds = classes.map((item) => item.id)

  if (classIds.length) {
    await db.collection('students').updateMany(
      { 'enrolled_classes.class_id': { $in: classIds } },
      { $pull: { enrolled_classes: { class_id: { $in: classIds } } } },
    )
  }

  await Promise.all([
    db.collection('submissions').deleteMany({ assignment_id: { $in: assignmentIds } }),
    db.collection('comments').deleteMany({ $or: [{ user_id: userId }, { worksheet_id: { $in: worksheetIds } }] }),
    db.collection('versions').deleteMany({ $or: [{ user_id: userId }, { worksheet_id: { $in: worksheetIds } }] }),
    db.collection('shares').deleteMany({ $or: [{ owner_id: userId }, { shared_with_id: userId }, { worksheet_id: { $in: worksheetIds } }] }),
    db.collection('password_reset_tokens').deleteMany({ user_id: userId }),
    db.collection('ai_generations').deleteMany({ user_id: userId }),
    db.collection('generated_assets').deleteMany({ user_id: userId }),
    db.collection('studio_packages').deleteMany({ user_id: userId }),
  ])

  await Promise.all([
    db.collection('assignments').deleteMany({ teacher_id: userId }),
    db.collection('classes').deleteMany({ teacher_id: userId }),
    db.collection('worksheets').deleteMany({ user_id: userId }),
    db.collection('dossiers').deleteMany({ user_id: userId }),
  ])

  return db.collection('users').deleteOne({ id: userId })
}
