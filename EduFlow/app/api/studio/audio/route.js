import { NextResponse } from 'next/server'
import { generateSpeechWithGemini } from '@/lib/ai'
import { applyCorsHeaders, verifyAuthToken } from '@/lib/server/security'

export const runtime = 'nodejs'

function jsonResponse(body, init) {
  const response = NextResponse.json(body, init)
  return applyCorsHeaders(response)
}

function verifyToken(request) {
  return verifyAuthToken(request)
}

function filename(value) {
  return String(value || 'eduflow-studio-audio')
    .toLowerCase()
    .replace(/[^a-z0-9äöüéèàç]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'eduflow-studio-audio'
}

export async function OPTIONS() {
  return jsonResponse({}, { status: 200 })
}

export async function POST(request) {
  const user = verifyToken(request)
  if (!user?.userId || user.role === 'student') {
    return jsonResponse({ error: 'Nicht authentifiziert.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { text, title, model, voiceName } = body || {}

    if (!text || typeof text !== 'string' || text.trim().length < 20) {
      return jsonResponse({ error: 'Bitte zuerst ein Audio-Skript generieren.' }, { status: 400 })
    }

    const result = await generateSpeechWithGemini({
      text: text.trim().slice(0, 9000),
      model,
      voiceName
    })

    return new NextResponse(result.audio, {
      status: 200,
      headers: {
        'Content-Type': result.mimeType,
        'Content-Disposition': `attachment; filename="${filename(title)}.wav"`,
        'X-AI-Provider': result.provider,
        'X-AI-Model': result.model,
        'Cache-Control': 'no-store'
      }
    })
  } catch (error) {
    console.error('Studio audio error:', {
      message: error?.message,
      name: error?.name
    })

    return jsonResponse({
      error: 'Audio-Generierung fehlgeschlagen. Pruefe, ob das Gemini-TTS-Modell fuer dein Google-Projekt verfuegbar ist.',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    }, { status: 502 })
  }
}
