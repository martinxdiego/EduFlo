'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion'
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, Download, Eye, EyeOff, FileText, FolderOpen, Layers, LoaderCircle, PencilLine, Plus, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Alert, AlertDescription } from '@/ui/alert'
import { FlowMark, MotionControl, useEduFlowMotion } from './EduFlowMotion'
import styles from './LandingPage.module.css'

const ease = [0.22, 1, 0.36, 1]
const workflow = [
  { icon: FileText, number: '01', title: 'Dein Ausgangspunkt.', description: 'Ein Thema, eine Idee oder vorhandene Unterlagen. Dein Wissen gibt die Richtung vor.' },
  { icon: PencilLine, number: '02', title: 'Deine Handschrift.', description: 'Aufgaben bearbeiten, Formulierungen verfeinern und das Material auf deine Klasse abstimmen.' },
  { icon: Download, number: '03', title: 'Dein Unterricht.', description: 'Den fertigen Entwurf prüfen. Als PDF drucken oder als Word-Datei weiterverwenden.' },
]

function Reveal({ children, className, motionEnabled, delay = 0, ...props }) {
  return <motion.div className={className} initial={motionEnabled ? { opacity: 0, y: 24 } : false} animate={motionEnabled ? undefined : { opacity: 1, y: 0 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: motionEnabled ? 0.65 : 0, delay: motionEnabled ? delay : 0, ease }} {...props}>{children}</motion.div>
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

function WaterCycle({ suffix }) {
  return (
    <svg className={styles.waterCycle} viewBox="0 0 560 210" role="img" aria-label="Illustration des Wasserkreislaufs mit Verdunstung, Wolken und Niederschlag">
      <defs>
        <linearGradient id={`water-${suffix}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#8bc8ff" /><stop offset="1" stopColor="#5678ee" /></linearGradient>
        <linearGradient id={`sky-${suffix}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#edf5ff" /><stop offset="1" stopColor="#f8faff" /></linearGradient>
        <linearGradient id={`hill-${suffix}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#dce8e8" /><stop offset="1" stopColor="#b7d5d2" /></linearGradient>
      </defs>
      <rect width="560" height="210" rx="14" fill={`url(#sky-${suffix})`} />
      <circle cx="96" cy="57" r="24" fill="#ffe5a3" /><circle cx="96" cy="57" r="33" fill="none" stroke="#ffe5a3" strokeWidth="1" opacity=".6" />
      <path d="M297 170 382 69 483 170" fill={`url(#hill-${suffix})`} /><path d="m350 107 32-38 38 38-27-8-12 10-12-9-19 7Z" fill="#fff" />
      <path d="M0 169c66-26 96-22 155-6 55 16 93 16 147 3 96-23 164-5 258 9v35H0v-41Z" fill={`url(#water-${suffix})`} />
      <path d="M0 187c79-19 127 21 208 1 73-18 150 19 224 0 49-12 85-6 128 5" fill="none" stroke="#ffffff60" strokeWidth="2" />
      <path d="M233 53c-6-19-35-19-43-3-22-8-36 7-30 20h107c9-18-15-31-34-17Z" fill="white" stroke="#dae7f7" />
      <path d="M427 46c-5-14-28-16-36-2-19-6-31 6-26 17h90c7-15-12-27-28-15Z" fill="white" stroke="#dae7f7" />
      <path className={styles.cyclePath} d="M126 145c0-33 7-48 27-63M280 57c18-2 36-1 57 1M419 81l-13 40" fill="none" stroke="#7299d5" strokeWidth="1.8" strokeDasharray="4 5" />
      <path d="m146 84 8-4-1 9m175-36 10 5-10 4m73 12 5 11 9-7" stroke="#7299d5" strokeWidth="1.8" fill="none" />
      <g className={styles.rainDrops} stroke="#8baee5" strokeWidth="2" strokeLinecap="round"><path d="m191 89-3 8m21-5-3 8m21-11-3 8m175-15-3 8m20-6-3 8" /></g>
      <text x="54" y="135" fill="#57718e" fontSize="10" fontFamily="inherit">Verdunstung</text><text x="200" y="35" fill="#57718e" fontSize="10" fontFamily="inherit">Kondensation</text><text x="435" y="105" fill="#57718e" fontSize="10" fontFamily="inherit">Niederschlag</text>
    </svg>
  )
}

function ProductScene({ motionEnabled }) {
  const sceneRef = useRef(null)
  const [showSolutions, setShowSolutions] = useState(false)
  const { scrollYProgress } = useScroll({ target: sceneRef, offset: ['start end', 'end start'] })
  const sceneY = useTransform(scrollYProgress, [0, 1], [22, -22])
  const sceneRotate = useTransform(scrollYProgress, [0, 1], [2, -1])

  return (
    <div className={styles.productScene} ref={sceneRef}>
      <div className={styles.sceneGlow} aria-hidden="true" />
      <div className={styles.orbitOne} aria-hidden="true" /><div className={styles.orbitTwo} aria-hidden="true" />
      <motion.div className={styles.productWindow} style={motionEnabled ? { y: sceneY, rotateX: sceneRotate } : undefined}>
        <div className={styles.windowBar} aria-hidden="true"><span /><span /><span /><div><ShieldCheck /> eduflow · dein Arbeitsraum</div><span className={styles.windowDot} /></div>
        <div className={styles.windowBody}>
          <aside className={styles.previewSidebar} aria-hidden="true">
            <div className={styles.previewBrand}><FlowMark /><span>EduFlow</span></div>
            <div className={styles.previewNew}><Plus /> Neues Material</div>
            <span className={styles.sidebarLabel}>DEIN ARBEITSRAUM</span>
            <span className={styles.sidebarSelected}><FolderOpen /> Materialien <span>8</span></span>
            <span><Layers /> Vorlagen</span><span><BookOpen /> Lehrplan 21</span>
            <div className={styles.sidebarBottom}><span>EM</span><div>Dein Unterricht<small>Mit deiner Handschrift.</small></div></div>
          </aside>
          <div className={styles.previewDesk}>
            <div className={styles.deskToolbar}><span>Materialien <ChevronRight /> Wasserkreislauf</span><span className={styles.exampleBadge}>Beispielansicht</span></div>
            <div className={styles.sheetStack}>
              <div className={styles.sheetBehind} aria-hidden="true" />
              <article className={styles.worksheet} aria-label={showSolutions ? 'Beispiel mit Lösungshinweisen' : 'Beispiel-Arbeitsblatt'}>
                <div className={styles.sheetMeta}><span>NATUR, MENSCH, GESELLSCHAFT</span><span>5. KLASSE</span></div>
                <div className={styles.sheetHeading}><div><span>ENTDECKEN. VERSTEHEN. WEITERDENKEN.</span><h2>Wasser bleibt<br />in Bewegung.</h2></div><div className={styles.levelBadge}>NMG<small>Zyklus 2</small></div></div>
                <p className={styles.sheetIntroduction}>Vom Regentropfen bis zur Wolke: Entdecke den Weg des Wassers.</p>
                <WaterCycle suffix="hero" />
                <div className={styles.sheetQuestion}><span>01</span><div><h3>Was geschieht bei der Verdunstung?</h3>{showSolutions ? <p className={styles.solutionText}>Wasser wird durch Wärme gasförmig und steigt als Wasserdampf auf.</p> : <div className={styles.answerLines}><i /><i /></div>}</div><span className={styles.questionType}>{showSolutions ? <Check /> : <PencilLine />}</span></div>
                <div className={styles.sheetQuestion}><span>02</span><div><h3>Bringe den Kreislauf in die richtige Reihenfolge.</h3><div className={styles.cycleChips}>{(showSolutions ? ['Verdunstung', 'Kondensation', 'Niederschlag'] : ['Niederschlag', 'Verdunstung', 'Kondensation']).map((label, index) => <span key={label}>{showSolutions && `${index + 1} `}{label}</span>)}</div></div></div>
                <div className={styles.sheetFootnote}>EduFlow · Beispielmaterial<span>01 / 02</span></div>
              </article>
            </div>
          </div>
        </div>
      </motion.div>
      <div className={styles.floatingEdit} aria-hidden="true"><span><PencilLine /></span><div><strong>Deine Idee. Dein Feinschliff.</strong><small>Jede Aufgabe bleibt editierbar.</small></div></div>
      <div className={styles.floatingExport} aria-hidden="true"><span><Download /></span><div><strong>Bereit für deine Klasse.</strong><small>PDF & Word</small></div><Check /></div>
      <div className={styles.sceneControls}>
        <div className={styles.previewSwitch} aria-label="Beispielansicht wechseln">
          <button type="button" onClick={() => setShowSolutions(false)} aria-pressed={!showSolutions} className={!showSolutions ? styles.selectedSwitch : ''}><FileText /> Arbeitsblatt</button>
          <button type="button" onClick={() => setShowSolutions(true)} aria-pressed={showSolutions} className={showSolutions ? styles.selectedSwitch : ''}><Check /> Lösungshinweise</button>
        </div>
        <p>Interaktive Designvorschau · kein gespeichertes Material</p>
      </div>
    </div>
  )
}

function MaterialConstellation() {
  return <div className={styles.constellation} aria-hidden="true">
    <div className={`${styles.sourcePage} ${styles.sourceOne}`}><span><FileText /> EIGENE UNTERLAGEN</span><i /><i /><i /><div><span /><span /><span /></div></div>
    <div className={`${styles.sourcePage} ${styles.sourceTwo}`}><span><BookOpen /> DEIN THEMA</span><strong>Was deine Klasse<br />morgen entdeckt.</strong><i /><i /></div>
    <div className={`${styles.sourcePage} ${styles.sourceThree}`}><span><PencilLine /> DEINE IDEE</span><strong>«Das können wir<br />noch besser<br />erklären.»</strong><small>Hier beginnt dein Flow.</small></div>
    <div className={styles.constellationCore}><FlowMark /><div className={styles.coreRing} /></div>
    <div className={styles.constellationBeam} />
  </div>
}

export default function LandingPage({ authMode = 'login', setAuthMode, authForm, setAuthForm, handleAuth, handleGoogleLogin, error, setError, demoMode = false }) {
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const motionPreference = useEduFlowMotion()
  const { motionEnabled } = motionPreference
  const isLogin = authMode === 'login'

  const switchMode = (mode) => {
    setAuthMode(mode)
    setError('')
  }

  const submitAuth = async (event) => {
    setIsSubmitting(true)
    try { await handleAuth(event) } finally { setIsSubmitting(false) }
  }

  return (
    <main className={styles.page} data-motion={motionEnabled ? 'on' : 'off'}>
      <a className={styles.skipLink} href={demoMode ? '/demo' : '#auth'}>{demoMode ? 'Direkt zur Demo' : 'Direkt zur Anmeldung'}</a>
      <header className={styles.header}>
        <div className={styles.navInner}>
          <a className={styles.brand} href="#top" aria-label="EduFlow Startseite"><FlowMark /><span>EduFlow</span></a>
          <nav className={styles.nav} aria-label="Hauptnavigation"><a href="#entdecken" className={styles.navExplore}>Entdecken</a>{!demoMode && <Link href="/schueler" className={styles.studentLink}>Schülerportal <ArrowUpRight /></Link>}</nav>
          <div className={styles.navActions}><MotionControl {...motionPreference} /><a href={demoMode ? '/demo' : '#auth'} className={styles.navLogin} onClick={demoMode ? undefined : () => switchMode('login')}>{demoMode ? 'Demo öffnen' : 'Anmelden'} <ArrowRight /></a></div>
        </div>
      </header>

      <section id="top" className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.heroAmbient} aria-hidden="true" />
        <motion.div className={styles.heroContent} initial={motionEnabled ? { opacity: 0, y: 16 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: motionEnabled ? 0.75 : 0, ease }}>
          <div className={styles.eyebrow}><span className={styles.eyebrowDot} /> Für Lehrpersonen mit guten Ideen.</div>
          <h1 id="landing-title">Gute Ideen.<br /><span>Starker Unterricht.</span></h1>
          <p className={styles.heroLead}>Dein Wissen. Deine Handschrift. Dein Flow.<br className={styles.desktopBreak} /> Ein Arbeitsraum für Material, das zu deiner Klasse passt.</p>
          <div className={styles.heroActions}><a href={demoMode ? '/demo' : '#auth'} className={styles.primaryAction}>{demoMode ? 'Kostenlos ausprobieren' : 'EduFlow entdecken'} <ArrowRight /></a><a href="#entdecken" className={styles.secondaryAction}>Einen Blick hineinwerfen <ArrowDown /></a></div>
          <Link href={demoMode ? '/demo/hinweise' : '/schueler'} className={styles.mobileStudentPortal}>{demoMode ? 'Ohne Konto · nur Beispieldaten' : 'Zum Schülerportal'} <ArrowUpRight aria-hidden="true" /></Link>
          <div className={styles.heroDetails}><span><Check /> Editierbar bis ins Detail</span><span><Check /> PDF & Word</span><span><Check /> Für den Schweizer Unterricht</span></div>
        </motion.div>
        <Reveal className={styles.heroProduct} motionEnabled={motionEnabled} delay={0.12}><ProductScene motionEnabled={motionEnabled} /></Reveal>
        <div className={styles.heroCaption}><span>WENIGER REIBUNG.</span><span>MEHR DEIN FLOW.</span></div>
      </section>

      <section id="entdecken" className={styles.story} aria-labelledby="story-title">
        <div className={styles.storyAmbient} aria-hidden="true" />
        <div className={styles.storyInner}>
          <Reveal className={styles.storyCopy} motionEnabled={motionEnabled}>
            <p className={styles.sectionEyebrow}><Sparkles /> AUS DEINEN IDEEN WIRD UNTERRICHT.</p>
            <h2 id="story-title">Du bringst<br />das Wesentliche.<br /><span>Wir den Flow.</span></h2>
            <p>Gute Vorbereitung beginnt bei dir. EduFlow gibt deinen Materialien einen gemeinsamen Ort – vom ersten Gedanken bis zum fertigen Arbeitsblatt.</p>
            <a href="#so-funktionierts">So nimmt deine Idee Form an <ArrowRight /></a>
          </Reveal>
          <Reveal className={styles.storyArt} motionEnabled={motionEnabled} delay={0.1}><MaterialConstellation /></Reveal>
        </div>
        <div className={styles.storyPrinciples}><span><PencilLine /> Deine Inhalte bleiben deine Entscheidung.</span><span><Layers /> Raum für verschiedene Lernwege.</span><span><Download /> Digital vorbereiten. Im Unterricht einsetzen.</span></div>
      </section>

      <section id="so-funktionierts" className={styles.workflow} aria-labelledby="workflow-title">
        <Reveal className={styles.sectionHeading} motionEnabled={motionEnabled}><p className={styles.sectionEyebrow}>EIN KLARER WEG. DEIN EIGENER STIL.</p><h2 id="workflow-title">Vom Gedanken<br /><span>zum Aha-Moment.</span></h2><p>Kein Material ist fertig, bevor es für dich stimmt.</p></Reveal>
        <div className={styles.workflowGrid}>{workflow.map((step, index) => <Reveal key={step.number} className={styles.workflowStep} motionEnabled={motionEnabled} delay={index * 0.08}><div className={styles.stepTop}><span className={styles.stepIcon}><step.icon /></span><span>{step.number}</span></div><h3>{step.title}</h3><p>{step.description}</p></Reveal>)}</div>
        <Reveal className={styles.craftPanel} motionEnabled={motionEnabled}>
          <div className={styles.craftCopy}><span className={styles.sectionEyebrow}>VOM ENTWURF ZUM DEINEN.</span><h3>Die letzte Zeile?<br /><span>Schreibst immer du.</span></h3><p>Eine passende Frage. Ein hilfreicher Hinweis. Ein Wort, das deine Klasse versteht. Mach aus einem Entwurf dein Material.</p><span className={styles.craftPill}><PencilLine /> Bearbeiten. Prüfen. Einsetzen.</span></div>
          <div className={styles.editExample} aria-label="Beispiel einer überarbeiteten Aufgabenstellung"><div className={styles.editExampleBar}><span /><span /><span /><p>Dein Feinschliff</p><PencilLine /></div><div className={styles.editExampleContent}><span className={styles.exampleFieldLabel}>AUFGABE 01</span><p className={styles.beforeText}>Erkläre den Wasserkreislauf.</p><div className={styles.afterText}><span className={styles.editCaret} /><p>Ein Regentropfen geht auf Reisen.<br />Beschreibe seinen Weg in deinen Worten.</p></div><div className={styles.editExampleFooter}><span><Check /> Deine Formulierung</span><span>Deine Klasse. Deine Sprache.</span></div></div></div>
        </Reveal>
      </section>

      <section id="auth" className={styles.authSection} aria-labelledby="auth-heading">
        <div className={styles.authAmbient} aria-hidden="true" />
        <div className={styles.authInner}>
          <Reveal className={styles.authCopy} motionEnabled={motionEnabled}><FlowMark /><p className={styles.sectionEyebrow}>DEIN NÄCHSTER GUTER UNTERRICHT.</p><h2 id="auth-heading">Beginnt mit<br /><span>einem guten Flow.</span></h2><p>Öffne deinen Arbeitsraum und gib deinen Ideen eine Form.</p><div className={styles.authNote}><ShieldCheck /><p>{demoMode ? 'Deine Demo-Entwürfe bleiben auf diesem Gerät. Bitte nutze ausschliesslich erfundene Beispieldaten.' : 'Du behältst die pädagogische Kontrolle. Entwürfe und KI-Inhalte prüfst du vor dem Einsatz selbst.'}</p></div><div className={styles.testNote}><span /> {demoMode ? 'Kostenlose Browser-Demo · ohne Anmeldung und ohne eingebautes Ablaufdatum.' : 'Testversion · Der verfügbare Funktionsumfang hängt von deiner Freigabe ab.'}</div></Reveal>
          <Reveal className={styles.authCard} motionEnabled={motionEnabled} delay={0.1}>
            {demoMode ? <div className={styles.demoCard}>
              <span className={styles.demoBadge}>BEREIT ZUM AUSPROBIEREN</span>
              <h3>Dein erster Aha-Moment.</h3>
              <p>Wähle ein Beispiel. Passe Aufgaben und Lösungen an. Nimm dein Material als PDF oder Word-Datei mit.</p>
              <ul><li><Check /> Drei Beispiele, elf Aufgabentypen</li><li><Check /> Lokal speichern und weiterarbeiten</li><li><Check /> Kein Konto und keine KI-Kosten</li></ul>
              <a className={styles.primaryAction} href="/demo">Demo jetzt öffnen <ArrowRight /></a>
              <a className={styles.demoNotes} href="/demo/hinweise">So werden deine Demo-Daten gespeichert</a>
            </div> : <>
            <div className={styles.authTabs} aria-label="Anmeldung oder Registrierung"><button type="button" onClick={() => switchMode('login')} className={isLogin ? styles.activeTab : ''} aria-pressed={isLogin}>Anmelden</button><button type="button" onClick={() => switchMode('register')} className={!isLogin ? styles.activeTab : ''} aria-pressed={!isLogin}>Konto erstellen</button></div>
            <div className={styles.authTitle}><h3>{isLogin ? 'Schön, dass du da bist.' : 'Platz für deine Ideen.'}</h3><p>{isLogin ? 'Melde dich mit deinem EduFlow-Konto an.' : 'Erstelle dein persönliches EduFlow-Konto.'}</p></div>
            <form onSubmit={submitAuth} className={styles.authForm} aria-label={isLogin ? 'Bei EduFlow anmelden' : 'EduFlow-Konto erstellen'}>
              <AnimatePresence initial={false}>{!isLogin && <motion.div key="name-field" className={styles.authField} initial={motionEnabled ? { height: 0, opacity: 0 } : false} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: motionEnabled ? 0.2 : 0 }}><Label htmlFor="auth-name">Name</Label><Input id="auth-name" name="name" type="text" autoComplete="name" placeholder="Anna Müller" value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} required disabled={isSubmitting} /></motion.div>}</AnimatePresence>
              <div className={styles.authField}><Label htmlFor="auth-email">E-Mail-Adresse</Label><Input id="auth-email" name="email" type="email" inputMode="email" autoComplete="email" placeholder="name@schule.ch" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} required disabled={isSubmitting} /></div>
              <div className={styles.authField}><div className={styles.authLabelRow}><Label htmlFor="auth-password">Passwort</Label>{isLogin && <Link href="/passwort-zuruecksetzen">Passwort vergessen?</Link>}</div><div className={styles.passwordWrap}><Input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} placeholder="Mindestens 8 Zeichen" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} minLength={8} required disabled={isSubmitting} /><button type="button" className={styles.passwordToggle} onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Passwort ausblenden' : 'Passwort anzeigen'} aria-pressed={showPassword}>{showPassword ? <EyeOff /> : <Eye />}</button></div></div>
              {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
              <Button type="submit" className={styles.authSubmit} disabled={isSubmitting}>{isSubmitting ? <><LoaderCircle className={motionEnabled ? styles.submitSpinner : ''} aria-hidden="true" /> {isLogin ? 'Anmeldung läuft …' : 'Konto wird erstellt …'}</> : <>{isLogin ? 'In deinen Arbeitsraum' : 'Konto erstellen'}<ArrowRight aria-hidden="true" /></>}</Button>
              <div className={styles.authDivider}><span />oder<span /></div>
              <Button type="button" variant="outline" className={styles.googleButton} onClick={handleGoogleLogin} disabled={isSubmitting}><GoogleIcon /> Mit Google fortfahren</Button>
              {!isLogin && <p className={styles.registrationTerms}>Mit der Registrierung akzeptierst du die <Link href="/agb">AGB</Link>. Informationen zu deinen Daten findest du im <Link href="/datenschutz">Datenschutz</Link>.</p>}
            </form>
            </>}
            <div className={styles.authCardFooter}><span>Für Lehrpersonen.</span><span>Mit Raum für deine Ideen.</span></div>
          </Reveal>
        </div>
      </section>
      <footer className={styles.footer}><a href="#top" className={styles.brand}><FlowMark /><span>EduFlow</span></a><p>Dein Unterricht. Dein Flow.</p><span>Entwickelt für den Schweizer Unterricht.</span><a href="#top" className={styles.backTop} aria-label="Zurück zum Anfang"><ArrowUpRight /></a></footer>
    </main>
  )
}
