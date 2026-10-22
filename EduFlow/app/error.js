'use client'

export default function Error({ retry }) {
  return (
    <main className="mx-auto max-w-xl p-8 space-y-4" role="alert">
      <h1 className="text-2xl font-semibold">Die Ansicht konnte nicht geladen werden.</h1>
      <p>Bitte versuchen Sie es erneut oder kehren Sie zur Startseite zurück.</p>
      <button type="button" onClick={() => retry()} className="rounded-lg bg-blue-600 px-4 py-2 text-white">Erneut versuchen</button>
      <a href="/" className="ml-4 underline">Zur Startseite</a>
    </main>
  )
}
