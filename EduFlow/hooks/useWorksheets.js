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

  const updateMetadata = useCallback(async (worksheetId, updates) => {
    try {
      const response = await fetch(`/api/worksheets/${worksheetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(updates),
      })
      if (!response.ok) return null
      const updated = await response.json()
      setWorksheets(previous => previous.map(item => item.id === worksheetId ? updated : item))
      if (selectedWorksheet?.id === worksheetId) setSelectedWorksheet(updated)
      return updated
    } catch {
      return null
    }
  }, [token, selectedWorksheet])

  const handleDuplicate = useCallback(async (worksheet) => {
    try {
      const response = await fetch(`/api/worksheets/${worksheet.id}/duplicate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!response.ok) return null
      const duplicate = await response.json()
      setWorksheets(previous => [duplicate, ...previous])
      return duplicate
    } catch {
      return null
    }
  }, [token])

  return {
    worksheets, setWorksheets,
    selectedWorksheet, setSelectedWorksheet,
    showEditorPanel, setShowEditorPanel,
    fetchWorksheets, handleDelete, handleDuplicate, updateMetadata,
  }
}
