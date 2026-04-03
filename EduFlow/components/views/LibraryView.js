'use client'
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Badge } from '@/ui/badge'
import {
  Search, Filter, FolderOpen, PlusCircle, LayoutTemplate,
  FileText, Hash, Calendar, Eye, Download, Copy, Trash2,
  BookOpen, Layers
} from 'lucide-react'
import { useEduFlow } from '@/contexts/EduFlowContext'

const DIFFICULTY_LABELS = { easy: 'Einfach', medium: 'Mittel', hard: 'Schwierig' }

export default function LibraryView({ SUBJECTS, GRADES, handleExportPDF, handleExportDossierPDF, handleDeleteDossier }) {
  const ctx = useEduFlow()
  const {
    worksheets, setSelectedWorksheet, setShowEditorPanel, setActiveView,
    handleDeleteWorksheet, handleDuplicate,
    librarySearch, setLibrarySearch,
    libraryFilterSubject, setLibraryFilterSubject,
    libraryFilterGrade, setLibraryFilterGrade,
    dossiers, setSelectedDossier,
    worksheetStatuses, setSuccessMessage, setError,
  } = ctx

  const getWorksheetStatus = (id) => worksheetStatuses[id] || null

  const filteredWorksheets = useMemo(() => {
    return worksheets.filter(ws => {
      const matchesSearch = librarySearch === '' ||
        ws.title?.toLowerCase().includes(librarySearch.toLowerCase()) ||
        ws.topic?.toLowerCase().includes(librarySearch.toLowerCase())
      const matchesSubject = libraryFilterSubject === 'all' || ws.subject === libraryFilterSubject
      const matchesGrade = libraryFilterGrade === 'all' || ws.grade === libraryFilterGrade
      return matchesSearch && matchesSubject && matchesGrade
    })
  }, [worksheets, librarySearch, libraryFilterSubject, libraryFilterGrade])

  const handleDelete = async (id) => {
    const ok = await handleDeleteWorksheet(id)
    if (ok) setSuccessMessage('Material wurde gelöscht.')
    else setError('Fehler beim Löschen.')
  }

  const handleDup = (ws) => {
    handleDuplicate(ws)
    setSuccessMessage('Material wurde dupliziert.')
  }

  return (
    <motion.div key="library" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gradient mb-2">Meine Materialien</h2>
        <p className="text-gray-600">Alle erstellten Arbeitsblätter, Prüfungen, Quizze, Vokabellisten und Arbeitsdossiers.</p>
      </div>

      {/* Filters */}
      <div className="glass-card rounded-xl p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Materialien durchsuchen..." value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={libraryFilterSubject} onValueChange={setLibraryFilterSubject}>
            <SelectTrigger className="w-full sm:w-[180px]"><Filter className="h-4 w-4 mr-2 text-gray-400" /><SelectValue placeholder="Fach" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Alle Fächer</SelectItem>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={libraryFilterGrade} onValueChange={setLibraryFilterGrade}>
            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Klasse" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Alle Klassen</SelectItem>{GRADES.map(n => <SelectItem key={n} value={String(n)}>{n}. Klasse</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {worksheets.length > 0 && (
        <p className="text-sm text-gray-500 mb-4">
          {filteredWorksheets.length} von {worksheets.length} Materialien
          {(librarySearch || libraryFilterSubject !== 'all' || libraryFilterGrade !== 'all') && (
            <Button variant="link" size="sm" className="ml-2 text-blue-600 p-0 h-auto" onClick={() => { setLibrarySearch(''); setLibraryFilterSubject('all'); setLibraryFilterGrade('all') }}>Filter zurücksetzen</Button>
          )}
        </p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {worksheets.length === 0 ? (
          <div className="col-span-full">
            <Card className="glass-card border-0"><CardContent className="py-20 text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-blue-50 rounded-2xl flex items-center justify-center"><FolderOpen className="h-10 w-10 text-blue-400" /></div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">Ihre Bibliothek ist noch leer</h3>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">Erstellen Sie Ihr erstes Arbeitsblatt, eine Prüfung oder ein Quiz.</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => setActiveView('create')} className="btn-premium"><PlusCircle className="h-4 w-4 mr-2" /> Erstes Material erstellen</Button>
                <Button variant="outline" onClick={() => setActiveView('templates')}><LayoutTemplate className="h-4 w-4 mr-2" /> Vorlagen ansehen</Button>
              </div>
            </CardContent></Card>
          </div>
        ) : filteredWorksheets.length === 0 ? (
          <div className="col-span-full">
            <Card className="glass-card border-0"><CardContent className="py-16 text-center">
              <Search className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Keine Ergebnisse</h3>
              <p className="text-gray-500 mb-4">Versuchen Sie andere Suchbegriffe oder Filter.</p>
              <Button variant="outline" onClick={() => { setLibrarySearch(''); setLibraryFilterSubject('all'); setLibraryFilterGrade('all') }}>Filter zurücksetzen</Button>
            </CardContent></Card>
          </div>
        ) : (
          filteredWorksheets.map((worksheet, index) => (
            <motion.div key={worksheet.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
              <Card className="glass-card border-0 hover-lift cursor-pointer h-full flex flex-col" onClick={() => { setSelectedWorksheet(worksheet); setShowEditorPanel(true); setActiveView('create') }}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base leading-tight line-clamp-2 min-h-[2.5rem] flex-1">{worksheet.title}</CardTitle>
                    {getWorksheetStatus(worksheet.id) === 'draft' && (
                      <Badge className="bg-amber-100 text-amber-700 border border-amber-300 text-[10px] flex-shrink-0 ml-2">Entwurf</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge variant="outline" className="text-xs">{worksheet.grade}. Klasse</Badge>
                    <Badge variant="outline" className="text-xs">{worksheet.subject}</Badge>
                    <Badge variant="outline" className="text-xs">{DIFFICULTY_LABELS[worksheet.difficulty] || worksheet.difficulty}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> {worksheet.content?.questions?.length || 0} Fragen</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(worksheet.created_at).toLocaleDateString('de-CH')}</span>
                  </div>
                </CardContent>
                <CardFooter className="pt-0">
                  <div className="flex gap-2 w-full">
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); setSelectedWorksheet(worksheet); setShowEditorPanel(true); setActiveView('create') }} className="flex-1 text-xs"><Eye className="h-3.5 w-3.5 mr-1" /> Ansehen</Button>
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleExportPDF(worksheet, 'student') }} title="PDF"><Download className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleDup(worksheet) }} title="Duplizieren"><Copy className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleDelete(worksheet.id) }} className="text-red-500 hover:text-red-600" title="Löschen"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardFooter>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* Dossier cards */}
      {dossiers.length > 0 && (
        <>
          <h3 className="text-lg font-semibold text-gray-800 mt-8 mb-4 flex items-center gap-2"><BookOpen className="h-5 w-5 text-indigo-500" /> Arbeitsdossiers</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {dossiers.filter(d => {
              const matchesSearch = librarySearch === '' || d.title?.toLowerCase().includes(librarySearch.toLowerCase())
              const matchesSubject = libraryFilterSubject === 'all' || d.subject === libraryFilterSubject
              const matchesGrade = libraryFilterGrade === 'all' || d.grade === libraryFilterGrade
              return matchesSearch && matchesSubject && matchesGrade
            }).map((dossier, index) => (
              <motion.div key={dossier.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
                <Card className="glass-card border-0 hover-lift cursor-pointer h-full flex flex-col border-l-4 border-l-indigo-400" onClick={() => { setSelectedDossier(dossier); setActiveView('dossier-editor') }}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base leading-tight line-clamp-2 min-h-[2.5rem] flex-1">{dossier.title}</CardTitle>
                      <Badge className="bg-indigo-100 text-indigo-700 border border-indigo-300 text-[10px] flex-shrink-0 ml-2">Dossier</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Badge variant="outline" className="text-xs">{dossier.grade}. Klasse</Badge>
                      <Badge variant="outline" className="text-xs">{dossier.subject}</Badge>
                      <Badge variant="outline" className="text-xs">{DIFFICULTY_LABELS[dossier.difficulty] || dossier.difficulty}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {dossier.sections?.length || 0} Sektionen</span>
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(dossier.created_at).toLocaleDateString('de-CH')}</span>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-0">
                    <div className="flex gap-2 w-full">
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); setSelectedDossier(dossier); setActiveView('dossier-editor') }} className="flex-1 text-xs"><Eye className="h-3.5 w-3.5 mr-1" /> Bearbeiten</Button>
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleExportDossierPDF(dossier, 'student') }} title="PDF"><Download className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleDeleteDossier(dossier.id) }} className="text-red-500 hover:text-red-600" title="Löschen"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  )
}
