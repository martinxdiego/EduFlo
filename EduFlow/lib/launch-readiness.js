export const REQUIRED_LAUNCH_CHECKS = Object.freeze([
  'materials', 'quota', 'exports', 'privacy', 'operator', 'legal_review',
  'hosting', 'dependencies', 'billing', 'monitoring', 'curriculum', 'domain', 'pilot',
])

export function evaluateLaunchReadiness(checks) {
  const entries = Array.isArray(checks) ? checks : []
  const blockers = REQUIRED_LAUNCH_CHECKS.filter(id => {
    const matches = entries.filter(item => item?.id === id)
    return matches.length !== 1 || matches[0].status !== 'verified' || !String(matches[0].evidence || '').trim()
  })
  return { ready: blockers.length === 0, blockers }
}
