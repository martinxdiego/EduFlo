export const TUTOR_EVALUATION_ACCOUNTING_CONTRACT_VERSION = 'tutor-paid-evaluation-accounting-v1'
export const TUTOR_ACTUAL_COST_STATUSES = Object.freeze(['COMPLETE', 'PARTIAL_UNKNOWN'])

function rounded(value) { return Number(value.toFixed(10)) }

function safeUsage(value) {
  if (!value || ![value.input_tokens, value.output_tokens, value.total_tokens]
    .every((item) => Number.isSafeInteger(item) && item >= 0)
    || value.total_tokens !== value.input_tokens + value.output_tokens) return null
  return Object.freeze({
    input_tokens: value.input_tokens,
    output_tokens: value.output_tokens,
    total_tokens: value.total_tokens,
  })
}

export class ConservativeEvaluationBudget {
  constructor(manifest) {
    const integerFields = [
      'max_http_calls', 'max_input_tokens', 'max_output_tokens', 'max_total_tokens',
      'max_input_tokens_per_call', 'max_output_tokens_per_call',
    ]
    const pricing = manifest?.frozen_token_pricing
    if (!pricing || integerFields.some((field) => !Number.isSafeInteger(manifest[field]) || manifest[field] < 0)
      || !Number.isFinite(manifest.max_cost) || manifest.max_cost < 0
      || !Number.isFinite(pricing.input_per_million) || pricing.input_per_million < 0
      || !Number.isFinite(pricing.output_per_million) || pricing.output_per_million < 0
      || !manifest.currency || manifest.frozen_token_pricing.currency !== manifest.currency) {
      throw new TypeError('EVALUATION_ACCOUNTING_CONTRACT_INVALID')
    }
    this.manifest = manifest
    this.httpCalls = 0
    this.knownInputTokens = 0
    this.knownOutputTokens = 0
    this.knownTotalTokens = 0
    this.knownActualCost = 0
    this.unknownUsageCallCount = 0
    this.unknownUsageReservedInputTokens = 0
    this.unknownUsageReservedOutputTokens = 0
    this.unknownUsageReservedTotalTokens = 0
    this.conservativeUnknownUsageCost = 0
    this.pending = null
    this.hardStopped = false
  }

  estimatedCost(inputTokens, outputTokens) {
    const price = this.manifest.frozen_token_pricing
    return inputTokens * price.input_per_million / 1_000_000
      + outputTokens * price.output_per_million / 1_000_000
  }

  maximumPerCallCharge() {
    return rounded(this.estimatedCost(
      this.manifest.max_input_tokens_per_call,
      this.manifest.max_output_tokens_per_call,
    ))
  }

  conservativeInputTokens() { return this.knownInputTokens + this.unknownUsageReservedInputTokens }
  conservativeOutputTokens() { return this.knownOutputTokens + this.unknownUsageReservedOutputTokens }
  conservativeTotalTokens() { return this.knownTotalTokens + this.unknownUsageReservedTotalTokens }
  conservativeCost() { return this.knownActualCost + this.conservativeUnknownUsageCost }

  beforeCall() {
    if (this.hardStopped || this.pending) return false
    const input = this.manifest.max_input_tokens_per_call
    const output = this.manifest.max_output_tokens_per_call
    const total = input + output
    const cost = this.estimatedCost(input, output)
    const allowed = this.httpCalls + 1 <= this.manifest.max_http_calls
      && this.conservativeInputTokens() + input <= this.manifest.max_input_tokens
      && this.conservativeOutputTokens() + output <= this.manifest.max_output_tokens
      && this.conservativeTotalTokens() + total <= this.manifest.max_total_tokens
      && this.conservativeCost() + cost <= this.manifest.max_cost
    if (!allowed) {
      this.hardStopped = true
      return false
    }
    this.pending = { input, output, total, cost, transport_started: false }
    return true
  }

  markTransport() {
    if (!this.pending || this.pending.transport_started || this.hardStopped) {
      throw new Error('PAID_EVAL_CALL_NOT_RESERVED')
    }
    this.pending.transport_started = true
    this.httpCalls += 1
  }

  transportStarted() { return this.pending?.transport_started === true }

  recordUsage(value) {
    if (!this.pending?.transport_started) throw new Error('PAID_EVAL_CALL_NOT_RESERVED')
    const usage = safeUsage(value)
    if (!usage) throw new Error('PROVIDER_USAGE_MISSING')
    if (usage.input_tokens > this.pending.input || usage.output_tokens > this.pending.output
      || usage.total_tokens > this.pending.total) {
      this.pending = null
      this.hardStopped = true
      throw new Error('PAID_EVAL_BUDGET_EXCEEDED')
    }
    this.knownInputTokens += usage.input_tokens
    this.knownOutputTokens += usage.output_tokens
    this.knownTotalTokens += usage.total_tokens
    this.knownActualCost += this.estimatedCost(usage.input_tokens, usage.output_tokens)
    this.pending = null
    if (this.conservativeInputTokens() > this.manifest.max_input_tokens
      || this.conservativeOutputTokens() > this.manifest.max_output_tokens
      || this.conservativeTotalTokens() > this.manifest.max_total_tokens
      || this.conservativeCost() > this.manifest.max_cost) {
      this.hardStopped = true
      throw new Error('PAID_EVAL_BUDGET_EXCEEDED')
    }
    return usage
  }

  recordUnknownUsage() {
    if (!this.pending?.transport_started) throw new Error('PAID_EVAL_CALL_NOT_RESERVED')
    this.unknownUsageCallCount += 1
    this.unknownUsageReservedInputTokens += this.pending.input
    this.unknownUsageReservedOutputTokens += this.pending.output
    this.unknownUsageReservedTotalTokens += this.pending.total
    this.conservativeUnknownUsageCost += this.pending.cost
    this.pending = null
    if (this.conservativeInputTokens() > this.manifest.max_input_tokens
      || this.conservativeOutputTokens() > this.manifest.max_output_tokens
      || this.conservativeTotalTokens() > this.manifest.max_total_tokens
      || this.conservativeCost() > this.manifest.max_cost) {
      this.hardStopped = true
      throw new Error('PAID_EVAL_BUDGET_EXCEEDED')
    }
  }

  cancelBeforeTransport() {
    if (!this.pending || this.pending.transport_started) throw new Error('PAID_EVAL_TRANSPORT_STATE_INVALID')
    this.pending = null
  }

  snapshot() {
    const knownActualCost = rounded(this.knownActualCost)
    const unknownCost = rounded(this.conservativeUnknownUsageCost)
    const conservativeTotalCost = rounded(this.conservativeCost())
    const actualCostStatus = this.unknownUsageCallCount ? 'PARTIAL_UNKNOWN' : 'COMPLETE'
    return Object.freeze({
      accounting_contract_version: TUTOR_EVALUATION_ACCOUNTING_CONTRACT_VERSION,
      http_calls: this.httpCalls,
      actual_cost_status: actualCostStatus,
      actual_cost: actualCostStatus === 'COMPLETE' && !this.pending ? knownActualCost : null,
      known_actual_cost: knownActualCost,
      known_actual_input_tokens: this.knownInputTokens,
      known_actual_output_tokens: this.knownOutputTokens,
      known_actual_total_tokens: this.knownTotalTokens,
      unknown_usage_call_count: this.unknownUsageCallCount,
      unknown_usage_reserved_input_tokens: this.unknownUsageReservedInputTokens,
      unknown_usage_reserved_output_tokens: this.unknownUsageReservedOutputTokens,
      unknown_usage_reserved_total_tokens: this.unknownUsageReservedTotalTokens,
      unknown_usage_call_max_cost: this.maximumPerCallCharge(),
      conservative_unknown_usage_cost: unknownCost,
      conservative_total_cost_upper_bound: conservativeTotalCost,
      remaining_cost_budget_upper_bound: rounded(this.manifest.max_cost - conservativeTotalCost),
      authorization_input_tokens_upper_bound: this.conservativeInputTokens(),
      authorization_output_tokens_upper_bound: this.conservativeOutputTokens(),
      authorization_total_tokens_upper_bound: this.conservativeTotalTokens(),
      currency: this.manifest.currency,
      reservation_pending: Boolean(this.pending),
      hard_stopped: this.hardStopped,
    })
  }
}
