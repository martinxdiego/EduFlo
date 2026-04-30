'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker on the client only.
 * - Disabled in development to avoid stale dev caches & HMR conflicts.
 * - Guards on `navigator.serviceWorker` to avoid SSR/old-browser issues.
 */
export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => {
          // Don't crash the app — just log.
          console.warn('[PWA] Service worker registration failed:', err)
        })
    }

    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad, { once: true })

    return () => window.removeEventListener('load', onLoad)
  }, [])

  return null
}
