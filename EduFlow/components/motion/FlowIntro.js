'use client'

import { useId } from 'react'
import styles from './FlowIntro.module.css'

/**
 * Decorative, finite EduFlow introductions. They never delay their parent.
 *
 * variant: 'paper' | 'orbit' | 'focus' (default: 'paper')
 * motionEnabled: false displays the final composition immediately.
 * compact: a shorter stage for authentication and genuine loading states.
 * replayKey: change this value to remount and replay the six-second sequence.
 * className: optional parent styling for the transparent, responsive stage.
 *
 * Motion controls, meaningful headings and status copy belong to the parent.
 */
export default function FlowIntro({ variant = 'paper', motionEnabled = true, compact = false, replayKey = 0, className = '' }) {
  const instanceId = useId().replaceAll(':', '')
  const scene = ['paper', 'orbit', 'focus'].includes(variant) ? variant : 'paper'

  return (
    <div
      className={`${styles.intro} ${compact ? styles.compact : ''} ${className}`}
      data-flow-intro={scene}
      data-motion={motionEnabled ? 'on' : 'off'}
      aria-hidden="true"
    >
      <div className={styles.scene} key={`${scene}-${String(replayKey)}`}>
        {scene === 'paper' ? <PaperScene id={instanceId} /> : scene === 'orbit' ? <OrbitScene id={instanceId} /> : <FocusScene id={instanceId} />}
      </div>
    </div>
  )
}

function BookPaths({ className = '', id = 'book' }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" focusable="false">
      <defs>
        <linearGradient id={`${id}-page`} x1="18" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" /><stop offset=".6" stopColor="#e7efff" /><stop offset="1" stopColor="#b7d0ff" />
        </linearGradient>
      </defs>
      <path className={styles.focusBookLeft} d="M23 33c9-2.5 18-1 27 4v40c-9-5-18-6.5-27-4V33Z" fill={`url(#${id}-page)`} />
      <path className={styles.focusBookRight} d="M50 37c9-5 18-6.5 27-4v40c-9-2.5-18-1-27 4V37Z" fill={`url(#${id}-page)`} />
      <path className={styles.focusBookSpine} d="M50 37v40" stroke="#70a3ff" strokeWidth="1.2" />
      <path className={styles.focusBookSpark} d="m63 16 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" fill="white" />
    </svg>
  )
}

function WaterDrawing({ id }) {
  return (
    <svg className={styles.waterDrawing} viewBox="0 0 300 105" fill="none" focusable="false">
      <defs>
        <linearGradient id={`${id}-water`} x1="30" y1="68" x2="277" y2="110" gradientUnits="userSpaceOnUse"><stop stopColor="#93c8ed" /><stop offset="1" stopColor="#638ad5" /></linearGradient>
        <linearGradient id={`${id}-sky`} x1="150" y1="0" x2="150" y2="105" gradientUnits="userSpaceOnUse"><stop stopColor="#f0f6fc" /><stop offset="1" stopColor="#fcfdff" /></linearGradient>
      </defs>
      <rect width="300" height="105" rx="8" fill={`url(#${id}-sky)`} />
      <circle cx="51" cy="31" r="13" fill="#ecd8ac" /><circle cx="51" cy="31" r="19" stroke="#ecd8ac" strokeOpacity=".45" />
      <path d="m170 85 37-52 51 52" fill="#c9dcd7" /><path d="m191 55 16-22 23 22-14-4-9 5-7-5-9 4Z" fill="white" />
      <path d="M0 84c36-10 55-10 93 1 38 11 67-4 101-4s74 7 106 14v10H0V84Z" fill={`url(#${id}-water)`} />
      <path d="M0 94c44-8 68 12 110 2 37-9 68 9 106 1 37-7 56-1 84 2" stroke="white" strokeOpacity=".5" />
      <path d="M122 26c-4-12-23-13-29-2-14-4-24 5-20 13h73c5-13-10-22-24-11Z" fill="white" stroke="#dce6f3" />
      <path d="M64 71c0-15 4-23 13-30m77-10c11-1 18 0 28 2m-63 13-5 10m17-6-5 10" stroke="#95b2d3" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 4" />
      <path d="m72 43 5-3v5m100-16 6 4-6 2" stroke="#95b2d3" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PaperScene({ id }) {
  return (
    <div className={styles.paperWorld}>
      <div className={styles.paperAtmosphere} />
      <div className={styles.paperFloor} />
      <div className={styles.paperArrangement}>
        <div className={`${styles.paperSheet} ${styles.paperMath}`}>
          <div className={styles.sideMeta}><span>MATHEMATIK</span><span>02</span></div>
          <div className={styles.sideTitle}>Kleine Schritte.<br />Grosse Gedanken.</div>
          <div className={styles.mathEquation}><span>10</span><i>−</i><span>4</span><i>=</i><strong>6</strong></div>
          <div className={styles.mathGrid} />
          <div className={styles.sideLine} /><div className={styles.sideLine} />
          <span className={styles.paperFold} />
        </div>
        <div className={`${styles.paperSheet} ${styles.paperLanguage}`}>
          <div className={styles.sideMeta}><span>DEUTSCH</span><span>03</span></div>
          <div className={styles.sideTitle}>Ein Wort.<br />Tausend Ideen.</div>
          <div className={styles.languageWords}><span>entdecken</span><span>verstehen</span><span>weiterdenken</span></div>
          <div className={styles.sideLine} /><div className={styles.sideLine} /><div className={styles.sideLine} />
          <span className={styles.paperFold} />
        </div>
        <div className={`${styles.paperSheet} ${styles.paperMain}`}>
          <div className={styles.paperSurface} />
          <div className={styles.paperMainContent}>
            <div className={styles.paperMeta}><span>NMG · ZYKLUS 2</span><span>EDUFLOW / 01</span></div>
            <div className={styles.paperTitle}>Wasser.<br /><span>In Bewegung.</span></div>
            <p className={styles.paperDescription}>Ein Regentropfen geht auf Reisen.</p>
            <WaterDrawing id={id} />
            <div className={styles.worksheetRow}><span>01</span><div><strong>Wohin geht das Wasser?</strong><i /><i /></div></div>
            <div className={styles.worksheetRow}><span>02</span><div><strong>Beschreibe seinen Weg.</strong><i /></div></div>
            <div className={styles.paperBottom}><span>Dein Unterricht. Dein Flow.</span><span>01 / 02</span></div>
          </div>
          <div className={styles.paperGleam} />
          <span className={styles.paperFold} />
        </div>
      </div>
      <div className={styles.paperSeal}><svg viewBox="0 0 24 24" fill="none" focusable="false"><path d="M5 12.5 9.5 17 19 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg><span>Deine Handschrift.</span></div>
    </div>
  )
}

function OrbitScene({ id }) {
  return (
    <div className={styles.orbitWorld}>
      <div className={styles.orbitAtmosphere} />
      <svg className={styles.orbitSvg} viewBox="0 0 700 500" fill="none" focusable="false">
        <defs>
          <linearGradient id={`${id}-orbit-silver`} x1="132" y1="85" x2="568" y2="403" gradientUnits="userSpaceOnUse"><stop stopColor="#a5b8e0" /><stop offset=".3" stopColor="#e8effd" /><stop offset=".5" stopColor="#6d91e6" /><stop offset=".73" stopColor="#bbc5ed" /><stop offset="1" stopColor="#6d89c7" /></linearGradient>
          <linearGradient id={`${id}-orbit-light`} x1="137" y1="218" x2="558" y2="288" gradientUnits="userSpaceOnUse"><stop stopColor="#6496ff" stopOpacity="0" /><stop offset=".35" stopColor="#85acff" /><stop offset=".6" stopColor="#e0e9ff" /><stop offset="1" stopColor="#7f6bdf" stopOpacity="0" /></linearGradient>
          <linearGradient id={`${id}-book-line`} x1="238" y1="164" x2="469" y2="337" gradientUnits="userSpaceOnUse"><stop stopColor="#b8caed" /><stop offset=".3" stopColor="#7b9be4" /><stop offset=".65" stopColor="#b2c4ee" /><stop offset="1" stopColor="#7394d6" /></linearGradient>
          <linearGradient id={`${id}-book-body`} x1="286" y1="169" x2="448" y2="324" gradientUnits="userSpaceOnUse"><stop stopColor="#c0d6ff" stopOpacity=".18" /><stop offset=".5" stopColor="#8faff5" stopOpacity=".07" /><stop offset="1" stopColor="#9d9fe4" stopOpacity=".13" /></linearGradient>
          <radialGradient id={`${id}-orbit-core`}><stop stopColor="#aac6ff" stopOpacity=".14" /><stop offset="1" stopColor="#aac6ff" stopOpacity="0" /></radialGradient>
        </defs>
        <ellipse className={styles.orbitGround} cx="350" cy="384" rx="164" ry="28" fill={`url(#${id}-orbit-core)`} />
        <g className={styles.orbitRings} stroke={`url(#${id}-orbit-silver)`} strokeWidth=".8">
          <ellipse cx="350" cy="248" rx="255" ry="116" transform="rotate(-24 350 248)" />
          <ellipse cx="350" cy="248" rx="244" ry="113" transform="rotate(24 350 248)" />
          <path d="M153 325c-54-46-46-93 15-139 86-65 231-88 343-38 60 27 80 58 74 94" strokeOpacity=".35" />
        </g>
        <path className={styles.orbitTrailWide} d="M124 309c-25-50 68-120 203-156s254-24 273 25-70 118-205 154-245 24-271-23Z" pathLength="1" stroke={`url(#${id}-orbit-light)`} strokeWidth="8" strokeLinecap="round" />
        <path className={styles.orbitTrail} d="M124 309c-25-50 68-120 203-156s254-24 273 25-70 118-205 154-245 24-271-23Z" pathLength="1" stroke={`url(#${id}-orbit-light)`} strokeWidth="1.8" strokeLinecap="round" />
        <g className={styles.orbitBook}>
          <path className={styles.orbitBookFill} d="M350 185c-35-23-76-28-120-16v146c44-12 85-7 120 16 35-23 76-28 120-16V169c-44-12-85-7-120 16Z" fill={`url(#${id}-book-body)`} />
          <path className={`${styles.orbitBookLine} ${styles.orbitLeft}`} d="M350 185c-35-23-76-28-120-16v146c44-12 85-7 120 16V185Z" pathLength="1" stroke={`url(#${id}-book-line)`} strokeWidth="2.2" strokeLinejoin="round" />
          <path className={`${styles.orbitBookLine} ${styles.orbitRight}`} d="M350 185c35-23 76-28 120-16v146c-44-12-85-7-120 16V185Z" pathLength="1" stroke={`url(#${id}-book-line)`} strokeWidth="2.2" strokeLinejoin="round" />
          <path className={styles.orbitInnerLine} d="M245 185c33-7 63-3 88 10v112c-25-13-55-17-88-10" pathLength="1" stroke="#9cb7eb" strokeOpacity=".55" strokeWidth=".75" />
          <path className={styles.orbitInnerLine} d="M367 195c25-13 55-17 88-10v112c-33-7-63-3-88 10" pathLength="1" stroke="#9cb7eb" strokeOpacity=".55" strokeWidth=".75" />
          <path className={styles.orbitSpine} d="M350 185v146" pathLength="1" stroke="#acbfeb" strokeWidth="1.3" />
          <path className={styles.orbitSpark} d="m402 105 4.5 14 14 4.5-14 4.5-4.5 14-4.5-14-14-4.5 14-4.5 4.5-14Z" fill={`url(#${id}-book-line)`} />
        </g>
        <g className={styles.orbitRegistration} stroke="#91a9d1" strokeWidth=".8" strokeLinecap="round"><path d="M197 200v-13h13m280 0h13v13M197 326v13h13m280 0h13v-13" /></g>
      </svg>
      <div className={styles.orbitCaption}><span>GEDANKEN VERBINDEN.</span><i /><span>UNTERRICHT GESTALTEN.</span></div>
    </div>
  )
}

function FocusScene({ id }) {
  return (
    <div className={styles.focusWorld}>
      <div className={styles.focusAtmosphere} />
      <div className={styles.focusFoundation} />
      <div className={styles.focusGuides}><i /><i /><i /><i /></div>
      <div className={styles.focusObject}>
        <div className={styles.focusPlaneRear} />
        <div className={styles.focusPlaneMiddle} />
        <div className={styles.focusTile}><div className={styles.focusTileSurface} /><BookPaths className={styles.focusBook} id={id} /><div className={styles.focusTileGleam} /></div>
      </div>
      <div className={styles.focusBaseline}><span /><i /><span /></div>
      <div className={styles.focusCaption}>RAUM FÜR DEINE IDEEN.</div>
    </div>
  )
}
