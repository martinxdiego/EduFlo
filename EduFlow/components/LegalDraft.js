export default function LegalDraft({ title, children }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-6">
      <a href="/" className="text-blue-700 underline">Zurück zu EduFlow</a>
      <h1 className="text-3xl font-bold">{title}</h1>
      <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
        Entwurf – noch nicht für den öffentlichen Betrieb freigegeben. Diese Seite wird vor der Veröffentlichung vervollständigt und fachlich geprüft.
      </p>
      <div className="space-y-5 leading-7 text-gray-700">{children}</div>
    </main>
  )
}
