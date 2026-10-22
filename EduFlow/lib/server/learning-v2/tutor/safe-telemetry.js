export const TUTOR_TELEMETRY_DEADLINE_MS = 200

// Telemetry is deliberately outside every pedagogical state transition. A late
// write may finish idempotently, but its promise can never hold up tutoring.
export async function safeTutorTelemetry(telemetry, actor, session, values, deadlineMs = TUTOR_TELEMETRY_DEADLINE_MS) {
  if (!telemetry?.record) return { status: 'not_configured' }
  const write = Promise.resolve().then(() => telemetry.record(actor, session, values))
  write.catch(() => {}) // absorb a rejection even when it arrives after the deadline
  let timeout
  const deadline = new Promise((resolve) => { timeout = setTimeout(() => resolve({ status: 'deadline' }), deadlineMs) })
  try {
    return await Promise.race([write.then(() => ({ status: 'recorded' }), () => ({ status: 'discarded' })), deadline])
  } finally {
    clearTimeout(timeout)
  }
}
