'use client'
import { useState, useCallback, useRef } from 'react'

export function useUpload(token) {
  const [uploadDragOver, setUploadDragOver] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploadInstructions, setUploadInstructions] = useState('')
  const [uploadAnalyzing, setUploadAnalyzing] = useState(false)
  const [uploadAnalysisComplete, setUploadAnalysisComplete] = useState(false)
  const [uploadFileResults, setUploadFileResults] = useState([])
  const [uploadAnalysisResult, setUploadAnalysisResult] = useState(null)
  const [uploadStructuredSource, setUploadStructuredSource] = useState(null)
  const fileInputRef = useRef(null)

  const VALID_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pptx', '.ppt', '.mp3', '.wav', '.m4a', '.ogg', '.mp4', '.xlsx', '.xls', '.csv', '.rtf']

  const handleFileDrop = useCallback((e) => {
    e.preventDefault()
    setUploadDragOver(false)
    const files = Array.from(e.dataTransfer?.files || e.target?.files || [])
    const validFiles = files.filter(f =>
      f.type === 'application/pdf' || f.type.startsWith('image/') || f.type.startsWith('audio/') || f.type.startsWith('video/') ||
      VALID_EXTENSIONS.some(ext => f.name.toLowerCase().endsWith(ext))
    )
    if (validFiles.length > 0) setUploadedFiles(prev => [...prev, ...validFiles])
  }, [])

  const handleRemoveFile = useCallback((index) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  const analyzeSingleFile = useCallback(async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    if (uploadInstructions) formData.append('instructions', uploadInstructions)

    const response = await fetch('/api/analyze-upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    })

    if (response.ok) {
      const data = await response.json()
      return { analysis: data.analysis, structuredSource: data.structured_source || null }
    }
    return {
      analysis: {
        title: file.name, subject: 'Allgemein', grade_suggestion: '5',
        content_summary: 'Datei konnte nicht vollständig analysiert werden.',
        key_topics: [], suggested_questions: [],
        difficulty_suggestion: 'medium', material_type_suggestion: 'worksheet'
      },
      structuredSource: null
    }
  }, [token, uploadInstructions])

  const handleAnalyzeUpload = useCallback(async () => {
    if (uploadedFiles.length === 0) return
    setUploadAnalyzing(true)
    setUploadAnalysisResult(null)
    setUploadStructuredSource(null)

    const initialResults = uploadedFiles.map((file) => ({
      file, fileName: file.name,
      analysis: null, structuredSource: null,
      included: true, collapsed: uploadedFiles.length > 1,
      correctedText: null, correctedTitle: null, correctedSubject: null, correctedGrade: null,
      analyzing: true, error: null,
    }))
    setUploadFileResults(initialResults)

    const promises = uploadedFiles.map(async (file, idx) => {
      try {
        const result = await analyzeSingleFile(file)
        return { idx, ...result, error: null }
      } catch (err) {
        return {
          idx,
          analysis: { title: file.name, subject: 'Allgemein', grade_suggestion: '5', content_summary: 'Analyse fehlgeschlagen.', key_topics: [], suggested_questions: [], difficulty_suggestion: 'medium', material_type_suggestion: 'worksheet' },
          structuredSource: null, error: err.message
        }
      }
    })

    const results = await Promise.all(promises)
    const finalResults = initialResults.map((item, idx) => {
      const r = results.find(res => res.idx === idx)
      return { ...item, analysis: r.analysis, structuredSource: r.structuredSource, analyzing: false, error: r.error }
    })
    setUploadFileResults(finalResults)

    const firstGood = finalResults.find(r => r.analysis)
    if (firstGood) {
      setUploadAnalysisResult(firstGood.analysis)
      setUploadStructuredSource(firstGood.structuredSource)
    }

    setUploadAnalysisComplete(true)
    setUploadAnalyzing(false)
    return finalResults
  }, [uploadedFiles, analyzeSingleFile])

  const updateFileResult = useCallback((idx, updates) => {
    setUploadFileResults(prev => prev.map((r, i) => i === idx ? { ...r, ...updates } : r))
  }, [])

  // Build structured sources JSON for generation (new format)
  const getStructuredSources = useCallback(() => {
    const included = uploadFileResults.filter(r => r.included && (r.structuredSource || r.correctedText))
    if (included.length === 0) {
      // Fallback to legacy single-file
      if (uploadStructuredSource?.full_text) {
        return JSON.stringify({
          sources: [{
            title: uploadStructuredSource.document_title || 'Hochgeladenes Material',
            type: uploadStructuredSource.extraction_method || 'unknown',
            content_blocks: uploadStructuredSource.content_blocks || uploadStructuredSource.sections?.map(s => ({
              type: s.type === 'heading' ? 'text' : s.type,
              content: s.content
            })) || [{ type: 'text', content: uploadStructuredSource.full_text }]
          }]
        })
      }
      return undefined
    }

    const sources = included.map((r) => {
      const title = r.correctedTitle || r.structuredSource?.document_title || r.fileName
      const type = r.structuredSource?.extraction_method || 'unknown'

      // If user corrected text, use that as a single text block
      if (r.correctedText) {
        return {
          title, type,
          content_blocks: [{ type: 'text', content: r.correctedText }]
        }
      }

      // Use structured content_blocks if available
      const blocks = r.structuredSource?.content_blocks || r.structuredSource?.sections?.map(s => ({
        type: s.type === 'heading' ? 'text' : s.type,
        content: s.content
      })) || [{ type: 'text', content: r.structuredSource?.full_text || '' }]

      return { title, type, content_blocks: blocks }
    })

    return JSON.stringify({ sources })
  }, [uploadFileResults, uploadStructuredSource])

  // Legacy plain-text fallback for backwards compatibility
  const getCombinedSourceText = useCallback(() => {
    const structured = getStructuredSources()
    if (structured) return structured

    const included = uploadFileResults.filter(r => r.included && (r.structuredSource || r.correctedText))
    if (included.length === 0) return uploadStructuredSource?.full_text || undefined
    if (included.length === 1) {
      const r = included[0]
      return r.correctedText || r.structuredSource?.full_text || undefined
    }
    const parts = included.map((r, i) => {
      const title = r.correctedTitle || r.structuredSource?.document_title || r.fileName
      const text = r.correctedText || r.structuredSource?.full_text || ''
      return `--- QUELLE ${i + 1}: ${title} (${r.fileName}) ---\n${text}\n--- ENDE QUELLE ${i + 1} ---`
    })
    return parts.join('\n\n')
  }, [uploadFileResults, uploadStructuredSource, getStructuredSources])

  // Reset upload state for new analysis
  const resetUpload = useCallback(() => {
    setUploadedFiles([])
    setUploadFileResults([])
    setUploadAnalysisComplete(false)
    setUploadAnalysisResult(null)
    setUploadStructuredSource(null)
    setUploadInstructions('')
  }, [])

  // Add more files after analysis (keep existing results)
  const addMoreFiles = useCallback(() => {
    setUploadAnalysisComplete(false)
  }, [])

  return {
    uploadDragOver, setUploadDragOver,
    uploadedFiles, setUploadedFiles,
    uploadInstructions, setUploadInstructions,
    uploadAnalyzing, uploadAnalysisComplete, setUploadAnalysisComplete,
    uploadFileResults, setUploadFileResults,
    uploadAnalysisResult, uploadStructuredSource,
    fileInputRef,
    handleFileDrop, handleRemoveFile,
    handleAnalyzeUpload, updateFileResult,
    getCombinedSourceText, getStructuredSources,
    resetUpload, addMoreFiles,
  }
}
