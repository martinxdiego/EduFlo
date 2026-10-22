'use client'

export default function TechnicalProvenanceDisclosure({ technical }) {
  if (!technical) return null
  return <details className="mt-3 text-xs text-slate-600">
    <summary className="cursor-pointer font-medium text-slate-800">Technische Provenienz</summary>
    <dl className="mt-2 grid gap-1">{Object.entries(technical).map(([key, value]) => <div key={key} className="break-all"><dt className="inline font-medium">{key.replaceAll('_', ' ')}: </dt><dd className="inline">{value === null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>
  </details>
}
