'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence, Reorder } from 'framer-motion'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { Slider } from '@/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Badge } from '@/ui/badge'
import { Separator } from '@/ui/separator'
import { Alert, AlertDescription } from '@/ui/alert'
import { Textarea } from '@/ui/textarea'
import {
  BookOpen, FileText, PlusCircle, Download, Trash2, RefreshCw,
  Crown, Sparkles, Eye, Edit, Copy, Zap, Upload,
  GraduationCap, Search, FolderOpen, ChevronRight, ChevronDown, ChevronUp,
  Info, CheckCircle2, ArrowRight,
  Target, Layers, Lightbulb,
  MoreHorizontal, Calendar, Star, X,
  ListChecks, ToggleLeft, MessageSquare, Calculator, Image,
  ArrowLeftRight, Type, ListOrdered, GitBranch,
  Wand2, Save, GripVertical, ArrowUp, ArrowDown,
  Shuffle, CircleDot, Palette,
  Pen, PanelRightOpen, Send, Minus, User,
  Table2, ImagePlus, AlignLeft, AlignCenter, AlignRight
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { LEHRPLAN_CYCLES } from '@/data/lehrplan21'
import { WORKSHEET_THEMES, getThemeById, getQuestionDecoration } from '@/data/worksheetThemes'
import { useEduFlow } from '@/contexts/EduFlowContext'

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false, loading: () => <div className="h-24 bg-gray-50 rounded-lg animate-pulse" /> })

// ============================================================
// CONSTANTS (shared with AppContent)
// ============================================================

const RESOURCE_TYPES = [
  { id: 'worksheet', label: 'Arbeitsblatt', icon: FileText, description: 'Klassische Aufgabenblätter mit verschiedenen Fragetypen', color: 'blue' },
  { id: 'exam', label: 'Prüfung', icon: () => <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><path d="m9 14 2 2 4-4" /></svg>, description: 'Benotete Prüfung mit Punkteverteilung und Lösungsschlüssel', color: 'red' },
  { id: 'quiz', label: 'Quiz', icon: Lightbulb, description: 'Kurze Lernkontrollen mit sofortigem Feedback', color: 'green' },
  { id: 'vocabulary', label: 'Wortschatz', icon: () => <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" /></svg>, description: 'Vokabellisten mit Übungen und Abfragen', color: 'purple' },
  { id: 'dossier', label: 'Arbeitsdossier', icon: BookOpen, description: 'Komplettes Lerndossier mit 15-20 Seiten: Theorie, Aufgaben, Lernziele und Lösungen', color: 'indigo' },
]

const SUBJECTS_PRIMAR = [
  'Deutsch', 'Mathematik', 'NMG', 'Englisch', 'Französisch',
  'Bildnerisches Gestalten', 'Musik', 'Bewegung und Sport'
]

const SUBJECTS_SEK = [
  'Deutsch', 'Mathematik', 'Französisch', 'Englisch',
  'RZG', 'Natur und Technik', 'Bildnerisches Gestalten',
  'Musik', 'TTG', 'Bewegung und Sport', 'Medien und Informatik',
  'Berufliche Orientierung', 'Projektunterricht'
]

const SUBJECTS = [...new Set([...SUBJECTS_PRIMAR, ...SUBJECTS_SEK])]

const getSubjectsForGrade = (grade) => {
  const g = parseInt(grade, 10)
  if (g >= 7) return SUBJECTS_SEK
  return SUBJECTS_PRIMAR
}

const DIFFICULTY_LABELS = {
  easy: 'Einfach',
  medium: 'Mittel',
  hard: 'Schwierig'
}

const QUESTION_TYPES = [
  { id: 'multiple_choice', label: 'Multiple Choice', icon: ListChecks, description: 'Mehrere Antwortmöglichkeiten, eine richtig', color: 'blue' },
  { id: 'true_false', label: 'Wahr oder Falsch', icon: ToggleLeft, description: 'Aussage bewerten: richtig oder falsch', color: 'green' },
  { id: 'open', label: 'Offene Frage', icon: MessageSquare, description: 'Freitext-Antwort in eigenen Worten', color: 'purple' },
  { id: 'math', label: 'Rechenfrage', icon: Calculator, description: 'Mathematische Aufgabe mit Lösungsweg', color: 'orange' },
  { id: 'image', label: 'Bilderfrage', icon: Image, description: 'Bild beschreiben, zuordnen oder analysieren', color: 'pink' },
  { id: 'matching', label: 'Zuordnung', icon: ArrowLeftRight, description: 'Begriffe oder Bilder einander zuordnen', color: 'cyan' },
  { id: 'fill_blank', label: 'Lückentext', icon: Type, description: 'Fehlende Wörter im Text ergänzen', color: 'yellow' },
  { id: 'ordering', label: 'Reihenfolge', icon: ListOrdered, description: 'Elemente in die richtige Reihenfolge bringen', color: 'indigo' },
  { id: 'either_or', label: 'Entweder-Oder', icon: GitBranch, description: 'Zwischen zwei Optionen entscheiden', color: 'red' },
  { id: 'table', label: 'Tabelle', icon: Table2, description: 'Vergleichstabelle, Zuordnung oder Ausfülltabelle', color: 'slate' },
  { id: 'image_block', label: 'Bildfeld', icon: ImagePlus, description: 'Bild einfügen mit Grösse und Ausrichtung', color: 'teal' },
]

const IMAGE_SIZES = [
  { id: 'small', label: 'Klein', width: '25%', pdfWidth: 40 },
  { id: 'medium', label: 'Mittel', width: '50%', pdfWidth: 80 },
  { id: 'large', label: 'Gross', width: '75%', pdfWidth: 120 },
  { id: 'full', label: 'Volle Breite', width: '100%', pdfWidth: 160 },
]

const IMAGE_ALIGNMENTS = [
  { id: 'left', label: 'Links', icon: AlignLeft },
  { id: 'center', label: 'Mitte', icon: AlignCenter },
  { id: 'right', label: 'Rechts', icon: AlignRight },
]

const KI_ACTIONS = [
  { id: 'harder', label: 'Schwieriger machen', icon: ChevronUp, prompt: 'Mache diese Frage anspruchsvoller' },
  { id: 'easier', label: 'Einfacher machen', icon: ChevronDown, prompt: 'Vereinfache diese Frage' },
  { id: 'to_mc', label: 'In Multiple Choice', icon: ListChecks, prompt: 'Wandle in Multiple Choice um' },
  { id: 'to_open', label: 'Als offene Frage', icon: MessageSquare, prompt: 'Schreibe als offene Frage um' },
  { id: 'more_options', label: 'Mehr Optionen', icon: PlusCircle, prompt: 'Erstelle mehr Antwortmöglichkeiten' },
  { id: 'better_distractors', label: 'Bessere Falschantworten', icon: Shuffle, prompt: 'Bessere falsche Antwortoptionen' },
  { id: 'precise_answer', label: 'Lösung präziser', icon: Target, prompt: 'Formuliere die Lösung präziser' },
  { id: 'child_friendly', label: 'Kindgerechter', icon: Sparkles, prompt: 'Kindgerechter formulieren' },
  { id: 'swiss_context', label: 'CH-Schulkontext', icon: Target, prompt: 'Schweizer Schulkontext berücksichtigen' },
  { id: 'more_variety', label: 'Abwechslung', icon: Shuffle, prompt: 'Mehr Abwechslung in die Aufgabe bringen' },
]

export default function GeneratorView({ handleExportPDF, handleExportDOCX, handleRegenerate, handleUpgrade }) {
  const ctx = useEduFlow()
  const {
    token, user,
    worksheets, selectedWorksheet, setSelectedWorksheet,
    showEditorPanel, setShowEditorPanel, setWorksheets,
    handleDuplicate, fetchWorksheets,
    generating, handleGenerate, handleGenerateDossier,
    editMode, setEditMode, editedQuestions, setEditedQuestions,
    saveStatus, setSaveStatus, hasUnsavedChanges, setHasUnsavedChanges,
    activeKiAction, setActiveKiAction, showQuestionTypeSelector, setShowQuestionTypeSelector,
    kiActionLoading, setKiActionLoading, worksheetStatuses, setWorksheetStatuses,
    showPostCreationBar, setShowPostCreationBar, useRichEditor, setUseRichEditor,
    form, setForm, selectedQuestionTypes, setSelectedQuestionTypes,
    error, setError, setSuccessMessage, setActiveView,
    exportHistory, plannerEvents,
    imageGenerating, setImageGenerating, imagePrompt, setImagePrompt, imageStyle, setImageStyle,
    shareModalOpen, setShareModalOpen, shareForm, setShareForm,
    loadTeacherClasses, loadAssignments,
  } = ctx

  // ============================================================
  // EDITING FUNCTIONS (create-view specific)
  // ============================================================

  const startEditMode = () => {
    if (selectedWorksheet?.content?.questions) {
      setEditedQuestions(JSON.parse(JSON.stringify(selectedWorksheet.content.questions)).map((q, i) => ({ ...q, _dragId: `q-${i}-${Date.now()}` })))
      setEditMode(true)
      setSaveStatus('saved')
      setHasUnsavedChanges(false)
      setShowPostCreationBar(false)
    }
  }

  const markUnsaved = () => {
    setHasUnsavedChanges(true)
    setSaveStatus('unsaved')
  }

  const saveEdits = async () => {
    if (selectedWorksheet && editedQuestions.length > 0) {
      setSaveStatus('saving')
      const totalPoints = editedQuestions.reduce((sum, q) => q.type === 'image_block' ? sum : sum + (q.points || 1), 0)
      const updatedContent = {
        ...selectedWorksheet.content,
        questions: editedQuestions,
        total_points: totalPoints
      }
      const updated = { ...selectedWorksheet, content: updatedContent }

      try {
        const res = await fetch(`/api/worksheets/${selectedWorksheet.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ content: updatedContent, title: selectedWorksheet.title })
        })
        if (!res.ok) throw new Error('Save failed')
      } catch (err) {
        console.error('Save error:', err)
        setError('Speichern fehlgeschlagen. Bitte versuchen Sie es erneut.')
        setSaveStatus('unsaved')
        return
      }

      setSelectedWorksheet(updated)
      setWorksheets(prev => prev.map(ws => ws.id === updated.id ? updated : ws))
      setSaveStatus('saved')
      setHasUnsavedChanges(false)
      setEditMode(false)
      setEditedQuestions([])
      setUseRichEditor(false)
      setSuccessMessage('Gespeichert! Vorschau wird angezeigt.')
    }
  }

  const saveDraft = async () => {
    if (selectedWorksheet && editedQuestions.length > 0) {
      setSaveStatus('saving')
      const totalPoints = editedQuestions.reduce((sum, q) => q.type === 'image_block' ? sum : sum + (q.points || 1), 0)
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

      setSelectedWorksheet(updated)
      setWorksheets(prev => prev.map(ws => ws.id === updated.id ? updated : ws))
      setWorksheetStatuses(prev => ({ ...prev, [updated.id]: 'draft' }))
      setSaveStatus('saved')
      setHasUnsavedChanges(false)
      setEditMode(false)
      setEditedQuestions([])
      setSuccessMessage('Als Entwurf gespeichert. Sie können jederzeit weiterarbeiten.')
    }
  }

  const getWorksheetStatus = (wsId) => worksheetStatuses[wsId] || 'complete'

  const startNewMaterial = () => {
    setSelectedWorksheet(null)
    setShowEditorPanel(false)
    setEditMode(false)
    setEditedQuestions([])
    setShowPostCreationBar(false)
    setForm({ topic: '', grade: form.grade, subject: form.subject, difficulty: form.difficulty, questionCount: form.questionCount, resourceType: 'worksheet', dyslexiaFont: false })
    setActiveView('create')
  }

  const cancelEdits = () => {
    setEditMode(false)
    setEditedQuestions([])
    setHasUnsavedChanges(false)
    setSaveStatus('saved')
  }

  const updateEditedQuestion = (index, field, value) => {
    setEditedQuestions(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
    markUnsaved()
  }

  const updateEditedOption = (qIndex, optIndex, value) => {
    setEditedQuestions(prev => {
      const updated = [...prev]
      const options = [...(updated[qIndex].options || [])]
      options[optIndex] = value
      updated[qIndex] = { ...updated[qIndex], options }
      return updated
    })
    markUnsaved()
  }

  const addOptionToQuestion = (qIndex) => {
    setEditedQuestions(prev => {
      const updated = [...prev]
      const options = [...(updated[qIndex].options || [])]
      const letter = String.fromCharCode(65 + options.length)
      options.push(`${letter}) Neue Option`)
      updated[qIndex] = { ...updated[qIndex], options }
      return updated
    })
    markUnsaved()
  }

  const removeOptionFromQuestion = (qIndex, optIndex) => {
    setEditedQuestions(prev => {
      const updated = [...prev]
      const options = [...(updated[qIndex].options || [])].filter((_, i) => i !== optIndex)
      updated[qIndex] = { ...updated[qIndex], options: options.length > 0 ? options : undefined }
      return updated
    })
    markUnsaved()
  }

  const addQuestionOfType = (type, afterIndex = -1) => {
    const templates = {
      multiple_choice: { question: 'Neue Multiple-Choice-Frage', options: ['A) Option 1', 'B) Option 2', 'C) Option 3', 'D) Option 4'], answer: 'A) Option 1', type: 'multiple_choice' },
      true_false: { question: 'Neue Wahr-oder-Falsch-Aussage', options: ['A) Wahr', 'B) Falsch'], answer: 'A) Wahr', type: 'true_false' },
      open: { question: 'Neue offene Frage', answer: 'Beispielantwort', type: 'open' },
      math: { question: 'Berechne: ', answer: '', type: 'math' },
      image: { question: 'Beschreibe das folgende Bild:', answer: '', type: 'image' },
      matching: { question: 'Ordne die folgenden Begriffe richtig zu:', answer: '', type: 'matching' },
      fill_blank: { question: 'Ergänze die Lücken: Der ___ ist ein ___ Tier.', answer: 'Hund, treues', type: 'fill_blank' },
      ordering: { question: 'Bringe die folgenden Schritte in die richtige Reihenfolge:', answer: '', type: 'ordering' },
      either_or: { question: 'Wähle die richtige Aussage:', options: ['A) Erste Aussage', 'B) Zweite Aussage'], answer: 'A) Erste Aussage', type: 'either_or' },
      table: { question: 'Fülle die Tabelle aus:', answer: '', type: 'table', tableHeaders: ['Spalte 1', 'Spalte 2', 'Spalte 3'], tableRows: [['', '', ''], ['', '', '']] },
      image_block: { question: '', answer: '', type: 'image_block', imageUrl: '', imageSize: 'medium', imageAlignment: 'center', imageCaption: '' },
    }
    const template = templates[type] || templates.open
    setEditedQuestions(prev => {
      const insertAt = afterIndex >= 0 ? afterIndex + 1 : prev.length
      const newQ = { ...template, number: insertAt + 1, points: type === 'image_block' ? 0 : 1, _dragId: `q-${Date.now()}-${Math.random()}` }
      const result = [...prev.slice(0, insertAt), newQ, ...prev.slice(insertAt)]
      result.forEach((q, i) => { q.number = i + 1 })
      return result
    })
    setShowQuestionTypeSelector(false)
    markUnsaved()
  }

  const removeQuestion = (index) => {
    setEditedQuestions(prev => {
      const filtered = prev.filter((_, i) => i !== index)
      filtered.forEach((q, i) => { q.number = i + 1 })
      return [...filtered]
    })
    markUnsaved()
  }

  const duplicateQuestion = (index) => {
    setEditedQuestions(prev => {
      const dup = { ...JSON.parse(JSON.stringify(prev[index])), _dragId: `q-${Date.now()}-${Math.random()}` }
      const result = [...prev.slice(0, index + 1), dup, ...prev.slice(index + 1)]
      result.forEach((q, i) => { q.number = i + 1 })
      return result
    })
    markUnsaved()
  }

  const moveQuestion = (index, direction) => {
    setEditedQuestions(prev => {
      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= prev.length) return prev
      const updated = [...prev]
      const temp = updated[index]
      updated[index] = updated[newIndex]
      updated[newIndex] = temp
      updated.forEach((q, i) => { q.number = i + 1 })
      return updated
    })
    markUnsaved()
  }

  const changeQuestionType = (index, newType) => {
    setEditedQuestions(prev => {
      const updated = [...prev]
      const q = { ...updated[index], type: newType }
      if (['multiple_choice', 'true_false', 'either_or'].includes(newType) && !q.options) {
        if (newType === 'true_false') q.options = ['A) Wahr', 'B) Falsch']
        else if (newType === 'either_or') q.options = ['A) Erste Aussage', 'B) Zweite Aussage']
        else q.options = ['A) Option 1', 'B) Option 2', 'C) Option 3', 'D) Option 4']
      }
      if (['open', 'math', 'image', 'fill_blank', 'ordering', 'matching', 'image_block'].includes(newType)) {
        delete q.options
      }
      updated[index] = q
      return updated
    })
    markUnsaved()
  }

  const handleKiAction = async (questionIndex, actionId) => {
    setKiActionLoading(true)
    setActiveKiAction({ questionIndex, actionId })

    const question = editedQuestions[questionIndex]
    const worksheetContext = selectedWorksheet ? {
      subject: selectedWorksheet.subject,
      grade: selectedWorksheet.grade,
      difficulty: selectedWorksheet.difficulty,
    } : null

    try {
      const response = await fetch('/api/ki-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ question, actionId, worksheetContext })
      })

      if (response.ok) {
        const data = await response.json()
        const updatedQ = data.question
        setEditedQuestions(prev => {
          const updated = [...prev]
          updated[questionIndex] = {
            ...updated[questionIndex],
            question: updatedQ.question || updated[questionIndex].question,
            type: updatedQ.type || updated[questionIndex].type,
            options: updatedQ.options || ((['multiple_choice', 'true_false', 'either_or'].includes(updatedQ.type)) ? updated[questionIndex].options : undefined),
            answer: updatedQ.answer || updated[questionIndex].answer,
            points: updatedQ.points || updated[questionIndex].points,
          }
          if (['open', 'math', 'image', 'fill_blank', 'ordering', 'matching', 'image_block'].includes(updatedQ.type)) {
            delete updated[questionIndex].options
          }
          return updated
        })
        markUnsaved()
        setSuccessMessage(`KI-Aktion "${KI_ACTIONS.find(a => a.id === actionId)?.label}" ausgeführt.`)
      } else {
        handleKiActionLocal(questionIndex, actionId)
      }
    } catch (err) {
      handleKiActionLocal(questionIndex, actionId)
    }

    setKiActionLoading(false)
    setActiveKiAction(null)
  }

  const handleKiActionLocal = (questionIndex, actionId) => {
    setEditedQuestions(prev => {
      const updated = [...prev]
      const q = { ...updated[questionIndex] }
      switch (actionId) {
        case 'harder':
          q.question = q.question.replace(/\?$/, '? Begründe deine Antwort ausführlich.')
          if (q.points) q.points = Math.min(q.points + 1, 10)
          break
        case 'easier':
          q.question = q.question.replace(/ Begründe.*$/, '?').replace(/\?\?/, '?')
          break
        case 'to_mc':
          if (!q.options) {
            q.options = ['A) Mögliche Antwort 1', 'B) Mögliche Antwort 2', 'C) Mögliche Antwort 3', 'D) Mögliche Antwort 4']
            q.type = 'multiple_choice'
          }
          break
        case 'to_open':
          delete q.options
          q.type = 'open'
          break
        default:
          break
      }
      updated[questionIndex] = q
      return updated
    })
    markUnsaved()
    setSuccessMessage(`KI-Aktion "${KI_ACTIONS.find(a => a.id === actionId)?.label}" ausgeführt (lokal).`)
  }

  const handleGenerateImage = async (questionIndex, prompt, style = 'educational') => {
    if (!prompt.trim()) return
    setImageGenerating(true)
    try {
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ prompt, style })
      })
      if (response.ok) {
        const data = await response.json()
        if (data.imageUrl) {
          updateEditedQuestion(questionIndex, 'imageUrl', data.imageUrl)
          setSuccessMessage('Bild wurde erfolgreich generiert!')
        }
      } else {
        const err = await response.json().catch(() => ({}))
        setError(err.error || 'Bildgenerierung fehlgeschlagen.')
      }
    } catch (err) {
      console.error('Image gen error:', err)
      setError('Bildgenerierung fehlgeschlagen. Bitte versuchen Sie es erneut.')
    }
    setImageGenerating(false)
  }

  // ============================================================
  // AUTO-SAVE (10 second debounce)
  // ============================================================
  const autosaveTimerRef = useRef(null)
  const [autosaveStatus, setAutosaveStatus] = useState(null) // null | 'saving' | 'saved' | 'error'

  useEffect(() => {
    if (!editMode || !hasUnsavedChanges || !selectedWorksheet || editedQuestions.length === 0) return

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(async () => {
      setAutosaveStatus('saving')
      const totalPoints = editedQuestions.reduce((sum, q) => q.type === 'image_block' ? sum : sum + (q.points || 1), 0)
      const updatedContent = { ...selectedWorksheet.content, questions: editedQuestions, total_points: totalPoints }
      try {
        const res = await fetch(`/api/worksheets/${selectedWorksheet.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ content: updatedContent })
        })
        if (res.ok) {
          setAutosaveStatus('saved')
          setTimeout(() => setAutosaveStatus(null), 3000)
        } else {
          setAutosaveStatus('error')
        }
      } catch (err) {
        console.error('Autosave error:', err)
        setAutosaveStatus('error')
      }
    }, 10000)

    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current) }
  }, [editMode, hasUnsavedChanges, editedQuestions, selectedWorksheet, token])

  const speakText = async (text) => {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ text, voice: 'nova', speed: 0.9 })
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.play()
      }
    } catch (err) { console.error('TTS error:', err) }
  }

  const saveVersion = async (worksheetId) => {
    try {
      const res = await fetch('/api/collaborate/version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ worksheetId })
      })
      if (res.ok) { setSuccessMessage('Version gespeichert!') }
    } catch (err) { setError('Version speichern fehlgeschlagen.') }
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <motion.div key="create" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }} className="max-w-6xl mx-auto">
      {selectedWorksheet ? (
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Document Preview */}
          <div className={showEditorPanel ? "lg:col-span-8" : "lg:col-span-10 lg:col-start-2"}>
            {/* Top action bar */}
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                {editMode ? (
                  <>
                    <Button size="sm" onClick={saveEdits} className="btn-premium text-xs">
                      <CheckCircle2 className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Speichern & Vorschau</span><span className="sm:hidden">Speichern</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={saveDraft} className="text-xs border-amber-300 text-amber-700 hover:bg-amber-50">
                      <Save className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Als Entwurf</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setUseRichEditor(!useRichEditor)}
                      className={`text-xs ${useRichEditor ? 'border-purple-300 text-purple-700 bg-purple-50' : ''}`}
                      title={useRichEditor ? 'Zum einfachen Editor wechseln' : 'Rich-Text-Editor aktivieren'}>
                      <Pen className="h-4 w-4 mr-1" /> {useRichEditor ? 'Rich-Text' : 'WYSIWYG'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={cancelEdits} className="text-xs">
                      <X className="h-4 w-4 mr-1" /> Abbrechen
                    </Button>
                    {autosaveStatus && (
                      <span className={`text-xs flex items-center gap-1 ml-2 ${autosaveStatus === 'saving' ? 'text-blue-500' : autosaveStatus === 'saved' ? 'text-green-600' : 'text-red-500'}`}>
                        {autosaveStatus === 'saving' && <><motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="inline-block">⟳</motion.span> Speichert...</>}
                        {autosaveStatus === 'saved' && <><CheckCircle2 className="h-3 w-3" /> Auto-gespeichert</>}
                        {autosaveStatus === 'error' && <>⚠ Auto-Save fehlgeschlagen</>}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={startEditMode} className="glass-card border-0 text-xs">
                      <Edit className="h-4 w-4 mr-1" /> Bearbeiten
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExportPDF(selectedWorksheet, 'student')} className="glass-card border-0 text-xs">
                      <Download className="h-4 w-4 mr-1" /> PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExportDOCX(selectedWorksheet, 'student')} className="glass-card border-0 text-xs">
                      <FileText className="h-4 w-4 mr-1" /> Word
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setShareModalOpen(true); loadTeacherClasses(); setShareForm(prev => ({ ...prev, worksheetId: selectedWorksheet.id })) }} className="glass-card border-0 text-xs" title="An Schüler freigeben">
                      <Send className="h-4 w-4 mr-1" /> Freigeben
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => saveVersion(selectedWorksheet.id)} className="glass-card border-0 text-xs" title="Version speichern">
                      <Layers className="h-4 w-4 mr-1" /> Version
                    </Button>
                    {getWorksheetStatus(selectedWorksheet?.id) === 'draft' && (
                      <Badge className="bg-amber-100 text-amber-700 border border-amber-300 text-xs">Entwurf</Badge>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={startNewMaterial} className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50">
                  <PlusCircle className="h-4 w-4 mr-1" /> Neues Material
                </Button>
                {!showEditorPanel && (
                  <Button variant="outline" size="sm" onClick={() => setShowEditorPanel(true)} className="glass-card border-0 text-xs">
                    <PanelRightOpen className="h-4 w-4 mr-1" /> Werkzeuge
                  </Button>
                )}
              </div>
            </div>

            {/* Post-Creation Action Bar */}
            <AnimatePresence>
              {showPostCreationBar && !editMode && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className="mb-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                        <CheckCircle2 className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-gray-900">Material erstellt!</p>
                        <p className="text-xs text-gray-500">Bearbeiten Sie Fragen, passen Sie den Inhalt an oder exportieren Sie direkt.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => { startEditMode(); setShowPostCreationBar(false) }} className="btn-premium text-xs">
                        <Edit className="h-4 w-4 mr-1" /> Jetzt bearbeiten
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { handleExportPDF(selectedWorksheet, 'student'); setShowPostCreationBar(false) }} className="text-xs">
                        <Download className="h-4 w-4 mr-1" /> PDF exportieren
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowPostCreationBar(false)} className="text-xs text-gray-400">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {(() => {
              const isExam = selectedWorksheet.resourceType === 'exam' || selectedWorksheet.content?.resourceType === 'exam'
              const isQuiz = selectedWorksheet.resourceType === 'quiz' || selectedWorksheet.content?.resourceType === 'quiz'
              const showPts = isExam
              const questions = editMode ? editedQuestions : (selectedWorksheet.content?.questions || [])
              const wsTheme = getThemeById(selectedWorksheet.theme || form.theme || 'classic')

              return (
            <div className={`bg-white ${wsTheme.styles.rounded} shadow-lg p-6 sm:p-10 relative overflow-hidden`}>
              {/* Theme decorative top border */}
              <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: `linear-gradient(90deg, ${wsTheme.colors.primary}, ${wsTheme.colors.accent})` }} />

              {/* Header - different for exams */}
              {isExam ? (
                <div className="mb-6 mt-2">
                  <div className="text-center mb-4">
                    <p className="text-xs uppercase tracking-widest mb-2" style={{ color: wsTheme.colors.secondary }}>
                      {wsTheme.decorations?.headerIcon && <span className="mr-1">{wsTheme.decorations.headerIcon}</span>}Prüfung
                    </p>
                    <h2 className={`${wsTheme.styles.titleSize} sm:text-3xl font-bold mb-2 ${wsTheme.styles.fontFamily}`} style={{ color: wsTheme.colors.primary }}>{selectedWorksheet.title}</h2>
                    <div className="flex gap-2 justify-center flex-wrap">
                      <Badge className="border" style={{ backgroundColor: wsTheme.colors.badgeBg, color: wsTheme.colors.badgeText, borderColor: wsTheme.colors.accent + '40' }}>{selectedWorksheet.grade}. Klasse</Badge>
                      <Badge className="border" style={{ backgroundColor: wsTheme.colors.badgeBg, color: wsTheme.colors.badgeText, borderColor: wsTheme.colors.accent + '40' }}>{selectedWorksheet.subject}</Badge>
                      <Badge className="border" style={{ backgroundColor: wsTheme.colors.badgeBg, color: wsTheme.colors.badgeText, borderColor: wsTheme.colors.accent + '40' }}>{DIFFICULTY_LABELS[selectedWorksheet.difficulty] || selectedWorksheet.difficulty}</Badge>
                    </div>
                  </div>
                  <div className="border rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-sm" style={{ backgroundColor: wsTheme.colors.headerBg, borderColor: wsTheme.colors.accent + '30' }}>
                    <div><p className="text-xs" style={{ color: wsTheme.colors.secondary }}>Aufgaben</p><p className="font-bold" style={{ color: wsTheme.colors.primary }}>{questions.length}</p></div>
                    <div><p className="text-xs" style={{ color: wsTheme.colors.secondary }}>Punkte</p><p className="font-bold" style={{ color: wsTheme.colors.primary }}>{selectedWorksheet.content?.total_points || '–'}</p></div>
                    <div><p className="text-xs" style={{ color: wsTheme.colors.secondary }}>Zeit</p><p className="font-bold" style={{ color: wsTheme.colors.primary }}>{selectedWorksheet.content?.estimated_time || '–'}</p></div>
                    <div><p className="text-xs" style={{ color: wsTheme.colors.secondary }}>Notenskala</p><p className="font-bold" style={{ color: wsTheme.colors.primary }}>1–6</p></div>
                  </div>
                  <div className="mt-4 pb-2" style={{ borderBottom: `1px solid ${wsTheme.colors.accent}30` }}>
                    <p className="text-sm text-gray-500">Name: _______________________________ Datum: _______________</p>
                  </div>
                </div>
              ) : (
                <div className="mb-6 text-center mt-2">
                  {wsTheme.decorations?.headerIcon && (
                    <p className="text-2xl mb-2">{wsTheme.decorations.headerIcon}</p>
                  )}
                  <h2 className={`${wsTheme.styles.titleSize} sm:text-3xl font-bold mb-3 ${wsTheme.styles.fontFamily}`} style={{ color: wsTheme.colors.primary }}>{selectedWorksheet.title}</h2>
                  <div className="flex gap-2 justify-center flex-wrap">
                    <Badge className="border" style={{ backgroundColor: wsTheme.colors.badgeBg, color: wsTheme.colors.badgeText, borderColor: wsTheme.colors.accent + '40' }}>{selectedWorksheet.grade}. Klasse</Badge>
                    <Badge className="border" style={{ backgroundColor: wsTheme.colors.badgeBg, color: wsTheme.colors.badgeText, borderColor: wsTheme.colors.accent + '40' }}>{selectedWorksheet.subject}</Badge>
                    <Badge className="border" style={{ backgroundColor: wsTheme.colors.badgeBg, color: wsTheme.colors.badgeText, borderColor: wsTheme.colors.accent + '40' }}>{DIFFICULTY_LABELS[selectedWorksheet.difficulty] || selectedWorksheet.difficulty}</Badge>
                    <Badge className="border" style={{ backgroundColor: wsTheme.colors.badgeBg, color: wsTheme.colors.badgeText, borderColor: wsTheme.colors.accent + '40' }}>{questions.length} Fragen</Badge>
                  </div>
                </div>
              )}
              {/* Themed divider */}
              {wsTheme.decorations?.divider ? (
                <div className="text-center text-xs py-3 select-none" style={{ color: wsTheme.colors.accent + '80' }}>{wsTheme.decorations.divider}</div>
              ) : (
                <Separator className="mb-6" style={{ backgroundColor: wsTheme.colors.accent + '25' }} />
              )}

              {/* EDIT MODE */}
              {editMode ? (
                <div className="space-y-3">
                <Reorder.Group
                  axis="y"
                  values={editedQuestions}
                  onReorder={(newOrder) => {
                    newOrder.forEach((q, i) => { q.number = i + 1 })
                    setEditedQuestions([...newOrder])
                    markUnsaved()
                  }}
                  className="space-y-3"
                >
                  {editedQuestions.map((q, index) => (
                    <Reorder.Item key={q._dragId} value={q}
                      whileDrag={{ scale: 1.02, boxShadow: '0 8px 25px rgba(0,0,0,0.15)', zIndex: 50 }}
                      className={`group border rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${activeKiAction?.questionIndex === index ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}
                    >
                      {/* Question Header Bar */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }}>
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-gray-400" />
                          <span className="text-xs font-bold text-gray-500">#{q.number}</span>
                          <Select value={q.type || 'open'} onValueChange={(val) => changeQuestionType(index, val)}>
                            <SelectTrigger className="h-7 text-xs border-0 bg-blue-50 text-blue-700 w-auto gap-1 px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {QUESTION_TYPES.map(qt => (
                                <SelectItem key={qt.id} value={qt.id}>
                                  <span className="flex items-center gap-1.5"><qt.icon className="h-3 w-3" />{qt.label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {showPts && (
                            <div className="flex items-center gap-1">
                              <Input type="number" min={1} max={10} value={q.points || 1} onChange={(e) => updateEditedQuestion(index, 'points', parseInt(e.target.value) || 1)}
                                className="h-7 w-14 text-xs text-center bg-white border-gray-200" />
                              <span className="text-xs text-gray-400">P</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Button variant="ghost" size="sm" onClick={() => moveQuestion(index, 'up')} disabled={index === 0} className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"><ArrowUp className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => moveQuestion(index, 'down')} disabled={index === editedQuestions.length - 1} className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"><ArrowDown className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => duplicateQuestion(index)} className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600" title="Duplizieren"><Copy className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => removeQuestion(index)} className="h-7 w-7 p-0 text-gray-400 hover:text-red-600" title="Löschen"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>

                      {/* Question Body */}
                      <div className="p-4 space-y-3">
                        {q.type !== 'image_block' && (useRichEditor ? (
                          <RichTextEditor
                            content={q.question}
                            onChange={(html) => updateEditedQuestion(index, 'question', html.replace(/<[^>]*>/g, '').trim() ? html : '')}
                            placeholder="Fragetext eingeben..."
                            minHeight="60px"
                          />
                        ) : (
                          <Textarea value={q.question} onChange={(e) => updateEditedQuestion(index, 'question', e.target.value)}
                            placeholder="Fragetext eingeben..." className="text-sm min-h-[50px] bg-gray-50 border-gray-200 focus:bg-white resize-y" />
                        ))}

                        {/* MC / True-False / Either-Or: Options editor */}
                        {(q.type === 'multiple_choice' || q.type === 'true_false' || q.type === 'either_or' || (q.options && !['matching', 'ordering', 'fill_blank'].includes(q.type))) && q.options && (
                          <div className="space-y-2">
                            <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Antwortmöglichkeiten</Label>
                            {q.options.map((opt, oi) => (
                              <div key={oi} className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${opt === q.answer ? 'bg-green-100' : 'bg-blue-50'}`}>
                                  <span className={`text-xs font-bold ${opt === q.answer ? 'text-green-600' : 'text-blue-600'}`}>{String.fromCharCode(65 + oi)}</span>
                                </div>
                                <Input value={opt} onChange={(e) => updateEditedOption(index, oi, e.target.value)} className="text-sm bg-gray-50 focus:bg-white flex-1" />
                                <button onClick={() => updateEditedQuestion(index, 'answer', opt)} className={`h-6 w-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${opt === q.answer ? 'border-green-500 bg-green-500' : 'border-gray-300 hover:border-green-400'}`} title="Als korrekte Antwort markieren">
                                  {opt === q.answer && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                                </button>
                                {q.type !== 'true_false' && q.type !== 'either_or' && (
                                  <Button variant="ghost" size="sm" onClick={() => removeOptionFromQuestion(index, oi)} className="h-7 w-7 p-0 text-gray-300 hover:text-red-500"><X className="h-3 w-3" /></Button>
                                )}
                              </div>
                            ))}
                            {q.type !== 'true_false' && q.type !== 'either_or' && (
                              <Button variant="ghost" size="sm" onClick={() => addOptionToQuestion(index)} className="text-xs text-blue-600 hover:text-blue-700">
                                <PlusCircle className="h-3 w-3 mr-1" /> Option hinzufügen
                              </Button>
                            )}
                          </div>
                        )}

                        {/* Fill in the Blank editor */}
                        {q.type === 'fill_blank' && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Lückentext</Label>
                              <span className="text-[10px] px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">
                                {(q.question.match(/___+/g) || []).length} {(q.question.match(/___+/g) || []).length === 1 ? 'Lücke' : 'Lücken'}
                              </span>
                            </div>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 flex items-start gap-2">
                              <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                              <span>Markiere Lücken mit <code className="bg-blue-100 px-1 rounded font-mono">___</code> (drei Unterstriche) im Text oben. Beispiel: «Der ___ frisst gerne ___»</span>
                            </div>
                            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                              <p className="text-[10px] uppercase tracking-wider text-yellow-600 font-semibold mb-2">Vorschau Schülerversion</p>
                              <p className="text-sm text-gray-700 leading-loose">
                                {q.question.split(/___+/).map((part, pi, arr) => (
                                  <span key={pi}>
                                    {part}
                                    {pi < arr.length - 1 && (
                                      <span className="inline-block mx-1 min-w-[80px] border-b-2 border-yellow-500 text-center pb-0.5">
                                        <span className="text-[10px] text-yellow-400">{pi + 1}</span>
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </p>
                            </div>
                            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                              <p className="text-[10px] uppercase tracking-wider text-green-600 font-semibold mb-2">Vorschau Lehrerversion</p>
                              <p className="text-sm text-gray-700 leading-loose">
                                {q.question.split(/___+/).map((part, pi, arr) => (
                                  <span key={pi}>
                                    {part}
                                    {pi < arr.length - 1 && (
                                      <span className="inline-block mx-1 px-3 py-0.5 bg-green-200 border-b-2 border-green-500 rounded text-green-800 font-semibold text-xs">
                                        {(q.answer || '').split(',')[pi]?.trim() || `Lücke ${pi + 1}`}
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Lösungswörter</Label>
                              {(q.question.match(/___+/g) || []).map((_, gi) => (
                                <div key={gi} className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[10px] font-bold text-green-600">{gi + 1}</span>
                                  </div>
                                  <Input
                                    value={(q.answer || '').split(',')[gi]?.trim() || ''}
                                    onChange={(e) => {
                                      const words = (q.answer || '').split(',').map(w => w.trim())
                                      while (words.length <= gi) words.push('')
                                      words[gi] = e.target.value
                                      updateEditedQuestion(index, 'answer', words.join(', '))
                                    }}
                                    placeholder={`Lösung für Lücke ${gi + 1}...`}
                                    className="text-sm bg-green-50 border-green-200 focus:bg-white flex-1"
                                  />
                                </div>
                              ))}
                              {(q.question.match(/___+/g) || []).length === 0 && (
                                <p className="text-xs text-gray-400 italic">Fügen Sie ___ im Fragetext ein, um Lücken zu erstellen.</p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Matching / Zuordnung editor */}
                        {q.type === 'matching' && (
                          <div className="space-y-2">
                            <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Zuordnungspaare</Label>
                            <p className="text-[10px] text-gray-500">Schreibe Paare in die Lösung: «links1→rechts1, links2→rechts2»</p>
                            <div className="space-y-2">
                              {(q.answer || '').split(',').filter(Boolean).map((pair, pi) => {
                                const [left, right] = pair.split('→').map(s => s?.trim() || '')
                                return (
                                  <div key={pi} className="flex items-center gap-2">
                                    <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center flex-shrink-0">
                                      <span className="text-[10px] font-bold text-blue-600">{pi + 1}</span>
                                    </div>
                                    <Input value={left} onChange={(e) => {
                                      const pairs = (q.answer || '').split(',').map(p => p.trim())
                                      const [, r] = (pairs[pi] || '').split('→').map(s => s?.trim() || '')
                                      pairs[pi] = `${e.target.value}→${r}`
                                      updateEditedQuestion(index, 'answer', pairs.join(', '))
                                    }} placeholder="Begriff links" className="text-sm bg-blue-50 flex-1" />
                                    <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                    <Input value={right} onChange={(e) => {
                                      const pairs = (q.answer || '').split(',').map(p => p.trim())
                                      const [l] = (pairs[pi] || '').split('→').map(s => s?.trim() || '')
                                      pairs[pi] = `${l}→${e.target.value}`
                                      updateEditedQuestion(index, 'answer', pairs.join(', '))
                                    }} placeholder="Begriff rechts" className="text-sm bg-green-50 flex-1" />
                                    <Button variant="ghost" size="sm" onClick={() => {
                                      const pairs = (q.answer || '').split(',').map(p => p.trim()).filter((_, i) => i !== pi)
                                      updateEditedQuestion(index, 'answer', pairs.join(', '))
                                    }} className="h-7 w-7 p-0 text-gray-300 hover:text-red-500"><X className="h-3 w-3" /></Button>
                                  </div>
                                )
                              })}
                              <Button variant="ghost" size="sm" onClick={() => {
                                const current = q.answer ? q.answer + ', ' : ''
                                updateEditedQuestion(index, 'answer', current + 'Begriff→Zuordnung')
                              }} className="text-xs text-blue-600 hover:text-blue-700">
                                <PlusCircle className="h-3 w-3 mr-1" /> Paar hinzufügen
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Ordering / Reihenfolge editor */}
                        {q.type === 'ordering' && (
                          <div className="space-y-2">
                            <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Richtige Reihenfolge</Label>
                            <p className="text-[10px] text-gray-500">Elemente kommagetrennt in korrekter Reihenfolge eingeben</p>
                            <div className="space-y-1.5">
                              {(q.answer || '').split(',').filter(Boolean).map((item, ii) => (
                                <div key={ii} className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-bold text-indigo-600">{ii + 1}</span>
                                  </div>
                                  <Input value={item.trim()} onChange={(e) => {
                                    const items = (q.answer || '').split(',').map(s => s.trim())
                                    items[ii] = e.target.value
                                    updateEditedQuestion(index, 'answer', items.join(', '))
                                  }} className="text-sm bg-indigo-50 flex-1" />
                                  <Button variant="ghost" size="sm" onClick={() => {
                                    const items = (q.answer || '').split(',').map(s => s.trim())
                                    if (ii > 0) { [items[ii], items[ii-1]] = [items[ii-1], items[ii]] }
                                    updateEditedQuestion(index, 'answer', items.join(', '))
                                  }} disabled={ii === 0} className="h-6 w-6 p-0 text-gray-400"><ArrowUp className="h-3 w-3" /></Button>
                                  <Button variant="ghost" size="sm" onClick={() => {
                                    const items = (q.answer || '').split(',').map(s => s.trim())
                                    if (ii < items.length - 1) { [items[ii], items[ii+1]] = [items[ii+1], items[ii]] }
                                    updateEditedQuestion(index, 'answer', items.join(', '))
                                  }} disabled={ii === (q.answer || '').split(',').filter(Boolean).length - 1} className="h-6 w-6 p-0 text-gray-400"><ArrowDown className="h-3 w-3" /></Button>
                                  <Button variant="ghost" size="sm" onClick={() => {
                                    const items = (q.answer || '').split(',').map(s => s.trim()).filter((_, i) => i !== ii)
                                    updateEditedQuestion(index, 'answer', items.join(', '))
                                  }} className="h-6 w-6 p-0 text-gray-300 hover:text-red-500"><X className="h-3 w-3" /></Button>
                                </div>
                              ))}
                              <Button variant="ghost" size="sm" onClick={() => {
                                const current = q.answer ? q.answer + ', ' : ''
                                updateEditedQuestion(index, 'answer', current + 'Neues Element')
                              }} className="text-xs text-indigo-600 hover:text-indigo-700">
                                <PlusCircle className="h-3 w-3 mr-1" /> Element hinzufügen
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Table / Tabelle editor */}
                        {q.type === 'table' && (
                          <div className="space-y-3">
                            <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Tabelle bearbeiten</Label>
                            <div className="overflow-x-auto border rounded-lg">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-100">
                                  <tr>
                                    {(q.tableHeaders || ['Spalte 1', 'Spalte 2']).map((h, hi) => (
                                      <th key={hi} className="px-2 py-1.5 border-r last:border-r-0">
                                        <Input value={h} onChange={(e) => {
                                          const headers = [...(q.tableHeaders || [])]
                                          headers[hi] = e.target.value
                                          updateEditedQuestion(index, 'tableHeaders', headers)
                                        }} className="text-xs font-semibold h-7 bg-transparent border-0 text-center" placeholder="Überschrift" />
                                      </th>
                                    ))}
                                    <th className="w-8"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(q.tableRows || [['', '']]).map((row, ri) => (
                                    <tr key={ri} className="border-t">
                                      {row.map((cell, ci) => (
                                        <td key={ci} className="px-2 py-1 border-r last:border-r-0">
                                          <Input value={cell} onChange={(e) => {
                                            const rows = (q.tableRows || []).map(r => [...r])
                                            rows[ri][ci] = e.target.value
                                            updateEditedQuestion(index, 'tableRows', rows)
                                          }} className="text-xs h-7 bg-transparent border-0" placeholder="..." />
                                        </td>
                                      ))}
                                      <td className="w-8 text-center">
                                        <Button variant="ghost" size="sm" onClick={() => {
                                          const rows = (q.tableRows || []).filter((_, i) => i !== ri)
                                          updateEditedQuestion(index, 'tableRows', rows.length ? rows : [new Array((q.tableHeaders || []).length).fill('')])
                                        }} className="h-6 w-6 p-0 text-gray-300 hover:text-red-500"><X className="h-3 w-3" /></Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => {
                                const colCount = (q.tableHeaders || []).length
                                const rows = [...(q.tableRows || []), new Array(colCount).fill('')]
                                updateEditedQuestion(index, 'tableRows', rows)
                              }} className="text-xs text-blue-600"><PlusCircle className="h-3 w-3 mr-1" /> Zeile</Button>
                              <Button variant="ghost" size="sm" onClick={() => {
                                const headers = [...(q.tableHeaders || []), `Spalte ${(q.tableHeaders || []).length + 1}`]
                                const rows = (q.tableRows || []).map(r => [...r, ''])
                                updateEditedQuestion(index, 'tableHeaders', headers)
                                updateEditedQuestion(index, 'tableRows', rows)
                              }} className="text-xs text-blue-600"><PlusCircle className="h-3 w-3 mr-1" /> Spalte</Button>
                              {(q.tableHeaders || []).length > 2 && (
                                <Button variant="ghost" size="sm" onClick={() => {
                                  const headers = (q.tableHeaders || []).slice(0, -1)
                                  const rows = (q.tableRows || []).map(r => r.slice(0, -1))
                                  updateEditedQuestion(index, 'tableHeaders', headers)
                                  updateEditedQuestion(index, 'tableRows', rows)
                                }} className="text-xs text-red-500"><Minus className="h-3 w-3 mr-1" /> Spalte entfernen</Button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Math / Rechenfrage editor */}
                        {q.type === 'math' && (
                          <div className="space-y-2">
                            <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Rechenaufgabe</Label>
                            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                              <p className="text-lg font-mono font-bold text-gray-800">{q.question.replace(/^Berechne:\s*/i, '')}</p>
                            </div>
                            <div>
                              <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Lösung / Lösungsweg</Label>
                              <Textarea value={q.answer || ''} onChange={(e) => updateEditedQuestion(index, 'answer', e.target.value)}
                                placeholder="z.B. 42 oder '3 × 14 = 42'" className="text-sm bg-green-50 border-green-200 focus:bg-white mt-1 font-mono min-h-[60px]" />
                            </div>
                          </div>
                        )}

                        {/* Image / Bilderfrage editor with KI generation */}
                        {q.type === 'image' && (
                          <div className="space-y-2">
                            <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Bilderfrage</Label>
                            <div className="bg-pink-50 border-2 border-dashed border-pink-300 rounded-lg p-4 text-center">
                              {q.imageUrl ? (
                                <div className="space-y-2">
                                  <img src={q.imageUrl} alt="Aufgabenbild" className="max-h-48 mx-auto rounded-lg object-contain shadow-sm" />
                                  <div className="flex items-center justify-center gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => updateEditedQuestion(index, 'imageUrl', '')} className="text-xs text-red-500">
                                      <Trash2 className="h-3 w-3 mr-1" /> Entfernen
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => updateEditedQuestion(index, 'imageUrl', '')} className="text-xs text-blue-500">
                                      <RefreshCw className="h-3 w-3 mr-1" /> Neues Bild
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <Image className="h-10 w-10 mx-auto text-pink-400 mb-1" />
                                  <div className="bg-white rounded-xl p-4 border border-pink-200 max-w-md mx-auto text-left space-y-3">
                                    <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                                      <Sparkles className="h-3.5 w-3.5 text-purple-500" /> KI-Bild generieren
                                    </p>
                                    <Textarea
                                      placeholder="Beschreiben Sie das gewünschte Bild, z.B.&#10;• Ein Schmetterling im Garten&#10;• Verdauungssystem des Menschen&#10;• Mittelalterliches Schloss"
                                      value={imagePrompt}
                                      onChange={(e) => setImagePrompt(e.target.value)}
                                      className="text-xs min-h-[70px] resize-none"
                                    />
                                    <div>
                                      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5">Stil wählen</p>
                                      <div className="grid grid-cols-4 gap-1.5">
                                        {[
                                          { id: 'educational', label: 'Lehr-Illustration', emoji: '\u{1F4DA}' },
                                          { id: 'kindgerecht', label: 'Kindgerecht', emoji: '\u{1F9D2}' },
                                          { id: 'cartoon', label: 'Cartoon', emoji: '\u{1F3A8}' },
                                          { id: 'realistic', label: 'Realistisch', emoji: '\u{1F4F7}' },
                                          { id: 'diagram', label: 'Diagramm', emoji: '\u{1F4CA}' },
                                          { id: 'line-art', label: 'Strichzeichnung', emoji: '\u{270F}\u{FE0F}' },
                                          { id: 'schwarz-weiss', label: 'Schwarz-Weiss', emoji: '\u{1F5A4}' },
                                          { id: 'druckfreundlich', label: 'Druckfreundlich', emoji: '\u{1F5A8}\u{FE0F}' },
                                        ].map(s => (
                                          <button key={s.id} onClick={() => setImageStyle(s.id)}
                                            className={`text-[10px] px-2 py-1.5 rounded-lg border transition-all text-center ${imageStyle === s.id ? 'bg-purple-100 border-purple-300 text-purple-700 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-purple-200 hover:bg-purple-50/50'}`}>
                                            <span className="block text-sm mb-0.5">{s.emoji}</span>
                                            {s.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <Button size="sm" className="w-full btn-premium text-xs h-9"
                                      disabled={imageGenerating || !imagePrompt.trim()}
                                      onClick={() => handleGenerateImage(index, imagePrompt, imageStyle)}>
                                      {imageGenerating ? (
                                        <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Bild wird generiert...</>
                                      ) : (
                                        <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Bild generieren</>
                                      )}
                                    </Button>
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                    <div className="flex-1 h-px bg-gray-200" />
                                    <span>oder Bild-URL einfügen</span>
                                    <div className="flex-1 h-px bg-gray-200" />
                                  </div>
                                  <Input placeholder="https://..." onChange={(e) => updateEditedQuestion(index, 'imageUrl', e.target.value)}
                                    className="text-xs bg-white max-w-sm mx-auto" />
                                </div>
                              )}
                            </div>
                            <div>
                              <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Erwartete Antwort</Label>
                              <Input value={q.answer || ''} onChange={(e) => updateEditedQuestion(index, 'answer', e.target.value)}
                                placeholder="Beschreibung / Antwort zum Bild..." className="text-sm bg-green-50 border-green-200 focus:bg-white mt-1" />
                            </div>
                          </div>
                        )}

                        {/* Image Block editor */}
                        {q.type === 'image_block' && (
                          <div className="space-y-3">
                            <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Bildfeld</Label>

                            {/* Size & Alignment controls */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5">Grösse</p>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {IMAGE_SIZES.map(s => (
                                    <button key={s.id} onClick={() => updateEditedQuestion(index, 'imageSize', s.id)}
                                      className={`text-[10px] px-2 py-1.5 rounded-lg border transition-all text-center ${(q.imageSize || 'medium') === s.id ? 'bg-teal-100 border-teal-300 text-teal-700 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-teal-200'}`}>
                                      {s.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5">Ausrichtung</p>
                                <div className="flex gap-1.5">
                                  {IMAGE_ALIGNMENTS.map(a => (
                                    <button key={a.id} onClick={() => updateEditedQuestion(index, 'imageAlignment', a.id)}
                                      className={`flex-1 flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 rounded-lg border transition-all ${(q.imageAlignment || 'center') === a.id ? 'bg-teal-100 border-teal-300 text-teal-700 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-teal-200'}`}>
                                      <a.icon className="h-3 w-3" />
                                      {a.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Image content: upload or AI generate */}
                            <div className="bg-teal-50 border-2 border-dashed border-teal-300 rounded-lg p-4 text-center">
                              {q.imageUrl ? (
                                <div className="space-y-2">
                                  <div className={`flex ${q.imageAlignment === 'left' ? 'justify-start' : q.imageAlignment === 'right' ? 'justify-end' : 'justify-center'}`}>
                                    <img src={q.imageUrl} alt="Bild" className="rounded-lg object-contain shadow-sm border"
                                      style={{ maxWidth: IMAGE_SIZES.find(s => s.id === (q.imageSize || 'medium'))?.width || '50%', maxHeight: '200px' }} />
                                  </div>
                                  <div className="flex items-center justify-center gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => updateEditedQuestion(index, 'imageUrl', '')} className="text-xs text-red-500">
                                      <Trash2 className="h-3 w-3 mr-1" /> Entfernen
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <ImagePlus className="h-10 w-10 mx-auto text-teal-400 mb-1" />

                                  {/* File Upload */}
                                  <div>
                                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-teal-200 rounded-lg cursor-pointer hover:bg-teal-50 transition-colors">
                                      <Upload className="h-4 w-4 text-teal-600" />
                                      <span className="text-xs font-medium text-teal-700">Bild hochladen</span>
                                      <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (!file) return
                                        const reader = new FileReader()
                                        reader.onload = (ev) => updateEditedQuestion(index, 'imageUrl', ev.target.result)
                                        reader.readAsDataURL(file)
                                      }} />
                                    </label>
                                  </div>

                                  {/* AI Generate */}
                                  <div className="bg-white rounded-xl p-4 border border-teal-200 max-w-md mx-auto text-left space-y-3">
                                    <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                                      <Sparkles className="h-3.5 w-3.5 text-purple-500" /> KI-Bild generieren
                                    </p>
                                    <Textarea
                                      placeholder="Beschreiben Sie das gewünschte Bild, z.B.&#10;• Ein Schmetterling im Garten&#10;• Verdauungssystem des Menschen"
                                      value={imagePrompt}
                                      onChange={(e) => setImagePrompt(e.target.value)}
                                      className="text-xs min-h-[60px] resize-none"
                                    />
                                    <div>
                                      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5">Stil wählen</p>
                                      <div className="grid grid-cols-4 gap-1.5">
                                        {[
                                          { id: 'educational', label: 'Lehr-Illustration', emoji: '\u{1F4DA}' },
                                          { id: 'kindgerecht', label: 'Kindgerecht', emoji: '\u{1F9D2}' },
                                          { id: 'cartoon', label: 'Cartoon', emoji: '\u{1F3A8}' },
                                          { id: 'realistic', label: 'Realistisch', emoji: '\u{1F4F7}' },
                                          { id: 'diagram', label: 'Diagramm', emoji: '\u{1F4CA}' },
                                          { id: 'line-art', label: 'Strichzeichnung', emoji: '\u{270F}\u{FE0F}' },
                                          { id: 'schwarz-weiss', label: 'Schwarz-Weiss', emoji: '\u{1F5A4}' },
                                          { id: 'druckfreundlich', label: 'Druckfreundlich', emoji: '\u{1F5A8}\u{FE0F}' },
                                        ].map(s => (
                                          <button key={s.id} onClick={() => setImageStyle(s.id)}
                                            className={`text-[10px] px-2 py-1.5 rounded-lg border transition-all text-center ${imageStyle === s.id ? 'bg-purple-100 border-purple-300 text-purple-700 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-purple-200 hover:bg-purple-50/50'}`}>
                                            <span className="block text-sm mb-0.5">{s.emoji}</span>
                                            {s.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <Button size="sm" className="w-full btn-premium text-xs h-9"
                                      disabled={imageGenerating || !imagePrompt.trim()}
                                      onClick={() => handleGenerateImage(index, imagePrompt, imageStyle)}>
                                      {imageGenerating ? (
                                        <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Bild wird generiert...</>
                                      ) : (
                                        <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Bild generieren</>
                                      )}
                                    </Button>
                                  </div>

                                  {/* URL input */}
                                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                    <div className="flex-1 h-px bg-gray-200" />
                                    <span>oder Bild-URL einfügen</span>
                                    <div className="flex-1 h-px bg-gray-200" />
                                  </div>
                                  <Input placeholder="https://..." onChange={(e) => updateEditedQuestion(index, 'imageUrl', e.target.value)}
                                    className="text-xs bg-white max-w-sm mx-auto" />
                                </div>
                              )}
                            </div>

                            {/* Caption */}
                            <div>
                              <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Bildunterschrift (optional)</Label>
                              <Input value={q.imageCaption || ''} onChange={(e) => updateEditedQuestion(index, 'imageCaption', e.target.value)}
                                placeholder="z.B. Abbildung 1: Der Wasserkreislauf" className="text-sm mt-1" />
                            </div>
                          </div>
                        )}

                        {/* Open / Generic answer field */}
                        {(q.type === 'open' || (!['multiple_choice', 'true_false', 'either_or', 'fill_blank', 'matching', 'ordering', 'math', 'image', 'image_block'].includes(q.type) && !q.options)) && (
                          <div className="space-y-3">
                            <div>
                              <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Erwartete Antwort / Lösung</Label>
                              <Textarea value={q.answer || ''} onChange={(e) => updateEditedQuestion(index, 'answer', e.target.value)}
                                placeholder="Musterantwort eingeben..." className="text-sm bg-green-50 border-green-200 focus:bg-white mt-1 min-h-[60px]" />
                            </div>
                            {/* Line count control for writing space */}
                            <div>
                              <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Schreiblinien für Schüler</Label>
                              <div className="flex items-center gap-3 mt-1.5">
                                <button onClick={() => updateEditedQuestion(index, 'lineCount', Math.max(1, (q.lineCount || 3) - 1))}
                                  className="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-30"
                                  disabled={(q.lineCount || 3) <= 1}>
                                  <Minus className="h-3.5 w-3.5 text-gray-600" />
                                </button>
                                <div className="flex items-center gap-1.5 min-w-[80px] justify-center">
                                  <div className="flex gap-0.5">
                                    {Array.from({ length: Math.min(q.lineCount || 3, 10) }).map((_, i) => (
                                      <div key={i} className="w-4 h-[2px] bg-gray-400 rounded" />
                                    ))}
                                  </div>
                                  <span className="text-sm font-semibold text-gray-700 ml-1">{q.lineCount || 3}</span>
                                </div>
                                <button onClick={() => updateEditedQuestion(index, 'lineCount', Math.min(12, (q.lineCount || 3) + 1))}
                                  className="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-30"
                                  disabled={(q.lineCount || 3) >= 12}>
                                  <PlusCircle className="h-3.5 w-3.5 text-gray-600" />
                                </button>
                                <span className="text-xs text-gray-400 ml-1">{(q.lineCount || 3) <= 2 ? 'Wenig Platz' : (q.lineCount || 3) <= 5 ? 'Normal' : (q.lineCount || 3) <= 8 ? 'Viel Platz' : 'Sehr viel Platz'}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* KI Actions Bar */}
                      {q.type !== 'image_block' && <div className="px-4 py-2 border-t bg-gradient-to-r from-purple-50/50 to-blue-50/50">
                        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                          <Wand2 className="h-3.5 w-3.5 text-purple-500 flex-shrink-0 mr-1" />
                          {KI_ACTIONS.slice(0, 6).map(action => (
                            <button key={action.id} onClick={() => handleKiAction(index, action.id)}
                              disabled={kiActionLoading}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-white border border-gray-200 text-gray-600 hover:border-purple-300 hover:text-purple-700 hover:bg-purple-50 transition-all whitespace-nowrap flex-shrink-0 disabled:opacity-50">
                              <action.icon className="h-2.5 w-2.5" />
                              {action.label}
                            </button>
                          ))}
                          <Select onValueChange={(val) => handleKiAction(index, val)}>
                            <SelectTrigger className="h-6 text-[10px] border-gray-200 bg-white w-auto gap-1 px-2 flex-shrink-0">
                              <MoreHorizontal className="h-2.5 w-2.5" />
                              <span>Mehr</span>
                            </SelectTrigger>
                            <SelectContent>
                              {KI_ACTIONS.slice(6).map(action => (
                                <SelectItem key={action.id} value={action.id}>
                                  <span className="flex items-center gap-1.5 text-xs"><action.icon className="h-3 w-3" />{action.label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>}

                      {/* KI Action Loading overlay */}
                      {activeKiAction?.questionIndex === index && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 py-2 bg-purple-50 border-t border-purple-200">
                          <div className="flex items-center gap-2">
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                              <Wand2 className="h-4 w-4 text-purple-500" />
                            </motion.div>
                            <span className="text-xs text-purple-700 font-medium">KI bearbeitet Frage...</span>
                          </div>
                        </motion.div>
                      )}
                    </Reorder.Item>
                  ))}
                </Reorder.Group>

                  {/* Add Question Button with Type Selector */}
                  <div className="relative">
                    {showQuestionTypeSelector === 'bottom' ? (
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-white border-2 border-dashed border-blue-300 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <Label className="text-sm font-semibold text-gray-700">Frageart wählen</Label>
                          <Button variant="ghost" size="sm" onClick={() => setShowQuestionTypeSelector(false)} className="h-7 w-7 p-0"><X className="h-4 w-4" /></Button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {QUESTION_TYPES.map(qt => (
                            <button key={qt.id} onClick={() => addQuestionOfType(qt.id)}
                              className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-all text-left">
                              <qt.icon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                              <span className="text-xs font-medium text-gray-700">{qt.label}</span>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    ) : (
                      <Button variant="outline" className="w-full border-dashed border-2 py-6 text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50/50" onClick={() => setShowQuestionTypeSelector('bottom')}>
                        <PlusCircle className="h-5 w-5 mr-2" /> Frage hinzufügen
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                /* PREVIEW MODE */
                <div className={wsTheme.styles.questionSpacing}>
                  {questions.map((q, index) => {
                    const qDecoration = getQuestionDecoration(wsTheme, index)
                    return (
                    <motion.div key={index} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.04 }}
                      className={`${wsTheme.styles.questionStyle.includes('border-l') ? 'pl-5' : 'p-4'} py-3 transition-smooth ${wsTheme.styles.rounded}`}
                      style={{
                        borderLeftColor: wsTheme.styles.questionStyle.includes('border-l') ? wsTheme.colors.questionBorder : undefined,
                        borderColor: wsTheme.styles.questionStyle.includes('border-2') ? wsTheme.colors.questionBorder : undefined,
                        backgroundColor: wsTheme.colors.questionBg + '60',
                        borderLeftWidth: wsTheme.styles.questionStyle.includes('border-l-4') ? '4px' : undefined,
                        borderStyle: wsTheme.styles.questionStyle.includes('dashed') ? 'dashed' : undefined,
                      }}>
                      {q.type !== 'image_block' ? (
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className={`font-semibold text-base text-gray-900 flex-1 ${wsTheme.styles.fontFamily}`}>
                          {qDecoration && <span className="mr-1.5">{qDecoration}</span>}
                          {q.number}. {q.question}
                          {showPts && <Badge className="ml-2 text-xs" style={{ backgroundColor: wsTheme.colors.badgeBg, color: wsTheme.colors.badgeText }}>{q.points || 1}P</Badge>}
                          {q.type && <Badge variant="outline" className="ml-2 text-[10px] text-gray-400">{QUESTION_TYPES.find(t => t.id === q.type)?.label || q.type}</Badge>}
                        </p>
                        <button onClick={() => speakText(q.question)} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors" title="Frage vorlesen">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
                        </button>
                      </div>
                      ) : null}

                      {/* True-False: dedicated layout — always exactly 2 boxes */}
                      {q.type === 'true_false' && (
                        <div className="flex gap-3 ml-1 mt-3">
                          {[{ label: 'Wahr', isWahr: true }, { label: 'Falsch', isWahr: false }].map((tf, i) => (
                            <div key={i} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 flex-1 justify-center ${tf.isWahr ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
                              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${tf.isWahr ? 'border-green-400' : 'border-red-400'}`} />
                              <span className={`text-sm font-medium ${tf.isWahr ? 'text-green-700' : 'text-red-700'}`}>{tf.label}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* MC / Either-Or options */}
                      {q.options && ['multiple_choice', 'either_or'].includes(q.type || 'multiple_choice') && (
                        <div className="space-y-2 ml-1 mt-2">
                          {q.options.map((option, i) => (
                            <div key={i} className="flex items-start gap-3 text-gray-800 text-sm">
                              <span className="w-5 h-5 mt-0.5 border-2 border-gray-400 rounded-sm inline-flex items-center justify-center flex-shrink-0 text-[10px] font-semibold text-gray-500">
                                {String.fromCharCode(65 + i)}
                              </span>
                              <span className="leading-relaxed">{option.replace(/^[A-Z]\)\s*/, '')}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Fill in the blank preview */}
                      {q.type === 'fill_blank' && (
                        <div className="mt-2 ml-1 rounded-lg p-3 border" style={{ backgroundColor: wsTheme.colors.primaryLight + '30', borderColor: wsTheme.colors.accent + '30' }}>
                          <p className="text-sm text-gray-700 leading-loose">
                            {q.question.split(/___+/).map((part, pi, arr) => (
                              <span key={pi}>
                                {part}
                                {pi < arr.length - 1 && (
                                  <span className="inline-block mx-1 min-w-[80px] border-b-2 text-center align-bottom" style={{ borderColor: wsTheme.colors.accent }}>
                                    <span className="text-[10px] select-none" style={{ color: wsTheme.colors.accent + '60' }}>{pi + 1}</span>
                                  </span>
                                )}
                              </span>
                            ))}
                          </p>
                        </div>
                      )}

                      {/* Matching preview */}
                      {q.type === 'matching' && q.answer && (() => {
                        const pairs = (q.answer || '').split(',').filter(Boolean)
                        const rightSide = pairs.map((p, i) => ({ text: p.split('→')[1]?.trim(), origIdx: i }))
                        const seed = (q.number || index) * 7 + pairs.length
                        const shuffled = [...rightSide].sort((a, b) => ((a.origIdx * 31 + seed) % 97) - ((b.origIdx * 31 + seed) % 97))
                        return (
                        <div className="mt-3 ml-1 grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            {pairs.map((pair, pi) => (
                              <div key={pi} className="border rounded-lg px-3 py-1.5 text-sm text-gray-700" style={{ backgroundColor: wsTheme.colors.primaryLight + '50', borderColor: wsTheme.colors.accent + '40' }}>
                                {pair.split('→')[0]?.trim()}
                              </div>
                            ))}
                          </div>
                          <div className="space-y-1.5">
                            {shuffled.map((item, pi) => (
                              <div key={pi} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700">
                                {item.text}
                              </div>
                            ))}
                          </div>
                        </div>
                        )
                      })()}

                      {/* Ordering preview */}
                      {q.type === 'ordering' && q.answer && (() => {
                        const items = (q.answer || '').split(',').filter(Boolean).map((s, i) => ({ text: s.trim(), origIdx: i }))
                        const seed = (q.number || index) * 13 + items.length
                        const shuffled = [...items].sort((a, b) => ((a.origIdx * 37 + seed) % 89) - ((b.origIdx * 37 + seed) % 89))
                        return (
                        <div className="mt-3 ml-1 space-y-1.5">
                          {shuffled.map((item, ii) => (
                            <div key={ii} className="flex items-center gap-2 border rounded-lg px-3 py-1.5" style={{ backgroundColor: wsTheme.colors.primaryLight + '40', borderColor: wsTheme.colors.accent + '30' }}>
                              <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: wsTheme.colors.accent + '30', color: wsTheme.colors.primary }}>?</span>
                              <span className="text-sm text-gray-700">{item.text}</span>
                            </div>
                          ))}
                        </div>
                        )
                      })()}

                      {/* Math preview */}
                      {q.type === 'math' && (
                        <div className="mt-3 ml-1">
                          <div className="border rounded-lg p-4 text-center" style={{ backgroundColor: wsTheme.colors.primaryLight + '40', borderColor: wsTheme.colors.accent + '30' }}>
                            <p className="text-lg font-mono font-bold text-gray-800">{q.question.replace(/^Berechne:\s*/i, '')}</p>
                          </div>
                          <div className="mt-3 space-y-3">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <div key={i} className="h-6" style={{ borderBottom: `1px solid ${wsTheme.colors.accent}40` }} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Image preview */}
                      {q.type === 'image' && (
                        <div className="mt-3 ml-1">
                          {q.imageUrl ? (
                            <img src={q.imageUrl} alt="Aufgabenbild" className="max-h-48 rounded-lg object-contain border" />
                          ) : (
                            <div className="border-2 border-dashed rounded-lg p-6 text-center" style={{ backgroundColor: wsTheme.colors.primaryLight + '30', borderColor: wsTheme.colors.accent + '50' }}>
                              <Image className="h-8 w-8 mx-auto mb-1" style={{ color: wsTheme.colors.accent }} />
                              <p className="text-xs" style={{ color: wsTheme.colors.accent }}>Bild wird hier angezeigt</p>
                            </div>
                          )}
                          <div className="mt-3 space-y-3">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <div key={i} className="h-6" style={{ borderBottom: `1px solid ${wsTheme.colors.accent}40` }} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Table preview */}
                      {q.type === 'table' && q.tableHeaders && (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-sm border-collapse border border-gray-300">
                            <thead>
                              <tr>
                                {q.tableHeaders.map((h, hi) => (
                                  <th key={hi} className="border border-gray-300 px-3 py-2 text-left font-semibold bg-gray-100 text-gray-700">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(q.tableRows || []).map((row, ri) => (
                                <tr key={ri}>
                                  {row.map((cell, ci) => (
                                    <td key={ci} className="border border-gray-300 px-3 py-2 text-gray-600 min-h-[32px]">{cell || '\u00A0'}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Image block preview */}
                      {q.type === 'image_block' && (
                        <div className={`mt-3 flex ${q.imageAlignment === 'left' ? 'justify-start' : q.imageAlignment === 'right' ? 'justify-end' : 'justify-center'}`}>
                          <div style={{ width: IMAGE_SIZES.find(s => s.id === (q.imageSize || 'medium'))?.width || '50%' }}>
                            {q.imageUrl ? (
                              <img src={q.imageUrl} alt={q.imageCaption || 'Bild'} className="w-full rounded-lg object-contain border shadow-sm" />
                            ) : (
                              <div className="border-2 border-dashed rounded-lg p-8 text-center" style={{ backgroundColor: wsTheme.colors.primaryLight + '20', borderColor: wsTheme.colors.accent + '40' }}>
                                <ImagePlus className="h-10 w-10 mx-auto mb-2" style={{ color: wsTheme.colors.accent + '80' }} />
                                <p className="text-xs" style={{ color: wsTheme.colors.accent }}>Bildfeld – Bild einfügen</p>
                              </div>
                            )}
                            {q.imageCaption && (
                              <p className="text-xs text-gray-500 italic mt-1.5 text-center">{q.imageCaption}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Writing lines for open/generic questions */}
                      {(q.type === 'open' || (!q.options && !['fill_blank', 'matching', 'ordering', 'math', 'image', 'image_block', 'table'].includes(q.type))) && (
                        <div className="mt-3 ml-1 space-y-3">
                          {Array.from({ length: q.lineCount || ((q.points || 1) >= 3 ? 4 : (q.points || 1) >= 2 ? 3 : 2) }).map((_, i) => (
                            <div key={i} className="h-6" style={{ borderBottom: `1px solid ${wsTheme.colors.accent}40` }} />
                          ))}
                        </div>
                      )}

                      {/* Theme divider between questions */}
                      {wsTheme.decorations?.divider && index < questions.length - 1 && (
                        <div className="text-center text-[10px] mt-3 select-none" style={{ color: wsTheme.colors.accent + '50' }}>{wsTheme.decorations.divider}</div>
                      )}
                    </motion.div>
                  )})}
                </div>
              )}

              {/* Stats */}
              <div className="mt-10 pt-6" style={{ borderTop: `2px solid ${wsTheme.colors.accent}20` }}>
                {showPts ? (
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-4 rounded-xl" style={{ backgroundColor: wsTheme.colors.headerBg }}>
                      <p className="text-xs mb-1" style={{ color: wsTheme.colors.secondary }}>Gesamtpunkte</p>
                      <p className="text-2xl font-bold" style={{ color: wsTheme.colors.primary }}>{selectedWorksheet.content?.total_points}</p>
                    </div>
                    <div className="p-4 rounded-xl" style={{ backgroundColor: wsTheme.colors.headerBg }}>
                      <p className="text-xs mb-1" style={{ color: wsTheme.colors.secondary }}>Geschätzte Zeit</p>
                      <p className="text-2xl font-bold" style={{ color: wsTheme.colors.primary }}>{selectedWorksheet.content?.estimated_time}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-4 rounded-xl" style={{ backgroundColor: wsTheme.colors.headerBg }}>
                    <p className="text-xs mb-1" style={{ color: wsTheme.colors.secondary }}>Geschätzte Bearbeitungszeit</p>
                    <p className="text-2xl font-bold" style={{ color: wsTheme.colors.primary }}>{selectedWorksheet.content?.estimated_time}</p>
                  </div>
                )}
              </div>

              {/* Theme footer decoration */}
              {wsTheme.decorations?.divider && (
                <div className="text-center text-xs mt-4 select-none" style={{ color: wsTheme.colors.accent + '60' }}>{wsTheme.decorations.divider}</div>
              )}

              {/* Teacher Notes */}
              {selectedWorksheet.content?.teacher_notes && (
                <div className="mt-6 p-5 rounded-xl border" style={{ backgroundColor: wsTheme.colors.primaryLight + '30', borderColor: wsTheme.colors.accent + '30' }}>
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2" style={{ color: wsTheme.colors.primary }}>
                    <Lightbulb className="h-4 w-4" /> Lehrernotizen
                  </h4>
                  <p className="text-sm text-gray-700 leading-relaxed">{selectedWorksheet.content.teacher_notes}</p>
                </div>
              )}
            </div>
              )
            })()}
          </div>

          {/* Editor Panel */}
          {/* Mobile overlay backdrop */}
          {showEditorPanel && (
            <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setShowEditorPanel(false)} />
          )}
          <AnimatePresence>
            {showEditorPanel && (
              <motion.div className="fixed right-0 top-0 bottom-0 w-[85vw] max-w-md z-50 overflow-y-auto lg:relative lg:w-auto lg:max-w-none lg:z-auto lg:col-span-4" initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 100 }} transition={{ type: "spring", stiffness: 200, damping: 30 }}>
                <div className="glass-card rounded-2xl lg:rounded-2xl rounded-l-2xl rounded-r-none lg:rounded-r-2xl p-5 sticky top-20 space-y-4 h-full lg:h-auto bg-white lg:bg-transparent overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Werkzeuge</h3>
                    <Button variant="ghost" size="sm" onClick={() => setShowEditorPanel(false)} aria-label="Panel schliessen"><X className="h-4 w-4" /></Button>
                  </div>
                  <Separator />

                  {/* Difficulty */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Schwierigkeit anpassen</Label>
                    <p className="text-xs text-gray-500">Generiert das Material mit anderem Niveau neu.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {['easy', 'medium', 'hard'].map((level) => (
                        <motion.div
                          key={level}
                          whileHover={!generating && selectedWorksheet.difficulty !== level ? { scale: 1.04, y: -1 } : {}}
                          whileTap={!generating && selectedWorksheet.difficulty !== level ? { scale: 0.96 } : {}}
                        >
                          <Button size="sm" variant={selectedWorksheet.difficulty === level ? 'default' : 'outline'} onClick={() => handleRegenerate(selectedWorksheet.id, level)} disabled={generating || selectedWorksheet.difficulty === level} className="w-full transition-colors text-xs">
                            {DIFFICULTY_LABELS[level]}
                          </Button>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                  <Separator />

                  {/* Theme Picker */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2"><Palette className="h-4 w-4" /> Design-Vorlage</Label>
                    <p className="text-xs text-gray-500">Ändert das visuelle Design und den PDF-Export.</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {WORKSHEET_THEMES.map(theme => {
                        const isActive = (selectedWorksheet.theme || form.theme || 'classic') === theme.id
                        return (
                          <motion.button
                            key={theme.id}
                            onClick={() => {
                              setSelectedWorksheet(prev => ({ ...prev, theme: theme.id }))
                              fetch(`/api/worksheets/${selectedWorksheet.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify({ worksheetId: selectedWorksheet.id, theme: theme.id })
                              }).catch(() => {})
                            }}
                            whileHover={{ y: -2, scale: 1.05 }}
                            whileTap={{ scale: 0.94 }}
                            animate={isActive ? { scale: [1, 1.12, 1] } : {}}
                            transition={isActive ? { duration: 0.4 } : { type: 'spring', stiffness: 400, damping: 22 }}
                            className={`relative p-1.5 rounded-lg border text-center ${isActive ? 'shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}
                            style={isActive ? { borderColor: theme.colors.accent } : {}}
                            title={theme.name}>
                            {isActive && (
                              <motion.span
                                layoutId="theme-picker-ring"
                                className="absolute inset-0 rounded-lg ring-2 ring-offset-1 pointer-events-none"
                                style={{ '--tw-ring-color': theme.colors.accent }}
                                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                              />
                            )}
                            <span className="relative text-sm block">{theme.icon}</span>
                            <span className="relative text-[9px] text-gray-500 block leading-tight">{theme.name}</span>
                          </motion.button>
                        )
                      })}
                    </div>
                  </div>
                  <Separator />

                  {/* Export Options */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2"><Download className="h-4 w-4" /> Exportieren</Label>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">PDF</p>
                    <Button className="w-full btn-premium text-sm" size="sm" onClick={() => handleExportPDF(selectedWorksheet, 'student')}>
                      <Download className="h-4 w-4 mr-2" /> PDF Schülerversion
                    </Button>
                    <Button variant="outline" className="w-full text-sm" size="sm" onClick={() => handleExportPDF(selectedWorksheet, 'teacher')}>
                      <Download className="h-4 w-4 mr-2" /> PDF Lehrerversion (mit Lösungen)
                    </Button>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold pt-1">Word (DOCX)</p>
                    <Button variant="outline" className="w-full text-sm border-blue-200 text-blue-700 hover:bg-blue-50" size="sm" onClick={() => handleExportDOCX(selectedWorksheet, 'student')}>
                      <FileText className="h-4 w-4 mr-2" /> Word Schülerversion
                    </Button>
                    <Button variant="outline" className="w-full text-sm border-blue-200 text-blue-700 hover:bg-blue-50" size="sm" onClick={() => handleExportDOCX(selectedWorksheet, 'teacher')}>
                      <FileText className="h-4 w-4 mr-2" /> Word Lehrerversion (mit Lösungen)
                    </Button>
                  </div>
                  <Separator />

                  {/* Actions */}
                  <div className="space-y-2">
                    {!editMode && (
                      <Button className="w-full text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200" size="sm" onClick={startEditMode}>
                        <Edit className="h-4 w-4 mr-2" /> Bearbeiten
                      </Button>
                    )}
                    <Button variant="outline" className="w-full text-sm" size="sm" onClick={() => handleDuplicate(selectedWorksheet)}>
                      <Copy className="h-4 w-4 mr-2" /> Duplizieren
                    </Button>
                    <Button className="w-full text-sm bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700" size="sm" onClick={startNewMaterial}>
                      <PlusCircle className="h-4 w-4 mr-2" /> Neues Material erstellen
                    </Button>
                  </div>
                  {getWorksheetStatus(selectedWorksheet?.id) === 'draft' && (
                    <>
                      <Separator />
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <CircleDot className="h-4 w-4 text-amber-500" />
                          <span className="text-sm font-medium text-amber-800">Entwurf</span>
                        </div>
                        <p className="text-xs text-amber-600">Dieses Material ist noch nicht fertig. Klicken Sie auf "Bearbeiten" um weiterzuarbeiten.</p>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        /* CREATION FORM */
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Gamification Progress */}
          {worksheets.length > 0 && (
            <motion.div
              className="max-w-2xl mx-auto mb-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <Card className="glass-card border-0 bg-gradient-to-r from-blue-50/50 to-purple-50/50">
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <motion.div
                        className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"
                        animate={{ rotate: [0, 8, -4, 0], scale: [1, 1.06, 1] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <Star className="h-5 w-5 text-blue-600" />
                      </motion.div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium text-gray-900">{worksheets.length} Materialien erstellt</p>
                          <span className="text-xs text-gray-500">{exportHistory.length} Exporte</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, worksheets.length * 10)}%` }}
                            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                          />
                        </div>
                      </div>
                    </div>
                    <AnimatePresence>
                      {worksheets.length >= 5 && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.6, rotate: -20 }}
                          animate={{ opacity: 1, scale: 1, rotate: 0 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.3 }}
                        >
                          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-[10px]">
                            <Star className="h-3 w-3 mr-0.5" /> Produktiv!
                          </Badge>
                        </motion.div>
                      )}
                      {worksheets.length >= 10 && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.6, rotate: -20 }}
                          animate={{ opacity: 1, scale: 1, rotate: 0 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.45 }}
                        >
                          <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px]">
                            <Crown className="h-3 w-3 mr-0.5" /> Power-User
                          </Badge>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Quick Actions */}
          <div className="max-w-2xl mx-auto mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button onClick={() => { setActiveView('library') }} className="p-3 rounded-xl bg-white/80 border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all text-center">
              <FolderOpen className="h-5 w-5 text-blue-500 mx-auto mb-1" />
              <p className="text-xs font-medium text-gray-700">Bibliothek</p>
              <p className="text-[10px] text-gray-400">{worksheets.length} Materialien</p>
            </button>
            <button onClick={() => { setActiveView('planner') }} className="p-3 rounded-xl bg-white/80 border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all text-center">
              <Calendar className="h-5 w-5 text-green-500 mx-auto mb-1" />
              <p className="text-xs font-medium text-gray-700">Jahresplaner</p>
              <p className="text-[10px] text-gray-400">{plannerEvents.length} Termine</p>
            </button>
            <button onClick={() => { setActiveView('students'); loadAssignments() }} className="p-3 rounded-xl bg-white/80 border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all text-center">
              <User className="h-5 w-5 text-purple-500 mx-auto mb-1" />
              <p className="text-xs font-medium text-gray-700">Schüler-Modus</p>
              <p className="text-[10px] text-gray-400">Aufgaben freigeben</p>
            </button>
            <button onClick={() => { setActiveView('curriculum') }} className="p-3 rounded-xl bg-white/80 border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all text-center">
              <GraduationCap className="h-5 w-5 text-amber-500 mx-auto mb-1" />
              <p className="text-xs font-medium text-gray-700">Lehrplan 21</p>
              <p className="text-[10px] text-gray-400">Kompetenzen</p>
            </button>
          </div>

          <Card className="glass-card border-0 max-w-2xl mx-auto">
            <CardHeader className="space-y-3">
              <CardTitle className="text-2xl sm:text-3xl flex items-center gap-3">
                <motion.div
                  animate={{ rotate: [0, 12, -8, 0], scale: [1, 1.1, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Sparkles className="h-7 w-7 text-blue-500" />
                </motion.div>
                Material erstellen
              </CardTitle>
              <CardDescription className="text-base">Wählen Sie den Materialtyp und die Einstellungen. Die KI generiert passende Inhalte für Ihre Klasse.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.resourceType === 'dossier' ? handleGenerateDossier : handleGenerate} className="space-y-6">
                {/* Resource Type */}
                <div>
                  <Label className="text-sm font-medium mb-3 block">Materialtyp</Label>
                  <motion.div
                    className="grid grid-cols-2 sm:grid-cols-5 gap-3"
                    initial="hidden"
                    animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
                  >
                    {RESOURCE_TYPES.map(rt => {
                      const isActive = form.resourceType === rt.id
                      return (
                      <motion.button
                        key={rt.id}
                        type="button"
                        onClick={() => setForm({ ...form, resourceType: rt.id })}
                        variants={{ hidden: { opacity: 0, y: 10, scale: 0.94 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 24 } } }}
                        whileHover={{ y: -3, scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        animate={isActive ? { scale: [1, 1.06, 1] } : {}}
                        transition={isActive ? { duration: 0.4 } : undefined}
                        className={`relative p-3 rounded-xl border-2 text-center hover:shadow-md transition-colors ${isActive ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="resource-type-indicator"
                            className="absolute inset-0 rounded-xl ring-2 ring-blue-400/40 pointer-events-none"
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                          />
                        )}
                        <rt.icon className={`relative h-6 w-6 mx-auto mb-2 ${isActive ? 'text-blue-600' : 'text-gray-500'}`} />
                        <span className={`relative text-xs font-medium block ${isActive ? 'text-blue-700' : 'text-gray-700'}`}>{rt.label}</span>
                      </motion.button>
                    )})}
                  </motion.div>
                  <p className="text-xs text-gray-500 mt-2">{RESOURCE_TYPES.find(r => r.id === form.resourceType)?.description}</p>
                </div>

                {/* Topic */}
                <div>
                  <Label className="text-sm font-medium">Thema</Label>
                  <Input placeholder={form.resourceType === 'vocabulary' ? 'z.B. Körperteile, Tiere, Essen und Trinken...' : form.resourceType === 'exam' ? 'z.B. Bruchrechnen Kapitel 3-5, Schweizer Geographie...' : 'z.B. Photosynthese, Bruchrechnen, Schweizer Geschichte...'}
                    value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} required className="input-premium mt-2" />
                  <p className="text-xs text-gray-500 mt-1.5">Je genauer das Thema, desto besser das Ergebnis.</p>
                </div>

                {/* Upload option in creation flow */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Upload className="h-5 w-5 text-blue-500" />
                      <div>
                        <p className="text-sm font-medium text-blue-800">Eigenes Material als Grundlage?</p>
                        <p className="text-xs text-blue-600">Laden Sie ein PDF oder Dokument hoch, aus dem die KI Fragen generiert.</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setActiveView('upload')} className="text-xs flex-shrink-0">
                      <Upload className="h-3.5 w-3.5 mr-1" /> Hochladen
                    </Button>
                  </div>
                </div>

                {/* Grade + Subject */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Klasse</Label>
                    <Select value={form.grade} onValueChange={(value) => {
                      const newSubjects = getSubjectsForGrade(value)
                      const subjectStillValid = newSubjects.includes(form.subject)
                      setForm({ ...form, grade: value, subject: subjectStillValid ? form.subject : newSubjects[0] })
                    }}>
                      <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem disabled value="_header_primar" className="text-xs font-bold text-gray-400 pointer-events-none">Primarstufe</SelectItem>
                        {[1,2,3,4,5,6].map(n => <SelectItem key={n} value={String(n)}>{n}. Klasse</SelectItem>)}
                        <SelectItem disabled value="_header_sek" className="text-xs font-bold text-gray-400 pointer-events-none">Sekundarstufe</SelectItem>
                        {[7,8,9].map(n => <SelectItem key={n} value={String(n)}>{n}. Klasse</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Fach</Label>
                    <Select value={form.subject} onValueChange={(value) => setForm({ ...form, subject: value })}>
                      <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                      <SelectContent>{getSubjectsForGrade(form.grade).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Difficulty */}
                <div>
                  <Label className="text-sm font-medium mb-3 block">Schwierigkeit: <span className="text-blue-600 font-semibold">{DIFFICULTY_LABELS[form.difficulty]}</span></Label>
                  <div className="flex gap-3">
                    {Object.entries(DIFFICULTY_LABELS).map(([key, label]) => (
                      <Button key={key} type="button" variant={form.difficulty === key ? 'default' : 'outline'} onClick={() => setForm({ ...form, difficulty: key })} className="flex-1 transition-smooth">{label}</Button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {form.difficulty === 'easy' && 'Grundverständnis, einfache Wiedergabe, kurze Antworten.'}
                    {form.difficulty === 'medium' && 'Anwendung und Analyse, längere Aufgaben.'}
                    {form.difficulty === 'hard' && 'Synthese und Bewertung, komplexe Problemlösung.'}
                  </p>
                </div>

                {/* LP21 Competency Quick-Select */}
                {(() => {
                  const gradeInt = parseInt(form.grade, 10)
                  const cycleId = gradeInt >= 7 ? 'z3' : gradeInt >= 3 ? 'z2' : 'z1'
                  const cycleAreas = LEHRPLAN_CYCLES.find(c => c.id === cycleId)?.areas || []
                  const matchingArea = cycleAreas.find(a => a.name === form.subject) || cycleAreas.find(a => form.subject.includes(a.name) || a.name.includes(form.subject))
                  const comps = matchingArea?.competencies || []
                  if (comps.length === 0) return null
                  return (
                    <div>
                      <Label className="text-sm font-medium mb-2 block">LP21-Kompetenz <span className="text-gray-400 font-normal">(optional)</span></Label>
                      <Select value={form.competencyCode || '_none'} onValueChange={(v) => setForm({ ...form, competencyCode: v === '_none' ? '' : v })}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Kompetenz wählen..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Keine spezifische Kompetenz</SelectItem>
                          {comps.slice(0, 15).map(c => (
                            <SelectItem key={c.code} value={c.code}>
                              <span className="font-mono text-xs mr-1.5">{c.code}</span> {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.competencyCode && comps.find(c => c.code === form.competencyCode) && (
                        <p className="text-xs text-blue-600 mt-1.5">{comps.find(c => c.code === form.competencyCode)?.description}</p>
                      )}
                    </div>
                  )
                })()}

                {/* Question Types - hidden for dossier */}
                {form.resourceType !== 'dossier' && (
                <div>
                  <Label className="text-sm font-medium mb-3 block">Fragetypen <span className="text-gray-400 font-normal">(optional – leer = gemischt)</span></Label>
                  <div className="flex flex-wrap gap-2">
                    {QUESTION_TYPES.map(qt => (
                      <button key={qt.id} type="button" onClick={() => setSelectedQuestionTypes(prev => prev.includes(qt.id) ? prev.filter(t => t !== qt.id) : [...prev, qt.id])}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-smooth ${selectedQuestionTypes.includes(qt.id) ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                        <qt.icon className="h-3 w-3" />
                        {qt.label}
                      </button>
                    ))}
                  </div>
                  {selectedQuestionTypes.length > 0 && (
                    <p className="text-xs text-blue-600 mt-2">{selectedQuestionTypes.length} Fragetyp{selectedQuestionTypes.length > 1 ? 'en' : ''} ausgewählt – KI erstellt passende Aufgaben</p>
                  )}
                </div>
                )}

                {/* Theme Selector */}
                <div>
                  <Label className="text-sm font-medium mb-3 block flex items-center gap-2">
                    <Palette className="h-4 w-4" /> Design-Vorlage
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {WORKSHEET_THEMES.map(theme => {
                      const isSelected = form.theme === theme.id
                      return (
                        <button key={theme.id} type="button" onClick={() => setForm({ ...form, theme: theme.id })}
                          className={`group relative p-3 rounded-xl border-2 text-center transition-all duration-200 hover:shadow-md ${isSelected ? 'shadow-sm scale-[1.02]' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                          style={isSelected ? { borderColor: theme.colors.accent, backgroundColor: theme.colors.primaryLight + '40' } : {}}>
                          <span className="text-xl block mb-1">{theme.icon}</span>
                          <span className={`text-[11px] font-medium block ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>{theme.name}</span>
                          {isSelected && (
                            <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.colors.accent }}>
                              <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                            </div>
                          )}
                          <div className="flex gap-0.5 justify-center mt-1.5">
                            <div className="w-3 h-1.5 rounded-full" style={{ backgroundColor: theme.colors.primary }} />
                            <div className="w-3 h-1.5 rounded-full" style={{ backgroundColor: theme.colors.accent }} />
                            <div className="w-3 h-1.5 rounded-full" style={{ backgroundColor: theme.colors.primaryLight }} />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{getThemeById(form.theme).description} — druckfreundlich optimiert</p>
                </div>

                {/* Question Count - hidden for dossier */}
                {form.resourceType !== 'dossier' && (
                <div>
                  <Label className="text-sm font-medium mb-3 block">Anzahl Fragen: <span className="text-blue-600 font-semibold">{form.questionCount}</span></Label>
                  <Slider value={[form.questionCount]} onValueChange={(value) => setForm({ ...form, questionCount: value[0] })} min={3} max={25} step={1} className="mt-2" />
                  <div className="flex justify-between text-xs text-gray-400 mt-1"><span>3</span><span>25</span></div>
                </div>
                )}

                {/* Dossier info box */}
                {form.resourceType === 'dossier' && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <BookOpen className="h-5 w-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-indigo-900">Arbeitsdossier (15-20 Seiten)</p>
                      <p className="text-xs text-indigo-700 mt-1">Die KI erstellt ein vollständiges Lerndossier mit Theorie, Übungen, Lernzielen (Lehrplan 21), Zusammenfassung und Lösungen. Die Generierung dauert ca. 30-60 Sekunden.</p>
                    </div>
                  </div>
                </div>
                )}

                {error && (<motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}><Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert></motion.div>)}

                {user?.subscription_tier === 'free' && user?.worksheets_used_this_month >= 5 && (
                  <Alert><AlertDescription className="flex items-center justify-between"><span>Monatliches Limit (5 Materialien) erreicht.</span><Button variant="link" onClick={handleUpgrade} className="ml-2 text-blue-600">Jetzt upgraden</Button></AlertDescription></Alert>
                )}

                <motion.div
                  whileHover={!generating && form.topic.trim() ? { scale: 1.01 } : {}}
                  whileTap={!generating && form.topic.trim() ? { scale: 0.99 } : {}}
                  className="relative"
                >
                  {/* Orbiting sparkles when generating */}
                  {generating && (
                    <>
                      <motion.div
                        className="absolute inset-0 pointer-events-none"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                      >
                        <span className="absolute top-1/2 left-0 -translate-y-1/2 w-2 h-2 bg-blue-400 rounded-full shadow-lg shadow-blue-400/60" />
                      </motion.div>
                      <motion.div
                        className="absolute inset-0 pointer-events-none"
                        animate={{ rotate: -360 }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                      >
                        <span className="absolute top-1/2 right-0 -translate-y-1/2 w-1.5 h-1.5 bg-purple-400 rounded-full shadow-lg shadow-purple-400/60" />
                      </motion.div>
                    </>
                  )}
                  <Button type="submit" className="w-full btn-premium text-lg py-6 relative overflow-hidden group" disabled={generating || !form.topic.trim() || (user?.subscription_tier === 'free' && user?.worksheets_used_this_month >= 5)}>
                    {!generating && form.topic.trim() && (
                      <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />
                    )}
                    <span className="relative flex items-center justify-center">
                      {generating ? (
                        <>
                          <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="mr-2">
                            <Zap className="h-5 w-5" />
                          </motion.span>
                          Wird erstellt...
                        </>
                      ) : (
                        <>
                          <motion.span
                            className="mr-2"
                            animate={{ rotate: [0, 12, -8, 0] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                          >
                            <Sparkles className="h-5 w-5" />
                          </motion.span>
                          {RESOURCE_TYPES.find(r => r.id === form.resourceType)?.label || 'Material'} erstellen
                        </>
                      )}
                    </span>
                  </Button>
                </motion.div>
              </form>
            </CardContent>
          </Card>

          {user?.subscription_tier === 'free' && (
            <Card className="glass-card border-0 max-w-2xl mx-auto mt-8 bg-gradient-to-br from-blue-50 to-purple-50">
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-3"><Crown className="h-6 w-6 text-yellow-500" /> Upgrade auf Premium</CardTitle>
                <CardDescription>Unbegrenzte Materialien für nur CHF 19.90/Monat</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6">
                  {['Unbegrenzte Materialerstellung', 'Alle Fächer und Klassenstufen', 'PDF-Export mit Lösungen und Lehrernotizen', 'Prioritäts-Support'].map((b, i) => (
                    <li key={i} className="flex items-center text-sm"><CheckCircle2 className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" /><span className="text-gray-700">{b}</span></li>
                  ))}
                </ul>
                <Button onClick={handleUpgrade} className="w-full btn-premium bg-gradient-to-r from-blue-600 to-purple-600"><Crown className="h-4 w-4 mr-2" /> Jetzt upgraden</Button>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}
    </motion.div>
  )
}
