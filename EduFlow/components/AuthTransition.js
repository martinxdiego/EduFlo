'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { BookOpen, Check, Sparkles } from 'lucide-react'

export default function AuthTransition({ message }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-slate-950 px-6 text-white"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="status"
      aria-live="polite"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(37,99,235,0.38),transparent_35%),radial-gradient(circle_at_80%_75%,rgba(99,102,241,0.3),transparent_38%)]" aria-hidden="true" />
      <motion.div
        className="relative w-full max-w-sm text-center"
        initial={reduceMotion ? false : { y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.35 }}
      >
        <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
          {!reduceMotion && (
            <motion.span
              className="absolute inset-0 rounded-[1.75rem] border border-blue-300/50"
              animate={{ rotate: 360, scale: [1, 1.08, 1] }}
              transition={{ rotate: { duration: 4, repeat: Infinity, ease: 'linear' }, scale: { duration: 1.5, repeat: Infinity } }}
            />
          )}
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 shadow-2xl shadow-blue-500/40">
            <BookOpen className="h-8 w-8" aria-hidden="true" />
          </span>
          <motion.span className="absolute -right-1 -top-1 rounded-full bg-white p-1.5 text-blue-600" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.25, type: 'spring' }}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </motion.span>
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-200">EduFlow</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Unterricht beginnt mit einer guten Idee.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{message}</p>
        <div className="mx-auto mt-7 h-1.5 max-w-xs overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-300" initial={{ width: '12%' }} animate={{ width: '100%' }} transition={{ duration: reduceMotion ? 0 : 0.75, ease: 'easeOut' }} />
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
          Sitzung sicher bestätigt
        </div>
      </motion.div>
    </motion.div>
  )
}
