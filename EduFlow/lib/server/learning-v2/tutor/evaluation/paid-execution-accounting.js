import { paidCaseFactsSchema, paidAccountingSchema, paidBlocked, PAID_LIMITS, deepFreeze } from './paid-execution-contract.js'

function safe(n) { if (n < BigInt(Number.MIN_SAFE_INTEGER) || n > BigInt(Number.MAX_SAFE_INTEGER)) throw paidBlocked('TOKEN_LIMIT'); return Number(n) }
export function paidKnownUsage(usage) {
  if (!usage || ![usage.input_tokens, usage.output_tokens, usage.total_tokens].every(n => Number.isSafeInteger(n) && n >= 0)
    || BigInt(usage.input_tokens) + BigInt(usage.output_tokens) !== BigInt(usage.total_tokens)) return null
  return { known_input_tokens: usage.input_tokens, known_output_tokens: usage.output_tokens, known_total_tokens: usage.total_tokens,
    known_actual_cost_usd_micros: safe(2n * BigInt(usage.input_tokens) + 12n * BigInt(usage.output_tokens)) }
}
export const paidUnknownFacts = () => ({ transport_started: null, transport_outcome: 'UNKNOWN_AFTER_PROCESS_FAILURE', usage_status: 'UNKNOWN',
  known_input_tokens: null, known_output_tokens: null, known_total_tokens: null, known_actual_cost_usd_micros: null,
  unknown_reservation_applied: true, provider_technical_cause: null, fallback_used: null, final_outcome_status: 'NOT_COMPLETED', case_completed: false })

// Call only with schema-verified case facts; shared by persisted and live preparation gates.
export const paidPerCallBreach = cases => cases.find(c => c.facts.usage_status === 'KNOWN'
  && (c.facts.known_input_tokens > PAID_LIMITS.max_input_tokens_per_call || c.facts.known_output_tokens > PAID_LIMITS.max_output_tokens_per_call))

export function derivePaidAccounting(summaries) {
  if (!Array.isArray(summaries) || summaries.length > 120) throw paidBlocked('CALL_LIMIT')
  let input = 0n, output = 0n, cost = 0n, known = 0, unknown = 0, confirmed = 0, ambiguous = 0, completed = 0, breach = false
  for (const entry of summaries) {
    const f = paidCaseFactsSchema.parse(entry.facts)
    confirmed += f.transport_started === true ? 1 : 0
    ambiguous += f.transport_started === null ? 1 : 0
    completed += f.case_completed ? 1 : 0
    if (f.usage_status === 'KNOWN') {
      known++; input += BigInt(f.known_input_tokens); output += BigInt(f.known_output_tokens); cost += BigInt(f.known_actual_cost_usd_micros)
      breach ||= f.known_input_tokens > 40000 || f.known_output_tokens > 160
    } else if (f.usage_status === 'UNKNOWN') unknown++
  }
  const unknownCost = BigInt(unknown) * 81920n, upper = cost + unknownCost
  const unprovable = breach && unknown > 0
  return deepFreeze(paidAccountingSchema.parse({ known_usage_call_count: known, known_input_tokens: safe(input), known_output_tokens: safe(output),
    known_total_tokens: safe(input + output), known_actual_cost_usd_micros: safe(cost), unknown_usage_call_count: unknown,
    unknown_reserved_input_tokens: unknown * 40000, unknown_reserved_output_tokens: unknown * 160, unknown_reserved_total_tokens: unknown * 40160,
    conservative_unknown_usage_cost_usd_micros: safe(unknownCost), actual_cost_status: unknown ? 'PARTIAL_UNKNOWN' : 'KNOWN',
    actual_cost_usd_micros: unknown ? null : safe(cost), bounds_status: unprovable ? 'UNPROVABLE' : 'PROVEN',
    conservative_total_cost_upper_bound_usd_micros: unprovable ? null : safe(upper),
    remaining_budget_upper_bound_usd_micros: unprovable ? null : safe(10000000n - upper),
    conservative_input_tokens: safe(input + BigInt(unknown) * 40000n), conservative_output_tokens: safe(output + BigInt(unknown) * 160n),
    conservative_total_tokens: safe(input + output + BigInt(unknown) * 40160n), confirmed_started_transport_count: confirmed,
    possibly_started_transport_count: confirmed + ambiguous, started_transport_count: ambiguous ? null : confirmed,
    completed_case_count: completed, unattempted_case_count: 120 - summaries.length }))
}
export function paidNextReservationFailure(accounting) {
  const a = paidAccountingSchema.parse(accounting)
  if (a.bounds_status !== 'PROVEN') return 'TOKEN_LIMIT'
  if (a.possibly_started_transport_count >= PAID_LIMITS.max_transports) return 'CALL_LIMIT'
  if (a.conservative_input_tokens + 40000 > 4800000 || a.conservative_output_tokens + 160 > 19200
    || a.conservative_total_tokens + 40160 > 4819200) return 'TOKEN_LIMIT'
  if (a.conservative_total_cost_upper_bound_usd_micros + 81920 > 10000000) return 'BUDGET_LIMIT'
  return null
}
