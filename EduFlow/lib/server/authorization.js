export async function findWorksheetAccess(db, userId, worksheetId, allowedShareRoles = ['view', 'comment', 'edit']) {
  const ownedWorksheet = await db.collection('worksheets').findOne({ id: worksheetId, user_id: userId })
  if (ownedWorksheet) return { worksheet: ownedWorksheet, role: 'owner' }

  const share = await db.collection('shares').findOne({
    worksheet_id: worksheetId,
    shared_with_id: userId,
    role: { $in: allowedShareRoles },
  })
  if (!share) return null

  const worksheet = await db.collection('worksheets').findOne({ id: worksheetId })
  return worksheet ? { worksheet, role: share.role } : null
}
