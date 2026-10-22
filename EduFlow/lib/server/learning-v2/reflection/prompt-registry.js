import {
  REFLECTION_LOCALE,
  REFLECTION_MAX_CHARACTERS,
  REFLECTION_MAX_WORDS,
  REFLECTION_PROMPT_ID,
  REFLECTION_PROMPT_TEXT,
  REFLECTION_PROMPT_VERSION,
  REFLECTION_TYPE,
} from '../contracts/phase3b.js'

const IDENTIFY_MISTAKE_PROMPT = Object.freeze({
  prompt_id: REFLECTION_PROMPT_ID,
  prompt_version: REFLECTION_PROMPT_VERSION,
  type: REFLECTION_TYPE,
  locale: REFLECTION_LOCALE,
  text: REFLECTION_PROMPT_TEXT,
  maximum_response_characters: REFLECTION_MAX_CHARACTERS,
  maximum_response_words: REFLECTION_MAX_WORDS,
})

export function reflectionPrompt(promptId, promptVersion) {
  if (promptId !== REFLECTION_PROMPT_ID || promptVersion !== REFLECTION_PROMPT_VERSION) return null
  return structuredClone(IDENTIFY_MISTAKE_PROMPT)
}

export function identifyMistakeReflectionPrompt() {
  return structuredClone(IDENTIFY_MISTAKE_PROMPT)
}
