'use client'
import { useState, useCallback, useEffect } from 'react'

const GENERATION_STORAGE_KEY = 'eduflow_generation_job_v1'

function newJob(kind, params = {}) {
  return {
    id: globalThis.crypto?.randomUUID?.() || String(Date.now()),
    kind,
    status: 'running',
    progress: 1,
    message: kind === 'dossier' ? 'Dossier wird vorbereitet…' : 'Material wird vorbereitet…',
    startedAt: new Date().toISOString(),
    params: kind === 'dossier' ? { ...params, sourceText: String(params.sourceText || '').slice(0, 4000) } : null,
  }
}

export function useGeneration(token) {
  const [generating, setGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState([])
  const [streamingQuestions, setStreamingQuestions] = useState([])
  const [showGenerationTheater, setShowGenerationTheater] = useState(false)
  const [generationJob, setGenerationJob] = useState(null)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(GENERATION_STORAGE_KEY) || 'null')
      if (saved?.status === 'running') saved.status = 'interrupted'
      if (saved) setGenerationJob(saved)
    } catch {}
  }, [])

  useEffect(() => {
    if (generationJob) localStorage.setItem(GENERATION_STORAGE_KEY, JSON.stringify(generationJob))
    else localStorage.removeItem(GENERATION_STORAGE_KEY)
  }, [generationJob])

  useEffect(() => {
    const latest = generationProgress[generationProgress.length - 1]
    if (!latest) return
    setGenerationJob(previous => previous ? {
      ...previous,
      progress: Number(latest.progress || 0),
      message: latest.message,
      status: latest.progress >= 100 ? 'complete' : previous.status,
      updatedAt: new Date().toISOString(),
    } : previous)
  }, [generationProgress])

  const handleGenerate = useCallback(async (form, { questionTypes, sourceText, onComplete, onError }) => {
    setGenerating(true)
    setGenerationProgress([])
    setStreamingQuestions([])
    setShowGenerationTheater(true)
    setGenerationJob(newJob('worksheet'))

    try {
      const response = await fetch('/api/generate-worksheet-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          ...form,
          aiProvider: 'openai',
          questionTypes: questionTypes?.length > 0 ? questionTypes : undefined,
          sourceText
        })
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || 'Generierung fehlgeschlagen')
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let completed = false
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'status') {
                setGenerationProgress(prev => [...prev, { step: prev.length + 1, message: data.message, progress: data.progress, type: 'status' }])
              } else if (data.type === 'question') {
                setStreamingQuestions(prev => [...prev, { number: data.number, question: data.question }])
                setGenerationProgress(prev => [...prev, { step: prev.length + 1, message: `Frage ${data.number} erstellt...`, progress: data.progress, type: 'question', question: data.question }])
              } else if (data.type === 'complete') {
                completed = true
                setGenerationProgress(prev => [...prev, { step: prev.length + 1, message: 'Arbeitsblatt erfolgreich erstellt!', progress: 100, type: 'complete' }])
                await new Promise(resolve => setTimeout(resolve, 1500))
                setShowGenerationTheater(false)
                if (onComplete) onComplete(data.worksheet)
              } else if (data.type === 'error') {
                const generationError = new Error(data.message || 'Generierung fehlgeschlagen')
                generationError.isGenerationError = true
                throw generationError
              }
            } catch (parseError) {
              if (parseError.isGenerationError) throw parseError
              console.error('Parse-Fehler:', parseError)
            }
          }
        }
      }
      if (!completed) throw new Error('Der Material-Stream wurde unerwartet beendet.')
    } catch (error) {
      console.error('Streaming-Fehler:', error)
      setShowGenerationTheater(false)
      setGenerationJob(previous => previous ? { ...previous, status: 'failed', message: error.message || 'Generierung fehlgeschlagen', updatedAt: new Date().toISOString() } : previous)
      if (onError) onError(error.message || 'Fehler bei der Generierung.')
    } finally {
      setGenerating(false)
    }
  }, [token])

  const handleRegenerate = useCallback(async (worksheetId, newDifficulty, { onComplete, onError }) => {
    setGenerating(true)
    try {
      const response = await fetch('/api/regenerate-worksheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ worksheetId, newDifficulty })
      })
      const data = await response.json()
      if (response.ok && onComplete) onComplete(data)
    } catch (error) {
      if (onError) onError('Fehler bei der Neugenerierung.')
    } finally {
      setGenerating(false)
    }
  }, [token])

  const handleGenerateDossier = useCallback(async (params, { onComplete, onError }) => {
    setGenerating(true)
    setGenerationProgress([])
    setShowGenerationTheater(true)
    setGenerationJob(newJob('dossier', params))

    try {
      let resumeDossierId = params.resumeDossierId
      let completed = false
      for (let attempt = 0; attempt < 2 && !completed; attempt++) {
        try {
          const response = await fetch('/api/generate-dossier-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ ...params, resumeDossierId })
          })
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}))
            throw new Error(errData.error || 'Dossier-Generierung fehlgeschlagen')
          }
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n\n')
            buffer = lines.pop() || ''
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const data = JSON.parse(line.slice(6))
              if (data.type === 'checkpoint') {
                resumeDossierId = data.dossierId
                setGenerationJob(previous => previous ? { ...previous, resumeDossierId } : previous)
                if (data.resumed) setGenerationProgress(prev => [...prev, { step: prev.length + 1, message: 'Gespeicherten Stand wieder aufgenommen...', progress: data.progress || 2, type: 'status' }])
              } else if (data.type === 'section_start' || data.type === 'status') {
                setGenerationProgress(prev => [...prev, { step: prev.length + 1, message: data.message || `Sektion "${data.section}" wird erstellt...`, progress: data.progress || 0, type: 'status' }])
              } else if (data.type === 'section_complete') {
                setGenerationProgress(prev => [...prev, { step: prev.length + 1, message: `Sektion "${data.section}" fertig`, progress: data.progress || 0, type: 'question' }])
              } else if (data.type === 'dossier_complete') {
                completed = true
                setGenerationProgress(prev => [...prev, { step: prev.length + 1, message: 'Arbeitsdossier erfolgreich erstellt!', progress: 100, type: 'complete' }])
                await new Promise(resolve => setTimeout(resolve, 1200))
                setShowGenerationTheater(false)
                if (onComplete) onComplete(data.dossier)
              } else if (data.type === 'error') {
                const generationError = new Error(data.message)
                generationError.recoverable = data.recoverable
                generationError.dossierId = data.dossierId || resumeDossierId
                throw generationError
              }
            }
          }
          if (!completed) throw new Error('Der Dossier-Stream wurde unerwartet beendet.')
        } catch (attemptError) {
          if (attempt === 0 && attemptError.recoverable && (attemptError.dossierId || resumeDossierId)) {
            resumeDossierId = attemptError.dossierId || resumeDossierId
            setGenerationProgress(prev => [...prev, { step: prev.length + 1, message: 'Unterbrechung erkannt - EduFlow setzt beim letzten Checkpoint fort...', progress: 5, type: 'status' }])
            continue
          }
          throw attemptError
        }
      }
    } catch (error) {
      console.error('Dossier-Streaming-Fehler:', error)
      setShowGenerationTheater(false)
      setGenerationJob(previous => previous ? {
        ...previous,
        status: 'failed',
        message: error.message || 'Dossier-Generierung fehlgeschlagen',
        resumeDossierId: error.dossierId || previous.resumeDossierId,
        updatedAt: new Date().toISOString(),
      } : previous)
      if (onError) onError(error.message || 'Fehler bei der Dossier-Generierung.')
    } finally {
      setGenerating(false)
    }
  }, [token])

  return {
    generating, setGenerating,
    generationProgress, setGenerationProgress,
    streamingQuestions, setStreamingQuestions,
    showGenerationTheater, setShowGenerationTheater,
    generationJob,
    dismissGenerationJob: () => setGenerationJob(null),
    handleGenerate, handleRegenerate, handleGenerateDossier,
  }
}
