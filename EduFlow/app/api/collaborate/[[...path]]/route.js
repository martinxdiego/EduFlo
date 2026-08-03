import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { findWorksheetAccess } from '@/lib/server/authorization'
import { getDatabase } from '@/lib/server/database'
import {
  commentSchema,
  restoreVersionSchema,
  shareWorksheetSchema,
  versionSchema,
  worksheetIdSchema,
} from '@/lib/server/schemas/collaboration'
import { applyCorsHeaders, publicErrorMessage, verifyAuthToken } from '@/lib/server/security'
import { parseJsonBody } from '@/lib/server/validation'

export const runtime = 'nodejs'

function jsonResponse(body, init, request) {
  return applyCorsHeaders(NextResponse.json(body, init), request)
}

function validationResponse(result, request) {
  return jsonResponse({ error: result.error, fields: result.fields }, { status: result.status }, request)
}

function requireTeacher(request) {
  const session = verifyAuthToken(request)
  return session?.userId && session.role !== 'student' ? session : null
}

async function shareWorksheet(request, db, session) {
  const parsed = await parseJsonBody(request, shareWorksheetSchema)
  if (!parsed.success) return validationResponse(parsed, request)
  const { worksheetId, email, role } = parsed.data

  const worksheet = await db.collection('worksheets').findOne({ id: worksheetId, user_id: session.userId })
  if (!worksheet) return jsonResponse({ error: 'Material nicht gefunden.' }, { status: 404 }, request)
  const targetUser = await db.collection('users').findOne({ email })
  if (!targetUser) return jsonResponse({ error: 'Benutzer nicht gefunden.' }, { status: 404 }, request)
  if (targetUser.id === session.userId) {
    return jsonResponse({ error: 'Eigenes Material muss nicht geteilt werden.' }, { status: 400 }, request)
  }

  const existing = await db.collection('shares').findOne({ worksheet_id: worksheetId, shared_with_id: targetUser.id })
  const shareId = existing?.id || uuidv4()
  await db.collection('shares').updateOne(
    { worksheet_id: worksheetId, shared_with_id: targetUser.id },
    {
      $set: { owner_id: session.userId, shared_with_email: email, role, updated_at: new Date() },
      $setOnInsert: { id: shareId, worksheet_id: worksheetId, shared_with_id: targetUser.id, created_at: new Date() },
    },
    { upsert: true },
  )
  return jsonResponse({ message: 'Material geteilt', shareId }, undefined, request)
}

async function sharedWithMe(request, db, session) {
  const shares = await db.collection('shares').find({ shared_with_id: session.userId }).toArray()
  const worksheetIds = shares.map((share) => share.worksheet_id)
  const worksheets = await db.collection('worksheets').find({ id: { $in: worksheetIds } }).toArray()
  const byId = new Map(worksheets.map((worksheet) => [worksheet.id, worksheet]))
  return jsonResponse(shares.map(({ _id, ...share }) => {
    const worksheet = byId.get(share.worksheet_id)
    return {
      ...share,
      worksheet: worksheet
        ? { title: worksheet.title, subject: worksheet.subject, grade: worksheet.grade, id: worksheet.id }
        : null,
    }
  }), undefined, request)
}

async function addComment(request, db, session) {
  const parsed = await parseJsonBody(request, commentSchema)
  if (!parsed.success) return validationResponse(parsed, request)
  const { worksheetId, text, questionIndex } = parsed.data
  const access = await findWorksheetAccess(db, session.userId, worksheetId, ['comment', 'edit'])
  if (!access) return jsonResponse({ error: 'Nicht autorisiert.' }, { status: 403 }, request)

  const user = await db.collection('users').findOne({ id: session.userId })
  const comment = {
    id: uuidv4(),
    worksheet_id: worksheetId,
    user_id: session.userId,
    user_name: user?.name || 'Unbekannt',
    text,
    question_index: questionIndex ?? null,
    created_at: new Date(),
  }
  await db.collection('comments').insertOne(comment)
  return jsonResponse({ commentId: comment.id }, undefined, request)
}

async function getComments(request, db, session, worksheetId) {
  const parsedId = worksheetIdSchema.safeParse(worksheetId)
  if (!parsedId.success) return jsonResponse({ error: 'Ungültige Material-ID.' }, { status: 400 }, request)
  const access = await findWorksheetAccess(db, session.userId, parsedId.data)
  if (!access) return jsonResponse({ error: 'Nicht autorisiert.' }, { status: 403 }, request)
  const comments = await db.collection('comments').find({ worksheet_id: parsedId.data }).sort({ created_at: -1 }).toArray()
  return jsonResponse(comments.map(({ _id, ...comment }) => comment), undefined, request)
}

async function saveVersion(request, db, session) {
  const parsed = await parseJsonBody(request, versionSchema)
  if (!parsed.success) return validationResponse(parsed, request)
  const { worksheetId, label } = parsed.data
  const worksheet = await db.collection('worksheets').findOne({ id: worksheetId, user_id: session.userId })
  if (!worksheet) return jsonResponse({ error: 'Material nicht gefunden.' }, { status: 404 }, request)

  const version = {
    id: uuidv4(),
    worksheet_id: worksheetId,
    user_id: session.userId,
    label: label || `Version ${new Date().toLocaleString('de-CH')}`,
    content: worksheet.content,
    title: worksheet.title,
    created_at: new Date(),
  }
  await db.collection('versions').insertOne(version)
  return jsonResponse({ versionId: version.id }, undefined, request)
}

async function getVersions(request, db, session, worksheetId) {
  const parsedId = worksheetIdSchema.safeParse(worksheetId)
  if (!parsedId.success) return jsonResponse({ error: 'Ungültige Material-ID.' }, { status: 400 }, request)
  const worksheet = await db.collection('worksheets').findOne({ id: parsedId.data, user_id: session.userId })
  if (!worksheet) return jsonResponse({ error: 'Material nicht gefunden.' }, { status: 404 }, request)
  const versions = await db.collection('versions').find({ worksheet_id: parsedId.data }).sort({ created_at: -1 }).toArray()
  return jsonResponse(versions.map(({ _id, ...version }) => version), undefined, request)
}

async function restoreVersion(request, db, session) {
  const parsed = await parseJsonBody(request, restoreVersionSchema)
  if (!parsed.success) return validationResponse(parsed, request)
  const { worksheetId, versionId } = parsed.data
  const worksheet = await db.collection('worksheets').findOne({ id: worksheetId, user_id: session.userId })
  if (!worksheet) return jsonResponse({ error: 'Material nicht gefunden.' }, { status: 404 }, request)
  const version = await db.collection('versions').findOne({ id: versionId, worksheet_id: worksheetId })
  if (!version) return jsonResponse({ error: 'Version nicht gefunden.' }, { status: 404 }, request)

  const result = await db.collection('worksheets').updateOne(
    { id: worksheetId, user_id: session.userId },
    { $set: { content: version.content, title: version.title, updated_at: new Date() } },
  )
  if (result.modifiedCount !== 1) {
    return jsonResponse({ error: 'Version konnte nicht wiederhergestellt werden.' }, { status: 409 }, request)
  }
  return jsonResponse({ message: 'Version wiederhergestellt' }, undefined, request)
}

export async function OPTIONS(request) {
  return jsonResponse({}, { status: 200 }, request)
}

async function handleCollaborationRoute(request, { params }) {
  const { path = [] } = await params
  const action = path.join('/')
  const session = requireTeacher(request)
  if (!session) return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, request)

  try {
    const db = await getDatabase()
    if (action === 'share' && request.method === 'POST') return shareWorksheet(request, db, session)
    if (action === 'shared-with-me' && request.method === 'GET') return sharedWithMe(request, db, session)
    if (action === 'comment' && request.method === 'POST') return addComment(request, db, session)
    if (path[0] === 'comments' && path.length === 2 && request.method === 'GET') return getComments(request, db, session, path[1])
    if (action === 'version' && request.method === 'POST') return saveVersion(request, db, session)
    if (path[0] === 'versions' && path.length === 2 && request.method === 'GET') return getVersions(request, db, session, path[1])
    if (action === 'restore' && request.method === 'POST') return restoreVersion(request, db, session)
    return jsonResponse({ error: 'Route not found' }, { status: 404 }, request)
  } catch (error) {
    console.error('Collaboration API error:', error)
    return jsonResponse({ error: publicErrorMessage(error) }, { status: 500 }, request)
  }
}

export const GET = handleCollaborationRoute
export const POST = handleCollaborationRoute
