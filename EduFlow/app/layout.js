import './globals.css'

export const metadata = {
  title: 'EduFlow - KI-gestuetzte Lernmaterialien fuer den Lehrplan 21',
  description: 'Erstellen Sie in Sekunden Arbeitsblaetter, Pruefungen, Quizze und Vokabellisten mit KI - abgestimmt auf den Schweizer Lehrplan 21.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <head>
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}