'use client'
import { useMemo, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Badge } from '@/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/dialog'
import { Label } from '@/ui/label'
import {
  Search, Filter, FolderOpen, PlusCircle, LayoutTemplate,
  FileText, Hash, Calendar, Eye, Download, Copy, Trash2,
  BookOpen, Layers, ArrowUpDown, SlidersHorizontal, X, Archive, ArchiveRestore,
  Star, Tags, Folder, MoreVertical, CheckCircle2, Presentation
} from 'lucide-react'
import { useEduFlow } from '@/contexts/EduFlowContext'
import { filterMaterials } from '@/lib/product-workspace'

const DIFFICULTY_LABELS = { easy: 'Einfach', medium: 'Mittel', hard: 'Schwierig' }

const gridContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
}
const gridItem = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 360, damping: 26 } },
  exit: { opacity: 0, scale: 0.94, transition: { duration: 0.2 } },
}

export default function LibraryView({ SUBJECTS, GRADES, handleExportPDF, handleExportDossierPDF, handleDeleteDossier }) {
  const ctx = useEduFlow()
  const reduce = useReducedMotion()
  const {
    token,
    worksheets, setSelectedWorksheet, setShowEditorPanel, setActiveView,
    handleDeleteWorksheet, handleDuplicate, updateWorksheetMetadata,
    librarySearch, setLibrarySearch,
    libraryFilterSubject, setLibraryFilterSubject,
    libraryFilterGrade, setLibraryFilterGrade,
    libraryFilterDifficulty, setLibraryFilterDifficulty,
    libraryFilterType, setLibraryFilterType,
    librarySortBy, setLibrarySortBy,
    dossiers, setSelectedDossier, studioPackages, setStudioPackages, setSelectedStudioPackage,
    setSuccessMessage, setError,
  } = ctx
  const [showArchived, setShowArchived] = useState(false)
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [folderFilter, setFolderFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [metadataMaterial, setMetadataMaterial] = useState(null)
  const [metadataForm, setMetadataForm] = useState({ folder: '', tags: '' })

  const folders = useMemo(() => [...new Set(worksheets.map(item => item.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')), [worksheets])

  const hasActiveFilters = librarySearch || libraryFilterSubject !== 'all' || libraryFilterGrade !== 'all' || libraryFilterDifficulty !== 'all' || libraryFilterType !== 'all' || showArchived || favoriteOnly || folderFilter !== 'all' || statusFilter !== 'all'

  const resetAllFilters = () => {
    setLibrarySearch('')
    setLibraryFilterSubject('all')
    setLibraryFilterGrade('all')
    setLibraryFilterDifficulty('all')
    setLibraryFilterType('all')
    setShowArchived(false)
    setFavoriteOnly(false)
    setFolderFilter('all')
    setStatusFilter('all')
  }

  const filteredWorksheets = useMemo(() => {
    const base = filterMaterials(worksheets, { search: librarySearch, showArchived, archivedOnly: showArchived, favoriteOnly, folder: folderFilter, status: statusFilter })
    const filtered = base.filter(ws => {
      const matchesSubject = libraryFilterSubject === 'all' || ws.subject === libraryFilterSubject
      const matchesGrade = libraryFilterGrade === 'all' || ws.grade === libraryFilterGrade
      const matchesDifficulty = libraryFilterDifficulty === 'all' || ws.difficulty === libraryFilterDifficulty
      const matchesType = libraryFilterType === 'all' || ws.resourceType === libraryFilterType
      return matchesSubject && matchesGrade && matchesDifficulty && matchesType
    })

    switch (librarySortBy) {
      case 'oldest':
        return filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      case 'title':
        return filtered.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'))
      case 'questions':
        return filtered.sort((a, b) => (b.content?.questions?.length || 0) - (a.content?.questions?.length || 0))
      case 'newest':
      default:
        return filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }
  }, [worksheets, librarySearch, libraryFilterSubject, libraryFilterGrade, libraryFilterDifficulty, libraryFilterType, librarySortBy, showArchived, favoriteOnly, folderFilter, statusFilter])

  const handleDelete = async (id) => {
    const ok = await handleDeleteWorksheet(id)
    if (ok) setSuccessMessage('Material wurde gelöscht.')
    else setError('Fehler beim Löschen.')
  }

  const handleDup = async (ws) => {
    const duplicate = await handleDuplicate(ws)
    if (duplicate) setSuccessMessage('Material wurde dupliziert und gespeichert.')
    else setError('Material konnte nicht dupliziert werden.')
  }

  const updateMetadata = async (worksheet, updates, success) => {
    const updated = await updateWorksheetMetadata(worksheet.id, updates)
    if (updated) setSuccessMessage(success)
    else setError('Änderung konnte nicht gespeichert werden.')
  }

  const openMetadata = worksheet => {
    setMetadataMaterial(worksheet)
    setMetadataForm({ folder: worksheet.folder || '', tags: (worksheet.tags || []).join(', ') })
  }

  const saveMetadata = async () => {
    if (!metadataMaterial) return
    const updated = await updateWorksheetMetadata(metadataMaterial.id, {
      folder: metadataForm.folder,
      tags: metadataForm.tags.split(',').map(tag => tag.trim()).filter(Boolean),
    })
    if (updated) {
      setSuccessMessage('Ordner und Tags wurden gespeichert.')
      setMetadataMaterial(null)
    } else setError('Metadaten konnten nicht gespeichert werden.')
  }

  const filteredDossiers = dossiers.filter(d => {
    const matchesSearch = librarySearch === '' || d.title?.toLowerCase().includes(librarySearch.toLowerCase())
    const matchesSubject = libraryFilterSubject === 'all' || d.subject === libraryFilterSubject
    const matchesGrade = libraryFilterGrade === 'all' || d.grade === libraryFilterGrade
    return matchesSearch && matchesSubject && matchesGrade
  })

  const filteredStudioPackages = studioPackages.filter(item => {
    const search = librarySearch.toLowerCase()
    return (!search || item.title?.toLowerCase().includes(search) || item.subject?.toLowerCase().includes(search)) &&
      (libraryFilterSubject === 'all' || item.subject === libraryFilterSubject) &&
      (libraryFilterGrade === 'all' || String(item.grade).startsWith(String(libraryFilterGrade)))
  })

  const deleteStudioPackage = async id => {
    const response = await fetch(`/api/studio/packages?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
    if (response.ok) {
      setStudioPackages(previous => previous.filter(item => item.id !== id))
      setSuccessMessage('Studio-Paket wurde gelöscht.')
    } else setError('Studio-Paket konnte nicht gelöscht werden.')
  }

  return (
    <motion.div key="library" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-7xl mx-auto">
      <div className="mb-8">
        <motion.h2
          className="text-3xl font-bold text-gradient mb-2 inline-block"
          style={{ backgroundSize: '200% 100%' }}
          animate={reduce ? {} : { backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        >
          Meine Materialien
        </motion.h2>
        <p className="text-gray-600">Alle erstellten Arbeitsblätter, Prüfungen, Quizze, Vokabellisten und Arbeitsdossiers.</p>
      </div>

      {/* Filters */}
      <motion.div
        className="glass-card rounded-xl p-4 mb-6 space-y-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3">
          <Button size="sm" variant={!showArchived && !favoriteOnly ? 'default' : 'outline'} onClick={() => { setShowArchived(false); setFavoriteOnly(false) }}>Aktuell</Button>
          <Button size="sm" variant={favoriteOnly ? 'default' : 'outline'} onClick={() => { setFavoriteOnly(current => !current); setShowArchived(false) }}><Star className={`mr-1.5 h-3.5 w-3.5 ${favoriteOnly ? 'fill-current' : ''}`} /> Favoriten</Button>
          <Button size="sm" variant={showArchived ? 'default' : 'outline'} onClick={() => { setShowArchived(current => !current); setFavoriteOnly(false) }}><Archive className="mr-1.5 h-3.5 w-3.5" /> Archiv</Button>
          <span className="ml-auto text-xs text-gray-400">Suche durchsucht auch Aufgaben und Lösungen.</span>
        </div>
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
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <Select value={folderFilter} onValueChange={setFolderFilter}>
            <SelectTrigger className="w-full sm:w-[170px]"><Folder className="h-4 w-4 mr-2 text-gray-400" /><SelectValue placeholder="Ordner" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Alle Ordner</SelectItem>{folders.map(folder => <SelectItem key={folder} value={folder}>{folder}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[160px]"><CheckCircle2 className="h-4 w-4 mr-2 text-gray-400" /><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Alle Status</SelectItem><SelectItem value="draft">Entwurf</SelectItem><SelectItem value="review">Zu prüfen</SelectItem><SelectItem value="ready">Geprüft</SelectItem></SelectContent>
          </Select>
          <Select value={libraryFilterDifficulty} onValueChange={setLibraryFilterDifficulty}>
            <SelectTrigger className="w-full sm:w-[150px]"><SlidersHorizontal className="h-4 w-4 mr-2 text-gray-400" /><SelectValue placeholder="Schwierigkeit" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Niveaus</SelectItem>
              <SelectItem value="easy">Einfach</SelectItem>
              <SelectItem value="medium">Mittel</SelectItem>
              <SelectItem value="hard">Schwierig</SelectItem>
            </SelectContent>
          </Select>
          <Select value={libraryFilterType} onValueChange={setLibraryFilterType}>
            <SelectTrigger className="w-full sm:w-[170px]"><FileText className="h-4 w-4 mr-2 text-gray-400" /><SelectValue placeholder="Typ" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Typen</SelectItem>
              <SelectItem value="worksheet">Arbeitsblatt</SelectItem>
              <SelectItem value="exam">Prüfung</SelectItem>
              <SelectItem value="quiz">Quiz</SelectItem>
              <SelectItem value="vocabulary">Wortschatz</SelectItem>
            </SelectContent>
          </Select>
          <Select value={librarySortBy} onValueChange={setLibrarySortBy}>
            <SelectTrigger className="w-full sm:w-[170px]"><ArrowUpDown className="h-4 w-4 mr-2 text-gray-400" /><SelectValue placeholder="Sortierung" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Neueste zuerst</SelectItem>
              <SelectItem value="oldest">Älteste zuerst</SelectItem>
              <SelectItem value="title">Alphabetisch</SelectItem>
              <SelectItem value="questions">Meiste Fragen</SelectItem>
            </SelectContent>
          </Select>
          <AnimatePresence>
            {hasActiveFilters && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, x: -10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, x: -10 }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              >
                <Button variant="ghost" size="sm" onClick={resetAllFilters} className="text-xs text-gray-500 hover:text-red-500 whitespace-nowrap">
                  <X className="h-3 w-3 mr-1" /> Filter zurücksetzen
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {worksheets.length > 0 && (
        <motion.p
          key={`count-${filteredWorksheets.length}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-gray-500 mb-4"
        >
          {filteredWorksheets.length} von {worksheets.length} Materialien
          {hasActiveFilters && (
            <Button variant="link" size="sm" className="ml-2 text-blue-600 p-0 h-auto" onClick={resetAllFilters}>Filter zurücksetzen</Button>
          )}
        </motion.p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {worksheets.length === 0 ? (
          <div className="col-span-full">
            <Card className="glass-card border-0"><CardContent className="py-20 text-center">
              <motion.div
                className="w-20 h-20 mx-auto mb-6 bg-blue-50 rounded-2xl flex items-center justify-center"
                animate={reduce ? {} : { y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <FolderOpen className="h-10 w-10 text-blue-400" />
              </motion.div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">Ihre Bibliothek ist noch leer</h3>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">Erstellen Sie Ihr erstes Arbeitsblatt, eine Prüfung oder ein Quiz.</p>
              <div className="flex gap-3 justify-center">
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                  <Button onClick={() => setActiveView('create')} className="btn-premium"><PlusCircle className="h-4 w-4 mr-2" /> Erstes Material erstellen</Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                  <Button variant="outline" onClick={() => setActiveView('templates')}><LayoutTemplate className="h-4 w-4 mr-2" /> Vorlagen ansehen</Button>
                </motion.div>
              </div>
            </CardContent></Card>
          </div>
        ) : filteredWorksheets.length === 0 ? (
          <motion.div
            className="col-span-full"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 26 }}
          >
            <Card className="glass-card border-0"><CardContent className="py-16 text-center">
              <motion.div
                animate={reduce ? {} : { rotate: [0, -8, 8, -4, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
              >
                <Search className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              </motion.div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Keine Ergebnisse</h3>
              <p className="text-gray-500 mb-4">Versuchen Sie andere Suchbegriffe oder Filter.</p>
              <Button variant="outline" onClick={resetAllFilters}>Filter zurücksetzen</Button>
            </CardContent></Card>
          </motion.div>
        ) : (
          <motion.div
            className="contents"
            variants={gridContainer}
            initial="hidden"
            animate="show"
          >
            <AnimatePresence mode="popLayout">
              {filteredWorksheets.map((worksheet) => (
                <motion.div
                  key={worksheet.id}
                  layout
                  variants={gridItem}
                  exit="exit"
                  whileHover={{ y: -6, transition: { type: 'spring', stiffness: 400, damping: 22 } }}
                >
                  <Card
                    className="glass-card border-0 cursor-pointer h-full flex flex-col hover:shadow-xl transition-shadow group"
                    onClick={() => { setSelectedWorksheet(worksheet); setShowEditorPanel(true); setActiveView('create') }}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base leading-tight line-clamp-2 min-h-[2.5rem] flex-1 group-hover:text-blue-700 transition-colors">{worksheet.title}</CardTitle>
                        <button type="button" onClick={(event) => { event.stopPropagation(); updateMetadata(worksheet, { favorite: !worksheet.favorite }, worksheet.favorite ? 'Aus Favoriten entfernt.' : 'Zu Favoriten hinzugefügt.') }} className="rounded-lg p-1.5 hover:bg-amber-50" aria-label={worksheet.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}><Star className={`h-4 w-4 ${worksheet.favorite ? 'fill-amber-400 text-amber-500' : 'text-gray-300'}`} /></button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <Badge className={`text-[10px] ${worksheet.status === 'ready' ? 'bg-emerald-100 text-emerald-700' : worksheet.status === 'review' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{worksheet.status === 'ready' ? 'Geprüft' : worksheet.status === 'review' ? 'Zu prüfen' : 'Entwurf'}</Badge>
                        <Badge variant="outline" className="text-xs">{worksheet.grade}. Klasse</Badge>
                        <Badge variant="outline" className="text-xs">{worksheet.subject}</Badge>
                        <Badge variant="outline" className="text-xs">{DIFFICULTY_LABELS[worksheet.difficulty] || worksheet.difficulty}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> {worksheet.content?.questions?.length || 0} Fragen</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(worksheet.created_at).toLocaleDateString('de-CH')}</span>
                        <span>v{worksheet.revision || 1}</span>
                      </div>
                      {worksheet.folder || worksheet.tags?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{worksheet.folder ? <Badge variant="secondary" className="text-[10px]"><Folder className="mr-1 h-3 w-3" />{worksheet.folder}</Badge> : null}{(worksheet.tags || []).slice(0, 3).map(tag => <Badge key={tag} variant="outline" className="text-[10px]">#{tag}</Badge>)}</div> : null}
                    </CardContent>
                    <CardFooter className="pt-0">
                      <div className="flex gap-1.5 w-full">
                        <Button size="sm" onClick={(e) => { e.stopPropagation(); setSelectedWorksheet(worksheet); setShowEditorPanel(true); setActiveView('create') }} className="flex-1 text-xs"><Eye className="h-3.5 w-3.5 mr-1" /> Ansehen</Button>
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleExportPDF(worksheet, 'student') }} title="PDF"><Download className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleDup(worksheet) }} title="Duplizieren"><Copy className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openMetadata(worksheet) }} title="Ordner und Tags"><MoreVertical className="h-3.5 w-3.5" /></Button>
                        {showArchived ? <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); updateMetadata(worksheet, { status: 'draft', archived: false }, 'Material wurde wiederhergestellt.') }} title="Wiederherstellen"><ArchiveRestore className="h-3.5 w-3.5" /></Button> : <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); updateMetadata(worksheet, { status: 'archived', archived: true }, 'Material wurde archiviert.') }} title="Archivieren"><Archive className="h-3.5 w-3.5" /></Button>}
                        {showArchived ? <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleDelete(worksheet.id) }} className="text-red-500 hover:text-red-600" title="Endgültig löschen"><Trash2 className="h-3.5 w-3.5" /></Button> : null}
                      </div>
                    </CardFooter>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {!showArchived && filteredStudioPackages.length > 0 ? (
        <section className="mt-8">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-800"><Presentation className="h-5 w-5 text-purple-500" /> Studio-Pakete</h3>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredStudioPackages.map(item => (
              <Card key={item.id} className="flex h-full flex-col border-l-4 border-l-purple-400 bg-white shadow-sm transition hover:shadow-lg">
                <CardHeader className="pb-3"><div className="flex items-start justify-between gap-2"><CardTitle className="line-clamp-2 text-base">{item.title}</CardTitle><Badge className="bg-purple-100 text-purple-700">Studio</Badge></div><div className="mt-2 flex flex-wrap gap-1.5"><Badge variant="outline">{item.subject}</Badge><Badge variant="outline">{item.grade}</Badge>{item.quality?.score ? <Badge className="bg-emerald-100 text-emerald-700">Qualität {item.quality.score}</Badge> : null}</div></CardHeader>
                <CardContent className="flex-1"><p className="text-xs text-gray-500">{item.artifact?.slides?.length || 0} Folien · {item.artifact?.flashcards?.length || 0} Lernkarten · {item.artifact?.quiz?.length || 0} Quizfragen</p><p className="mt-2 text-xs text-gray-400">{new Date(item.updated_at || item.created_at).toLocaleDateString('de-CH')}</p></CardContent>
                <CardFooter className="gap-2"><Button size="sm" className="flex-1" onClick={() => { setSelectedStudioPackage(item); setActiveView('studio') }}><Eye className="mr-1.5 h-3.5 w-3.5" /> Öffnen</Button><Button size="sm" variant="outline" className="text-red-500" onClick={() => deleteStudioPackage(item.id)} aria-label="Studio-Paket löschen"><Trash2 className="h-3.5 w-3.5" /></Button></CardFooter>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Dossier cards */}
      {!showArchived && filteredDossiers.length > 0 && (
        <>
          <motion.h3
            className="text-lg font-semibold text-gray-800 mt-8 mb-4 flex items-center gap-2"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <BookOpen className="h-5 w-5 text-indigo-500" /> Arbeitsdossiers
          </motion.h3>
          <motion.div
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={gridContainer}
            initial="hidden"
            animate="show"
          >
            <AnimatePresence mode="popLayout">
              {filteredDossiers.map((dossier) => (
                <motion.div
                  key={dossier.id}
                  layout
                  variants={gridItem}
                  exit="exit"
                  whileHover={{ y: -6, transition: { type: 'spring', stiffness: 400, damping: 22 } }}
                >
                  <Card
                    className="glass-card border-0 cursor-pointer h-full flex flex-col border-l-4 border-l-indigo-400 hover:shadow-xl transition-shadow group"
                    onClick={() => { setSelectedDossier(dossier); setActiveView('dossier-editor') }}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base leading-tight line-clamp-2 min-h-[2.5rem] flex-1 group-hover:text-indigo-700 transition-colors">{dossier.title}</CardTitle>
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
            </AnimatePresence>
          </motion.div>
        </>
      )}

      <Dialog open={Boolean(metadataMaterial)} onOpenChange={open => { if (!open) setMetadataMaterial(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Material organisieren</DialogTitle><DialogDescription>Ordner und Tags erleichtern die spätere Suche. Änderungen werden direkt gespeichert.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label htmlFor="material-folder">Ordner</Label><Input id="material-folder" className="mt-1.5" value={metadataForm.folder} onChange={event => setMetadataForm(previous => ({ ...previous, folder: event.target.value }))} placeholder="z.B. Natur und Technik" /></div>
            <div><Label htmlFor="material-tags">Tags</Label><Input id="material-tags" className="mt-1.5" value={metadataForm.tags} onChange={event => setMetadataForm(previous => ({ ...previous, tags: event.target.value }))} placeholder="Wasser, Prüfung, Zyklus 2" /><p className="mt-1 text-xs text-gray-400">Mehrere Tags mit Kommas trennen.</p></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setMetadataMaterial(null)}>Abbrechen</Button><Button onClick={saveMetadata}><Tags className="mr-1.5 h-4 w-4" /> Speichern</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
