import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import OpenAI, { toFile } from 'openai'
import mammoth from 'mammoth'
import pdfParse from 'pdf-parse'
import { getDatabase } from '@/lib/server/database'
import { checkRateLimit } from '@/lib/server/rate-limit'
import {
  applyCorsHeaders,
  publicErrorMessage,
  verifyAuthToken,
} from '@/lib/server/security'
import { prepareWorksheetContent } from '@/lib/server/worksheet-quality'
import { completeGeneration, failGeneration, startGeneration } from '@/lib/server/ai-telemetry'
import { generateOpenAISpeech } from '@/lib/server/openai-service'
import { validateChatToolCall } from '@/lib/chat-tools'
import { deduplicateDossierQuestions, evaluateDossier, prepareDossierSection, validateDossierOutline } from '@/lib/server/dossier-quality'
import { logEvent } from '@/lib/server/logger'
import { normalizeMaterialMetadata } from '@/lib/product-workspace'
import { ACTIVITY_MODES, buildLearningGoalProgress, buildSupportRecommendations, isAssignmentFeedbackVisible, normalizeAssignmentSettings } from '@/lib/learning-workflow'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ALLOWED_UPLOAD_EXTENSIONS = new Set(['pdf', 'docx', 'txt', 'csv', 'rtf', 'pptx', 'xlsx', 'xls'])
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const OPENAI_GENERATION_MODEL = process.env.OPENAI_GENERATION_MODEL || 'gpt-4o'

async function connectToMongo() {
  return getDatabase()
}

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Helper function to handle CORS
function handleCORS(response) {
  return applyCorsHeaders(response)
}

// OPTIONS handler for CORS
export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

// Auth middleware
async function verifyToken(request) {
  return verifyAuthToken(request)
}

async function enforceRateLimit(db, request, route, method) {
  const retryAfter = await checkRateLimit(db, request, route, method)
  if (!retryAfter) return null
  const response = NextResponse.json({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.' }, { status: 429 })
  response.headers.set('Retry-After', String(retryAfter))
  return handleCORS(response)
}

// Swiss curriculum system prompt
function getSystemPrompt(grade, subject, difficulty) {
  const difficultyDescriptions = {
    easy: 'einfach (basic understanding, simple recall)',
    medium: 'mittel (application and analysis)',
    hard: 'schwierig (synthesis and evaluation)'
  }

  return `You are an expert Swiss teacher and meticulous instructional designer creating classroom-ready materials aligned with Lehrplan 21 (Swiss curriculum).

Grade Level: ${grade} (${Number(grade) >= 7 ? 'Sekundarstufe I' : 'Primarschule'})
Subject: ${subject}
Difficulty: ${difficultyDescriptions[difficulty]}

Quality requirements:
- Use precise, natural German suitable for grade ${grade}; avoid generic AI phrasing.
- Test understanding and application, not only recall. Build a deliberate progression from accessible to demanding tasks.
- Every question must be unambiguous, factually defensible and solvable with the supplied information.
- Every answer must be a concrete, complete model solution. Multiple-choice distractors must be plausible but clearly wrong.
- Avoid duplicate questions, trick questions and unsupported claims. For source material, never invent facts beyond the source.
- Align visibly with the requested Lehrplan-21 competency and use Swiss spelling (ss instead of ß).
- Before returning JSON, silently verify question count, solutions, option consistency, point sum and age appropriateness.

Format your response as a JSON object with:
{
  "title": "Worksheet title in German",
  "questions": [
    {
      "number": 1,
      "type": "multiple_choice" | "true_false" | "open" | "math" | "matching" | "fill_blank" | "ordering" | "either_or",
      "question": "Question text",
      "options": ["A", "B", "C", "D"] (for multiple choice only),
      "answer": "Correct answer",
      "points": 1-3
    }
  ],
  "teacher_notes": "Tips for grading and common student mistakes",
  "total_points": sum of all points,
  "estimated_time": "20-30 minutes"
}`
}

function normalizeAIProvider(provider) {
  const selected = String(provider || process.env.DEFAULT_AI_PROVIDER || 'openai').toLowerCase()
  if (selected === 'gemini' || selected === 'openai') return selected
  throw new Error(`Unsupported AI provider: ${provider}`)
}

function getGenerationTaskType(resourceType, sourceText) {
  if (sourceText) return 'source-transformation'
  if (resourceType === 'exam') return 'exam-generation'
  return 'worksheet-generation'
}

function parseJsonObject(content) {
  const raw = String(content || '').trim()
  const withoutFence = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  try {
    return JSON.parse(withoutFence)
  } catch {
    const match = withoutFence.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('AI response did not contain valid JSON.')
    return JSON.parse(match[0])
  }
}

async function generateJsonContent({ provider, messages, taskType, context, temperature = 0.7 }) {
  if (provider === 'gemini') {
    const { generateAI } = await import('@/lib/ai')
    const prompt = messages.map((message) => {
      const content = typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content)
      return `${message.role.toUpperCase()}:\n${content}`
    }).join('\n\n')

    const result = await generateAI({
      provider: 'gemini',
      prompt,
      taskType,
      context,
      options: { temperature }
    })

    return parseJsonObject(result.text)
  }

  const completion = await openai.chat.completions.create({
    model: OPENAI_GENERATION_MODEL,
    messages,
    temperature,
    response_format: { type: 'json_object' }
  })

  return parseJsonObject(completion.choices[0].message.content)
}

async function ensureWorksheetQuality({ content, provider, messages, taskType, context, questionCount }) {
  let prepared = prepareWorksheetContent(content, questionCount)
  if (prepared.quality.passed) return prepared

  const feedback = [...prepared.quality.errors, ...prepared.quality.warnings].join('\n- ')
  const repairedContent = await generateJsonContent({
    provider,
    messages: [
      ...messages,
      { role: 'assistant', content: JSON.stringify(prepared.content) },
      {
        role: 'user',
        content: `Qualitätskontrolle fehlgeschlagen. Korrigiere den Entwurf vollständig und gib nur das komplette JSON zurück. Behalte Thema, Niveau und exakt ${questionCount} Fragen bei.\n\nZu beheben:\n- ${feedback}`,
      },
    ],
    taskType,
    context: { ...context, qualityRepair: true },
    temperature: 0.2,
  })

  prepared = prepareWorksheetContent(repairedContent, questionCount)
  if (!prepared.quality.passed) {
    console.error('Worksheet quality gate rejected AI output:', prepared.quality)
    throw new Error('Der KI-Entwurf hat die Qualitätskontrolle nicht bestanden. Bitte erneut versuchen.')
  }
  return prepared
}

async function saveGeneratedWorksheet({
  db,
  user,
  content,
  topic,
  grade,
  subject,
  difficulty,
  questionCount,
  resourceType,
  aiProvider
}) {
  const prepared = prepareWorksheetContent(content, questionCount || 10)
  if (!prepared.quality.passed) {
    console.error('Refusing to save low-quality worksheet:', prepared.quality)
    throw new Error('Der KI-Entwurf hat die Qualitätskontrolle nicht bestanden. Bitte erneut versuchen.')
  }
  const checkedContent = prepared.content
  const worksheet = {
    id: uuidv4(),
    user_id: user.id,
    title: checkedContent.title,
    topic,
    grade,
    subject,
    difficulty,
    resourceType: resourceType || 'worksheet',
    question_count: questionCount || 10,
    ai_provider: aiProvider,
    content: {
      ...checkedContent,
      resourceType: resourceType || 'worksheet',
      quality: {
        score: prepared.quality.score,
        warnings: prepared.quality.warnings,
        checked_at: new Date().toISOString(),
      },
    },
    status: 'review',
    revision: 1,
    archived: false,
    favorite: false,
    tags: [],
    folder: '',
    created_at: new Date(),
    updated_at: new Date(),
  }

  await db.collection('worksheets').insertOne(worksheet)
  await db.collection('users').updateOne(
    { id: user.id },
    { $inc: { worksheets_used_this_month: 1 } }
  )

  return worksheet
}

// ============================================================
// FILE EXTRACTION HELPERS
// ============================================================

/**
 * Extract structured text from a file buffer based on file type.
 * Returns { text, sections[], method, pageCount? }
 */
async function extractFileContent(buffer, fileName, fileType, fileSize) {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''

  // --- DOCX ---
  if (ext === 'docx' || fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try {
      const result = await mammoth.convertToHtml({ buffer })
      const html = result.value || ''
      const sections = parseHtmlToSections(html)
      const plainText = sections.map(s => s.content).join('\n\n')
      return { text: plainText, sections, method: 'mammoth-docx', warnings: result.messages?.filter(m => m.type === 'warning').map(m => m.message) || [] }
    } catch (e) {
      return { text: '', sections: [], method: 'docx-failed', error: e.message }
    }
  }

  // --- PDF (text layer first, Vision fallback) ---
  if (ext === 'pdf' || fileType === 'application/pdf') {
    try {
      const pdfData = await pdfParse(buffer)
      const rawText = (pdfData.text || '').trim()
      // If PDF has a real text layer (not scanned)
      if (rawText.length > 50) {
        const cleaned = cleanExtractedText(rawText)
        const sections = splitTextIntoSections(cleaned)
        return { text: cleaned, sections, method: 'pdf-text-layer', pageCount: pdfData.numpages }
      }
      // Weak text layer → flag for OCR/Vision fallback
      return { text: rawText, sections: [], method: 'pdf-needs-ocr', pageCount: pdfData.numpages }
    } catch (e) {
      return { text: '', sections: [], method: 'pdf-needs-ocr', error: e.message }
    }
  }

  // --- Plain text / CSV ---
  if (ext === 'txt' || ext === 'csv' || fileType === 'text/plain' || fileType === 'text/csv') {
    const raw = buffer.toString('utf-8')
    const cleaned = cleanExtractedText(raw)
    const sections = ext === 'csv' ? [{ type: 'table', content: cleaned }] : splitTextIntoSections(cleaned)
    return { text: cleaned, sections, method: 'text-direct' }
  }

  // --- RTF ---
  if (ext === 'rtf') {
    const raw = buffer.toString('utf-8').replace(/\\[a-z]+\d*\s?/g, '').replace(/[{}]/g, '')
    const cleaned = cleanExtractedText(raw)
    const sections = splitTextIntoSections(cleaned)
    return { text: cleaned, sections, method: 'rtf-stripped' }
  }

  // --- PPTX (basic XML extraction) ---
  if (ext === 'pptx' || fileType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    try {
      // PPTX is a ZIP; extract slide XML text
      const text = extractTextFromZipXml(buffer)
      const cleaned = cleanExtractedText(text)
      const sections = splitTextIntoSections(cleaned)
      return { text: cleaned, sections, method: 'pptx-xml' }
    } catch (e) {
      return { text: '', sections: [], method: 'pptx-failed', error: e.message }
    }
  }

  // --- XLSX / XLS ---
  if (ext === 'xlsx' || ext === 'xls' || fileType?.includes('spreadsheet')) {
    try {
      const text = extractTextFromZipXml(buffer)
      const cleaned = cleanExtractedText(text)
      return { text: cleaned, sections: [{ type: 'table', content: cleaned }], method: 'xlsx-xml' }
    } catch (e) {
      return { text: '', sections: [], method: 'xlsx-failed', error: e.message }
    }
  }

  // --- Images → always OCR/Vision ---
  if (fileType?.startsWith('image/')) {
    return { text: '', sections: [], method: 'image-needs-ocr' }
  }

  return { text: '', sections: [], method: 'unsupported' }
}

/**
 * Basic ZIP XML text extraction for OOXML formats (PPTX, XLSX).
 * Extracts text content from XML files inside the ZIP archive.
 */
function extractTextFromZipXml(buffer) {
  // Simple approach: find XML text between tags in the raw buffer
  const raw = buffer.toString('utf-8', 0, Math.min(buffer.length, 500000))
  const textParts = []
  // Match <a:t>...</a:t> (PowerPoint text) and <t>...</t> (Excel shared strings)
  const regex = /<(?:a:t|t|w:t)[^>]*>([^<]+)<\/(?:a:t|t|w:t)>/g
  let match
  while ((match = regex.exec(raw)) !== null) {
    const text = match[1].trim()
    if (text.length > 0) textParts.push(text)
  }
  return textParts.join(' ')
}

/**
 * Parse HTML (from mammoth) into structured sections
 */
function parseHtmlToSections(html) {
  const sections = []
  // Split on headings
  const parts = html.split(/(<h[1-6][^>]*>.*?<\/h[1-6]>)/gi)
  let currentHeading = null

  for (const part of parts) {
    const headingMatch = part.match(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/i)
    if (headingMatch) {
      currentHeading = stripHtml(headingMatch[2])
      sections.push({ type: 'heading', level: parseInt(headingMatch[1]), content: currentHeading })
    } else if (part.trim()) {
      // Check for tables
      if (part.includes('<table')) {
        sections.push({ type: 'table', content: stripHtml(part), parent_heading: currentHeading })
      }
      // Check for lists
      else if (part.includes('<li')) {
        const items = [...part.matchAll(/<li[^>]*>(.*?)<\/li>/gi)].map(m => stripHtml(m[1]))
        sections.push({ type: 'list', content: items.join('\n• '), items, parent_heading: currentHeading })
      }
      // Regular paragraph text
      else {
        const text = stripHtml(part).trim()
        if (text.length > 5) {
          sections.push({ type: 'paragraph', content: text, parent_heading: currentHeading })
        }
      }
    }
  }
  return sections
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
}

/**
 * Clean extracted raw text: remove noise, repeated headers/footers, page numbers
 */
function cleanExtractedText(text) {
  let cleaned = text
    // Remove page numbers (standalone numbers on lines, common patterns)
    .replace(/^\s*-?\s*\d{1,3}\s*-?\s*$/gm, '')
    .replace(/^\s*Seite\s+\d+\s*(von\s+\d+)?\s*$/gmi, '')
    .replace(/^\s*Page\s+\d+\s*(of\s+\d+)?\s*$/gmi, '')
    // Remove repeated header/footer patterns (lines that appear 3+ times)
    .replace(/\f/g, '\n') // form feeds
    // Collapse excessive whitespace
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]{3,}/g, '  ')
    .trim()

  // Detect and remove repeated lines (headers/footers appearing on every page)
  const lines = cleaned.split('\n')
  const lineCounts = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length > 3 && trimmed.length < 100) {
      lineCounts[trimmed] = (lineCounts[trimmed] || 0) + 1
    }
  }
  const repeatedLines = new Set(Object.entries(lineCounts).filter(([, count]) => count >= 3).map(([line]) => line))
  if (repeatedLines.size > 0) {
    cleaned = lines.filter(l => !repeatedLines.has(l.trim())).join('\n')
  }

  return cleaned.substring(0, 15000) // generous but bounded
}

/**
 * Split plain text into rough sections based on blank lines and heading patterns
 */
function splitTextIntoSections(text) {
  const sections = []
  const blocks = text.split(/\n\s*\n/)
  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed) continue
    // Detect headings: short lines, possibly uppercase or ending with ':'
    const lines = trimmed.split('\n')
    if (lines.length === 1 && trimmed.length < 80 && (trimmed === trimmed.toUpperCase() || trimmed.endsWith(':'))) {
      sections.push({ type: 'heading', content: trimmed })
    }
    // Detect lists
    else if (lines.every(l => /^\s*[-•*]\s/.test(l) || /^\s*\d+[.)]\s/.test(l))) {
      sections.push({ type: 'list', content: trimmed, items: lines.map(l => l.replace(/^\s*[-•*\d.)]+\s*/, '').trim()) })
    }
    // Regular paragraph
    else {
      sections.push({ type: 'paragraph', content: trimmed })
    }
  }
  return sections
}

/**
 * Build the intermediate structured document from extraction + AI analysis
 */
function buildStructuredSource(extraction, aiAnalysis, fileName) {
  // Build structured content blocks from sections
  const content_blocks = extraction.sections.map(section => {
    // Map exercise type from Vision/OCR and detect exercise/question patterns
    if (section.type === 'exercise' || (section.type === 'paragraph' && /^(\d+[\.)]\s|Aufgabe|Frage|Exercise|Task)/i.test(section.content))) {
      return { type: 'question', content: section.content, parent_heading: section.parent_heading || null }
    }
    // Normalize heading → text for content blocks
    const type = section.type === 'heading' ? 'text' : section.type
    return { type, content: section.content, parent_heading: section.parent_heading || null }
  }).filter(b => b.content && b.content.trim().length > 0)

  return {
    document_title: aiAnalysis?.title || fileName,
    detected_subject: aiAnalysis?.subject || null,
    detected_grade: aiAnalysis?.grade_suggestion || null,
    extraction_method: extraction.method,
    page_count: extraction.pageCount || null,
    content_quality: extraction.text.length > 200 ? 'good' : extraction.text.length > 20 ? 'partial' : 'weak',
    content_blocks,
    sections: extraction.sections.slice(0, 50),
    full_text: extraction.text.substring(0, 12000),
    key_topics: aiAnalysis?.key_topics || [],
    content_summary: aiAnalysis?.content_summary || '',
    difficulty_suggestion: aiAnalysis?.difficulty_suggestion || 'medium',
    material_type_suggestion: aiAnalysis?.material_type_suggestion || 'worksheet',
  }
}

// Route handler function
async function handleRoute(request, { params }) {
  const { path = [] } = await params
  const route = `/${path.join('/')}`
  const method = request.method
  const requestStartedAt = Date.now()
  const requestId = request.headers.get('x-vercel-id') || request.headers.get('x-request-id') || uuidv4()
  logEvent('info', 'api.request.started', { requestId, route, method })

  try {
    const db = await connectToMongo()
    const rateLimitedResponse = await enforceRateLimit(db, request, route, method)
    if (rateLimitedResponse) return rateLimitedResponse

    // Root endpoint
    if (route === '/' && method === 'GET') {
      return handleCORS(NextResponse.json({ message: "TeacherTime API v1.0" }))
    }

    // ========== STUDENT AUTH ==========

    // Get student's submissions history - GET /api/student/my-results
    if (route === '/student/my-results' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded || decoded.role !== 'student') {
        return handleCORS(NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 }))
      }

      const submissions = await db.collection('submissions').find({ student_id: decoded.studentId }).sort({ submitted_at: -1 }).toArray()
      const assignmentIds = [...new Set(submissions.map((submission) => submission.assignment_id))]
      const assignments = await db.collection('assignments').find({ id: { $in: assignmentIds } }).toArray()
      const assignmentMap = new Map(assignments.map((assignment) => [assignment.id, assignment]))

      const enriched = submissions.map((sub) => {
        const { _id, ...clean } = sub
        const assignment = assignmentMap.get(clean.assignment_id)
        const settings = normalizeAssignmentSettings(assignment || clean)
        const feedbackVisible = assignment ? isAssignmentFeedbackVisible(assignment) : true
        clean.assignment_title = assignment?.worksheet_title || 'Unbenannt'
        clean.class_name = assignment?.class_name || ''
        clean.subject = assignment?.subject || ''
        clean.activity_type = settings.activityType
        clean.activity_label = ACTIVITY_MODES[settings.activityType].label
        clean.learning_goals = settings.learningGoals
        clean.feedback_pending = !feedbackVisible
        // Calculate Swiss grade
        if (!clean.swiss_grade && clean.total_points > 0) {
          clean.swiss_grade = Math.round((clean.earned_points / clean.total_points * 5 + 1) * 2) / 2
        }
        if (!feedbackVisible) {
          clean.earned_points = null
          clean.score_percentage = null
          clean.swiss_grade = null
          clean.question_results = []
        } else if (!settings.graded) {
          clean.swiss_grade = null
        }
        return clean
      })

      // Calculate stats
      const totalQuizzes = enriched.length
      const totalPoints = enriched.reduce((sum, s) => sum + (s.earned_points || 0), 0)
      const visibleScores = enriched.filter((submission) => Number.isFinite(submission.score_percentage))
      const visibleGrades = enriched.filter((submission) => Number.isFinite(submission.swiss_grade))
      const avgScore = visibleScores.length ? Math.round(visibleScores.reduce((sum, s) => sum + s.score_percentage, 0) / visibleScores.length) : 0
      const avgGrade = visibleGrades.length ? Math.round(visibleGrades.reduce((sum, s) => sum + s.swiss_grade, 0) / visibleGrades.length * 10) / 10 : 0
      const bestGrade = visibleGrades.length ? Math.max(...visibleGrades.map(s => s.swiss_grade)) : 0
      const visibleGoalSubmissions = submissions.filter((submission) => {
        const assignment = assignmentMap.get(submission.assignment_id)
        return !assignment || isAssignmentFeedbackVisible(assignment)
      })
      const learningGoals = buildLearningGoalProgress(assignments, visibleGoalSubmissions)

      return handleCORS(NextResponse.json({
        submissions: enriched,
        stats: { totalQuizzes, totalPoints, avgScore, avgGrade, bestGrade },
        learningGoals,
        recommendations: buildSupportRecommendations(learningGoals),
      }))
    }

    // ========== SCHÜLER ↔ KLASSE VERKNÜPFUNG ==========

    // Join a class by code - POST /api/student/join-class
    if (route === '/student/join-class' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded || decoded.role !== 'student') {
        return handleCORS(NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 }))
      }
      const body = await request.json()
      const { joinCode } = body
      if (!joinCode) return handleCORS(NextResponse.json({ error: 'Klassencode erforderlich.' }, { status: 400 }))
      const cls = await db.collection('classes').findOne({ join_code: joinCode.toUpperCase().trim() })
      if (!cls) return handleCORS(NextResponse.json({ error: 'Klasse nicht gefunden. Prüfe den Code.' }, { status: 404 }))
      // Check if already enrolled
      const alreadyEnrolled = (cls.enrolled_students || []).some(s => s.student_id === decoded.studentId)
      if (alreadyEnrolled) return handleCORS(NextResponse.json({ error: 'Du bist bereits in dieser Klasse.' }, { status: 400 }))
      const student = await db.collection('students').findOne({ id: decoded.studentId })
      // Add to class
      const enrollment = { student_id: decoded.studentId, display_name: student?.display_name || 'Unbekannt', joined_at: new Date(), niveau: 'B' }
      await db.collection('classes').updateOne({ id: cls.id }, { $push: { enrolled_students: enrollment }, $set: { updated_at: new Date() } })
      // Add to student's enrolled_classes
      const classRef = { class_id: cls.id, class_name: cls.name, teacher_id: cls.teacher_id, joined_at: new Date() }
      await db.collection('students').updateOne({ id: decoded.studentId }, { $push: { enrolled_classes: classRef } })
      return handleCORS(NextResponse.json({ success: true, className: cls.name }))
    }

    // Leave a class - POST /api/student/leave-class
    if (route === '/student/leave-class' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded || decoded.role !== 'student') {
        return handleCORS(NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 }))
      }
      const body = await request.json()
      const { classId } = body
      await db.collection('classes').updateOne({ id: classId }, {
        $pull: { enrolled_students: { student_id: decoded.studentId } },
        $set: { updated_at: new Date() }
      })
      await db.collection('students').updateOne({ id: decoded.studentId }, { $pull: { enrolled_classes: { class_id: classId } } })
      return handleCORS(NextResponse.json({ success: true }))
    }

    // Get student's enrolled classes - GET /api/student/my-classes
    if (route === '/student/my-classes' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded || decoded.role !== 'student') {
        return handleCORS(NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 }))
      }
      const student = await db.collection('students').findOne({ id: decoded.studentId })
      const enrolledClasses = student?.enrolled_classes || []
      // Enrich with teacher name and class details
      const enriched = await Promise.all(enrolledClasses.map(async (ec) => {
        const cls = await db.collection('classes').findOne({ id: ec.class_id })
        const teacher = await db.collection('users').findOne({ id: ec.teacher_id })
        const myEnrollment = (cls?.enrolled_students || []).find(s => s.student_id === decoded.studentId)
        return {
          ...ec,
          class_name: cls?.name || ec.class_name,
          teacher_name: teacher?.name || 'Lehrperson',
          student_count: (cls?.enrolled_students || []).length,
          niveau: myEnrollment?.niveau || 'B'
        }
      }))
      return handleCORS(NextResponse.json(enriched))
    }

    // ========== GAMIFICATION ==========

    // Get student gamification profile - GET /api/student/gamification
    if (route === '/student/gamification' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded || decoded.role !== 'student') {
        return handleCORS(NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 }))
      }
      const student = await db.collection('students').findOne({ id: decoded.studentId })
      if (!student) return handleCORS(NextResponse.json({ error: 'Schüler nicht gefunden.' }, { status: 404 }))

      const xp = student.xp || 0
      const level = Math.floor(xp / 100) + 1
      const xpInLevel = xp % 100
      const xpForNext = 100

      // Calculate streak
      const submissions = await db.collection('submissions').find({ student_id: decoded.studentId }).sort({ submitted_at: -1 }).toArray()
      let streak = 0
      if (submissions.length > 0) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const dates = [...new Set(submissions.map(s => {
          const d = new Date(s.submitted_at)
          d.setHours(0, 0, 0, 0)
          return d.getTime()
        }))].sort((a, b) => b - a)
        // Check if today or yesterday has activity
        const dayMs = 86400000
        if (dates[0] >= today.getTime() - dayMs) {
          streak = 1
          for (let i = 1; i < dates.length; i++) {
            if (dates[i - 1] - dates[i] <= dayMs) streak++
            else break
          }
        }
      }

      // Check & award badges
      const badges = student.badges || []
      const badgeDefs = [
        { id: 'first_quiz', name: 'Erste Schritte', desc: 'Erste Prüfung abgeschlossen', icon: '🎯', check: () => submissions.length >= 1 },
        { id: 'five_quizzes', name: 'Fleissig', desc: '5 Prüfungen abgeschlossen', icon: '📚', check: () => submissions.length >= 5 },
        { id: 'ten_quizzes', name: 'Quiz-Meister', desc: '10 Prüfungen abgeschlossen', icon: '🏆', check: () => submissions.length >= 10 },
        { id: 'perfect_score', name: 'Perfekt!', desc: 'Eine Prüfung mit 100% abgeschlossen', icon: '⭐', check: () => submissions.some(s => s.score_percentage === 100) },
        { id: 'grade_6', name: 'Bestnote', desc: 'Note 6 erreicht', icon: '🌟', check: () => submissions.some(s => s.swiss_grade === 6) },
        { id: 'streak_3', name: 'Am Ball', desc: '3 Tage Streak', icon: '🔥', check: () => streak >= 3 },
        { id: 'streak_7', name: 'Wochenstreak', desc: '7 Tage Streak', icon: '💪', check: () => streak >= 7 },
        { id: 'streak_30', name: 'Monatsstreak', desc: '30 Tage Streak', icon: '🏅', check: () => streak >= 30 },
        { id: 'points_500', name: 'Punktesammler', desc: '500 Punkte gesammelt', icon: '💎', check: () => (student.total_points || 0) >= 500 },
        { id: 'points_1000', name: 'Punktekönig', desc: '1000 Punkte gesammelt', icon: '👑', check: () => (student.total_points || 0) >= 1000 },
        { id: 'fast_finish', name: 'Blitzschnell', desc: 'Prüfung in unter 2 Min. abgeschlossen', icon: '⚡', check: () => submissions.some(s => s.duration && s.duration < 120) },
        { id: 'improver', name: 'Aufsteiger', desc: 'Note verbessert gegenüber letztem Versuch', icon: '📈', check: () => {
          if (submissions.length < 2) return false
          return submissions[0].swiss_grade > submissions[1].swiss_grade
        }}
      ]
      const newBadges = []
      badgeDefs.forEach(bd => {
        if (!badges.find(b => b.id === bd.id) && bd.check()) {
          newBadges.push({ id: bd.id, name: bd.name, desc: bd.desc, icon: bd.icon, earned_at: new Date() })
        }
      })
      const allBadges = [...badges, ...newBadges]

      // Update student with computed gamification data
      await db.collection('students').updateOne({ id: decoded.studentId }, {
        $set: { xp, level, streak, badges: allBadges, last_activity: new Date() }
      })

      // Class leaderboard (all classes the student is in)
      let leaderboard = []
      const enrolledClasses = student.enrolled_classes || []
      if (enrolledClasses.length > 0) {
        const classIds = enrolledClasses.map(c => c.class_id)
        const classes = await db.collection('classes').find({ id: { $in: classIds } }).toArray()
        const allStudentIds = [...new Set(classes.flatMap(c => (c.enrolled_students || []).map(s => s.student_id)))]
        const allStudents = await db.collection('students').find({ id: { $in: allStudentIds } }).toArray()
        leaderboard = allStudents
          .map(s => ({ id: s.id, name: s.display_name, xp: s.xp || 0, level: Math.floor((s.xp || 0) / 100) + 1, streak: s.streak || 0 }))
          .sort((a, b) => b.xp - a.xp)
          .slice(0, 20)
      }

      return handleCORS(NextResponse.json({
        xp, level, xpInLevel, xpForNext, streak,
        badges: allBadges,
        allBadgeDefs: badgeDefs.map(b => ({ id: b.id, name: b.name, desc: b.desc, icon: b.icon, earned: allBadges.some(ab => ab.id === b.id) })),
        newBadges,
        leaderboard,
        totalQuizzes: student.total_quizzes || 0,
        totalPoints: student.total_points || 0
      }))
    }

    // Delete a student's own submission - DELETE /api/student/submissions/:id
    if (route.match(/^\/student\/submissions\/[^/]+$/) && method === 'DELETE') {
      const decoded = await verifyToken(request)
      if (!decoded || decoded.role !== 'student') {
        return handleCORS(NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 }))
      }
      const submissionId = path[2] // path = ['student', 'submissions', ':id']
      const submission = await db.collection('submissions').findOne({ id: submissionId })
      if (!submission) {
        return handleCORS(NextResponse.json({ error: 'Abgabe nicht gefunden.' }, { status: 404 }))
      }
      // Only allow deleting own submissions
      if (submission.student_id !== decoded.studentId) {
        return handleCORS(NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 }))
      }
      await db.collection('submissions').deleteOne({ id: submissionId })
      return handleCORS(NextResponse.json({ success: true }))
    }

    // ========== AI-LERNCOACH ==========

    // Analyze student weaknesses and generate practice exercises - POST /api/student/learning-coach
    if (route === '/student/learning-coach' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded || decoded.role !== 'student') {
        return handleCORS(NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 }))
      }

      // Get all student submissions with worksheet data
      const submissions = await db.collection('submissions').find({ student_id: decoded.studentId }).sort({ submitted_at: -1 }).toArray()
      if (submissions.length === 0) return handleCORS(NextResponse.json({ weaknesses: [], exercises: [], competencyMap: {}, message: 'Noch keine Prüfungen abgeschlossen. Starte eine Aufgabe um deinen Lerncoach zu aktivieren!' }))

      // Enrich submissions with worksheet data
      const assignmentIds = [...new Set(submissions.map(s => s.assignment_id))]
      const assignments = await db.collection('assignments').find({ id: { $in: assignmentIds } }).toArray()
      const worksheetIds = [...new Set(assignments.map(a => a.worksheet_id))]
      const worksheets = await db.collection('worksheets').find({ id: { $in: worksheetIds } }).toArray()
      const wsMap = {}; worksheets.forEach(w => { wsMap[w.id] = w })
      const aMap = {}; assignments.forEach(a => { aMap[a.id] = a })

      // Analyze weaknesses per topic/question-type
      const topicErrors = {} // { topic: { total, wrong, questions[], subject, grade } }
      const typeErrors = {}  // { questionType: { total, wrong } }

      submissions.forEach(sub => {
        const assignment = aMap[sub.assignment_id]
        const worksheet = assignment ? wsMap[assignment.worksheet_id] : null
        const topic = worksheet?.topic || 'Unbekannt'
        const subject = worksheet?.subject || 'Unbekannt'
        const grade = worksheet?.grade || ''

        ;(sub.question_results || []).forEach(qr => {
          // Topic analysis
          if (!topicErrors[topic]) topicErrors[topic] = { total: 0, wrong: 0, partial: 0, questions: [], subject, grade }
          topicErrors[topic].total++
          if (qr.isCorrect === false) {
            topicErrors[topic].wrong++
            topicErrors[topic].questions.push({ question: qr.question, studentAnswer: qr.studentAnswer, correctAnswer: qr.correctAnswer, feedback: qr.feedback, type: qr.type })
          } else if (qr.isCorrect === 'partial') {
            topicErrors[topic].partial++
          }

          // Type analysis
          const t = qr.type || 'unknown'
          if (!typeErrors[t]) typeErrors[t] = { total: 0, wrong: 0 }
          typeErrors[t].total++
          if (qr.isCorrect === false) typeErrors[t].wrong++
        })
      })

      // Rank weaknesses by error rate (min 2 questions answered)
      const weaknesses = Object.entries(topicErrors)
        .filter(([_, v]) => v.total >= 2)
        .map(([topic, v]) => ({
          topic,
          subject: v.subject,
          grade: v.grade,
          errorRate: Math.round(((v.wrong + v.partial * 0.5) / v.total) * 100),
          totalQuestions: v.total,
          wrongAnswers: v.wrong,
          sampleErrors: v.questions.slice(0, 3) // top 3 example errors
        }))
        .sort((a, b) => b.errorRate - a.errorRate)
        .slice(0, 5) // top 5 weaknesses

      // Build competency progress map from submissions
      const competencyMap = {}
      submissions.forEach(sub => {
        const assignment = aMap[sub.assignment_id]
        const worksheet = assignment ? wsMap[assignment.worksheet_id] : null
        if (!worksheet) return
        const key = `${worksheet.subject}|${worksheet.topic}`
        if (!competencyMap[key]) {
          competencyMap[key] = { subject: worksheet.subject, topic: worksheet.topic, grade: worksheet.grade, attempts: 0, totalScore: 0, bestGrade: 0, latestGrade: 0, trend: 'stable' }
        }
        competencyMap[key].attempts++
        competencyMap[key].totalScore += sub.score_percentage || 0
        competencyMap[key].bestGrade = Math.max(competencyMap[key].bestGrade, sub.swiss_grade || 1)
        competencyMap[key].latestGrade = sub.swiss_grade || 1
      })
      // Calculate trends
      Object.values(competencyMap).forEach(cm => {
        cm.avgScore = Math.round(cm.totalScore / cm.attempts)
        if (cm.attempts >= 2) {
          cm.trend = cm.latestGrade > cm.bestGrade - 0.5 ? 'improving' : cm.latestGrade < cm.bestGrade - 1 ? 'declining' : 'stable'
        }
      })

      // Generate AI exercises for top weaknesses
      let exercises = []
      if (weaknesses.length > 0) {
        try {
          const weaknessPrompt = weaknesses.slice(0, 3).map(w =>
            `Thema: "${w.topic}" (${w.subject}, ${w.grade}. Klasse) — ${w.errorRate}% Fehlerquote\nBeispiel-Fehler:\n${w.sampleErrors.map(e => `  Frage: "${e.question}"\n  Schüler-Antwort: "${e.studentAnswer}"\n  Korrekt: "${e.correctAnswer}"`).join('\n')}`
          ).join('\n\n')

          const exerciseRes = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.7,
            messages: [
              {
                role: 'system',
                content: `Du bist ein erfahrener Schweizer Lerncoach. Erstelle personalisierte Übungsaufgaben basierend auf den Schwächen eines Schülers.

Antworte NUR mit validem JSON in diesem Format:
{
  "exercises": [
    {
      "topic": "Themenname",
      "subject": "Fach",
      "difficulty": "leicht|mittel|schwer",
      "question": "Die Übungsfrage",
      "type": "multiple_choice|open|true_false|fill_blank",
      "options": ["A", "B", "C", "D"] oder null,
      "answer": "Die korrekte Antwort",
      "hint": "Ein hilfreicher Tipp für den Schüler",
      "explanation": "Erklärung warum die Antwort richtig ist"
    }
  ],
  "encouragement": "Eine persönliche, ermutigende Nachricht an den Schüler",
  "focusAreas": ["Bereich 1", "Bereich 2"]
}

Regeln:
- Erstelle 3-5 Übungen pro Schwäche, aufsteigend im Schwierigkeitsgrad
- Beginne mit einfacheren Aufgaben um Erfolgserlebnisse zu schaffen
- Hints sollen helfen ohne die Antwort zu verraten
- Feedback soll ermutigend und altersgerecht sein (Schweizer Schulsystem)
- Sprache: Deutsch (Schweizer Hochdeutsch)`
              },
              {
                role: 'user',
                content: `Erstelle Übungsaufgaben für folgende Schwächen:\n\n${weaknessPrompt}`
              }
            ],
            max_tokens: 2000
          })

          const aiText = exerciseRes.choices[0]?.message?.content || ''
          const jsonMatch = aiText.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            exercises = parsed.exercises || []
            // Store generated exercises in DB for later access
            await db.collection('learning_coach').updateOne(
              { student_id: decoded.studentId },
              { $set: {
                student_id: decoded.studentId,
                exercises,
                weaknesses,
                competencyMap: Object.values(competencyMap),
                encouragement: parsed.encouragement || '',
                focusAreas: parsed.focusAreas || [],
                generated_at: new Date()
              }},
              { upsert: true }
            )
          }
        } catch (aiErr) {
          console.error('Learning coach AI error:', aiErr)
        }
      }

      // If no new exercises generated, try to return cached ones
      if (exercises.length === 0) {
        const cached = await db.collection('learning_coach').findOne({ student_id: decoded.studentId })
        if (cached) exercises = cached.exercises || []
      }

      return handleCORS(NextResponse.json({
        weaknesses,
        exercises,
        competencyMap: Object.values(competencyMap),
        typeErrors: Object.entries(typeErrors).map(([type, v]) => ({ type, total: v.total, wrong: v.wrong, errorRate: v.total > 0 ? Math.round((v.wrong / v.total) * 100) : 0 })),
        totalSubmissions: submissions.length,
        overallAvg: Math.round(submissions.reduce((s, sub) => s + (sub.score_percentage || 0), 0) / submissions.length)
      }))
    }

    // Mark a learning coach exercise as completed - POST /api/student/learning-coach/complete
    if (route === '/student/learning-coach/complete' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded || decoded.role !== 'student') {
        return handleCORS(NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 }))
      }
      const body = await request.json()
      const { exerciseIndex, studentAnswer, isCorrect } = body

      // Award XP for practice
      const xpEarned = isCorrect ? 8 : 3 // XP for trying, bonus for correct
      await db.collection('students').updateOne(
        { id: decoded.studentId },
        { $inc: { xp: xpEarned, practice_count: 1 }, $set: { last_activity: new Date() } }
      )

      // Track completed exercises
      await db.collection('learning_coach').updateOne(
        { student_id: decoded.studentId },
        { $push: { completed_exercises: { index: exerciseIndex, answer: studentAnswer, correct: isCorrect, completed_at: new Date() } } }
      )

      return handleCORS(NextResponse.json({ success: true, xpEarned }))
    }

    // Get assignments for student's enrolled classes - GET /api/student/class-assignments
    if (route === '/student/class-assignments' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded || decoded.role !== 'student') {
        return handleCORS(NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 }))
      }
      const student = await db.collection('students').findOne({ id: decoded.studentId })
      const enrolledClasses = student?.enrolled_classes || []
      if (enrolledClasses.length === 0) return handleCORS(NextResponse.json([]))

      const classIds = enrolledClasses.map(c => c.class_id)
      // Find all active assignments for these classes
      const assignments = await db.collection('assignments').find({
        class_id: { $in: classIds },
        status: 'active'
      }).sort({ created_at: -1 }).toArray()

      const [mySubmissions, classes, worksheets] = await Promise.all([
        db.collection('submissions').find({ student_id: decoded.studentId, assignment_id: { $in: assignments.map((assignment) => assignment.id) } }).toArray(),
        db.collection('classes').find({ id: { $in: classIds } }).toArray(),
        db.collection('worksheets').find({ id: { $in: assignments.map((assignment) => assignment.worksheet_id) } }).project({ id: 1, subject: 1, topic: 1 }).toArray(),
      ])
      const attemptMap = new Map()
      for (const submission of mySubmissions) attemptMap.set(submission.assignment_id, (attemptMap.get(submission.assignment_id) || 0) + 1)
      const worksheetMap = new Map(worksheets.map((worksheet) => [worksheet.id, worksheet]))

      // Get student's niveau per class
      const niveauMap = {}
      classes.forEach(cls => {
        const enrolled = (cls.enrolled_students || []).find(s => s.student_id === decoded.studentId)
        if (enrolled) niveauMap[cls.id] = enrolled.niveau || 'B'
      })

      const enriched = assignments
        .filter(a => {
          // Filter by niveau: show if no target_niveau set, or if student's niveau matches
          if (!a.target_niveau) return true
          const studentNiveau = niveauMap[a.class_id] || 'B'
          return a.target_niveau === studentNiveau
        })
        .map(a => {
          const cls = classes.find(c => c.id === a.class_id)
          const settings = normalizeAssignmentSettings(a)
          const attemptCount = attemptMap.get(a.id) || 0
          const worksheet = worksheetMap.get(a.worksheet_id)
          const expired = Boolean(a.deadline && new Date(a.deadline) < new Date())
          return {
            id: a.id,
            code: a.code,
            title: a.worksheet_title,
            class_name: cls?.name || a.class_name,
            class_id: a.class_id,
            target_niveau: a.target_niveau,
            deadline: a.deadline,
            created_at: a.created_at,
            subject: a.subject || worksheet?.subject || '', topic: a.topic || worksheet?.topic || '', unit: settings.unit,
            activity_type: settings.activityType, activity_label: ACTIVITY_MODES[settings.activityType].label,
            learning_goals: settings.learningGoals, instructions: settings.instructions,
            max_attempts: settings.maxAttempts, attempt_count: attemptCount,
            already_submitted: attemptCount > 0, can_retry: !expired && attemptCount < settings.maxAttempts, expired,
            time_limit_minutes: settings.timeLimitMinutes,
            feedback_pending: attemptCount > 0 && !isAssignmentFeedbackVisible(a),
            access_url: a.access_url,
          }
        }).sort((a, b) => {
          if (a.already_submitted !== b.already_submitted) return a.already_submitted ? 1 : -1
          if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline)
          if (a.deadline) return -1
          if (b.deadline) return 1
          return String(a.class_name).localeCompare(String(b.class_name), 'de') || String(a.title).localeCompare(String(b.title), 'de')
        })

      return handleCORS(NextResponse.json(enriched))
    }

    // ========== LEARNING ANALYTICS DASHBOARD ==========

    // Teacher: Aggregated analytics across all classes - GET /api/analytics/dashboard
    if (route === '/analytics/dashboard' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))

      // Load all teacher's classes, assignments, submissions, worksheets
      const classes = await db.collection('classes').find({ teacher_id: decoded.userId }).toArray()
      const assignments = await db.collection('assignments').find({ teacher_id: decoded.userId }).toArray()
      if (assignments.length === 0) {
        return handleCORS(NextResponse.json({
          overview: { totalStudents: 0, totalAssignments: 0, totalSubmissions: 0, avgScore: 0, avgGrade: 0, passRate: 0 },
          scoreDistribution: [], performanceOverTime: [], subjectPerformance: [],
          questionTypeAnalysis: [], classComparison: [], weakTopics: [], studentRanking: []
        }))
      }

      const assignmentIds = assignments.map(a => a.id)
      const worksheetIds = [...new Set(assignments.map(a => a.worksheet_id))]
      const submissions = await db.collection('submissions').find({ assignment_id: { $in: assignmentIds } }).toArray()
      const worksheets = await db.collection('worksheets').find({ id: { $in: worksheetIds } }).toArray()
      const wsMap = {}; worksheets.forEach(w => { wsMap[w.id] = w })
      const aMap = {}; assignments.forEach(a => { aMap[a.id] = a })

      // All enrolled students across classes
      const allStudentIds = new Set()
      classes.forEach(c => (c.enrolled_students || []).forEach(s => allStudentIds.add(s.student_id)))
      const studentNameMap = {}
      classes.forEach(c => (c.enrolled_students || []).forEach(s => { studentNameMap[s.student_id] = s.display_name }))

      // --- 1. Overview stats ---
      const allGrades = submissions.filter(s => s.swiss_grade).map(s => s.swiss_grade)
      const allScores = submissions.filter(s => s.score_percentage != null).map(s => s.score_percentage)
      const overview = {
        totalStudents: allStudentIds.size,
        totalAssignments: assignments.length,
        totalSubmissions: submissions.length,
        avgScore: allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0,
        avgGrade: allGrades.length > 0 ? Math.round(allGrades.reduce((a, b) => a + b, 0) / allGrades.length * 10) / 10 : 0,
        passRate: allGrades.length > 0 ? Math.round(allGrades.filter(g => g >= 4).length / allGrades.length * 100) : 0,
      }

      // --- 2. Score distribution (0-10%, 10-20%, ... 90-100%) ---
      const scoreBuckets = Array.from({ length: 10 }, (_, i) => ({ range: `${i * 10}-${i * 10 + 10}%`, count: 0 }))
      allScores.forEach(s => {
        const idx = Math.min(Math.floor(s / 10), 9)
        scoreBuckets[idx].count++
      })

      // --- 3. Performance over time (last 12 weeks) ---
      const now = new Date()
      const performanceOverTime = []
      for (let w = 11; w >= 0; w--) {
        const weekStart = new Date(now); weekStart.setDate(now.getDate() - w * 7); weekStart.setHours(0, 0, 0, 0)
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7)
        const weekSubs = submissions.filter(s => {
          const d = new Date(s.submitted_at || s.created_at)
          return d >= weekStart && d < weekEnd
        })
        const weekScores = weekSubs.filter(s => s.score_percentage != null).map(s => s.score_percentage)
        const weekLabel = `${weekStart.getDate()}.${weekStart.getMonth() + 1}`
        performanceOverTime.push({
          week: weekLabel,
          avgScore: weekScores.length > 0 ? Math.round(weekScores.reduce((a, b) => a + b, 0) / weekScores.length) : null,
          submissions: weekSubs.length
        })
      }

      // --- 4. Subject performance ---
      const subjectMap = {}
      submissions.forEach(sub => {
        const assignment = aMap[sub.assignment_id]
        const worksheet = assignment ? wsMap[assignment.worksheet_id] : null
        const subject = worksheet?.subject || 'Unbekannt'
        if (!subjectMap[subject]) subjectMap[subject] = { scores: [], grades: [], count: 0 }
        subjectMap[subject].count++
        if (sub.score_percentage != null) subjectMap[subject].scores.push(sub.score_percentage)
        if (sub.swiss_grade) subjectMap[subject].grades.push(sub.swiss_grade)
      })
      const subjectPerformance = Object.entries(subjectMap).map(([subject, data]) => ({
        subject,
        avgScore: data.scores.length > 0 ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length) : 0,
        avgGrade: data.grades.length > 0 ? Math.round(data.grades.reduce((a, b) => a + b, 0) / data.grades.length * 10) / 10 : 0,
        submissions: data.count
      })).sort((a, b) => b.submissions - a.submissions)

      // --- 5. Question type analysis ---
      const qTypeMap = {}
      submissions.forEach(sub => {
        const results = sub.question_results || sub.results || []
        results.forEach(r => {
          const t = r.type || 'unknown'
          if (!qTypeMap[t]) qTypeMap[t] = { correct: 0, total: 0 }
          qTypeMap[t].total++
          if (r.isCorrect) qTypeMap[t].correct++
        })
      })
      const questionTypeLabels = {
        multiple_choice: 'Multiple Choice', true_false: 'Wahr/Falsch', open: 'Offene Frage',
        math: 'Rechnen', image: 'Bilderfrage', matching: 'Zuordnung', fill_blank: 'Lückentext',
        ordering: 'Reihenfolge', either_or: 'Entweder-Oder', table: 'Tabelle'
      }
      const questionTypeAnalysis = Object.entries(qTypeMap)
        .filter(([_, v]) => v.total >= 2)
        .map(([type, v]) => ({
          type: questionTypeLabels[type] || type,
          correctRate: Math.round((v.correct / v.total) * 100),
          total: v.total
        }))
        .sort((a, b) => a.correctRate - b.correctRate)

      // --- 6. Class comparison ---
      const classComparison = classes.map(cls => {
        const classAssignmentIds = assignments.filter(a => a.class_id === cls.id).map(a => a.id)
        const classSubs = submissions.filter(s => classAssignmentIds.includes(s.assignment_id))
        const classGrades = classSubs.filter(s => s.swiss_grade).map(s => s.swiss_grade)
        const classScores = classSubs.filter(s => s.score_percentage != null).map(s => s.score_percentage)
        return {
          name: cls.name,
          students: (cls.enrolled_students || []).length,
          submissions: classSubs.length,
          avgScore: classScores.length > 0 ? Math.round(classScores.reduce((a, b) => a + b, 0) / classScores.length) : 0,
          avgGrade: classGrades.length > 0 ? Math.round(classGrades.reduce((a, b) => a + b, 0) / classGrades.length * 10) / 10 : 0,
          passRate: classGrades.length > 0 ? Math.round(classGrades.filter(g => g >= 4).length / classGrades.length * 100) : 0,
        }
      }).filter(c => c.submissions > 0)

      // --- 7. Weak topics ---
      const topicMap = {}
      submissions.forEach(sub => {
        const assignment = aMap[sub.assignment_id]
        const worksheet = assignment ? wsMap[assignment.worksheet_id] : null
        const topic = worksheet?.topic || 'Unbekannt'
        const subject = worksheet?.subject || ''
        if (!topicMap[topic]) topicMap[topic] = { subject, correct: 0, total: 0, students: new Set() }
        const results = sub.question_results || sub.results || []
        results.forEach(r => {
          topicMap[topic].total++
          if (r.isCorrect) topicMap[topic].correct++
          else if (sub.student_id) topicMap[topic].students.add(sub.student_id)
        })
      })
      const weakTopics = Object.entries(topicMap)
        .filter(([_, v]) => v.total >= 5)
        .map(([topic, v]) => ({
          topic, subject: v.subject,
          errorRate: Math.round(((v.total - v.correct) / v.total) * 100),
          affectedStudents: v.students.size,
          totalQuestions: v.total
        }))
        .sort((a, b) => b.errorRate - a.errorRate)
        .slice(0, 10)

      // --- 8. Student ranking ---
      const studentPerf = {}
      submissions.forEach(sub => {
        if (!sub.student_id) return
        if (!studentPerf[sub.student_id]) studentPerf[sub.student_id] = { scores: [], grades: [], count: 0 }
        studentPerf[sub.student_id].count++
        if (sub.score_percentage != null) studentPerf[sub.student_id].scores.push(sub.score_percentage)
        if (sub.swiss_grade) studentPerf[sub.student_id].grades.push(sub.swiss_grade)
      })
      const studentRanking = Object.entries(studentPerf).map(([sid, data]) => ({
        student_id: sid,
        name: studentNameMap[sid] || 'Unbekannt',
        submissions: data.count,
        avgScore: data.scores.length > 0 ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length) : 0,
        avgGrade: data.grades.length > 0 ? Math.round(data.grades.reduce((a, b) => a + b, 0) / data.grades.length * 10) / 10 : 0,
        trend: data.scores.length >= 2
          ? (data.scores[data.scores.length - 1] > data.scores[0] ? 'up' : data.scores[data.scores.length - 1] < data.scores[0] ? 'down' : 'stable')
          : 'stable'
      })).sort((a, b) => b.avgScore - a.avgScore)

      return handleCORS(NextResponse.json({
        overview, scoreDistribution: scoreBuckets, performanceOverTime,
        subjectPerformance, questionTypeAnalysis, classComparison, weakTopics, studentRanking
      }))
    }

    // ========== WORKSHEET GENERATION ==========

    // Generate worksheet - POST /api/generate-worksheet
    if (route === '/generate-worksheet' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      const user = await db.collection('users').findOne({ id: decoded.userId })
      
      // Check usage limits
      if (user.subscription_tier === 'free' && user.worksheets_used_this_month >= 5) {
        return handleCORS(NextResponse.json(
          { error: "Monthly limit reached. Please upgrade to Premium." },
          { status: 403 }
        ))
      }

      const body = await request.json()
      const { topic, grade, subject, difficulty, questionCount, resourceType, sourceText, aiProvider, provider, competencyCode } = body

      if (!topic || !grade || !subject || !difficulty) {
        return handleCORS(NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 }
        ))
      }

      const selectedProvider = normalizeAIProvider(aiProvider || provider)
      const systemPrompt = getSystemPrompt(grade, subject, difficulty)
      const userPrompt = `Create a worksheet with ${questionCount || 10} questions about: ${topic}\n\nMake it engaging and appropriate for ${grade}. Klasse students in Switzerland.`

      const generationMessages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
      const generationContext = {
        topic,
        grade,
        subject,
        difficulty,
        questionCount: questionCount || 10,
        resourceType: resourceType || 'worksheet',
        competencyCode: competencyCode || null,
        sourceText: sourceText || null
      }
      const draftContent = await generateJsonContent({
        provider: selectedProvider,
        messages: generationMessages,
        taskType: getGenerationTaskType(resourceType, sourceText),
        context: generationContext
      })
      const { content: worksheetContent } = await ensureWorksheetQuality({
        content: draftContent,
        provider: selectedProvider,
        messages: generationMessages,
        taskType: getGenerationTaskType(resourceType, sourceText),
        context: generationContext,
        questionCount: questionCount || 10,
      })

      const worksheet = await saveGeneratedWorksheet({
        db,
        user,
        content: worksheetContent,
        topic,
        grade,
        subject,
        difficulty,
        questionCount,
        resourceType,
        aiProvider: selectedProvider
      })

      return handleCORS(NextResponse.json(worksheet))
    }

    // STREAMING Generate worksheet - POST /api/generate-worksheet-stream
    if (route === '/generate-worksheet-stream' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      const user = await db.collection('users').findOne({ id: decoded.userId })
      
      // Check usage limits
      if (user.subscription_tier === 'free' && user.worksheets_used_this_month >= 5) {
        return handleCORS(NextResponse.json(
          { error: "Monthly limit reached. Please upgrade to Premium." },
          { status: 403 }
        ))
      }

      const body = await request.json()
      const { topic, grade, subject, difficulty, questionCount, questionTypes, resourceType, sourceText, competencyCode, aiProvider, provider } = body

      if (!topic || !grade || !subject || !difficulty) {
        return handleCORS(NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 }
        ))
      }

      const selectedProvider = normalizeAIProvider(aiProvider || provider)

      // Create a streaming response
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          let worksheetGenerationId
          try {
            worksheetGenerationId = await startGeneration({
              userId: decoded.userId,
              feature: 'worksheet',
              model: selectedProvider === 'gemini' ? 'gemini' : OPENAI_GENERATION_MODEL,
              prompt: `${subject}:${grade}:${topic}`,
              metadata: { questionCount: questionCount || 10, resourceType: resourceType || 'worksheet' },
            })
            // Send initial status
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'status',
              message: 'Analysiere Thema...',
              progress: 10
            })}\n\n`))

            await new Promise(resolve => setTimeout(resolve, 500))

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'status',
              message: 'Lehrplan 21 wird konsultiert...',
              progress: 20
            })}\n\n`))

            await new Promise(resolve => setTimeout(resolve, 500))

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'status',
              message: 'KI generiert Fragen...',
              progress: 30
            })}\n\n`))

            // Build question type instructions
            const questionTypeMap = {
              multiple_choice: 'Multiple-Choice-Frage (4 Optionen A-D, eine richtig)',
              true_false: 'Wahr-oder-Falsch-Frage (Aussage bewerten)',
              open: 'Offene Frage (Freitext-Antwort)',
              math: 'Rechenfrage (mathematische Aufgabe)',
              image: 'Bilderfrage (Bild beschreiben oder zuordnen)',
              matching: 'Zuordnungsfrage (Begriffe zuordnen)',
              fill_blank: 'Lückentext-Frage (fehlende Wörter ergänzen)',
              ordering: 'Reihenfolge-Frage (Elemente ordnen)',
              either_or: 'Entweder-Oder-Frage (zwischen zwei Optionen wählen)',
            }
            let questionTypeInstruction = ''
            if (questionTypes && questionTypes.length > 0) {
              const typeNames = questionTypes.map(t => questionTypeMap[t] || t).join(', ')
              questionTypeInstruction = `\n\nWICHTIG: Verwende NUR diese Fragetypen: ${typeNames}. Mische die Typen abwechslungsreich. Gib bei jeder Frage den Typ als "type" Feld an.`
            } else {
              questionTypeInstruction = '\n\nMische verschiedene Fragetypen für Abwechslung: Multiple Choice, offene Fragen, Wahr/Falsch, Lückentext etc. Gib bei jeder Frage den Typ als "type" Feld an (z.B. "multiple_choice", "open", "true_false", "fill_blank").'
            }

            const materialType = resourceType === 'exam' ? 'eine formale Prüfung' : resourceType === 'quiz' ? 'ein Quiz' : resourceType === 'vocabulary' ? 'eine Wortschatzübung' : 'ein Arbeitsblatt'

            // Stream from OpenAI
            const systemPrompt = getSystemPrompt(grade, subject, difficulty)
            const pointsInstruction = resourceType === 'exam'
              ? 'Dies ist eine formale Prüfung. Vergib sinnvolle Punkte pro Aufgabe: einfache Fragen 1P, mittlere 2P, komplexe 3P. Berechne total_points als Summe. Das Format muss professionell und prüfungstauglich sein.'
              : 'Setze "points" bei jeder Frage auf 1 (Arbeitsblätter zeigen keine Punkte an). Setze total_points auf die Anzahl Fragen.'

            let sourceInstruction = ''
            if (sourceText) {
              // Try to parse structured sources (new format)
              let structuredSources = null
              try { structuredSources = JSON.parse(sourceText) } catch(e) { /* plain text fallback */ }

              if (structuredSources?.sources) {
                // Structured multi-source format
                const sourceParts = structuredSources.sources.map((src, i) => {
                  const blocks = (src.content_blocks || []).map(b => {
                    if (b.type === 'question') return `[AUFGABE] ${b.content}`
                    if (b.type === 'table') return `[TABELLE] ${b.content}`
                    if (b.type === 'list') return `[LISTE] ${b.content}`
                    if (b.type === 'heading') return `[TITEL] ${b.content}`
                    return b.content
                  }).join('\n\n')
                  return `--- QUELLE ${i + 1}: ${src.title} (${src.type || 'Dokument'}) ---\n${blocks}\n--- ENDE QUELLE ${i + 1} ---`
                })
                sourceInstruction = `\n\n=== QUELLMATERIAL (${structuredSources.sources.length} Quelle${structuredSources.sources.length > 1 ? 'n' : ''}) ===
WICHTIG: Die folgenden Inhalte stammen aus hochgeladenen Dokumenten. Stütze deine Fragen und Antworten AUF DIESES MATERIAL.
- Verwende die erkannten Aufgaben, Texte und Tabellen als Grundlage.
- Referenziere intern die Quellen (z.B. "Laut Text 1..." oder "Basierend auf der Tabelle...").
- Erfinde keine Fakten, die nicht im Quellmaterial stehen.
- Wenn das Material nicht ausreicht, kennzeichne unsichere Inhalte.

${sourceParts.join('\n\n')}
=== ENDE QUELLMATERIAL ===`
              } else {
                // Plain text fallback (legacy)
                sourceInstruction = `\n\n=== QUELLMATERIAL (hochgeladen) ===\nDie folgenden Inhalte stammen aus einem hochgeladenen Dokument. Stütze deine Fragen und Antworten AUF DIESES MATERIAL. Erfinde keine Fakten, die nicht im Quellmaterial stehen. Wenn das Material nicht ausreicht, kennzeichne unsichere Inhalte oder reduziere die Fragenanzahl.\n\n${sourceText.substring(0, 8000)}\n=== ENDE QUELLMATERIAL ===`
              }
            }

            const competencyInstruction = competencyCode
              ? `\n\nLehrplan-21-Kompetenz: ${competencyCode}. Richte Aufgaben und Hinweise sichtbar daran aus.`
              : ''
            const userPrompt = `Erstelle ${materialType} mit ${questionCount || 10} Fragen zum Thema: ${topic}\n\nDas Material ist für die ${grade}. Klasse in der Schweiz. Formuliere die Fragen klar, abwechslungsreich und didaktisch sinnvoll. Die Sprache soll natürlich klingen, nicht wie ein KI-Generator.${questionTypeInstruction}\n\n${pointsInstruction}${competencyInstruction}${sourceInstruction}`

            if (selectedProvider === 'gemini') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'status',
                message: 'Gemini erstellt Material...',
                progress: 55
              })}\n\n`))

              const generationMessages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
              ]
              const generationContext = {
                topic,
                grade,
                subject,
                difficulty,
                questionCount: questionCount || 10,
                questionTypes: questionTypes || [],
                resourceType: resourceType || 'worksheet',
                competencyCode: competencyCode || null,
                hasSourceText: Boolean(sourceText)
              }
              const draftContent = await generateJsonContent({
                provider: selectedProvider,
                messages: generationMessages,
                taskType: getGenerationTaskType(resourceType, sourceText),
                context: generationContext
              })
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'status',
                message: 'Didaktische Qualität wird geprüft...',
                progress: 82
              })}\n\n`))
              const { content: worksheetContent, quality } = await ensureWorksheetQuality({
                content: draftContent,
                provider: selectedProvider,
                messages: generationMessages,
                taskType: getGenerationTaskType(resourceType, sourceText),
                context: generationContext,
                questionCount: questionCount || 10,
              })

              const questions = worksheetContent.questions || []
              questions.slice(0, 5).forEach((question, index) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'question',
                  question: question.question || question.title || `Frage ${index + 1}`,
                  number: index + 1,
                  progress: Math.min(80, 55 + ((index + 1) * 5))
                })}\n\n`))
              })

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'status',
                message: 'Lösungen werden erstellt...',
                progress: 85
              })}\n\n`))

              const worksheet = await saveGeneratedWorksheet({
                db,
                user,
                content: worksheetContent,
                topic,
                grade,
                subject,
                difficulty,
                questionCount,
                resourceType,
                aiProvider: selectedProvider
              })

              await completeGeneration(worksheetGenerationId, {
                result: { worksheetId: worksheet.id }, usage: {}, model: 'gemini', quality,
                metadata: { questionCount: worksheetContent.questions?.length || 0 },
              })

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'complete',
                worksheet,
                progress: 100
              })}\n\n`))
              controller.close()
              return
            }

            const stream = await openai.chat.completions.create({
              model: OPENAI_GENERATION_MODEL,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
              ],
              temperature: 0.7,
              response_format: { type: "json_object" },
              stream: true,
              stream_options: { include_usage: true },
            })

            let fullContent = ''
            let currentQuestionCount = 0
            let finalUsage = {}

            for await (const chunk of stream) {
              if (chunk.usage) finalUsage = chunk.usage
              const content = chunk.choices[0]?.delta?.content || ''
              fullContent += content

              // Try to parse partial JSON to extract questions
              try {
                // Look for complete question objects in the stream
                const questionMatches = fullContent.match(/"question":\s*"([^"]+)"/g)
                if (questionMatches && questionMatches.length > currentQuestionCount) {
                  currentQuestionCount = questionMatches.length
                  const lastQuestion = questionMatches[questionMatches.length - 1]
                    .replace(/"question":\s*"/, '')
                    .replace(/"$/, '')
                  
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                    type: 'question', 
                    question: lastQuestion,
                    number: currentQuestionCount,
                    progress: 30 + (currentQuestionCount * 5)
                  })}\n\n`))
                }
              } catch (e) {
                // Ignore partial parsing errors
              }
            }

            // Parse final content
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'status', 
              message: 'Lösungen werden erstellt...', 
              progress: 85 
            })}\n\n`))

            await new Promise(resolve => setTimeout(resolve, 800))

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'status',
              message: 'Didaktische Qualität wird geprüft...',
              progress: 92
            })}\n\n`))

            const generationMessages = [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ]
            const generationContext = {
              topic,
              grade,
              subject,
              difficulty,
              questionCount: questionCount || 10,
              questionTypes: questionTypes || [],
              resourceType: resourceType || 'worksheet',
              competencyCode: competencyCode || null,
              hasSourceText: Boolean(sourceText)
            }
            const { content: worksheetContent, quality } = await ensureWorksheetQuality({
              content: parseJsonObject(fullContent),
              provider: selectedProvider,
              messages: generationMessages,
              taskType: getGenerationTaskType(resourceType, sourceText),
              context: generationContext,
              questionCount: questionCount || 10,
            })
            const worksheet = await saveGeneratedWorksheet({
              db,
              user,
              content: worksheetContent,
              topic,
              grade,
              subject,
              difficulty,
              questionCount,
              resourceType,
              aiProvider: selectedProvider
            })

            await completeGeneration(worksheetGenerationId, {
              result: { worksheetId: worksheet.id }, usage: finalUsage, model: OPENAI_GENERATION_MODEL, quality,
              metadata: { questionCount: worksheetContent.questions?.length || 0 },
            })

            // Send completion
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'complete', 
              worksheet,
              progress: 100 
            })}\n\n`))

            controller.close()
          } catch (error) {
            if (worksheetGenerationId) await failGeneration(worksheetGenerationId, error, { feature: 'worksheet' })
            console.error('Streaming error:', error)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'error', 
              message: error.message 
            })}\n\n`))
            controller.close()
          }
        }
      })

      const response = new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      })

      return handleCORS(response)
    }

    // Get user's worksheets - GET /api/worksheets
    if (route === '/worksheets' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      const worksheets = await db.collection('worksheets')
        .find({ user_id: decoded.userId })
        .sort({ created_at: -1 })
        .limit(100)
        .toArray()

      const cleanedWorksheets = worksheets.map(({ _id, ...rest }) => rest)
      return handleCORS(NextResponse.json(cleanedWorksheets))
    }

    // Get single worksheet - GET /api/worksheets/:id
    if (route.startsWith('/worksheets/') && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      const worksheetId = path[1]
      const worksheet = await db.collection('worksheets').findOne({ 
        id: worksheetId,
        user_id: decoded.userId 
      })

      if (!worksheet) {
        return handleCORS(NextResponse.json(
          { error: "Worksheet not found" },
          { status: 404 }
        ))
      }

      const { _id, ...cleanedWorksheet } = worksheet
      return handleCORS(NextResponse.json(cleanedWorksheet))
    }

    // Delete worksheet - DELETE /api/worksheets/:id
    if (route.startsWith('/worksheets/') && method === 'DELETE') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      const worksheetId = path[1]
      const result = await db.collection('worksheets').deleteOne({ 
        id: worksheetId,
        user_id: decoded.userId 
      })

      if (result.deletedCount === 0) {
        return handleCORS(NextResponse.json(
          { error: "Worksheet not found" },
          { status: 404 }
        ))
      }

      return handleCORS(NextResponse.json({ success: true }))
    }

    // Persisted duplicate - POST /api/worksheets/:id/duplicate
    if (route.startsWith('/worksheets/') && route.endsWith('/duplicate') && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

      const worksheetId = path[1]
      const original = await db.collection('worksheets').findOne({ id: worksheetId, user_id: decoded.userId })
      if (!original) return handleCORS(NextResponse.json({ error: 'Worksheet not found' }, { status: 404 }))

      const { _id, ...source } = original
      const now = new Date()
      const duplicate = {
        ...source,
        id: uuidv4(),
        title: `${source.title || 'Material'} (Kopie)`,
        status: 'draft',
        archived: false,
        reviewed_at: null,
        revision: 1,
        duplicated_from: worksheetId,
        created_at: now,
        updated_at: now,
      }
      await db.collection('worksheets').insertOne(duplicate)
      const { _id: duplicateId, ...cleaned } = duplicate
      return handleCORS(NextResponse.json(cleaned, { status: 201 }))
    }

    // Regenerate worksheet with different difficulty - POST /api/regenerate-worksheet
    if (route === '/regenerate-worksheet' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      const body = await request.json()
      const { worksheetId, newDifficulty } = body

      // Get original worksheet
      const original = await db.collection('worksheets').findOne({ 
        id: worksheetId,
        user_id: decoded.userId 
      })

      if (!original) {
        return handleCORS(NextResponse.json(
          { error: "Worksheet not found" },
          { status: 404 }
        ))
      }

      // Generate new version
      const systemPrompt = getSystemPrompt(original.grade, original.subject, newDifficulty)
      const userPrompt = `Create a worksheet with ${original.question_count} questions about: ${original.topic}\n\nMake it engaging and appropriate for ${original.grade}. Klasse students in Switzerland.`

      const generationMessages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
      const generationContext = {
        topic: original.topic,
        grade: original.grade,
        subject: original.subject,
        difficulty: newDifficulty,
        questionCount: original.question_count,
        resourceType: original.resourceType || 'worksheet',
      }
      const draftContent = await generateJsonContent({
        provider: 'openai',
        messages: generationMessages,
        taskType: getGenerationTaskType(original.resourceType, null),
        context: generationContext,
      })
      const { content: worksheetContent, quality } = await ensureWorksheetQuality({
        content: draftContent,
        provider: 'openai',
        messages: generationMessages,
        taskType: getGenerationTaskType(original.resourceType, null),
        context: generationContext,
        questionCount: original.question_count,
      })

      // Save new worksheet
      const worksheet = {
        id: uuidv4(),
        user_id: decoded.userId,
        title: worksheetContent.title,
        topic: original.topic,
        grade: original.grade,
        subject: original.subject,
        difficulty: newDifficulty,
        question_count: original.question_count,
        content: {
          ...worksheetContent,
          quality: {
            score: quality.score,
            warnings: quality.warnings,
            checked_at: new Date().toISOString(),
          },
        },
        status: 'review',
        revision: 1,
        archived: false,
        favorite: false,
        tags: [],
        folder: '',
        created_at: new Date(),
        updated_at: new Date(),
        regenerated_from: worksheetId
      }

      await db.collection('worksheets').insertOne(worksheet)

      return handleCORS(NextResponse.json(worksheet))
    }

    // ========== SUBSCRIPTION MANAGEMENT ==========

    // Premium upgrades must only be granted by a verified billing webhook.
    if (route === '/subscribe/premium' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      return handleCORS(NextResponse.json({
        error: 'Premium upgrades are temporarily unavailable until secure billing is configured.'
      }, { status: 503 }))
    }

    // ========== FILE ANALYSIS ==========

    // Analyze uploaded file - POST /api/analyze-upload
    if (route === '/analyze-upload' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      }

      try {
        const formData = await request.formData()
        const file = formData.get('file')
        const instructions = formData.get('instructions') || ''

        if (!file) {
          return handleCORS(NextResponse.json({ error: "No file provided" }, { status: 400 }))
        }

        const fileName = file.name || 'unknown'
        const fileType = file.type || ''
        const fileSize = file.size || 0
        const extension = fileName.split('.').pop()?.toLowerCase() || ''
        const isAllowedDocument = ALLOWED_UPLOAD_EXTENSIONS.has(extension)
        const isAllowedImage = ALLOWED_IMAGE_TYPES.has(fileType)

        if (fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) {
          return handleCORS(NextResponse.json({ error: 'Datei muss zwischen 1 Byte und 10 MB gross sein.' }, { status: 413 }))
        }
        if (!isAllowedDocument && !isAllowedImage) {
          return handleCORS(NextResponse.json({ error: 'Nicht unterstützter Dateityp.' }, { status: 415 }))
        }
        if (typeof instructions !== 'string' || instructions.length > 2_000) {
          return handleCORS(NextResponse.json({ error: 'Anweisungen dürfen maximal 2.000 Zeichen lang sein.' }, { status: 400 }))
        }

        const buffer = Buffer.from(await file.arrayBuffer())

        // Phase 1 & 2: Extract structured content (with OCR fallback)
        const extraction = await extractFileContent(buffer, fileName, fileType, fileSize)
        let messages = []

        const useVision = extraction.method === 'image-needs-ocr' || extraction.method === 'pdf-needs-ocr'

        if (useVision) {
          // OCR path: use Vision API for scanned PDFs and images
          const base64 = buffer.toString('base64')
          const mediaType = fileType.startsWith('image/') ? fileType : 'image/png'

          messages = [
            {
              role: 'system',
              content: `Du bist ein erfahrener Schweizer Lehrperson-Assistent. Analysiere das hochgeladene Dokument/Bild. Extrahiere den vollständigen Lehrinhalt – bewahre Struktur (Titel, Überschriften, Absätze, Listen, Tabellen, Aufgaben) wo erkennbar.

Antworte als JSON:
{
  "title": "Erkannter Titel oder Thema",
  "subject": "Erkanntes Fach (Deutsch/Mathematik/NMG/Englisch/Französisch/etc.)",
  "grade_suggestion": "Empfohlene Klassenstufe (1-9)",
  "content_summary": "Kurze Zusammenfassung des Inhalts (2-3 Sätze)",
  "key_topics": ["Thema 1", "Thema 2", "Thema 3"],
  "suggested_questions": ["Mögliche Frage 1", "Mögliche Frage 2", "Mögliche Frage 3"],
  "difficulty_suggestion": "easy/medium/hard",
  "material_type_suggestion": "worksheet/exam/quiz/vocabulary",
  "extracted_text": "Der vollständig erkannte Text des Dokuments, strukturiert mit Zeilenumbrüchen",
  "extracted_sections": [{"type": "heading|paragraph|list|table|exercise", "content": "Inhalt der Sektion"}]
}${instructions ? `\n\nZusätzliche Anweisungen: ${instructions}` : ''}`
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: `Analysiere und extrahiere den vollständigen Inhalt dieses Dokuments: "${fileName}" (${(fileSize/1024).toFixed(0)} KB)` },
                { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } }
              ]
            }
          ]
        } else {
          // Text extraction succeeded — send structured content for AI analysis
          const structuredPreview = extraction.sections.length > 0
            ? extraction.sections.slice(0, 30).map(s => `[${s.type}] ${s.content}`).join('\n\n')
            : extraction.text.substring(0, 10000)

          messages = [
            {
              role: 'system',
              content: `Du bist ein erfahrener Schweizer Lehrperson-Assistent. Der Textinhalt wurde bereits aus dem Dokument extrahiert. Analysiere ihn und identifiziere den Lehrinhalt.

Antworte als JSON:
{
  "title": "Erkannter Titel oder Thema",
  "subject": "Erkanntes Fach (Deutsch/Mathematik/NMG/Englisch/Französisch/etc.)",
  "grade_suggestion": "Empfohlene Klassenstufe (1-9)",
  "content_summary": "Kurze Zusammenfassung des Inhalts (2-3 Sätze)",
  "key_topics": ["Thema 1", "Thema 2", "Thema 3"],
  "suggested_questions": ["Mögliche Frage 1", "Mögliche Frage 2", "Mögliche Frage 3"],
  "difficulty_suggestion": "easy/medium/hard",
  "material_type_suggestion": "worksheet/exam/quiz/vocabulary"
}${instructions ? `\n\nZusätzliche Anweisungen: ${instructions}` : ''}`
            },
            {
              role: 'user',
              content: `Datei: "${fileName}" (${fileType}, ${(fileSize/1024).toFixed(0)} KB)\nExtraktionsmethode: ${extraction.method}\n\nExtrahierter Inhalt:\n${structuredPreview}`
            }
          ]
        }

        const analysisModel = process.env.OPENAI_ANALYSIS_MODEL || 'gpt-4o-mini'
        const analysisGenerationId = await startGeneration({
          userId: decoded.userId,
          feature: useVision ? 'document-vision' : 'document-analysis',
          model: analysisModel,
          prompt: `${fileName}:${instructions}`,
          metadata: { extension, fileSize, extractionMethod: extraction.method },
        })
        let aiAnalysis
        let analysisUsage = {}
        if (useVision && extension === 'pdf') {
          let uploadedFile
          try {
            uploadedFile = await openai.files.create({
              file: await toFile(buffer, fileName, { type: fileType || 'application/pdf' }),
              purpose: 'user_data',
            })
            const response = await openai.responses.create({
              model: analysisModel,
              input: [{
                role: 'user',
                content: [
                  { type: 'input_file', file_id: uploadedFile.id },
                  { type: 'input_text', text: messages[0].content + `\n\nDatei: ${fileName}` },
                ],
              }],
              text: { format: { type: 'json_object' } },
            })
            aiAnalysis = JSON.parse(response.output_text)
            analysisUsage = response.usage || {}
          } finally {
            if (uploadedFile?.id) await openai.files.delete(uploadedFile.id).catch(() => {})
          }
        } else {
          const completion = await openai.chat.completions.create({
            model: analysisModel,
            messages,
            temperature: 0.35,
            response_format: { type: 'json_object' },
            max_tokens: 2200,
          })
          aiAnalysis = JSON.parse(completion.choices[0].message.content)
          analysisUsage = completion.usage || {}
        }
        await completeGeneration(analysisGenerationId, {
          result: aiAnalysis,
          usage: analysisUsage,
          model: analysisModel,
          metadata: { extension, fileSize, extractionMethod: extraction.method },
        })

        // Phase 3 & 4: Build structured source (intermediate format)
        // For Vision/OCR path, use AI-extracted text if our extraction was empty
        if (useVision && aiAnalysis.extracted_text) {
          extraction.text = aiAnalysis.extracted_text
          extraction.sections = aiAnalysis.extracted_sections || splitTextIntoSections(aiAnalysis.extracted_text)
          extraction.method = extraction.method.replace('needs-ocr', 'vision-ocr')
        }

        const structuredSource = buildStructuredSource(extraction, aiAnalysis, fileName)

        return handleCORS(NextResponse.json({
          analysis: aiAnalysis,
          structured_source: structuredSource
        }))
      } catch (analyzeError) {
        console.error('File analysis error:', analyzeError)
        return handleCORS(NextResponse.json({
          error: 'Analyse fehlgeschlagen.',
          analysis: {
            title: 'Hochgeladenes Material',
            subject: 'Allgemein',
            grade_suggestion: '5',
            content_summary: 'Die Datei konnte nicht vollständig analysiert werden. Bitte geben Sie das Thema manuell ein.',
            key_topics: [],
            suggested_questions: [],
            difficulty_suggestion: 'medium',
            material_type_suggestion: 'worksheet'
          },
          structured_source: null
        }))
      }
    }

    // ========== AI CHAT ASSISTANT ==========

    // Chat - POST /api/chat (Streaming + Function Calling)
    if (route === '/chat' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      }

      const body = await request.json()
      const { message, worksheetContext, chatHistory = [] } = body

      if (typeof message !== 'string' || !message.trim() || message.length > 4000 || !Array.isArray(chatHistory) || chatHistory.length > 60) {
        return handleCORS(NextResponse.json({ error: "Message is required" }, { status: 400 }))
      }

      // Build rich worksheet context with full question content
      let wsContext = ''
      if (worksheetContext) {
        wsContext = `\n\n=== AKTUELLES ARBEITSBLATT ===
Titel: "${worksheetContext.title}"
Fach: ${worksheetContext.subject} | Klasse: ${worksheetContext.grade} | Schwierigkeit: ${worksheetContext.difficulty}
Anzahl Fragen: ${worksheetContext.questionCount}
Fragetypen: ${worksheetContext.questionTypes || 'gemischt'}`

        if (worksheetContext.questions && worksheetContext.questions.length > 0) {
          wsContext += '\n\nFragen im Detail:'
          worksheetContext.questions.forEach((q, i) => {
            wsContext += `\n${i + 1}. [${q.type}] ${q.question}`
            if (q.options) wsContext += `\n   Optionen: ${q.options.join(', ')}`
            wsContext += `\n   Antwort: ${q.answer} (${q.points || 1} Pkt.)`
          })
        }
        wsContext += '\n=== ENDE ARBEITSBLATT ==='
      }

      const chatTools = [
        {
          type: 'function',
          function: {
            name: 'modify_question',
            description: 'Eine bestehende Frage im Arbeitsblatt bearbeiten (einfacher/schwieriger machen, Typ ändern, umformulieren etc.)',
            parameters: {
              type: 'object',
              properties: {
                questionIndex: { type: 'integer', minimum: 0, description: 'Index der Frage (0-basiert)' },
                action: { type: 'string', enum: ['harder', 'easier', 'to_mc', 'to_open', 'to_fill_blank', 'to_true_false', 'child_friendly', 'swiss_context', 'more_variety', 'better_distractors', 'precise_answer'], description: 'Art der Änderung' },
                customInstruction: { type: 'string', description: 'Optionale benutzerdefinierte Anweisung für die Änderung' }
              },
              required: ['questionIndex', 'action']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'add_questions',
            description: 'Neue Fragen zum bestehenden Arbeitsblatt hinzufügen',
            parameters: {
              type: 'object',
              properties: {
                count: { type: 'integer', minimum: 1, maximum: 5, description: 'Anzahl neuer Fragen (1-5)' },
                type: { type: 'string', enum: ['multiple_choice', 'true_false', 'open', 'math', 'fill_blank', 'matching', 'ordering', 'either_or', 'image'], description: 'Fragetyp' },
                topic: { type: 'string', description: 'Spezifisches Thema für die neuen Fragen (optional, sonst passt es zum bestehenden Material)' },
                difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], description: 'Schwierigkeitsgrad' }
              },
              required: ['count', 'type']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'export_worksheet',
            description: 'Das aktuelle Arbeitsblatt als PDF oder Word exportieren',
            parameters: {
              type: 'object',
              properties: {
                format: { type: 'string', enum: ['pdf', 'docx'], description: 'Export-Format' },
                version: { type: 'string', enum: ['student', 'teacher'], description: 'Schüler- oder Lehrerversion' }
              },
              required: ['format', 'version']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'navigate_to',
            description: 'Zu einer bestimmten Seite/Ansicht in EduFlow navigieren',
            parameters: {
              type: 'object',
              properties: {
                view: { type: 'string', enum: ['create', 'library', 'upload', 'templates', 'curriculum', 'planner', 'students', 'classes', 'exports', 'settings', 'home'], description: 'Zielansicht' }
              },
              required: ['view']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'regenerate_worksheet',
            description: 'Das gesamte Arbeitsblatt mit neuer Schwierigkeit oder neuem Fokus neu generieren',
            parameters: {
              type: 'object',
              properties: {
                difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], description: 'Neue Schwierigkeit' },
                focus: { type: 'string', description: 'Optionaler neuer Fokus oder Thema' }
              },
              required: ['difficulty']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'create_differentiated_versions',
            description: 'Differenzierte Versionen des Arbeitsblatts erstellen (leicht, mittel, schwer)',
            parameters: {
              type: 'object',
              properties: {
                levels: {
                  type: 'array',
                  items: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                  description: 'Gewünschte Schwierigkeitsstufen'
                }
              },
              required: ['levels']
            }
          }
        }
      ]

      const systemMsg = `Du bist der EduFlow-Assistent – ein freundlicher, kompetenter pädagogischer Helfer für Schweizer Lehrpersonen. Du sprichst Schweizer Hochdeutsch.

Deine Persönlichkeit:
- Motivierend und warmherzig, aber professionell
- Kompetent in Didaktik und Lehrplan 21
- Gibt konkrete, umsetzbare Tipps
- Antworte IMMER auf Deutsch

Du hast Zugriff auf mächtige Werkzeuge, die das Arbeitsblatt DIREKT bearbeiten können:
- modify_question: Einzelne Fragen ändern (einfacher, schwieriger, Typ wechseln, umformulieren)
- add_questions: Neue Fragen zum Arbeitsblatt hinzufügen
- export_worksheet: Als PDF/Word exportieren
- navigate_to: Zu einer anderen Ansicht wechseln
- regenerate_worksheet: Gesamtes Material neu generieren
- create_differentiated_versions: Differenzierte Versionen erstellen

WICHTIGE REGELN:
1. Wenn der Benutzer eine Aktion wünscht (z.B. "mach Frage 3 einfacher"), nutze IMMER das passende Werkzeug statt nur Tipps zu geben.
2. Wenn kein Arbeitsblatt ausgewählt ist und der Benutzer eines bearbeiten will, schlage vor, zur Bibliothek zu navigieren oder eines zu erstellen.
3. Halte deine Textantworten kurz und hilfreich (max. 4-5 Sätze).
4. Bei Werkzeug-Nutzung: Erkläre kurz was du tust und was das Ergebnis ist.
5. Du kennst den vollständigen Inhalt des aktuellen Arbeitsblatts (alle Fragen, Antworten, Typen).
6. Nummeriere Fragen für den Benutzer ab 1 (nicht ab 0).${wsContext}`

      const messages = [
        { role: 'system', content: systemMsg },
        ...chatHistory.slice(-30).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
      ]

      let chatGenerationId
      try {
        const chatModel = process.env.OPENAI_CHAT_MODEL || 'gpt-4o'
        chatGenerationId = await startGeneration({ userId: decoded.userId, feature: 'chat', model: chatModel, prompt: message, metadata: { hasWorksheet: Boolean(worksheetContext) } })
        const stream = await openai.chat.completions.create({
          model: chatModel,
          messages,
          tools: worksheetContext ? chatTools : [chatTools[3]], // Only navigation tool if no worksheet
          temperature: 0.7,
          max_tokens: 1500,
          stream: true,
          stream_options: { include_usage: true },
        })

        const encoder = new TextEncoder()
        const readable = new ReadableStream({
          async start(controller) {
            let toolCalls = {}
            let assistantText = ''
            let finalUsage = {}
            try {
              for await (const chunk of stream) {
                if (chunk.usage) finalUsage = chunk.usage
                const delta = chunk.choices[0]?.delta
                const finishReason = chunk.choices[0]?.finish_reason

                // Stream text content
                if (delta?.content) {
                  assistantText += delta.content
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: delta.content })}\n\n`))
                }

                // Collect tool call deltas
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index
                    if (!toolCalls[idx]) {
                      toolCalls[idx] = { id: tc.id || '', name: tc.function?.name || '', arguments: '' }
                    }
                    if (tc.id) toolCalls[idx].id = tc.id
                    if (tc.function?.name) toolCalls[idx].name = tc.function.name
                    if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments
                  }
                }

                // When done, send tool calls if any
                if (finishReason === 'tool_calls') {
                  for (const [, tc] of Object.entries(toolCalls)) {
                    try {
                      const args = validateChatToolCall(tc.name, JSON.parse(tc.arguments), { questionCount: worksheetContext?.questions?.length || 0 })
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'tool_call', name: tc.name, arguments: args })}\n\n`))
                    } catch (e) {
                      console.error('Tool call parse error:', e)
                    }
                  }
                }

                if (finishReason === 'stop' || finishReason === 'tool_calls') {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
                }
              }
              await completeGeneration(chatGenerationId, { result: { text: assistantText, toolCalls: Object.values(toolCalls).map(call => ({ name: call.name })) }, usage: finalUsage, model: chatModel, metadata: { hasWorksheet: Boolean(worksheetContext) } })
            } catch (streamError) {
              await failGeneration(chatGenerationId, streamError, { feature: 'chat-stream' })
              console.error('Stream error:', streamError)
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', content: 'Stream-Fehler aufgetreten.' })}\n\n`))
            } finally {
              controller.close()
            }
          }
        })

        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        })
      } catch (aiError) {
        if (chatGenerationId) await failGeneration(chatGenerationId, aiError, { feature: 'chat' })
        console.error('Chat AI error:', aiError)
        return handleCORS(NextResponse.json({ error: 'KI-Fehler. Bitte versuchen Sie es erneut.' }, { status: 500 }))
      }
    }

    // Chat - Add Questions (called by chat tool_call)
    if (route === '/chat-add-questions' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      }

      const body = await request.json()
      const { count, type, topic, difficulty, subject, grade, existingQuestions = [] } = body

      const systemMsg = `Du bist ein erfahrener Schweizer Primarlehrer. Erstelle genau ${count} neue Fragen.

WICHTIG: Antworte NUR mit einem JSON-Objekt: { "questions": [...] }

Jede Frage hat diese Struktur:
{
  "question": "Fragetext",
  "type": "${type}",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "answer": "Korrekte Antwort",
  "points": 1
}

- "options" nur bei multiple_choice, true_false, either_or
- Bei fill_blank: Lücken mit ___ markieren
- Bei matching: answer = "links1→rechts1, links2→rechts2"
- Bei ordering: answer = "element1, element2, element3"
- Fragen sollen sich von bestehenden unterscheiden
- Schweizer Schulkontext, Lehrplan 21, ${difficulty} Schwierigkeit`

      const userMsg = `Erstelle ${count} ${type}-Fragen zum Thema "${topic}" für ${subject}, ${grade}. Klasse.
${existingQuestions.length > 0 ? `\nBereits vorhandene Fragen (NICHT wiederholen):\n${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : ''}`

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: userMsg }
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        })

        const result = JSON.parse(completion.choices[0].message.content)
        return handleCORS(NextResponse.json({ questions: result.questions || [] }))
      } catch (aiError) {
        console.error('Chat add questions error:', aiError)
        return handleCORS(NextResponse.json({ error: 'Fragen konnten nicht generiert werden.' }, { status: 500 }))
      }
    }

    // ========== AI QUESTION ACTIONS ==========

    // KI Action on question - POST /api/ki-action
    if (route === '/ki-action' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      }

      const body = await request.json()
      const { question, actionId, worksheetContext } = body

      if (!question || !actionId) {
        return handleCORS(NextResponse.json({ error: "Question and actionId are required" }, { status: 400 }))
      }

      const actionPrompts = {
        harder: 'Mache diese Frage deutlich anspruchsvoller. Erhöhe die kognitive Anforderung (Analyse/Synthese statt Wissen). Behalte den Fragetyp bei.',
        easier: 'Vereinfache diese Frage deutlich. Reduziere die Komplexität, verwende einfachere Sprache, mache sie für schwächere Schüler zugänglich. Behalte den Fragetyp bei.',
        to_mc: 'Wandle diese Frage in eine Multiple-Choice-Frage um. Erstelle 4 Optionen (A-D), eine davon korrekt. Die Falschantworten sollen plausibel sein.',
        to_open: 'Wandle diese Frage in eine offene Frage um. Entferne alle Optionen. Die Frage soll eine ausführliche Textantwort erfordern.',
        more_options: 'Füge 2 weitere plausible Antwortoptionen hinzu. Die neuen Optionen sollen gute Distraktoren sein.',
        better_distractors: 'Verbessere die falschen Antwortoptionen. Sie sollen plausibler und didaktisch wertvoller sein (typische Fehlvorstellungen der Schüler).',
        precise_answer: 'Formuliere die Lösung präziser und vollständiger. Ergänze bei Bedarf einen kurzen Lösungsweg.',
        child_friendly: 'Formuliere die Frage kindgerechter. Einfachere Sprache, kürzere Sätze, konkrete Beispiele aus dem Alltag der Kinder.',
        swiss_context: 'Passe die Frage an den Schweizer Schulkontext an. Verwende Schweizer Beispiele, Orte, Kultur, CHF statt EUR etc.',
        more_variety: 'Schreibe die Frage komplett um – anderer Blickwinkel, andere Formulierung, aber gleiches Thema und gleiche Schwierigkeit.',
      }

      const actionPrompt = actionPrompts[actionId] || 'Verbessere diese Frage.'

      const systemMsg = `Du bist ein erfahrener Schweizer Primarlehrer-Assistent. Du bearbeitest eine einzelne Frage.

WICHTIG: Antworte NUR mit einem JSON-Objekt. Kein Text davor oder danach.

Das JSON muss genau diese Struktur haben:
{
  "question": "Neuer Fragetext",
  "type": "question_type",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "answer": "Korrekte Antwort",
  "points": 1
}

- "options" nur bei multiple_choice, true_false, either_or (bei anderen Typen weglassen)
- "type" muss einer von: multiple_choice, true_false, open, math, image, matching, fill_blank, ordering, either_or sein
- Bei matching: answer = "links1→rechts1, links2→rechts2"
- Bei ordering: answer = "element1, element2, element3" (korrekte Reihenfolge)
- Bei fill_blank: Lücken im question mit ___ markieren, answer = "wort1, wort2"`

      const userMsg = `Aktuelle Frage:
${JSON.stringify(question, null, 2)}

${worksheetContext ? `Kontext: ${worksheetContext.subject}, ${worksheetContext.grade}. Klasse, ${worksheetContext.difficulty}` : ''}

Aktion: ${actionPrompt}`

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: userMsg }
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        })

        const updatedQuestion = JSON.parse(completion.choices[0].message.content)
        return handleCORS(NextResponse.json({ question: updatedQuestion }))
      } catch (aiError) {
        console.error('KI Action error:', aiError)
        return handleCORS(NextResponse.json({ error: 'KI-Aktion fehlgeschlagen.' }, { status: 500 }))
      }
    }

    // Update worksheet - PUT /api/worksheets/:id
    if (route.startsWith('/worksheets/') && method === 'PUT') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      const worksheetId = path[1]
      const body = await request.json()
      const { content, title } = body

      const updateFields = {}
      if (content) {
        updateFields.content = content
        updateFields.status = 'review'
        updateFields.reviewed_at = null
      }
      if (title) updateFields.title = title
      const metadataKeys = ['status', 'folder', 'tags', 'favorite', 'archived', 'reviewed_at']
      if (metadataKeys.some(key => Object.prototype.hasOwnProperty.call(body, key))) {
        const currentMetadata = await db.collection('worksheets').findOne(
          { id: worksheetId, user_id: decoded.userId },
          { projection: { status: 1, folder: 1, tags: 1, favorite: 1, archived: 1, reviewed_at: 1 } },
        )
        Object.assign(updateFields, normalizeMaterialMetadata({ ...(currentMetadata || {}), ...body }))
      }
      updateFields.updated_at = new Date()

      const updateOperation = { $set: updateFields }
      if (content) updateOperation.$inc = { revision: 1 }
      const result = await db.collection('worksheets').updateOne(
        { id: worksheetId, user_id: decoded.userId },
        updateOperation
      )

      if (result.matchedCount === 0) {
        return handleCORS(NextResponse.json(
          { error: "Worksheet not found" },
          { status: 404 }
        ))
      }

      const updated = await db.collection('worksheets').findOne({ id: worksheetId, user_id: decoded.userId })
      const { _id, ...cleanedWorksheet } = updated
      return handleCORS(NextResponse.json(cleanedWorksheet))
    }

    // ========== AI IMAGE GENERATION ==========

    // Generate image - POST /api/generate-image
    if (route === '/generate-image' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      }

      const body = await request.json()
      const { prompt, style = 'educational', size = '1024x1024' } = body

      if (!prompt) {
        return handleCORS(NextResponse.json({ error: "Prompt is required" }, { status: 400 }))
      }

      let imageGenerationId
      try {
        const styleMap = {
          educational: 'clean educational illustration, professional, suitable for classroom materials, clear and well-organized',
          cartoon: 'colorful cartoon illustration, child-friendly, bright colors, fun and engaging for children',
          realistic: 'realistic photograph style, clear and simple, high quality',
          diagram: 'clean educational diagram, labeled, simple lines, scientific illustration style',
          'line-art': 'black and white line art drawing, clean outlines, no shading, simple and clear, suitable for coloring',
          'schwarz-weiss': 'black and white illustration, high contrast, print-friendly, clear shapes, no gradients',
          kindgerecht: 'simple child-friendly illustration, cute style, large shapes, bright primary colors, suitable for ages 6-10',
          druckfreundlich: 'print-friendly illustration, clean lines, limited colors, clear shapes, works well when printed on paper'
        }
        const styleDesc = styleMap[style] || styleMap.educational
        const enhancedPrompt = `Educational illustration for Swiss school classroom: ${prompt}. Style: ${styleDesc}. No text or words in the image. The image should be pedagogically useful, clear, and age-appropriate.`

        const imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'
        const generationId = await startGeneration({
          userId: decoded.userId,
          feature: 'image',
          model: imageModel,
          prompt: enhancedPrompt,
          metadata: { style, size },
        })
        imageGenerationId = generationId
        const response = await openai.images.generate({
          model: imageModel,
          prompt: enhancedPrompt,
          n: 1,
          size: size,
          quality: 'medium',
        })

        const item = response.data?.[0]
        let imageBuffer
        if (item?.b64_json) imageBuffer = Buffer.from(item.b64_json, 'base64')
        else if (item?.url) {
          const download = await fetch(item.url)
          if (!download.ok) throw new Error('Generiertes Bild konnte nicht gespeichert werden.')
          imageBuffer = Buffer.from(await download.arrayBuffer())
        }
        if (!imageBuffer?.length) throw new Error('Bildgenerierung lieferte keine Bilddaten.')

        const assetId = uuidv4()
        await db.collection('generated_assets').insertOne({
          id: assetId,
          user_id: decoded.userId,
          kind: 'image',
          mime_type: 'image/png',
          filename: `eduflow-${assetId}.png`,
          data: imageBuffer,
          prompt: prompt.slice(0, 1000),
          style,
          model: imageModel,
          created_at: new Date(),
        })
        const imageUrl = `/api/assets/images/${assetId}`
        await completeGeneration(generationId, {
          result: { assetId, imageUrl },
          usage: response.usage || {},
          model: imageModel,
          metadata: { style, size, bytes: imageBuffer.length },
        })

        return handleCORS(NextResponse.json({ imageUrl, assetId, generationId, model: imageModel, revisedPrompt: item?.revised_prompt }))
      } catch (imgError) {
        if (imageGenerationId) await failGeneration(imageGenerationId, imgError, { feature: 'image' })
        console.error('Image generation error:', imgError)
        return handleCORS(NextResponse.json({ error: publicErrorMessage(imgError, 'Bildgenerierung fehlgeschlagen') }, { status: 500 }))
      }
    }

    // ========== STUDENT MODE (Schüler-Modus) ==========

    // ========== FEHLERANALYSE (Error Analysis) ==========

    // Analyze submissions for patterns - POST /api/analyze-errors
    if (route === '/analyze-errors' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { assignmentId } = body
      const assignment = await db.collection('assignments').findOne({ id: assignmentId, teacher_id: decoded.userId })
      if (!assignment) return handleCORS(NextResponse.json({ error: 'Aufgabe nicht gefunden.' }, { status: 404 }))
      const submissions = await db.collection('submissions').find({ assignment_id: assignmentId }).toArray()
      if (submissions.length === 0) return handleCORS(NextResponse.json({ error: 'Keine Abgaben vorhanden.' }, { status: 404 }))
      const worksheet = await db.collection('worksheets').findOne({ id: assignment?.worksheet_id })

      // Build analysis
      const questions = worksheet?.content?.questions || []
      const questionAnalysis = questions.map((q, qi) => {
        const results = submissions.map(s => s.question_results?.[qi]).filter(Boolean)
        const correctCount = results.filter(r => r.isCorrect === true).length
        const incorrectCount = results.filter(r => r.isCorrect === false).length
        const unanswered = results.filter(r => r.isCorrect === null).length
        const errorRate = results.length > 0 ? Math.round((incorrectCount / results.length) * 100) : 0
        // Collect wrong answers for pattern detection
        const wrongAnswers = results.filter(r => r.isCorrect === false).map(r => r.studentAnswer)
        const answerFrequency = {}
        wrongAnswers.forEach(a => { const key = JSON.stringify(a); answerFrequency[key] = (answerFrequency[key] || 0) + 1 })
        const commonErrors = Object.entries(answerFrequency).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([answer, count]) => ({ answer: JSON.parse(answer), count }))
        return { questionNumber: q.number, question: q.question, type: q.type, correctCount, incorrectCount, unanswered, errorRate, commonErrors, totalResponses: results.length }
      })

      // AI-powered analysis
      let aiAnalysis = ''
      try {
        const analysisPrompt = `Analysiere die folgenden Prüfungsergebnisse einer Schweizer Schulklasse und gib pädagogisch wertvolle Hinweise auf Deutsch:

Prüfung: ${worksheet?.title}
Fach: ${worksheet?.subject}, ${worksheet?.grade}. Klasse
Anzahl Schüler: ${submissions.length}

Fragenanalyse:
${questionAnalysis.map(qa => `- Frage ${qa.questionNumber} (${qa.type}): "${qa.question}" - ${qa.errorRate}% Fehlerquote${qa.commonErrors.length > 0 ? `, häufige falsche Antworten: ${qa.commonErrors.map(e => JSON.stringify(e.answer)).join(', ')}` : ''}`).join('\n')}

Gesamtdurchschnitt: ${submissions.length > 0 ? Math.round(submissions.reduce((s, sub) => s + sub.score_percentage, 0) / submissions.length) : 0}%

Bitte gib:
1. Eine kurze Zusammenfassung der Klassenleistung
2. Identifizierte Lernlücken und Fehlermuster
3. Konkrete Förderhinweise
4. Vorschläge für Wiederholungsübungen`
        const aiRes = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: analysisPrompt }],
          max_tokens: 1000
        })
        aiAnalysis = aiRes.choices[0]?.message?.content || ''
      } catch (e) { console.error('AI analysis error:', e) }

      return handleCORS(NextResponse.json({
        totalSubmissions: submissions.length,
        averageScore: submissions.length > 0 ? Math.round(submissions.reduce((s, sub) => s + sub.score_percentage, 0) / submissions.length) : 0,
        questionAnalysis,
        aiAnalysis,
        classResults: submissions.map(s => ({ name: s.student_name, score: s.score_percentage, duration: s.duration }))
      }))
    }

    // ========== PRÜFUNGSANALYSE (Exam Analysis from Upload) ==========

    // Analyze uploaded exam photo/scan - POST /api/analyze-exam-scan
    if (route === '/analyze-exam-scan' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { imageBase64, worksheetId } = body

      let worksheetContext = ''
      if (worksheetId) {
        const ws = await db.collection('worksheets').findOne({ id: worksheetId })
        if (ws) {
          worksheetContext = `\n\nOriginal-Prüfung: "${ws.title}"\nFragen:\n${(ws.content?.questions || []).map(q => `${q.number}. ${q.question} (Lösung: ${q.answer})`).join('\n')}`
        }
      }

      try {
        const messages = [{
          role: 'user',
          content: [
            { type: 'text', text: `Analysiere dieses Bild einer ausgefüllten Schulprüfung eines Schweizer Schülers. Erkenne die Antworten und bewerte sie.${worksheetContext}\n\nBitte gib zurück:\n1. Erkannte Antworten pro Frage\n2. Bewertung (richtig/falsch/unsicher)\n3. Vorgeschlagene Punktzahl\n4. Bei unsicheren Erkennungen: klar markieren\n\nFormat als JSON: { "answers": [{ "question": 1, "recognized_answer": "...", "correct": true/false/null, "confidence": "high"/"medium"/"low", "points": 1 }], "total_points": 0, "notes": "..." }` },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
          ]
        }]
        const response = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages, max_tokens: 2000 })
        const content = response.choices[0]?.message?.content || '{}'
        let parsed
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/)
          parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: content }
        } catch { parsed = { raw: content } }
        return handleCORS(NextResponse.json(parsed))
      } catch (e) {
        console.error('Exam scan error:', e)
        return handleCORS(NextResponse.json({ error: 'Analyse fehlgeschlagen: ' + e.message }, { status: 500 }))
      }
    }

    // ========== TEXT-TO-SPEECH (Sprachausgabe) ==========

    // Generate speech - POST /api/tts
    if (route === '/tts' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { text, voice = 'coral', speed = 1.0 } = body
      if (!text) return handleCORS(NextResponse.json({ error: 'Text ist erforderlich.' }, { status: 400 }))
      try {
        const speech = await generateOpenAISpeech({
          userId: decoded.userId,
          text: text.substring(0, 9000),
          feature: 'tts',
          voice,
          instructions: `Sprich in klarem Schweizer Hochdeutsch, didaktisch, freundlich und mit Tempo ${Math.max(0.5, Math.min(1.5, speed))}.`,
        })
        const buffer = speech.audio
        return new Response(buffer, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': buffer.length.toString(), ...Object.fromEntries(handleCORS(new Response()).headers) } })
      } catch (e) {
        console.error('TTS error:', e)
        return handleCORS(NextResponse.json({ error: 'Sprachgenerierung fehlgeschlagen: ' + e.message }, { status: 500 }))
      }
    }

    // ========== DOSSIER ROUTES ==========

    // Generate dossier (streaming) - POST /api/generate-dossier-stream
    if (route === '/generate-dossier-stream' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))

      const user = await db.collection('users').findOne({ id: decoded.userId })
      if (user.subscription_tier === 'free' && user.worksheets_used_this_month >= 5) {
        return handleCORS(NextResponse.json({ error: "Monatliches Limit erreicht. Bitte auf Premium upgraden." }, { status: 403 }))
      }

      const body = await request.json()
      const { topic, grade, subject, difficulty, theme, competency_codes, sourceText, resumeDossierId } = body

      if (!topic || !grade || !subject) {
        return handleCORS(NextResponse.json({ error: "Thema, Klasse und Fach sind erforderlich." }, { status: 400 }))
      }

      let sourceContext = ''
      if (sourceText) {
        let structuredSources = null
        try { structuredSources = JSON.parse(sourceText) } catch(e) {}

        if (structuredSources?.sources) {
          const sourceParts = structuredSources.sources.map((src, i) => {
            const blocks = (src.content_blocks || []).map(b => {
              if (b.type === 'question') return `[AUFGABE] ${b.content}`
              if (b.type === 'table') return `[TABELLE] ${b.content}`
              if (b.type === 'list') return `[LISTE] ${b.content}`
              if (b.type === 'heading') return `[TITEL] ${b.content}`
              return b.content
            }).join('\n\n')
            return `--- QUELLE ${i + 1}: ${src.title} ---\n${blocks}\n--- ENDE QUELLE ${i + 1} ---`
          })
          sourceContext = `\n\n=== QUELLMATERIAL (${structuredSources.sources.length} Quellen) ===\nNutze diese Materialien als Grundlage für das Dossier. Stütze Theorie, Übungen und Inhalte auf dieses Material.\n\n${sourceParts.join('\n\n')}\n=== ENDE QUELLMATERIAL ===`
        } else {
          sourceContext = `\n\n=== QUELLMATERIAL ===\nDas folgende Material wurde hochgeladen. Nutze es als Grundlage für das Dossier.\n\n${sourceText.substring(0, 8000)}\n=== ENDE QUELLMATERIAL ===`
        }
      }

      const encoder = new TextEncoder()
      const dossierId = resumeDossierId || uuidv4()
      const stream = new ReadableStream({
        async start(controller) {
          let dossierGenerationId
          const dossierUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
          const addDossierUsage = (usage = {}) => {
            dossierUsage.prompt_tokens += usage.prompt_tokens || 0
            dossierUsage.completion_tokens += usage.completion_tokens || 0
            dossierUsage.total_tokens += usage.total_tokens || 0
          }
          try {
            const existingCheckpoint = resumeDossierId
              ? await db.collection('dossiers').findOne({ id: dossierId, user_id: decoded.userId, generation_status: { $in: ['pending', 'failed'] } })
              : null
            if (resumeDossierId && !existingCheckpoint) throw new Error('Der Dossier-Checkpoint wurde nicht gefunden oder ist bereits abgeschlossen.')
            const checkpointCreatedAt = existingCheckpoint?.created_at || new Date()
            if (!existingCheckpoint) {
              await db.collection('dossiers').insertOne({
                id: dossierId, user_id: decoded.userId, title: `${subject}: ${topic}`, topic, grade, subject,
                difficulty: difficulty || 'medium', theme: theme || 'classic', competency_codes: competency_codes || [],
                learning_objectives: [], sections: [], generation_status: 'pending', generated_sections: 0,
                total_sections: 0, mode: 'dossier', created_at: checkpointCreatedAt, updated_at: checkpointCreatedAt,
              })
            } else {
              await db.collection('dossiers').updateOne({ id: dossierId, user_id: decoded.userId }, { $set: { generation_status: 'pending', last_error: null, updated_at: new Date() } })
            }
            const dossierModel = process.env.OPENAI_DOSSIER_MODEL || 'gpt-4o'
            dossierGenerationId = await startGeneration({ userId: decoded.userId, feature: 'dossier', model: dossierModel, prompt: `${subject}:${grade}:${topic}`, metadata: { dossierId, resumed: Boolean(existingCheckpoint) } })
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'checkpoint', dossierId, resumed: Boolean(existingCheckpoint), progress: 2 })}\n\n`))
            // STEP 1: Planning
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', message: 'Dossier wird geplant...', progress: 5 })}\n\n`))

            const competenciesText = competency_codes?.length
              ? `\n\nLehrplan 21 Kompetenzen die abgedeckt werden sollen:\n${competency_codes.map(c => `- ${c}`).join('\n')}`
              : ''

            const schoolStage = Number(grade) >= 7 ? 'Sekundarstufe I' : 'Primarstufe'
            const planningPrompt = `Du bist eine erfahrene Schweizer Lehrperson und Instructional Designer. Erstelle einen detaillierten Strukturplan für ein Lerndossier.

Thema: ${topic}
Klassenstufe: ${grade}. Klasse (${schoolStage}, Schweiz)
Fach: ${subject}
Schwierigkeit: ${difficulty || 'medium'}${competenciesText}${sourceContext}

Erstelle einen JSON-Strukturplan mit 7-10 Sektionen. Das Dossier soll 15-20 Seiten umfassen.

ANTWORTFORMAT (JSON):
{
  "title": "Dossier-Titel",
  "sections": [
    {
      "type": "objectives",
      "title": "Lernziele",
      "description": "Kurze Beschreibung was in dieser Sektion generiert werden soll",
      "estimated_pages": 1
    },
    {
      "type": "theory",
      "title": "Einführung: [Thema]",
      "description": "Einführungstext mit Infokästen zum Thema...",
      "estimated_pages": 3
    },
    {
      "type": "exercises",
      "title": "Übungen Teil 1",
      "description": "Multiple Choice, Lückentext und Zuordnungsaufgaben zu...",
      "estimated_pages": 3
    }
  ],
  "learning_objectives": [
    "Die Schülerinnen und Schüler können...",
    "Die Schülerinnen und Schüler verstehen..."
  ]
}

Sektionstypen: "objectives", "theory", "exercises", "source_text", "creative", "summary", "glossary"

WICHTIG:
- Plane ein abwechslungsreiches, pädagogisch sinnvolles Dossier
- Beginne immer mit Lernzielen
- Wechsle zwischen Theorie und Übungen ab
- Ende mit Zusammenfassung/Reflexion
- Schweizer Kontext und Lehrplan 21`

            let outline = existingCheckpoint?.outline
            if (!outline) try {
              const planningResponse = await openai.chat.completions.create({
                model: dossierModel,
                messages: [
                  { role: 'system', content: planningPrompt },
                  { role: 'user', content: `Erstelle einen Strukturplan für ein Lerndossier zum Thema: ${topic}` }
                ],
                temperature: 0.7,
                response_format: { type: 'json_object' }
              })
              addDossierUsage(planningResponse.usage)
              outline = JSON.parse(planningResponse.choices[0].message.content)
              const outlineQuality = validateDossierOutline(outline)
              if (!outlineQuality.passed) throw new Error(`Plan hat die Qualitätskontrolle nicht bestanden: ${outlineQuality.errors.join(' ')}`)
            } catch (e) {
              throw new Error(`Planungsfehler: ${e.message}`)
            }

            const dossierTitle = outline.title || `${subject}: ${topic}`
            const plannedSections = outline.sections || []
            const learningObjectives = outline.learning_objectives || []
            const totalSections = plannedSections.length

            await db.collection('dossiers').updateOne({ id: dossierId }, { $set: {
              title: dossierTitle, outline, learning_objectives: learningObjectives,
              total_sections: totalSections, updated_at: new Date(), generation_status: 'pending',
            } })

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'plan_complete', title: dossierTitle, sections: plannedSections, totalSections, progress: 15 })}\n\n`))

            // STEP 2: Generate sections one by one
            const generatedSections = (existingCheckpoint?.sections || []).filter(section => section.type !== 'solutions')
            const previousSummaries = generatedSections.map(section => section.summary ? `${section.title}: ${section.summary}` : '').filter(Boolean)
            const allQuestions = generatedSections.flatMap(section => (section.blocks || []).filter(block => block.type === 'question').map(block => block.content || {}))

            const blockInstructions = {
              objectives: `Erstelle eine Lernziel-Checkliste. Verwende diese Block-Typen:
- "heading": Überschriften
- "objectives_checklist": Liste der Lernziele mit code und text
- "text": Einleitender Text`,
              theory: `Erstelle einen informativen Theorieteil. Verwende diese Block-Typen:
- "heading": Überschriften (level 1, 2 oder 3)
- "text": Fliesstext-Absätze (html mit <b>, <i>, <br> Tags)
- "info_box": Infokästen mit variant "wusstest_du", "wichtig", "merke" oder "tipp"
- "table": Tabellen für Vergleiche oder Übersichten`,
              exercises: `Erstelle einen Übungsblock mit verschiedenen Fragetypen. Verwende diese Block-Typen:
- "heading": Überschriften
- "question": Fragen (type: "multiple_choice", "open", "fill_blank", "matching", "ordering", "true_false")
  Jede Frage braucht: id, number, type, question, answer, explanation, answerLines
  Bei multiple_choice zusätzlich: options (Array mit 4 Optionen)
- Erzeuge mindestens 4 vollständige "question"-Blöcke mit unterschiedlichen Fragetypen und Musterlösungen
- "text": Einleitende Texte zwischen Aufgaben`,
              source_text: `Erstelle einen Quellentext mit Verständnisfragen. Verwende:
- "heading": Titel des Quellentexts
- "text": Der Quellentext selbst (ausführlich, 200-400 Wörter)
- "info_box": Kontext-Information zum Text (variant "tipp")
- "question": Verständnisfragen zum Text`,
              creative: `Erstelle eine Kreativaufgabe. Verwende:
- "heading": Titel der Aufgabe
- "text": Ausführliche Aufgabenbeschreibung
- "creative_task": Die eigentliche Aufgabe mit instruction, type ("drawing"/"writing"/"project"), space_lines`,
              summary: `Erstelle eine Zusammenfassung und Reflexion. Verwende:
- "heading": Überschriften
- "text": Zusammenfassender Text der wichtigsten Punkte
- "reflection": Reflexionsfragen für die Schüler
- "objectives_checklist": Selbstcheck der Lernziele`,
              glossary: `Erstelle ein Glossar/Wortschatz. Verwende:
- "heading": Überschrift "Glossar" oder "Wortschatz"
- "glossary": Liste von Begriffen mit Definitionen (terms Array mit term und definition)`
            }

            for (let idx = generatedSections.length; idx < plannedSections.length; idx++) {
              const planned = plannedSections[idx]
              const sectionType = planned.type || 'theory'
              const sectionTitle = planned.title || `Sektion ${idx + 1}`
              const sectionDescription = planned.description || ''
              const progressBase = 15 + Math.floor((idx / totalSections) * 70)

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'section_start', section: sectionTitle, sectionIndex: idx, totalSections, progress: progressBase })}\n\n`))

              const contextText = previousSummaries.length > 0
                ? `\n\nBereits behandelte Inhalte (für Kohärenz):\n${previousSummaries.slice(-3).map(s => `- ${s}`).join('\n')}`
                : ''
              const objectivesText = learningObjectives.length > 0
                ? learningObjectives.map(o => `- ${o}`).join('\n')
                : 'Keine spezifischen Lernziele definiert'

              const sectionPrompt = `Du bist eine erfahrene Schweizer Lehrperson und Instructional Designer. Generiere den Inhalt für EINE Sektion eines Lerndossiers.

=== KONTEXT ===
Thema: ${topic}
Klassenstufe: ${grade}. Klasse
Fach: ${subject}
Schwierigkeit: ${difficulty || 'medium'}

Lernziele des Dossiers:
${objectivesText}
${contextText}${sourceContext}

=== AKTUELLE SEKTION ===
Typ: ${sectionType}
Titel: ${sectionTitle}
Beschreibung: ${sectionDescription}

=== BLOCK-TYPEN ===
${blockInstructions[sectionType] || blockInstructions.theory}

=== ANTWORTFORMAT (JSON) ===
{
  "blocks": [
    {
      "type": "heading",
      "content": { "text": "Überschrift", "level": 2 }
    },
    {
      "type": "text",
      "content": { "html": "<b>Fettgedruckter Text</b> und normaler Text..." }
    }
  ],
  "summary": "Kurze Zusammenfassung dieser Sektion (1-2 Sätze)"
}

WICHTIG:
- Generiere substanzielle, pädagogisch hochwertige Inhalte
- Verwende Schweizer Hochdeutsch
- Texte sollen ausführlich und informativ sein
- Bei Fragen: Kreative, kontextreiche Aufgabenstellungen
- Passe den Sprachstil an die Klassenstufe an`

              let sectionContent
              try {
                const sectionResponse = await openai.chat.completions.create({
                  model: dossierModel,
                  messages: [
                    { role: 'system', content: sectionPrompt },
                    { role: 'user', content: `Generiere die Sektion '${sectionTitle}' für das Dossier '${dossierTitle}'.` }
                  ],
                  temperature: 0.7,
                  response_format: { type: 'json_object' }
                })
                addDossierUsage(sectionResponse.usage)
                sectionContent = JSON.parse(sectionResponse.choices[0].message.content)
                let prepared = prepareDossierSection(sectionContent, { sectionType, grade })
                for (let repairAttempt = 0; repairAttempt < 2 && !prepared.quality.passed; repairAttempt++) {
                  const exerciseRequirement = sectionType === 'exercises'
                    ? ' Die korrigierte Sektion muss mindestens vier vollständige question-Blöcke mit answer enthalten.'
                    : ''
                  const repairResponse = await openai.chat.completions.create({
                    model: dossierModel,
                    messages: [
                      { role: 'system', content: sectionPrompt },
                      { role: 'assistant', content: JSON.stringify(sectionContent) },
                      { role: 'user', content: `Korrigiere die Sektion vollständig. Behebe: ${[...prepared.quality.errors, ...prepared.quality.warnings].join(' ')}.${exerciseRequirement} Gib nur das komplette JSON zurück.` },
                    ],
                    temperature: 0.1,
                    response_format: { type: 'json_object' },
                  })
                  addDossierUsage(repairResponse.usage)
                  sectionContent = JSON.parse(repairResponse.choices[0].message.content)
                  prepared = prepareDossierSection(sectionContent, { sectionType, grade })
                }
                if (sectionType === 'exercises' && !prepared.quality.passed) {
                  const exerciseResponse = await openai.chat.completions.create({
                    model: dossierModel,
                    messages: [
                      {
                        role: 'system',
                        content: `Du erstellst exakt vier hochwertige, unterschiedliche Aufgaben für die ${grade}. Klasse im Fach ${subject}. Antworte nur als JSON: {"questions":[{"type":"open|multiple_choice|fill_blank|true_false","question":"...","options":["...","...","...","..."],"answer":"...","explanation":"...","answerLines":3}]}. Bei multiple_choice muss answer exakt einer Option entsprechen. Jede Aufgabe braucht eine konkrete Musterlösung.`,
                      },
                      { role: 'user', content: `Thema: ${topic}. Sektion: ${sectionTitle}. Lernziele: ${objectivesText}` },
                    ],
                    temperature: 0.2,
                    response_format: { type: 'json_object' },
                  })
                  addDossierUsage(exerciseResponse.usage)
                  const supplemental = JSON.parse(exerciseResponse.choices[0].message.content)
                  const heading = prepared.content.blocks.find(block => block.type === 'heading') || { type: 'heading', content: { text: sectionTitle, level: 2 } }
                  sectionContent = {
                    blocks: [heading, ...(supplemental.questions || []).slice(0, 4).map(question => ({ type: 'question', content: question }))],
                    summary: sectionContent.summary || `Übungen zu ${sectionTitle}`,
                  }
                  prepared = prepareDossierSection(sectionContent, { sectionType, grade })
                }
                if (!prepared.quality.passed) throw new Error(prepared.quality.errors.join(' '))
                sectionContent = prepared.content
              } catch (e) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'section_error', section: sectionTitle, sectionIndex: idx, message: e.message })}\n\n`))
                throw new Error(`Sektion "${sectionTitle}" konnte nicht qualitätsgesichert erstellt werden: ${e.message}`)
              }

              // Process blocks
              const blocks = (sectionContent.blocks || []).map((block, bIdx) => {
                const blockId = `s${idx + 1}_b${bIdx + 1}`
                const processed = {
                  id: blockId,
                  type: block.type || 'text',
                  content: block.content || {},
                  order: bIdx
                }
                if (block.type === 'question') {
                  const qContent = block.content || {}
                  if (!qContent.id) qContent.id = blockId
                  allQuestions.push(qContent)
                }
                return processed
              })

              const sectionId = `sec_${idx + 1}`
              generatedSections.push({
                id: sectionId,
                type: sectionType,
                title: sectionTitle,
                order: idx,
                blocks,
                summary: sectionContent.summary || '',
              })

              const summary = sectionContent.summary || ''
              if (summary) previousSummaries.push(`${sectionTitle}: ${summary}`)

              await db.collection('dossiers').updateOne({ id: dossierId }, { $set: {
                sections: generatedSections, generated_sections: generatedSections.length,
                generation_status: 'pending', last_completed_section: idx, updated_at: new Date(),
              } })

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'section_complete', section: sectionTitle, sectionIndex: idx, totalSections, blockCount: blocks.length, progress: progressBase + Math.floor(70 / totalSections) })}\n\n`))
            }

            const deduplicated = deduplicateDossierQuestions(generatedSections)
            generatedSections.splice(0, generatedSections.length, ...deduplicated.sections)
            allQuestions.splice(0, allQuestions.length, ...generatedSections.flatMap(section =>
              (section.blocks || []).filter(block => block.type === 'question').map(block => block.content || {})
            ))
            if (deduplicated.removed > 0) {
              console.info(JSON.stringify({
                level: 'info', message: 'dossier.questions.deduplicated', dossierId,
                removed: deduplicated.removed, remaining: allQuestions.length,
              }))
            }

            // STEP 3: Generate solutions section
            if (allQuestions.length > 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', message: 'Lösungsteil wird erstellt...', progress: 88 })}\n\n`))

              const solutionsBlocks = [{ id: 'sol_h1', type: 'heading', content: { text: 'Lösungen', level: 1 }, order: 0 }]
              allQuestions.forEach((q, qIdx) => {
                const answerText = q.answer || 'Keine Lösung vorhanden'
                const explanation = q.explanation || ''
                let html = `<b>Frage ${q.number || qIdx + 1}:</b> ${answerText}`
                if (explanation) html += `<br><i>Erklärung: ${explanation}</i>`
                solutionsBlocks.push({ id: `sol_b${qIdx + 1}`, type: 'text', content: { html }, order: qIdx + 1 })
              })

              generatedSections.push({
                id: `sec_${generatedSections.length + 1}`,
                type: 'solutions',
                title: 'Lösungen',
                order: generatedSections.length,
                blocks: solutionsBlocks
              })
            }

            // STEP 4: Save to MongoDB
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', message: 'Dossier wird gespeichert...', progress: 95 })}\n\n`))

            const now = new Date()
            const dossierQuality = evaluateDossier(generatedSections, learningObjectives)
            if (!dossierQuality.passed) throw new Error(`Dossier-Qualitätskontrolle fehlgeschlagen: ${dossierQuality.errors.join(' ')}`)
            const dossier = {
              id: dossierId,
              user_id: decoded.userId,
              title: dossierTitle,
              topic,
              grade,
              subject,
              difficulty: difficulty || 'medium',
              theme: theme || 'classic',
              competency_codes: competency_codes || [],
              learning_objectives: learningObjectives,
              sections: generatedSections,
              generation_status: 'complete',
              generated_sections: generatedSections.length,
              total_sections: generatedSections.length,
              mode: 'dossier',
              quality: dossierQuality,
              created_at: checkpointCreatedAt,
              updated_at: now
            }

            await db.collection('dossiers').updateOne(
              { id: dossierId, user_id: decoded.userId },
              { $set: { ...dossier, completed_at: now } },
            )
            await db.collection('users').updateOne({ id: decoded.userId }, { $inc: { worksheets_used_this_month: 1 } })
            await completeGeneration(dossierGenerationId, {
              result: { dossierId, title: dossierTitle }, usage: dossierUsage, model: dossierModel,
              quality: dossierQuality, metadata: { sections: generatedSections.length },
            })

            const dossierResponse = { ...dossier, created_at: checkpointCreatedAt.toISOString(), updated_at: now.toISOString() }
            delete dossierResponse._id

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'dossier_complete', dossier: dossierResponse, progress: 100 })}\n\n`))
            controller.close()
          } catch (error) {
            console.error('Dossier streaming error:', error)
            if (dossierGenerationId) await failGeneration(dossierGenerationId, error, { dossierId })
            await db.collection('dossiers').updateOne(
              { id: dossierId, user_id: decoded.userId },
              { $set: { generation_status: 'failed', last_error: String(error.message || error).slice(0, 500), updated_at: new Date() } },
            ).catch(() => {})
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: publicErrorMessage(error, 'Dossier-Generierung wurde unterbrochen.'), dossierId, recoverable: true })}\n\n`))
            controller.close()
          }
        }
      })

      const response = new NextResponse(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
      })
      return handleCORS(response)
    }

    // Get user's dossiers - GET /api/dossiers
    if (route === '/dossiers' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))

      const dossiers = await db.collection('dossiers')
        .find({ user_id: decoded.userId }, { projection: { _id: 0, 'sections.blocks': 0 } })
        .sort({ created_at: -1 })
        .limit(100)
        .toArray()

      dossiers.forEach(d => {
        if (d.created_at instanceof Date) d.created_at = d.created_at.toISOString()
        if (d.updated_at instanceof Date) d.updated_at = d.updated_at.toISOString()
      })

      return handleCORS(NextResponse.json(dossiers))
    }

    // Get single dossier - GET /api/dossiers/:id
    if (route.startsWith('/dossiers/') && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))

      const dossierId = path[1]
      const dossier = await db.collection('dossiers').findOne(
        { id: dossierId, user_id: decoded.userId },
        { projection: { _id: 0 } }
      )
      if (!dossier) return handleCORS(NextResponse.json({ error: "Dossier nicht gefunden" }, { status: 404 }))

      if (dossier.created_at instanceof Date) dossier.created_at = dossier.created_at.toISOString()
      if (dossier.updated_at instanceof Date) dossier.updated_at = dossier.updated_at.toISOString()

      return handleCORS(NextResponse.json(dossier))
    }

    // Update dossier - PUT /api/dossiers/:id
    if (route.startsWith('/dossiers/') && method === 'PUT') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))

      const dossierId = path[1]
      const body = await request.json()
      const { title, theme: dossierTheme, sections, competency_codes: codes } = body

      const existing = await db.collection('dossiers').findOne({ id: dossierId, user_id: decoded.userId })
      if (!existing) return handleCORS(NextResponse.json({ error: "Dossier nicht gefunden" }, { status: 404 }))

      const updateData = { updated_at: new Date() }
      if (title !== undefined) updateData.title = title
      if (dossierTheme !== undefined) updateData.theme = dossierTheme
      if (sections !== undefined) updateData.sections = sections
      if (codes !== undefined) updateData.competency_codes = codes

      await db.collection('dossiers').updateOne({ id: dossierId }, { $set: updateData })

      const updated = await db.collection('dossiers').findOne({ id: dossierId }, { projection: { _id: 0 } })
      if (updated.created_at instanceof Date) updated.created_at = updated.created_at.toISOString()
      if (updated.updated_at instanceof Date) updated.updated_at = updated.updated_at.toISOString()

      return handleCORS(NextResponse.json(updated))
    }

    // Delete dossier - DELETE /api/dossiers/:id
    if (route.startsWith('/dossiers/') && method === 'DELETE') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))

      const dossierId = path[1]
      const result = await db.collection('dossiers').deleteOne({ id: dossierId, user_id: decoded.userId })
      if (result.deletedCount === 0) return handleCORS(NextResponse.json({ error: "Dossier nicht gefunden" }, { status: 404 }))

      return handleCORS(NextResponse.json({ message: 'Dossier gelöscht', success: true }))
    }

    // Export dossier PDF - POST /api/export/dossier/pdf
    if (route === '/export/dossier/pdf' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))

      const body = await request.json()
      const { dossier: dossierData, version } = body

      if (!dossierData) return handleCORS(NextResponse.json({ error: "Dossier-Daten fehlen" }, { status: 400 }))

      // For PDF export, we generate a simple PDF using jsPDF on the server side
      // Since we don't have the Python export_service here, we create a clean PDF
      try {
        const { jsPDF } = require('jspdf')
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
        const includeSolutions = version === 'teacher'
        const pageWidth = 210
        const margin = 20
        const contentWidth = pageWidth - 2 * margin
        let y = margin

        const addPage = () => { doc.addPage(); y = margin }
        const checkPage = (needed = 20) => { if (y + needed > 277) addPage() }

        // Title page
        doc.setFontSize(24)
        doc.setFont('helvetica', 'bold')
        const title = dossierData.title || 'Arbeitsdossier'
        doc.text(title, pageWidth / 2, 60, { align: 'center' })

        doc.setFontSize(14)
        doc.setFont('helvetica', 'normal')
        if (dossierData.subject) doc.text(`Fach: ${dossierData.subject}`, pageWidth / 2, 80, { align: 'center' })
        if (dossierData.grade) doc.text(`${dossierData.grade}. Klasse`, pageWidth / 2, 90, { align: 'center' })

        doc.setFontSize(10)
        doc.text(`${version === 'teacher' ? 'Lehrerversion' : 'Schülerversion'}`, pageWidth / 2, 110, { align: 'center' })
        doc.text('Name: ____________________', margin, 140)
        doc.text('Datum: ____________________', margin, 150)

        // Sections
        const sections = dossierData.sections || []
        const visibleSections = sections.filter(section => includeSolutions || section.type !== 'solutions')
        addPage()
        doc.setFillColor(37, 99, 235)
        doc.rect(0, 0, 210, 32, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(20)
        doc.text('Inhalt', margin, 21)
        doc.setTextColor(0, 0, 0)
        y = 48
        visibleSections.forEach((section, index) => {
          checkPage(9)
          doc.setFont('helvetica', index === 0 ? 'bold' : 'normal')
          doc.setFontSize(11)
          doc.text(`${String(index + 1).padStart(2, '0')}  ${section.title || `Abschnitt ${index + 1}`}`, margin, y)
          y += 8
        })
        for (const section of sections) {
          if (section.type === 'solutions' && !includeSolutions) continue

          addPage()

          // Section title
          doc.setFontSize(16)
          doc.setFont('helvetica', 'bold')
          doc.text(section.title || '', margin, y)
          y += 10

          doc.setDrawColor(100, 100, 200)
          doc.setLineWidth(0.5)
          doc.line(margin, y, pageWidth - margin, y)
          y += 8

          // Blocks
          for (const block of (section.blocks || [])) {
            checkPage(15)
            const content = block.content || {}

            if (block.type === 'heading') {
              const level = content.level || 2
              const fontSize = level === 1 ? 14 : level === 2 ? 12 : 11
              doc.setFontSize(fontSize)
              doc.setFont('helvetica', 'bold')
              doc.text(content.text || '', margin, y)
              y += fontSize * 0.5 + 4
            } else if (block.type === 'text') {
              doc.setFontSize(10)
              doc.setFont('helvetica', 'normal')
              const text = (content.html || '').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
              const lines = doc.splitTextToSize(text, contentWidth)
              for (const line of lines) {
                checkPage(6)
                doc.text(line, margin, y)
                y += 5
              }
              y += 3
            } else if (block.type === 'question') {
              doc.setFontSize(10)
              doc.setFont('helvetica', 'bold')
              const qNum = content.number || '?'
              doc.text(`Frage ${qNum}:`, margin, y)
              y += 5
              doc.setFont('helvetica', 'normal')
              const qLines = doc.splitTextToSize(content.question || '', contentWidth - 5)
              for (const line of qLines) {
                checkPage(6)
                doc.text(line, margin + 5, y)
                y += 5
              }
              if (content.type === 'multiple_choice' && content.options) {
                y += 2
                content.options.forEach((opt, i) => {
                  checkPage(6)
                  doc.text(`${String.fromCharCode(65 + i)}) ${opt}`, margin + 8, y)
                  y += 5
                })
              }
              // Answer lines for student version
              if (!includeSolutions) {
                const answerLines = content.answerLines || 3
                y += 2
                for (let i = 0; i < answerLines; i++) {
                  checkPage(8)
                  doc.setDrawColor(200, 200, 200)
                  doc.line(margin + 5, y, pageWidth - margin, y)
                  y += 7
                }
              } else {
                // Teacher version: show answer
                checkPage(10)
                doc.setFontSize(9)
                doc.setTextColor(0, 100, 0)
                doc.setFont('helvetica', 'italic')
                const aLines = doc.splitTextToSize(`Lösung: ${content.answer || ''}`, contentWidth - 5)
                for (const line of aLines) {
                  checkPage(5)
                  doc.text(line, margin + 5, y)
                  y += 4.5
                }
                doc.setTextColor(0, 0, 0)
              }
              y += 5
            } else if (block.type === 'info_box') {
              checkPage(20)
              doc.setFillColor(240, 245, 255)
              const boxText = (content.content || '').replace(/<[^>]+>/g, '')
              const boxLines = doc.splitTextToSize(boxText, contentWidth - 12)
              const boxHeight = 10 + boxLines.length * 5
              doc.roundedRect(margin, y - 2, contentWidth, boxHeight, 2, 2, 'F')
              doc.setFontSize(10)
              doc.setFont('helvetica', 'bold')
              const variantLabels = { wusstest_du: 'Wusstest du?', wichtig: 'Wichtig!', merke: 'Merke dir', tipp: 'Tipp' }
              doc.text(content.title || variantLabels[content.variant] || 'Info', margin + 4, y + 5)
              doc.setFont('helvetica', 'normal')
              doc.setFontSize(9)
              let boxY = y + 10
              for (const line of boxLines) {
                doc.text(line, margin + 4, boxY)
                boxY += 5
              }
              y += boxHeight + 5
            } else if (block.type === 'objectives_checklist') {
              const objectives = content.objectives || []
              doc.setFontSize(10)
              for (const obj of objectives) {
                checkPage(8)
                doc.setFont('helvetica', 'normal')
                doc.rect(margin + 2, y - 3, 3.5, 3.5)
                const objText = obj.code ? `${obj.code}: ${obj.text}` : obj.text
                const objLines = doc.splitTextToSize(objText, contentWidth - 12)
                for (const line of objLines) {
                  doc.text(line, margin + 8, y)
                  y += 5
                }
                y += 2
              }
              y += 3
            } else if (block.type === 'glossary') {
              const terms = content.terms || []
              doc.setFontSize(10)
              for (const t of terms) {
                checkPage(10)
                doc.setFont('helvetica', 'bold')
                doc.text(`${t.term}:`, margin + 2, y)
                doc.setFont('helvetica', 'normal')
                const defLines = doc.splitTextToSize(t.definition || '', contentWidth - 30)
                let defX = margin + 2 + doc.getTextWidth(`${t.term}: `)
                if (defX > margin + 50) { y += 5; defX = margin + 8 }
                for (const line of defLines) {
                  checkPage(5)
                  doc.text(line, defX, y)
                  y += 5
                  defX = margin + 8
                }
                y += 2
              }
            } else if (block.type === 'table') {
              const headers = content.headers || []
              const rows = content.rows || []
              if (headers.length > 0) {
                checkPage(10 + rows.length * 7)
                const colWidth = contentWidth / headers.length
                doc.setFontSize(9)
                doc.setFont('helvetica', 'bold')
                doc.setFillColor(230, 230, 240)
                doc.rect(margin, y - 4, contentWidth, 7, 'F')
                headers.forEach((h, i) => { doc.text(h, margin + i * colWidth + 2, y) })
                y += 7
                doc.setFont('helvetica', 'normal')
                for (const row of rows) {
                  checkPage(7)
                  row.forEach((cell, i) => { doc.text(String(cell || ''), margin + i * colWidth + 2, y) })
                  y += 6
                }
                y += 4
              }
            } else if (block.type === 'creative_task') {
              checkPage(35)
              doc.setFillColor(255, 247, 237)
              doc.roundedRect(margin, y - 3, contentWidth, 18, 2, 2, 'F')
              doc.setFont('helvetica', 'bold')
              doc.setFontSize(11)
              doc.text('Kreativauftrag', margin + 4, y + 3)
              doc.setFont('helvetica', 'normal')
              const taskLines = doc.splitTextToSize(content.instruction || content.text || '', contentWidth - 10)
              y += 10
              taskLines.forEach(line => { checkPage(6); doc.text(line, margin + 4, y); y += 5 })
              const spaceLines = Math.min(14, Math.max(3, Number(content.space_lines) || 8))
              y += 4
              for (let line = 0; line < spaceLines; line++) {
                checkPage(8)
                doc.setDrawColor(210, 215, 225)
                doc.line(margin + 4, y, pageWidth - margin - 4, y)
                y += 7
              }
            } else if (block.type === 'reflection') {
              const prompts = content.questions || content.prompts || []
              doc.setFont('helvetica', 'bold')
              doc.setFontSize(11)
              doc.text('Reflexion', margin, y)
              y += 7
              for (const prompt of prompts) {
                checkPage(24)
                doc.setFont('helvetica', 'normal')
                const promptLines = doc.splitTextToSize(`- ${prompt}`, contentWidth - 4)
                promptLines.forEach(line => { doc.text(line, margin + 2, y); y += 5 })
                for (let answerLine = 0; answerLine < 2; answerLine++) {
                  y += 5
                  doc.setDrawColor(210, 215, 225)
                  doc.line(margin + 4, y, pageWidth - margin - 4, y)
                }
                y += 6
              }
            }
          }
        }

        // Footer on each page
        const totalPages = doc.internal.getNumberOfPages()
        for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i)
          doc.setFontSize(8)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(150, 150, 150)
          doc.text(`${title} | Seite ${i} von ${totalPages}`, pageWidth / 2, 290, { align: 'center' })
          if (i > 1) {
            doc.setTextColor(37, 99, 235)
            doc.setFont('helvetica', 'bold')
            doc.text(version === 'teacher' ? 'EDUFLOW - LEHRPERSON' : 'EDUFLOW - LERNMATERIAL', margin, 10)
          }
          doc.setTextColor(0, 0, 0)
        }

        const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
        const versionLabel = version === 'teacher' ? 'Lehrerversion' : 'Schuelerversion'
        const filename = `${title.replace(/[/\\]/g, '-')}_${versionLabel}.pdf`

        return new Response(pdfBuffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            ...Object.fromEntries(handleCORS(new Response()).headers)
          }
        })
      } catch (e) {
        console.error('Dossier PDF export error:', e)
        return handleCORS(NextResponse.json({ error: `PDF-Export fehlgeschlagen: ${e.message}` }, { status: 500 }))
      }
    }

    // Route not found
    return handleCORS(NextResponse.json(
      { error: `Route ${route} not found` },
      { status: 404 }
    ))

  } catch (error) {
    logEvent('error', 'api.request.failed', { requestId, route, method, durationMs: Date.now() - requestStartedAt, error })
    return handleCORS(NextResponse.json(
      { error: publicErrorMessage(error) },
      { status: 500 }
    ))
  }
}

// Export all HTTP methods
export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
