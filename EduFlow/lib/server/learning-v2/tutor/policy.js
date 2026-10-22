import { normalizeAssignmentSettings } from '../../../learning-workflow.js'

const FORCED_OFF_MODES = new Set(['assessment', 'diagnostic', 'exit_ticket'])

export function defaultTutorPreset(activityMode) {
  return FORCED_OFF_MODES.has(activityMode) ? 'TUTOR_OFF' : 'LOCAL_HINTS'
}

export function resolveTutorPolicy(assignment, requestedPreset) {
  const settings = normalizeAssignmentSettings(assignment)
  const requested = requestedPreset || defaultTutorPreset(settings.activityType)
  const restrictions = []
  if (FORCED_OFF_MODES.has(settings.activityType)) restrictions.push(`ACTIVITY_MODE_${settings.activityType.toUpperCase()}`)
  if (settings.graded) restrictions.push('GRADED_ACTIVITY')
  if (!settings.showSolutions) restrictions.push('SOLUTIONS_HIDDEN')
  if (settings.feedbackMode === 'teacher_release') restrictions.push('TEACHER_RELEASE')
  return {
    requested_preset: requested,
    effective_preset: restrictions.length ? 'TUTOR_OFF' : requested,
    restriction_reasons: restrictions,
  }
}
