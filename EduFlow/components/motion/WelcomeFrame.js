'use client'

import { useRef } from 'react'
import { useInView } from 'framer-motion'
import FlowIntro from './FlowIntro'
import { FlowMark } from '../EduFlowMotion'
import styles from './MotionSurfaces.module.css'

export default function WelcomeFrame({ children, motionEnabled = false, preview = false, demoMode = false, replayKey = 0 }) {
  const stage = useRef(null)
  const inView = useInView(stage, { once: true, amount: 0.2 })
  return (
    <div className={styles.welcomeFrame}>
      <div className={styles.welcomeVisual} ref={stage}>
        <div className={styles.welcomeBrand}><FlowMark /><span>EduFlow</span></div>
        <div className={styles.welcomeSculpture}><FlowIntro variant="focus" motionEnabled={motionEnabled && inView} compact replayKey={replayKey} /></div>
        <div className={styles.welcomeCopy}>
          <h2 id={preview ? undefined : 'auth-heading'}>Dein nächster<br />guter Unterricht.</h2>
          <p>Ein klarer Kopf.<br />Ein neuer Gedanke.<br />Ein guter Flow.</p>
        </div>
        <p className={styles.welcomeNote}>{preview ? 'Designvorschau für die Anmeldung.' : demoMode ? 'Kostenlose Browser-Demo mit Beispieldaten.' : 'Testversion. Der verfügbare Umfang hängt von deiner Freigabe ab.'}</p>
      </div>
      <div className={styles.welcomeContent}>{children}</div>
    </div>
  )
}
