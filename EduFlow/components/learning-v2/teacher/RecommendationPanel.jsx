'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import TechnicalProvenanceDisclosure from './TechnicalProvenanceDisclosure'

const SCHEMA = 'learning-v2-phase5-v1'
const STATUS = { presented: 'Zur Entscheidung', approved: 'Absicht freigegeben', dismissed: 'Verworfen', expired: 'Abgelaufen', superseded: 'Nicht mehr aktuell' }
const buttonClass = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50'

async function post(url, token, body, signal) {
  const response = await fetch(url, { method: 'POST', cache: 'no-store', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  const result = await response.json()
  if (!response.ok) { const error = new Error(result.error?.code || 'SERVICE_UNAVAILABLE'); error.code = result.error?.code; throw error }
  return result
}
const displayDate = (value) => new Date(value).toLocaleString('de-CH')

export default function RecommendationPanel(props) {
  return <ScopedRecommendationPanel key={`${props.studentId}:${props.competencyId}:${props.token}`} {...props} />
}

function ScopedRecommendationPanel({ studentId, competencyId, token }) {
  const headingId = useId(); const objectiveId = useId()
  const [loadedResult, setResult] = useState(null)
  const [objective, setObjective] = useState('')
  const [loadedObjective, setLoadedObjective] = useState(null)
  const result = loadedObjective === objective ? loadedResult : null
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const requestSequence = useRef(0)
  const decisionKey = useRef(null)
  const alive = useRef(true)
  const decisionController = useRef(null)
  const evaluate = useCallback(async (signal) => {
    const sequence = ++requestSequence.current
    setBusy(true); setError(''); setResult(null)
    try {
      const body = { schema_version: SCHEMA, idempotency_key: crypto.randomUUID() }
      if (objective) { const [objective_id, version] = objective.split('|'); body.objective_ref = { objective_id, version: Number(version) } }
      const next = await post(`/api/v2/learning/teacher/students/${encodeURIComponent(studentId)}/competencies/${encodeURIComponent(competencyId)}/recommendations`, token, body, signal)
      if (alive.current && sequence === requestSequence.current) { setResult(next); setLoadedObjective(objective); decisionKey.current = null }
    } catch (requestError) {
      if (alive.current && sequence === requestSequence.current && requestError.name !== 'AbortError') setError('Vorschläge sind derzeit nicht verfügbar. Der normale Lernablauf bleibt unverändert.')
    } finally { if (alive.current && sequence === requestSequence.current) setBusy(false) }
  }, [studentId, competencyId, objective, token])

  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    evaluate(controller.signal)
    return () => { alive.current = false; controller.abort(); decisionController.current?.abort(); requestSequence.current++ }
  }, [evaluate])

  const decide = async (action) => {
    if (busy || !result?.recommendation || result.recommendation.status !== 'presented') return
    setBusy(true); setError(''); setMessage('')
    const id = result.recommendation.recommendation_id
    const sequence = requestSequence.current
    const controller = new AbortController(); decisionController.current?.abort(); decisionController.current = controller
    if (decisionKey.current?.id !== id || decisionKey.current?.action !== action) decisionKey.current = { id, action, key: crypto.randomUUID() }
    try {
      const next = await post(`/api/v2/learning/teacher/recommendations/${encodeURIComponent(id)}/${action}`, token, { schema_version: SCHEMA, idempotency_key: decisionKey.current.key }, controller.signal)
      if (!alive.current || sequence !== requestSequence.current || controller.signal.aborted || next.recommendation?.recommendation_id !== id) return
      setResult((current) => ({ ...next, objective_options: current?.objective_options || [] })); decisionKey.current = null
      setMessage(next.recommendation.status === 'approved' ? 'Absicht protokolliert. Keine Arbeit zugewiesen; Lernzustand unverändert.' : 'Die erste gültige Entscheidung wurde protokolliert.')
    } catch (requestError) {
      if (!alive.current || sequence !== requestSequence.current || controller.signal.aborted) return
      if (requestError.code === 'RECOMMENDATION_STALE') {
        setMessage('Der Vorschlag ist nicht mehr aktuell. Die Eingaben werden neu geprüft; es wurde keine Arbeit zugewiesen.')
        await evaluate()
      } else { setError('Entscheidung nicht bestätigt. Bitte erneut versuchen oder die Vorschläge aktualisieren.') }
    } finally { if (alive.current && sequence === requestSequence.current && !controller.signal.aborted) setBusy(false) }
  }
  const recommendation = result?.recommendation
  return <section aria-labelledby={headingId} aria-busy={busy} className="min-w-0 space-y-3 rounded-xl border border-slate-300 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><h3 id={headingId} className="font-semibold">Nächster Schritt · Entscheidungshilfe</h3><button type="button" className={buttonClass} disabled={busy} onClick={() => { setMessage(''); evaluate() }}>Vorschläge aktualisieren</button></div>
    <p className="text-sm text-slate-700">Eine Freigabe weist keine Arbeit zu und verändert weder Mastery noch Confidence. Sie protokolliert ausschliesslich Ihre Absicht.</p>
    <p className="text-xs text-slate-600">Deterministische Entwicklungsregeln · keine KI-Auswahl · noch nicht pädagogisch kalibriert.</p>
    <div role="status" aria-live="polite" className="text-sm">{busy ? 'Vorschlag wird geprüft…' : message}</div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {result?.objective_options?.length > 1 && <div><label className="mb-1 block text-sm font-medium" htmlFor={objectiveId}>Exaktes Lernziel auswählen</label><select id={objectiveId} value={objective} disabled={busy} onChange={(event) => { setObjective(event.target.value); setMessage('') }} className="w-full min-w-0 rounded-lg border border-slate-300 p-2 text-sm focus-visible:outline-blue-600"><option value="">Bitte auswählen</option>{result.objective_options.map((item) => <option key={`${item.objective_id}|${item.version}`} value={`${item.objective_id}|${item.version}`}>{item.objective_id} · Version {item.version}</option>)}</select></div>}
    {result?.outcome === 'NO_RECOMMENDATION' && <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm"><p>EduFlow hat für die aktuellen Nachweise keinen begrenzten Vorschlag.</p><ul className="list-disc space-y-1 pl-5">{result.reasons.map((reason) => <li key={reason.code}>{reason.text}</li>)}</ul></div>}
    {recommendation && <div className="min-w-0 space-y-3 text-sm">
      <h4 className="font-semibold">{recommendation.label}</h4><p>Status: {STATUS[recommendation.status] || 'Nicht aktuell'}</p>
      <div><p className="font-medium">Warum dieser Vorschlag?</p><ul className="list-disc space-y-1 pl-5">{recommendation.reasons.map((reason) => <li key={reason.code}>{reason.text}</li>)}</ul></div>
      {recommendation.candidate_task && <div className="break-words rounded-lg bg-blue-50 p-3"><p>{recommendation.candidate_task.label}</p><p className="mt-1 break-all text-xs">{recommendation.candidate_task.task_id} · Version {recommendation.candidate_task.version}</p><p className="mt-1 text-xs">Stabile Reihenfolge nach Veröffentlichung und ID; keine pädagogische Rangfolge.</p></div>}
      <p>Nachweisumfang: {recommendation.evidence_scope.supporting_evidence_ids.length} referenzierte Nachweise (maximal 100) zum exakten Lernziel.</p>
      <ul className="list-disc space-y-1 pl-5 text-slate-600">{recommendation.limitations.map((item) => <li key={item.code}>{item.text}</li>)}</ul>
      <p>Erstellt: {displayDate(recommendation.created_at)} · Frist: {displayDate(recommendation.expires_at)}</p>
      <p className="text-xs text-slate-600">24 Stunden sind eine operative Entwicklungsfrist, keine pädagogische Grenze. Neue relevante Eingaben machen den Vorschlag sofort ungültig.</p>
      {recommendation.status === 'presented' ? <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={`${buttonClass} bg-blue-700 text-white`} onClick={() => decide('approve')}>Absicht freigeben</button><button type="button" disabled={busy} className={buttonClass} onClick={() => decide('dismiss')}>Vorschlag verwerfen</button></div> : <p>Historischer Vorschlag; keine erneute Freigabe. Neue relevante Eingaben können einen neuen Vorschlag ermöglichen.</p>}
      <TechnicalProvenanceDisclosure technical={recommendation.technical} />
    </div>}
  </section>
}
