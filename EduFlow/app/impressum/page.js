import LegalDraft from '@/components/LegalDraft'

export const metadata = { title: 'Impressum – EduFlow', robots: { index: false, follow: false } }

export default function Impressum() {
  return <LegalDraft title="Impressum">
    <p>Vorgesehener Anbietername: EduFlow.</p>
    <p>Die rechtlich verantwortliche Betreiberperson oder Gesellschaft sowie die tatsächliche Geschäftsadresse und öffentliche Kontaktadresse sind noch zu ergänzen und zu bestätigen.</p>
    <p>Vor dem öffentlichen Start werden hier die tatsächlichen Betreiber- und Kontaktangaben veröffentlicht. Bis dahin besteht keine Freigabe für den öffentlichen, kostenpflichtigen Betrieb.</p>
  </LegalDraft>
}
