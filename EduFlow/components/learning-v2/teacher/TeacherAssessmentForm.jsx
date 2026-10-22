'use client'

import { useEffect, useRef, useState } from 'react'
import { useRequestScope } from '../request-scope'

export default function TeacherAssessmentForm({ studentId, competency, token, correction, onSaved, onCancelCorrection }) {
  const objective = competency?.objective
  const [claim, setClaim] = useState('supports')
  const [basis, setBasis] = useState('single_observation')
  const [reason, setReason] = useState('direct_observation')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const receipt = useRef(null)
  const requests = useRequestScope(`${studentId}:${competency?.competency?.competency_id}:${objective?.objective_id}:${objective?.version}:${correction?.evidence_id || ''}:${token}`)
  useEffect(() => { if (correction) { setClaim(correction.claim === 'no_demonstration' ? correction.claim : correction.claim); setBasis(correction.assessment_basis || 'single_observation') } }, [correction])
  if (!objective) return <p className="rounded-lg border p-3 text-sm">Eine veröffentlichte Zielzuordnung ist erforderlich, bevor eine Lehrperson-Beurteilung erfasst werden kann.</p>
  const submit = async (event) => {
    event.preventDefault(); if (busy) return; setError(''); setBusy(true)
    const request = requests.begin('mutation')
    const signature = JSON.stringify([studentId, competency.competency.competency_id, objective, claim, basis, reason, note, correction?.evidence_id])
    const body = { schema_version: 'learning-v2-phase4-v1', competency_id: competency.competency.competency_id, objective_id: objective.objective_id, objective_version: objective.version, claim, basis, observed_at: new Date().toISOString(), reason, note: note.trim() || undefined, replaces_evidence_id: correction?.evidence_id, correction_note: correction ? 'Corrected by owning teacher.' : undefined, idempotency_key: crypto.randomUUID() }
    if (receipt.current?.signature !== signature) receipt.current = { signature, body }
    try {
    const response = await fetch(`/api/v2/learning/teacher/students/${encodeURIComponent(studentId)}/assessments`, { method: 'POST', signal: request.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(receipt.current.body) })
    const result = await response.json()
    if (!request.current()) return
    if (!response.ok) return setError(result.error?.message || 'Beurteilung konnte nicht gespeichert werden.')
    receipt.current = null; setNote(''); await onSaved(result)
    } catch (error) { if (request.current()) setError('Speicherung nicht bestätigt. Erneut versuchen verwendet dieselbe Operation.') }
    finally { if (request.current()) setBusy(false) }
  }
  return <form onSubmit={submit} className="rounded-xl border p-4" aria-labelledby="assessment-form-title"><div className="flex justify-between gap-2"><h3 id="assessment-form-title" className="font-semibold">{correction ? 'Beurteilung korrigieren' : 'Lehrperson-Beurteilung'}</h3>{correction && <button type="button" onClick={onCancelCorrection} className="text-sm underline">Korrektur abbrechen</button>}</div>
    <p className="mt-1 text-xs text-slate-600">Development weighting only; not educator-calibrated.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-sm">Aussage<select value={claim} onChange={(e) => setClaim(e.target.value)} className="mt-1 h-10 w-full rounded-md border px-2"><option value="supports">Supports</option><option value="challenges">Challenges</option><option value="no_demonstration">No demonstration</option></select></label><label className="text-sm">Basis<select value={basis} onChange={(e) => setBasis(e.target.value)} className="mt-1 h-10 w-full rounded-md border px-2"><option value="single_observation">Single observation</option><option value="repeated_observation">Repeated observation</option><option value="reviewed_work_sample">Reviewed work sample</option><option value="structured_assessment">Structured assessment</option></select></label><label className="text-sm">Grund<select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 h-10 w-full rounded-md border px-2"><option value="direct_observation">Direct observation</option><option value="work_review">Work review</option><option value="oral_check">Oral check</option><option value="structured_check">Structured check</option></select></label></div>
    <label className="mt-3 block text-sm" htmlFor="teacher-assessment-note">Interne Notiz (optional)</label><textarea id="teacher-assessment-note" aria-describedby="teacher-assessment-note-help" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="mt-1 min-h-20 w-full rounded-md border p-2" /><p id="teacher-assessment-note-help" className="text-right text-xs">Plain text, teacher detail only · {note.length}/500</p>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button type="submit" disabled={busy} className="mt-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white">{correction ? 'Korrigierte Beurteilung speichern' : 'Beurteilung speichern'}</button>
  </form>
}
