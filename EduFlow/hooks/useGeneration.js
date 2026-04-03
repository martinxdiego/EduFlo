'use client'
import { useState, useCallback } from 'react'

export function useGeneration(token) {
  const [generating, setGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState([])
  const [streamingQuestions, setStreamingQuestions] = useState([])
  const [showGenerationTheater, setShowGenerationTheater] = useState(false)

  const handleGenerate = useCallback(async (form, { questionTypes, sourceText, onComplete, onError }) => {
    setGenerating(true)
    setGenerationProgress([])
    setStreamingQuestions([])
    setShowGenerationTheater(true)

    try {
      const response = await fetch('/api/generate-worksheet-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          ...form,
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
                setGenerationProgress(prev => [...prev, { step: prev.length + 1, message: 'Arbeitsblatt erfolgreich erstellt!', progress: 100, type: 'complete' }])
                await new Promise(resolve => setTimeout(resolve, 1500))
                setShowGenerationTheater(false)
                if (onComplete) onComplete(data.worksheet)
              } else if (data.type === 'error') {
                throw new Error(data.message)
              }
            } catch (parseError) {
              if (parseError.message !== 'Generierung fehlgeschlagen') console.error('Parse-Fehler:', parseError)
              else throw parseError
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming-Fehler:', error)
      setShowGenerationTheater(false)
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

    try {
      const response = await fetch('/api/generate-dossier-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(params)
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
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'section_start' || data.type === 'status') {
                setGenerationProgress(prev => [...prev, { step: prev.length + 1, message: data.message || `Sektion "${data.section}" wird erstellt...`, progress: data.progress || 0, type: 'status' }])
              } else if (data.type === 'section_complete') {
                setGenerationProgress(prev => [...prev, { step: prev.length + 1, message: `Sektion "${data.section}" fertig`, progress: data.progress || 0, type: 'question' }])
              } else if (data.type === 'dossier_complete') {
                setGenerationProgress(prev => [...prev, { step: prev.length + 1, message: 'Arbeitsdossier erfolgreich erstellt!', progress: 100, type: 'complete' }])
                await new Promise(resolve => setTimeout(resolve, 1500))
                setShowGenerationTheater(false)
                if (onComplete) onComplete(data.dossier)
              } else if (data.type === 'error') {
                throw new Error(data.message)
              }
            } catch (parseError) {
              if (parseError.message !== 'Dossier-Generierung fehlgeschlagen') console.error('Parse-Fehler:', parseError)
              else throw parseError
            }
          }
        }
      }
    } catch (error) {
      console.error('Dossier-Streaming-Fehler:', error)
      setShowGenerationTheater(false)
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
    handleGenerate, handleRegenerate, handleGenerateDossier,
  }
}
