'use client'

import { ArrowRight, BookOpen, Brain, CheckCircle2, Clock, Hash, RotateCcw, Sparkles, Trophy, Users } from 'lucide-react'
import { ACTIVITY_MODES } from '@/lib/learning-workflow'

function AssignmentCard({ assignment, action, onStart, tone = 'blue' }) {
  const mode = ACTIVITY_MODES[assignment.activity_type] || ACTIVITY_MODES.exercise
  const due = assignment.deadline ? new Date(assignment.deadline) : null
  const urgent = due && due.getTime() - Date.now() < 2 * 24 * 60 * 60 * 1000
  return (
    <button onClick={() => onStart(assignment.code)} className={`group w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${tone === 'amber' ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
      <div className="flex items-start gap-3">
        <span className={`rounded-xl p-2.5 ${tone === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{action === 'Fortsetzen' ? <RotateCcw className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold text-slate-900">{assignment.title}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{mode.shortLabel}</span></span>
          <span className="mt-1 block text-xs text-slate-500">{assignment.class_name}{assignment.subject ? ` · ${assignment.subject}` : ''}</span>
          {assignment.learning_goals?.[0] ? <span className="mt-2 block truncate text-[11px] text-slate-600">Ziel: {assignment.learning_goals[0]}</span> : null}
          <span className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
            {due ? <span className={`inline-flex items-center gap-1 ${urgent ? 'font-semibold text-red-600' : ''}`}><Clock className="h-3 w-3" /> bis {due.toLocaleDateString('de-CH')}</span> : null}
            {assignment.time_limit_minutes ? <span>{assignment.time_limit_minutes} Min.</span> : null}
            <span>Versuch {Math.min((assignment.attempt_count || 0) + 1, assignment.max_attempts || 1)}/{assignment.max_attempts || 1}</span>
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">{action} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
      </div>
    </button>
  )
}

export default function StudentLearningHome({ assignments = [], resultsData, gamification, onStart, onNavigate }) {
  const now = assignments.filter((assignment) => !assignment.already_submitted && assignment.can_retry)
  const continueLearning = assignments.filter((assignment) => assignment.already_submitted && assignment.can_retry)
  const recentResults = resultsData?.submissions?.slice(0, 4) || []
  const goals = resultsData?.learningGoals || []
  const recommendations = resultsData?.recommendations || []

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-indigo-700 to-violet-700 p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Dein Lernplan</p><h2 className="mt-1 text-2xl font-bold">Was möchtest du jetzt erledigen?</h2><p className="mt-1 text-sm text-blue-100">EduFlow zeigt dir zuerst, was wichtig ist.</p></div>
          {gamification ? <div className="flex gap-4 rounded-2xl bg-white/10 px-4 py-3 text-center"><div><p className="text-xl font-bold">{gamification.level}</p><p className="text-[10px] text-blue-100">Level</p></div><div><p className="text-xl font-bold">{gamification.xp}</p><p className="text-[10px] text-blue-100">XP</p></div><div><p className="text-xl font-bold">{gamification.streak}</p><p className="text-[10px] text-blue-100">Serie</p></div></div> : null}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Jetzt erledigen</p><h3 className="text-lg font-bold text-slate-900">Offene Aufträge</h3></div><span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">{now.length}</span></div>
        <div className="grid gap-3">{now.slice(0, 6).map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} action="Starten" onStart={onStart} />)}</div>
        {!now.length ? <div className="rounded-2xl bg-emerald-50 py-8 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" /><p className="mt-2 font-semibold text-emerald-800">Alles erledigt!</p><p className="text-xs text-emerald-700">Im Moment ist kein neuer Auftrag offen.</p></div> : null}
      </section>

      {continueLearning.length ? <section className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm"><div className="mb-4"><p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Weiterlernen</p><h3 className="text-lg font-bold text-slate-900">Noch einmal üben</h3></div><div className="grid gap-3">{continueLearning.slice(0, 4).map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} action="Fortsetzen" onStart={onStart} tone="amber" />)}</div></section> : null}

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-violet-600">Ergebnisse</p><h3 className="text-lg font-bold text-slate-900">Zuletzt abgeschlossen</h3></div><button onClick={() => onNavigate('results')} className="text-xs font-semibold text-blue-700">Alle Ergebnisse</button></div><div className="space-y-2">{recentResults.map((result) => <div key={result.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><span className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${result.feedback_pending ? 'bg-amber-100 text-amber-700' : (result.score_percentage || 0) >= 60 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{result.feedback_pending ? '…' : `${result.score_percentage}%`}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900">{result.assignment_title}</span><span className="text-[11px] text-slate-500">{result.activity_label}{result.feedback_pending ? ' · Auswertung folgt' : ''}</span></span></div>)}{!recentResults.length ? <p className="py-8 text-center text-sm text-slate-400">Noch keine Ergebnisse.</p> : null}</div></section>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Deine Lernziele</p><h3 className="text-lg font-bold text-slate-900">Das kannst du schon</h3></div><div className="space-y-3">{goals.slice(0, 5).map((goal) => <div key={goal.goal}><div className="mb-1 flex items-center justify-between gap-3"><span className="truncate text-xs font-medium text-slate-700">{goal.goal}</span><span className="text-[10px] font-bold text-slate-500">{goal.bestScore}%</span></div><div className="h-2 rounded-full bg-slate-100"><div className={`h-full rounded-full ${goal.mastery === 'secure' ? 'bg-emerald-500' : goal.mastery === 'developing' ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${goal.bestScore}%` }} /></div></div>)}{!goals.length ? <p className="py-8 text-center text-sm text-slate-400">Deine Lernziele erscheinen nach den ersten Aufgaben.</p> : null}</div></section>
      </div>

      {recommendations.length ? <section className="rounded-3xl bg-gradient-to-br from-emerald-50 to-cyan-50 p-5"><h3 className="flex items-center gap-2 font-bold text-slate-900"><Sparkles className="h-5 w-5 text-emerald-600" /> Dein nächster sinnvoller Schritt</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{recommendations.slice(0, 2).map((item) => <div key={item.goal} className="rounded-2xl bg-white/80 p-4"><p className="text-sm font-semibold text-slate-900">{item.goal}</p><p className="mt-1 text-xs text-slate-600">{item.nextAction}</p><button onClick={() => onNavigate('coach')} className="mt-3 text-xs font-semibold text-emerald-700">Mit Lerncoach üben →</button></div>)}</div></section> : null}

      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4"><button onClick={() => onNavigate('code')} className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-xs font-semibold text-slate-700 hover:border-blue-300"><Hash className="mx-auto mb-2 h-5 w-5 text-blue-600" /> Zugangscode</button><button onClick={() => onNavigate('coach')} className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-xs font-semibold text-slate-700 hover:border-emerald-300"><Brain className="mx-auto mb-2 h-5 w-5 text-emerald-600" /> Lerncoach</button><button onClick={() => onNavigate('classes')} className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-xs font-semibold text-slate-700 hover:border-blue-300"><Users className="mx-auto mb-2 h-5 w-5 text-blue-600" /> Klassen</button><button onClick={() => onNavigate('gamification')} className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-xs font-semibold text-slate-700 hover:border-amber-300"><Trophy className="mx-auto mb-2 h-5 w-5 text-amber-600" /> Erfolge</button></nav>
    </div>
  )
}
