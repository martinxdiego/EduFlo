'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/dialog'
import { useRequestScope } from '../request-scope'

const REASONS = {
  automatic: ['grading_error', 'wrong_target_mapping', 'invalid_source', 'duplicate_or_corrupt_source'],
  assisted: ['grading_error', 'wrong_target_mapping', 'invalid_source', 'duplicate_or_corrupt_source', 'invalid_tutor_linkage', 'incorrect_assistance_source'],
  support: ['wrong_target_mapping', 'invalid_source', 'duplicate_or_corrupt_source', 'invalid_tutor_linkage'],
  teacher: ['entered_in_error'],
}

function group(item) {
  if (item?.type === 'teacher_assessment') return 'teacher'
  if (item?.type === 'support_required') return 'support'
  if (item?.type === 'correct_after_hint') return 'assisted'
  return 'automatic'
}

export default function EvidenceInvalidationDialog({ evidence, token, onClose, onChanged, onCloseAutoFocus }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const requests = useRequestScope(`${evidence?.evidence_id || ''}:${token}`)
  const choices = evidence ? REASONS[group(evidence)] : []
  useEffect(() => { setReason(choices[0] || ''); setNote(''); setError('') }, [evidence])
  const submit = async () => {
    if (!evidence || busy || !reason) return
    const request = requests.begin('mutation'); setBusy(true)
    try {
    const response = await fetch(`/api/v2/learning/teacher/evidence/${encodeURIComponent(evidence.evidence_id)}/invalidate`, { method: 'POST', signal: request.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ schema_version: 'learning-v2-phase4-v1', reason, note: note.trim() || undefined, idempotency_key: crypto.randomUUID() }) })
    const body = await response.json()
    if (!request.current()) return
    if (!response.ok) return setError(body.error?.message || 'Evidence konnte nicht invalidiert werden.')
    await onChanged(body)
    } catch (error) { if (request.current()) setError(error.message) }
    finally { if (request.current()) setBusy(false) }
  }
  return <Dialog open={Boolean(evidence)} onOpenChange={(open) => !open && onClose()}>
    <DialogContent onCloseAutoFocus={onCloseAutoFocus} className="max-w-md"><DialogHeader><DialogTitle>Evidence invalidieren?</DialogTitle><DialogDescription>Der Eintrag wird nicht gelöscht und kann nicht reaktiviert werden. Der Lernstand wird neu berechnet.</DialogDescription></DialogHeader>
      <label className="text-sm font-medium" htmlFor="invalidation-reason">Grund</label><select id="invalidation-reason" value={reason} onChange={(event) => setReason(event.target.value)} className="h-10 rounded-md border px-2">{choices.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select>
      <label className="text-sm font-medium" htmlFor="invalidation-note">Interne Notiz (optional)</label><textarea id="invalidation-note" aria-describedby="invalidation-note-help" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} className="min-h-20 rounded-md border p-2" /><p id="invalidation-note-help" className="text-right text-xs">Plain text, teacher detail only · {note.length}/500</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <DialogFooter><button type="button" onClick={onClose} className="rounded-md border px-4 py-2">Abbrechen</button><button type="button" disabled={busy || !reason} onClick={submit} className="rounded-md bg-red-700 px-4 py-2 text-white">Invalidieren</button></DialogFooter>
    </DialogContent>
  </Dialog>
}
