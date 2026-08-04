import { NextResponse } from 'next/server'
import { getAIMetrics } from '@/lib/server/ai-telemetry'
import { applyCorsHeaders, verifyAuthToken } from '@/lib/server/security'
import { logComplete, logFailure, requestContext } from '@/lib/server/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const context = requestContext(request, '/api/ai/metrics')
  const user = verifyAuthToken(request)
  if (!user?.userId || user.role === 'student') {
    return applyCorsHeaders(NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 }), request)
  }
  try {
    const days = Number(new URL(request.url).searchParams.get('days') || 30)
    const metrics = await getAIMetrics(user.userId, days)
    logComplete(context, { feature: 'ai-metrics' })
    return applyCorsHeaders(NextResponse.json(metrics), request)
  } catch (error) {
    logFailure(context, error, { feature: 'ai-metrics' })
    return applyCorsHeaders(NextResponse.json({ error: 'KI-Metriken konnten nicht geladen werden.' }, { status: 500 }), request)
  }
}
