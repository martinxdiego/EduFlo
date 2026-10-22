import LegalDraft from '@/components/LegalDraft'

export const metadata = { title: 'Datenschutz – EduFlow', robots: { index: false, follow: false } }

export default function Datenschutz() {
  return <LegalDraft title="Datenschutz">
    <p>Die vollständige Datenschutzerklärung ist in Vorbereitung. Dieser Entwurf ersetzt keine freigegebene Datenschutzerklärung.</p>
    <h2 className="text-xl font-semibold">Vor der Veröffentlichung zu dokumentieren</h2>
    <ul className="list-disc space-y-2 pl-6">
      <li>Verantwortliche Stelle und Kontakt für Datenschutzanfragen.</li>
      <li>Verarbeitung von Kontodaten, Materialien, Uploads, Klassenlisten und Schülerantworten.</li>
      <li>Verwendete Hosting-, Datenbank-, KI-, E-Mail- und Analysedienste mit ihren tatsächlichen Einstellungen und Speicherorten.</li>
      <li>Zwecke, Empfänger, Aufbewahrungs- und Löschfristen sowie allfällige Auslandsübermittlungen.</li>
      <li>Verfahren für Auskunft, Berichtigung, Export und Löschung.</li>
    </ul>
    <p>Bitte verwenden Sie in der Testphase ausschliesslich fiktive Daten und laden Sie keine vertraulichen Schülerdaten hoch.</p>
  </LegalDraft>
}
