import OpenAI from 'openai'
import { completeGeneration, failGeneration, startGeneration } from '@/lib/server/ai-telemetry'

let client

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY ist nicht konfiguriert.')
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return client
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

export async function generateOpenAIJson({ userId, feature, messages, model, temperature = 0.3, metadata = {} }) {
  const selectedModel = model || process.env.OPENAI_GENERATION_MODEL || 'gpt-4o'
  const prompt = messages.map(message => `${message.role}: ${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`).join('\n')
  const generationId = await startGeneration({ userId, feature, model: selectedModel, prompt, metadata })
  try {
    const completion = await getOpenAIClient().chat.completions.create({
      model: selectedModel,
      messages,
      temperature,
      response_format: { type: 'json_object' },
    })
    const object = parseJsonObject(completion.choices[0]?.message?.content)
    const telemetry = await completeGeneration(generationId, {
      result: object,
      usage: completion.usage,
      model: selectedModel,
      metadata,
    })
    return { object, model: selectedModel, provider: 'openai', usage: completion.usage, ...telemetry }
  } catch (error) {
    await failGeneration(generationId, error, metadata)
    throw error
  }
}

export async function generateOpenAISpeech({ userId, text, feature = 'tts', model, voice = 'coral', instructions }) {
  const selectedModel = model || process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts'
  const allowedVoices = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'])
  const selectedVoice = allowedVoices.has(voice) ? voice : 'coral'
  const generationId = await startGeneration({ userId, feature, model: selectedModel, prompt: text, metadata: { voice: selectedVoice } })
  try {
    const response = await getOpenAIClient().audio.speech.create({
      model: selectedModel,
      voice: selectedVoice,
      input: text,
      instructions: instructions || 'Sprich in klarem, warmem Schweizer Hochdeutsch, ruhig und didaktisch strukturiert.',
      response_format: 'mp3',
    })
    const audio = Buffer.from(await response.arrayBuffer())
    await completeGeneration(generationId, {
      result: { bytes: audio.length, mimeType: 'audio/mpeg' },
      usage: {},
      model: selectedModel,
      metadata: { voice: selectedVoice },
    })
    return { audio, mimeType: 'audio/mpeg', model: selectedModel, provider: 'openai', generationId }
  } catch (error) {
    await failGeneration(generationId, error, { voice: selectedVoice })
    throw error
  }
}
