/// <reference types="@capacitor/cli" />
import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor configuration for EduFlow.
 *
 * EduFlow is a Next.js app with server-side API routes (/api/*) talking
 * to MongoDB and OpenAI. A pure static export would lose those routes,
 * so we run Capacitor in **remote-server mode** by default: the native
 * iOS/Android shell loads the deployed Next.js URL inside its WebView.
 *
 * To switch to a fully bundled offline-capable app, you would need to:
 *   1) Split the API into its own service (Vercel function / Express / etc.)
 *   2) Set NEXT_PUBLIC_API_URL=<that URL> in the Next.js build
 *   3) Add `output: 'export'` to next.config.js
 *   4) Run `next build` and point `webDir` below to the produced `out/`
 *   5) Remove the `server.url` block.
 *
 * For now we keep both options documented; flip via env vars at build time.
 */
const PROD_URL = process.env.CAPACITOR_SERVER_URL || 'https://eduflow.example.ch'

const config: CapacitorConfig = {
  appId: 'ch.eduflow.app',
  appName: 'EduFlow',
  webDir: 'out',
  server: {
    // Comment out `url` once a static export is ready and `webDir` is populated.
    url: PROD_URL,
    cleartext: false,
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#f8fafcff',
  },
  android: {
    backgroundColor: '#f8fafcff',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#f8fafc',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      androidSpinnerStyle: 'small',
      iosSpinnerStyle: 'small',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
}

export default config
