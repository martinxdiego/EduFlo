import { requireProviderTransport } from '../../../provider-denial.js'
import { zodTextFormat } from 'openai/helpers/zod'
import { TUTOR_MODEL, TUTOR_PROVIDER_SCHEMA_VERSION, tutorProviderResponseSchema } from '../../contracts/phase3.js'
import { TUTOR_PROMPT_REGISTRY } from '../prompt-registry.js'
import { TUTOR_STANDARD_SERVICE_TIER } from '../evaluation/pricing-contract.js'
import { TutorProvider } from './tutor-provider.js'

export class OpenAITutorProvider extends TutorProvider {
  constructor(options = {}) {
    super()
    this.timeoutMs = Math.min(Math.max(Number(options.timeoutMs || process.env.LEARNING_V2_TUTOR_TIMEOUT_MS) || 6_000, 500), 15_000)
    this.maxRetries = 0
    // Only server-injected evaluation mocks/adapters are supported. Runtime never
    // constructs a Provider client from key presence. Approval stays separately gated.
    this.client = options.client || null
  }

  available() { return Boolean(this.client) }

  async generate(context, options = {}) {
    if (!this.client) requireProviderTransport()
    const prompt = TUTOR_PROMPT_REGISTRY[context.prompt_version]
    if (!prompt || prompt.model !== TUTOR_MODEL) throw new Error('Tutor prompt configuration unavailable')
    const controller = new AbortController()
    const abortFromCaller = () => controller.abort(options.signal?.reason)
    if (options.signal?.aborted) abortFromCaller()
    else options.signal?.addEventListener?.('abort', abortFromCaller, { once: true })
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      await options.beforeTransport?.()
      const response = await this.client.responses.parse({
        model: TUTOR_MODEL,
        service_tier: TUTOR_STANDARD_SERVICE_TIER,
        store: false,
        instructions: prompt.instructions,
        input: JSON.stringify(context),
        text: { format: zodTextFormat(tutorProviderResponseSchema, 'tutor_response_v1') },
        max_output_tokens: 160,
        reasoning: { effort: 'low' },
      }, { signal: controller.signal, timeout: this.timeoutMs, maxRetries: this.maxRetries })
      if (!response.output_parsed) throw new Error('Tutor provider returned no parsed output')
      return { candidate: { ...response.output_parsed, schema_version: TUTOR_PROVIDER_SCHEMA_VERSION }, usage: response.usage || null }
    } finally {
      clearTimeout(timeout)
      options.signal?.removeEventListener?.('abort', abortFromCaller)
    }
  }
}
