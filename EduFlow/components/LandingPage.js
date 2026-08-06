'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { Alert, AlertDescription } from '@/ui/alert'
import {
  ArrowDown,
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
  { icon: FileUp, number: '01', title: 'Mit eigenem Material starten', description: 'Vorhandene Unterlagen hochladen und als verlässliche Grundlage weiterverwenden.' },
  { icon: Layers, number: '02', title: 'Passend differenzieren', description: 'Varianten für unterschiedliche Lernniveaus erstellen, ohne alles neu aufzubauen.' },
  { icon: PencilLine, number: '03', title: 'Volle Kontrolle behalten', description: 'Jeden KI-Entwurf prüfen, bearbeiten und an die eigene Klasse anpassen.' },
  { icon: Download, number: '04', title: 'Direkt einsetzen', description: 'Schüler- und Lehrerversion als PDF oder DOCX druckfertig exportieren.' },
]

const workflow = [
  ['01', 'Material oder Thema wählen', 'Unterlagen hochladen oder mit einem Lernziel beginnen.'],
  ['02', 'Niveau und Lehrplanbezug festlegen', 'EduFlow erstellt einen strukturierten, editierbaren Entwurf.'],
  ['03', 'Prüfen und exportieren', 'Inhalte anpassen und als PDF oder DOCX mitnehmen.'],
]

const reveal = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0 },
}

function BrandMark({ className = '' }) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <span className="brand-mark-page brand-mark-page-left" />
      <span className="brand-mark-page brand-mark-page-right" />
      <span className="brand-mark-spine" />
    </span>
  )
}

function LoadingScreen({ reducedMotion }) {
  return (
    <motion.div
      data-loading-screen
      className="loading-stage"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: reducedMotion ? 1 : 1.015 }}
      transition={{ duration: reducedMotion ? 0.15 : 0.75, ease: [0.65, 0, 0.35, 1] }}
      role="status"
      aria-live="polite"
      aria-label="EduFlow wird vorbereitet"
    >
      <div className="loading-grain" aria-hidden="true" />
      <motion.div
        className="loading-emblem"
        initial={reducedMotion ? false : { opacity: 0, scale: 0.8, rotate: -5 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <BrandMark className="brand-mark-loading" />
      </motion.div>
      <div className="loading-copy">
        <motion.p
          className="loading-wordmark"
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.65 }}
        >
          EduFlow
        </motion.p>
        <motion.p
          className="loading-message"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85, duration: 0.6 }}
        >
          Gute Vorbereitung schafft Raum fürs Wesentliche.
        </motion.p>
      </div>
      <div className="loading-progress-wrap">
        <div className="loading-progress-label">
          <span>Arbeitsraum wird vorbereitet</span>
          <span>EduFlow · CH</span>
        </div>
        <div className="loading-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuetext="EduFlow wird geladen">
          <span className={reducedMotion ? 'loading-progress-static' : ''} />
        </div>
      </div>
    </motion.div>
  )
}

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

function MaterialPreview({ style }) {
  return (
    <motion.div className="material-scene" style={style} aria-label="Beispiel eines editierbaren EduFlow-Arbeitsblatts">
      <div className="material-shadow-sheet" aria-hidden="true" />
      <div className="material-sheet">
        <div className="material-sheet-topline">
          <span>NMG · 5. Klasse</span>
          <span className="material-status"><i /> Entwurf bereit</span>
        </div>
        <div className="material-title-row">
          <div>
            <p>Arbeitsblatt</p>
            <h2>Der Wasserkreislauf</h2>
          </div>
          <span className="material-level">Niveau M</span>
        </div>
        <div className="water-cycle" aria-hidden="true">
          <span className="water-sun" />
          <span className="water-cloud cloud-one" />
          <span className="water-cloud cloud-two" />
          <span className="water-line line-one" />
          <span className="water-line line-two" />
          <span className="water-drop drop-one" />
          <span className="water-drop drop-two" />
          <span className="water-land" />
        </div>
        <div className="material-question">
          <span>01</span>
          <div><strong>Was geschieht bei der Verdunstung?</strong><i /></div>
          <Check aria-hidden="true" />
        </div>
        <div className="material-question">
          <span>02</span>
          <div><strong>Beschrifte den Kreislauf.</strong><i /></div>
          <PencilLine aria-hidden="true" />
        </div>
      </div>
      <motion.div className="material-note" whileHover={reveal.visible}>
        <Sparkles aria-hidden="true" />
        <div><strong>Lehrplan 21</strong><span>NMG.4.2 · passend zugeordnet</span></div>
      </motion.div>
    </motion.div>
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
  const [loading, setLoading] = useState(true)
  const reducedMotion = useReducedMotion()
  const { scrollYProgress } = useScroll()
  const previewY = useTransform(scrollYProgress, [0, 0.45], [0, reducedMotion ? 0 : 58])
  const isLogin = authMode === 'login'

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 4500)
    return () => window.clearTimeout(timer)
  }, [])

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

  const motionProps = reducedMotion
    ? { initial: false }
    : { initial: 'hidden', whileInView: 'visible', viewport: { once: true, amount: 0.2 } }

  return (
    <AnimatePresence mode="wait">
      {loading ? (
        <LoadingScreen key="loading" reducedMotion={reducedMotion} />
      ) : (
        <motion.main
          key="landing"
          className="landing-shell"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reducedMotion ? 0.15 : 0.8 }}
        >
          <div className="landing-grid-texture" aria-hidden="true" />
          <div className="landing-orbit landing-orbit-one" aria-hidden="true" />
          <div className="landing-orbit landing-orbit-two" aria-hidden="true" />

          <div className="landing-container">
            <header className="landing-header">
              <a href="#top" className="landing-brand" aria-label="EduFlow Startseite">
                <BrandMark />
                <span>EduFlow</span>
              </a>
              <nav className="landing-nav" aria-label="Schnellnavigation">
                <a href="#so-funktionierts" className="landing-nav-link">So funktioniert&apos;s</a>
                <Link href="/schueler" className="landing-student-link">
                  Schülerportal <ArrowRight aria-hidden="true" />
                </Link>
              </nav>
            </header>

            <section id="top" className="landing-hero" aria-labelledby="landing-title">
              <motion.div
                className="hero-copy"
                initial={reducedMotion ? false : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="hero-kicker"><span>Für Lehrpersonen</span><i /> Entwickelt in der Schweiz</div>
                <h1 id="landing-title">
                  Ihr Material.<br />
                  <span className="hero-emphasis">Ihre Klasse.</span><br />
                  Ein guter Unterricht.
                </h1>
                <p className="hero-lead">
                  EduFlow verwandelt Ihre Unterlagen in editierbare Arbeitsblätter und Prüfungen – differenziert,
                  mit Lehrplan-21-Bezug und bereit für den Unterricht.
                </p>
                <div className="hero-actions">
                  <a href="#auth" className="hero-primary-action">Kostenlos beginnen <ArrowRight aria-hidden="true" /></a>
                  <a href="#so-funktionierts" className="hero-secondary-action">Ablauf entdecken <ArrowDown aria-hidden="true" /></a>
                </div>
                <div className="hero-proof" aria-label="Vorteile">
                  {['5 Materialien kostenlos', 'Keine Kreditkarte', 'Immer editierbar'].map((item) => (
                    <span key={item}><Check aria-hidden="true" />{item}</span>
                  ))}
                </div>
              </motion.div>

              <motion.div
                className="hero-preview"
                initial={reducedMotion ? false : { opacity: 0, x: 28, rotate: 1 }}
                animate={{ opacity: 1, x: 0, rotate: 0 }}
                transition={{ delay: reducedMotion ? 0 : 0.18, duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
              >
                <MaterialPreview style={{ y: previewY }} />
              </motion.div>

              <motion.div id="auth" className="auth-panel" variants={reveal} {...motionProps} transition={{ duration: 0.65 }}>
                <Card className="auth-card">
                  <CardHeader className="auth-card-header">
                    <div className="auth-tabs" aria-label="Anmeldung oder Registrierung">
                      <button type="button" onClick={() => switchMode('login')} className={isLogin ? 'is-active' : ''} aria-pressed={isLogin}>Anmelden</button>
                      <button type="button" onClick={() => switchMode('register')} className={!isLogin ? 'is-active' : ''} aria-pressed={!isLogin}>Kostenlos starten</button>
                    </div>
                    <div>
                      <CardTitle className="auth-title">{isLogin ? 'Willkommen zurück.' : 'Ihr erster Entwurf wartet.'}</CardTitle>
                      <CardDescription className="auth-description">
                        {isLogin ? 'Melden Sie sich bei Ihrem EduFlow-Konto an.' : 'Kostenlos registrieren und direkt mit dem ersten Material beginnen.'}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={submitAuth} className="auth-form">
                      {!isLogin && (
                        <div className="auth-field">
                          <Label htmlFor="auth-name">Name</Label>
                          <Input id="auth-name" name="name" type="text" autoComplete="name" placeholder="Anna Müller" value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} required />
                        </div>
                      )}
                      <div className="auth-field">
                        <Label htmlFor="auth-email">E-Mail-Adresse</Label>
                        <Input id="auth-email" name="email" type="email" inputMode="email" autoComplete="email" placeholder="name@schule.ch" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} required />
                      </div>
                      <div className="auth-field">
                        <div className="auth-label-row">
                          <Label htmlFor="auth-password">Passwort</Label>
                          {isLogin && <Link href="/passwort-zuruecksetzen" className="auth-forgot">Passwort vergessen?</Link>}
                        </div>
                        <div className="auth-password-wrap">
                          <Input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} placeholder="Mindestens 8 Zeichen" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} minLength={8} required />
                          <button type="button" onClick={() => setShowPassword((current) => !current)} className="auth-password-toggle" aria-label={showPassword ? 'Passwort ausblenden' : 'Passwort anzeigen'}>
                            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                          </button>
                        </div>
                      </div>
                      {error && <Alert variant="destructive" role="alert" aria-live="polite"><AlertDescription>{error}</AlertDescription></Alert>}
                      <Button type="submit" disabled={isSubmitting} className="auth-submit">
                        {isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin !ml-0" aria-hidden="true" />}
                        {isSubmitting ? 'Sichere Anmeldung läuft …' : isLogin ? 'Sicher anmelden' : 'Konto erstellen'}
                        {!isSubmitting && <ArrowRight aria-hidden="true" />}
                      </Button>
                      <div className="auth-divider"><span>oder</span></div>
                      <Button type="button" variant="outline" className="auth-google" onClick={handleGoogleLogin}>
                        <GoogleIcon className="h-5 w-5" /> Mit Google fortfahren
                      </Button>
                    </form>
                    <div className="auth-trust"><ShieldCheck aria-hidden="true" /><p>KI-Inhalte sind editierbare Entwürfe. Sie prüfen und entscheiden, was im Unterricht eingesetzt wird.</p></div>
                  </CardContent>
                </Card>
              </motion.div>
            </section>

            <section id="so-funktionierts" className="workflow-section" aria-labelledby="workflow-title">
              <motion.div className="section-heading" variants={reveal} {...motionProps} transition={{ duration: 0.65 }}>
                <p className="section-index">01 / Der Ablauf</p>
                <h2 id="workflow-title">Vom Ausgangsmaterial<br />zum fertigen Arbeitsblatt.</h2>
                <p>Ein klarer Prozess statt eines leeren KI-Chats. Sie behalten an jedem Punkt die pädagogische Entscheidung.</p>
              </motion.div>
              <div className="workflow-list">
                {workflow.map(([number, title, description], index) => (
                  <motion.article key={number} variants={reveal} {...motionProps} transition={{ duration: 0.55, delay: reducedMotion ? 0 : index * 0.08 }}>
                    <span>{number}</span><h3>{title}</h3><p>{description}</p><ArrowRight aria-hidden="true" />
                  </motion.article>
                ))}
              </div>
            </section>

            <section className="benefits-section" aria-labelledby="benefits-title">
              <motion.div className="benefits-intro" variants={reveal} {...motionProps} transition={{ duration: 0.65 }}>
                <p className="section-index">02 / Warum EduFlow</p>
                <h2 id="benefits-title">Mehr Zeit für das,<br /><em>was nur Sie können.</em></h2>
              </motion.div>
              <div className="benefits-grid">
                {benefits.map((benefit, index) => (
                  <motion.article key={benefit.title} className="benefit-card" variants={reveal} {...motionProps} transition={{ duration: 0.55, delay: reducedMotion ? 0 : index * 0.07 }} whileHover={reducedMotion ? undefined : { y: -7 }}>
                    <span className="benefit-number">{benefit.number}</span>
                    <benefit.icon aria-hidden="true" />
                    <h3>{benefit.title}</h3>
                    <p>{benefit.description}</p>
                  </motion.article>
                ))}
              </div>
            </section>

            <footer className="landing-footer">
              <div className="landing-brand"><BrandMark /><span>EduFlow</span></div>
              <p>© {new Date().getFullYear()} EduFlow · Entwickelt für den Schweizer Unterricht</p>
              <div>Lehrplan 21 · Editierbar · Exportbereit</div>
            </footer>
          </div>
        </motion.main>
      )}
    </AnimatePresence>
  )
}
