'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { Alert, AlertDescription } from '@/ui/alert'
import { BookOpen, Sparkles, Target, Layers, Download } from 'lucide-react'

const features = [
  { icon: Sparkles, title: 'KI-Generierung', description: 'Arbeitsblätter, Prüfungen, Quizze und Vokabellisten in Sekunden' },
  { icon: Target, title: 'Lehrplan 21', description: 'Alle Inhalte an den Schweizer Lehrplan angepasst' },
  { icon: Layers, title: 'Differenzierung', description: 'Drei Schwierigkeitsstufen für jeden Lernenden' },
  { icon: Download, title: 'PDF-Export', description: 'Schüler- und Lehrerversion direkt als PDF' },
]

const ease = [0.25, 0.46, 0.45, 0.94]

export default function LandingPage({ authMode, setAuthMode, authForm, setAuthForm, handleAuth, error, setError }) {
  const prefersReduced = useReducedMotion()
  // Phases: 'splash' → 'reveal' → 'done'
  const [phase, setPhase] = useState(prefersReduced ? 'done' : 'splash')

  useEffect(() => {
    if (prefersReduced) return
    // splash (spin + open + wordmark) → then reveal page
    const t1 = setTimeout(() => setPhase('reveal'), 2200)
    const t2 = setTimeout(() => setPhase('done'), 3400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [prefersReduced])

  const isSplash = phase === 'splash'
  const isDone = phase === 'done'

  return (
    <div className="min-h-screen gradient-liquid overflow-hidden relative">
      {/* Ambient blobs — always present */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30"
          animate={{ x: [0, 100, 0], y: [0, 50, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30"
          animate={{ x: [0, -100, 0], y: [0, -50, 0] }} transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }} />
      </div>

      {/* ===== SPLASH OVERLAY ===== */}
      <AnimatePresence>
        {isSplash && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center gradient-liquid"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease }}
          >
            <div className="flex items-center">
              {/* Spinning book icon */}
              <motion.div
                style={{ perspective: 800 }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, ease }}
              >
                <motion.div
                  style={{ transformStyle: 'preserve-3d' }}
                  animate={{ rotateY: [0, 360, 720, 810, 810] }}
                  transition={{ duration: 2.0, times: [0, 0.35, 0.7, 0.85, 1], ease: [0.4, 0, 0.2, 1] }}
                >
                  <BookOpen className="h-16 w-16 text-blue-500" />
                </motion.div>
              </motion.div>
              {/* Wordmark clips in after spin stops */}
              <motion.div
                style={{ overflow: 'hidden' }}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 'auto', opacity: 1 }}
                transition={{ delay: 1.6, duration: 0.45, ease }}
              >
                <h1 className="text-5xl sm:text-7xl font-bold text-gradient whitespace-nowrap ml-4">EduFlow</h1>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== MAIN PAGE CONTENT ===== */}
      <div className="container mx-auto px-4 py-16 relative z-10">
        {/* Hero — logo in final position */}
        <div className="text-center mb-12">
          <motion.div
            className="flex items-center justify-center mb-6"
            initial={{ opacity: 0, y: 60 }}
            animate={!isSplash ? { opacity: 1, y: 0 } : { opacity: 0, y: 60 }}
            transition={{ duration: 0.7, ease }}
          >
            <motion.div style={{ perspective: 800 }}>
              <BookOpen className="h-16 w-16 text-blue-500 mr-4" />
            </motion.div>
            <h1 className="text-5xl sm:text-7xl font-bold text-gradient">EduFlow</h1>
          </motion.div>

          <motion.p
            className="text-xl sm:text-2xl text-gray-700 max-w-3xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={!isSplash ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.5, delay: isSplash ? 0 : 0.2, ease }}
          >
            Erstellen Sie in Sekunden perfekte Arbeitsblätter mit KI – abgestimmt auf den{' '}
            <span className="font-semibold text-blue-600">Lehrplan 21</span>
          </motion.p>
        </div>

        {/* Feature cards */}
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6 mb-16 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              animate={!isSplash ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              transition={{ duration: 0.5, delay: isSplash ? 0 : 0.35 + index * 0.1, ease }}
              whileHover={{ y: -8 }}
            >
              <Card className="glass-card hover-lift border-0 h-full">
                <CardHeader className="pb-3">
                  <feature.icon className="h-10 w-10 text-blue-500 mb-3" />
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent><p className="text-gray-600 text-sm">{feature.description}</p></CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Login card */}
        <motion.div
          className="max-w-md mx-auto"
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={!isSplash ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.97 }}
          transition={{ duration: 0.5, delay: isSplash ? 0 : 0.8, ease }}
        >
          <Card className="glass-card border-0">
            <CardHeader className="space-y-2">
              <CardTitle className="text-2xl">{authMode === 'login' ? 'Anmelden' : 'Konto erstellen'}</CardTitle>
              <CardDescription className="text-base">
                {authMode === 'login' ? 'Willkommen zurück bei EduFlow.' : 'Kostenlos starten – 5 Materialien gratis pro Monat.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAuth} className="space-y-5">
                {authMode === 'register' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                    <Label className="text-sm font-medium">Ihr Name</Label>
                    <Input type="text" placeholder="z.B. Anna Müller" value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} required className="input-premium mt-1.5" />
                  </motion.div>
                )}
                <div>
                  <Label className="text-sm font-medium">E-Mail-Adresse</Label>
                  <Input type="email" placeholder="name@schule.ch" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} required className="input-premium mt-1.5" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Passwort</Label>
                  <Input type="password" placeholder="Mindestens 8 Zeichen" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} required className="input-premium mt-1.5" />
                </div>
                {error && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                    <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
                  </motion.div>
                )}
                <Button type="submit" className="w-full btn-premium">{authMode === 'login' ? 'Anmelden' : 'Kostenlos registrieren'}</Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setError('') }}>
                  {authMode === 'login' ? 'Noch kein Konto? Jetzt registrieren' : 'Bereits registriert? Anmelden'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
