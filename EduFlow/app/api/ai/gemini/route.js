import { NextResponse } from 'next/server'
import { generateAI } from '@/lib/ai'
import { applyCorsHeaders, hasBoundedJsonSize, verifyAuthToken } from '@/lib/server/security'

export const runtime = 'nodejs'

function jsonResponse(body, init, request) {
  const response = NextResponse.json(body, init)
  return applyCorsHeaders(response, request)
}

function isValidTemperature(value) {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 2)
}

export async function OPTIONS(req) {
  return jsonResponse({}, { status: 200 }, req)
}

export async function POST(req) {
  try {
    const user = verifyAuthToken(req)
    if (!user?.userId || user.role === 'student') {
      return jsonResponse({ error: 'Unauthorized.' }, { status: 401 }, req)
    }

    let body
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Request body must be valid JSON.' }, { status: 400 }, req)
    }

    const { prompt, model, temperature, taskType, context } = body || {}

    if (!prompt || typeof prompt !== 'string' || prompt.length > 12_000) {
      return jsonResponse({ error: 'Prompt must contain between 1 and 12,000 characters.' }, { status: 400 }, req)
    }

    if (model !== undefined && typeof model !== 'string') {
      return jsonResponse({ error: 'Model must be a string.' }, { status: 400 }, req)
    }

    if (!isValidTemperature(temperature)) {
      return jsonResponse({ error: 'Temperature must be a number between 0 and 2.' }, { status: 400 }, req)
    }

    if (!hasBoundedJsonSize({ taskType, context })) {
      return jsonResponse({ error: 'Request context is too large.' }, { status: 413 }, req)
    }

    const result = await generateAI({
      provider: 'gemini',
      prompt,
      taskType,
      context,
      options: {
        model,
        temperature
      }
    })

    return jsonResponse({
      ...result,
      taskType: result.taskType || taskType || null
    }, undefined, req)
  } catch (error) {
    console.error('Gemini route error:', {
      message: error?.message,
      name: error?.name
    })

    return jsonResponse(
      {
        error: 'Gemini generation failed.',
        details: process.env.NODE_ENV === 'development' ? error?.message : undefined
      },
      { status: 500 },
      req
    )
  }
}
