export async function generateAI({
  provider = process.env.DEFAULT_AI_PROVIDER || 'openai',
  prompt,
  taskType,
  context,
  options = {}
}) {
  const selectedProvider = String(provider || '').toLowerCase()

  if (selectedProvider === 'gemini') {
    const { generateWithGemini } = await import('./gemini')
    return generateWithGemini({
      prompt,
      taskType,
      context,
      ...options
    })
  }

  throw new Error(`Unsupported AI provider: ${provider}`)
}

export { generateWithGemini, generateSpeechWithGemini } from './gemini'
