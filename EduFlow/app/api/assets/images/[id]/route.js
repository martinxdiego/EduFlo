import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server/database'
import { verifyAuthToken } from '@/lib/server/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request, { params }) {
  const user = verifyAuthToken(request)
  if (!user?.userId) return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 })
  const { id } = await params
  const db = await getDatabase()
  const asset = await db.collection('generated_assets').findOne({ id, user_id: user.userId, kind: 'image' })
  if (!asset?.data) return NextResponse.json({ error: 'Bild nicht gefunden.' }, { status: 404 })
  const bytes = asset.data.buffer || asset.data
  return new Response(bytes, {
    headers: {
      'Content-Type': asset.mime_type || 'image/png',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Disposition': `inline; filename="${asset.filename || `${id}.png`}"`,
    },
  })
}
