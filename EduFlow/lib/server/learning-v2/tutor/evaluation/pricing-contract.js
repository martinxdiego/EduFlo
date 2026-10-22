export const TUTOR_PRICING_CONTRACT_VERSION = 'openai-gpt-5.6-terra-standard-pricing-v1'
export const TUTOR_PRICING_REF = 'openai:gpt-5.6-terra:standard-api:2026-07-30:v1'
export const TUTOR_STANDARD_SERVICE_TIER = 'default'

const source = Object.freeze({
  title: 'OpenAI — Advancing the price-performance frontier with GPT-5.6',
  effective_date: '2026-07-30',
  url: 'https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/',
  cross_check_url: 'https://developers.openai.com/api/docs/models/gpt-5.6-terra',
})

export const TUTOR_FROZEN_TOKEN_PRICING = Object.freeze({
  pricing_contract_version: TUTOR_PRICING_CONTRACT_VERSION,
  pricing_ref: TUTOR_PRICING_REF,
  pricing_mode: 'STANDARD_API',
  provider_request_service_tier: TUTOR_STANDARD_SERVICE_TIER,
  input_pricing_basis: 'UNCACHED_INPUT',
  cached_input_discount_applied: false,
  input_per_million: 2,
  output_per_million: 12,
  currency: 'USD',
})

export const TUTOR_PAID_EVALUATION_PRICING_CONTRACT = Object.freeze({
  pricing_contract_version: TUTOR_PRICING_CONTRACT_VERSION,
  provider_id: 'openai',
  model_id: 'gpt-5.6-terra',
  pricing_mode: 'STANDARD_API',
  provider_request_service_tier: TUTOR_STANDARD_SERVICE_TIER,
  input_pricing_basis: 'UNCACHED_INPUT',
  cached_input_discount_applied: false,
  frozen_token_pricing: TUTOR_FROZEN_TOKEN_PRICING,
  source,
  runtime_fetch_allowed: false,
})
