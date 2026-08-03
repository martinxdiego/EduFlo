'use client'

import { useState } from 'react'
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
  UploadCloud
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
  const { token, setError, setSuccessMessage } = useEduFlow()
  const [form, setForm] = useState(DEFAULT_FORM)
  const [artifact, setArtifact] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [generating, setGenerating] = useState(false)
  const [exportingPptx, setExportingPptx] = useState(false)
  const [exportingAudio, setExportingAudio] = useState(false)
  const [localError, setLocalError] = useState('')
  const [notice, setNotice] = useState('')

  const updateForm = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const generateStudio = async (event) => {
    event.preventDefault()
    setGenerating(true)
    setLocalError('')
    setNotice('')
    setError('')

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
      setActiveTab('overview')
      if (data.warning) {
        setNotice(data.warning)
        setSuccessMessage('Studio-Ersatzpaket erstellt.')
      } else {
        setSuccessMessage(`Studio-Paket mit ${data.model} erstellt.`)
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

      downloadBlob(await response.blob(), slug(artifact.title, 'wav'))
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
            <Badge variant="outline" className="bg-white text-blue-700 border-blue-200">Google Gemini</Badge>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Studio</h1>
          <p className="text-sm text-gray-500 mt-1">Quellen rein, Unterrichtspaket raus.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportPptx} disabled={!artifact || exportingPptx}>
            {exportingPptx ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Presentation className="h-4 w-4 mr-2" />}
            PPTX
          </Button>
          <Button variant="outline" onClick={exportAudio} disabled={!artifact?.audioScript || exportingAudio}>
            {exportingAudio ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <AudioLines className="h-4 w-4 mr-2" />}
            Audio
          </Button>
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
              </div>

              <Button type="submit" disabled={generating || form.sourceText.trim().length < 20} className="w-full btn-premium">
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
                <TabsTrigger value="slides">Folien</TabsTrigger>
                <TabsTrigger value="cards">Karten</TabsTrigger>
                <TabsTrigger value="audio">Audio</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <Card className="glass-card border-0">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpenCheck className="h-5 w-5 text-blue-500" />
                      {artifact.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <p className="text-sm leading-7 text-gray-700 whitespace-pre-wrap">{artifact.summary}</p>
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
                    <p className="text-sm leading-7 text-gray-700 whitespace-pre-wrap">{artifact.teachingNotes || 'Keine Notizen vorhanden.'}</p>
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
                    <p className="text-sm leading-7 text-gray-700 whitespace-pre-wrap">{artifact.audioScript || 'Kein Audio-Skript vorhanden.'}</p>
                    <Button onClick={exportAudio} disabled={!artifact.audioScript || exportingAudio}>
                      {exportingAudio ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                      WAV erstellen
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
