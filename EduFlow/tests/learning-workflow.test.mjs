import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTIVITY_MODES,
  buildLearningGoalProgress,
  buildSupportRecommendations,
  isAssignmentFeedbackVisible,
  normalizeAssignmentSettings,
} from '../lib/learning-workflow.js'

test('applies safe pedagogical defaults for every activity mode', () => {
  for (const [activityType, preset] of Object.entries(ACTIVITY_MODES)) {
    const settings = normalizeAssignmentSettings({ activityType })
    assert.equal(settings.activityType, activityType)
    assert.equal(settings.feedbackMode, preset.feedbackMode)
    assert.equal(settings.maxAttempts, preset.maxAttempts)
  }
})

test('bounds settings and normalizes learning goals', () => {
  const settings = normalizeAssignmentSettings({
    activityType: 'assessment', maxAttempts: 99, timeLimitMinutes: 999,
    learningGoals: ['Brüche addieren', ' Brüche addieren ', 'Ergebnisse prüfen'],
  })
  assert.equal(settings.maxAttempts, 10)
  assert.equal(settings.timeLimitMinutes, 180)
  assert.deepEqual(settings.learningGoals, ['Brüche addieren', 'Ergebnisse prüfen'])
})

test('respects delayed and teacher-released feedback', () => {
  assert.equal(isAssignmentFeedbackVisible({ activity_type: 'assessment' }), false)
  assert.equal(isAssignmentFeedbackVisible({ activity_type: 'assessment', feedback_released: true }), true)
  assert.equal(isAssignmentFeedbackVisible({ feedback_mode: 'after_deadline', deadline: '2025-01-01T00:00:00.000Z' }, new Date('2025-01-02')), true)
})

test('links submissions to learning goals and creates actionable support', () => {
  const assignments = [{ id: 'a1', learning_goals: ['Brüche addieren'], subject: 'Mathematik' }]
  const submissions = [
    { assignment_id: 'a1', score_percentage: 45 },
    { assignment_id: 'a1', score_percentage: 55 },
  ]
  const progress = buildLearningGoalProgress(assignments, submissions)
  assert.equal(progress[0].mastery, 'support')
  assert.equal(progress[0].averageScore, 50)
  const recommendations = buildSupportRecommendations(progress, 'Mia')
  assert.equal(recommendations[0].priority, 'high')
  assert.equal(recommendations[0].suggestedMode, 'exercise')
  assert.match(recommendations[0].title, /Mia/)
})
