import './globals.css'
import PWARegister from '@/components/PWARegister'

export const metadata = {
  title: 'EduFlow – Editierbare Lernmaterialien für den Lehrplan 21',
  description: 'Aus eigenen Unterlagen werden differenzierte, editierbare Arbeitsblätter und Prüfungen mit Lehrplan-21-Bezug – bereit für PDF und DOCX.',
  applicationName: 'EduFlow',
  keywords: ['Lehrplan 21', 'Arbeitsblätter', 'Unterrichtsmaterial', 'Differenzierung', 'Schweizer Lehrpersonen'],
  openGraph: {
    type: 'website',
    locale: 'de_CH',
    siteName: 'EduFlow',
    title: 'EduFlow – Unterrichtsmaterial, das zu Ihrer Klasse passt',
    description: 'Eigene Unterlagen hochladen, differenzieren, bearbeiten und druckfertig exportieren.',
  },
  robots: {
    index: true,
    follow: true,
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
    <html lang="de">
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
        <PWARegister />
      </body>
    </html>
  )
}
