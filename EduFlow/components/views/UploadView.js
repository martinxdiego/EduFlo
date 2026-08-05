'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/ui/button'
import { Label } from '@/ui/label'
import { Card, CardContent } from '@/ui/card'
import { Badge } from '@/ui/badge'
import { Textarea } from '@/ui/textarea'
import { Input } from '@/ui/input'
import {
  Upload, FileType, Info, CheckCircle2, RefreshCw, Sparkles,
  X, ChevronRight, ChevronDown, Check, RotateCcw, Edit, PlusCircle,
  Camera, Image, SwitchCamera, Trash2, ZoomIn
} from 'lucide-react'
import { useEduFlow } from '@/contexts/EduFlowContext'

const DIFFICULTY_LABELS = { easy: 'Einfach', medium: 'Mittel', hard: 'Schwierig' }

// Compress image client-side before upload
function compressImage(file, maxWidth = 2000, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let w = img.width, h = img.height
      if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth }
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      // White background (for transparency)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob((blob) => {
        const compressed = new File([blob], file.name || `foto_${Date.now()}.jpg`, { type: 'image/jpeg' })
        resolve(compressed)
      }, 'image/jpeg', quality)
    }
    img.src = url
  })
}

export default function UploadView({ RESOURCE_TYPES, SUBJECTS }) {
  const ctx = useEduFlow()
  const {
    uploadDragOver, setUploadDragOver,
    uploadedFiles, uploadInstructions, setUploadInstructions,
    uploadAnalyzing, uploadAnalysisComplete,
    uploadFileResults, uploadAnalysisResult, uploadStructuredSource,
    fileInputRef,
    handleFileDrop, handleRemoveFile, handleAnalyzeUpload, handleReAnalyze, updateFileResult,
    resetUpload, addMoreFiles, getCombinedSourceText,
    setForm, setActiveView, setSuccessMessage,
  } = ctx

  // Camera state
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)
  const [capturedPhotos, setCapturedPhotos] = useState([])
  const [previewPhoto, setPreviewPhoto] = useState(null)
  const [facingMode, setFacingMode] = useState('environment')
  const [cameraError, setCameraError] = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const cameraInputRef = useRef(null)

  // Start camera
  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      const constraints = { video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      setCameraStream(stream)
      setCameraOpen(true)
      // Attach stream to video element after render
      setTimeout(() => {
        if (videoRef.current) { videoRef.current.srcObject = stream }
      }, 100)
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setCameraError('Kamera-Zugriff wurde verweigert. Bitte erlauben Sie den Zugriff in den Browser-Einstellungen.')
      } else if (err.name === 'NotFoundError') {
        setCameraError('Keine Kamera gefunden. Nutzen Sie alternativ die Datei-Upload-Funktion.')
      } else {
        setCameraError('Kamera konnte nicht gestartet werden. Nutzen Sie alternativ den Datei-Upload.')
      }
    }
  }, [facingMode])

  // Stop camera
  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop())
      setCameraStream(null)
    }
    setCameraOpen(false)
  }, [cameraStream])

  // Switch camera (front/back)
  const switchCamera = useCallback(() => {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()) }
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment')
  }, [cameraStream])

  // Restart camera when facingMode changes
  useEffect(() => {
    if (cameraOpen && !cameraStream) { startCamera() }
  }, [facingMode, cameraOpen, cameraStream, startCamera])

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()) }
    }
  }, [cameraStream])

  // Capture photo from video stream
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx2d = canvas.getContext('2d')
    ctx2d.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      const photoUrl = URL.createObjectURL(blob)
      const file = new File([blob], `foto_${Date.now()}.jpg`, { type: 'image/jpeg' })
      setCapturedPhotos(prev => [...prev, { url: photoUrl, file, timestamp: Date.now() }])
    }, 'image/jpeg', 0.92)
  }, [])

  // Handle native camera input (mobile fallback)
  const handleCameraInput = useCallback(async (e) => {
    const files = Array.from(e.target.files || [])
    for (const file of files) {
      const compressed = await compressImage(file)
      const photoUrl = URL.createObjectURL(compressed)
      setCapturedPhotos(prev => [...prev, { url: photoUrl, file: compressed, timestamp: Date.now() }])
    }
    e.target.value = ''
  }, [])

  // Remove captured photo
  const removePhoto = useCallback((idx) => {
    setCapturedPhotos(prev => {
      const updated = [...prev]
      URL.revokeObjectURL(updated[idx].url)
      updated.splice(idx, 1)
      return updated
    })
  }, [])

  // Add captured photos to upload pipeline
  const addPhotosToUpload = useCallback(async () => {
    if (capturedPhotos.length === 0) return

    // Compress all photos
    const compressedFiles = await Promise.all(
      capturedPhotos.map(p => compressImage(p.file))
    )

    // Create a synthetic event for handleFileDrop
    const dataTransfer = new DataTransfer()
    compressedFiles.forEach(f => dataTransfer.items.add(f))
    const syntheticEvent = { preventDefault: () => {}, target: { files: dataTransfer.files } }
    handleFileDrop(syntheticEvent)

    // Cleanup
    capturedPhotos.forEach(p => URL.revokeObjectURL(p.url))
    setCapturedPhotos([])
    stopCamera()
    setSuccessMessage(`${compressedFiles.length} Foto${compressedFiles.length > 1 ? 's' : ''} hinzugefügt!`)
  }, [capturedPhotos, handleFileDrop, stopCamera, setSuccessMessage])

  return (
    <motion.div key="upload" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-3xl mx-auto">
      <div className="mb-8">
        <motion.h2
          className="text-3xl font-bold text-gradient mb-2 inline-block"
          style={{ backgroundSize: '200% 100%' }}
          animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        >
          Material hochladen
        </motion.h2>
        <p className="text-gray-600">Laden Sie eigene Dokumente hoch und lassen Sie die KI daraus neue Lernmaterialien erstellen.</p>
      </div>
      <Card className="glass-card border-0"><CardContent className="pt-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm font-semibold text-blue-700">1</div>
            <Label className="text-sm font-semibold">Material fotografieren oder hochladen</Label>
          </div>

          {/* Camera Section */}
          <div className="mb-4">
            {!cameraOpen ? (
              <div className="flex gap-3">
                <motion.button
                  onClick={startCamera}
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                  className="flex-1 flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-dashed border-purple-300 bg-gradient-to-br from-purple-50 to-blue-50 hover:border-purple-400 hover:from-purple-100 hover:to-blue-100 transition-colors cursor-pointer group"
                >
                  <motion.div
                    className="w-14 h-14 rounded-2xl bg-purple-100 group-hover:bg-purple-200 flex items-center justify-center transition-colors"
                    whileHover={{ rotate: [0, -8, 8, -4, 0] }}
                    transition={{ duration: 0.5 }}
                  >
                    <Camera className="h-7 w-7 text-purple-600" />
                  </motion.div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-800 text-sm">Foto aufnehmen</p>
                    <p className="text-xs text-gray-500 mt-0.5">Buchseiten, Arbeitsblätter, Notizen abfotografieren</p>
                  </div>
                </motion.button>
                {/* Native camera input fallback for mobile */}
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleCameraInput} />
                <motion.button
                  onClick={() => cameraInputRef.current?.click()}
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                  className="flex-1 flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-dashed border-blue-300 bg-gradient-to-br from-blue-50 to-cyan-50 hover:border-blue-400 hover:from-blue-100 hover:to-cyan-100 transition-colors cursor-pointer group"
                >
                  <motion.div
                    className="w-14 h-14 rounded-2xl bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center transition-colors"
                    whileHover={{ rotate: [0, -8, 8, -4, 0] }}
                    transition={{ duration: 0.5 }}
                  >
                    <Image className="h-7 w-7 text-blue-600" />
                  </motion.div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-800 text-sm">Aus Galerie wählen</p>
                    <p className="text-xs text-gray-500 mt-0.5">Bereits gespeicherte Fotos oder Screenshots</p>
                  </div>
                </motion.button>
              </div>
            ) : (
              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl overflow-hidden border-2 border-purple-300 bg-black">
                {/* Live camera view */}
                <div className="relative">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-[400px] object-cover" />
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Camera controls overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
                    <div className="flex items-center justify-center gap-6">
                      <button onClick={switchCamera} className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors" title="Kamera wechseln">
                        <SwitchCamera className="h-5 w-5 text-white" />
                      </button>
                      <button onClick={capturePhoto} className="w-16 h-16 rounded-full bg-white hover:bg-gray-100 flex items-center justify-center transition-all shadow-lg hover:scale-105 active:scale-95" title="Foto aufnehmen">
                        <div className="w-12 h-12 rounded-full border-4 border-purple-500" />
                      </button>
                      <button onClick={stopCamera} className="w-10 h-10 rounded-full bg-white/20 hover:bg-red-500/60 flex items-center justify-center transition-colors" title="Kamera schliessen">
                        <X className="h-5 w-5 text-white" />
                      </button>
                    </div>
                  </div>

                  {/* Photo counter badge */}
                  {capturedPhotos.length > 0 && (
                    <div className="absolute top-4 right-4 bg-purple-600 text-white text-sm font-bold px-3 py-1 rounded-full shadow-lg">
                      {capturedPhotos.length} Foto{capturedPhotos.length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Camera error */}
            {cameraError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                <Info className="h-4 w-4 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700">{cameraError}</p>
              </div>
            )}

            {/* Captured photos preview */}
            <AnimatePresence>
              {capturedPhotos.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-700">{capturedPhotos.length} Foto{capturedPhotos.length > 1 ? 's' : ''} aufgenommen</p>
                    <Button size="sm" onClick={addPhotosToUpload} className="btn-premium text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Fotos übernehmen & analysieren
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {capturedPhotos.map((photo, idx) => (
                      <div key={photo.timestamp} className="relative group rounded-xl overflow-hidden border border-gray-200 aspect-[3/4]">
                        <img src={photo.url} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          <button onClick={() => setPreviewPhoto(photo.url)} className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center hover:bg-white" title="Vergrössern">
                            <ZoomIn className="h-4 w-4 text-gray-700" />
                          </button>
                          <button onClick={() => removePhoto(idx)} className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center hover:bg-red-100" title="Löschen">
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </button>
                        </div>
                        <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">{idx + 1}</div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Photo fullscreen preview modal */}
          <AnimatePresence>
            {previewPhoto && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewPhoto(null)}>
                <motion.img initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                  src={previewPhoto} alt="Vorschau" className="max-w-full max-h-full object-contain rounded-lg" />
                <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center" onClick={() => setPreviewPhoto(null)}>
                  <X className="h-6 w-6 text-white" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">oder Dateien hochladen</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* File upload (existing) */}
          <motion.div
            onDragOver={(e) => { e.preventDefault(); setUploadDragOver(true) }}
            onDragLeave={() => setUploadDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            animate={uploadDragOver ? { scale: 1.02, borderColor: 'rgb(59, 130, 246)' } : { scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer overflow-hidden ${uploadDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/50'}`}
          >
            {/* Animated ring on drag-over */}
            {uploadDragOver && (
              <motion.div
                className="absolute inset-0 rounded-2xl border-2 border-blue-400 pointer-events-none"
                animate={{ scale: [1, 1.04, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.webp,.pptx,.ppt,.mp3,.wav,.m4a,.ogg,.mp4,.xlsx,.xls,.csv,.rtf" onChange={handleFileDrop} className="hidden" />
            <motion.div
              animate={uploadDragOver ? { y: [-2, 2, -2] } : { y: 0 }}
              transition={{ duration: 1, repeat: uploadDragOver ? Infinity : 0, ease: 'easeInOut' }}
            >
              <Upload className={`h-10 w-10 mx-auto mb-3 ${uploadDragOver ? 'text-blue-500' : 'text-gray-400'}`} />
            </motion.div>
            <p className="font-medium text-gray-700 mb-1 text-sm">{uploadDragOver ? 'Dateien hier ablegen...' : 'Dateien hierher ziehen oder klicken'}</p>
            <p className="text-xs text-gray-500">PDF, Word, PowerPoint, Bilder, Audio, Excel, Text</p>
          </motion.div>
        </div>

        {/* File list */}
        <AnimatePresence>
          {uploadedFiles.length > 0 && (
            <motion.div
              className="space-y-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <AnimatePresence mode="popLayout">
                {uploadedFiles.map((file, i) => (
                  <motion.div
                    key={`${file.name}-${i}`}
                    layout
                    initial={{ opacity: 0, x: -20, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 20, scale: 0.94, transition: { duration: 0.2 } }}
                    transition={{ type: 'spring', stiffness: 400, damping: 26, delay: i * 0.04 }}
                    whileHover={{ x: 3 }}
                    className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100 hover:border-blue-300 transition-colors"
                  >
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
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

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
              <motion.div
                className="flex flex-wrap gap-2"
                initial="hidden"
                animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } }}
              >
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
                  const isSuggested = rt.id === suggestedType

                  return (
                    <motion.div
                      key={rt.id}
                      variants={{ hidden: { opacity: 0, y: 12, scale: 0.94 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 24 } } }}
                      whileHover={{ y: -2, scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      animate={isSuggested ? { boxShadow: ['0 0 0 0 rgba(59,130,246,0)', '0 0 0 6px rgba(59,130,246,0.18)', '0 0 0 0 rgba(59,130,246,0)'] } : {}}
                      transition={isSuggested ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : undefined}
                      style={{ borderRadius: '0.5rem' }}
                    >
                      <Button variant={isSuggested ? 'default' : 'outline'} size="sm" onClick={() => {
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
                    </motion.div>
                  )
                })}
                <motion.div variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
                  <Button variant="outline" size="sm" onClick={() => {
                    const sourceText = getCombinedSourceText()
                    if (sourceText) sessionStorage.setItem('eduflow_studio_source', sourceText.slice(0, 30000))
                    setActiveView('studio')
                  }}><Sparkles className="h-4 w-4 mr-1.5" /> Studio-Paket erstellen</Button>
                </motion.div>
              </motion.div>
            </div>
          ) : (
            <motion.div
              whileHover={uploadedFiles.length > 0 && !uploadAnalyzing ? { scale: 1.01 } : {}}
              whileTap={uploadedFiles.length > 0 && !uploadAnalyzing ? { scale: 0.99 } : {}}
            >
              <Button className="w-full btn-premium relative overflow-hidden group" disabled={uploadedFiles.length === 0 || uploadAnalyzing} onClick={uploadFileResults.length > 0 ? handleReAnalyze : handleAnalyzeUpload}>
                {!uploadAnalyzing && uploadedFiles.length > 0 && (
                  <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                )}
                <span className="relative flex items-center justify-center">
                  {uploadAnalyzing ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Wird analysiert... ({uploadFileResults.filter(r => !r.analyzing).length}/{uploadedFiles.length})</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-2" /> {uploadedFiles.length === 0 ? 'Zuerst Dateien hochladen' : uploadFileResults.length > 0 ? `Neue Dateien analysieren` : `${uploadedFiles.length} Datei${uploadedFiles.length > 1 ? 'en' : ''} analysieren`}</>
                  )}
                </span>
              </Button>
            </motion.div>
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
