const trustedClocks = new WeakSet()

function canonicalDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new TypeError('Trusted Human Review clock returned an invalid time')
  return date
}

function createClock(readNow) {
  if (typeof readNow !== 'function') throw new TypeError('Trusted Human Review clock requires a reader')
  const clock = Object.freeze({
    read() { return canonicalDate(readNow()) },
  })
  trustedClocks.add(clock)
  return clock
}

const serverClock = createClock(() => new Date())

export function tutorHumanReviewServerClock() {
  return serverClock
}

export function assertTrustedTutorHumanReviewClock(clock) {
  if (!trustedClocks.has(clock)) throw new TypeError('A trusted Human Review clock is required')
  return clock
}

export function readTrustedTutorHumanReviewNow(clock) {
  return assertTrustedTutorHumanReviewClock(clock).read()
}

export function snapshotTrustedTutorHumanReviewClock(clock) {
  const captured = readTrustedTutorHumanReviewNow(clock)
  return createClock(() => captured)
}

// This seam is intentionally unavailable in normal Development execution and
// Production. Tests receive it only through the internal test harness module;
// no runner, client payload, Assignment, Claim or repository artifact accepts it.
export function createInternalTutorHumanReviewTestClock(timestamp) {
  if (process.env.NODE_ENV !== 'test') throw new TypeError('Human Review test clock is available only in an actual test process')
  const fixed = canonicalDate(timestamp)
  if (fixed.toISOString() !== timestamp) throw new TypeError('Human Review test clock requires canonical UTC milliseconds')
  return createClock(() => fixed)
}
