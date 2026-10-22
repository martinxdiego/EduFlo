'use client'

import TechnicalProvenanceDisclosure from './TechnicalProvenanceDisclosure'

export default function KnowledgeStateSummary({ state }) {
  if (!state) return null
  return <section aria-labelledby="knowledge-summary-title" className="rounded-xl border bg-slate-50 p-4">
    <h3 id="knowledge-summary-title" className="font-semibold">Aktueller Lernstand</h3>
    <p className="mt-1 text-sm text-slate-700">{state.competency.label}{state.objective?.title ? ` · ${state.objective.title}` : ''}</p>
    <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div><dt className="text-xs text-slate-500">Mastery</dt><dd className="font-medium">{state.mastery.label}</dd></div>
      <div><dt className="text-xs text-slate-500">Confidence</dt><dd className="font-medium">{state.confidence.label}</dd></div>
    </dl>
    <p className="mt-2 text-sm text-slate-700"><strong>Confidence:</strong> How well-supported and stable is this estimate?</p>
    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
      <div><dt className="text-xs text-slate-500">Independent</dt><dd className="font-medium">{state.counts.independent}</dd></div>
      <div><dt className="text-xs text-slate-500">Assisted</dt><dd className="font-medium">{state.counts.assisted}</dd></div>
      <div><dt className="text-xs text-slate-500">Support required</dt><dd className="font-medium">{state.counts.support_required}</dd></div>
      <div><dt className="text-xs text-slate-500">Teacher</dt><dd className="font-medium">{state.counts.teacher}</dd></div>
      <div><dt className="text-xs text-slate-500">Last activity</dt><dd className="font-medium">{state.last_activity_at ? new Date(state.last_activity_at).toLocaleDateString('de-CH') : '—'}</dd></div>
    </dl>
    {state.limitations?.length > 0 && <div className="mt-3" aria-label="Limitations">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Einschränkungen</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{state.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>}
    {state.why?.length > 0 && <div className="mt-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Warum?</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{state.why.map((item) => <li key={item}>{item}</li>)}</ul></div>}
    <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Berechnete Details</summary><dl className="mt-2 grid grid-cols-2 gap-2"><div><dt>Mastery estimate</dt><dd>{state.detail?.calculated_mastery_estimate?.toFixed(2)}</dd></div><div><dt>Confidence estimate</dt><dd>{state.detail?.calculated_confidence_estimate?.toFixed(2)}</dd></div><div><dt>Evidence</dt><dd>{state.detail?.evidence_count}</dd></div><div><dt>Tasks</dt><dd>{state.detail?.distinct_tasks}</dd></div></dl><p className="mt-2 text-xs">{state.detail?.calculated_estimate_warning}</p></details>
    <TechnicalProvenanceDisclosure technical={state.technical} />
  </section>
}
