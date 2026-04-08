'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Lightbulb } from 'lucide-react'

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

export function WelcomeBanner() {
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
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-50 via-white to-purple-50 border border-blue-100 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Willkommen bei EduFlow!</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Erstellen Sie Arbeitsblätter und Prüfungen unter <strong>Erstellen</strong>, verwalten Sie Ihre Materialien in der <strong>Bibliothek</strong>, und planen Sie Ihr Schuljahr im <strong>Jahresplaner</strong>. Nutzen Sie die Navigation links, um loszulegen.
                </p>
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
