import LegalDraft from '@/components/LegalDraft'

export const metadata = { title: 'AGB – EduFlow', robots: { index: false, follow: false } }

export default function Agb() {
  return <LegalDraft title="Allgemeine Geschäftsbedingungen">
    <p>Die Vertragsbedingungen sind noch nicht festgelegt. Insbesondere müssen Leistungsumfang, Kontingente, Preise, Abrechnung, Vertragslaufzeit, Kündigung und Nutzungsrechte vor einem kostenpflichtigen Angebot verbindlich beschrieben werden.</p>
    <p>KI-generierte Aufgaben und Lösungen müssen vor dem Unterrichtseinsatz von einer Lehrperson geprüft werden. Eine automatische Qualitätsprüfung ersetzt keine fachliche Kontrolle.</p>
    <p>Dieser Entwurf enthält noch keine vollständigen Vertragsbedingungen. Die abschliessende Fassung wird anhand des tatsächlichen Angebots erstellt und rechtlich geprüft.</p>
  </LegalDraft>
}
