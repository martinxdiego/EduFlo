'use client'

import { useState } from 'react'
import TechnicalProvenanceDisclosure from './TechnicalProvenanceDisclosure'
import { useRequestScope } from '../request-scope'

function dateTime(value) {
  return value ? new Date(value).toLocaleString('de-CH') : '—'
}

export default function TutorSessionDetail(props) {
  return <ScopedTutorDetail key={`${props.studentId}:${props.session.session_id}:${props.token}`} {...props} />
}

function ScopedTutorDetail({ session, studentId, token }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const requests = useRequestScope(`${studentId}:${session.session_id}:${token}`)

  const load = async () => {
    setError('')
    const request = requests.begin('detail')
    try {
    const response = await fetch(`/api/v2/learning/teacher/students/${encodeURIComponent(studentId)}/tutor-sessions/${encodeURIComponent(session.session_id)}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: request.signal,
    })
    const body = await response.json()
    if (!request.current()) return
    if (!response.ok) return setError(body.error?.message || 'Tutor-Session konnte nicht geladen werden.')
    setDetail(body)
    } catch (error) { if (request.current()) setError(error.message) }
  }

  return <article className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="font-medium">Tutor-Session · {session.status}</p>
        <p className="text-xs text-slate-600">Hints: {session.hint_count} (highest Level {session.highest_hint_level || '—'}) · Generated: {session.generated_hint_count} · Local: {session.local_hint_count} · Retries: {session.retry_count}</p>
        <p className="text-xs text-slate-600">Outcome: {session.outcome || 'offen'} · Fallback: {session.fallback_occurred ? 'yes' : 'no'} · Support required: {session.support_required ? 'yes' : 'no'}</p>
        {session.reflection && session.reflection.status !== 'not_required' && <div className="mt-2 rounded-md bg-violet-50 p-2 text-xs text-violet-950">
          <p className="font-semibold">Reflection: {session.reflection.status} · identify mistake · Level {session.reflection.support_level}</p>
          <p>Requested: {dateTime(session.reflection.requested_at)} · Submitted: {dateTime(session.reflection.submitted_at)}</p>
          <p>{session.reflection.mastery_statement}</p>
        </div>}
      </div>
      <button type="button" onClick={load} className="rounded-md border px-3 py-1.5 font-medium">Details</button>
    </div>
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {detail && <div className="mt-3 border-t pt-3">
      {detail.reflection && <section aria-labelledby={`reflection-${session.session_id}`} className="mb-3 rounded-md border border-violet-200 bg-violet-50 p-3">
        <h4 id={`reflection-${session.session_id}`} className="font-semibold text-violet-950">Reflection detail</h4>
        <dl className="mt-2 grid gap-1 text-xs text-violet-950">
          <div><dt className="inline font-medium">Status: </dt><dd className="inline">{detail.reflection.status}</dd></div>
          <div><dt className="inline font-medium">Type: </dt><dd className="inline">identify mistake</dd></div>
          <div><dt className="inline font-medium">Support: </dt><dd className="inline">Level {detail.reflection.support_level}</dd></div>
          <div><dt className="inline font-medium">Final Attempt: </dt><dd className="inline">{detail.reflection.final_attempt_id}</dd></div>
          <div><dt className="inline font-medium">Requested: </dt><dd className="inline">{dateTime(detail.reflection.requested_at)}</dd></div>
          <div><dt className="inline font-medium">Submitted: </dt><dd className="inline">{dateTime(detail.reflection.submitted_at)}</dd></div>
        </dl>
        {detail.reflection.prompt_text && <div className="mt-2"><p className="text-xs font-medium text-violet-800">Prompt</p><p className="whitespace-pre-wrap break-words">{detail.reflection.prompt_text}</p></div>}
        {detail.reflection.response_text && <div className="mt-2"><p className="text-xs font-medium text-violet-800">Learner response</p><p className="whitespace-pre-wrap break-words rounded bg-white p-2">{detail.reflection.response_text}</p></div>}
        <p className="mt-2 text-xs font-medium text-violet-900">{detail.reflection.mastery_statement}</p>
      </section>}
      <ol className="space-y-2">{detail.chronology.map((item) => <li key={item.event_id}>
        <time className="text-xs text-slate-500">{dateTime(item.occurred_at)}</time>
        <p>{item.type.replaceAll('_', ' ')}</p>
        {item.accepted_hint_text && <p className="rounded bg-slate-100 p-2">{item.accepted_hint_text}</p>}
      </li>)}</ol>
      <TechnicalProvenanceDisclosure technical={detail.technical} />
    </div>}
  </article>
}
