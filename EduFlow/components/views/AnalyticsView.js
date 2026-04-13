'use client'
import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Button } from '@/ui/button'
import { Badge } from '@/ui/badge'
import {
  BarChart3, Users, FileText, TrendingUp, TrendingDown, Minus,
  AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Target
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend
} from 'recharts'
import { useEduFlow } from '@/contexts/EduFlowContext'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colorMap = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
    amber: 'bg-amber-100 text-amber-600',
    red: 'bg-red-100 text-red-600',
    emerald: 'bg-emerald-100 text-emerald-600',
  }
  return (
    <Card className="glass-card border-0">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function TrendIcon({ trend }) {
  if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-500" />
  if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-500" />
  return <Minus className="h-4 w-4 text-gray-400" />
}

function gradeColor(grade) {
  if (grade >= 5) return 'text-green-600'
  if (grade >= 4) return 'text-blue-600'
  if (grade >= 3) return 'text-amber-600'
  return 'text-red-600'
}

export default function AnalyticsView() {
  const { token } = useEduFlow()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAllStudents, setShowAllStudents] = useState(false)

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/analytics/dashboard', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Daten konnten nicht geladen werden.')
      setData(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchAnalytics() }, [fetchAnalytics])

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gradient mb-1">Lernanalyse</h2>
          <p className="text-gray-500 text-sm">Daten werden geladen...</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto text-center py-20">
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <p className="text-gray-600 mb-4">{error}</p>
        <Button onClick={fetchAnalytics}>Erneut versuchen</Button>
      </div>
    )
  }

  if (!data || data.overview.totalSubmissions === 0) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gradient mb-1">Lernanalyse</h2>
        </div>
        <Card className="glass-card border-0 text-center py-16">
          <CardContent>
            <BarChart3 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">Noch keine Daten vorhanden</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              Sobald Ihre Schüler:innen Aufgaben bearbeitet haben, erscheinen hier detaillierte Auswertungen und Analysen.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { overview, scoreDistribution, performanceOverTime, subjectPerformance, questionTypeAnalysis, classComparison, weakTopics, studentRanking } = data
  const displayStudents = showAllStudents ? studentRanking : studentRanking.slice(0, 10)

  return (
    <motion.div key="analytics" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gradient mb-1">Lernanalyse</h2>
          <p className="text-gray-500 text-sm">Gesamtauswertung aller Klassen und Aufgaben</p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchAnalytics} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Aktualisieren
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <StatCard icon={Users} label="Schüler:innen" value={overview.totalStudents} color="blue" />
        <StatCard icon={FileText} label="Aufgaben" value={overview.totalAssignments} color="purple" />
        <StatCard icon={BarChart3} label="Abgaben" value={overview.totalSubmissions} color="emerald" />
        <StatCard icon={Target} label="Ø Ergebnis" value={`${overview.avgScore}%`} color="amber" />
        <StatCard icon={TrendingUp} label="Ø Note" value={overview.avgGrade} color="green" />
        <StatCard icon={Target} label="Bestanden" value={`${overview.passRate}%`} color={overview.passRate >= 70 ? 'green' : 'red'} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Score Distribution */}
        <Card className="glass-card border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Notenverteilung</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={scoreDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="count" name="Anzahl" radius={[6, 6, 0, 0]}>
                  {scoreDistribution.map((_, i) => (
                    <Cell key={i} fill={i < 4 ? '#ef4444' : i < 7 ? '#f59e0b' : '#10b981'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Performance over time */}
        <Card className="glass-card border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Leistungsverlauf (12 Wochen)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={performanceOverTime.filter(p => p.avgScore !== null)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Line type="monotone" dataKey="avgScore" name="Ø Ergebnis %" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="submissions" name="Abgaben" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Subject Performance */}
        {subjectPerformance.length > 0 && (
          <Card className="glass-card border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Leistung nach Fach</CardTitle>
            </CardHeader>
            <CardContent>
              {subjectPerformance.length >= 3 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={subjectPerformance}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Radar name="Ø Ergebnis %" dataKey="avgScore" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={subjectPerformance} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <YAxis dataKey="subject" type="category" width={100} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="avgScore" name="Ø Ergebnis %" radius={[0, 6, 6, 0]}>
                      {subjectPerformance.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {/* Question Type Analysis */}
        {questionTypeAnalysis.length > 0 && (
          <Card className="glass-card border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Erfolgsrate nach Fragetyp</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={questionTypeAnalysis} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <YAxis dataKey="type" type="category" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    formatter={(v) => [`${v}%`, 'Korrekt']} />
                  <Bar dataKey="correctRate" name="Korrekt %" radius={[0, 6, 6, 0]}>
                    {questionTypeAnalysis.map((entry, i) => (
                      <Cell key={i} fill={entry.correctRate < 40 ? '#ef4444' : entry.correctRate < 60 ? '#f59e0b' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Weak Topics */}
        {weakTopics.length > 0 && (
          <Card className="glass-card border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Schwachstellen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {weakTopics.map((topic, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{topic.topic}</p>
                        {topic.subject && <Badge variant="secondary" className="text-xs flex-shrink-0">{topic.subject}</Badge>}
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className={`h-2 rounded-full ${topic.errorRate > 60 ? 'bg-red-500' : topic.errorRate > 40 ? 'bg-amber-500' : 'bg-blue-500'}`}
                          style={{ width: `${topic.errorRate}%` }} />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-bold ${topic.errorRate > 60 ? 'text-red-600' : topic.errorRate > 40 ? 'text-amber-600' : 'text-blue-600'}`}>
                        {topic.errorRate}%
                      </p>
                      <p className="text-xs text-gray-400">{topic.affectedStudents} SuS</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Class Comparison */}
        {classComparison.length > 0 && (
          <Card className="glass-card border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Klassenvergleich</CardTitle>
            </CardHeader>
            <CardContent>
              {classComparison.length >= 2 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={classComparison}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend />
                    <Bar dataKey="avgScore" name="Ø Ergebnis %" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="passRate" name="Bestanden %" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="space-y-3">
                  {classComparison.map((cls, i) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-xl">
                      <div className="flex justify-between items-center mb-2">
                        <p className="font-medium text-sm">{cls.name}</p>
                        <Badge variant="secondary" className="text-xs">{cls.students} SuS</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-lg font-bold text-blue-600">{cls.avgScore}%</p>
                          <p className="text-xs text-gray-400">Ø Ergebnis</p>
                        </div>
                        <div>
                          <p className={`text-lg font-bold ${gradeColor(cls.avgGrade)}`}>{cls.avgGrade}</p>
                          <p className="text-xs text-gray-400">Ø Note</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-emerald-600">{cls.passRate}%</p>
                          <p className="text-xs text-gray-400">Bestanden</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Student Ranking Table */}
      {studentRanking.length > 0 && (
        <Card className="glass-card border-0 mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Schüler:innen-Übersicht</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">#</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Name</th>
                    <th className="text-center py-2 px-3 text-gray-500 font-medium">Abgaben</th>
                    <th className="text-center py-2 px-3 text-gray-500 font-medium">Ø Ergebnis</th>
                    <th className="text-center py-2 px-3 text-gray-500 font-medium">Ø Note</th>
                    <th className="text-center py-2 px-3 text-gray-500 font-medium">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {displayStudents.map((s, i) => (
                    <tr key={s.student_id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="py-2.5 px-3 text-gray-400">{i + 1}</td>
                      <td className="py-2.5 px-3 font-medium text-gray-900">{s.name}</td>
                      <td className="py-2.5 px-3 text-center text-gray-600">{s.submissions}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`font-semibold ${s.avgScore >= 70 ? 'text-green-600' : s.avgScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                          {s.avgScore}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`font-semibold ${gradeColor(s.avgGrade)}`}>{s.avgGrade}</span>
                      </td>
                      <td className="py-2.5 px-3 flex justify-center"><TrendIcon trend={s.trend} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {studentRanking.length > 10 && (
              <div className="mt-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setShowAllStudents(!showAllStudents)}>
                  {showAllStudents ? <><ChevronUp className="h-3.5 w-3.5 mr-1" /> Weniger anzeigen</> : <><ChevronDown className="h-3.5 w-3.5 mr-1" /> Alle {studentRanking.length} anzeigen</>}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
