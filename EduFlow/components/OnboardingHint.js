'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Lightbulb, ArrowRight, CheckCircle2, Circle, Sparkles } from 'lucide-react'
import { Button } from '@/ui/button'

const STORAGE_KEY = 'eduflow_onboarding'

function getSeenHints() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function markSeen(hintId) {
  const seen = getSeenHints()
  seen[hintId] = true
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seen))
}

export default function OnboardingHint({ id, children }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const seen = getSeenHints()
    if (!seen[id]) {
      // Small delay so it appears after the view animates in
      const timer = setTimeout(() => setVisible(true), 400)
      return () => clearTimeout(timer)
    }
  }, [id])

  const dismiss = () => {
    setVisible(false)
    markSeen(id)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mb-4"
        >
          <div className="flex items-start gap-3 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
            <Lightbulb className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800 flex-1">{children}</p>
            <button
              onClick={dismiss}
              className="text-blue-400 hover:text-blue-600 transition-colors flex-shrink-0 mt-0.5"
              aria-label="Hinweis schliessen"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function WelcomeBanner({ hasMaterial = false, onStart }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const seen = getSeenHints()
    if (!seen['welcome']) {
      const timer = setTimeout(() => setVisible(true), 600)
      return () => clearTimeout(timer)
    }
  }, [])

  const dismiss = () => {
    setVisible(false)
    markSeen('welcome')
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mb-6"
        >
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 via-white to-indigo-50 border border-blue-100 px-5 py-5 sm:px-6">
            <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-blue-200/35 blur-3xl" aria-hidden="true" />
            <div className="flex items-start justify-between gap-4">
              <div className="relative flex-1">
                <div className="mb-3 flex items-center gap-2 text-blue-700">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  <span className="text-xs font-bold uppercase tracking-[0.16em]">Ihr Schnellstart</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">In drei Minuten zum ersten Unterrichtsmaterial</h3>
                <p className="max-w-2xl text-sm text-gray-600 leading-relaxed">EduFlow führt Sie durch den wichtigsten Ablauf. Jeder Entwurf bleibt vollständig editierbar.</p>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {[
                    ['Thema & Klasse wählen', hasMaterial],
                    ['KI-Entwurf prüfen', hasMaterial],
                    ['Exportieren oder teilen', false],
                  ].map(([label, done], index) => (
                    <div key={label} className="flex items-center gap-2 rounded-xl border border-white/80 bg-white/75 px-3 py-2.5 text-xs font-medium text-slate-700 shadow-sm">
                      {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" /> : <Circle className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />}
                      <span>{index + 1}. {label}</span>
                    </div>
                  ))}
                </div>

                {!hasMaterial && onStart && (
                  <Button onClick={onStart} size="sm" className="mt-4 gap-2">
                    Erstes Material erstellen
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
              <button
                onClick={dismiss}
                className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                aria-label="Hinweis schliessen"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
