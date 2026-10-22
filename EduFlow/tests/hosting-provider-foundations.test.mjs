import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { requiresTeacherReview, submissionTotals, reviewableSubmission } from '../lib/server/submission-grading.js'
import { getOpenAIClient, generateOpenAIJson, generateOpenAISpeech } from '../lib/server/openai-service.js'
import { getGeminiClient } from '../lib/ai/gemini.js'
import { OpenAITutorProvider } from '../lib/server/learning-v2/tutor/providers/openai-tutor-provider.js'
import { providerDeniedResponse } from '../lib/server/provider-denial.js'
import { buildLearningGoalProgress } from '../lib/learning-workflow.js'

test('no-key Provider modules boot and explicitly deny without transport', async () => {
  const saved = process.env.OPENAI_API_KEY
  const originalFetch = globalThis.fetch
  let transports = 0
  globalThis.fetch = () => { transports += 1; throw new Error('Unexpected transport') }
  delete process.env.OPENAI_API_KEY
  try {
    const denied = { code: 'PROVIDER_DISABLED', status: 403 }
    assert.throws(() => getOpenAIClient(), denied)
    assert.throws(() => getGeminiClient(), denied)
    await assert.rejects(generateOpenAIJson({}), denied)
    await assert.rejects(generateOpenAISpeech({}), denied)
    const tutor = new OpenAITutorProvider()
    assert.equal(tutor.available(), false)
    await assert.rejects(tutor.generate({}), denied)
    assert.equal(transports, 0)
    const response = providerDeniedResponse()
    assert.equal(response.status, 403)
    assert.equal((await response.json()).code, 'PROVIDER_DISABLED')
  } finally {
    globalThis.fetch = originalFetch
    if (saved === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = saved
  }
})

test('key presence and caller authority grant no Provider transport', async () => {
  const saved = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'synthetic-noncredential'
  try {
    assert.throws(() => getOpenAIClient({ allowed: true, environment: 'staging' }), { code: 'PROVIDER_DISABLED' })
    const tutor = new OpenAITutorProvider({ environment: 'staging', runtimeApproval: true })
    assert.equal(tutor.available(), false)
    await assert.rejects(tutor.generate({}), { code: 'PROVIDER_DISABLED' })
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = saved
  }
})

test('open judgement remains unresolved instead of becoming zero or a final grade', () => {
  const results = [{ maxPoints: 2, pointsAwarded: 2, isCorrect: true },
    { maxPoints: 3, pointsAwarded: null, isCorrect: null, needsManualReview: true }]
  assert.deepEqual(submissionTotals(results), {
    totalPoints: 5, earnedPoints: null, scorePercentage: null, swissGrade: null, needsReview: true,
  })
  assert.equal(results[1].pointsAwarded, null)
})

test('historical AI points have no authority without an explicit teacher override', () => {
  const aiResult = { maxPoints: 3, pointsAwarded: 3, isCorrect: true, aiGraded: true }
  assert.equal(requiresTeacherReview(aiResult), true)
  assert.equal(submissionTotals([aiResult]).swissGrade, null)
  const projected = reviewableSubmission({ question_results: [aiResult], swiss_grade: 6, needs_review: false })
  assert.equal(projected.swiss_grade, null)
  assert.equal(projected.question_results[0].pointsAwarded, null)
  assert.equal(projected.needs_review, true)
  assert.equal(aiResult.pointsAwarded, 3, 'read projection must not mutate stored history')
  assert.equal(submissionTotals([{ ...aiResult, teacherOverride: true }]).swissGrade, 6)
})

test('explicit teacher zero and deterministic incorrect answers remain valid results', () => {
  assert.deepEqual(submissionTotals([{ maxPoints: 2, pointsAwarded: 0, isCorrect: false, teacherOverride: true }]), {
    totalPoints: 2, earnedPoints: 0, scorePercentage: 0, swissGrade: 1, needsReview: false,
  })
})

test('pending and AI-derived submissions do not set legacy Mastery', () => {
  const assignments = [{ id: 'synthetic', learning_goals: ['Synthetic objective'] }]
  assert.deepEqual(buildLearningGoalProgress(assignments, [
    { assignment_id: 'synthetic', needs_review: true, score_percentage: 0 },
    { assignment_id: 'synthetic', score_percentage: null },
    { assignment_id: 'synthetic', score_percentage: 100, question_results: [{ aiGraded: true }] },
  ]), [])
})

test('legacy student grading has no LLM call and main route has no eager SDK construction', async () => {
  const grading = await readFile(new URL('../lib/server/student-assignments.js', import.meta.url), 'utf8')
  const route = await readFile(new URL('../app/api/[[...path]]/route.js', import.meta.url), 'utf8')
  assert.doesNotMatch(grading, /OpenAI|gradeOpenQuestions|chat\.completions|responses\.create/)
  assert.doesNotMatch(route, /new OpenAI/)
})
