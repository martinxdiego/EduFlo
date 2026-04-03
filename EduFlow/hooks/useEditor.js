'use client'
import { useState, useCallback, useRef, useEffect } from 'react'

export function useEditor(token) {
  const [editMode, setEditMode] = useState(false)
  const [editedQuestions, setEditedQuestions] = useState([])
  const [saveStatus, setSaveStatus] = useState('saved')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [activeKiAction, setActiveKiAction] = useState(null)
  const [showQuestionTypeSelector, setShowQuestionTypeSelector] = useState(false)
  const [kiActionLoading, setKiActionLoading] = useState(false)
  const [worksheetStatuses, setWorksheetStatuses] = useState({})
  const [showPostCreationBar, setShowPostCreationBar] = useState(false)
  const [useRichEditor, setUseRichEditor] = useState(false)
  const autosaveTimerRef = useRef(null)

  const startEditMode = useCallback((worksheet) => {
    if (worksheet?.content?.questions) {
      setEditedQuestions(JSON.parse(JSON.stringify(worksheet.content.questions)))
      setEditMode(true)
      setSaveStatus('saved')
      setHasUnsavedChanges(false)
      setShowPostCreationBar(false)
    }
  }, [])

  const markUnsaved = useCallback(() => {
    setHasUnsavedChanges(true)
    setSaveStatus('unsaved')
  }, [])

  const saveEdits = useCallback(async (selectedWorksheet, { onSaved, onError }) => {
    if (!selectedWorksheet || editedQuestions.length === 0) return
    setSaveStatus('saving')
    const totalPoints = editedQuestions.reduce((sum, q) => sum + (q.points || 1), 0)
    const updatedContent = { ...selectedWorksheet.content, questions: editedQuestions, total_points: totalPoints }
    const updated = { ...selectedWorksheet, content: updatedContent }

    try {
      const res = await fetch(`/api/worksheets/${selectedWorksheet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ content: updatedContent, title: selectedWorksheet.title })
      })
      if (!res.ok) throw new Error('Save failed')
    } catch (err) {
      if (onError) onError('Speichern fehlgeschlagen. Bitte versuchen Sie es erneut.')
      setSaveStatus('unsaved')
      return
    }

    setSaveStatus('saved')
    setHasUnsavedChanges(false)
    setEditMode(false)
    setEditedQuestions([])
    setUseRichEditor(false)
    if (onSaved) onSaved(updated)
  }, [token, editedQuestions])

  const saveDraft = useCallback(async (selectedWorksheet, { onSaved }) => {
    if (!selectedWorksheet || editedQuestions.length === 0) return
    setSaveStatus('saving')
    const totalPoints = editedQuestions.reduce((sum, q) => sum + (q.points || 1), 0)
    const updatedContent = { ...selectedWorksheet.content, questions: editedQuestions, total_points: totalPoints }
    const updated = { ...selectedWorksheet, content: updatedContent }

    try {
      await fetch(`/api/worksheets/${selectedWorksheet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ content: updatedContent, status: 'draft' })
      })
    } catch (err) {
      console.error('Draft save error:', err)
    }

    setWorksheetStatuses(prev => ({ ...prev, [updated.id]: 'draft' }))
    setSaveStatus('saved')
    setHasUnsavedChanges(false)
    if (onSaved) onSaved(updated, 'draft')
  }, [token, editedQuestions])

  // Autosave effect - call this from the component
  const setupAutosave = useCallback((selectedWorksheet) => {
    if (editMode && hasUnsavedChanges && selectedWorksheet) {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = setTimeout(async () => {
        const totalPoints = editedQuestions.reduce((sum, q) => sum + (q.points || 1), 0)
        const updatedContent = { ...selectedWorksheet.content, questions: editedQuestions, total_points: totalPoints }
        try {
          await fetch(`/api/worksheets/${selectedWorksheet.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ content: updatedContent })
          })
          setSaveStatus('autosaved')
          setTimeout(() => { if (editMode) setSaveStatus('saved') }, 2000)
        } catch (err) { console.error('Autosave error:', err) }
      }, 30000)
    }
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current) }
  }, [editMode, hasUnsavedChanges, editedQuestions, token])

  const handleKiAction = useCallback(async (actionId, question, questionIndex, { onResult, onError }) => {
    setKiActionLoading(true)
    setActiveKiAction({ questionIndex, actionId })
    try {
      const res = await fetch('/api/ki-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: actionId, question })
      })
      if (res.ok) {
        const data = await res.json()
        if (onResult) onResult(data, questionIndex)
      }
    } catch (err) {
      if (onError) onError(err.message)
    } finally {
      setKiActionLoading(false)
      setActiveKiAction(null)
    }
  }, [token])

  const cancelEdit = useCallback(() => {
    setEditMode(false)
    setEditedQuestions([])
    setHasUnsavedChanges(false)
    setSaveStatus('saved')
    setUseRichEditor(false)
  }, [])

  return {
    editMode, setEditMode,
    editedQuestions, setEditedQuestions,
    saveStatus, setSaveStatus,
    hasUnsavedChanges, setHasUnsavedChanges,
    activeKiAction, setActiveKiAction,
    showQuestionTypeSelector, setShowQuestionTypeSelector,
    kiActionLoading, setKiActionLoading,
    worksheetStatuses, setWorksheetStatuses,
    showPostCreationBar, setShowPostCreationBar,
    useRichEditor, setUseRichEditor,
    startEditMode, markUnsaved, saveEdits, saveDraft, setupAutosave,
    handleKiAction, cancelEdit,
  }
}
