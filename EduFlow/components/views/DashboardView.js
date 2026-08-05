'use client'
import { useState, useEffect } from 'react'
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from 'framer-motion'
import { Button } from '@/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import {
  PlusCircle, FileText, ChevronRight, Send, Users, GraduationCap, BookOpen, Sparkles
} from 'lucide-react'
import { useEduFlow } from '@/contexts/EduFlowContext'
import { WelcomeBanner } from '@/components/OnboardingHint'
import FirstSuccessFlow from '@/components/FirstSuccessFlow'

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
}
const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 28 } },
}
const listItem = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 420, damping: 30 } },
}

function CountUp({ value = 0, duration = 1.1 }) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(0)
  const rounded = useTransform(mv, (v) => Math.round(v))
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (reduce) { setDisplay(value); return }
    const controls = animate(mv, value, { duration, ease: [0.22, 1, 0.36, 1] })
    const unsub = rounded.on('change', (v) => setDisplay(v))
    return () => { controls.stop(); unsub() }
  }, [value, duration, reduce, mv, rounded])
  return <>{display}</>
}

function FloatingSparkle({ className = '', delay = 0 }) {
  const reduce = useReducedMotion()
  if (reduce) return null
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: [0, 0.7, 0], scale: [0, 1, 0], y: [0, -40, -80] }}
      transition={{ duration: 5, delay, repeat: Infinity, ease: 'easeOut' }}
    />
  )
}

export default function DashboardView({ STARTER_TEMPLATES, handleUseTemplate }) {
  const ctx = useEduFlow()
  const {
    user, worksheets, assignments, teacherClasses, dossiers, generationJob, worksheetStatuses,
    setActiveView, setSelectedWorksheet, setShowEditorPanel,
    loadAssignments, loadSubmissions, loadTeacherClasses,
  } = ctx

  const greeting = (() => {
    const h = new Date().getHours()
    return h < 12 ? 'Guten Morgen' : h < 17 ? 'Guten Nachmittag' : 'Guten Abend'
  })()

  const totalStudents = teacherClasses.reduce((sum, c) => sum + (c.enrolled_students?.length || 0), 0)
  const recentWorksheet = worksheets[0]
  const draftWorksheet = worksheets.find(worksheet => worksheet.status === 'draft' || worksheetStatuses?.[worksheet.id] === 'draft')
  const interruptedDossier = dossiers.find(dossier => ['pending', 'failed'].includes(dossier.generation_status))
  const activeAssignments = assignments.filter(assignment => assignment.status === 'active')
  const showFirstSuccess = worksheets.length === 0 && dossiers.length === 0

  return (
    <motion.div key="home" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }} className="max-w-6xl mx-auto">
      <WelcomeBanner
        hasMaterial={worksheets.length > 0}
        onStart={() => { setActiveView('create'); setSelectedWorksheet(null); setShowEditorPanel(false) }}
      />

      {showFirstSuccess ? <FirstSuccessFlow /> : null}

      {/* Hero greeting with ambient sparkles */}
      <div className="mb-8 relative">
        <FloatingSparkle className="absolute top-2 left-12 w-1.5 h-1.5 bg-blue-400 rounded-full" delay={0.5} />
        <FloatingSparkle className="absolute top-8 left-44 w-1 h-1 bg-purple-400 rounded-full" delay={2} />
        <FloatingSparkle className="absolute top-4 left-72 w-1 h-1 bg-blue-300 rounded-full" delay={3.5} />

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <motion.h2
            className="text-4xl font-bold text-gradient mb-2 inline-block"
            style={{ backgroundSize: '200% 100%' }}
            animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          >
            {greeting}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </motion.h2>
          <p className="text-gray-500 text-lg">Willkommen zurück bei EduFlow. Was möchten Sie heute machen?</p>
        </motion.div>
      </div>

      {!showFirstSuccess ? (
        <motion.section className="mb-8" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} aria-labelledby="next-actions-title">
          <div className="mb-3 flex items-end justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Heute wichtig</p><h3 id="next-actions-title" className="text-xl font-bold text-gray-900">Direkt weiterarbeiten</h3></div>
            <Button variant="ghost" size="sm" onClick={() => setActiveView('library')}>Alle Materialien <ChevronRight className="ml-1 h-4 w-4" /></Button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <button type="button" onClick={() => { const target = draftWorksheet || recentWorksheet; if (target) { setSelectedWorksheet(target); setShowEditorPanel(true); setActiveView('create') } }} className="rounded-2xl border border-blue-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100"><FileText className="h-4 w-4 text-blue-600" /></div>
              <p className="mt-3 text-sm font-semibold text-gray-900">{draftWorksheet ? 'Entwurf fertigstellen' : 'Letztes Material öffnen'}</p>
              <p className="mt-1 truncate text-xs text-gray-500">{(draftWorksheet || recentWorksheet)?.title || 'Material auswählen'}</p>
            </button>
            <button type="button" onClick={() => setActiveView(interruptedDossier ? 'library' : 'students')} className="rounded-2xl border border-indigo-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100"><BookOpen className="h-4 w-4 text-indigo-600" /></div>
              <p className="mt-3 text-sm font-semibold text-gray-900">{interruptedDossier ? 'Dossier fortsetzen' : `${activeAssignments.length} aktive Aufgaben`}</p>
              <p className="mt-1 text-xs text-gray-500">{interruptedDossier?.title || 'Abgaben und Lernstand ansehen'}</p>
            </button>
            <button type="button" onClick={() => setActiveView(generationJob?.status === 'running' ? 'library' : 'create')} className="rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100"><Sparkles className="h-4 w-4 text-emerald-600" /></div>
              <p className="mt-3 text-sm font-semibold text-gray-900">{generationJob?.status === 'running' ? 'Generierung läuft' : 'Neues Material'}</p>
              <p className="mt-1 text-xs text-gray-500">{generationJob?.message || 'Thema, Quelle oder Studio verwenden'}</p>
            </button>
          </div>
        </motion.section>
      ) : null}

      {/* Quick Actions */}
      <motion.div
        className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <QuickAction
          color="blue"
          icon={PlusCircle}
          title="Material erstellen"
          subtitle="KI-gestützt generieren"
          onClick={() => { setActiveView('create'); setSelectedWorksheet(null); setShowEditorPanel(false) }}
        />
        <QuickAction
          color="purple"
          icon={Send}
          title="Aufgabe freigeben"
          subtitle="An Schüler verteilen"
          onClick={() => { setActiveView('students'); loadAssignments() }}
        />
        <QuickAction
          color="emerald"
          icon={Users}
          title="Klassen verwalten"
          subtitle="Roster & Niveaus"
          onClick={() => { setActiveView('classes'); loadTeacherClasses() }}
        />
        <QuickAction
          color="amber"
          icon={GraduationCap}
          title="Lehrplan 21"
          subtitle="Kompetenzen & Material"
          onClick={() => setActiveView('curriculum')}
        />
      </motion.div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <motion.div
            className="grid grid-cols-2 sm:grid-cols-4 gap-3"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            <StatCard value={worksheets.length} label="Materialien" color="blue" />
            <StatCard value={assignments.length} label="Aufgaben" color="purple" />
            <StatCard value={teacherClasses.length} label="Klassen" color="emerald" />
            <StatCard value={totalStudents} label="Schüler/innen" color="amber" />
          </motion.div>

          {/* Recent materials */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Card className="glass-card border-0">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Letzte Materialien</CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setActiveView('library')}>Alle anzeigen <ChevronRight className="h-3 w-3 ml-1" /></Button>
                </div>
              </CardHeader>
              <CardContent>
                {worksheets.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Noch keine Materialien erstellt.</p>
                    <Button size="sm" className="btn-premium mt-3 text-xs" onClick={() => setActiveView('create')}><PlusCircle className="h-3 w-3 mr-1" /> Erstes Material</Button>
                  </div>
                ) : (
                  <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
                    {worksheets.slice(0, 5).map(ws => (
                      <motion.div
                        key={ws.id}
                        variants={listItem}
                        whileHover={{ x: 4, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-blue-50/50 cursor-pointer transition-colors group"
                        onClick={() => { setSelectedWorksheet(ws); setShowEditorPanel(true); setActiveView('create') }}
                      >
                        <motion.div
                          className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0"
                          whileHover={{ rotate: 8, scale: 1.08 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                        >
                          <FileText className="h-5 w-5 text-blue-500" />
                        </motion.div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-700 transition-colors">{ws.title}</p>
                          <p className="text-xs text-gray-400">{ws.subject} · {ws.grade}. Klasse · {ws.content?.questions?.length || 0} Fragen</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Templates recommendation */}
          {user?.teacher_type && STARTER_TEMPLATES && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
              <Card className="glass-card border-0">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Vorlagen für Sie</CardTitle>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => setActiveView('templates')}>Alle Vorlagen <ChevronRight className="h-3 w-3 ml-1" /></Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <motion.div className="grid grid-cols-2 gap-2" variants={staggerContainer} initial="hidden" animate="show">
                    {STARTER_TEMPLATES
                      .filter(t => { const g = parseInt(t.grade, 10); return user.teacher_type === 'sekundar' ? g >= 7 : g <= 6 })
                      .slice(0, 4)
                      .map(t => (
                        <motion.button
                          key={t.id}
                          variants={listItem}
                          whileHover={{ y: -2, scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleUseTemplate(t)}
                          className="p-3 rounded-xl text-left hover:bg-blue-50/50 transition-colors border border-gray-100 hover:border-blue-200"
                        >
                          <p className="text-xs font-medium text-gray-900 truncate">{t.name}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{t.subject} · {t.grade}. Kl.</p>
                        </motion.button>
                      ))}
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Active assignments */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="glass-card border-0">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Aktive Aufgaben</CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setActiveView('students'); loadAssignments() }}>Alle anzeigen <ChevronRight className="h-3 w-3 ml-1" /></Button>
                </div>
              </CardHeader>
              <CardContent>
                {assignments.length === 0 ? (
                  <div className="text-center py-6">
                    <Send className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Noch keine Aufgaben freigegeben.</p>
                  </div>
                ) : (
                  <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
                    {assignments.filter(a => a.status === 'active').slice(0, 4).map(a => (
                      <motion.div
                        key={a.id}
                        variants={listItem}
                        whileHover={{ x: 4 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-blue-50/70 cursor-pointer transition-colors"
                        onClick={() => { setActiveView('students'); loadSubmissions(a.id) }}
                      >
                        <motion.div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${a.submission_count > 0 ? 'bg-green-100' : 'bg-amber-100'}`}
                          animate={a.submission_count > 0 ? {} : { scale: [1, 1.06, 1] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        >
                          <span className={`text-sm font-bold ${a.submission_count > 0 ? 'text-green-600' : 'text-amber-600'}`}>
                            <CountUp value={a.submission_count || 0} />
                          </span>
                        </motion.div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{a.worksheet_title}</p>
                          <p className="text-xs text-gray-400">{a.class_name || 'Ohne Klasse'} · Code: <span className="font-mono">{a.code}</span></p>
                        </div>
                        <span className="text-xs text-gray-400">{a.submission_count || 0} Abgaben</span>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="glass-card border-0">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Meine Klassen</CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setActiveView('classes')}>Verwalten <ChevronRight className="h-3 w-3 ml-1" /></Button>
                </div>
              </CardHeader>
              <CardContent>
                {teacherClasses.length === 0 ? (
                  <div className="text-center py-6">
                    <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Noch keine Klassen.</p>
                    <Button size="sm" className="btn-premium mt-3 text-xs" onClick={() => setActiveView('classes')}><PlusCircle className="h-3 w-3 mr-1" /> Klasse erstellen</Button>
                  </div>
                ) : (
                  <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
                    {teacherClasses.slice(0, 5).map(cls => (
                      <motion.div
                        key={cls.id}
                        variants={listItem}
                        whileHover={{ x: 4 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-blue-50/70 cursor-pointer transition-colors"
                        onClick={() => { setActiveView('classes'); ctx.setSelectedClass(cls) }}
                      >
                        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-emerald-600">
                            <CountUp value={cls.enrolled_students?.length || 0} />
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{cls.name}</p>
                          <p className="text-xs text-gray-400">{cls.enrolled_students?.length || 0} Schüler/innen</p>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}

const COLOR_MAP = {
  blue:    { iconBg: 'bg-blue-100',    icon: 'text-blue-600',    border: 'hover:border-blue-300',    glow: 'rgba(59,130,246,0.25)',  text: 'text-blue-600' },
  purple:  { iconBg: 'bg-purple-100',  icon: 'text-purple-600',  border: 'hover:border-purple-300',  glow: 'rgba(168,85,247,0.25)',  text: 'text-purple-600' },
  emerald: { iconBg: 'bg-emerald-100', icon: 'text-emerald-600', border: 'hover:border-emerald-300', glow: 'rgba(16,185,129,0.25)',  text: 'text-emerald-600' },
  amber:   { iconBg: 'bg-amber-100',   icon: 'text-amber-600',   border: 'hover:border-amber-300',   glow: 'rgba(245,158,11,0.25)',  text: 'text-amber-600' },
}

function QuickAction({ color, icon: Icon, title, subtitle, onClick }) {
  const c = COLOR_MAP[color]
  return (
    <motion.button
      variants={staggerItem}
      whileHover={{ y: -6, scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
      onClick={onClick}
      className={`relative group p-5 bg-white rounded-2xl shadow-sm hover:shadow-xl border-2 border-transparent ${c.border} transition-all text-left overflow-hidden`}
    >
      {/* Soft color glow on hover */}
      <motion.div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(circle at 30% 20%, ${c.glow}, transparent 60%)` }}
      />
      <motion.div
        className={`relative w-12 h-12 ${c.iconBg} rounded-2xl flex items-center justify-center mb-3`}
        whileHover={{ rotate: [0, -8, 8, -4, 0], scale: 1.12 }}
        transition={{ duration: 0.5 }}
      >
        <Icon className={`h-6 w-6 ${c.icon}`} />
      </motion.div>
      <p className="relative font-semibold text-gray-900 text-sm">{title}</p>
      <p className="relative text-xs text-gray-400 mt-0.5">{subtitle}</p>
    </motion.button>
  )
}

function StatCard({ value, label, color }) {
  const c = COLOR_MAP[color]
  return (
    <motion.div
      variants={staggerItem}
      whileHover={{ y: -4, transition: { type: 'spring', stiffness: 400, damping: 22 } }}
      className="relative bg-white rounded-2xl shadow-sm hover:shadow-md p-4 text-center overflow-hidden group transition-shadow"
    >
      <motion.div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(circle at 50% 0%, ${c.glow}, transparent 70%)` }}
      />
      <p className={`relative text-3xl font-bold ${c.text}`}>
        <CountUp value={value} />
      </p>
      <p className="relative text-xs text-gray-500 mt-1">{label}</p>
    </motion.div>
  )
}
