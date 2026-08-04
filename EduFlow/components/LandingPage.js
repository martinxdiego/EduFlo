'use client'

import Link from 'next/link'
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { Alert, AlertDescription } from '@/ui/alert'
import {
  ArrowRight,
  BookOpen,
  Check,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Layers,
  LoaderCircle,
  PencilLine,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

const benefits = [
  {
    icon: FileUp,
    title: 'Mit eigenem Material starten',
    description: 'Vorhandene Unterlagen hochladen und als verlässliche Grundlage weiterverwenden.',
  },
  {
    icon: Layers,
    title: 'Passend differenzieren',
    description: 'Varianten für unterschiedliche Lernniveaus erstellen, ohne alles neu aufzubauen.',
  },
  {
    icon: PencilLine,
    title: 'Volle Kontrolle behalten',
    description: 'Jeden KI-Entwurf prüfen, bearbeiten und an die eigene Klasse anpassen.',
  },
  {
    icon: Download,
    title: 'Direkt einsetzen',
    description: 'Schüler- und Lehrerversion als PDF oder DOCX druckfertig exportieren.',
  },
]

const workflow = [
  ['01', 'Material oder Thema wählen', 'Unterlagen hochladen oder mit einem Lernziel beginnen.'],
  ['02', 'Niveau und Lehrplanbezug festlegen', 'EduFlow erstellt einen strukturierten, editierbaren Entwurf.'],
  ['03', 'Prüfen und exportieren', 'Inhalte anpassen und als PDF oder DOCX mitnehmen.'],
]

function GoogleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

export default function LandingPage({
  authMode,
  setAuthMode,
  authForm,
  setAuthForm,
  handleAuth,
  handleGoogleLogin,
  error,
  setError,
}) {
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const reduceMotion = useReducedMotion()
  const isLogin = authMode === 'login'

  const switchMode = (mode) => {
    setAuthMode(mode)
    setError('')
  }

  const submitAuth = async (event) => {
    setIsSubmitting(true)
    try {
      await handleAuth(event)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-950">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <motion.div className="absolute -left-32 top-20 h-80 w-80 rounded-full bg-blue-200/45 blur-3xl" animate={reduceMotion ? undefined : { x: [0, 36, 0], y: [0, -20, 0] }} transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="absolute right-[-8rem] top-[-6rem] h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl" animate={reduceMotion ? undefined : { x: [0, -32, 0], y: [0, 28, 0] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }} />
        <div className="absolute bottom-0 left-1/2 h-64 w-[46rem] -translate-x-1/2 rounded-full bg-cyan-100/50 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 pb-16 sm:px-8 lg:px-10">
        <header className="flex min-h-20 items-center justify-between border-b border-slate-200/70">
          <div className="flex items-center gap-3" aria-label="EduFlow">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-xl font-semibold tracking-tight">EduFlow</span>
          </div>
          <Link
            href="/schueler"
            className="tap-target inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
          >
            Zum Schülerportal
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </header>

        <section className="grid items-start gap-12 py-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.75fr)] lg:gap-16 lg:py-20">
          <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-2 text-sm font-medium text-blue-800">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Für Lehrpersonen in der Schweiz
            </div>

            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
              Aus Ihrem Material wird Unterricht, der zu Ihrer Klasse passt.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              EduFlow erstellt editierbare Entwürfe für Arbeitsblätter und Prüfungen – mit Lehrplan-21-Bezug,
              Differenzierung und druckfertigem Export.
            </p>

            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-700">
              {['5 Materialien kostenlos', 'Keine Kreditkarte nötig', 'Jeder Entwurf bleibt editierbar'].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  {item}
                </span>
              ))}
            </div>

            <div className="relative mt-9 max-w-2xl rounded-3xl border border-white/80 bg-white/75 p-3 shadow-2xl shadow-blue-950/10 backdrop-blur-xl sm:p-4">
              <motion.div
                className="absolute -right-3 -top-4 hidden rounded-2xl border border-emerald-100 bg-white px-3 py-2 shadow-lg sm:flex sm:items-center sm:gap-2"
                animate={reduceMotion ? undefined : { y: [0, -6, 0], rotate: [0, 1, 0] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                aria-hidden="true"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-4 w-4" /></span>
                <span className="text-xs font-semibold text-slate-700">Qualität geprüft</span>
              </motion.div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-300" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  </div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">Lehrplan 21</span>
                </div>
                <div className="grid gap-4 p-4 sm:grid-cols-[0.75fr_1.25fr] sm:p-5">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600">Ihr Auftrag</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">Wasserkreislauf · 5. Klasse</p>
                    <div className="mt-4 space-y-2 text-xs text-slate-500">
                      <p className="rounded-lg bg-white px-3 py-2">Niveau: Mittel</p>
                      <p className="rounded-lg bg-white px-3 py-2">10 abwechslungsreiche Fragen</p>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {[['01', 'Verdunstung erklären'], ['02', 'Wolkenbildung zuordnen'], ['03', 'Kreislauf beschriften']].map(([number, text], index) => (
                      <motion.div
                        key={number}
                        className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm"
                        animate={reduceMotion ? undefined : { x: [0, index === 1 ? 4 : 2, 0] }}
                        transition={{ duration: 3.2 + index, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[11px] font-bold text-blue-700">{number}</span>
                        <span className="text-xs font-medium text-slate-700">{text}</span>
                        <Check className="ml-auto h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                      </motion.div>
                    ))}
                    <div className="pt-1">
                      <div className="mb-1.5 flex justify-between text-[10px] font-medium text-slate-400"><span>Entwurf</span><span>bereit</span></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><motion.div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" initial={{ width: '72%' }} animate={{ width: '100%' }} transition={{ duration: reduceMotion ? 0 : 1.8, repeat: reduceMotion ? 0 : Infinity, repeatDelay: 2 }} /></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </motion.div>

          <motion.div
            id="auth"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="lg:sticky lg:top-8 lg:row-span-2"
          >
            <Card className="border-slate-200/80 bg-white/95 shadow-2xl shadow-slate-900/10 backdrop-blur">
              <CardHeader className="space-y-5 pb-4">
                <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1" aria-label="Anmeldung oder Registrierung">
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className={`tap-target rounded-lg px-3 py-2 text-sm font-medium transition ${isLogin ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    aria-pressed={isLogin}
                  >
                    Anmelden
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    className={`tap-target rounded-lg px-3 py-2 text-sm font-medium transition ${!isLogin ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    aria-pressed={!isLogin}
                  >
                    Kostenlos starten
                  </button>
                </div>
                <div>
                  <CardTitle className="text-2xl tracking-tight">{isLogin ? 'Willkommen zurück' : 'Erstes Material erstellen'}</CardTitle>
                  <CardDescription className="mt-2 text-base leading-6">
                    {isLogin ? 'Melden Sie sich bei Ihrem EduFlow-Konto an.' : 'Kostenlos registrieren und direkt mit dem ersten Entwurf beginnen.'}
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent>
                <form onSubmit={submitAuth} className="space-y-4">
                  {!isLogin && (
                    <div>
                      <Label htmlFor="auth-name" className="text-sm font-medium">Name</Label>
                      <Input
                        id="auth-name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        placeholder="Anna Müller"
                        value={authForm.name}
                        onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
                        required
                        className="input-premium mt-1.5 h-11"
                      />
                    </div>
                  )}

                  <div>
                    <Label htmlFor="auth-email" className="text-sm font-medium">E-Mail-Adresse</Label>
                    <Input
                      id="auth-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="name@schule.ch"
                      value={authForm.email}
                      onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                      required
                      className="input-premium mt-1.5 h-11"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <Label htmlFor="auth-password" className="text-sm font-medium">Passwort</Label>
                      {isLogin && (
                        <Link href="/passwort-zuruecksetzen" className="text-xs font-medium text-blue-700 transition hover:text-blue-900 hover:underline">
                          Passwort vergessen?
                        </Link>
                      )}
                    </div>
                    <div className="relative mt-1.5">
                      <Input
                        id="auth-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={isLogin ? 'current-password' : 'new-password'}
                        placeholder="Mindestens 8 Zeichen"
                        value={authForm.password}
                        onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                        minLength={8}
                        required
                        className="input-premium h-11 pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-slate-500 transition hover:text-slate-800"
                        aria-label={showPassword ? 'Passwort ausblenden' : 'Passwort anzeigen'}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <Alert variant="destructive" role="alert" aria-live="polite">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" disabled={isSubmitting} className="h-12 w-full text-base font-semibold">
                    {isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                    {isSubmitting ? 'Sichere Anmeldung läuft …' : isLogin ? 'Sicher anmelden' : 'Kostenloses Konto erstellen'}
                    {!isSubmitting && <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />}
                  </Button>

                  <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                    <div className="relative flex justify-center text-xs uppercase tracking-[0.14em]"><span className="bg-white px-3 text-slate-400">oder</span></div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full gap-3 border-slate-300 bg-white hover:bg-slate-50"
                    onClick={handleGoogleLogin}
                  >
                    <GoogleIcon className="h-5 w-5" />
                    Mit Google fortfahren
                  </Button>
                </form>

                <div className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-3.5 text-xs leading-5 text-slate-600">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                  <p>KI-Inhalte sind editierbare Entwürfe. Sie prüfen und entscheiden, was im Unterricht eingesetzt wird.</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden rounded-3xl border border-slate-200 bg-white/85 shadow-xl shadow-slate-900/5 backdrop-blur"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <p className="text-sm font-semibold text-slate-900">Vom Ausgangsmaterial zum fertigen Arbeitsblatt</p>
                <p className="mt-1 text-xs text-slate-500">Ein klarer Ablauf statt eines leeren KI-Chats</p>
              </div>
              <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 sm:inline-flex">
                Lehrperson entscheidet
              </span>
            </div>
            <div className="grid gap-0 sm:grid-cols-3">
              {workflow.map(([number, title, description], index) => (
                <div key={number} className={`p-5 sm:p-6 ${index < workflow.length - 1 ? 'border-b border-slate-100 sm:border-b-0 sm:border-r' : ''}`}>
                  <span className="text-xs font-bold tracking-[0.18em] text-blue-600">{number}</span>
                  <h2 className="mt-3 text-sm font-semibold leading-5 text-slate-900">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        <section aria-labelledby="benefits-title" className="border-t border-slate-200/80 py-14">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Weniger Vorbereitungszeit</p>
            <h2 id="benefits-title" className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Ein durchgängiger Workflow statt einzelner KI-Helfer.
            </h2>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((benefit) => (
              <article key={benefit.title} className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <benefit.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{benefit.description}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="flex flex-col gap-3 border-t border-slate-200/80 py-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} EduFlow · Entwickelt für den Schweizer Unterricht</p>
          <div className="flex items-center gap-2 text-slate-600">
            <BookOpen className="h-4 w-4 text-blue-600" aria-hidden="true" />
            Lehrplan 21 · Editierbar · Exportbereit
          </div>
        </footer>
      </div>
    </main>
  )
}
