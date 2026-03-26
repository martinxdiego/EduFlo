'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, CheckCircle2, ArrowRight, Clock, Send, ArrowLeft, Star, Trophy, Loader2, XCircle, AlertCircle, Sparkles, ChevronDown, ChevronUp, LogOut, User, BarChart3, Award, TrendingUp, Hash, Trash2, Users, Zap, Target, Crown, Flame } from 'lucide-react'

export default function SchuelerPage() {
  // Auth state
  const [studentToken, setStudentToken] = useState(null)
  const [student, setStudent] = useState(null)
  const [authMode, setAuthMode] = useState('login') // 'login' | 'register'
  const [authForm, setAuthForm] = useState({ username: '', password: '', displayName: '' })
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  // Dashboard state
  const [view, setView] = useState('dashboard') // 'dashboard' | 'quiz'
  const [myResults, setMyResults] = useState(null)
  const [resultsLoading, setResultsLoading] = useState(false)

  // Quiz state
  const [accessCode, setAccessCode] = useState('')
  const [assignment, setAssignment] = useState(null)
  const [studentName, setStudentName] = useState('')
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [startTime, setStartTime] = useState(Date.now())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // submission id to confirm delete

  // Gamification state
  const [gamification, setGamification] = useState(null)
  const [dashboardTab, setDashboardTab] = useState('results') // 'results' | 'gamification' | 'classes'

  // Classes state
  const [myClasses, setMyClasses] = useState([])
  const [joinCode, setJoinCode] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinMessage, setJoinMessage] = useState('')
  const [classAssignments, setClassAssignments] = useState([])

  // XP animation after quiz
  const [xpGained, setXpGained] = useState(null)

  // Check for saved token on mount
  useEffect(() => {
    const saved = localStorage.getItem('eduflow_student_token')
    if (saved) {
      setStudentToken(saved)
      fetchStudentProfile(saved)
    }
  }, [])

  // Keep studentName in sync with student profile
  useEffect(() => {
    if (student && student.display_name && !studentName) {
      setStudentName(student.display_name)
    }
  }, [student])

  // Check URL for code parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) setAccessCode(code.toUpperCase().trim())
  }, [])

  // ============================================================
  // AUTH FUNCTIONS
  // ============================================================

  const fetchStudentProfile = async (token) => {
    try {
      const res = await fetch('/api/student/me', { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        setStudent(data)
        setStudentName(data.display_name)
        loadMyResults(token)
        loadGamification(token)
        loadMyClasses(token)
        loadClassAssignments(token)
      } else {
        localStorage.removeItem('eduflow_student_token')
        setStudentToken(null)
      }
    } catch (e) {
      console.error('Profile fetch error:', e)
    }
  }

  const handleAuth = async (e) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError('')
    try {
      const endpoint = authMode === 'register' ? '/api/student/register' : '/api/student/login'
      const body = authMode === 'register'
        ? { username: authForm.username, password: authForm.password, displayName: authForm.displayName }
        : { username: authForm.username, password: authForm.password }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await res.json()
      if (!res.ok) {
        setAuthError(data.error || 'Fehler bei der Anmeldung.')
      } else {
        setStudentToken(data.token)
        setStudent(data.student)
        setStudentName(data.student.display_name)
        localStorage.setItem('eduflow_student_token', data.token)
        loadMyResults(data.token)
        loadGamification(data.token)
        loadMyClasses(data.token)
        loadClassAssignments(data.token)
      }
    } catch (e) {
      setAuthError('Verbindungsfehler.')
    }
    setAuthLoading(false)
  }

  const logout = () => {
    setStudentToken(null)
    setStudent(null)
    setMyResults(null)
    localStorage.removeItem('eduflow_student_token')
    setView('dashboard')
    setAssignment(null)
    setSubmitted(false)
    setResults(null)
  }

  // ============================================================
  // DASHBOARD FUNCTIONS
  // ============================================================

  const loadMyResults = async (token) => {
    setResultsLoading(true)
    try {
      const res = await fetch('/api/student/my-results', { headers: { 'Authorization': `Bearer ${token || studentToken}` } })
      if (res.ok) {
        const data = await res.json()
        setMyResults(data)
      }
    } catch (e) { console.error('Results error:', e) }
    setResultsLoading(false)
  }

  const deleteSubmission = async (submissionId) => {
    try {
      const res = await fetch(`/api/student/submissions/${submissionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${studentToken}` }
      })
      if (res.ok) {
        setMyResults(prev => {
          if (!prev) return prev
          const updated = prev.submissions.filter(s => s.id !== submissionId)
          const totalQuizzes = updated.length
          const avgScore = totalQuizzes > 0 ? Math.round(updated.reduce((sum, s) => sum + (s.score_percentage || 0), 0) / totalQuizzes) : 0
          const avgGrade = totalQuizzes > 0 ? Math.round(updated.reduce((sum, s) => sum + (s.swiss_grade || 1), 0) / totalQuizzes * 10) / 10 : 0
          const bestGrade = totalQuizzes > 0 ? Math.max(...updated.map(s => s.swiss_grade || 1)) : 0
          const totalPoints = updated.reduce((sum, s) => sum + (s.earned_points || 0), 0)
          return { submissions: updated, stats: { totalQuizzes, totalPoints, avgScore, avgGrade, bestGrade } }
        })
        setDeleteConfirm(null)
      }
    } catch (e) { console.error('Delete error:', e) }
  }

  // Gamification
  const loadGamification = async (tkn) => {
    try {
      const res = await fetch('/api/student/gamification', { headers: { 'Authorization': `Bearer ${tkn || studentToken}` } })
      if (res.ok) setGamification(await res.json())
    } catch (e) { console.error('Gamification error:', e) }
  }

  // Classes
  const loadMyClasses = async (tkn) => {
    try {
      const res = await fetch('/api/student/my-classes', { headers: { 'Authorization': `Bearer ${tkn || studentToken}` } })
      if (res.ok) setMyClasses(await res.json())
    } catch (e) { console.error('Classes error:', e) }
  }

  const joinClass = async () => {
    if (!joinCode.trim()) return
    setJoinLoading(true)
    setJoinMessage('')
    try {
      const res = await fetch('/api/student/join-class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentToken}` },
        body: JSON.stringify({ joinCode: joinCode.trim() })
      })
      const data = await res.json()
      if (res.ok) {
        setJoinMessage(`Erfolgreich der Klasse "${data.className}" beigetreten!`)
        setJoinCode('')
        loadMyClasses()
      } else {
        setJoinMessage(data.error || 'Beitritt fehlgeschlagen.')
      }
    } catch (e) { setJoinMessage('Verbindungsfehler.') }
    setJoinLoading(false)
  }

  const leaveClass = async (classId) => {
    try {
      const res = await fetch('/api/student/leave-class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentToken}` },
        body: JSON.stringify({ classId })
      })
      if (res.ok) {
        setMyClasses(prev => prev.filter(c => c.class_id !== classId))
      }
    } catch (e) { console.error('Leave class error:', e) }
  }

  // Class assignments
  const loadClassAssignments = async (tkn) => {
    try {
      const res = await fetch('/api/student/class-assignments', { headers: { 'Authorization': `Bearer ${tkn || studentToken}` } })
      if (res.ok) setClassAssignments(await res.json())
    } catch (e) { console.error('Class assignments error:', e) }
  }

  const gradeColor = (grade) => {
    if (grade >= 5.5) return 'text-green-600'
    if (grade >= 4.5) return 'text-green-500'
    if (grade >= 4) return 'text-amber-600'
    if (grade >= 3) return 'text-orange-600'
    return 'text-red-600'
  }

  const gradeBg = (grade) => {
    if (grade >= 5.5) return 'bg-green-100'
    if (grade >= 4.5) return 'bg-green-50'
    if (grade >= 4) return 'bg-amber-50'
    if (grade >= 3) return 'bg-orange-50'
    return 'bg-red-50'
  }

  // ============================================================
  // QUIZ FUNCTIONS
  // ============================================================

  const loadAssignment = async () => {
    if (!accessCode.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/student/assignment/${accessCode.trim()}`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Aufgabe nicht gefunden.')
        setLoading(false)
        return
      }
      const data = await res.json()
      setAssignment(data)
      setStartTime(Date.now())
      setView('quiz')
    } catch (err) {
      setError('Verbindungsfehler. Bitte versuche es erneut.')
    }
    setLoading(false)
  }

  const submitAnswers = async () => {
    setLoading(true)
    setError('')
    const duration = Math.round((Date.now() - startTime) / 1000)

    // Convert answers object to array for API
    const answersArray = []
    for (let i = 0; i < questions.length; i++) {
      answersArray.push(answers[i] !== undefined ? answers[i] : null)
    }

    try {
      const payload = {
        assignmentCode: accessCode.trim(),
        studentName: studentName || student?.display_name || 'Unbekannt',
        answers: answersArray,
        duration,
        studentToken: studentToken !== 'guest' ? studentToken : null,
      }
      console.log('[EduFlow] Submitting quiz:', { code: accessCode, codeLength: accessCode.length, name: payload.studentName, answerCount: answersArray.length, payload: JSON.stringify(payload).substring(0, 300) })
      const res = await fetch('/api/student/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const text = await res.text()
      console.log('[EduFlow] Submit response:', res.status, text.substring(0, 200))
      let data
      try { data = JSON.parse(text) } catch (e) {
        setError('Serverfehler: Ungültige Antwort.')
        setLoading(false)
        return
      }
      if (!res.ok) {
        setError(data.error || `Abgabe fehlgeschlagen (${res.status}).`)
        setLoading(false)
        return
      }
      setResults(data)
      setSubmitted(true)
      // Calculate XP earned for animation
      if (studentToken && studentToken !== 'guest') {
        let xp = 10 + (data.earnedPoints || 0)
        if (data.swissGrade >= 5.5) xp += 20
        else if (data.swissGrade >= 4.5) xp += 10
        if (data.scorePercentage === 100) xp += 25
        setXpGained(xp)
        setTimeout(() => setXpGained(null), 4000) // fade after 4s
      }
      // Refresh dashboard results
      if (studentToken && studentToken !== 'guest') { loadMyResults(studentToken); loadGamification(studentToken); loadClassAssignments(studentToken) }
    } catch (err) {
      console.error('[EduFlow] Submit error:', err)
      setError('Verbindungsfehler: ' + err.message)
    }
    setLoading(false)
  }

  const resetQuiz = () => {
    setAssignment(null)
    setSubmitted(false)
    setAnswers({})
    setAccessCode('')
    setResults(null)
    setCurrentQuestion(0)
    setShowDetails(false)
    setView('dashboard')
  }

  const questions = assignment?.content?.questions || []
  const progress = questions.length > 0 ? Object.keys(answers).length / questions.length : 0

  // ============================================================
  // AUTH SCREEN (not logged in)
  // ============================================================

  if (!studentToken) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
              <BookOpen className="h-10 w-10 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">EduFlow</h1>
            <p className="text-gray-600">Dein Lernportal</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            {/* Auth tabs */}
            <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl">
              <button onClick={() => { setAuthMode('login'); setAuthError('') }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${authMode === 'login' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>
                Anmelden
              </button>
              <button onClick={() => { setAuthMode('register'); setAuthError('') }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${authMode === 'register' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>
                Registrieren
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Anzeigename</label>
                  <input
                    type="text"
                    value={authForm.displayName}
                    onChange={(e) => setAuthForm(prev => ({ ...prev, displayName: e.target.value }))}
                    placeholder="Vorname Nachname"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Benutzername</label>
                <input
                  type="text"
                  value={authForm.username}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                  placeholder="z.B. max.muster"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                  required
                  minLength={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Passwort</label>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Mindestens 4 Zeichen"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                  required
                  minLength={4}
                />
              </div>

              {authError && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-600 text-sm text-center bg-red-50 p-2 rounded-lg">{authError}</motion.p>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {authLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                {authLoading ? 'Wird geladen...' : authMode === 'register' ? 'Konto erstellen' : 'Anmelden'}
              </button>
            </form>

            {/* Guest mode */}
            <div className="mt-4 pt-4 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400 mb-2">Hast du einen Zugangscode?</p>
              <button onClick={() => {
                setStudentToken('guest')
                setStudent({ display_name: 'Gast', username: 'gast' })
                setView('quiz')
              }}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                Als Gast starten (ohne Account)
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    )
  }

  // ============================================================
  // RESULTS SCREEN (after quiz submission)
  // ============================================================

  if (submitted && results) {
    const totalQuestions = results.totalQuestions || questions.length
    const percentage = results.scorePercentage ?? (results.correctCount ? Math.round((results.correctCount / totalQuestions) * 100) : 0)
    const questionFeedback = results.questionResults || []
    const swissGrade = results.swissGrade || (results.totalPoints > 0 ? Math.round((results.earnedPoints / results.totalPoints * 5 + 1) * 2) / 2 : null)

    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 via-white to-blue-50 p-4">
        <div className="max-w-2xl mx-auto">
          {/* Score Summary */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center mb-8">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}
              className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center ${percentage >= 80 ? 'bg-green-100' : percentage >= 50 ? 'bg-yellow-100' : 'bg-red-100'}`}>
              <Trophy className={`h-12 w-12 ${percentage >= 80 ? 'text-green-600' : percentage >= 50 ? 'text-yellow-600' : 'text-red-600'}`} />
            </motion.div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Geschafft!</h2>
            <p className="text-gray-600 mb-6">Du hast die Aufgabe abgeschlossen.</p>

            <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 space-y-4">
              <div className={`grid ${swissGrade ? 'grid-cols-4' : 'grid-cols-3'} gap-3`}>
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-blue-600">{totalQuestions}</p>
                  <p className="text-xs text-gray-600">Fragen</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-green-600">{results.earnedPoints ?? results.correctCount ?? 0}/{results.totalPoints ?? totalQuestions}</p>
                  <p className="text-xs text-gray-600">Punkte</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-purple-600">{percentage}%</p>
                  <p className="text-xs text-gray-600">Ergebnis</p>
                </div>
                {swissGrade && (
                  <div className={`rounded-xl p-3 ${gradeBg(swissGrade)}`}>
                    <p className={`text-2xl font-bold ${gradeColor(swissGrade)}`}>{swissGrade}</p>
                    <p className="text-xs text-gray-600">Note</p>
                  </div>
                )}
              </div>

              <div className="w-full bg-gray-100 rounded-full h-3">
                <motion.div initial={{ width: 0 }} animate={{ width: `${percentage}%` }} transition={{ duration: 1, delay: 0.5 }}
                  className={`h-full rounded-full ${percentage >= 80 ? 'bg-green-500' : percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} />
              </div>

              {/* XP gained animation */}
              {xpGained && (
                <motion.div initial={{ opacity: 0, scale: 0.5, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', delay: 0.8 }}
                  className="flex items-center gap-3 justify-center bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 p-4 rounded-xl">
                  <motion.div initial={{ rotate: -20 }} animate={{ rotate: [0, 15, -15, 0] }} transition={{ delay: 1.2, duration: 0.5 }}>
                    <Zap className="h-6 w-6 text-amber-500" />
                  </motion.div>
                  <div>
                    <p className="text-lg font-bold text-amber-700">+{xpGained} XP</p>
                    <p className="text-xs text-amber-600">
                      {xpGained >= 50 ? 'Wahnsinn! Tolle Leistung!' : xpGained >= 30 ? 'Gut gemacht!' : 'Weiter so!'}
                    </p>
                  </div>
                </motion.div>
              )}

              {percentage >= 80 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}
                  className="flex items-center gap-2 justify-center text-green-700 bg-green-50 p-3 rounded-xl">
                  <Star className="h-5 w-5" /> Sehr gut gemacht!
                </motion.div>
              )}

              {results.needsReview && (
                <div className="flex items-center gap-2 justify-center text-amber-700 bg-amber-50 p-3 rounded-xl text-sm">
                  <AlertCircle className="h-4 w-4" /> Einige Antworten werden noch von deiner Lehrperson geprüft.
                </div>
              )}

              {results.duration && (
                <p className="text-sm text-gray-500 flex items-center justify-center gap-1.5">
                  <Clock className="h-4 w-4" /> Zeit: {Math.floor(results.duration / 60)} Min. {results.duration % 60} Sek.
                </p>
              )}
            </div>
          </motion.div>

          {/* Detailed Feedback Toggle */}
          {questionFeedback.length > 0 && (
            <div className="mb-6">
              <button onClick={() => setShowDetails(!showDetails)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white shadow-sm border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-all">
                {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {showDetails ? 'Feedback ausblenden' : 'Detailliertes Feedback anzeigen'}
              </button>

              <AnimatePresence>
                {showDetails && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="mt-4 space-y-3 overflow-hidden">
                    {questionFeedback.map((qr, idx) => (
                      <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                        className={`bg-white rounded-xl border-2 p-4 ${
                          qr.isCorrect === true ? 'border-green-200' :
                          qr.isCorrect === 'partial' ? 'border-yellow-200' :
                          qr.isCorrect === false ? 'border-red-200' : 'border-gray-200'
                        }`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            qr.isCorrect === true ? 'bg-green-100' :
                            qr.isCorrect === 'partial' ? 'bg-yellow-100' :
                            qr.isCorrect === false ? 'bg-red-100' : 'bg-gray-100'
                          }`}>
                            {qr.isCorrect === true && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                            {qr.isCorrect === 'partial' && <AlertCircle className="h-4 w-4 text-yellow-600" />}
                            {qr.isCorrect === false && <XCircle className="h-4 w-4 text-red-600" />}
                            {qr.isCorrect === null && <Clock className="h-4 w-4 text-gray-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold text-gray-900">Frage {qr.questionNumber || idx + 1}</span>
                              <div className="flex items-center gap-2">
                                {qr.aiGraded && (
                                  <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Sparkles className="h-3 w-3" /> KI-bewertet
                                  </span>
                                )}
                                {qr.pointsAwarded !== null && (
                                  <span className="text-xs font-medium text-gray-500">{qr.pointsAwarded}/{qr.maxPoints} P.</span>
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{qr.question}</p>
                            {qr.studentAnswer && (
                              <p className="text-sm bg-gray-50 rounded-lg p-2 mb-2">
                                <span className="text-gray-400 text-xs">Deine Antwort: </span>
                                {Array.isArray(qr.studentAnswer) ? qr.studentAnswer.join(', ') : String(qr.studentAnswer)}
                              </p>
                            )}
                            {qr.feedback && (
                              <p className={`text-sm font-medium ${
                                qr.isCorrect === true ? 'text-green-700' :
                                qr.isCorrect === 'partial' ? 'text-yellow-700' :
                                qr.isCorrect === false ? 'text-red-700' : 'text-gray-500'
                              }`}>{qr.feedback}</p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <div className="text-center flex gap-3 justify-center">
            {studentToken && studentToken !== 'guest' && (
              <button onClick={resetQuiz}
                className="px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-all">
                Zum Dashboard
              </button>
            )}
            <button onClick={resetQuiz}
              className="px-6 py-3 rounded-xl bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-all">
              Neue Aufgabe
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================
  // QUIZ VIEW (taking a quiz)
  // ============================================================

  if (view === 'quiz' && assignment) {
    const q = questions[currentQuestion]
    if (!q) return null

    const renderQuestion = () => {
      const currentAnswer = answers[currentQuestion]

      switch (q.type) {
        case 'multiple_choice':
        case 'true_false':
        case 'either_or':
          return (
            <div className="space-y-3">
              {(q.options || []).map((opt, i) => (
                <button key={i} onClick={() => setAnswers(prev => ({ ...prev, [currentQuestion]: opt }))}
                  className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all text-base ${
                    currentAnswer === opt ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/50'
                  }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      currentAnswer === opt ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                    }`}>
                      {currentAnswer === opt && <CheckCircle2 className="h-4 w-4 text-white" />}
                      {currentAnswer !== opt && <span className="text-xs font-bold text-gray-400">{String.fromCharCode(65 + i)}</span>}
                    </div>
                    <span className="font-medium">{opt}</span>
                  </div>
                </button>
              ))}
            </div>
          )

        case 'fill_blank':
          const blanks = (q.question || '').match(/___+/g) || []
          const currentBlanks = currentAnswer || []
          return (
            <div className="space-y-4">
              <div className="bg-amber-50 rounded-xl p-4 text-base leading-loose">
                {q.question.split(/___+/).map((part, pi, arr) => (
                  <span key={pi}>
                    {part}
                    {pi < arr.length - 1 && (
                      <span className="inline-block mx-1 min-w-[100px] border-b-2 border-amber-400 text-center align-bottom px-2">
                        {currentBlanks[pi] || ''}
                      </span>
                    )}
                  </span>
                ))}
              </div>
              <div className="space-y-2">
                {blanks.map((_, bi) => (
                  <div key={bi} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-amber-700">{bi + 1}</span>
                    </div>
                    <input
                      type="text"
                      value={(currentAnswer || [])[bi] || ''}
                      onChange={(e) => {
                        const updated = [...(currentAnswer || Array(blanks.length).fill(''))]
                        updated[bi] = e.target.value
                        setAnswers(prev => ({ ...prev, [currentQuestion]: updated }))
                      }}
                      placeholder={`Lücke ${bi + 1} ausfüllen...`}
                      className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-base focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )

        case 'matching':
          const pairsRaw = (q.answer || '').split(',').filter(Boolean)
          const parsePair = (p) => {
            const trimmed = p.trim()
            if (trimmed.includes('\u2192')) return trimmed.split('\u2192').map(s => s.trim())
            if (trimmed.includes(' - ')) return trimmed.split(' - ').map(s => s.trim())
            if (trimmed.includes('-')) return [trimmed.split('-')[0].trim(), trimmed.split('-').slice(1).join('-').trim()]
            return [trimmed, trimmed]
          }
          const parsedPairs = pairsRaw.map(parsePair)
          const leftItems = parsedPairs.map(p => p[0])
          const rightItems = parsedPairs.map((p, i) => ({ text: p[1], origIdx: i }))
          const seed = (q.number || currentQuestion) * 7 + parsedPairs.length
          const shuffledRight = [...rightItems].sort((a, b) => ((a.origIdx * 31 + seed) % 97) - ((b.origIdx * 31 + seed) % 97))
          const matchState = currentAnswer || { selectedLeft: null, matches: {} }
          const matches = matchState.matches || {}
          const selectedLeft = matchState.selectedLeft

          const handleLeftClick = (li) => {
            if (matches[li] !== undefined) {
              const newMatches = { ...matches }
              delete newMatches[li]
              setAnswers(prev => ({ ...prev, [currentQuestion]: { selectedLeft: null, matches: newMatches } }))
            } else {
              setAnswers(prev => ({ ...prev, [currentQuestion]: { ...matchState, selectedLeft: li } }))
            }
          }
          const handleRightClick = (ri) => {
            if (selectedLeft === null || selectedLeft === undefined) return
            if (Object.values(matches).includes(ri)) return
            const newMatches = { ...matches, [selectedLeft]: ri }
            setAnswers(prev => ({ ...prev, [currentQuestion]: { selectedLeft: null, matches: newMatches } }))
          }

          return (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Klicke links auf einen Begriff, dann rechts auf die passende Zuordnung.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  {leftItems.map((item, li) => {
                    const isMatched = matches[li] !== undefined
                    const isActive = selectedLeft === li
                    return (
                      <button key={li} onClick={() => handleLeftClick(li)}
                        className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                          isActive ? 'border-blue-500 bg-blue-100 text-blue-900 ring-2 ring-blue-300' :
                          isMatched ? 'border-green-300 bg-green-50 text-green-800' :
                          'border-blue-200 bg-blue-50 text-blue-900 hover:border-blue-400'
                        }`}>
                        {item}
                        {isMatched && <span className="ml-2 text-green-600 text-xs">{'\u2192'} {shuffledRight[matches[li]]?.text}</span>}
                      </button>
                    )
                  })}
                </div>
                <div className="space-y-2">
                  {shuffledRight.map((item, ri) => {
                    const isUsed = Object.values(matches).includes(ri)
                    return (
                      <button key={ri} onClick={() => handleRightClick(ri)}
                        disabled={isUsed || selectedLeft === null}
                        className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                          isUsed ? 'bg-gray-100 border-gray-200 text-gray-400' :
                          selectedLeft !== null ? 'bg-green-50 border-green-200 text-green-900 hover:border-green-400' :
                          'bg-gray-50 border-gray-200 text-gray-500'
                        }`}>
                        {item.text}
                      </button>
                    )
                  })}
                </div>
              </div>
              {Object.keys(matches).length > 0 && (
                <button onClick={() => setAnswers(prev => ({ ...prev, [currentQuestion]: { selectedLeft: null, matches: {} } }))}
                  className="text-xs text-gray-500 hover:text-red-500">Alle zurücksetzen</button>
              )}
            </div>
          )

        case 'ordering':
          const items = (q.answer || '').split(',').map(s => s.trim()).filter(Boolean)
          const orderSeed = (q.number || currentQuestion) * 13 + items.length
          const shuffledItems = currentAnswer || [...items].sort((a, b) => {
            const ai = items.indexOf(a), bi = items.indexOf(b)
            return ((ai * 31 + orderSeed) % 89) - ((bi * 31 + orderSeed) % 89)
          })
          return (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Bringe die Elemente in die richtige Reihenfolge.</p>
              {(Array.isArray(shuffledItems) ? shuffledItems : items).map((item, ii) => (
                <div key={ii} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-indigo-700">{ii + 1}</span>
                  </div>
                  <div className="flex-1 px-4 py-3 rounded-xl bg-white border border-gray-200 text-base font-medium">{item}</div>
                  <div className="flex flex-col gap-0.5">
                    <button disabled={ii === 0} onClick={() => {
                      const arr = [...(currentAnswer || shuffledItems)]
                      ;[arr[ii], arr[ii - 1]] = [arr[ii - 1], arr[ii]]
                      setAnswers(prev => ({ ...prev, [currentQuestion]: arr }))
                    }} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">{'\u2191'}</button>
                    <button disabled={ii === (currentAnswer || shuffledItems).length - 1} onClick={() => {
                      const arr = [...(currentAnswer || shuffledItems)]
                      ;[arr[ii], arr[ii + 1]] = [arr[ii + 1], arr[ii]]
                      setAnswers(prev => ({ ...prev, [currentQuestion]: arr }))
                    }} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">{'\u2193'}</button>
                  </div>
                </div>
              ))}
            </div>
          )

        case 'math':
          return (
            <div className="space-y-4">
              <div className="bg-orange-50 rounded-xl p-6 text-center">
                <p className="text-2xl font-mono font-bold text-gray-800">{q.question.replace(/^Berechne:\s*/i, '')}</p>
              </div>
              <input type="text" value={currentAnswer || ''}
                onChange={(e) => setAnswers(prev => ({ ...prev, [currentQuestion]: e.target.value }))}
                placeholder="Deine Antwort..."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-lg font-mono text-center focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none" />
            </div>
          )

        case 'image':
          return (
            <div className="space-y-4">
              {q.imageUrl && <img src={q.imageUrl} alt="Aufgabenbild" className="max-h-64 mx-auto rounded-xl object-contain" />}
              <textarea value={currentAnswer || ''}
                onChange={(e) => setAnswers(prev => ({ ...prev, [currentQuestion]: e.target.value }))}
                placeholder="Beschreibe, was du siehst..." rows={3}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:ring-2 focus:ring-pink-400 focus:border-pink-400 outline-none resize-none" />
            </div>
          )

        default:
          return (
            <div>
              <textarea value={currentAnswer || ''}
                onChange={(e) => setAnswers(prev => ({ ...prev, [currentQuestion]: e.target.value }))}
                placeholder="Schreibe deine Antwort hier..." rows={4}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none resize-none" />
            </div>
          )
      }
    }

    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50">
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-600" />
              <span className="font-bold text-gray-900">{assignment?.title || 'Aufgabe'}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">{studentName}</span>
              <span className="text-xs font-medium text-blue-600">{currentQuestion + 1}/{questions.length}</span>
            </div>
          </div>
          <div className="max-w-2xl mx-auto mt-2">
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <motion.div animate={{ width: `${progress * 100}%` }} className="h-full rounded-full bg-blue-500 transition-all" />
            </div>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-8">
          <AnimatePresence mode="wait">
            <motion.div key={currentQuestion} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              <div className="mb-6">
                <span className="text-sm text-blue-600 font-medium">Frage {currentQuestion + 1} von {questions.length}</span>
                <h2 className="text-xl font-bold text-gray-900 mt-1">{q.question}</h2>
                {q.points && <span className="text-xs text-gray-400 mt-1 block">{q.points} Punkte</span>}
              </div>
              {renderQuestion()}
            </motion.div>
          </AnimatePresence>

          {/* Error display */}
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Fehler bei der Abgabe</p>
                <p className="text-xs mt-0.5">{error}</p>
              </div>
              <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">
                <XCircle className="h-4 w-4" />
              </button>
            </motion.div>
          )}

          <div className="flex items-center justify-between mt-8 pt-6 border-t">
            <button onClick={() => setCurrentQuestion(prev => Math.max(0, prev - 1))} disabled={currentQuestion === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-all">
              <ArrowLeft className="h-4 w-4" /> Zurück
            </button>
            {currentQuestion < questions.length - 1 ? (
              <button onClick={() => setCurrentQuestion(prev => prev + 1)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-all">
                Weiter <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={submitAnswers} disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 transition-all">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Abgeben
              </button>
            )}
          </div>

          <div className="flex justify-center gap-1.5 mt-6">
            {questions.map((_, i) => (
              <button key={i} onClick={() => setCurrentQuestion(i)}
                className={`w-3 h-3 rounded-full transition-all ${
                  i === currentQuestion ? 'bg-blue-600 scale-125' :
                  answers[i] !== undefined ? 'bg-green-400' : 'bg-gray-200'
                }`} />
            ))}
          </div>
        </main>
      </div>
    )
  }

  // ============================================================
  // DASHBOARD VIEW (main screen after login)
  // ============================================================

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-lg">EduFlow</h1>
              {student && studentToken !== 'guest' && <p className="text-xs text-gray-500">Hallo, {student.display_name}!</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {studentToken === 'guest' ? (
              <button onClick={logout} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> Anmelden
              </button>
            ) : (
              <button onClick={logout} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <LogOut className="h-3.5 w-3.5" /> Abmelden
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Quick access: Enter code */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Aufgabe starten</h2>
            <p className="text-sm text-gray-500 mb-4">Gib den Zugangscode deiner Lehrperson ein.</p>

            <div className="flex gap-3">
              {studentToken === 'guest' && (
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="Dein Name"
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-base focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none"
                />
              )}
              <input
                type="text"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase().trim())}
                placeholder="Zugangscode"
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-lg font-mono text-center tracking-widest focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none"
                maxLength={8}
              />
              <button
                onClick={loadAssignment}
                disabled={!accessCode.trim() || (!studentName.trim() && studentToken === 'guest') || loading}
                className="px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
              </button>
            </div>
            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-600 text-sm mt-3 bg-red-50 p-2 rounded-lg">{error}</motion.p>
            )}
          </div>
        </motion.div>

        {/* Pending class assignments */}
        {studentToken !== 'guest' && classAssignments.filter(a => !a.already_submitted).length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <div className="bg-white rounded-2xl shadow-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-gray-900">Offene Aufgaben</h3>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{classAssignments.filter(a => !a.already_submitted).length}</span>
              </div>
              <div className="grid gap-2">
                {classAssignments.filter(a => !a.already_submitted).map(a => (
                  <div key={a.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-blue-50 transition-colors cursor-pointer"
                    onClick={() => { setAccessCode(a.code); setError('') }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{a.class_name}</span>
                        {a.target_niveau && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            a.target_niveau === 'A' ? 'bg-green-100 text-green-700' :
                            a.target_niveau === 'C' ? 'bg-purple-100 text-purple-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>Niveau {a.target_niveau}</span>
                        )}
                        {a.deadline && (
                          <span className={`text-[10px] ${new Date(a.deadline) < new Date() ? 'text-red-500' : 'text-gray-400'}`}>
                            bis {new Date(a.deadline).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                    <button className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors flex-shrink-0">
                      Starten
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Dashboard content (only for logged-in students) */}
        {studentToken !== 'guest' && (
          <>
            {/* Gamification hero bar */}
            {gamification && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl shadow-lg p-5 text-white">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                        <span className="text-2xl font-bold">{gamification.level}</span>
                      </div>
                      <div>
                        <p className="text-sm opacity-80">Level {gamification.level}</p>
                        <div className="w-40 h-2.5 bg-white/20 rounded-full mt-1">
                          <div className="h-full bg-white rounded-full transition-all" style={{ width: `${(gamification.xpInLevel / gamification.xpForNext) * 100}%` }} />
                        </div>
                        <p className="text-[10px] opacity-60 mt-0.5">{gamification.xpInLevel} / {gamification.xpForNext} XP</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-2xl font-bold">{gamification.xp}</p>
                        <p className="text-[10px] opacity-70">Total XP</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">{gamification.streak} <span className="text-base">🔥</span></p>
                        <p className="text-[10px] opacity-70">Streak</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">{gamification.badges?.length || 0}</p>
                        <p className="text-[10px] opacity-70">Badges</p>
                      </div>
                    </div>
                  </div>
                  {/* New badges notification */}
                  {gamification.newBadges?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/20">
                      <p className="text-xs font-semibold mb-2">Neue Badges freigeschaltet!</p>
                      <div className="flex gap-2">
                        {gamification.newBadges.map(b => (
                          <span key={b.id} className="bg-white/20 px-3 py-1 rounded-full text-xs">{b.icon} {b.name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Stats cards */}
            {myResults?.stats && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                    <div className="w-10 h-10 mx-auto mb-2 bg-blue-100 rounded-xl flex items-center justify-center">
                      <Hash className="h-5 w-5 text-blue-600" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{myResults.stats.totalQuizzes}</p>
                    <p className="text-xs text-gray-500">Prüfungen</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                    <div className="w-10 h-10 mx-auto mb-2 bg-green-100 rounded-xl flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-green-600" />
                    </div>
                    <p className={`text-2xl font-bold ${gradeColor(myResults.stats.avgGrade)}`}>{myResults.stats.avgGrade || '–'}</p>
                    <p className="text-xs text-gray-500">{'\u00D8'} Note</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                    <div className="w-10 h-10 mx-auto mb-2 bg-purple-100 rounded-xl flex items-center justify-center">
                      <BarChart3 className="h-5 w-5 text-purple-600" />
                    </div>
                    <p className="text-2xl font-bold text-purple-600">{myResults.stats.avgScore}%</p>
                    <p className="text-xs text-gray-500">{'\u00D8'} Ergebnis</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                    <div className="w-10 h-10 mx-auto mb-2 bg-amber-100 rounded-xl flex items-center justify-center">
                      <Award className="h-5 w-5 text-amber-600" />
                    </div>
                    <p className={`text-2xl font-bold ${gradeColor(myResults.stats.bestGrade)}`}>{myResults.stats.bestGrade || '–'}</p>
                    <p className="text-xs text-gray-500">Beste Note</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Tab navigation */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                {[
                  { id: 'results', label: 'Ergebnisse', icon: BarChart3 },
                  { id: 'gamification', label: 'Badges & XP', icon: Trophy },
                  { id: 'classes', label: 'Meine Klassen', icon: Users }
                ].map(tab => (
                  <button key={tab.id} onClick={() => setDashboardTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                      dashboardTab === tab.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    }`}>
                    <tab.icon className="h-3.5 w-3.5" /> {tab.label}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* ====== TAB: Results ====== */}
            {dashboardTab === 'results' && (
            <>
            {/* Results history */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">Meine Ergebnisse</h3>
                  <button onClick={() => loadMyResults()} className="text-xs text-blue-600 hover:text-blue-800">Aktualisieren</button>
                </div>

                {resultsLoading ? (
                  <div className="p-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-500" />
                  </div>
                ) : myResults?.submissions?.length > 0 ? (
                  <div className="divide-y divide-gray-50">
                    {myResults.submissions.map((sub, i) => {
                      const grade = sub.swiss_grade || 1
                      return (
                        <div key={sub.id || i} className="px-6 py-4 hover:bg-gray-50/50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${gradeBg(grade)}`}>
                              <span className={`text-xl font-bold ${gradeColor(grade)}`}>{grade}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 text-sm truncate">{sub.assignment_title}</p>
                              <div className="flex items-center gap-3 mt-0.5">
                                {sub.class_name && <span className="text-xs text-gray-400">{sub.class_name}</span>}
                                <span className="text-xs text-gray-400">{new Date(sub.submitted_at).toLocaleDateString('de-CH')}</span>
                                {sub.duration && (
                                  <span className="text-xs text-gray-400">{Math.floor(sub.duration / 60)}:{String(sub.duration % 60).padStart(2, '0')} Min.</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold text-gray-600">{sub.earned_points}/{sub.total_points} P.</p>
                              <p className={`text-xs font-medium ${sub.score_percentage >= 80 ? 'text-green-600' : sub.score_percentage >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                {sub.score_percentage}%
                              </p>
                            </div>
                            <div className="flex-shrink-0">
                              {sub.needs_review ? (
                                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Wird geprüft</span>
                              ) : sub.teacher_reviewed ? (
                                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Korrigiert</span>
                              ) : (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              )}
                            </div>
                            <button
                              onClick={() => setDeleteConfirm(sub.id)}
                              className="flex-shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Ergebnis löschen"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {/* Delete confirmation */}
                          {deleteConfirm === sub.id && (
                            <div className="mt-3 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                              <p className="text-xs text-red-700 flex-1">Dieses Ergebnis unwiderruflich löschen?</p>
                              <button
                                onClick={() => deleteSubmission(sub.id)}
                                className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors"
                              >
                                Löschen
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="text-xs text-gray-500 hover:text-gray-700"
                              >
                                Abbrechen
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
                      <BookOpen className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 font-medium mb-1">Noch keine Ergebnisse</p>
                    <p className="text-sm text-gray-400">Gib oben einen Zugangscode ein, um deine erste Aufgabe zu starten!</p>
                  </div>
                )}
              </div>
            </motion.div>
            </>
            )}

            {/* ====== TAB: Gamification ====== */}
            {dashboardTab === 'gamification' && gamification && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <div className="space-y-4">
                  {/* All Badges grid */}
                  <div className="bg-white rounded-2xl shadow-lg p-6">
                    <h3 className="font-bold text-gray-900 mb-4">Alle Badges</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {(gamification.allBadgeDefs || []).map(b => (
                        <div key={b.id} className={`p-4 rounded-xl text-center transition-all ${
                          b.earned ? 'bg-amber-50 border-2 border-amber-200' : 'bg-gray-50 border-2 border-gray-100 opacity-50'
                        }`}>
                          <span className="text-3xl">{b.icon}</span>
                          <p className="text-sm font-bold text-gray-900 mt-2">{b.name}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{b.desc}</p>
                          {b.earned && <span className="inline-block mt-2 text-[10px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">Freigeschaltet</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Leaderboard */}
                  {gamification.leaderboard?.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-lg p-6">
                      <h3 className="font-bold text-gray-900 mb-4">Rangliste</h3>
                      <div className="space-y-2">
                        {gamification.leaderboard.map((entry, i) => (
                          <div key={entry.id} className={`flex items-center gap-3 p-3 rounded-xl ${
                            entry.id === student?.id ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'
                          }`}>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                              i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-gray-300 text-white' : i === 2 ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {i + 1}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{entry.name} {entry.id === student?.id && <span className="text-xs text-blue-500">(Du)</span>}</p>
                              <p className="text-[10px] text-gray-500">Level {entry.level} · {entry.streak} 🔥</p>
                            </div>
                            <p className="text-sm font-bold text-amber-600">{entry.xp} XP</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ====== TAB: Classes ====== */}
            {dashboardTab === 'classes' && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <div className="space-y-4">
                  {/* Join class */}
                  <div className="bg-white rounded-2xl shadow-lg p-6">
                    <h3 className="font-bold text-gray-900 mb-2">Klasse beitreten</h3>
                    <p className="text-xs text-gray-500 mb-3">Gib den Beitritts-Code ein, den du von deiner Lehrperson erhalten hast.</p>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase().trim())}
                        placeholder="Klassen-Code"
                        className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-mono text-center tracking-widest focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none"
                        maxLength={8}
                        onKeyDown={(e) => e.key === 'Enter' && joinClass()}
                      />
                      <button onClick={joinClass} disabled={!joinCode.trim() || joinLoading}
                        className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all">
                        {joinLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Beitreten'}
                      </button>
                    </div>
                    {joinMessage && (
                      <p className={`text-xs mt-2 ${joinMessage.includes('Erfolgreich') ? 'text-green-600' : 'text-red-600'}`}>{joinMessage}</p>
                    )}
                  </div>

                  {/* My classes list */}
                  <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100">
                      <h3 className="font-bold text-gray-900">Meine Klassen</h3>
                    </div>
                    {myClasses.length > 0 ? (
                      <div className="divide-y divide-gray-50">
                        {myClasses.map((cls) => (
                          <div key={cls.class_id} className="px-6 py-4 flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                              <Users className="h-6 w-6 text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 text-sm">{cls.class_name}</p>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-xs text-gray-400">{cls.teacher_name}</span>
                                <span className="text-xs text-gray-400">{cls.student_count} Schüler/innen</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  cls.niveau === 'A' ? 'bg-green-100 text-green-700' :
                                  cls.niveau === 'C' ? 'bg-purple-100 text-purple-700' :
                                  'bg-blue-100 text-blue-700'
                                }`}>Niveau {cls.niveau}</span>
                              </div>
                            </div>
                            <button onClick={() => { if (confirm('Klasse wirklich verlassen?')) leaveClass(cls.class_id) }}
                              className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                              Verlassen
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-12 text-center">
                        <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-gray-500 font-medium mb-1">Noch in keiner Klasse</p>
                        <p className="text-sm text-gray-400">Gib oben einen Klassen-Code ein, um beizutreten.</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </>
        )}

        {/* Guest mode info */}
        {studentToken === 'guest' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 text-center">
              <p className="text-sm text-blue-800 mb-2">Du bist als Gast unterwegs. Erstelle ein Konto, um deine Ergebnisse zu speichern!</p>
              <button onClick={logout} className="text-sm text-blue-600 font-semibold hover:text-blue-800">
                Jetzt registrieren
              </button>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  )
}
