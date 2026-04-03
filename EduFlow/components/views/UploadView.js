'use client'
import { motion } from 'framer-motion'
import { Button } from '@/ui/button'
import { Label } from '@/ui/label'
import { Card, CardContent } from '@/ui/card'
import { Badge } from '@/ui/badge'
import { Textarea } from '@/ui/textarea'
import { Input } from '@/ui/input'
import {
  Upload, FileType, Info, CheckCircle2, RefreshCw, Sparkles,
  X, ChevronRight, ChevronDown, Check, RotateCcw, Edit, PlusCircle
} from 'lucide-react'
import { useEduFlow } from '@/contexts/EduFlowContext'

const DIFFICULTY_LABELS = { easy: 'Einfach', medium: 'Mittel', hard: 'Schwierig' }

export default function UploadView({ RESOURCE_TYPES, SUBJECTS }) {
  const ctx = useEduFlow()
  const {
    uploadDragOver, setUploadDragOver,
    uploadedFiles, uploadInstructions, setUploadInstructions,
    uploadAnalyzing, uploadAnalysisComplete,
    uploadFileResults, uploadAnalysisResult, uploadStructuredSource,
    fileInputRef,
    handleFileDrop, handleRemoveFile, handleAnalyzeUpload, updateFileResult,
    resetUpload, addMoreFiles,
    setForm, setActiveView, setSuccessMessage,
  } = ctx

  return (
    <motion.div key="upload" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gradient mb-2">Material hochladen</h2>
        <p className="text-gray-600">Laden Sie eigene Dokumente hoch und lassen Sie die KI daraus neue Lernmaterialien erstellen.</p>
      </div>
      <Card className="glass-card border-0"><CardContent className="pt-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm font-semibold text-blue-700">1</div>
            <Label className="text-sm font-semibold">Dateien hochladen</Label>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setUploadDragOver(true) }}
            onDragLeave={() => setUploadDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-smooth ${uploadDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/50'}`}
          >
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.webp,.pptx,.ppt,.mp3,.wav,.m4a,.ogg,.mp4,.xlsx,.xls,.csv,.rtf" onChange={handleFileDrop} className="hidden" />
            <Upload className={`h-12 w-12 mx-auto mb-4 ${uploadDragOver ? 'text-blue-500' : 'text-gray-400'}`} />
            <p className="font-medium text-gray-700 mb-2">{uploadDragOver ? 'Dateien hier ablegen...' : 'Dateien hierher ziehen oder klicken'}</p>
            <p className="text-xs text-gray-500">PDF, Word, PowerPoint, Bilder, Audio, Excel, Text</p>
          </div>
        </div>

        {/* File list */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            {uploadedFiles.map((file, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex items-center gap-3">
                  <FileType className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{file.name}</p>
                    <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleRemoveFile(i)} className="text-gray-400 hover:text-red-500">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Instructions */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm font-semibold text-blue-700">2</div>
            <Label className="text-sm font-semibold">Anweisungen an die KI (optional)</Label>
          </div>
          <Textarea
            placeholder='z.B. "Fokus auf Kapitel 3", "Für 5. Klasse anpassen", "Nur als Inspiration verwenden"...'
            value={uploadInstructions}
            onChange={(e) => setUploadInstructions(e.target.value)}
            className="min-h-[100px]"
          />
          <p className="text-xs text-gray-500 mt-1.5">Teilen Sie der KI mit, wie sie das hochgeladene Material verwenden soll.</p>
        </div>

        {/* Analysis & Generation */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm font-semibold text-blue-700">3</div>
            <Label className="text-sm font-semibold">Material analysieren & generieren</Label>
          </div>

          {uploadAnalysisComplete ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <p className="font-medium text-green-800">
                    Analyse abgeschlossen — {uploadFileResults.filter(r => r.included).length} von {uploadFileResults.length} Datei{uploadFileResults.length > 1 ? 'en' : ''} ausgewählt
                  </p>
                </div>
              </div>

              {/* UX FIX: Action buttons for re-analysis and adding more files */}
              <div className="flex flex-wrap gap-2 p-3 bg-white/60 rounded-lg border border-green-100">
                <Button variant="outline" size="sm" className="text-xs" onClick={addMoreFiles}>
                  <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> Weitere Dateien hinzufügen
                </Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => {
                  handleAnalyzeUpload()
                  setSuccessMessage('Analyse wird erneut durchgeführt...')
                }}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Analyse wiederholen
                </Button>
                <Button variant="outline" size="sm" className="text-xs text-orange-600 hover:text-orange-700" onClick={resetUpload}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Neue Analyse starten
                </Button>
              </div>

              {/* Per-file extraction results */}
              {uploadFileResults.length > 0 && (
                <div className="space-y-3">
                  {uploadFileResults.map((fr, idx) => (
                    <FileResultCard key={idx} fr={fr} idx={idx} updateFileResult={updateFileResult} />
                  ))}

                  {/* Combined summary for multi-file */}
                  {uploadFileResults.length > 1 && (() => {
                    const included = uploadFileResults.filter(r => r.included)
                    const totalChars = included.reduce((sum, r) => sum + (r.correctedText || r.structuredSource?.full_text || '').length, 0)
                    const weakCount = included.filter(r => r.structuredSource?.content_quality === 'weak').length
                    return (
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-700">{included.length} von {uploadFileResults.length} Quellen ausgewählt</p>
                          <p className="text-xs text-gray-500">{totalChars.toLocaleString('de-CH')} Zeichen gesamt</p>
                        </div>
                        {weakCount > 0 && (
                          <p className="text-xs text-orange-600">{weakCount} Quelle{weakCount > 1 ? 'n' : ''} mit schwacher Extraktion — bitte prüfen.</p>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Fallback: single-file result (backwards compat) */}
              {uploadFileResults.length === 0 && uploadAnalysisResult && (
                <div className="bg-white rounded-lg p-4 border border-green-100 space-y-3">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Erkanntes Thema</p>
                    <p className="text-sm font-medium text-gray-900">{uploadAnalysisResult.title}</p>
                  </div>
                  {uploadAnalysisResult.content_summary && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Zusammenfassung</p>
                      <p className="text-sm text-gray-700">{uploadAnalysisResult.content_summary}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {uploadAnalysisResult.subject && <Badge variant="outline" className="text-xs">{uploadAnalysisResult.subject}</Badge>}
                    {uploadAnalysisResult.grade_suggestion && <Badge variant="outline" className="text-xs">{uploadAnalysisResult.grade_suggestion}. Klasse empfohlen</Badge>}
                  </div>
                </div>
              )}

              <p className="text-sm text-green-700 font-medium">Wählen Sie nun, was daraus erstellt werden soll:</p>
              <div className="flex flex-wrap gap-2">
                {RESOURCE_TYPES.map(rt => {
                  const included = uploadFileResults.filter(r => r.included && r.analysis)
                  const firstAnalysis = included[0]?.analysis || uploadAnalysisResult || {}
                  const allTopics = [...new Set(included.flatMap(r => r.analysis?.key_topics || []))]
                  const topicText = included.length > 1
                    ? included.map(r => r.correctedTitle || r.analysis?.title || r.fileName).join('; ')
                    : (firstAnalysis.title || uploadedFiles.map(f => f.name).join(', '))
                  const topicsStr = allTopics.join(', ')
                  const suggestedType = firstAnalysis.material_type_suggestion || 'worksheet'
                  const suggestedSubject = included.length === 1 ? (included[0]?.correctedSubject || firstAnalysis.subject) : firstAnalysis.subject
                  const suggestedGrade = included.length === 1 ? (included[0]?.correctedGrade || firstAnalysis.grade_suggestion) : firstAnalysis.grade_suggestion

                  return (
                    <Button key={rt.id} variant={rt.id === suggestedType ? 'default' : 'outline'} size="sm" onClick={() => {
                      setForm(prev => ({
                        ...prev,
                        resourceType: rt.id,
                        topic: topicText + (topicsStr ? ` – Schwerpunkte: ${topicsStr}` : '') + (uploadInstructions ? ` – ${uploadInstructions}` : ''),
                        subject: suggestedSubject && SUBJECTS.includes(suggestedSubject) ? suggestedSubject : prev.subject,
                        grade: suggestedGrade || prev.grade,
                        difficulty: firstAnalysis.difficulty_suggestion || prev.difficulty,
                      }))
                      setActiveView('create')
                    }}>
                      <rt.icon className="h-4 w-4 mr-1.5" /> {rt.label} erstellen
                    </Button>
                  )
                })}
              </div>
            </div>
          ) : (
            <Button className="w-full btn-premium" disabled={uploadedFiles.length === 0 || uploadAnalyzing} onClick={handleAnalyzeUpload}>
              {uploadAnalyzing ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Wird analysiert... ({uploadFileResults.filter(r => !r.analyzing).length}/{uploadedFiles.length})</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> {uploadedFiles.length === 0 ? 'Zuerst Dateien hochladen' : `${uploadedFiles.length} Datei${uploadedFiles.length > 1 ? 'en' : ''} analysieren`}</>
              )}
            </Button>
          )}
        </div>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-800 mb-1">Unterstützte Formate</p>
              <ul className="text-xs text-blue-700 space-y-1">
                <li><strong>Dokumente:</strong> PDF, Word (.docx/.doc), PowerPoint (.pptx), Excel, Text</li>
                <li><strong>Bilder:</strong> PNG, JPG, GIF, WebP</li>
                <li><strong>Audio:</strong> MP3, WAV, M4A, OGG</li>
                <li>Die KI analysiert den Inhalt und erstellt daraus passende Lernmaterialien.</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent></Card>
    </motion.div>
  )
}

// Per-file result card component
function FileResultCard({ fr, idx, updateFileResult }) {
  const quality = fr.structuredSource?.content_quality
  const qualityColor = quality === 'good' ? 'border-green-300 text-green-700' : quality === 'partial' ? 'border-yellow-300 text-yellow-700' : 'border-red-300 text-red-700'
  const qualityLabel = quality === 'good' ? 'Vollständig' : quality === 'partial' ? 'Teilweise' : 'Schwach'
  const isEditing = fr._editing
  const displayTitle = fr.correctedTitle || fr.analysis?.title || fr.fileName
  const displaySubject = fr.correctedSubject || fr.analysis?.subject || ''
  const displayGrade = fr.correctedGrade || fr.analysis?.grade_suggestion || ''
  const charCount = (fr.correctedText || fr.structuredSource?.full_text || '').length

  return (
    <div className={`bg-white rounded-lg border transition-all ${fr.included ? 'border-green-200' : 'border-gray-200 opacity-60'}`}>
      {/* File header */}
      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => updateFileResult(idx, { collapsed: !fr.collapsed })}>
        <button onClick={(e) => { e.stopPropagation(); updateFileResult(idx, { included: !fr.included }) }}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${fr.included ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 bg-white'}`}>
          {fr.included && <Check className="h-3 w-3" />}
        </button>
        <FileType className="h-4 w-4 text-blue-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{displayTitle}</p>
          <p className="text-xs text-gray-500">{fr.fileName} {charCount > 0 ? `${charCount.toLocaleString('de-CH')} Zeichen` : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {fr.analyzing && <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />}
          {quality && <Badge variant="outline" className={`text-[10px] ${qualityColor}`}>{qualityLabel}</Badge>}
          {displaySubject && <Badge variant="outline" className="text-[10px]">{displaySubject}</Badge>}
          {fr.collapsed ? <ChevronRight className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </div>

      {/* Expanded detail */}
      {!fr.collapsed && fr.analysis && (
        <div className="px-3 pb-3 border-t border-gray-100 space-y-3">
          {fr.analysis.content_summary && (
            <div className="pt-3">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Zusammenfassung</p>
              <p className="text-sm text-gray-700">{fr.analysis.content_summary}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {displaySubject && <Badge variant="outline" className="text-xs">{displaySubject}</Badge>}
            {displayGrade && <Badge variant="outline" className="text-xs">{displayGrade}. Klasse</Badge>}
            {fr.analysis.difficulty_suggestion && <Badge variant="outline" className="text-xs">{DIFFICULTY_LABELS[fr.analysis.difficulty_suggestion] || fr.analysis.difficulty_suggestion}</Badge>}
          </div>
          {fr.analysis.key_topics?.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Erkannte Themen</p>
              <div className="flex flex-wrap gap-1.5">
                {fr.analysis.key_topics.map((topic, i) => (
                  <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{topic}</span>
                ))}
              </div>
            </div>
          )}

          {/* Edit / Reset controls */}
          {!isEditing ? (
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="text-xs" onClick={() => updateFileResult(idx, { _editing: true, _editTitle: displayTitle, _editSubject: displaySubject, _editGrade: displayGrade, _editText: fr.correctedText || fr.structuredSource?.full_text || '' })}>
                <Edit className="h-3 w-3 mr-1" /> Bearbeiten
              </Button>
              {(fr.correctedText !== null || fr.correctedTitle !== null) && (
                <Button variant="outline" size="sm" className="text-xs text-orange-600 hover:text-orange-700" onClick={() => updateFileResult(idx, { correctedText: null, correctedTitle: null, correctedSubject: null, correctedGrade: null })}>
                  <RotateCcw className="h-3 w-3 mr-1" /> Zurücksetzen
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs text-gray-500">Titel</Label><Input value={fr._editTitle || ''} onChange={(e) => updateFileResult(idx, { _editTitle: e.target.value })} className="text-sm h-8" /></div>
                <div><Label className="text-xs text-gray-500">Fach</Label><Input value={fr._editSubject || ''} onChange={(e) => updateFileResult(idx, { _editSubject: e.target.value })} className="text-sm h-8" /></div>
                <div><Label className="text-xs text-gray-500">Klasse</Label><Input value={fr._editGrade || ''} onChange={(e) => updateFileResult(idx, { _editGrade: e.target.value })} className="text-sm h-8" /></div>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Extrahierter Text</Label>
                <Textarea value={fr._editText || ''} onChange={(e) => updateFileResult(idx, { _editText: e.target.value })} className="text-sm min-h-[120px] font-mono" />
                <p className="text-xs text-gray-400 mt-1">{(fr._editText || '').length.toLocaleString('de-CH')} Zeichen</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="text-xs" onClick={() => updateFileResult(idx, { correctedTitle: fr._editTitle, correctedSubject: fr._editSubject, correctedGrade: fr._editGrade, correctedText: fr._editText, _editing: false, _editTitle: undefined, _editSubject: undefined, _editGrade: undefined, _editText: undefined })}>
                  <Check className="h-3 w-3 mr-1" /> Übernehmen
                </Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => updateFileResult(idx, { _editing: false, _editTitle: undefined, _editSubject: undefined, _editGrade: undefined, _editText: undefined })}>
                  Abbrechen
                </Button>
              </div>
            </div>
          )}

          {quality === 'weak' && (
            <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg border border-red-100">
              <Info className="h-4 w-4 text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700">Schwache Extraktion — bitte manuell prüfen oder ergänzen.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
