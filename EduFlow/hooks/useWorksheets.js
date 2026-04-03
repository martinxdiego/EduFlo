'use client'
import { useState, useCallback } from 'react'

export function useWorksheets(token) {
  const [worksheets, setWorksheets] = useState([])
  const [selectedWorksheet, setSelectedWorksheet] = useState(null)
  const [showEditorPanel, setShowEditorPanel] = useState(false)

  const fetchWorksheets = useCallback(async (authToken) => {
    const t = authToken || token
    if (!t) return
    try {
      const response = await fetch('/api/worksheets', { headers: { 'Authorization': `Bearer ${t}` } })
      if (response.ok) { setWorksheets(await response.json()) }
    } catch (error) {
      console.error('Fehler beim Laden der Materialien:', error)
    }
  }, [token])

  const handleDelete = useCallback(async (worksheetId) => {
    try {
      await fetch(`/api/worksheets/${worksheetId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
      fetchWorksheets()
      if (selectedWorksheet?.id === worksheetId) {
        setSelectedWorksheet(null)
        setShowEditorPanel(false)
      }
      return true
    } catch (error) {
      return false
    }
  }, [token, selectedWorksheet, fetchWorksheets])

  const handleDuplicate = useCallback((worksheet) => {
    const duplicate = {
      ...worksheet,
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      title: `${worksheet.title} (Kopie)`,
      created_at: new Date().toISOString()
    }
    setWorksheets(prev => [duplicate, ...prev])
    return duplicate
  }, [])

  return {
    worksheets, setWorksheets,
    selectedWorksheet, setSelectedWorksheet,
    showEditorPanel, setShowEditorPanel,
    fetchWorksheets, handleDelete, handleDuplicate,
  }
}
