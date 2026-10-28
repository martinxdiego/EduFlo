import { notFound } from 'next/navigation'

export const metadata = { title: 'EduFlow-Demo – Hinweise', robots: { index: false, follow: false } }

export default function DemoNotes() {
  if (process.env.NEXT_PUBLIC_EDUFLOW_DEMO !== 'true') notFound()
  return <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
    <a className="text-blue-700 underline" href="/demo">Zurück zur Demo</a>
    <h1 className="mt-8 text-4xl font-semibold">Dein Test. Deine Beispieldaten.</h1>
    <div className="mt-8 space-y-6 text-base leading-7">
      <p>Dies ist eine öffentliche Demonstration von EduFlow. Du kannst synthetische Arbeitsblätter bearbeiten, auf deinem Gerät speichern und als PDF oder Word-Datei herunterladen. Es gibt keine Anmeldung und kein eingebautes Ablaufdatum.</p>
      <p>Entwürfe bleiben im lokalen Speicher dieses Browsers. Andere Personen, Geräte oder Browser sehen sie nicht. Im privaten Modus, nach dem Löschen von Browserdaten oder bei vollem Speicher können sie verloren gehen. Eine heruntergeladene Demo-Sicherung lässt sich wieder importieren.</p>
      <p>Bitte verwende ausschliesslich erfundene Beispieldaten. Die Demo ist nicht für echte Schülerdaten oder vertrauliche Unterlagen vorgesehen. Sie lädt keine Materialien in eine Datenbank und ruft keine KI-Anbieter auf.</p>
      <p>KI-Generierung, Klassenverwaltung, Konten, Cloud-Synchronisierung und das Verteilen von Aufgaben sind hier nicht aktiviert. Die Beispiele sind keine fachliche Freigabe: Prüfe ein Material selbst, bevor du es im Unterricht einsetzt.</p>
      <p>Die Website wird bei Vercel bereitgestellt. Beim Seitenaufruf fallen technisch notwendige Verbindungen zum Hosting an. Die optionale Produktanalyse von EduFlow ist in dieser Demo deaktiviert. Die Bewegungseinstellung und deine Entwürfe werden nur in diesem Browser gespeichert.</p>
      <p>Der Link bleibt bestehen, solange diese Demo bereitgestellt wird. Der kostenlose Hosting-Tarif hat Nutzungsgrenzen; eine unbegrenzte Verfügbarkeit wird damit nicht zugesagt.</p>
    </div>
  </main>
}
