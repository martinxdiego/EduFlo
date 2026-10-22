'use client'

export default function CompetencySelector({ competencies, value, onChange }) {
  return <div>
    <label htmlFor="learning-v2-competency" className="mb-1 block text-sm font-medium">Kompetenz</label>
    <select id="learning-v2-competency" value={value || ''} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border bg-white px-3 text-sm">
      {competencies.map((item) => <option key={item.competency.competency_id} value={item.competency.competency_id}>{item.competency.label}</option>)}
    </select>
  </div>
}
