import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from './database.js'
import { checkRateLimit } from './rate-limit.js'
import { studentSubmissionSchema } from './schemas/assignments.js'
import { applyCorsHeaders, publicErrorMessage, verifyAuthToken } from './security.js'
import { parseJsonBody } from './validation.js'

function jsonResponse(body, init, request) { return applyCorsHeaders(NextResponse.json(body, init), request) }

function parseMatchingPairs(answer) {
  return String(answer || '').split(',').filter(Boolean).map((pair) => {
    const trimmed = pair.trim()
    if (trimmed.includes('→')) return trimmed.split('→').map((item) => item.trim())
    if (trimmed.includes(' - ')) return trimmed.split(' - ').map((item) => item.trim())
    const parts = trimmed.split('-')
    return parts.length > 1 ? [parts[0].trim(), parts.slice(1).join('-').trim()] : [trimmed, trimmed]
  })
}

function shuffledMatchingRight(question) {
  const pairs = parseMatchingPairs(question.answer)
  const seed = (question.number || 0) * 7 + pairs.length
  return pairs.map((pair, index) => ({ text: pair[1], origIdx: index }))
    .sort((a, b) => ((a.origIdx * 31 + seed) % 97) - ((b.origIdx * 31 + seed) % 97))
}

function shuffledOrderingItems(question) {
  const items = String(question.answer || '').split(',').map((item) => item.trim()).filter(Boolean)
  const seed = (question.number || 0) * 13 + items.length
  return [...items].sort((a, b) => ((items.indexOf(a) * 31 + seed) % 89) - ((items.indexOf(b) * 31 + seed) % 89))
}

function studentQuestion(question) {
  const result = {
    number: question.number, type: question.type, question: question.question,
    options: question.options, points: question.points, imageUrl: question.imageUrl,
  }
  if (question.type === 'matching') {
    const pairs = parseMatchingPairs(question.answer)
    result.matching_left = pairs.map((pair) => pair[0])
    result.matching_right = shuffledMatchingRight(question).map((item) => item.text)
  }
  if (question.type === 'ordering') result.ordering_items = shuffledOrderingItems(question)
  if (question.type === 'true_false' && !question.options?.length) result.options = ['Wahr', 'Falsch']
  if (question.type === 'either_or' && !question.options?.length) result.options = ['Ja', 'Nein']
  return result
}

async function enforceTargetNiveau(db, assignment, session) {
  if (!assignment.target_niveau) return true
  if (!session?.studentId || !assignment.class_id) return false
  const cls = await db.collection('classes').findOne({
    id: assignment.class_id,
    enrolled_students: { $elemMatch: { student_id: session.studentId, niveau: assignment.target_niveau } },
  })
  return Boolean(cls)
}

export async function getStudentAssignment(request, { params }) {
  const { code: rawCode } = await params
  const code = String(rawCode || '').trim().toUpperCase()
  if (!/^[A-Z0-9]{4,20}$/.test(code)) return jsonResponse({ error: 'Ungültiger Aufgabencode.' }, { status: 400 }, request)
  try {
    const db = await getDatabase()
    const retryAfter = await checkRateLimit(db, request, `/student/assignment/${code}`, 'GET')
    if (retryAfter) {
      const response = jsonResponse({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.' }, { status: 429 }, request)
      response.headers.set('Retry-After', String(retryAfter)); return response
    }
    const assignment = await db.collection('assignments').findOne({ code, status: 'active' })
    if (!assignment) return jsonResponse({ error: 'Aufgabe nicht gefunden oder nicht mehr aktiv.' }, { status: 404 }, request)
    if (assignment.deadline && new Date(assignment.deadline) < new Date()) return jsonResponse({ error: 'Die Abgabefrist ist abgelaufen.' }, { status: 410 }, request)
    const session = verifyAuthToken(request)
    if (!await enforceTargetNiveau(db, assignment, session)) return jsonResponse({ error: 'Diese Aufgabe ist nicht für dein Niveau freigegeben.' }, { status: 403 }, request)
    const worksheet = await db.collection('worksheets').findOne({ id: assignment.worksheet_id })
    if (!worksheet) return jsonResponse({ error: 'Material nicht gefunden.' }, { status: 404 }, request)
    return jsonResponse({
      title: worksheet.title, subject: worksheet.subject, grade: worksheet.grade,
      content: { ...worksheet.content, questions: (worksheet.content?.questions || []).map(studentQuestion) },
      assignmentId: assignment.id, className: assignment.class_name,
    }, { headers: { 'Cache-Control': 'no-store' } }, request)
  } catch (error) {
    console.error('Student assignment access error:', error)
    return jsonResponse({ error: publicErrorMessage(error) }, { status: 500 }, request)
  }
}

function deterministicGrade(question, studentAnswer) {
  if (['multiple_choice', 'true_false', 'either_or'].includes(question.type)) return studentAnswer === question.answer
  if (question.type === 'math') return String(studentAnswer || '').trim().replace(/\s/g, '') === String(question.answer || '').trim().replace(/\s/g, '')
  if (question.type === 'fill_blank') {
    const correct = String(question.answer || '').split(',').map((word) => word.trim().toLowerCase())
    const submitted = Array.isArray(studentAnswer) ? studentAnswer.map((word) => String(word || '').trim().toLowerCase()) : []
    return correct.every((word, index) => submitted[index] === word)
  }
  if (question.type === 'ordering') {
    const correct = String(question.answer || '').split(',').map((item) => item.trim().toLowerCase())
    const submitted = Array.isArray(studentAnswer) ? studentAnswer.map((item) => String(item).trim().toLowerCase()) : []
    return correct.length === submitted.length && correct.every((item, index) => item === submitted[index])
  }
  if (question.type === 'matching') {
    const pairs = parseMatchingPairs(question.answer)
    const right = shuffledMatchingRight(question)
    const matches = studentAnswer?.matches || studentAnswer || {}
    const correct = Object.entries(matches).filter(([left, selected]) => right[Number(selected)]?.origIdx === Number(left)).length
    return correct === pairs.length && Object.keys(matches).length === pairs.length
  }
  return null
}

async function gradeOpenQuestions(questions, answers, results, pending) {
  if (!pending.length || !process.env.OPENAI_API_KEY) return
  const prompt = pending.map(({ index, question }) => `Frage: ${question.question}\nMusterlösung: ${question.answer}\nMaximalpunkte: ${question.points || 1}\nAntwort: ${answers[index]}`).join('\n\n---\n\n')
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini', temperature: 0.1,
    messages: [{ role: 'system', content: 'Bewerte altersgerecht. Antworte nur als JSON: {"gradings":[{"pointsAwarded":0,"feedback":"...","isCorrect":false}]}' }, { role: 'user', content: prompt }],
  })
  const match = response.choices[0]?.message?.content?.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Invalid AI grading response')
  const gradings = JSON.parse(match[0]).gradings || []
  pending.forEach(({ index, question }, pendingIndex) => {
    const grading = gradings[pendingIndex]
    if (!grading) return
    const maxPoints = question.points || 1
    const points = Math.min(Math.max(0, Number(grading.pointsAwarded) || 0), maxPoints)
    results[index] = { ...results[index], pointsAwarded: points, feedback: String(grading.feedback || '').slice(0, 500),
      isCorrect: points === maxPoints ? true : points === 0 ? false : 'partial', aiGraded: true, needsManualReview: false }
  })
}

export async function submitStudentAssignment(request) {
  try {
    const parsed = await parseJsonBody(request, studentSubmissionSchema, 128 * 1024)
    if (!parsed.success) return jsonResponse({ error: parsed.error, fields: parsed.fields }, { status: parsed.status }, request)
    const { assignmentCode, studentName, answers, duration } = parsed.data
    const db = await getDatabase()
    const retryAfter = await checkRateLimit(db, request, '/student/submit', 'POST')
    if (retryAfter) {
      const response = jsonResponse({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.' }, { status: 429 }, request)
      response.headers.set('Retry-After', String(retryAfter)); return response
    }
    const session = verifyAuthToken(request)
    const studentId = session?.role === 'student' ? session.studentId : null
    const assignment = await db.collection('assignments').findOne({ code: assignmentCode, status: 'active' })
    if (!assignment) return jsonResponse({ error: 'Aufgabe nicht gefunden oder nicht aktiv.' }, { status: 404 }, request)
    if (assignment.deadline && new Date(assignment.deadline) < new Date()) return jsonResponse({ error: 'Die Abgabefrist ist abgelaufen.' }, { status: 410 }, request)
    if (!await enforceTargetNiveau(db, assignment, session)) return jsonResponse({ error: 'Diese Aufgabe ist nicht für dein Niveau freigegeben.' }, { status: 403 }, request)
    if (studentId && await db.collection('submissions').findOne({ assignment_id: assignment.id, student_id: studentId })) {
      return jsonResponse({ error: 'Du hast diese Aufgabe bereits abgegeben.' }, { status: 409 }, request)
    }
    const worksheet = await db.collection('worksheets').findOne({ id: assignment.worksheet_id })
    if (!worksheet) return jsonResponse({ error: 'Material nicht gefunden.' }, { status: 404 }, request)
    const questions = worksheet.content?.questions || []
    if (answers.length !== questions.length) return jsonResponse({ error: 'Die Anzahl der Antworten ist ungültig.' }, { status: 400 }, request)
    const pending = []
    const results = questions.map((question, index) => {
      const graded = deterministicGrade(question, answers[index])
      if (graded === null && ['open', 'image'].includes(question.type) && String(answers[index] || '').trim()) pending.push({ index, question })
      const maxPoints = question.points || 1
      return { questionNumber: question.number, type: question.type, question: question.question, studentAnswer: answers[index],
        correctAnswer: question.answer, isCorrect: graded, feedback: graded === true ? 'Richtig!' : graded === false ? 'Nicht korrekt.' : null,
        pointsAwarded: graded === true ? maxPoints : graded === false ? 0 : null, maxPoints, aiGraded: false, needsManualReview: graded === null }
    })
    try { await gradeOpenQuestions(questions, answers, results, pending) } catch (error) { console.error('AI grading error:', error) }
    const totalPoints = results.reduce((sum, result) => sum + result.maxPoints, 0)
    const earnedPoints = results.reduce((sum, result) => sum + (result.pointsAwarded ?? 0), 0)
    const scorePercentage = totalPoints ? Math.round(earnedPoints / totalPoints * 100) : 0
    const swissGrade = totalPoints ? Math.round((earnedPoints / totalPoints * 5 + 1) * 2) / 2 : 1
    const needsReview = results.some((result) => result.needsManualReview || result.isCorrect === null)
    const submission = { id: uuidv4(), assignment_id: assignment.id, student_id: studentId, student_name: studentName, answers,
      question_results: results, correct_count: results.filter((result) => result.isCorrect === true).length, total_questions: questions.length,
      total_points: totalPoints, earned_points: earnedPoints, score_percentage: scorePercentage, swiss_grade: swissGrade,
      needs_review: needsReview, duration, submitted_at: new Date() }
    await db.collection('submissions').insertOne(submission)
    if (studentId) {
      let xp = 10 + earnedPoints + (swissGrade >= 5.5 ? 20 : swissGrade >= 4.5 ? 10 : 0) + (scorePercentage === 100 ? 25 : 0)
      await db.collection('students').updateOne({ id: studentId }, { $inc: { total_quizzes: 1, total_points: earnedPoints, xp }, $set: { last_activity: new Date() } })
    }
    return jsonResponse({ correctCount: submission.correct_count, totalQuestions: questions.length, totalPoints, earnedPoints,
      scorePercentage, duration, submissionId: submission.id, questionResults: results.map(({ correctAnswer, ...result }) => result), swissGrade, needsReview }, { status: 201 }, request)
  } catch (error) {
    console.error('Student submission error:', error)
    return jsonResponse({ error: publicErrorMessage(error) }, { status: 500 }, request)
  }
}

export function studentAssignmentOptions(request) { return jsonResponse({}, { status: 200 }, request) }
