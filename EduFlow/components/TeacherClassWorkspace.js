'use client'

import { useMemo, useState } from 'react'
import { BarChart3, BookOpen, Calendar, ChevronRight, ClipboardList, Copy, Plus, Search, Sparkles, Target, Trash2, UserMinus, Users } from 'lucide-react'
import { Button } from '@/ui/button'
import { ACTIVITY_MODES } from '@/lib/learning-workflow'

const TABS = [
  { id: 'overview', label: 'Übersicht', icon: BarChart3 },
  { id: 'assignments', label: 'Aufträge', icon: ClipboardList },
  { id: 'goals', label: 'Lernziele', icon: Target },
  { id: 'students', label: 'Schüler:innen', icon: Users },
]
const EMPTY_LIST = []

function masteryStyle(mastery) {
  if (mastery === 'secure') return { label: 'Sicher', color: 'bg-emerald-500', text: 'text-emerald-700', surface: 'bg-emerald-50' }
  if (mastery === 'developing') return { label: 'Im Aufbau', color: 'bg-amber-500', text: 'text-amber-700', surface: 'bg-amber-50' }
  return { label: 'Förderbedarf', color: 'bg-red-500', text: 'text-red-700', surface: 'bg-red-50' }
}

export default function TeacherClassWorkspace({
  classData, stats, insights, insightsLoading, onAnalyze, onCreateAssignment, onOpenAssignment,
  onUpdateNiveau, onRemoveStudent, onDeleteClass,
}) {
  const [tab, setTab] = useState('overview')
  const [search, setSearch] = useState('')
  const [unit, setUnit] = useState('all')
  const [status, setStatus] = useState('all')
  const [studentSort, setStudentSort] = useState('name')
  const assignments = stats?.assignments || EMPTY_LIST
  const students = classData.enrolled_students || EMPTY_LIST
  const goals = insights?.learningGoals || stats?.learningGoals || EMPTY_LIST
  const recommendations = insights?.followUpRecommendations || stats?.recommendations || EMPTY_LIST
  const units = [...new Set(assignments.map((assignment) => assignment.unit).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'))

  const visibleAssignments = useMemo(() => assignments.filter((assignment) => {
    const needle = search.trim().toLowerCase()
    if (needle && !`${assignment.title} ${assignment.activity_label} ${assignment.unit} ${(assignment.learning_goals || []).join(' ')}`.toLowerCase().includes(needle)) return false
    if (unit !== 'all' && assignment.unit !== unit) return false
    return status === 'all' || assignment.status === status
  }).sort((a, b) => {
    if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline)
    if (a.deadline) return -1
    if (b.deadline) return 1
    return String(a.title).localeCompare(String(b.title), 'de')
  }), [assignments, search, unit, status])

  const visibleStudents = useMemo(() => [...students].filter((student) => student.display_name.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => {
    if (studentSort === 'support') return (a.avg_grade ?? 7) - (b.avg_grade ?? 7)
    if (studentSort === 'level') return String(a.niveau).localeCompare(String(b.niveau)) || a.display_name.localeCompare(b.display_name, 'de')
    return a.display_name.localeCompare(b.display_name, 'de')
  }), [students, search, studentSort])

  const copyJoinCode = () => navigator.clipboard?.writeText(classData.join_code || '')

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-indigo-950 px-5 py-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Klassenraum</p>
            <h3 className="mt-1 text-2xl font-bold">{classData.name}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-200">
              <span>{students.length} Schüler:innen</span><span>·</span>
              <button onClick={copyJoinCode} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 font-mono hover:bg-white/20">
                Code {classData.join_code || '–'} <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="bg-white text-slate-900 hover:bg-blue-50" onClick={onCreateAssignment}><Plus className="mr-1 h-4 w-4" /> Auftrag erstellen</Button>
            <Button size="sm" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => onDeleteClass(classData.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-100 bg-slate-50/80 p-1.5 flex gap-1 overflow-x-auto">
        {TABS.map((item) => <button key={item.id} onClick={() => { setTab(item.id); setSearch('') }} className={`flex min-w-fit flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition ${tab === item.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          <item.icon className="h-4 w-4" /> {item.label}
        </button>)}
      </div>

      <div className="p-5">
        {tab === 'overview' ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Aktive Aufträge', assignments.filter((item) => item.status === 'active').length, 'text-blue-700 bg-blue-50'],
                ['Abgaben', stats?.classStats?.totalSubmissions || 0, 'text-violet-700 bg-violet-50'],
                ['Lernziele sicher', goals.filter((goal) => goal.mastery === 'secure').length, 'text-emerald-700 bg-emerald-50'],
                ['Förderhinweise', goals.filter((goal) => goal.mastery === 'support').length, 'text-red-700 bg-red-50'],
              ].map(([label, value, style]) => <div key={label} className={`rounded-2xl p-4 ${style}`}><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-[11px] font-medium">{label}</p></div>)}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between"><h4 className="font-semibold text-slate-900">Als Nächstes</h4><button onClick={() => setTab('assignments')} className="text-xs font-semibold text-blue-600">Alle Aufträge</button></div>
                <div className="space-y-2">
                  {assignments.filter((item) => item.status === 'active').slice(0, 4).map((item) => <button key={item.id} onClick={() => onOpenAssignment(item.id)} className="flex w-full items-center gap-3 rounded-xl bg-slate-50 p-3 text-left hover:bg-blue-50">
                    <span className="rounded-lg bg-white p-2 text-blue-600"><BookOpen className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900">{item.title}</span><span className="text-[11px] text-slate-500">{item.activity_label || ACTIVITY_MODES[item.activity_type]?.label} · {item.submission_count} Abgaben</span></span><ChevronRight className="h-4 w-4 text-slate-400" />
                  </button>)}
                  {!assignments.some((item) => item.status === 'active') ? <p className="py-6 text-center text-sm text-slate-400">Noch kein aktiver Auftrag.</p> : null}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between"><h4 className="font-semibold text-slate-900">Förderfokus</h4><Button size="sm" variant="outline" onClick={onAnalyze} disabled={insightsLoading}>{insightsLoading ? 'Analysiert…' : 'Neu analysieren'}</Button></div>
                <div className="space-y-2">
                  {recommendations.slice(0, 3).map((item) => <div key={item.goal} className={`rounded-xl p-3 ${item.priority === 'high' ? 'bg-red-50' : 'bg-amber-50'}`}><p className="text-xs font-semibold text-slate-900">{item.goal}</p><p className="mt-1 text-[11px] text-slate-600">{item.nextAction}</p></div>)}
                  {!recommendations.length ? <p className="py-6 text-center text-sm text-slate-400">Nach ersten Abgaben erscheinen hier konkrete Förderaktionen.</p> : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'assignments' ? (
          <div>
            <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <label className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Aufträge, Lernziele oder Themen suchen" className="h-9 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm" /></label>
              <select value={unit} onChange={(event) => setUnit(event.target.value)} className="h-9 rounded-xl border border-slate-200 px-3 text-sm"><option value="all">Alle Einheiten</option>{units.map((item) => <option key={item}>{item}</option>)}</select>
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-xl border border-slate-200 px-3 text-sm"><option value="all">Alle Status</option><option value="active">Aktiv</option><option value="draft">Entwurf</option><option value="closed">Beendet</option></select>
            </div>
            <div className="space-y-2">
              {visibleAssignments.map((item) => <button key={item.id} onClick={() => onOpenAssignment(item.id)} className="grid w-full gap-3 rounded-2xl border border-slate-200 p-4 text-left hover:border-blue-300 hover:bg-blue-50/40 sm:grid-cols-[1fr_auto]">
                <span><span className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">{item.title}</span><span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">{item.activity_label || ACTIVITY_MODES[item.activity_type]?.label || 'Übung'}</span>{item.unit ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{item.unit}</span> : null}</span><span className="mt-1 block text-xs text-slate-500">{(item.learning_goals || []).join(' · ') || 'Noch kein Lernziel hinterlegt'}</span></span>
                <span className="flex items-center gap-4 text-xs text-slate-500"><span>{item.submission_count} Abgaben</span>{item.deadline ? <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {new Date(item.deadline).toLocaleDateString('de-CH')}</span> : null}<ChevronRight className="h-4 w-4" /></span>
              </button>)}
              {!visibleAssignments.length ? <p className="py-12 text-center text-sm text-slate-400">Keine passenden Aufträge gefunden.</p> : null}
            </div>
          </div>
        ) : null}

        {tab === 'goals' ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
            <div className="space-y-3">
              {goals.map((goal) => { const style = masteryStyle(goal.mastery); return <div key={goal.goal} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{goal.goal}</p><p className="mt-1 text-xs text-slate-500">{goal.attempts} Versuche · Ø {goal.averageScore}% · bestes Ergebnis {goal.bestScore}%</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${style.surface} ${style.text}`}>{style.label}</span></div><div className="mt-3 h-2 rounded-full bg-slate-100"><div className={`h-full rounded-full ${style.color}`} style={{ width: `${goal.bestScore}%` }} /></div></div> })}
              {!goals.length ? <div className="rounded-2xl bg-slate-50 py-12 text-center"><Target className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm text-slate-500">Lernziele werden sichtbar, sobald Aufträge mit Lernzielen bearbeitet wurden.</p></div> : null}
            </div>
                <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 p-4"><h4 className="flex items-center gap-2 font-semibold text-slate-900"><Sparkles className="h-4 w-4 text-indigo-600" /> Empfohlene nächste Schritte</h4><div className="mt-3 space-y-2">{recommendations.map((item) => <div key={item.goal} className="rounded-xl bg-white/80 p-3"><p className="text-xs font-semibold text-slate-900">{item.title}</p><p className="mt-1 text-[11px] text-slate-600">{item.reason}</p><button onClick={() => onCreateAssignment({ activityType: item.suggestedMode, learningGoals: item.goal })} className="mt-2 text-[11px] font-semibold text-indigo-700">{ACTIVITY_MODES[item.suggestedMode]?.label} erstellen →</button></div>)}</div></div>
          </div>
        ) : null}

        {tab === 'students' ? (
          <div>
            <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]"><label className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Schüler:in suchen" className="h-9 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm" /></label><select value={studentSort} onChange={(event) => setStudentSort(event.target.value)} className="h-9 rounded-xl border border-slate-200 px-3 text-sm"><option value="name">Nach Name</option><option value="support">Förderbedarf zuerst</option><option value="level">Nach Niveau</option></select></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[620px]"><thead><tr className="border-b border-slate-200 text-left text-[11px] font-semibold text-slate-500"><th className="p-3">Name</th><th className="p-3 text-center">Niveau</th><th className="p-3 text-center">Ø Note</th><th className="p-3 text-center">Aktivitäten</th><th className="p-3 text-right">Aktion</th></tr></thead><tbody>{visibleStudents.map((student) => <tr key={student.student_id} className="border-b border-slate-100"><td className="p-3 text-sm font-medium text-slate-900">{student.display_name}</td><td className="p-3"><div className="flex justify-center gap-1">{['A','B','C'].map((level) => <button key={level} onClick={() => onUpdateNiveau(classData.id, student.student_id, level)} className={`h-7 w-7 rounded-lg text-xs font-bold ${student.niveau === level ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{level}</button>)}</div></td><td className="p-3 text-center text-sm font-semibold">{student.avg_grade || '–'}</td><td className="p-3 text-center text-sm text-slate-600">{student.total_quizzes || 0}</td><td className="p-3 text-right"><button onClick={() => onRemoveStudent(classData.id, student.student_id)} className="rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-500" aria-label={`${student.display_name} aus Klasse entfernen`}><UserMinus className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>
            {!visibleStudents.length ? <p className="py-12 text-center text-sm text-slate-400">Keine Schüler:innen gefunden.</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
