export default function PublicFooter() {
  if (process.env.NEXT_PUBLIC_EDUFLOW_DEMO === 'true') return (
    <footer className="border-t border-slate-200 bg-white px-6 py-5 text-sm text-slate-600">
      <nav aria-label="Informationen zur Demo" className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-6 gap-y-3">
        <a className="underline" href="/demo">Demo öffnen</a>
        <a className="underline" href="/demo/hinweise">Demo und Datenspeicherung</a>
        <span>Beispieldaten · kein Konto erforderlich</span>
      </nav>
    </footer>
  )
  return (
    <footer className="border-t border-gray-200 bg-white px-6 py-5 text-sm text-gray-600">
      <nav aria-label="Rechtliche Informationen" className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-6 gap-y-3">
        <a className="underline hover:text-blue-700" href="/impressum">Impressum</a>
        <a className="underline hover:text-blue-700" href="/datenschutz">Datenschutz</a>
        <a className="underline hover:text-blue-700" href="/agb">AGB</a>
        <a className="underline hover:text-blue-700" href="/datenschutz-schulen">Datenschutz an Schulen</a>
      </nav>
    </footer>
  )
}
