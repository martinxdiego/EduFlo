'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, RotateCcw } from 'lucide-react'
import FlowIntro from './FlowIntro'
import styles from './MotionSurfaces.module.css'

export default function CinematicHero({ demoMode, motionEnabled }) {
  const [replayKey, setReplayKey] = useState(0)
  const [play, setPlay] = useState(false)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    try {
      const seen = window.sessionStorage.getItem('eduflow-intro-paper-v1')
      if (!seen) {
        window.sessionStorage.setItem('eduflow-intro-paper-v1', 'seen')
        setPlay(true)
      }
    } catch { setPlay(true) }
  }, [])

  const replay = () => {
    setReplayKey(value => value + 1)
    setPlay(true)
  }

  return (
    <section id="top" className={styles.hero} aria-labelledby="landing-title">
      <div className={styles.heroCopy}>
        <p className={styles.introLine}>Für die Ideen, die nur du hast.</p>
        <h1 id="landing-title">Guter Unterricht.<br />Beginnt bei dir.</h1>
        <p className={styles.heroDescription}>Ein Gedanke wird eine Aufgabe.<br />Ein Entwurf wird dein Material.<br />Und deine Klasse entdeckt etwas Neues.</p>
        <div className={styles.actions}>
          <a className={styles.primary} href={demoMode ? '/demo' : '#auth'}>{demoMode ? 'Kostenlos ausprobieren' : 'Zum Arbeitsraum'} <ArrowRight aria-hidden="true" /></a>
          <a className={styles.textLink} href="#entdecken">EduFlow entdecken <ArrowDown aria-hidden="true" /></a>
        </div>
        <p className={styles.heroFinePrint}>{demoMode ? 'Browser-Demo ohne Konto. Mit erfundenen Beispielen.' : 'Deine Inhalte. Deine Handschrift. Dein Flow.'}</p>
      </div>
      <div className={styles.heroVisual}>
        <FlowIntro variant="paper" motionEnabled={motionEnabled && play} replayKey={replayKey} className={styles.heroIntro} />
        <div className={styles.sceneFooter}>
          <span>Raum für deine Handschrift.</span>
          <button type="button" onClick={replay} disabled={!motionEnabled} aria-label="Papier-Intro erneut abspielen"><RotateCcw aria-hidden="true" /><span>Noch einmal</span></button>
          {motionEnabled && play && <button type="button" onClick={() => setPlay(false)} className={styles.finishButton}>Zum Standbild</button>}
        </div>
      </div>
      <a className={styles.studioLink} href="/intro">Die Motion-Intros ansehen <ArrowRight aria-hidden="true" /></a>
    </section>
  )
}
