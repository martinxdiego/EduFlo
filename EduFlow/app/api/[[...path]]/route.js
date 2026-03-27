import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

// MongoDB connection
let client
let db
let connectPromise

async function connectToMongo() {
  if (db) return db
  if (connectPromise) return connectPromise

  connectPromise = (async () => {
    try {
      client = new MongoClient(process.env.MONGO_URL)
      await client.connect()
      db = client.db(process.env.DB_NAME)
      return db
    } catch (error) {
      client = null
      db = null
      connectPromise = null
      throw error
    }
  })()

  return connectPromise
}

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Helper function to handle CORS
function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

// OPTIONS handler for CORS
export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

// Auth middleware
async function verifyToken(request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  
  const token = authHeader.substring(7)
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    return decoded
  } catch (error) {
    return null
  }
}

// Swiss curriculum system prompt
function getSystemPrompt(grade, subject, difficulty) {
  const difficultyDescriptions = {
    easy: 'einfach (basic understanding, simple recall)',
    medium: 'mittel (application and analysis)',
    hard: 'schwierig (synthesis and evaluation)'
  }

  return `You are an expert Swiss primary school teacher creating worksheets aligned with Lehrplan 21 (Swiss curriculum).

Grade Level: ${grade} (Primarschule)
Subject: ${subject}
Difficulty: ${difficultyDescriptions[difficulty]}

Create age-appropriate questions that:
- Use clear, simple German suitable for grade ${grade}
- Align with Lehrplan 21 competencies
- Include varied question types (multiple choice, short answer, problem-solving)
- Are engaging and relevant to Swiss students
- Consider Swiss cultural context

Format your response as a JSON object with:
{
  "title": "Worksheet title in German",
  "questions": [
    {
      "number": 1,
      "type": "multiple_choice" | "short_answer" | "problem_solving",
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

// Route handler function
async function handleRoute(request, { params }) {
  const { path = [] } = params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    const db = await connectToMongo()

    // Root endpoint
    if (route === '/' && method === 'GET') {
      return handleCORS(NextResponse.json({ message: "TeacherTime API v1.0" }))
    }

    // ========== AUTH ENDPOINTS ==========
    
    // Register - POST /api/auth/register
    if (route === '/auth/register' && method === 'POST') {
      const body = await request.json()
      const { email, password, name } = body

      if (!email || !password || !name) {
        return handleCORS(NextResponse.json(
          { error: "Email, password, and name are required" },
          { status: 400 }
        ))
      }

      // Check if user exists
      const existingUser = await db.collection('users').findOne({ email })
      if (existingUser) {
        return handleCORS(NextResponse.json(
          { error: "User already exists" },
          { status: 400 }
        ))
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, 10)

      // Create user
      const user = {
        id: uuidv4(),
        email,
        password_hash,
        name,
        subscription_tier: 'free',
        worksheets_used_this_month: 0,
        created_at: new Date(),
        month_reset_date: new Date()
      }

      await db.collection('users').insertOne(user)

      // Generate token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      )

      const { password_hash: _, ...userWithoutPassword } = user
      return handleCORS(NextResponse.json({ user: userWithoutPassword, token }))
    }

    // Login - POST /api/auth/login
    if (route === '/auth/login' && method === 'POST') {
      const body = await request.json()
      const { email, password } = body

      if (!email || !password) {
        return handleCORS(NextResponse.json(
          { error: "Email and password are required" },
          { status: 400 }
        ))
      }

      // Find user
      const user = await db.collection('users').findOne({ email })
      if (!user) {
        return handleCORS(NextResponse.json(
          { error: "Invalid credentials" },
          { status: 401 }
        ))
      }

      // Verify password
      const valid = await bcrypt.compare(password, user.password_hash)
      if (!valid) {
        return handleCORS(NextResponse.json(
          { error: "Invalid credentials" },
          { status: 401 }
        ))
      }

      // Generate token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      )

      const { password_hash: _, ...userWithoutPassword } = user
      return handleCORS(NextResponse.json({ user: userWithoutPassword, token }))
    }

    // Get current user - GET /api/auth/me
    if (route === '/auth/me' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      const user = await db.collection('users').findOne({ id: decoded.userId })
      if (!user) {
        return handleCORS(NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        ))
      }

      // Reset monthly count if needed
      const now = new Date()
      const lastReset = new Date(user.month_reset_date)
      if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
        await db.collection('users').updateOne(
          { id: user.id },
          { $set: { worksheets_used_this_month: 0, month_reset_date: now } }
        )
        user.worksheets_used_this_month = 0
      }

      const { password_hash: _, ...userWithoutPassword } = user
      return handleCORS(NextResponse.json(userWithoutPassword))
    }

    // ========== STUDENT AUTH ==========

    // Register student - POST /api/student/register
    if (route === '/student/register' && method === 'POST') {
      const body = await request.json()
      const { username, password, displayName } = body

      if (!username || !password || !displayName) {
        return handleCORS(NextResponse.json({ error: 'Benutzername, Passwort und Anzeigename sind erforderlich.' }, { status: 400 }))
      }

      if (username.length < 3) {
        return handleCORS(NextResponse.json({ error: 'Benutzername muss mindestens 3 Zeichen lang sein.' }, { status: 400 }))
      }

      if (password.length < 4) {
        return handleCORS(NextResponse.json({ error: 'Passwort muss mindestens 4 Zeichen lang sein.' }, { status: 400 }))
      }

      const existing = await db.collection('students').findOne({ username: username.toLowerCase() })
      if (existing) {
        return handleCORS(NextResponse.json({ error: 'Dieser Benutzername ist bereits vergeben.' }, { status: 400 }))
      }

      const password_hash = await bcrypt.hash(password, 10)
      const student = {
        id: uuidv4(),
        username: username.toLowerCase(),
        display_name: displayName,
        password_hash,
        created_at: new Date(),
        total_quizzes: 0,
        total_points: 0,
        streak: 0,
        last_activity: new Date()
      }

      await db.collection('students').insertOne(student)

      const token = jwt.sign(
        { studentId: student.id, username: student.username, role: 'student' },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      )

      const { password_hash: _, ...safe } = student
      return handleCORS(NextResponse.json({ student: { ...safe, _id: undefined }, token }))
    }

    // Login student - POST /api/student/login
    if (route === '/student/login' && method === 'POST') {
      const body = await request.json()
      const { username, password } = body

      if (!username || !password) {
        return handleCORS(NextResponse.json({ error: 'Benutzername und Passwort sind erforderlich.' }, { status: 400 }))
      }

      const student = await db.collection('students').findOne({ username: username.toLowerCase() })
      if (!student) {
        return handleCORS(NextResponse.json({ error: 'Benutzername oder Passwort falsch.' }, { status: 401 }))
      }

      const valid = await bcrypt.compare(password, student.password_hash)
      if (!valid) {
        return handleCORS(NextResponse.json({ error: 'Benutzername oder Passwort falsch.' }, { status: 401 }))
      }

      const token = jwt.sign(
        { studentId: student.id, username: student.username, role: 'student' },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      )

      // Update last activity
      await db.collection('students').updateOne({ id: student.id }, { $set: { last_activity: new Date() } })

      const { password_hash: _, ...safe } = student
      return handleCORS(NextResponse.json({ student: { ...safe, _id: undefined }, token }))
    }

    // Get current student - GET /api/student/me
    if (route === '/student/me' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded || decoded.role !== 'student') {
        return handleCORS(NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 }))
      }

      const student = await db.collection('students').findOne({ id: decoded.studentId })
      if (!student) {
        return handleCORS(NextResponse.json({ error: 'Schüler nicht gefunden.' }, { status: 404 }))
      }

      const { password_hash: _, ...safe } = student
      return handleCORS(NextResponse.json({ ...safe, _id: undefined }))
    }

    // Get student's submissions history - GET /api/student/my-results
    if (route === '/student/my-results' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded || decoded.role !== 'student') {
        return handleCORS(NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 }))
      }

      const submissions = await db.collection('submissions').find({ student_id: decoded.studentId }).sort({ submitted_at: -1 }).toArray()

      // Enrich with assignment info
      const enriched = await Promise.all(submissions.map(async (sub) => {
        const { _id, ...clean } = sub
        const assignment = await db.collection('assignments').findOne({ id: clean.assignment_id })
        clean.assignment_title = assignment?.worksheet_title || 'Unbenannt'
        clean.class_name = assignment?.class_name || ''
        // Calculate Swiss grade
        if (!clean.swiss_grade && clean.total_points > 0) {
          clean.swiss_grade = Math.round((clean.earned_points / clean.total_points * 5 + 1) * 2) / 2
        }
        return clean
      }))

      // Calculate stats
      const totalQuizzes = enriched.length
      const totalPoints = enriched.reduce((sum, s) => sum + (s.earned_points || 0), 0)
      const avgScore = totalQuizzes > 0 ? Math.round(enriched.reduce((sum, s) => sum + (s.score_percentage || 0), 0) / totalQuizzes) : 0
      const avgGrade = totalQuizzes > 0 ? Math.round(enriched.reduce((sum, s) => sum + (s.swiss_grade || 1), 0) / totalQuizzes * 10) / 10 : 0
      const bestGrade = totalQuizzes > 0 ? Math.max(...enriched.map(s => s.swiss_grade || 1)) : 0

      return handleCORS(NextResponse.json({
        submissions: enriched,
        stats: { totalQuizzes, totalPoints, avgScore, avgGrade, bestGrade }
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

    // Teacher: Get class-wide learning insights - GET /api/classes/:id/insights
    if (route.match(/^\/classes\/[^/]+\/insights$/) && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const classId = path[1]
      const cls = await db.collection('classes').findOne({ id: classId, teacher_id: decoded.userId })
      if (!cls) return handleCORS(NextResponse.json({ error: 'Klasse nicht gefunden.' }, { status: 404 }))

      const studentIds = (cls.enrolled_students || []).map(s => s.student_id)
      if (studentIds.length === 0) return handleCORS(NextResponse.json({ students: [], topicWeaknesses: [], recommendations: '' }))

      // Get all submissions from class students
      const submissions = await db.collection('submissions').find({ student_id: { $in: studentIds } }).toArray()
      const assignmentIds = [...new Set(submissions.map(s => s.assignment_id))]
      const assignments = await db.collection('assignments').find({ id: { $in: assignmentIds } }).toArray()
      const worksheetIds = [...new Set(assignments.map(a => a.worksheet_id))]
      const worksheets = await db.collection('worksheets').find({ id: { $in: worksheetIds } }).toArray()
      const wsMap = {}; worksheets.forEach(w => { wsMap[w.id] = w })
      const aMap = {}; assignments.forEach(a => { aMap[a.id] = a })

      // Per-student weakness analysis
      const studentInsights = {}
      studentIds.forEach(sid => { studentInsights[sid] = { topics: {}, totalWrong: 0, totalQuestions: 0 } })

      // Class-wide topic analysis
      const classTopicErrors = {}

      submissions.forEach(sub => {
        if (!sub.student_id || !studentInsights[sub.student_id]) return
        const assignment = aMap[sub.assignment_id]
        const worksheet = assignment ? wsMap[assignment.worksheet_id] : null
        const topic = worksheet?.topic || 'Unbekannt'
        const subject = worksheet?.subject || ''

        ;(sub.question_results || []).forEach(qr => {
          studentInsights[sub.student_id].totalQuestions++
          if (!classTopicErrors[topic]) classTopicErrors[topic] = { total: 0, wrong: 0, subject, studentsWrong: new Set() }
          classTopicErrors[topic].total++

          if (qr.isCorrect === false) {
            studentInsights[sub.student_id].totalWrong++
            if (!studentInsights[sub.student_id].topics[topic]) studentInsights[sub.student_id].topics[topic] = { wrong: 0, total: 0 }
            studentInsights[sub.student_id].topics[topic].wrong++
            studentInsights[sub.student_id].topics[topic].total++
            classTopicErrors[topic].wrong++
            classTopicErrors[topic].studentsWrong.add(sub.student_id)
          } else {
            if (!studentInsights[sub.student_id].topics[topic]) studentInsights[sub.student_id].topics[topic] = { wrong: 0, total: 0 }
            studentInsights[sub.student_id].topics[topic].total++
          }
        })
      })

      // Format student insights
      const enrolled = cls.enrolled_students || []
      const students = enrolled.map(es => {
        const si = studentInsights[es.student_id] || { topics: {}, totalWrong: 0, totalQuestions: 0 }
        const weakTopics = Object.entries(si.topics)
          .filter(([_, v]) => v.total >= 2 && (v.wrong / v.total) > 0.3)
          .sort((a, b) => (b[1].wrong / b[1].total) - (a[1].wrong / a[1].total))
          .slice(0, 3)
          .map(([topic, v]) => ({ topic, errorRate: Math.round((v.wrong / v.total) * 100), wrong: v.wrong, total: v.total }))

        return {
          student_id: es.student_id,
          display_name: es.display_name,
          niveau: es.niveau || 'B',
          totalQuestions: si.totalQuestions,
          totalWrong: si.totalWrong,
          errorRate: si.totalQuestions > 0 ? Math.round((si.totalWrong / si.totalQuestions) * 100) : 0,
          weakTopics,
          needsHelp: weakTopics.length > 0
        }
      })

      // Class-wide topic weaknesses
      const topicWeaknesses = Object.entries(classTopicErrors)
        .filter(([_, v]) => v.total >= 3)
        .map(([topic, v]) => ({
          topic,
          subject: v.subject,
          errorRate: Math.round((v.wrong / v.total) * 100),
          affectedStudents: v.studentsWrong.size,
          totalStudents: studentIds.length,
          total: v.total,
          wrong: v.wrong
        }))
        .sort((a, b) => b.affectedStudents - a.affectedStudents || b.errorRate - a.errorRate)

      // AI recommendations for teacher
      let recommendations = ''
      if (topicWeaknesses.length > 0) {
        try {
          const insightPrompt = `Du bist ein erfahrener Schweizer Schulberater. Analysiere diese Klassendaten und gib der Lehrperson konkrete Handlungsempfehlungen auf Deutsch:

Klasse: ${cls.name}
Schüleranzahl: ${studentIds.length}

Schwache Themen der Klasse:
${topicWeaknesses.slice(0, 5).map(tw => `- "${tw.topic}" (${tw.subject}): ${tw.errorRate}% Fehlerquote, ${tw.affectedStudents}/${tw.totalStudents} Schüler betroffen`).join('\n')}

Schüler die besondere Förderung brauchen:
${students.filter(s => s.needsHelp).map(s => `- ${s.display_name} (Niveau ${s.niveau}): Schwächen in ${s.weakTopics.map(t => t.topic).join(', ')}`).join('\n') || 'Keine auffälligen Schwächen'}

Gib:
1. Top 3 Massnahmen für den Unterricht (konkret und umsetzbar)
2. Differenzierungsvorschläge nach Niveau A/B/C
3. Empfohlene Übungsformate`

          const aiRes = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: insightPrompt }],
            max_tokens: 800
          })
          recommendations = aiRes.choices[0]?.message?.content || ''
        } catch (e) { console.error('Insights AI error:', e) }
      }

      return handleCORS(NextResponse.json({
        students: students.sort((a, b) => b.errorRate - a.errorRate),
        topicWeaknesses,
        recommendations,
        totalSubmissions: submissions.length
      }))
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

      // Check which ones the student already submitted
      const mySubmissions = await db.collection('submissions').find({ student_id: decoded.studentId }).toArray()
      const submittedAssignmentIds = new Set(mySubmissions.map(s => s.assignment_id))

      // Get student's niveau per class
      const classes = await db.collection('classes').find({ id: { $in: classIds } }).toArray()
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
          return {
            id: a.id,
            code: a.code,
            title: a.worksheet_title,
            class_name: cls?.name || a.class_name,
            class_id: a.class_id,
            target_niveau: a.target_niveau,
            deadline: a.deadline,
            created_at: a.created_at,
            already_submitted: submittedAssignmentIds.has(a.id),
            access_url: a.access_url
          }
        })

      return handleCORS(NextResponse.json(enriched))
    }

    // Get class-wide stats across all assignments - GET /api/classes/:id/stats
    if (route.match(/^\/classes\/[^/]+\/stats$/) && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const classId = path[1]
      const cls = await db.collection('classes').findOne({ id: classId, teacher_id: decoded.userId })
      if (!cls) return handleCORS(NextResponse.json({ error: 'Klasse nicht gefunden.' }, { status: 404 }))

      // Get all assignments for this class
      const assignments = await db.collection('assignments').find({ class_id: classId }).toArray()
      if (assignments.length === 0) return handleCORS(NextResponse.json({ assignments: [], studentStats: [], classStats: null }))

      const assignmentIds = assignments.map(a => a.id)
      const submissions = await db.collection('submissions').find({ assignment_id: { $in: assignmentIds } }).toArray()

      // Per-student aggregation
      const studentMap = {}
      const enrolled = cls.enrolled_students || []
      enrolled.forEach(s => {
        studentMap[s.student_id] = {
          student_id: s.student_id,
          display_name: s.display_name,
          niveau: s.niveau || 'B',
          submissions: 0,
          total_earned: 0,
          total_possible: 0,
          grades: [],
          avg_grade: null,
          avg_score: null
        }
      })

      submissions.forEach(sub => {
        if (sub.student_id && studentMap[sub.student_id]) {
          const sm = studentMap[sub.student_id]
          sm.submissions++
          sm.total_earned += sub.earned_points || 0
          sm.total_possible += sub.total_points || 0
          sm.grades.push(sub.swiss_grade || 1)
        }
      })

      const studentStats = Object.values(studentMap).map(sm => {
        if (sm.grades.length > 0) {
          sm.avg_grade = Math.round(sm.grades.reduce((a, b) => a + b, 0) / sm.grades.length * 10) / 10
          sm.avg_score = sm.total_possible > 0 ? Math.round((sm.total_earned / sm.total_possible) * 100) : 0
        }
        return sm
      })

      // Class-wide stats
      const allGrades = submissions.map(s => s.swiss_grade || 1)
      const classStats = allGrades.length > 0 ? {
        totalAssignments: assignments.length,
        totalSubmissions: submissions.length,
        avgGrade: Math.round(allGrades.reduce((a, b) => a + b, 0) / allGrades.length * 10) / 10,
        bestGrade: Math.max(...allGrades),
        worstGrade: Math.min(...allGrades),
        passing: allGrades.filter(g => g >= 4).length,
        failing: allGrades.filter(g => g < 4).length,
        passRate: Math.round((allGrades.filter(g => g >= 4).length / allGrades.length) * 100),
        niveauStats: {
          A: studentStats.filter(s => s.niveau === 'A'),
          B: studentStats.filter(s => s.niveau === 'B'),
          C: studentStats.filter(s => s.niveau === 'C')
        }
      } : null

      const assignmentSummaries = assignments.map(a => {
        const subs = submissions.filter(s => s.assignment_id === a.id)
        const grades = subs.map(s => s.swiss_grade || 1)
        return {
          id: a.id,
          title: a.worksheet_title,
          target_niveau: a.target_niveau,
          created_at: a.created_at,
          submission_count: subs.length,
          avg_grade: grades.length > 0 ? Math.round(grades.reduce((x, y) => x + y, 0) / grades.length * 10) / 10 : null
        }
      })

      return handleCORS(NextResponse.json({ assignments: assignmentSummaries, studentStats, classStats }))
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
      const { topic, grade, subject, difficulty, questionCount } = body

      if (!topic || !grade || !subject || !difficulty) {
        return handleCORS(NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 }
        ))
      }

      // Generate with OpenAI
      const systemPrompt = getSystemPrompt(grade, subject, difficulty)
      const userPrompt = `Create a worksheet with ${questionCount || 10} questions about: ${topic}\n\nMake it engaging and appropriate for ${grade}. Klasse students in Switzerland.`

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      })

      const worksheetContent = JSON.parse(completion.choices[0].message.content)

      // Save worksheet
      const worksheet = {
        id: uuidv4(),
        user_id: user.id,
        title: worksheetContent.title,
        topic,
        grade,
        subject,
        difficulty,
        question_count: questionCount || 10,
        content: worksheetContent,
        created_at: new Date()
      }

      await db.collection('worksheets').insertOne(worksheet)

      // Update usage count
      await db.collection('users').updateOne(
        { id: user.id },
        { $inc: { worksheets_used_this_month: 1 } }
      )

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
      const { topic, grade, subject, difficulty, questionCount, questionTypes, resourceType } = body

      if (!topic || !grade || !subject || !difficulty) {
        return handleCORS(NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 }
        ))
      }

      // Create a streaming response
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          try {
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

            const userPrompt = `Erstelle ${materialType} mit ${questionCount || 10} Fragen zum Thema: ${topic}\n\nDas Material ist für die ${grade}. Klasse in der Schweiz. Formuliere die Fragen klar, abwechslungsreich und didaktisch sinnvoll. Die Sprache soll natürlich klingen, nicht wie ein KI-Generator.${questionTypeInstruction}\n\n${pointsInstruction}`

            const stream = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
              ],
              temperature: 0.7,
              response_format: { type: "json_object" },
              stream: true
            })

            let fullContent = ''
            let currentQuestionCount = 0

            for await (const chunk of stream) {
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

            const worksheetContent = JSON.parse(fullContent)

            // Save worksheet
            const worksheet = {
              id: uuidv4(),
              user_id: user.id,
              title: worksheetContent.title,
              topic,
              grade,
              subject,
              difficulty,
              resourceType: resourceType || 'worksheet',
              question_count: questionCount || 10,
              content: { ...worksheetContent, resourceType: resourceType || 'worksheet' },
              created_at: new Date()
            }

            await db.collection('worksheets').insertOne(worksheet)

            // Update usage count
            await db.collection('users').updateOne(
              { id: user.id },
              { $inc: { worksheets_used_this_month: 1 } }
            )

            // Send completion
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'complete', 
              worksheet,
              progress: 100 
            })}\n\n`))

            controller.close()
          } catch (error) {
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

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      })

      const worksheetContent = JSON.parse(completion.choices[0].message.content)

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
        content: worksheetContent,
        created_at: new Date(),
        regenerated_from: worksheetId
      }

      await db.collection('worksheets').insertOne(worksheet)

      return handleCORS(NextResponse.json(worksheet))
    }

    // ========== SUBSCRIPTION MANAGEMENT ==========

    // Upgrade to premium (MOCK - Stripe integration placeholder)
    if (route === '/subscribe/premium' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      // Mock payment success
      await db.collection('users').updateOne(
        { id: decoded.userId },
        { $set: { subscription_tier: 'premium' } }
      )

      return handleCORS(NextResponse.json({ 
        success: true, 
        message: "Upgraded to Premium! (Mock payment - Stripe integration coming soon)" 
      }))
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

        // Read file content
        const buffer = Buffer.from(await file.arrayBuffer())

        let analysisPrompt = ''
        let messages = []

        if (fileType.startsWith('image/') || fileType === 'application/pdf') {
          // Use Vision API for images and PDFs
          const base64 = buffer.toString('base64')
          const mediaType = fileType.startsWith('image/') ? fileType : 'image/png'

          messages = [
            {
              role: 'system',
              content: `Du bist ein erfahrener Schweizer Lehrperson-Assistent. Analysiere das hochgeladene Dokument/Bild und extrahiere den Lehrinhalt daraus.

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
              content: [
                { type: 'text', text: `Analysiere dieses Dokument: "${fileName}" (${(fileSize/1024).toFixed(0)} KB)` },
                { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } }
              ]
            }
          ]
        } else {
          // For text-based files (txt, docx content, csv etc.), extract text and send to GPT
          let textContent = ''

          if (fileType === 'text/plain' || fileName.endsWith('.txt') || fileName.endsWith('.csv')) {
            textContent = buffer.toString('utf-8').substring(0, 8000)
          } else if (fileName.endsWith('.rtf')) {
            textContent = buffer.toString('utf-8').replace(/\\[a-z]+\d*\s?/g, '').replace(/[{}]/g, '').substring(0, 8000)
          } else {
            // For binary files (docx, pptx, xlsx, audio, video), extract what we can
            textContent = `[Binärdatei: ${fileName}, Typ: ${fileType}, Grösse: ${(fileSize/1024).toFixed(0)} KB. Textextraktion nicht möglich – bitte beschreiben Sie den gewünschten Inhalt in den Anweisungen.]`
          }

          messages = [
            {
              role: 'system',
              content: `Du bist ein erfahrener Schweizer Lehrperson-Assistent. Analysiere den folgenden Textinhalt eines hochgeladenen Dokuments und extrahiere den Lehrinhalt daraus.

Antworte als JSON:
{
  "title": "Erkannter Titel oder Thema",
  "subject": "Erkanntes Fach",
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
              content: `Datei: "${fileName}" (${fileType}, ${(fileSize/1024).toFixed(0)} KB)\n\nInhalt:\n${textContent}`
            }
          ]
        }

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.5,
          response_format: { type: 'json_object' },
          max_tokens: 1000,
        })

        const analysis = JSON.parse(completion.choices[0].message.content)
        return handleCORS(NextResponse.json({ analysis }))
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
          }
        }))
      }
    }

    // ========== AI CHAT ASSISTANT ==========

    // Chat - POST /api/chat
    if (route === '/chat' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      }

      const body = await request.json()
      const { message, worksheetContext, chatHistory = [] } = body

      if (!message) {
        return handleCORS(NextResponse.json({ error: "Message is required" }, { status: 400 }))
      }

      const wsContext = worksheetContext
        ? `\n\nAktuelles Material: "${worksheetContext.title}" (${worksheetContext.subject}, ${worksheetContext.grade}. Klasse, ${worksheetContext.difficulty})\nAnzahl Fragen: ${worksheetContext.questionCount}\nFragetypen: ${worksheetContext.questionTypes || 'gemischt'}`
        : ''

      const systemMsg = `Du bist der EduFlow-Assistent – ein freundlicher, kompetenter pädagogischer Helfer für Schweizer Lehrpersonen. Du sprichst Schweizer Hochdeutsch (nicht Dialekt, aber natürlich).

Deine Persönlichkeit:
- Motivierend und warmherzig, aber professionell
- Kompetent in Didaktik und Lehrplan 21
- Gibt konkrete, umsetzbare Tipps
- Schlägt aktiv Verbesserungen vor
- Nutzt gelegentlich passende Emojis (sparsam)
- Antworte IMMER auf Deutsch

Du kannst helfen bei:
- Fragen erstellen, bearbeiten, vereinfachen, erschweren
- Fragetypen umwandeln (MC ↔ offen ↔ Lückentext etc.)
- Differenzierung (leichter/schwieriger)
- Lehrplan-21-Bezug herstellen
- Material exportieren und formatieren
- Didaktische Tipps geben
- Aufgaben kindgerechter formulieren

WICHTIG: Halte deine Antworten kurz und hilfreich (max. 3-4 Sätze). Biete am Ende immer 1-2 konkrete nächste Schritte an.${wsContext}`

      const messages = [
        { role: 'system', content: systemMsg },
        ...chatHistory.slice(-10).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
      ]

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.8,
          max_tokens: 500,
        })

        const reply = completion.choices[0].message.content
        return handleCORS(NextResponse.json({ reply }))
      } catch (aiError) {
        console.error('Chat AI error:', aiError)
        return handleCORS(NextResponse.json({ error: 'KI-Fehler. Bitte versuchen Sie es erneut.' }, { status: 500 }))
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
      const { content, title, status: wsStatus } = body

      const updateFields = {}
      if (content) updateFields.content = content
      if (title) updateFields.title = title
      if (wsStatus) updateFields.status = wsStatus
      updateFields.updated_at = new Date()

      const result = await db.collection('worksheets').updateOne(
        { id: worksheetId, user_id: decoded.userId },
        { $set: updateFields }
      )

      if (result.matchedCount === 0) {
        return handleCORS(NextResponse.json(
          { error: "Worksheet not found" },
          { status: 404 }
        ))
      }

      const updated = await db.collection('worksheets').findOne({ id: worksheetId })
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

        const response = await openai.images.generate({
          model: 'dall-e-3',
          prompt: enhancedPrompt,
          n: 1,
          size: size,
          quality: 'standard',
        })

        const imageUrl = response.data[0]?.url
        if (!imageUrl) {
          return handleCORS(NextResponse.json({ error: 'Bildgenerierung fehlgeschlagen' }, { status: 500 }))
        }

        return handleCORS(NextResponse.json({ imageUrl, revisedPrompt: response.data[0]?.revised_prompt }))
      } catch (imgError) {
        console.error('Image generation error:', imgError)
        return handleCORS(NextResponse.json({ error: imgError.message || 'Bildgenerierung fehlgeschlagen' }, { status: 500 }))
      }
    }

    // ========== STUDENT MODE (Schüler-Modus) ==========

    // ========== CLASS MANAGEMENT ==========

    // Create/update class - POST /api/classes
    if (route === '/classes' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { name, students } = body
      if (!name) return handleCORS(NextResponse.json({ error: "Klassenname erforderlich" }, { status: 400 }))
      const existingClass = await db.collection('classes').findOne({ name, teacher_id: decoded.userId })
      if (existingClass) {
        await db.collection('classes').updateOne({ id: existingClass.id }, { $set: { students: students || existingClass.students, updated_at: new Date() } })
        const updated = await db.collection('classes').findOne({ id: existingClass.id })
        const { _id, ...clean } = updated
        return handleCORS(NextResponse.json(clean))
      }
      const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase()
      const newClass = {
        id: uuidv4(),
        name,
        teacher_id: decoded.userId,
        join_code: joinCode,
        students: students || [],
        enrolled_students: [], // { student_id, display_name, joined_at, niveau }
        created_at: new Date(),
        updated_at: new Date()
      }
      await db.collection('classes').insertOne(newClass)
      const { _id, ...clean } = newClass
      return handleCORS(NextResponse.json(clean))
    }

    // Get teacher's classes - GET /api/classes
    if (route === '/classes' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const classes = await db.collection('classes').find({ teacher_id: decoded.userId }).sort({ name: 1 }).toArray()
      const cleaned = classes.map(({ _id, ...c }) => c)
      return handleCORS(NextResponse.json(cleaned))
    }

    // Get class details with enrolled students - GET /api/classes/:id
    if (route.match(/^\/classes\/[^/]+$/) && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const classId = path[1]
      const cls = await db.collection('classes').findOne({ id: classId, teacher_id: decoded.userId })
      if (!cls) return handleCORS(NextResponse.json({ error: 'Klasse nicht gefunden.' }, { status: 404 }))
      // Enrich enrolled students with latest stats
      const enriched = await Promise.all((cls.enrolled_students || []).map(async (es) => {
        const student = await db.collection('students').findOne({ id: es.student_id })
        const submissions = await db.collection('submissions').find({ student_id: es.student_id }).toArray()
        const avgGrade = submissions.length > 0
          ? Math.round(submissions.reduce((s, sub) => s + (sub.swiss_grade || 1), 0) / submissions.length * 10) / 10
          : null
        return {
          ...es,
          display_name: student?.display_name || es.display_name,
          total_quizzes: student?.total_quizzes || 0,
          total_points: student?.total_points || 0,
          xp: student?.xp || 0,
          level: student?.level || 1,
          streak: student?.streak || 0,
          avg_grade: avgGrade
        }
      }))
      const { _id, ...clean } = cls
      clean.enrolled_students = enriched
      return handleCORS(NextResponse.json(clean))
    }

    // Update student niveau in class - PUT /api/classes/:id/students/:studentId/niveau
    if (route.match(/^\/classes\/[^/]+\/students\/[^/]+\/niveau$/) && method === 'PUT') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const classId = path[1]
      const studentId = path[3]
      const body = await request.json()
      const { niveau } = body // 'A' | 'B' | 'C'
      if (!['A', 'B', 'C'].includes(niveau)) return handleCORS(NextResponse.json({ error: 'Ungültiges Niveau. Erlaubt: A, B, C' }, { status: 400 }))
      const cls = await db.collection('classes').findOne({ id: classId, teacher_id: decoded.userId })
      if (!cls) return handleCORS(NextResponse.json({ error: 'Klasse nicht gefunden.' }, { status: 404 }))
      const enrolled = cls.enrolled_students || []
      const idx = enrolled.findIndex(s => s.student_id === studentId)
      if (idx === -1) return handleCORS(NextResponse.json({ error: 'Schüler nicht in dieser Klasse.' }, { status: 404 }))
      enrolled[idx].niveau = niveau
      await db.collection('classes').updateOne({ id: classId }, { $set: { enrolled_students: enrolled, updated_at: new Date() } })
      return handleCORS(NextResponse.json({ success: true, niveau }))
    }

    // Remove student from class - DELETE /api/classes/:id/students/:studentId
    if (route.match(/^\/classes\/[^/]+\/students\/[^/]+$/) && method === 'DELETE') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const classId = path[1]
      const studentId = path[3]
      const cls = await db.collection('classes').findOne({ id: classId, teacher_id: decoded.userId })
      if (!cls) return handleCORS(NextResponse.json({ error: 'Klasse nicht gefunden.' }, { status: 404 }))
      const updated = (cls.enrolled_students || []).filter(s => s.student_id !== studentId)
      await db.collection('classes').updateOne({ id: classId }, { $set: { enrolled_students: updated, updated_at: new Date() } })
      // Also remove from student's enrolled_classes
      await db.collection('students').updateOne({ id: studentId }, { $pull: { enrolled_classes: { class_id: classId } } })
      return handleCORS(NextResponse.json({ success: true }))
    }

    // Delete class - DELETE /api/classes/:id
    if (route.match(/^\/classes\/[^/]+$/) && method === 'DELETE') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const classId = path[1]
      // Remove class from all enrolled students
      const cls = await db.collection('classes').findOne({ id: classId, teacher_id: decoded.userId })
      if (cls) {
        const studentIds = (cls.enrolled_students || []).map(s => s.student_id)
        if (studentIds.length > 0) {
          await db.collection('students').updateMany(
            { id: { $in: studentIds } },
            { $pull: { enrolled_classes: { class_id: classId } } }
          )
        }
      }
      await db.collection('classes').deleteOne({ id: classId, teacher_id: decoded.userId })
      return handleCORS(NextResponse.json({ success: true }))
    }

    // Share worksheet as assignment - POST /api/assignments/share
    if (route === '/assignments/share' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { worksheetId, className, classId, deadline, status: assignmentStatus, studentNames, targetNiveau } = body
      if (!worksheetId) return handleCORS(NextResponse.json({ error: "Material-ID erforderlich" }, { status: 400 }))
      const worksheet = await db.collection('worksheets').findOne({ id: worksheetId })
      if (!worksheet) return handleCORS(NextResponse.json({ error: "Material nicht gefunden" }, { status: 404 }))
      const code = Math.random().toString(36).substring(2, 8).toUpperCase()
      // If classId provided, resolve class name
      let resolvedClassName = className || ''
      if (classId) {
        const cls = await db.collection('classes').findOne({ id: classId, teacher_id: decoded.userId })
        if (cls) resolvedClassName = cls.name
      }
      const assignment = {
        id: uuidv4(),
        code,
        worksheet_id: worksheetId,
        worksheet_title: worksheet.title || 'Unbenannt',
        teacher_id: decoded.userId,
        class_id: classId || null,
        class_name: resolvedClassName,
        student_names: studentNames || [],
        target_niveau: targetNiveau || null, // null = all, 'A'|'B'|'C' = specific
        deadline: deadline || null,
        created_at: new Date(),
        status: assignmentStatus || 'active',
        access_url: `/schueler?code=${code}`
      }
      await db.collection('assignments').insertOne(assignment)
      return handleCORS(NextResponse.json({ code, assignmentId: assignment.id, accessUrl: assignment.access_url }))
    }

    // Get assignment by code (student access, no auth needed) - GET /api/student/assignment/:code
    if (route.startsWith('/student/assignment/') && method === 'GET') {
      const code = path[2]
      const assignment = await db.collection('assignments').findOne({ code, status: 'active' })
      if (!assignment) return handleCORS(NextResponse.json({ error: 'Aufgabe nicht gefunden oder nicht mehr aktiv.' }, { status: 404 }))
      if (assignment.deadline && new Date(assignment.deadline) < new Date()) {
        return handleCORS(NextResponse.json({ error: 'Die Abgabefrist ist abgelaufen.' }, { status: 410 }))
      }
      const worksheet = await db.collection('worksheets').findOne({ id: assignment.worksheet_id })
      if (!worksheet) return handleCORS(NextResponse.json({ error: 'Material nicht gefunden.' }, { status: 404 }))
      // Return worksheet without answers for student view
      const studentContent = {
        ...worksheet.content,
        questions: (worksheet.content?.questions || []).map(q => {
          const base = {
            number: q.number, type: q.type, question: q.question,
            options: q.options, points: q.points, imageUrl: q.imageUrl,
          }
          // For matching: send answer structure so students can see items to match
          if (q.type === 'matching' && q.answer) {
            base.answer = q.answer // contains "A→B, C→D" pairs needed for display
          }
          // For ordering: send answer so items can be shuffled and displayed
          if (q.type === 'ordering' && q.answer) {
            base.answer = q.answer // contains comma-separated items
          }
          // For either_or/true_false: ensure options exist
          if (q.type === 'true_false' && (!q.options || q.options.length === 0)) {
            base.options = ['Wahr', 'Falsch']
          }
          if (q.type === 'either_or' && (!q.options || q.options.length === 0) && q.answer) {
            // Try to extract options from the answer or question
            base.options = ['Ja', 'Nein']
          }
          return base
        })
      }
      return handleCORS(NextResponse.json({
        title: worksheet.title, subject: worksheet.subject, grade: worksheet.grade,
        content: studentContent, assignmentId: assignment.id, className: assignment.class_name
      }))
    }

    // Submit student answers - POST /api/student/submit
    if (route === '/student/submit' && method === 'POST') {
      const body = await request.json()
      const { assignmentCode, studentName, answers, duration, studentToken } = body

      // Try to identify logged-in student
      let studentId = null
      if (studentToken) {
        try {
          const decoded = jwt.verify(studentToken, process.env.JWT_SECRET)
          if (decoded.role === 'student') studentId = decoded.studentId
        } catch (e) { /* guest mode */ }
      }
      const assignment = await db.collection('assignments').findOne({ code: assignmentCode, status: 'active' })
      if (!assignment) {
        // Debug: check if assignment exists with different status
        const anyAssignment = await db.collection('assignments').findOne({ code: assignmentCode })
        console.log('[Submit Debug] code:', assignmentCode, 'found:', !!anyAssignment, 'status:', anyAssignment?.status)
        return handleCORS(NextResponse.json({ error: `Aufgabe nicht gefunden. Code: "${assignmentCode}", Status: ${anyAssignment ? anyAssignment.status : 'nicht vorhanden'}` }, { status: 404 }))
      }
      const worksheet = await db.collection('worksheets').findOne({ id: assignment.worksheet_id })
      if (!worksheet) return handleCORS(NextResponse.json({ error: 'Material nicht gefunden.' }, { status: 404 }))

      const questions = worksheet.content?.questions || []
      let correctCount = 0
      const questionResults = []

      // Phase 1: Auto-grade deterministic types
      const aiGradingNeeded = []
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i]
        const studentAnswer = answers[i]
        let isCorrect = null
        let feedback = null
        let pointsAwarded = null

        if (['multiple_choice', 'true_false', 'either_or'].includes(q.type)) {
          isCorrect = studentAnswer === q.answer
          if (isCorrect) correctCount++
          feedback = isCorrect ? 'Richtig!' : `Richtig wäre: ${q.answer}`
        } else if (q.type === 'math') {
          const cleanStudent = String(studentAnswer || '').trim().replace(/\s/g, '')
          const cleanAnswer = String(q.answer || '').trim().replace(/\s/g, '')
          isCorrect = cleanStudent === cleanAnswer
          if (isCorrect) correctCount++
          feedback = isCorrect ? 'Richtig!' : `Die richtige Antwort ist: ${q.answer}`
        } else if (q.type === 'fill_blank') {
          const correctWords = (q.answer || '').split(',').map(w => w.trim().toLowerCase())
          const studentWords = (studentAnswer || []).map(w => (w || '').trim().toLowerCase())
          isCorrect = correctWords.every((w, wi) => studentWords[wi] === w)
          if (isCorrect) correctCount++
          feedback = isCorrect ? 'Richtig!' : `Richtige Antworten: ${q.answer}`
        } else if (['open', 'image'].includes(q.type) && studentAnswer && String(studentAnswer).trim()) {
          // Queue for AI grading
          aiGradingNeeded.push({ index: i, question: q, studentAnswer })
        } else if (q.type === 'ordering') {
          const correctOrder = (q.answer || '').split(',').map(s => s.trim().toLowerCase())
          const studentOrder = (studentAnswer || []).map(s => String(s).trim().toLowerCase())
          isCorrect = correctOrder.length === studentOrder.length && correctOrder.every((item, idx) => item === studentOrder[idx])
          if (isCorrect) correctCount++
          feedback = isCorrect ? 'Richtige Reihenfolge!' : `Die richtige Reihenfolge wäre: ${q.answer}`
        } else if (q.type === 'matching') {
          // Student answer is { selectedLeft, matches: { leftIdx: rightIdx } }
          const studentMatches = (studentAnswer?.matches) || studentAnswer || {}
          const correctPairsRaw = (q.answer || '').split(',').filter(Boolean)
          const correctLeft = correctPairsRaw.map(p => p.split('→')[0]?.trim())
          const correctRight = correctPairsRaw.map(p => p.split('→')[1]?.trim())
          // Reconstruct shuffled right order using same seed as frontend
          const rightItems = correctRight.map((text, i) => ({ text, origIdx: i }))
          const matchSeed = (q.number || 0) * 7 + correctPairsRaw.length
          const shuffledRight = [...rightItems].sort((a, b) => ((a.origIdx * 31 + matchSeed) % 97) - ((b.origIdx * 31 + matchSeed) % 97))
          let matchCorrect = 0
          for (const [leftIdx, rightIdx] of Object.entries(studentMatches)) {
            const li = parseInt(leftIdx)
            const ri = parseInt(rightIdx)
            if (shuffledRight[ri]?.origIdx === li) matchCorrect++
          }
          isCorrect = matchCorrect === correctPairsRaw.length && Object.keys(studentMatches).length === correctPairsRaw.length
          if (isCorrect) correctCount++
          feedback = isCorrect ? 'Alle richtig zugeordnet!' : `${matchCorrect}/${correctPairsRaw.length} richtig zugeordnet.`
          feedback = isCorrect ? 'Richtig zugeordnet!' : 'Nicht alle Zuordnungen waren korrekt.'
        }

        questionResults.push({
          questionNumber: q.number,
          type: q.type,
          question: q.question,
          studentAnswer,
          correctAnswer: q.answer,
          isCorrect,
          feedback,
          pointsAwarded: isCorrect === true ? (q.points || 1) : isCorrect === false ? 0 : null,
          maxPoints: q.points || 1,
          aiGraded: false
        })
      }

      // Phase 2: AI grading for open/image questions
      if (aiGradingNeeded.length > 0) {
        try {
          const gradingPrompt = aiGradingNeeded.map((item, idx) => {
            return `Frage ${idx + 1} (${item.question.points || 1} Punkte):
Frage: ${item.question.question}
Musterlösung: ${item.question.answer}
${item.question.explanation ? `Hinweis: ${item.question.explanation}` : ''}
Schüler-Antwort: ${item.studentAnswer}`
          }).join('\n\n---\n\n')

          const aiResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.1,
            messages: [
              {
                role: 'system',
                content: `Du bist ein erfahrener Schweizer Lehrperson, die Schülerantworten korrigiert. Bewerte jede Antwort fair und altersgerecht.

Für jede Frage antworte im folgenden JSON-Format:
{
  "gradings": [
    {
      "pointsAwarded": <Zahl zwischen 0 und maxPunkte>,
      "feedback": "<kurzes, ermutigendes Feedback auf Deutsch, max 2 Sätze>",
      "isCorrect": <true wenn volle Punktzahl, false wenn 0, "partial" wenn teilweise>
    }
  ]
}

Regeln:
- Bewerte den Inhalt, nicht die Rechtschreibung (ausser bei Deutsch-Aufgaben)
- Akzeptiere sinngemäss richtige Antworten, auch wenn die Formulierung anders ist
- Gib Teilpunkte wenn die Antwort teilweise richtig ist
- Feedback soll konstruktiv und ermutigend sein
- Antworte NUR mit validem JSON`
              },
              { role: 'user', content: gradingPrompt }
            ]
          })

          const aiText = aiResponse.choices[0]?.message?.content || ''
          const jsonMatch = aiText.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const aiGrading = JSON.parse(jsonMatch[0])
            const gradings = aiGrading.gradings || []

            gradings.forEach((grading, idx) => {
              if (idx < aiGradingNeeded.length) {
                const resultIndex = aiGradingNeeded[idx].index
                const maxPoints = aiGradingNeeded[idx].question.points || 1
                const awarded = Math.min(Math.max(0, grading.pointsAwarded || 0), maxPoints)

                questionResults[resultIndex].isCorrect = grading.isCorrect === true ? true : grading.isCorrect === false ? false : 'partial'
                questionResults[resultIndex].feedback = grading.feedback || 'Bewertet durch KI.'
                questionResults[resultIndex].pointsAwarded = awarded
                questionResults[resultIndex].aiGraded = true

                if (grading.isCorrect === true) correctCount++
                else if (grading.isCorrect === 'partial') correctCount += 0.5
              }
            })
          }
        } catch (aiError) {
          console.error('AI grading error:', aiError)
          // Mark AI questions as needing manual review
          aiGradingNeeded.forEach(item => {
            questionResults[item.index].feedback = 'Konnte nicht automatisch bewertet werden. Wird von der Lehrperson geprüft.'
            questionResults[item.index].needsManualReview = true
          })
        }
      }

      const totalPoints = questionResults.reduce((sum, r) => sum + (r.maxPoints || 1), 0)
      const earnedPoints = questionResults.reduce((sum, r) => sum + (r.pointsAwarded ?? 0), 0)
      const needsReview = questionResults.some(r => r.needsManualReview || r.isCorrect === null)

      const scorePercentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0
      const swissGrade = totalPoints > 0 ? Math.round((earnedPoints / totalPoints * 5 + 1) * 2) / 2 : 1

      const submission = {
        id: uuidv4(),
        assignment_id: assignment.id,
        student_id: studentId || null,
        student_name: studentName,
        answers,
        question_results: questionResults,
        correct_count: correctCount,
        total_questions: questions.length,
        total_points: totalPoints,
        earned_points: earnedPoints,
        score_percentage: scorePercentage,
        swiss_grade: swissGrade,
        needs_review: needsReview,
        duration,
        submitted_at: new Date()
      }
      await db.collection('submissions').insertOne(submission)

      // Update student stats + gamification XP if logged in
      if (studentId) {
        // XP calculation: base 10 + earned points + bonus for grade + perfect bonus
        let xpEarned = 10 + earnedPoints
        if (swissGrade >= 5.5) xpEarned += 20
        else if (swissGrade >= 4.5) xpEarned += 10
        if (scorePercentage === 100) xpEarned += 25 // perfect bonus
        await db.collection('students').updateOne(
          { id: studentId },
          {
            $inc: { total_quizzes: 1, total_points: earnedPoints, xp: xpEarned },
            $set: { last_activity: new Date() }
          }
        )
      }
      return handleCORS(NextResponse.json({
        correctCount: Math.round(correctCount),
        totalQuestions: questions.length,
        totalPoints,
        earnedPoints,
        scorePercentage: submission.score_percentage,
        duration,
        submissionId: submission.id,
        questionResults: questionResults.map(r => ({
          questionNumber: r.questionNumber,
          question: r.question,
          type: r.type,
          studentAnswer: r.studentAnswer,
          isCorrect: r.isCorrect,
          feedback: r.feedback,
          pointsAwarded: r.pointsAwarded,
          maxPoints: r.maxPoints,
          aiGraded: r.aiGraded
        })),
        swissGrade,
        needsReview
      }))
    }

    // Get submissions for an assignment (teacher view) - GET /api/assignments/:id/submissions
    if (route.match(/^\/assignments\/[^/]+\/submissions$/) && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const assignmentId = path[1]
      const assignment = await db.collection('assignments').findOne({ id: assignmentId, teacher_id: decoded.userId })
      if (!assignment) return handleCORS(NextResponse.json({ error: 'Aufgabe nicht gefunden.' }, { status: 404 }))
      const submissions = await db.collection('submissions').find({ assignment_id: assignmentId }).sort({ submitted_at: -1 }).toArray()
      const cleaned = submissions.map(({ _id, ...s }) => s)
      return handleCORS(NextResponse.json({ assignment: { ...assignment, _id: undefined }, submissions: cleaned }))
    }

    // Get teacher's assignments - GET /api/assignments
    if (route === '/assignments' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const assignments = await db.collection('assignments').find({ teacher_id: decoded.userId }).sort({ created_at: -1 }).toArray()
      // Enrich with worksheet titles and submission counts
      const enriched = await Promise.all(assignments.map(async (a) => {
        const { _id, ...clean } = a
        if (!clean.worksheet_title) {
          const ws = await db.collection('worksheets').findOne({ id: clean.worksheet_id })
          clean.worksheet_title = ws?.title || 'Unbenannt'
        }
        const subCount = await db.collection('submissions').countDocuments({ assignment_id: clean.id })
        clean.submission_count = subCount
        return clean
      }))
      return handleCORS(NextResponse.json(enriched))
    }

    // Update assignment status - PUT /api/assignments/:id
    if (route.match(/^\/assignments\/[^/]+$/) && method === 'PUT') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const assignmentId = path[1]
      const body = await request.json()
      const { status: newStatus, deadline } = body
      const updateFields = { updated_at: new Date() }
      if (newStatus) updateFields.status = newStatus
      if (deadline !== undefined) updateFields.deadline = deadline
      await db.collection('assignments').updateOne(
        { id: assignmentId, teacher_id: decoded.userId },
        { $set: updateFields }
      )
      const updated = await db.collection('assignments').findOne({ id: assignmentId })
      return handleCORS(NextResponse.json({ ...(updated || {}), _id: undefined }))
    }

    // ========== LEHRER-KORREKTUR (Teacher Override) ==========

    // Update a submission's question result (teacher override) - PUT /api/submissions/:id/grade
    if (route.match(/^\/submissions\/[^/]+\/grade$/) && method === 'PUT') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const submissionId = path[1]
      const body = await request.json()
      const { questionIndex, pointsAwarded, feedback, teacherComment } = body

      const submission = await db.collection('submissions').findOne({ id: submissionId })
      if (!submission) return handleCORS(NextResponse.json({ error: 'Abgabe nicht gefunden.' }, { status: 404 }))

      // Verify teacher owns the assignment
      const assignment = await db.collection('assignments').findOne({ id: submission.assignment_id, teacher_id: decoded.userId })
      if (!assignment) return handleCORS(NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 }))

      const questionResults = submission.question_results || []
      if (questionIndex < 0 || questionIndex >= questionResults.length) {
        return handleCORS(NextResponse.json({ error: 'Ungültiger Fragenindex.' }, { status: 400 }))
      }

      // Update the specific question result
      const qr = questionResults[questionIndex]
      if (pointsAwarded !== undefined) {
        const maxPts = qr.maxPoints || 1
        qr.pointsAwarded = Math.min(Math.max(0, pointsAwarded), maxPts)
        qr.isCorrect = qr.pointsAwarded === maxPts ? true : qr.pointsAwarded === 0 ? false : 'partial'
      }
      if (feedback !== undefined) qr.feedback = feedback
      if (teacherComment !== undefined) qr.teacherComment = teacherComment
      qr.teacherOverride = true
      qr.needsManualReview = false

      questionResults[questionIndex] = qr

      // Recalculate totals
      const totalPoints = questionResults.reduce((sum, r) => sum + (r.maxPoints || 1), 0)
      const earnedPoints = questionResults.reduce((sum, r) => sum + (r.pointsAwarded ?? 0), 0)
      const needsReview = questionResults.some(r => r.needsManualReview || r.isCorrect === null)

      // Calculate Swiss grade (1-6)
      const scorePercentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0
      const swissGrade = totalPoints > 0 ? Math.round((earnedPoints / totalPoints * 5 + 1) * 2) / 2 : 1

      await db.collection('submissions').updateOne(
        { id: submissionId },
        { $set: {
          question_results: questionResults,
          earned_points: earnedPoints,
          total_points: totalPoints,
          score_percentage: scorePercentage,
          needs_review: needsReview,
          swiss_grade: swissGrade,
          teacher_reviewed: true,
          reviewed_at: new Date()
        }}
      )

      return handleCORS(NextResponse.json({
        questionResults: questionResults.map(r => ({
          questionNumber: r.questionNumber, question: r.question, type: r.type,
          studentAnswer: r.studentAnswer, isCorrect: r.isCorrect, feedback: r.feedback,
          pointsAwarded: r.pointsAwarded, maxPoints: r.maxPoints, aiGraded: r.aiGraded,
          teacherOverride: r.teacherOverride, teacherComment: r.teacherComment,
          needsManualReview: r.needsManualReview
        })),
        earnedPoints, totalPoints, scorePercentage, swissGrade, needsReview
      }))
    }

    // Batch finalize grading for a submission - PUT /api/submissions/:id/finalize
    if (route.match(/^\/submissions\/[^/]+\/finalize$/) && method === 'PUT') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const submissionId = path[1]

      const submission = await db.collection('submissions').findOne({ id: submissionId })
      if (!submission) return handleCORS(NextResponse.json({ error: 'Abgabe nicht gefunden.' }, { status: 404 }))

      const assignment = await db.collection('assignments').findOne({ id: submission.assignment_id, teacher_id: decoded.userId })
      if (!assignment) return handleCORS(NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 }))

      const questionResults = submission.question_results || []
      const totalPoints = questionResults.reduce((sum, r) => sum + (r.maxPoints || 1), 0)
      const earnedPoints = questionResults.reduce((sum, r) => sum + (r.pointsAwarded ?? 0), 0)
      const scorePercentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0
      const swissGrade = totalPoints > 0 ? Math.round((earnedPoints / totalPoints * 5 + 1) * 2) / 2 : 1

      await db.collection('submissions').updateOne(
        { id: submissionId },
        { $set: {
          needs_review: false,
          swiss_grade: swissGrade,
          score_percentage: scorePercentage,
          earned_points: earnedPoints,
          teacher_reviewed: true,
          reviewed_at: new Date()
        }}
      )

      return handleCORS(NextResponse.json({ swissGrade, scorePercentage, earnedPoints, totalPoints }))
    }

    // ========== ASSIGNMENT DELETE ==========

    // Delete an assignment and its submissions - DELETE /api/assignments/:id
    if (route.match(/^\/assignments\/[^/]+$/) && method === 'DELETE') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const assignmentId = path[1]

      const assignment = await db.collection('assignments').findOne({ id: assignmentId, teacher_id: decoded.userId })
      if (!assignment) return handleCORS(NextResponse.json({ error: 'Aufgabe nicht gefunden.' }, { status: 404 }))

      await db.collection('submissions').deleteMany({ assignment_id: assignmentId })
      await db.collection('assignments').deleteOne({ id: assignmentId })

      return handleCORS(NextResponse.json({ message: 'Aufgabe und alle Abgaben gelöscht.' }))
    }

    // ========== KLASSENÜBERSICHT (Class Overview) ==========

    // Get class overview with grade distribution - GET /api/assignments/:id/overview
    if (route.match(/^\/assignments\/[^/]+\/overview$/) && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const assignmentId = path[1]

      const assignment = await db.collection('assignments').findOne({ id: assignmentId, teacher_id: decoded.userId })
      if (!assignment) return handleCORS(NextResponse.json({ error: 'Aufgabe nicht gefunden.' }, { status: 404 }))

      const submissions = await db.collection('submissions').find({ assignment_id: assignmentId }).sort({ submitted_at: -1 }).toArray()
      if (submissions.length === 0) return handleCORS(NextResponse.json({ submissions: [], stats: null }))

      // Calculate Swiss grades for all submissions
      const gradesData = submissions.map(s => {
        const tp = s.total_points || 1
        const ep = s.earned_points || 0
        const grade = s.swiss_grade || (Math.round((ep / tp * 5 + 1) * 2) / 2)
        return {
          name: s.student_name,
          earnedPoints: ep,
          totalPoints: tp,
          scorePercentage: s.score_percentage || 0,
          swissGrade: grade,
          duration: s.duration,
          submittedAt: s.submitted_at,
          needsReview: s.needs_review,
          teacherReviewed: s.teacher_reviewed
        }
      })

      const grades = gradesData.map(g => g.swissGrade)
      const scores = gradesData.map(g => g.scorePercentage)

      // Grade distribution (1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6)
      const gradeDistribution = {}
      for (let g = 1; g <= 6; g += 0.5) { gradeDistribution[g] = 0 }
      grades.forEach(g => { if (gradeDistribution[g] !== undefined) gradeDistribution[g]++ })

      // Pass/fail (>= 4 is passing in Swiss system)
      const passing = grades.filter(g => g >= 4).length
      const failing = grades.filter(g => g < 4).length

      const stats = {
        count: submissions.length,
        averageGrade: Math.round(grades.reduce((a, b) => a + b, 0) / grades.length * 10) / 10,
        medianGrade: grades.sort((a, b) => a - b)[Math.floor(grades.length / 2)],
        bestGrade: Math.max(...grades),
        worstGrade: Math.min(...grades),
        averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        passing,
        failing,
        passRate: Math.round((passing / submissions.length) * 100),
        gradeDistribution
      }

      return handleCORS(NextResponse.json({ students: gradesData, stats }))
    }

    // ========== FEHLERANALYSE (Error Analysis) ==========

    // Analyze submissions for patterns - POST /api/analyze-errors
    if (route === '/analyze-errors' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { assignmentId } = body
      const submissions = await db.collection('submissions').find({ assignment_id: assignmentId }).toArray()
      if (submissions.length === 0) return handleCORS(NextResponse.json({ error: 'Keine Abgaben vorhanden.' }, { status: 404 }))
      const assignment = await db.collection('assignments').findOne({ id: assignmentId })
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

    // ========== COLLABORATION ==========

    // Share worksheet with another user - POST /api/collaborate/share
    if (route === '/collaborate/share' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { worksheetId, email, role = 'view' } = body // role: 'view', 'comment', 'edit'
      const targetUser = await db.collection('users').findOne({ email })
      if (!targetUser) return handleCORS(NextResponse.json({ error: 'Benutzer nicht gefunden.' }, { status: 404 }))
      const share = {
        id: uuidv4(),
        worksheet_id: worksheetId,
        owner_id: decoded.userId,
        shared_with_id: targetUser.id,
        shared_with_email: email,
        role,
        created_at: new Date()
      }
      await db.collection('shares').insertOne(share)
      return handleCORS(NextResponse.json({ message: 'Material geteilt', shareId: share.id }))
    }

    // Get shared worksheets - GET /api/collaborate/shared-with-me
    if (route === '/collaborate/shared-with-me' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const shares = await db.collection('shares').find({ shared_with_id: decoded.userId }).toArray()
      const worksheetIds = shares.map(s => s.worksheet_id)
      const worksheets = await db.collection('worksheets').find({ id: { $in: worksheetIds } }).toArray()
      const result = shares.map(share => {
        const ws = worksheets.find(w => w.id === share.worksheet_id)
        return { ...share, _id: undefined, worksheet: ws ? { title: ws.title, subject: ws.subject, grade: ws.grade, id: ws.id } : null }
      })
      return handleCORS(NextResponse.json(result))
    }

    // Add comment to worksheet - POST /api/collaborate/comment
    if (route === '/collaborate/comment' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { worksheetId, text, questionIndex } = body
      const user = await db.collection('users').findOne({ id: decoded.userId })
      const comment = {
        id: uuidv4(),
        worksheet_id: worksheetId,
        user_id: decoded.userId,
        user_name: user?.name || 'Unbekannt',
        text,
        question_index: questionIndex ?? null,
        created_at: new Date()
      }
      await db.collection('comments').insertOne(comment)
      return handleCORS(NextResponse.json({ commentId: comment.id }))
    }

    // Get comments for worksheet - GET /api/collaborate/comments/:worksheetId
    if (route.startsWith('/collaborate/comments/') && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const worksheetId = path[2]
      const comments = await db.collection('comments').find({ worksheet_id: worksheetId }).sort({ created_at: -1 }).toArray()
      return handleCORS(NextResponse.json(comments.map(({ _id, ...c }) => c)))
    }

    // Save version - POST /api/collaborate/version
    if (route === '/collaborate/version' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { worksheetId, label } = body
      const worksheet = await db.collection('worksheets').findOne({ id: worksheetId, user_id: decoded.userId })
      if (!worksheet) return handleCORS(NextResponse.json({ error: 'Material nicht gefunden.' }, { status: 404 }))
      const version = {
        id: uuidv4(),
        worksheet_id: worksheetId,
        user_id: decoded.userId,
        label: label || `Version ${new Date().toLocaleString('de-CH')}`,
        content: worksheet.content,
        title: worksheet.title,
        created_at: new Date()
      }
      await db.collection('versions').insertOne(version)
      return handleCORS(NextResponse.json({ versionId: version.id }))
    }

    // Get versions - GET /api/collaborate/versions/:worksheetId
    if (route.startsWith('/collaborate/versions/') && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const worksheetId = path[2]
      const versions = await db.collection('versions').find({ worksheet_id: worksheetId }).sort({ created_at: -1 }).toArray()
      return handleCORS(NextResponse.json(versions.map(({ _id, ...v }) => v)))
    }

    // Restore version - POST /api/collaborate/restore
    if (route === '/collaborate/restore' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { worksheetId, versionId } = body
      const version = await db.collection('versions').findOne({ id: versionId, worksheet_id: worksheetId })
      if (!version) return handleCORS(NextResponse.json({ error: 'Version nicht gefunden.' }, { status: 404 }))
      await db.collection('worksheets').updateOne(
        { id: worksheetId, user_id: decoded.userId },
        { $set: { content: version.content, title: version.title, updated_at: new Date() } }
      )
      return handleCORS(NextResponse.json({ message: 'Version wiederhergestellt' }))
    }

    // ========== TEXT-TO-SPEECH (Sprachausgabe) ==========

    // Generate speech - POST /api/tts
    if (route === '/tts' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { text, voice = 'alloy', speed = 1.0 } = body
      if (!text) return handleCORS(NextResponse.json({ error: 'Text ist erforderlich.' }, { status: 400 }))
      try {
        const mp3 = await openai.audio.speech.create({
          model: 'tts-1',
          voice: voice, // alloy, echo, fable, onyx, nova, shimmer
          input: text.substring(0, 4096),
          speed: Math.max(0.25, Math.min(4.0, speed))
        })
        const buffer = Buffer.from(await mp3.arrayBuffer())
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
      const { topic, grade, subject, difficulty, theme, competency_codes } = body

      if (!topic || !grade || !subject) {
        return handleCORS(NextResponse.json({ error: "Thema, Klasse und Fach sind erforderlich." }, { status: 400 }))
      }

      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // STEP 1: Planning
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', message: 'Dossier wird geplant...', progress: 5 })}\n\n`))

            const competenciesText = competency_codes?.length
              ? `\n\nLehrplan 21 Kompetenzen die abgedeckt werden sollen:\n${competency_codes.map(c => `- ${c}`).join('\n')}`
              : ''

            const planningPrompt = `Du bist ein erfahrener Schweizer Primarschullehrer. Erstelle einen detaillierten Strukturplan für ein Lerndossier.

Thema: ${topic}
Klassenstufe: ${grade}. Klasse (Primarschule Schweiz)
Fach: ${subject}
Schwierigkeit: ${difficulty || 'medium'}${competenciesText}

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

            let outline
            try {
              const planningResponse = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: planningPrompt },
                  { role: 'user', content: `Erstelle einen Strukturplan für ein Lerndossier zum Thema: ${topic}` }
                ],
                temperature: 0.7,
                response_format: { type: 'json_object' }
              })
              outline = JSON.parse(planningResponse.choices[0].message.content)
            } catch (e) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: `Planungsfehler: ${e.message}` })}\n\n`))
              controller.close()
              return
            }

            const dossierTitle = outline.title || `${subject}: ${topic}`
            const plannedSections = outline.sections || []
            const learningObjectives = outline.learning_objectives || []
            const totalSections = plannedSections.length

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'plan_complete', title: dossierTitle, sections: plannedSections, totalSections, progress: 15 })}\n\n`))

            // STEP 2: Generate sections one by one
            const generatedSections = []
            const previousSummaries = []
            const allQuestions = []

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

            for (let idx = 0; idx < plannedSections.length; idx++) {
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

              const sectionPrompt = `Du bist ein erfahrener Schweizer Primarschullehrer. Generiere den Inhalt für EINE Sektion eines Lerndossiers.

=== KONTEXT ===
Thema: ${topic}
Klassenstufe: ${grade}. Klasse
Fach: ${subject}
Schwierigkeit: ${difficulty || 'medium'}

Lernziele des Dossiers:
${objectivesText}
${contextText}

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
                  model: 'gpt-4o',
                  messages: [
                    { role: 'system', content: sectionPrompt },
                    { role: 'user', content: `Generiere die Sektion '${sectionTitle}' für das Dossier '${dossierTitle}'.` }
                  ],
                  temperature: 0.7,
                  response_format: { type: 'json_object' }
                })
                sectionContent = JSON.parse(sectionResponse.choices[0].message.content)
              } catch (e) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'section_error', section: sectionTitle, sectionIndex: idx, message: e.message })}\n\n`))
                sectionContent = { blocks: [{ type: 'text', content: { html: `<i>Fehler bei der Generierung: ${e.message}</i>` } }], summary: '' }
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
                blocks
              })

              const summary = sectionContent.summary || ''
              if (summary) previousSummaries.push(`${sectionTitle}: ${summary}`)

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'section_complete', section: sectionTitle, sectionIndex: idx, totalSections, blockCount: blocks.length, progress: progressBase + Math.floor(70 / totalSections) })}\n\n`))
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

            const dossierId = uuidv4()
            const now = new Date()
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
              created_at: now,
              updated_at: now
            }

            await db.collection('dossiers').insertOne(dossier)
            await db.collection('users').updateOne({ id: decoded.userId }, { $inc: { worksheets_used_this_month: 1 } })

            const dossierResponse = { ...dossier, created_at: now.toISOString(), updated_at: now.toISOString() }
            delete dossierResponse._id

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'dossier_complete', dossier: dossierResponse, progress: 100 })}\n\n`))
            controller.close()
          } catch (error) {
            console.error('Dossier streaming error:', error)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`))
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
    console.error('API Error:', error)
    return handleCORS(NextResponse.json(
      { error: error.message || "Internal server error" },
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