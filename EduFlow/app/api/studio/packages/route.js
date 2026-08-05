import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '@/lib/server/database'
import { applyCorsHeaders, hasBoundedJsonSize, verifyAuthToken } from '@/lib/server/security'
import { evaluateStudioArtifact } from '@/lib/server/studio-quality'

export const runtime = 'nodejs'

const respond = (request, body, status = 200) => applyCorsHeaders(NextResponse.json(body, { status }), request)

export async function OPTIONS(request) {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }), request)
}

export async function GET(request) {
  const user = verifyAuthToken(request)
  if (!user) return respond(request, { error: 'Unauthorized' }, 401)
  const db = await getDatabase()
  const packages = await db.collection('studio_packages').find({ user_id: user.userId }).sort({ updated_at: -1 }).limit(50).toArray()
  return respond(request, packages.map(({ _id, ...item }) => item))
}

export async function POST(request) {
  const user = verifyAuthToken(request)
  if (!user) return respond(request, { error: 'Unauthorized' }, 401)
  const body = await request.json().catch(() => null)
  if (!body?.artifact || !hasBoundedJsonSize(body, 160_000)) return respond(request, { error: 'Ungültiges oder zu grosses Studio-Paket.' }, 400)

  const quality = evaluateStudioArtifact(body.artifact)
  const now = new Date()
  const requestedId = typeof body.id === 'string' ? body.id : null
  const db = await getDatabase()
  const existing = requestedId ? await db.collection('studio_packages').findOne({ id: requestedId, user_id: user.userId }) : null
  const studioPackage = {
    id: existing?.id || uuidv4(),
    user_id: user.userId,
    title: String(body.artifact.title || 'Studio-Paket').slice(0, 120),
    subject: String(body.subject || '').slice(0, 60),
    grade: String(body.grade || '').slice(0, 20),
    outputs: Array.isArray(body.outputs) ? body.outputs.slice(0, 6) : [],
    artifact: body.artifact,
    quality: { score: quality.score, passed: quality.passed, warnings: quality.warnings },
    status: quality.passed ? 'ready' : 'review',
    created_at: existing?.created_at || now,
    updated_at: now,
  }
  if (existing) await db.collection('studio_packages').replaceOne({ id: existing.id, user_id: user.userId }, studioPackage)
  else await db.collection('studio_packages').insertOne(studioPackage)
  const { _id, ...cleaned } = studioPackage
  return respond(request, cleaned, 201)
}

export async function DELETE(request) {
  const user = verifyAuthToken(request)
  if (!user) return respond(request, { error: 'Unauthorized' }, 401)
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return respond(request, { error: 'Paket-ID fehlt.' }, 400)
  const db = await getDatabase()
  const result = await db.collection('studio_packages').deleteOne({ id, user_id: user.userId })
  return result.deletedCount ? respond(request, { success: true }) : respond(request, { error: 'Paket nicht gefunden.' }, 404)
}
