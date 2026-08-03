import { GoogleGenAI } from '@google/genai'

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
export const DEFAULT_GEMINI_FALLBACK_MODEL = 'gemini-2.0-flash'
export const DEFAULT_GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts'

const TASK_INSTRUCTIONS = {
  'worksheet-generation': `Erstelle ein didaktisch sauberes Arbeitsblatt fuer die Schweizer Schule.

Die Antwort soll enthalten:
- Titel
- kurze Einfuehrung
- Aufgaben
- Differenzierung
- Loesungsteil
- Hinweise fuer die Lehrperson`,
  'exam-generation': `Erstelle eine pruefungstaugliche Pruefung fuer die Schweizer Schule.

Die Antwort soll enthalten:
- Pruefung
- Punkteverteilung
- Musterloesung
- Bewertungsvorschlag`,
  'source-transformation': `Transformiere Quellenmaterial in strukturiertes Unterrichtsmaterial.

Die Antwort soll enthalten:
- strukturierte Aufgaben
- Zusammenfassung
- Lernziele
- didaktische Hinweise`
}

export function getGeminiClient() {
  if (process.env.ENABLE_GEMINI === 'false') {
    throw new Error('Gemini provider is disabled.')
  }

  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing.')
  }

  return new GoogleGenAI({ apiKey })
}

function getAudioPart(response) {
  return response?.candidates?.[0]?.content?.parts?.find(part => part?.inlineData?.data)?.inlineData
}

function getSampleRate(mimeType) {
  const match = String(mimeType || '').match(/rate=(\d+)/i)
  return match ? Number(match[1]) : 24000
}

function pcmToWavBuffer(pcmBuffer, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * channels * bitsPerSample / 8
  const blockAlign = channels * bitsPerSample / 8
  const header = Buffer.alloc(44)

  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcmBuffer.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcmBuffer.length, 40)

  return Buffer.concat([header, pcmBuffer])
}

function formatContext(context) {
  if (!context) return ''

  if (typeof context === 'string') {
    return context.trim()
  }

  try {
    return JSON.stringify(context, null, 2)
  } catch {
    return String(context)
  }
}

function buildPrompt({ prompt, taskType, context }) {
  const contextText = formatContext(context)
  const taskInstruction = TASK_INSTRUCTIONS[taskType] || ''

  return [
    'Du bist EduFlow, ein Assistent fuer Schweizer Lehrpersonen. Antworte klar, praezise und produktionsnah nutzbar.',
    taskInstruction ? `Aufgabentyp: ${taskType}\n${taskInstruction}` : taskType ? `Aufgabentyp: ${taskType}` : '',
    contextText ? `Kontext:\n${contextText}` : '',
    `Auftrag:\n${prompt}`
  ].filter(Boolean).join('\n\n')
}

function isRetryableGeminiError(error) {
  const message = `${error?.message || ''} ${error?.status || ''} ${error?.code || ''}`.toLowerCase()
  return message.includes('503') ||
    message.includes('429') ||
    message.includes('high demand') ||
    message.includes('overloaded') ||
    message.includes('unavailable')
}

async function generateContent(ai, { model, builtPrompt, temperature, maxOutputTokens, responseMimeType, responseSchema }) {
  const response = await ai.models.generateContent({
    model,
    contents: builtPrompt,
    config: {
      temperature,
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
      ...(responseMimeType ? { responseMimeType } : {}),
      ...(responseSchema ? { responseSchema } : {})
    }
  })

  return {
    provider: 'gemini',
    model,
    text: response.text || ''
  }
}

export async function generateWithGemini({
  prompt,
  model,
  temperature = 0.7,
  maxOutputTokens,
  responseMimeType,
  responseSchema,
  taskType,
  context
}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt is required and must be a string.')
  }

  const ai = getGeminiClient()
  const builtPrompt = buildPrompt({ prompt, taskType, context })
  const selectedModel = model || DEFAULT_GEMINI_MODEL

  try {
    const result = await generateContent(ai, { model: selectedModel, builtPrompt, temperature, maxOutputTokens, responseMimeType, responseSchema })
    return {
      ...result,
      taskType: taskType || null
    }
  } catch (error) {
    const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || DEFAULT_GEMINI_FALLBACK_MODEL
    if (model || !fallbackModel || fallbackModel === selectedModel || !isRetryableGeminiError(error)) {
      throw error
    }

    const result = await generateContent(ai, { model: fallbackModel, builtPrompt, temperature, maxOutputTokens, responseMimeType, responseSchema })
    return {
      ...result,
      taskType: taskType || null,
      fallbackFrom: selectedModel
    }
  }
}

export async function generateSpeechWithGemini({
  text,
  model = process.env.GEMINI_TTS_MODEL || DEFAULT_GEMINI_TTS_MODEL,
  voiceName = process.env.GEMINI_TTS_VOICE || 'Kore'
}) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text is required and must be a string.')
  }

  const ai = getGeminiClient()
  const response = await ai.models.generateContent({
    model,
    contents: [{
      parts: [{
        text: [
          'Lies diesen Unterrichts-Input ruhig, klar und professionell auf Deutsch vor.',
          'Sprich im Stil eines kompakten Audio-Overviews fuer Lehrpersonen.',
          text
        ].join('\n\n')
      }]
    }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName
          }
        }
      }
    }
  })

  const inlineData = getAudioPart(response)
  if (!inlineData?.data) {
    throw new Error('Gemini did not return audio data.')
  }

  const pcmBuffer = Buffer.from(inlineData.data, 'base64')
  const sampleRate = getSampleRate(inlineData.mimeType)

  return {
    provider: 'gemini',
    model,
    voiceName,
    mimeType: 'audio/wav',
    audio: pcmToWavBuffer(pcmBuffer, sampleRate)
  }
}
