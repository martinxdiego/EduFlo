// A missing model price or token count is unknown, never a free generation.
export function estimateTokenCost(model, usage, prices, explicitCostUsd) {
  if (Number.isFinite(explicitCostUsd) && explicitCostUsd >= 0) return explicitCostUsd
  const price = prices?.[model]
  const input = usage?.prompt_tokens ?? usage?.input_tokens
  const output = usage?.completion_tokens ?? usage?.output_tokens
  if (![price?.input, price?.output, input, output].every(value => Number.isFinite(value) && value >= 0)) return null
  return Number(((input * price.input + output * price.output) / 1_000_000).toFixed(6))
}
