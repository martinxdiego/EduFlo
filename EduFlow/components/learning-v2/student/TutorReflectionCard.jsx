'use client'

import { useRef, useState } from 'react'

function normalize(value) {
  return value.replace(/\r\n?|\n/gu, ' ').normalize('NFC').trim()
}

function validate(value, maximumCharacters, maximumWords) {
  const normalized = normalize(value)
  const characters = Array.from(normalized).length
  const words = normalized ? normalized.split(/\s+/u).length : 0
  if (characters < 3 || !/[\p{L}\p{N}]/u.test(normalized)) return 'Schreibe mindestens drei Zeichen und verwende einen Buchstaben oder eine Zahl.'
  if (characters > maximumCharacters) return `Deine Antwort darf höchstens ${maximumCharacters} Zeichen lang sein.`
  if (words > maximumWords) return `Deine Antwort darf höchstens ${maximumWords} Wörter enthalten.`
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(normalized)) return 'Die Antwort enthält nicht unterstützte Steuerzeichen.'
  return ''
}

export default function TutorReflectionCard({ session, onSessionChange }) {
  const reflection = session?.reflection
  const [responseText, setResponseText] = useState(reflection?.response_text || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const idempotencyKey = useRef(null)
  const inputRef = useRef(null)

  if (!reflection || reflection.status === 'not_required') return null

  const maximumCharacters = reflection.maximum_response_characters || 300
  const maximumWords = reflection.maximum_response_words || 60
  const normalized = normalize(responseText)
  const characterCount = Array.from(normalized).length
  const descriptionId = `reflection-description-${session.session_id}`
  const counterId = `reflection-counter-${session.session_id}`
  const errorId = `reflection-error-${session.session_id}`

  if (reflection.status === 'expired_unsubmitted') {
    return <section className="mt-3 min-w-0 rounded-xl border border-slate-200 bg-white p-3" aria-labelledby={`reflection-title-${session.session_id}`}>
      <h4 id={`reflection-title-${session.session_id}`} className="font-semibold text-slate-900">Kurze Reflexion</h4>
      <p className="mt-1 text-sm text-slate-700">Die Reflexionszeit ist abgelaufen. Deine richtige Antwort und dein Lernstand bleiben unverändert.</p>
    </section>
  }

  if (reflection.status === 'submitted') {
    return <section className="mt-3 min-w-0 rounded-xl border border-violet-200 bg-violet-50 p-3" aria-labelledby={`reflection-title-${session.session_id}`}>
      <h4 id={`reflection-title-${session.session_id}`} className="font-semibold text-violet-950">Kurze Reflexion</h4>
      <p role="status" className="mt-1 text-sm font-medium text-violet-900">Danke. Deine Reflexion wurde gespeichert.</p>
      <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white p-2 text-sm text-slate-800">{reflection.response_text}</p>
    </section>
  }

  const submit = async (event) => {
    event.preventDefault()
    const validation = validate(responseText, maximumCharacters, maximumWords)
    if (validation) {
      setError(validation)
      inputRef.current?.focus()
      return
    }
    setSubmitting(true)
    setError('')
    idempotencyKey.current ||= crypto.randomUUID()
    try {
      const response = await fetch(`/api/v2/learning/tutor/sessions/${encodeURIComponent(session.session_id)}/reflection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema_version: 'learning-v2-phase3b-v1',
          idempotency_key: idempotencyKey.current,
          response_text: responseText,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error?.message || 'Reflexion konnte nicht gespeichert werden.')
      setResponseText(body.reflection.response_text)
      onSessionChange?.(body.session)
    } catch (submissionError) {
      setError(submissionError.message)
      inputRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="mt-3 min-w-0 rounded-xl border border-violet-200 bg-violet-50 p-3" aria-labelledby={`reflection-title-${session.session_id}`}>
    <h4 id={`reflection-title-${session.session_id}`} className="font-semibold text-violet-950">Kurze Reflexion</h4>
    <p id={descriptionId} className="mt-1 text-sm text-violet-900">{reflection.prompt_text}</p>
    <form className="mt-3" onSubmit={submit} noValidate>
      <label htmlFor={`reflection-response-${session.session_id}`} className="block text-sm font-medium text-slate-900">Deine Antwort</label>
      <textarea
        ref={inputRef}
        id={`reflection-response-${session.session_id}`}
        value={responseText}
        onChange={(event) => setResponseText(event.target.value)}
        aria-describedby={`${descriptionId} ${counterId}${error ? ` ${errorId}` : ''}`}
        aria-invalid={Boolean(error)}
        rows={3}
        className="mt-1 block w-full min-w-0 resize-y rounded-lg border border-violet-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
      />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p id={counterId} className="text-xs text-slate-600">{characterCount}/{maximumCharacters} Zeichen · höchstens {maximumWords} Wörter</p>
        <button type="submit" disabled={submitting} className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? 'Wird gespeichert…' : 'Reflexion speichern'}
        </button>
      </div>
      {error && <p id={errorId} role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </form>
  </section>
}
