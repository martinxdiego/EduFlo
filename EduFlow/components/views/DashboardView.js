'use client'
import { motion } from 'framer-motion'
import { Button } from '@/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import {
  PlusCircle, FileText, ChevronRight, Send, Users, GraduationCap
} from 'lucide-react'
import { useEduFlow } from '@/contexts/EduFlowContext'

export default function DashboardView({ STARTER_TEMPLATES, handleUseTemplate }) {
  const ctx = useEduFlow()
  const {
    user, worksheets, assignments, teacherClasses,
    setActiveView, setSelectedWorksheet, setShowEditorPanel,
    loadAssignments, loadSubmissions, loadTeacherClasses,
  } = ctx

  const greeting = (() => {
    const h = new Date().getHours()
    return h < 12 ? 'Guten Morgen' : h < 17 ? 'Guten Nachmittag' : 'Guten Abend'
  })()

  return (
    <motion.div key="home" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }} className="max-w-6xl mx-auto">
      {/* Hero greeting */}
      <div className="mb-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h2 className="text-4xl font-bold text-gradient mb-2">
            {greeting}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h2>
          <p className="text-gray-500 text-lg">Willkommen zurück bei EduFlow. Was möchten Sie heute machen?</p>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <button onClick={() => { setActiveView('create'); setSelectedWorksheet(null); setShowEditorPanel(false) }}
            className="group p-5 bg-white rounded-2xl shadow-sm hover:shadow-lg border-2 border-transparent hover:border-blue-200 transition-all text-left">
            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <PlusCircle className="h-6 w-6 text-blue-600" />
            </div>
            <p className="font-semibold text-gray-900 text-sm">Material erstellen</p>
            <p className="text-xs text-gray-400 mt-0.5">KI-gestützt generieren</p>
          </button>
          <button onClick={() => { setActiveView('students'); loadAssignments() }}
            className="group p-5 bg-white rounded-2xl shadow-sm hover:shadow-lg border-2 border-transparent hover:border-purple-200 transition-all text-left">
            <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Send className="h-6 w-6 text-purple-600" />
            </div>
            <p className="font-semibold text-gray-900 text-sm">Aufgabe freigeben</p>
            <p className="text-xs text-gray-400 mt-0.5">An Schüler verteilen</p>
          </button>
          <button onClick={() => { setActiveView('classes'); loadTeacherClasses() }}
            className="group p-5 bg-white rounded-2xl shadow-sm hover:shadow-lg border-2 border-transparent hover:border-emerald-200 transition-all text-left">
            <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Users className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="font-semibold text-gray-900 text-sm">Klassen verwalten</p>
            <p className="text-xs text-gray-400 mt-0.5">Roster & Niveaus</p>
          </button>
          <button onClick={() => setActiveView('curriculum')}
            className="group p-5 bg-white rounded-2xl shadow-sm hover:shadow-lg border-2 border-transparent hover:border-amber-200 transition-all text-left">
            <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <GraduationCap className="h-6 w-6 text-amber-600" />
            </div>
            <p className="font-semibold text-gray-900 text-sm">Lehrplan 21</p>
            <p className="text-xs text-gray-400 mt-0.5">Kompetenzen & Material</p>
          </button>
        </div>
      </motion.div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard value={worksheets.length} label="Materialien" color="blue" />
              <StatCard value={assignments.length} label="Aufgaben" color="purple" />
              <StatCard value={teacherClasses.length} label="Klassen" color="emerald" />
              <StatCard value={teacherClasses.reduce((sum, c) => sum + (c.enrolled_students?.length || 0), 0)} label="Schüler/innen" color="amber" />
            </div>
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
                  <div className="space-y-2">
                    {worksheets.slice(0, 5).map(ws => (
                      <div key={ws.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => { setSelectedWorksheet(ws); setShowEditorPanel(true); setActiveView('create') }}>
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                          <FileText className="h-5 w-5 text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{ws.title}</p>
                          <p className="text-xs text-gray-400">{ws.subject} · {ws.grade}. Klasse · {ws.content?.questions?.length || 0} Fragen</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
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
                  <div className="grid grid-cols-2 gap-2">
                    {STARTER_TEMPLATES
                      .filter(t => { const g = parseInt(t.grade, 10); return user.teacher_type === 'sekundar' ? g >= 7 : g <= 6 })
                      .slice(0, 4)
                      .map(t => (
                        <button key={t.id} onClick={() => handleUseTemplate(t)}
                          className="p-3 rounded-xl text-left hover:bg-gray-50 transition-colors border border-gray-100">
                          <p className="text-xs font-medium text-gray-900 truncate">{t.name}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{t.subject} · {t.grade}. Kl.</p>
                        </button>
                      ))}
                  </div>
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
                  <div className="space-y-2">
                    {assignments.filter(a => a.status === 'active').slice(0, 4).map(a => (
                      <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-blue-50/50 cursor-pointer transition-colors"
                        onClick={() => { setActiveView('students'); loadSubmissions(a.id) }}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${a.submission_count > 0 ? 'bg-green-100' : 'bg-amber-100'}`}>
                          <span className={`text-sm font-bold ${a.submission_count > 0 ? 'text-green-600' : 'text-amber-600'}`}>{a.submission_count || 0}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{a.worksheet_title}</p>
                          <p className="text-xs text-gray-400">{a.class_name || 'Ohne Klasse'} · Code: <span className="font-mono">{a.code}</span></p>
                        </div>
                        <span className="text-xs text-gray-400">{a.submission_count || 0} Abgaben</span>
                      </div>
                    ))}
                  </div>
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
                  <div className="space-y-2">
                    {teacherClasses.slice(0, 5).map(cls => (
                      <div key={cls.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-blue-50/50 cursor-pointer transition-colors"
                        onClick={() => { setActiveView('classes'); ctx.setSelectedClass(cls) }}>
                        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-emerald-600">{cls.enrolled_students?.length || 0}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{cls.name}</p>
                          <p className="text-xs text-gray-400">{cls.enrolled_students?.length || 0} Schüler/innen</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}

function StatCard({ value, label, color }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
      <p className={`text-3xl font-bold text-${color}-600`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
}
