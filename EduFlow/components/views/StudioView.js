'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Textarea } from '@/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Badge } from '@/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Alert, AlertDescription } from '@/ui/alert'
import {
  AudioLines,
  BookOpenCheck,
  Download,
  FileSliders,
  Layers3,
  Loader2,
  MessageSquareText,
  Presentation,
  Sparkles,
  UploadCloud,
  Check,
  Edit3,
  Save,
  Library,
  PackageCheck
} from 'lucide-react'
import { useEduFlow } from '@/contexts/EduFlowContext'

const SUBJECTS = [
  'Deutsch',
  'Mathematik',
  'NMG',
  'Englisch',
  'Französisch',
  'RZG',
  'Natur und Technik',
  'Medien und Informatik',
  'Bildnerisches Gestalten',
  'Musik',
  'Bewegung und Sport'
]

const DEFAULT_FORM = {
  title: '',
  subject: 'Deutsch',
  grade: '5. Klasse',
  mode: 'full',
  sourceText: ''
}

const OUTPUT_OPTIONS = [
  { id: 'slides', label: 'Folien' },
  { id: 'cards', label: 'Lernkarten & Quiz' },
  { id: 'audio', label: 'Audio' },
]

const PRESETS = [
  { id: 'lesson', label: 'Unterrichtslektion', mode: 'Aktivierung, Erarbeitung, Anwendung und Sicherung' },
  { id: 'review', label: 'Prüfungsvorbereitung', mode: 'Kernwissen, typische Fehler, Lernkarten und anspruchsvolles Quiz' },
  { id: 'substitute', label: 'Vertretungslektion', mode: 'Selbsterklärend, klar getaktet und ohne Vorwissen der Lehrperson einsetzbar' },
]

const GENERATION_STAGES = ['Quelle wird analysiert', 'Lernziele werden abgeleitet', 'Medien werden erstellt', 'Inhalte werden qualitätsgeprüft']

function slug(value, extension) {
  const base = String(value || 'eduflow-studio')
    .toLowerCase()
    .replace(/[^a-z0-9äöüéèàç]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'eduflow-studio'
  return `${base}.${extension}`
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 250)
}

async function readError(response, fallback) {
  const data = await response.json().catch(() => ({}))
  return data.error || data.details || fallback
}

function ListBlock({ items, empty = 'Noch keine Inhalte.' }) {
  if (!items?.length) {
    return <p className="text-sm text-gray-400">{empty}</p>
  }

  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2 text-sm text-gray-700">
          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function StudioView() {
  const { token, setError, setSuccessMessage, setActiveView, worksheets, fetchStudioPackages, selectedStudioPackage, setSelectedStudioPackage } = useEduFlow()
  const [form, setForm] = useState(DEFAULT_FORM)
  const [artifact, setArtifact] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [generating, setGenerating] = useState(false)
  const [exportingPptx, setExportingPptx] = useState(false)
  const [exportingAudio, setExportingAudio] = useState(false)
  const [localError, setLocalError] = useState('')
  const [notice, setNotice] = useState('')
  const [outputs, setOutputs] = useState(['slides', 'cards', 'audio'])
  const [generationStage, setGenerationStage] = useState(0)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [quality, setQuality] = useState(null)
  const [packageId, setPackageId] = useState(null)

  useEffect(() => {
    if (!generating) return
    setGenerationStage(0)
    const timer = setInterval(() => setGenerationStage(current => Math.min(GENERATION_STAGES.length - 1, current + 1)), 2400)
    return () => clearInterval(timer)
  }, [generating])

  useEffect(() => {
    if (!selectedStudioPackage?.artifact) return
    setArtifact(selectedStudioPackage.artifact)
    setQuality(selectedStudioPackage.quality || null)
    setOutputs(selectedStudioPackage.outputs?.length ? selectedStudioPackage.outputs : ['slides', 'cards', 'audio'])
    setPackageId(selectedStudioPackage.id)
    setForm(previous => ({ ...previous, title: selectedStudioPackage.title || '', subject: selectedStudioPackage.subject || previous.subject, grade: selectedStudioPackage.grade || previous.grade }))
    setSelectedStudioPackage(null)
  }, [selectedStudioPackage, setSelectedStudioPackage])

  useEffect(() => {
    const uploadedSource = sessionStorage.getItem('eduflow_studio_source')
    if (!uploadedSource) return
    setForm(previous => previous.sourceText ? previous : { ...previous, sourceText: uploadedSource })
    sessionStorage.removeItem('eduflow_studio_source')
  }, [])

  const updateForm = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const toggleOutput = id => setOutputs(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id])

  const useWorksheetSource = worksheetId => {
    const worksheet = worksheets.find(item => item.id === worksheetId)
    if (!worksheet) return
    const questions = (worksheet.content?.questions || []).map(item => `${item.question}\nMusterlösung: ${item.answer || '–'}`).join('\n\n')
    setForm(previous => ({ ...previous, title: worksheet.title, grade: `${worksheet.grade}. Klasse`, subject: worksheet.subject, sourceText: `${worksheet.topic || worksheet.title}\n\n${questions}` }))
  }

  const savePackage = async (nextArtifact, silent = false, targetPackageId = packageId) => {
    if (!nextArtifact) return null
    setSaving(true)
    try {
      const response = await fetch('/api/studio/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ id: targetPackageId, artifact: nextArtifact, subject: form.subject, grade: form.grade, outputs }),
      })
      if (!response.ok) throw new Error(await readError(response, 'Studio-Paket konnte nicht gespeichert werden.'))
      const saved = await response.json()
      setPackageId(saved.id)
      await fetchStudioPackages(token)
      if (!silent) setSuccessMessage('Studio-Paket wurde in der Bibliothek gespeichert.')
      return saved
    } catch (error) {
      setLocalError(error.message)
      return null
    } finally {
      setSaving(false)
    }
  }

  const updateArtifact = (field, value) => setArtifact(previous => ({ ...previous, [field]: value }))

  const generateStudio = async (event) => {
    event.preventDefault()
    setGenerating(true)
    setLocalError('')
    setNotice('')
    setError('')
    setPackageId(null)

    try {
      const response = await fetch('/api/studio/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(form)
      })

      if (!response.ok) {
        throw new Error(await readError(response, 'Studio-Generierung fehlgeschlagen.'))
      }

      const data = await response.json()
      setArtifact(data.artifact)
      setQuality(data.quality || null)
      setActiveTab('overview')
      await savePackage(data.artifact, true, null)
      if (data.warning) {
        setNotice(data.warning)
        setSuccessMessage('Studio-Ersatzpaket erstellt.')
      } else {
        setSuccessMessage('Studio-Paket erstellt und in der Bibliothek gespeichert.')
      }
    } catch (error) {
      const message = error.message || 'Studio-Generierung fehlgeschlagen.'
      setLocalError(message)
      setError(message)
    } finally {
      setGenerating(false)
    }
  }

  const exportPptx = async () => {
    if (!artifact) return
    setExportingPptx(true)
    setLocalError('')
    setError('')

    try {
      const response = await fetch('/api/studio/pptx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ artifact })
      })

      if (!response.ok) {
        throw new Error(await readError(response, 'PowerPoint-Export fehlgeschlagen.'))
      }

      downloadBlob(await response.blob(), slug(artifact.title, 'pptx'))
      setSuccessMessage('PowerPoint wurde erstellt.')
    } catch (error) {
      const message = error.message || 'PowerPoint-Export fehlgeschlagen.'
      setLocalError(message)
      setError(message)
    } finally {
      setExportingPptx(false)
    }
  }

  const exportAudio = async () => {
    if (!artifact?.audioScript) return
    setExportingAudio(true)
    setLocalError('')
    setError('')

    try {
      const response = await fetch('/api/studio/audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text: artifact.audioScript,
          title: artifact.title
        })
      })

      if (!response.ok) {
        throw new Error(await readError(response, 'Audio-Export fehlgeschlagen.'))
      }

      downloadBlob(await response.blob(), slug(artifact.title, 'mp3'))
      setSuccessMessage('Audio wurde erstellt.')
    } catch (error) {
      const message = error.message || 'Audio-Export fehlgeschlagen.'
      setLocalError(message)
      setError(message)
    } finally {
      setExportingAudio(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-blue-600" />
            </div>
            <Badge variant="outline" className="bg-white text-blue-700 border-blue-200">Unterrichtsmedien</Badge>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Studio</h1>
          <p className="text-sm text-gray-500 mt-1">Aus einer Quelle entstehen editierbare Folien, Lernkarten, Quiz und Audio.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {artifact ? <Button variant="outline" onClick={() => setEditing(current => !current)}><Edit3 className="h-4 w-4 mr-2" />{editing ? 'Vorschau' : 'Bearbeiten'}</Button> : null}
          {artifact ? <Button variant="outline" onClick={() => savePackage(artifact)} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Speichern</Button> : null}
          <Button variant="outline" onClick={exportPptx} disabled={!artifact || exportingPptx}>
            {exportingPptx ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Presentation className="h-4 w-4 mr-2" />}
            PPTX
          </Button>
          <Button variant="outline" onClick={exportAudio} disabled={!artifact?.audioScript || exportingAudio}>
            {exportingAudio ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <AudioLines className="h-4 w-4 mr-2" />}
            Audio
          </Button>
          {artifact ? <Button onClick={() => setActiveView('library')}><Library className="h-4 w-4 mr-2" /> Bibliothek</Button> : null}
        </div>
      </div>

      {localError && (
        <Alert variant="destructive">
          <AlertDescription>{localError}</AlertDescription>
        </Alert>
      )}

      {notice && (
        <Alert className="bg-amber-50 border-amber-200 text-amber-900">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6">
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UploadCloud className="h-5 w-5 text-blue-500" />
              Quellen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={generateStudio} className="space-y-4">
              <div>
                <Label>Vorlage</Label>
                <div className="mt-2 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                  {PRESETS.map(preset => <button type="button" key={preset.id} onClick={() => updateForm('mode', preset.mode)} className={`rounded-xl border p-3 text-left text-xs font-semibold transition ${form.mode === preset.mode ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-blue-200'}`}>{preset.label}</button>)}
                </div>
              </div>

              {worksheets.length > 0 ? <div><Label>Quelle aus der Bibliothek</Label><Select onValueChange={useWorksheetSource}><SelectTrigger className="mt-2"><SelectValue placeholder="Material auswählen…" /></SelectTrigger><SelectContent>{worksheets.slice(0, 30).map(item => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent></Select></div> : null}

              <div>
                <Label>Gewünschte Ausgaben</Label>
                <div className="mt-2 flex flex-wrap gap-2">{OUTPUT_OPTIONS.map(option => <button type="button" key={option.id} onClick={() => toggleOutput(option.id)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${outputs.includes(option.id) ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}>{outputs.includes(option.id) ? <Check className="h-3 w-3" /> : null}{option.label}</button>)}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
                <div>
                  <Label>Titel</Label>
                  <Input value={form.title} onChange={(event) => updateForm('title', event.target.value)} placeholder="z.B. Photosynthese kompakt" className="mt-2" />
                </div>
                <div>
                  <Label>Stufe</Label>
                  <Input value={form.grade} onChange={(event) => updateForm('grade', event.target.value)} placeholder="z.B. 7. Klasse" className="mt-2" />
                </div>
              </div>

              <div>
                <Label>Fach</Label>
                <Select value={form.subject} onValueChange={(value) => updateForm('subject', value)}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map(subject => (
                      <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Quellentext</Label>
                <Textarea
                  value={form.sourceText}
                  onChange={(event) => updateForm('sourceText', event.target.value)}
                  placeholder="Text, Notizen, Transkript oder Auszug einfügen..."
                  className="mt-2 min-h-[320px] resize-y"
                  required
                />
                <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setActiveView('upload')}><UploadCloud className="h-4 w-4 mr-2" /> PDF, Word, Bild oder Audio analysieren</Button>
              </div>

              {generating ? <div className="rounded-xl border border-blue-100 bg-blue-50 p-3"><div className="flex items-center gap-2 text-sm font-semibold text-blue-800"><Loader2 className="h-4 w-4 animate-spin" />{GENERATION_STAGES[generationStage]}</div><div className="mt-3 grid grid-cols-4 gap-1">{GENERATION_STAGES.map((_, index) => <span key={index} className={`h-1 rounded-full ${index <= generationStage ? 'bg-blue-500' : 'bg-blue-100'}`} />)}</div><p className="mt-2 text-xs text-blue-600">Das Paket wird danach automatisch gespeichert.</p></div> : null}

              <Button type="submit" disabled={generating || form.sourceText.trim().length < 20 || outputs.length === 0} className="w-full btn-premium">
                {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Studio-Paket erstellen
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="min-w-0">
          {!artifact ? (
            <Card className="glass-card border-0 h-full min-h-[560px]">
              <CardContent className="h-full min-h-[560px] flex items-center justify-center text-center">
                <div>
                  <Layers3 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700">Noch kein Studio-Paket</h3>
                  <p className="text-sm text-gray-400 mt-1">Füge Quellen ein und starte die Generierung.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="bg-white border border-gray-200 shadow-sm flex flex-wrap h-auto justify-start">
                <TabsTrigger value="overview">Übersicht</TabsTrigger>
                {outputs.includes('slides') ? <TabsTrigger value="slides">Folien</TabsTrigger> : null}
                {outputs.includes('cards') ? <TabsTrigger value="cards">Karten</TabsTrigger> : null}
                {outputs.includes('audio') ? <TabsTrigger value="audio">Audio</TabsTrigger> : null}
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <Card className="glass-card border-0">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <BookOpenCheck className="h-5 w-5 text-blue-500" />
                      {artifact.title}
                      {quality ? <Badge className="ml-auto bg-emerald-100 text-emerald-700"><PackageCheck className="mr-1 h-3 w-3" /> Qualität {quality.score}</Badge> : null}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {editing ? <Textarea value={artifact.summary} onChange={event => updateArtifact('summary', event.target.value)} className="min-h-28" aria-label="Zusammenfassung bearbeiten" /> : <p className="text-sm leading-7 text-gray-700 whitespace-pre-wrap">{artifact.summary}</p>}
                    <div className="grid md:grid-cols-2 gap-5">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Kernaussagen</h3>
                        <ListBlock items={artifact.keyPoints} />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Lernziele</h3>
                        <ListBlock items={artifact.learningGoals} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card border-0">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MessageSquareText className="h-5 w-5 text-blue-500" />
                      Unterrichtsnotizen
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {editing ? <Textarea value={artifact.teachingNotes || ''} onChange={event => updateArtifact('teachingNotes', event.target.value)} className="min-h-36" aria-label="Unterrichtsnotizen bearbeiten" /> : <p className="text-sm leading-7 text-gray-700 whitespace-pre-wrap">{artifact.teachingNotes || 'Keine Notizen vorhanden.'}</p>}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="slides" className="space-y-3">
                {artifact.slides?.map((slide, index) => (
                  <Card key={`${slide.title}-${index}`} className="glass-card border-0">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileSliders className="h-4 w-4 text-blue-500" />
                        {index + 1}. {slide.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ListBlock items={slide.bullets} />
                      {slide.speakerNotes && (
                        <p className="text-xs leading-6 text-gray-500 bg-gray-50 rounded-lg p-3">{slide.speakerNotes}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="cards" className="space-y-4">
                <div className="grid md:grid-cols-2 gap-3">
                  {artifact.flashcards?.map((card, index) => (
                    <Card key={`${card.front}-${index}`} className="border-gray-200">
                      <CardContent className="p-4 space-y-3">
                        <p className="text-sm font-semibold text-gray-900">{card.front}</p>
                        <p className="text-sm text-gray-600 leading-6">{card.back}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card className="glass-card border-0">
                  <CardHeader>
                    <CardTitle className="text-base">Quiz</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {artifact.quiz?.map((item, index) => (
                      <div key={`${item.question}-${index}`} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                        <p className="text-sm font-semibold text-gray-900 mb-2">{index + 1}. {item.question}</p>
                        <ListBlock items={item.options} empty="Keine Optionen." />
                        <p className="text-xs text-green-700 mt-3">Antwort: {item.answer}</p>
                        {item.explanation && <p className="text-xs text-gray-500 mt-1">{item.explanation}</p>}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="audio">
                <Card className="glass-card border-0">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AudioLines className="h-5 w-5 text-blue-500" />
                      Audio-Skript
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {editing ? <Textarea value={artifact.audioScript || ''} onChange={event => updateArtifact('audioScript', event.target.value)} className="min-h-64" aria-label="Audio-Skript bearbeiten" /> : <p className="text-sm leading-7 text-gray-700 whitespace-pre-wrap">{artifact.audioScript || 'Kein Audio-Skript vorhanden.'}</p>}
                    <Button onClick={exportAudio} disabled={!artifact.audioScript || exportingAudio}>
                      {exportingAudio ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                      MP3 erstellen
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  )
}

export default StudioView
