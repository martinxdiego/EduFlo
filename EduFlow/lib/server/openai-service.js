import { requireProviderTransport } from './provider-denial.js'

export function getOpenAIClient() {
  requireProviderTransport()
}

export function parseJsonObject(content) {
  const raw = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
  try { return JSON.parse(raw) } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1))
    throw new Error('Die KI-Antwort enthielt kein valides JSON.')
  }
}

export async function generateOpenAIJson() {
  requireProviderTransport()
}

export async function generateOpenAISpeech() {
  requireProviderTransport()
}
