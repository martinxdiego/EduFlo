'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, CheckCircle2, ArrowRight, Clock, Send, ArrowLeft, Star, Trophy, Loader2 } from 'lucide-react'

export default function SchuelerPage() {
  const [accessCode, setAccessCode] = useState('')
  const [assignment, setAssignment] = useState(null)
  const [studentName, setStudentName] = useState('')
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [startTime] = useState(Date.now())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null)

  const loadAssignment = async () => {
    if (!accessCode.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/student/assignment/${accessCode}`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Aufgabe nicht gefunden.')
        setLoading(false)
        return
      }
      const data = await res.json()
      setAssignment(data)
    } catch (err) {
      setError('Verbindungsfehler. Bitte versuche es erneut.')
    }
    setLoading(false)
  }

  const submitAnswers = async () => {
    setLoading(true)
    const duration = Math.round((Date.now() - startTime) / 1000)
    try {
      const res = await fetch('/api/student/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentCode: accessCode,
          studentName,
          answers,
          duration,
        })
      })
      const data = await res.json()
      setResults(data)
      setSubmitted(true)
    } catch (err) {
      setError('Abgabe fehlgeschlagen. Bitte versuche es erneut.')
    }
    setLoading(false)
  }

  const questions = assignment?.content?.questions || []
  const progress = questions.length > 0 ? Object.keys(answers).length / questions.length : 0

  // Access code entry screen
  if (!assignment) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
              <BookOpen className="h-10 w-10 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">EduFlow</h1>
            <p className="text-gray-600">Gib deinen Zugangscode ein, um die Aufgabe zu starten.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Dein Name</label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Vorname Nachname"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Zugangscode</label>
              <input
                type="text"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                placeholder="z.B. ABC123"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-lg font-mono text-center tracking-widest focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                maxLength={8}
              />
            </div>
            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-600 text-sm text-center bg-red-50 p-2 rounded-lg">{error}</motion.p>
            )}
            <button
              onClick={loadAssignment}
              disabled={!accessCode.trim() || !studentName.trim() || loading}
              className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
              {loading ? 'Wird geladen...' : 'Aufgabe starten'}
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  // Results screen
  if (submitted && results) {
    const totalQuestions = questions.length
    const correctCount = results.correctCount || 0
    const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 via-white to-blue-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-lg w-full text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}
            className="w-24 h-24 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
            <Trophy className="h-12 w-12 text-green-600" />
          </motion.div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Geschafft!</h2>
          <p className="text-gray-600 mb-6">Du hast die Aufgabe abgeschlossen.</p>

          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-blue-600">{totalQuestions}</p>
                <p className="text-xs text-gray-600">Fragen</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-green-600">{correctCount}</p>
                <p className="text-xs text-gray-600">Richtig</p>
              </div>
              <div className="bg-purple-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-purple-600">{percentage}%</p>
                <p className="text-xs text-gray-600">Ergebnis</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-100 rounded-full h-3">
              <motion.div initial={{ width: 0 }} animate={{ width: `${percentage}%` }} transition={{ duration: 1, delay: 0.5 }}
                className={`h-full rounded-full ${percentage >= 80 ? 'bg-green-500' : percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} />
            </div>

            {percentage >= 80 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}
                className="flex items-center gap-2 justify-center text-green-700 bg-green-50 p-3 rounded-xl">
                <Star className="h-5 w-5" /> Sehr gut gemacht!
              </motion.div>
            )}

            {results.duration && (
              <p className="text-sm text-gray-500 flex items-center justify-center gap-1.5">
                <Clock className="h-4 w-4" /> Zeit: {Math.floor(results.duration / 60)} Min. {results.duration % 60} Sek.
              </p>
            )}
          </div>

          <button onClick={() => { setAssignment(null); setSubmitted(false); setAnswers({}); setAccessCode(''); setResults(null) }}
            className="px-6 py-3 rounded-xl bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-all">
            Neue Aufgabe starten
          </button>
        </motion.div>
      </div>
    )
  }

  // Question-by-question view
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
        const pairs = (q.answer || '').split(',').filter(Boolean)
        const leftItems = pairs.map(p => p.split('→')[0]?.trim())
        const rightItems = pairs.map((p, i) => ({ text: p.split('→')[1]?.trim(), origIdx: i }))
        const seed = (q.number || currentQuestion) * 7 + pairs.length
        const shuffledRight = [...rightItems].sort((a, b) => ((a.origIdx * 31 + seed) % 97) - ((b.origIdx * 31 + seed) % 97))
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Ordne die Begriffe zu. Tippe links und dann rechts.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                {leftItems.map((item, li) => (
                  <div key={li} className="px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-sm font-medium text-blue-900">
                    {item}
                    {(currentAnswer || {})[li] !== undefined && (
                      <span className="ml-2 text-blue-500">→ {shuffledRight[(currentAnswer || {})[li]]?.text}</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {shuffledRight.map((item, ri) => {
                  const isSelected = Object.values(currentAnswer || {}).includes(ri)
                  return (
                    <button key={ri} onClick={() => {
                      const pending = Object.keys(currentAnswer || {}).length
                      if (pending < leftItems.length) {
                        setAnswers(prev => ({ ...prev, [currentQuestion]: { ...(prev[currentQuestion] || {}), [pending]: ri } }))
                      }
                    }}
                      disabled={isSelected}
                      className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                        isSelected ? 'bg-gray-100 border-gray-200 text-gray-400' : 'bg-green-50 border-green-200 text-green-900 hover:bg-green-100'
                      }`}>
                      {item.text}
                    </button>
                  )
                })}
              </div>
            </div>
            {Object.keys(currentAnswer || {}).length > 0 && (
              <button onClick={() => setAnswers(prev => ({ ...prev, [currentQuestion]: {} }))}
                className="text-xs text-gray-500 hover:text-red-500">Zuordnung zurücksetzen</button>
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
                <div className="flex-1 px-4 py-3 rounded-xl bg-white border border-gray-200 text-base font-medium">
                  {item}
                </div>
                <div className="flex flex-col gap-0.5">
                  <button disabled={ii === 0} onClick={() => {
                    const arr = [...(currentAnswer || shuffledItems)]
                    ;[arr[ii], arr[ii - 1]] = [arr[ii - 1], arr[ii]]
                    setAnswers(prev => ({ ...prev, [currentQuestion]: arr }))
                  }} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">↑</button>
                  <button disabled={ii === (currentAnswer || shuffledItems).length - 1} onClick={() => {
                    const arr = [...(currentAnswer || shuffledItems)]
                    ;[arr[ii], arr[ii + 1]] = [arr[ii + 1], arr[ii]]
                    setAnswers(prev => ({ ...prev, [currentQuestion]: arr }))
                  }} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">↓</button>
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
            <input
              type="text"
              value={currentAnswer || ''}
              onChange={(e) => setAnswers(prev => ({ ...prev, [currentQuestion]: e.target.value }))}
              placeholder="Deine Antwort..."
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-lg font-mono text-center focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
            />
          </div>
        )

      case 'image':
        return (
          <div className="space-y-4">
            {q.imageUrl && <img src={q.imageUrl} alt="Aufgabenbild" className="max-h-64 mx-auto rounded-xl object-contain" />}
            <textarea
              value={currentAnswer || ''}
              onChange={(e) => setAnswers(prev => ({ ...prev, [currentQuestion]: e.target.value }))}
              placeholder="Beschreibe, was du siehst..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:ring-2 focus:ring-pink-400 focus:border-pink-400 outline-none resize-none"
            />
          </div>
        )

      default: // open
        return (
          <div>
            <textarea
              value={currentAnswer || ''}
              onChange={(e) => setAnswers(prev => ({ ...prev, [currentQuestion]: e.target.value }))}
              placeholder="Schreibe deine Antwort hier..."
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none resize-none"
            />
          </div>
        )
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50">
      {/* Header */}
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
        {/* Progress bar */}
        <div className="max-w-2xl mx-auto mt-2">
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <motion.div animate={{ width: `${progress * 100}%` }} className="h-full rounded-full bg-blue-500 transition-all" />
          </div>
        </div>
      </header>

      {/* Question */}
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

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t">
          <button
            onClick={() => setCurrentQuestion(prev => Math.max(0, prev - 1))}
            disabled={currentQuestion === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-all"
          >
            <ArrowLeft className="h-4 w-4" /> Zurück
          </button>

          {currentQuestion < questions.length - 1 ? (
            <button
              onClick={() => setCurrentQuestion(prev => prev + 1)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-all"
            >
              Weiter <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={submitAnswers}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 transition-all"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Abgeben
            </button>
          )}
        </div>

        {/* Question dots */}
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
