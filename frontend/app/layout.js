import './globals.css'
import { Toaster } from '@/ui/sonner'

export const metadata = {
  title: 'EduFlow - KI-gestützte Arbeitsblätter für den Lehrplan 21',
  description: 'Erstellen Sie in Sekunden perfekte Arbeitsblätter mit KI – abgestimmt auf den Schweizer Lehrplan 21',
}

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <head>
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body className="antialiased">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}