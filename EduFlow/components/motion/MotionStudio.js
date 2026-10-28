'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Moon, RotateCcw, Sun } from 'lucide-react'
import { FlowMark, MotionControl, useEduFlowMotion } from '../EduFlowMotion'
import FlowIntro from './FlowIntro'
import WelcomeFrame from './WelcomeFrame'
import styles from './MotionSurfaces.module.css'

const scenes = [
  { id: 'paper', title: 'Paper', description: 'Ein Gedanke nimmt Form an.', detail: 'Drei Blätter finden ihren Platz. Aus einzelnen Ideen entsteht ein Material mit deiner Handschrift.', use: 'Für den ersten Eindruck.', number: '01' },
  { id: 'orbit', title: 'Orbit', description: 'Eine Linie. Ein neuer Anfang.', detail: 'Eine feine Lichtbahn zeichnet das EduFlow-Zeichen. Danach kehrt Ruhe ein.', use: 'Für kurze Übergänge.', number: '02' },
  { id: 'focus', title: 'Focus', description: 'Alles findet seinen Flow.', detail: 'Wenige Flächen ordnen sich zu einer klaren Form. Die Anmeldung bleibt dabei jederzeit erreichbar.', use: 'Für deinen Arbeitsraum.', number: '03' },
]

export default function MotionStudio({ demoMode = false }) {
  const [variant, setVariant] = useState('paper')
  const [replayKey, setReplayKey] = useState(0)
  const [dark, setDark] = useState(true)
  const [still, setStill] = useState(false)
  const motionPreference = useEduFlowMotion()
  const scene = scenes.find(item => item.id === variant)
  const motionEnabled = motionPreference.motionEnabled && !still
  const replay = () => { setStill(false); setReplayKey(value => value + 1) }
  const selectScene = id => { setVariant(id); setStill(false); setReplayKey(value => value + 1) }

  return (
    <main className={styles.studio}>
      <a className={styles.skip} href="#motion-preview">Direkt zur Intro-Vorschau</a>
      <header className={styles.studioHeader}>
        <a href="/" className={styles.studioBrand}><FlowMark /><span>EduFlow</span></a>
        <nav aria-label="Motion-Vorschau"><a href="/" className={styles.backLink}><ArrowLeft aria-hidden="true" /> Startseite</a><a href="#anmeldung">Anmeldung ansehen</a></nav>
        <MotionControl {...motionPreference} />
      </header>
      <div className={styles.studioHeading}>
        <p>Bewegung mit einer Idee.</p>
        <h1>Drei Anfänge.<br />Ein eigener Flow.</h1>
        <p>Räumliches Papier. Eine Lichtbahn. Ein Moment der Klarheit.<br /> Entdecke drei Intros für EduFlow.</p>
      </div>
      <section id="motion-preview" className={styles.previewSection} aria-label="Interaktive Motion-Intros">
        <div className={styles.previewToolbar}>
          <div className={styles.segmented} role="group" aria-label="Intro auswählen">
            {scenes.map(item => <button type="button" key={item.id} aria-pressed={variant === item.id} onClick={() => selectScene(item.id)}>{item.title}</button>)}
          </div>
          <div className={styles.appearance} role="group" aria-label="Bühnenfarbe">
            <button type="button" aria-label="Helle Bühne" aria-pressed={!dark} onClick={() => setDark(false)}><Sun aria-hidden="true" /></button>
            <button type="button" aria-label="Dunkle Bühne" aria-pressed={dark} onClick={() => setDark(true)}><Moon aria-hidden="true" /></button>
          </div>
        </div>
        <div className={`${styles.previewStage} ${dark ? styles.darkStage : styles.lightStage}`} data-theme={dark ? 'dark' : 'light'}>
          <span className={styles.stageBrand}>EduFlow / {scene.title}</span>
          <FlowIntro variant={variant} motionEnabled={motionEnabled} replayKey={replayKey} className={styles.studioIntro} />
          <div className={styles.stageCaption}><span>{scene.description}</span><span>Motion {scene.number}</span></div>
        </div>
        <div className={styles.previewDetails}>
          <div aria-live="polite" aria-atomic="true"><h2>{scene.use}</h2><p>{scene.detail}</p></div>
          <div className={styles.playback}>
            <button type="button" onClick={replay} disabled={!motionPreference.motionEnabled}><RotateCcw aria-hidden="true" /> Erneut abspielen</button>
            <button type="button" onClick={() => setStill(value => !value)} disabled={!motionPreference.motionEnabled} aria-pressed={still || !motionPreference.motionEnabled}>{!motionPreference.motionEnabled ? 'Standbild aktiv' : still ? 'Animation ansehen' : 'Standbild ansehen'}</button>
          </div>
        </div>
        <p className={styles.accessNote}>{motionPreference.reducedMotion ? 'Deine Systemeinstellung für reduzierte Bewegung ist aktiv. Du siehst die fertigen Kompositionen ohne räumliche Animation.' : 'Die Intros enden von selbst in einem ruhigen Bild. Du kannst die Bewegung jederzeit ausschalten.'}</p>
      </section>
      <section id="anmeldung" className={styles.loginSection} aria-labelledby="login-preview-heading">
        <div className={styles.loginHeading}><h2 id="login-preview-heading">Ein guter Einstieg.<br />Ohne Umwege.</h2><p>Die Animation bekommt Raum. Die Anmeldung bleibt im Mittelpunkt.</p></div>
        <WelcomeFrame preview motionEnabled={motionPreference.motionEnabled}>
          <div className={styles.loginPreview}>
            <span className={styles.previewLabel}>Designvorschau · keine Anmeldung</span>
            <h3>Schön, dass du da bist.</h3>
            <p>So kann der Einstieg in deinen EduFlow-Arbeitsraum aussehen.</p>
            <div className={styles.exampleField}><span>E-Mail-Adresse</span><div>name@schule.ch</div></div>
            <div className={styles.exampleField}><span>Passwort</span><div aria-label="Passwortplatzhalter">••••••••••••</div></div>
            <a href={demoMode ? '/demo' : '/#auth'} className={styles.primary}>{demoMode ? 'Demo ohne Anmeldung öffnen' : 'Zur echten Anmeldung'} <ArrowRight aria-hidden="true" /></a>
            <p className={styles.previewExplanation}>Hier werden keine Zugangsdaten abgefragt. {demoMode ? 'Die kostenlose Demo öffnet sich direkt.' : 'Dein bestehendes Konto meldest du auf der Startseite an.'}</p>
          </div>
        </WelcomeFrame>
      </section>
      <section className={styles.motionPrinciples} aria-label="So bleibt Bewegung angenehm">
        <div><Check aria-hidden="true" /><h2>Du gibst das Tempo vor.</h2><p>Kein Intro versperrt einen Link oder eine Eingabe.</p></div>
        <div><Check aria-hidden="true" /><h2>Weniger, wenn du möchtest.</h2><p>Reduzierte Bewegung und deine Pauseneinstellung werden berücksichtigt.</p></div>
        <div><Check aria-hidden="true" /><h2>Für jeden Bildschirm.</h2><p>Klare Formen und eine eigene Komposition für kleine Displays.</p></div>
      </section>
      <footer className={styles.studioFooter}><p>EduFlow. Dein Unterricht. Dein Flow.</p><a href={demoMode ? '/demo' : '/#auth'}>{demoMode ? 'Zur Demo' : 'Zum Arbeitsraum'} <ArrowUpRight aria-hidden="true" /></a></footer>
    </main>
  )
}
