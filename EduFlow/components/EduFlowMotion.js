'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Pause, Play } from 'lucide-react'
import styles from './EduFlowMotion.module.css'

const motionPreferenceKey = 'eduflow-motion-paused'
const motionPreferenceEvent = 'eduflow:motion-preference'

export function useEduFlowMotion() {
  const reducedMotion = useReducedMotion()
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const readPreference = (event) => {
      if (typeof event?.detail?.paused === 'boolean') {
        setPaused(event.detail.paused)
        return
      }
      try { setPaused(window.localStorage.getItem(motionPreferenceKey) === 'true') } catch { /* Motion remains optional without storage. */ }
    }
    readPreference()
    window.addEventListener(motionPreferenceEvent, readPreference)
    window.addEventListener('storage', readPreference)
    return () => {
      window.removeEventListener(motionPreferenceEvent, readPreference)
      window.removeEventListener('storage', readPreference)
    }
  }, [])

  const toggleMotion = () => {
    const nextPaused = !paused
    setPaused(nextPaused)
    try { window.localStorage.setItem(motionPreferenceKey, String(nextPaused)) } catch { /* The current page can still pause. */ }
    window.dispatchEvent(new CustomEvent(motionPreferenceEvent, { detail: { paused: nextPaused } }))
  }

  return { motionEnabled: !reducedMotion && !paused, reducedMotion: Boolean(reducedMotion), paused, toggleMotion }
}

export function MotionControl({ motionEnabled, reducedMotion, toggleMotion, className = '' }) {
  return (
    <button
      type="button"
      onClick={toggleMotion}
      disabled={reducedMotion}
      className={`${styles.motionControl} ${className}`}
      aria-pressed={!motionEnabled}
      aria-label={reducedMotion ? 'Bewegung durch deine Systemeinstellung reduziert' : motionEnabled ? 'Dekorative Bewegung pausieren' : 'Dekorative Bewegung fortsetzen'}
      title={reducedMotion ? 'Deine Einstellung für reduzierte Bewegung wird berücksichtigt.' : undefined}
    >
      {motionEnabled ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      <span>{reducedMotion ? 'Bewegung reduziert' : motionEnabled ? 'Bewegung pausieren' : 'Bewegung fortsetzen'}</span>
    </button>
  )
}

export function FlowMark({ className = '' }) {
  return (
    <span className={`${styles.mark} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <path d="M10 12.5c3.6-.9 6.8-.4 10 1.5v15c-3.2-1.9-6.4-2.4-10-1.5v-15Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M20 14c3.2-1.9 6.4-2.4 10-1.5v15c-3.6-.9-6.8-.4-10 1.5V14Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="m24.5 7 .8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8.8-2.4Z" fill="currentColor" />
      </svg>
    </span>
  )
}

export function LoadingScreen({ message = 'Dein Arbeitsraum wird geladen …', compact = false }) {
  const motionPreference = useEduFlowMotion()
  const { motionEnabled } = motionPreference

  return (
    <motion.div
      className={`${styles.loadingScreen} ${compact ? styles.compact : ''}`}
      data-motion={motionEnabled ? 'on' : 'off'}
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: motionEnabled ? 0.25 : 0 }}
      data-loading-screen
    >
      <div className={styles.loadingAmbient} aria-hidden="true" />
      <div className={styles.loadingBrand}><FlowMark /><span>EduFlow</span></div>
      <div className={styles.loadingCenter}>
        <div className={styles.loadingSculpture} aria-hidden="true">
          <div className={styles.sculptureHalo} />
          <div className={`${styles.sculpturePage} ${styles.sculptureBack}`} />
          <div className={`${styles.sculpturePage} ${styles.sculptureMiddle}`} />
          <div className={`${styles.sculpturePage} ${styles.sculptureFront}`}>
            <FlowMark />
            <span className={styles.sculptureLine} /><span className={styles.sculptureLine} /><span className={styles.sculptureLine} />
          </div>
          <span className={styles.sculptureDot} />
        </div>
        <p className={styles.loadingEyebrow}>GUTE IDEEN NEHMEN FORM AN.</p>
        <h1>Gleich im Flow.</h1>
        <div role="status" aria-live="polite" aria-atomic="true" className={styles.loadingStatus}>
          <span className={styles.statusPulse} aria-hidden="true" />
          <p>{message}</p>
        </div>
      </div>
      <div className={styles.loadingBottom}>
        <span>Mehr Raum fürs Unterrichten.</span>
        <MotionControl {...motionPreference} />
      </div>
    </motion.div>
  )
}
