export const ACTIVITY_MODES = {
  exercise: {
    label: 'Übung', shortLabel: 'Üben', description: 'Beliebig trainieren mit direktem Feedback.',
    feedbackMode: 'immediate', maxAttempts: 5, timeLimitMinutes: 0, showSolutions: true, graded: false,
  },
  homework: {
    label: 'Hausaufgabe', shortLabel: 'Hausaufgabe', description: 'Verbindlicher Auftrag mit Abgabefrist.',
    feedbackMode: 'after_submission', maxAttempts: 2, timeLimitMinutes: 0, showSolutions: true, graded: false,
  },
  diagnostic: {
    label: 'Standortbestimmung', shortLabel: 'Standort', description: 'Vorwissen ohne Notendruck sichtbar machen.',
    feedbackMode: 'after_submission', maxAttempts: 1, timeLimitMinutes: 0, showSolutions: false, graded: false,
  },
  practice_check: {
    label: 'Übungs-Lernzielkontrolle', shortLabel: 'Übungs-LZK', description: 'Prüfungsnah üben und gezielt nacharbeiten.',
    feedbackMode: 'after_submission', maxAttempts: 2, timeLimitMinutes: 45, showSolutions: true, graded: false,
  },
  assessment: {
    label: 'Lernzielkontrolle', shortLabel: 'Lernzielkontrolle', description: 'Verbindliche Kontrolle mit späterer Ergebnisfreigabe.',
    feedbackMode: 'teacher_release', maxAttempts: 1, timeLimitMinutes: 45, showSolutions: false, graded: true,
  },
  self_test: {
    label: 'Selbsttest', shortLabel: 'Selbsttest', description: 'Eigenständig wiederholen und Fortschritt prüfen.',
    feedbackMode: 'immediate', maxAttempts: 10, timeLimitMinutes: 0, showSolutions: true, graded: false,
  },
  exit_ticket: {
    label: 'Exit Ticket', shortLabel: 'Exit Ticket', description: 'Kurzer Lernstandscheck am Ende der Lektion.',
    feedbackMode: 'after_submission', maxAttempts: 1, timeLimitMinutes: 10, showSolutions: false, graded: false,
  },
  learning_path: {
    label: 'Lernpfad', shortLabel: 'Lernpfad', description: 'Aufträge schrittweise und im eigenen Tempo bearbeiten.',
    feedbackMode: 'immediate', maxAttempts: 3, timeLimitMinutes: 0, showSolutions: true, graded: false,
  },
}

export const ACTIVITY_MODE_IDS = Object.keys(ACTIVITY_MODES)
export const FEEDBACK_MODE_IDS = ['immediate', 'after_submission', 'after_deadline', 'teacher_release']

export function normalizeLearningGoals(value) {
  const entries = Array.isArray(value) ? value : String(value || '').split(/\r?\n|;/)
  return [...new Set(entries.map((goal) => String(goal || '').trim()).filter(Boolean))].slice(0, 8)
}

export function normalizeAssignmentSettings(value = {}) {
  const activityType = ACTIVITY_MODES[value.activityType || value.activity_type] ? (value.activityType || value.activity_type) : 'exercise'
  const preset = ACTIVITY_MODES[activityType]
  const feedbackModeValue = value.feedbackMode || value.feedback_mode
  const maxAttemptsValue = value.maxAttempts ?? value.max_attempts
  const timeLimitValue = value.timeLimitMinutes ?? value.time_limit_minutes
  return {
    activityType,
    feedbackMode: FEEDBACK_MODE_IDS.includes(feedbackModeValue) ? feedbackModeValue : preset.feedbackMode,
    maxAttempts: Math.min(10, Math.max(1, Number(maxAttemptsValue ?? preset.maxAttempts) || preset.maxAttempts)),
    timeLimitMinutes: Math.min(180, Math.max(0, Number(timeLimitValue ?? preset.timeLimitMinutes) || 0)),
    showSolutions: typeof (value.showSolutions ?? value.show_solutions) === 'boolean' ? (value.showSolutions ?? value.show_solutions) : preset.showSolutions,
    graded: typeof value.graded === 'boolean' ? value.graded : preset.graded,
    feedbackReleased: Boolean(value.feedbackReleased ?? value.feedback_released),
    learningGoals: normalizeLearningGoals(value.learningGoals || value.learning_goals),
    instructions: String(value.instructions || '').trim().slice(0, 1000),
    unit: String(value.unit || '').trim().slice(0, 100),
  }
}

export function isAssignmentFeedbackVisible(assignment, now = new Date()) {
  const settings = normalizeAssignmentSettings(assignment)
  if (settings.feedbackMode === 'immediate' || settings.feedbackMode === 'after_submission') return true
  if (settings.feedbackMode === 'teacher_release') return settings.feedbackReleased
  return Boolean(assignment.deadline && new Date(assignment.deadline) <= now)
}

export function buildLearningGoalProgress(assignments = [], submissions = []) {
  const assignmentMap = new Map(assignments.map((assignment) => [assignment.id, assignment]))
  const goals = new Map()
  const chronologicalSubmissions = [...submissions].sort((a, b) => new Date(a.submitted_at || 0) - new Date(b.submitted_at || 0))
  for (const submission of chronologicalSubmissions) {
    const assignment = assignmentMap.get(submission.assignment_id) || submission
    for (const goal of normalizeLearningGoals(assignment.learning_goals || submission.learning_goals)) {
      const entry = goals.get(goal) || { goal, attempts: 0, scoreTotal: 0, bestScore: 0, latestScore: 0, subject: assignment.subject || '' }
      const score = Number(submission.score_percentage || 0)
      entry.attempts += 1
      entry.scoreTotal += score
      entry.bestScore = Math.max(entry.bestScore, score)
      entry.latestScore = score
      if (!entry.subject) entry.subject = assignment.subject || ''
      goals.set(goal, entry)
    }
  }
  return [...goals.values()].map((entry) => ({
    ...entry,
    averageScore: Math.round(entry.scoreTotal / entry.attempts),
    mastery: entry.bestScore >= 80 ? 'secure' : entry.bestScore >= 60 ? 'developing' : 'support',
  })).sort((a, b) => a.bestScore - b.bestScore || a.goal.localeCompare(b.goal, 'de'))
}

export function buildSupportRecommendations(goalProgress = [], studentName = '') {
  const prefix = studentName ? `${studentName}: ` : ''
  return goalProgress.filter((goal) => goal.mastery !== 'secure').slice(0, 4).map((goal) => ({
    goal: goal.goal,
    priority: goal.mastery === 'support' ? 'high' : 'medium',
    title: goal.mastery === 'support' ? `${prefix}Grundlagen gezielt sichern` : `${prefix}Lernziel festigen`,
    reason: `Bestes Ergebnis ${goal.bestScore}% aus ${goal.attempts} ${goal.attempts === 1 ? 'Versuch' : 'Versuchen'}.`,
    nextAction: goal.mastery === 'support'
      ? `Kurze Übung zu „${goal.goal}“ auf Grundniveau zuweisen.`
      : `Übungs-Lernzielkontrolle zu „${goal.goal}“ wiederholen.`,
    suggestedMode: goal.mastery === 'support' ? 'exercise' : 'practice_check',
  }))
}
