import { NextResponse } from 'next/server'
import { applyCorsHeaders, verifyAuthToken } from '@/lib/server/security'
import { buildStudioPresentation } from '@/lib/server/studio-presentation'
import { logComplete, logFailure, requestContext } from '@/lib/server/logger'

export const runtime = 'nodejs'

function jsonResponse(body, init) {
  return applyCorsHeaders(NextResponse.json(body, init))
}

function filename(value) {
  return String(value || 'eduflow-studio')
    .toLowerCase()
    .replace(/[^a-z0-9äöüéèàç]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'eduflow-studio'
}

export async function OPTIONS() {
  return jsonResponse({}, { status: 200 })
}

export async function POST(request) {
  const context = requestContext(request, '/api/studio/pptx')
  const user = verifyAuthToken(request)
  if (!user?.userId || user.role === 'student') return jsonResponse({ error: 'Nicht authentifiziert.' }, { status: 401 })

  try {
    const artifact = (await request.json())?.artifact
    if (!artifact || typeof artifact !== 'object') return jsonResponse({ error: 'Studio-Artefakt fehlt.' }, { status: 400 })
    const buffer = await buildStudioPresentation(artifact)
    logComplete(context, { feature: 'studio-pptx', slides: Array.isArray(artifact.slides) ? artifact.slides.length : 0 })
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${filename(artifact.title)}.pptx"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    logFailure(context, error, { feature: 'studio-pptx' })
    return jsonResponse({ error: 'PowerPoint-Export fehlgeschlagen.', details: process.env.NODE_ENV === 'development' ? error?.message : undefined }, { status: 500 })
  }
}
