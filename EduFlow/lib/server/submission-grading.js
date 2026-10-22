// Only deterministic results and explicit teacher judgements have grading authority.
// Historical AI results require teacher review before they can contribute a grade.
export function requiresTeacherReview(result) {
  if (result.type === 'image_block' && result.isInformational === true) return false
  return result.needsManualReview === true || result.isCorrect == null
    || !Number.isFinite(result.pointsAwarded)
    || (result.aiGraded === true && result.teacherOverride !== true)
}

export function submissionTotals(questionResults) {
  const totalPoints = questionResults.reduce((sum, result) => sum + (Number.isFinite(result.maxPoints) ? Math.max(0, result.maxPoints) : 1), 0)
  const needsReview = questionResults.some(requiresTeacherReview)
  if (needsReview) return { totalPoints, earnedPoints: null, scorePercentage: null, swissGrade: null, needsReview }
  if (!totalPoints) return { totalPoints: 0, earnedPoints: 0, scorePercentage: null, swissGrade: null, needsReview: false }
  const earnedPoints = questionResults.reduce((sum, result) => sum + result.pointsAwarded, 0)
  const scorePercentage = totalPoints ? Math.round(earnedPoints / totalPoints * 100) : 0
  const swissGrade = totalPoints ? Math.round((earnedPoints / totalPoints * 5 + 1) * 2) / 2 : 1
  return { totalPoints, earnedPoints, scorePercentage, swissGrade, needsReview }
}

export function reviewableSubmission(submission) {
  const questionResults = (submission.question_results || []).map((result) =>
    result.aiGraded === true && result.teacherOverride !== true
      ? { ...result, pointsAwarded: null, isCorrect: null, needsManualReview: true }
      : result)
  const totals = submissionTotals(questionResults)
  return { ...submission, question_results: questionResults, total_points: totals.totalPoints,
    earned_points: totals.earnedPoints, score_percentage: totals.scorePercentage,
    swiss_grade: totals.swissGrade, needs_review: totals.needsReview }
}
