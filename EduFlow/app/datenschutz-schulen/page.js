import LegalDraft from '@/components/LegalDraft'

export const metadata = { title: 'Datenschutz an Schulen – EduFlow', robots: { index: false, follow: false } }

export default function SchulDatenschutz() {
  return <LegalDraft title="Datenschutz an Schulen">
    <p>Der Einsatz mit echten Schülerdaten ist noch nicht freigegeben. Für einen Pilotversuch verwenden Sie bitte fiktive Konten und anonymisierte Unterrichtsmaterialien.</p>
    <h2 className="text-xl font-semibold">Unterlagen für Schulen</h2>
    <ul className="list-disc space-y-2 pl-6">
      <li>Übersicht aller Datenflüsse und beteiligten Dienstleister.</li>
      <li>Bestätigte Speicher- und Verarbeitungsstandorte.</li>
      <li>Dokumentation der Berechtigungen, Datentrennung und Löschverfahren.</li>
      <li>Für den vorgesehenen Einsatz geprüfte Vertragsunterlagen zur Auftragsbearbeitung.</li>
      <li>Abklärung der Anforderungen der zuständigen Schule beziehungsweise des Kantons.</li>
    </ul>
    <p>Diese Unterlagen werden vor der Freigabe des Schulbetriebs vervollständigt. Es bestehen derzeit keine bestätigten Zusicherungen zu einem ausschliesslichen Schweizer Datenstandort.</p>
  </LegalDraft>
}
