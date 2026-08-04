import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server/database'
import { applyCorsHeaders, verifyAuthToken } from '@/lib/server/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const user = verifyAuthToken(request)
  if (!user?.userId || user.role === 'student') return applyCorsHeaders(NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 }), request)
  let database = 'unavailable'
  try {
    await (await getDatabase()).command({ ping: 1 })
    database = 'ready'
  } catch {}
  const openai = process.env.OPENAI_API_KEY ? 'configured' : 'missing'
  const ready = database === 'ready' && openai === 'configured'
  return applyCorsHeaders(NextResponse.json({
    status: ready ? 'ready' : 'degraded', database, openai,
    models: {
      generation: process.env.OPENAI_GENERATION_MODEL || 'gpt-4o',
      chat: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
      image: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
      speech: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
    },
    checkedAt: new Date().toISOString(),
  }), request)
}
