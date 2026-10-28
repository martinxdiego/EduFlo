import './globals.css'
import PublicFooter from '@/components/PublicFooter'
import { publicSiteOrigin } from '@/lib/public-site'
import PWARegister from '@/components/PWARegister'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

const origin = publicSiteOrigin()
const demo = process.env.NEXT_PUBLIC_EDUFLOW_DEMO === 'true'
const publiclyLaunched = process.env.EDUFLOW_PUBLIC_LAUNCH === 'true' && Boolean(origin)

export const metadata = {
  ...(origin ? { metadataBase: new URL(origin) } : {}),
  title: demo ? 'EduFlow Demo – Unterrichtsmaterial ausprobieren' : 'EduFlow – Editierbare Lernmaterialien für den Lehrplan 21',
  description: demo ? 'Kostenlose Browser-Demo: Beispielmaterialien bearbeiten, auf diesem Gerät speichern und als PDF oder Word exportieren. Ohne Anmeldung und ohne KI-Aufrufe.' : 'Aus eigenen Unterlagen werden differenzierte, editierbare Arbeitsblätter und Prüfungen mit Lehrplan-21-Bezug – bereit für PDF und DOCX.',
  applicationName: 'EduFlow',
  keywords: ['Lehrplan 21', 'Arbeitsblätter', 'Unterrichtsmaterial', 'Differenzierung', 'Schweizer Lehrpersonen'],
  openGraph: {
    type: 'website',
    locale: 'de_CH',
    siteName: 'EduFlow',
    title: demo ? 'EduFlow kostenlos ausprobieren' : 'EduFlow – Unterrichtsmaterial, das zu Ihrer Klasse passt',
    description: demo ? 'Drei Beispiele, elf Aufgabentypen und dein eigener Feinschliff. Lokal speichern, PDF und Word mitnehmen. Ohne Konto.' : 'Eigene Unterlagen hochladen, differenzieren, bearbeiten und druckfertig exportieren.',
  },
  robots: {
    index: publiclyLaunched,
    follow: publiclyLaunched,
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'EduFlow',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/icons/icon.svg' },
    ],
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#3b82f6' },
    { media: '(prefers-color-scheme: dark)', color: '#1e3a8a' },
  ],
}

export default function RootLayout({ children }) {
  return (
    <html lang="de-CH">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="EduFlow" />
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body className="antialiased overscroll-y-none">
        {children}
        <PublicFooter />
        <PWARegister />
        {process.env.EDUFLOW_ANALYTICS_ENABLED === 'true' ? <><Analytics /><SpeedInsights /></> : null}
      </body>
    </html>
  )
}
