'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, Reorder } from 'framer-motion'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Textarea } from '@/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/ui/card'
import { Slider } from '@/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Badge } from '@/ui/badge'
import { ScrollArea } from '@/ui/scroll-area'
import { Separator } from '@/ui/separator'
import { Alert, AlertDescription } from '@/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/tooltip'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/tabs'
import { Progress } from '@/ui/progress'
import { Checkbox } from '@/ui/checkbox'
import { 
  BookOpen, FileText, PlusCircle, Download, Trash2, RefreshCw, 
  Crown, LogOut, Sparkles, Eye, Settings, Command as CommandIcon,
  Edit, Copy, BarChart3, Zap, MessageCircle, Send, X, Save,
  GripVertical, Plus, Minus, Check, Loader2, AlertCircle, ChevronDown,
  Home, FolderOpen, Star, Layout, GraduationCap, Clock, Filter,
  Search, MoreHorizontal, FileUp, FileDown, Archive, History,
  Tag, Folder, Heart, ChevronRight, ArrowLeft, Wand2, Info,
  CheckCircle, Circle, RotateCcw, Undo2, Redo2, ChevronUp, List,
  Grid3X3, Calendar, User, Building, Palette, Languages, HelpCircle,
  Target, BookMarked, Lightbulb, Award, FileCheck, Users
} from 'lucide-react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/ui/command'
import { toast } from 'sonner'

// ==================================================
// CONSTANTS
// ==================================================

const SUBJECTS = [
  { value: 'Deutsch', label: 'Deutsch', icon: '📖' },
  { value: 'Mathematik', label: 'Mathematik', icon: '🔢' },
  { value: 'NMG', label: 'NMG (Natur, Mensch, Gesellschaft)', icon: '🌍' },
  { value: 'Englisch', label: 'Englisch', icon: '🇬🇧' },
  { value: 'Französisch', label: 'Französisch', icon: '🇫🇷' },
]

const GRADES = [
  { value: '1', label: '1. Klasse', cycle: 'Zyklus 1' },
  { value: '2', label: '2. Klasse', cycle: 'Zyklus 1' },
  { value: '3', label: '3. Klasse', cycle: 'Zyklus 1' },
  { value: '4', label: '4. Klasse', cycle: 'Zyklus 2' },
  { value: '5', label: '5. Klasse', cycle: 'Zyklus 2' },
  { value: '6', label: '6. Klasse', cycle: 'Zyklus 2' },
]

const RESOURCE_TYPES = [
  { value: 'worksheet', label: 'Arbeitsblatt', icon: FileText, description: 'Übungsblatt ohne Bewertung' },
  { value: 'exam', label: 'Prüfung', icon: FileCheck, description: 'Mit Punkten und Bewertung' },
  { value: 'quiz', label: 'Quiz', icon: Zap, description: 'Schnelle Lernkontrolle' },
  { value: 'vocabulary', label: 'Vokabeln', icon: Languages, description: 'Wortschatzübungen' },
]

const DIFFICULTY_LEVELS = [
  { value: 'easy', label: 'Einfach', color: 'text-green-600', bg: 'bg-green-50', description: 'Grundlagen und einfache Konzepte' },
  { value: 'medium', label: 'Mittel', color: 'text-amber-600', bg: 'bg-amber-50', description: 'Altersgerechte Herausforderung' },
  { value: 'hard', label: 'Schwierig', color: 'text-red-600', bg: 'bg-red-50', description: 'Für fortgeschrittene Schüler' },
]

const QUESTION_TYPES = [
  { value: 'multiple_choice', label: 'Multiple Choice', icon: '◉' },
  { value: 'short_answer', label: 'Kurzantwort', icon: '✏️' },
  { value: 'long_answer', label: 'Freier Text', icon: '📝' },
  { value: 'gap_text', label: 'Lückentext', icon: '___' },
  { value: 'matching', label: 'Zuordnung', icon: '↔️' },
  { value: 'true_false', label: 'Richtig/Falsch', icon: '✓✗' },
  { value: 'ordering', label: 'Reihenfolge', icon: '123' },
  { value: 'problem_solving', label: 'Problemlösung', icon: '🧩' },
]

const DOCUMENT_STATUSES = {
  draft: { label: 'Entwurf', color: 'text-gray-500', bg: 'bg-gray-100', icon: Circle },
  ready: { label: 'Fertig', color: 'text-green-600', bg: 'bg-green-100', icon: CheckCircle },
  exported: { label: 'Exportiert', color: 'text-blue-600', bg: 'bg-blue-100', icon: FileDown },
  archived: { label: 'Archiviert', color: 'text-amber-600', bg: 'bg-amber-100', icon: Archive },
}

// ==================================================
// NAVIGATION ITEMS
// ==================================================

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'upload', label: 'Material hochladen', icon: FileUp },
  { id: 'create', label: 'Neu erstellen', icon: PlusCircle },
  { id: 'library', label: 'Bibliothek', icon: FolderOpen },
  { id: 'templates', label: 'Vorlagen', icon: Layout },
  { id: 'curriculum', label: 'Lehrplan 21', icon: GraduationCap },
]

const NAV_ITEMS_SECONDARY = [
  { id: 'exports', label: 'Exporte', icon: FileDown },
  { id: 'settings', label: 'Einstellungen', icon: Settings },
]

// Transformation actions for uploaded materials
const TRANSFORM_ACTIONS = [
  { id: 'worksheet', label: 'Arbeitsblatt erstellen', icon: FileText, description: 'Übungsblatt aus dem Material' },
  { id: 'exam', label: 'Prüfung erstellen', icon: FileCheck, description: 'Test mit Punkten und Bewertung' },
  { id: 'quiz', label: 'Quiz erstellen', icon: Zap, description: 'Schnelle Lernkontrolle' },
  { id: 'summary', label: 'Zusammenfassung', icon: List, description: 'Kernpunkte zusammenfassen' },
  { id: 'cloze', label: 'Lückentext', icon: Edit, description: 'Lückentext mit Wortbank' },
  { id: 'simplify', label: 'Vereinfachen', icon: Wand2, description: 'Sprache vereinfachen' },
  { id: 'differentiate', label: 'Differenzieren', icon: BarChart3, description: 'Drei Schwierigkeitsstufen' },
  { id: 'solutions', label: 'Lösungen erstellen', icon: CheckCircle, description: 'Musterlösungen generieren' },
  { id: 'reading_comprehension', label: 'Leseverständnis', icon: BookOpen, description: 'Leseverständnisaufgaben' },
  { id: 'vocabulary', label: 'Vokabeln', icon: Languages, description: 'Wortschatzübungen' },
]

// ==================================================
// MAIN COMPONENT
// ==================================================

const EduFlowApp = () => {
  // Auth state
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' })
  const [authLoading, setAuthLoading] = useState(false)

  // Navigation state
  const [activeView, setActiveView] = useState('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  
  // App state
  const [worksheets, setWorksheets] = useState([])
  const [selectedWorksheet, setSelectedWorksheet] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  // Command Palette
  const [commandOpen, setCommandOpen] = useState(false)

  // Creation wizard state
  const [wizardStep, setWizardStep] = useState(1)
  const [form, setForm] = useState({
    resourceType: 'worksheet',
    topic: '',
    grade: '3',
    subject: 'Deutsch',
    difficulty: 'medium',
    questionCount: 10,
    learningGoals: [],
    mode: 'worksheet'
  })

  // Real-time generation state
  const [generationProgress, setGenerationProgress] = useState([])
  const [showGenerationTheater, setShowGenerationTheater] = useState(false)

  // Editor state
  const [editMode, setEditMode] = useState(false)
  const [editedWorksheet, setEditedWorksheet] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])

  // Export state
  const [exporting, setExporting] = useState(false)
  const [exportConfig, setExportConfig] = useState({
    format: 'pdf',
    version: 'student',
    includeHeader: true,
    includeLogo: false,
    includeDate: true,
    teacherName: '',
    schoolName: '',
  })

  // Library state
  const [libraryFilter, setLibraryFilter] = useState({
    search: '',
    subject: 'all',
    grade: 'all',
    status: 'all',
    type: 'all',
  })
  const [libraryView, setLibraryView] = useState('grid') // 'grid' or 'list'
  const [selectedFolder, setSelectedFolder] = useState(null)

  // AI Assistant
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  // Material Upload State
  const [materials, setMaterials] = useState([])
  const [selectedMaterial, setSelectedMaterial] = useState(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [analyzingMaterial, setAnalyzingMaterial] = useState(false)
  const [transformingMaterial, setTransformingMaterial] = useState(false)
  const [uploadStep, setUploadStep] = useState(1) // 1: upload, 2: analysis, 3: action
  const [selectedAction, setSelectedAction] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [uploadInstructions, setUploadInstructions] = useState('')

  // Settings
  const [settings, setSettings] = useState({
    defaultGrade: '3',
    defaultSubject: 'Deutsch',
    defaultDifficulty: 'medium',
    teacherName: '',
    schoolName: '',
    language: 'de-CH',
    autoSave: true,
    showTips: true,
  })

  // ==================================================
  // EFFECTS
  // ==================================================

  // Command palette keyboard shortcut
  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandOpen((open) => !open)
      }
      // Undo/Redo
      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
      if ((e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) || 
          (e.key === 'y' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault()
        handleRedo()
      }
      // Save
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (editedWorksheet && editMode) {
          handleSaveWorksheet()
        }
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [editMode, editedWorksheet, undoStack, redoStack])

  // Load token from localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem('eduflow_token')
    if (savedToken) {
      setToken(savedToken)
      fetchCurrentUser(savedToken)
    }
    // Load settings
    const savedSettings = localStorage.getItem('eduflow_settings')
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings))
      } catch (e) {}
    }
  }, [])

  // Sync edited worksheet
  useEffect(() => {
    if (selectedWorksheet) {
      setEditedWorksheet(JSON.parse(JSON.stringify(selectedWorksheet)))
      setUndoStack([])
      setRedoStack([])
    }
  }, [selectedWorksheet])

  // Autosave
  useEffect(() => {
    if (settings.autoSave && editedWorksheet && editMode) {
      const timer = setTimeout(() => {
        // Auto-save draft
        handleSaveWorksheet(true)
      }, 30000) // 30 seconds
      return () => clearTimeout(timer)
    }
  }, [editedWorksheet, editMode, settings.autoSave])

  // ==================================================
  // API CALLS
  // ==================================================

  const fetchCurrentUser = async (authToken) => {
    try {
      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
        fetchWorksheets(authToken)
        fetchMaterials(authToken)
      } else {
        localStorage.removeItem('eduflow_token')
        setToken(null)
      }
    } catch (error) {
      console.error('Error fetching user:', error)
    }
  }

  const fetchWorksheets = async (authToken) => {
    try {
      const response = await fetch('/api/worksheets', {
        headers: { 'Authorization': `Bearer ${authToken || token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setWorksheets(data)
      }
    } catch (error) {
      console.error('Error fetching worksheets:', error)
    }
  }

  // ==================================================
  // MATERIAL UPLOAD HANDLERS
  // ==================================================

  const fetchMaterials = async (authToken) => {
    try {
      const response = await fetch('/api/materials', {
        headers: { 'Authorization': `Bearer ${authToken || token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setMaterials(data)
      }
    } catch (error) {
      console.error('Error fetching materials:', error)
    }
  }

  const handleFileUpload = async (file) => {
    if (!file) return
    
    // Validate file type
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/png', 'image/jpeg']
    const ext = file.name.split('.').pop()?.toLowerCase()
    
    if (!['pdf', 'docx', 'doc', 'txt', 'png', 'jpg', 'jpeg'].includes(ext)) {
      toast.error('Nicht unterstützter Dateityp. Erlaubt: PDF, DOCX, TXT, PNG, JPG')
      return
    }
    
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Datei zu gross (max. 10MB)')
      return
    }
    
    setUploadingFile(true)
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const response = await fetch('/api/materials/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        toast.success('Datei hochgeladen')
        setSelectedMaterial(data)
        setUploadStep(2)
        
        // Auto-analyze
        await handleAnalyzeMaterial(data.material_id)
        
        fetchMaterials(token)
      } else {
        throw new Error(data.detail || 'Upload fehlgeschlagen')
      }
    } catch (error) {
      console.error('Upload error:', error)
      toast.error(error.message || 'Upload fehlgeschlagen')
    } finally {
      setUploadingFile(false)
    }
  }

  const handleAnalyzeMaterial = async (materialId) => {
    setAnalyzingMaterial(true)
    
    try {
      const response = await fetch(`/api/materials/${materialId}/analyze`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        setSelectedMaterial(prev => ({
          ...prev,
          analysis: data.analysis
        }))
        setUploadStep(3)
        toast.success('Analyse abgeschlossen')
      } else {
        throw new Error(data.detail || 'Analyse fehlgeschlagen')
      }
    } catch (error) {
      console.error('Analysis error:', error)
      toast.error(error.message || 'Analyse fehlgeschlagen')
    } finally {
      setAnalyzingMaterial(false)
    }
  }

  const handleTransformMaterial = async (action) => {
    if (!selectedMaterial?.material_id) return
    
    setTransformingMaterial(true)
    setSelectedAction(action)
    
    try {
      const response = await fetch('/api/materials/transform', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          material_id: selectedMaterial.material_id,
          action: action,
          grade: form.grade,
          subject: selectedMaterial.analysis?.detected_subject || form.subject,
          difficulty: form.difficulty,
          questionCount: form.questionCount,
          mode: action === 'exam' ? 'exam' : 'worksheet',
          customInstructions: ''
        })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        toast.success('Material erfolgreich transformiert')
        setSelectedWorksheet(data.worksheet)
        setEditedWorksheet(JSON.parse(JSON.stringify(data.worksheet)))
        setActiveView('editor')
        setEditMode(true)
        fetchWorksheets(token)
      } else {
        throw new Error(data.detail || 'Transformation fehlgeschlagen')
      }
    } catch (error) {
      console.error('Transform error:', error)
      toast.error(error.message || 'Transformation fehlgeschlagen')
    } finally {
      setTransformingMaterial(false)
      setSelectedAction(null)
    }
  }

  const handleDeleteMaterial = async (materialId) => {
    try {
      const response = await fetch(`/api/materials/${materialId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        toast.success('Material gelöscht')
        fetchMaterials(token)
        if (selectedMaterial?.material_id === materialId) {
          setSelectedMaterial(null)
          setUploadStep(1)
        }
      }
    } catch (error) {
      toast.error('Löschen fehlgeschlagen')
    }
  }

  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0])
    }
  }

  // ==================================================
  // AUTH HANDLERS
  // ==================================================

  const handleAuth = async (e) => {
    e.preventDefault()
    setError('')
    setAuthLoading(true)

    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      })

      const data = await response.json()
      if (response.ok) {
        setToken(data.token)
        setUser(data.user)
        localStorage.setItem('eduflow_token', data.token)
        fetchWorksheets(data.token)
        fetchMaterials(data.token)
        toast.success(authMode === 'login' ? 'Willkommen zurück!' : 'Konto erfolgreich erstellt')
      } else {
        setError(data.detail || 'Anmeldung fehlgeschlagen')
      }
    } catch (error) {
      setError('Verbindungsfehler. Bitte versuchen Sie es erneut.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('eduflow_token')
    setToken(null)
    setUser(null)
    setWorksheets([])
    setSelectedWorksheet(null)
    setActiveView('dashboard')
    toast.success('Erfolgreich abgemeldet')
  }

  // ==================================================
  // WORKSHEET HANDLERS
  // ==================================================

  const handleGenerate = async () => {
    setError('')
    setGenerating(true)
    setGenerationProgress([])
    setShowGenerationTheater(true)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000)

    try {
      const response = await fetch('/api/generate-worksheet-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...form,
          mode: form.resourceType === 'exam' ? 'exam' : 'worksheet'
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Generation fehlgeschlagen')
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
                setGenerationProgress(prev => [...prev, {
                  step: prev.length + 1,
                  message: data.message,
                  progress: data.progress,
                  type: 'status'
                }])
              } else if (data.type === 'question') {
                setGenerationProgress(prev => [...prev, {
                  step: prev.length + 1,
                  message: `Frage ${data.number} erstellt`,
                  progress: data.progress,
                  type: 'question',
                  question: data.question
                }])
              } else if (data.type === 'complete') {
                setGenerationProgress(prev => [...prev, {
                  step: prev.length + 1,
                  message: 'Erfolgreich erstellt!',
                  progress: 100,
                  type: 'complete'
                }])
                
                await new Promise(resolve => setTimeout(resolve, 1000))
                
                setSelectedWorksheet(data.worksheet)
                setEditedWorksheet(JSON.parse(JSON.stringify(data.worksheet)))
                setShowGenerationTheater(false)
                setActiveView('editor')
                setEditMode(true)
                fetchWorksheets(token)
                toast.success('Arbeitsblatt erfolgreich erstellt')
              } else if (data.type === 'error') {
                throw new Error(data.message)
              }
            } catch (parseError) {
              console.error('Parse error:', parseError)
            }
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        setError('Zeitüberschreitung. Bitte versuchen Sie es erneut.')
      } else {
        setError(error.message || 'Fehler bei der Generierung')
      }
      setShowGenerationTheater(false)
      toast.error('Generierung fehlgeschlagen')
    } finally {
      clearTimeout(timeoutId)
      setGenerating(false)
    }
  }

  // ==================================================
  // EDITOR HANDLERS
  // ==================================================

  const pushUndo = () => {
    if (editedWorksheet) {
      setUndoStack(prev => [...prev.slice(-19), JSON.stringify(editedWorksheet)])
      setRedoStack([])
    }
  }

  const handleUndo = () => {
    if (undoStack.length > 0) {
      const prev = undoStack[undoStack.length - 1]
      setRedoStack(stack => [...stack, JSON.stringify(editedWorksheet)])
      setEditedWorksheet(JSON.parse(prev))
      setUndoStack(stack => stack.slice(0, -1))
    }
  }

  const handleRedo = () => {
    if (redoStack.length > 0) {
      const next = redoStack[redoStack.length - 1]
      setUndoStack(stack => [...stack, JSON.stringify(editedWorksheet)])
      setEditedWorksheet(JSON.parse(next))
      setRedoStack(stack => stack.slice(0, -1))
    }
  }

  const handleSaveWorksheet = async (silent = false) => {
    if (!editedWorksheet) return
    
    setSaving(true)
    setSaveStatus('saving')
    
    try {
      const response = await fetch(`/api/worksheets/${editedWorksheet.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          worksheetId: editedWorksheet.id,
          title: editedWorksheet.title,
          questions: editedWorksheet.content.questions
        })
      })

      const data = await response.json()
      if (response.ok && data.success) {
        setSelectedWorksheet(data.worksheet)
        setEditedWorksheet(JSON.parse(JSON.stringify(data.worksheet)))
        setSaveStatus('saved')
        fetchWorksheets(token)
        if (!silent) toast.success('Gespeichert')
        setTimeout(() => setSaveStatus(null), 2000)
      } else {
        throw new Error(data.detail || 'Speichern fehlgeschlagen')
      }
    } catch (error) {
      if (!silent) toast.error('Speichern fehlgeschlagen')
      setSaveStatus(null)
    } finally {
      setSaving(false)
    }
  }

  const updateQuestion = (questionId, field, value) => {
    if (!editedWorksheet) return
    pushUndo()
    
    const updatedQuestions = editedWorksheet.content.questions.map(q => {
      if (q.id === questionId) {
        return { ...q, [field]: value }
      }
      return q
    })
    
    setEditedWorksheet({
      ...editedWorksheet,
      content: { ...editedWorksheet.content, questions: updatedQuestions }
    })
  }

  const addQuestion = (afterIndex = -1) => {
    if (!editedWorksheet) return
    pushUndo()
    
    const questions = [...editedWorksheet.content.questions]
    const newId = `q_${Date.now()}`
    const isExam = editedWorksheet.mode === 'exam'
    
    const newQuestion = {
      id: newId,
      number: afterIndex >= 0 ? afterIndex + 2 : questions.length + 1,
      type: 'short_answer',
      question: '',
      answer: '',
      explanation: '',
      answerLines: 3,
      ...(isExam ? { points: 2 } : {})
    }
    
    if (afterIndex >= 0) {
      questions.splice(afterIndex + 1, 0, newQuestion)
    } else {
      questions.push(newQuestion)
    }
    
    questions.forEach((q, i) => { q.number = i + 1 })
    
    setEditedWorksheet({
      ...editedWorksheet,
      content: { ...editedWorksheet.content, questions }
    })
    
    toast.success('Frage hinzugefügt')
  }

  const deleteQuestion = (questionId) => {
    if (!editedWorksheet) return
    pushUndo()
    
    const questions = editedWorksheet.content.questions.filter(q => q.id !== questionId)
    questions.forEach((q, i) => { q.number = i + 1 })
    
    setEditedWorksheet({
      ...editedWorksheet,
      content: { ...editedWorksheet.content, questions }
    })
    
    setDeleteConfirmId(null)
    toast.success('Frage gelöscht')
  }

  const duplicateQuestion = (questionId) => {
    if (!editedWorksheet) return
    pushUndo()
    
    const questions = [...editedWorksheet.content.questions]
    const originalIndex = questions.findIndex(q => q.id === questionId)
    if (originalIndex === -1) return
    
    const duplicate = {
      ...JSON.parse(JSON.stringify(questions[originalIndex])),
      id: `q_${Date.now()}`
    }
    
    questions.splice(originalIndex + 1, 0, duplicate)
    questions.forEach((q, i) => { q.number = i + 1 })
    
    setEditedWorksheet({
      ...editedWorksheet,
      content: { ...editedWorksheet.content, questions }
    })
    
    toast.success('Frage dupliziert')
  }

  const reorderQuestions = (newOrder) => {
    if (!editedWorksheet) return
    pushUndo()
    
    newOrder.forEach((q, i) => { q.number = i + 1 })
    
    setEditedWorksheet({
      ...editedWorksheet,
      content: { ...editedWorksheet.content, questions: newOrder }
    })
  }

  // AI improvement handlers
  const handleImproveQuestion = async (questionId, action) => {
    const question = editedWorksheet?.content.questions.find(q => q.id === questionId)
    if (!question) return

    setChatLoading(true)
    
    const actionPrompts = {
      simplify: 'Vereinfache diese Frage sprachlich, behalte den Inhalt bei',
      harder: 'Mache diese Frage anspruchsvoller, behalte das Thema bei',
      easier: 'Mache diese Frage einfacher, behalte das Thema bei',
      clarify: 'Verbessere die Klarheit und Verständlichkeit dieser Frage',
      alternative: 'Erstelle eine alternative Frage zum gleichen Thema'
    }

    try {
      const response = await fetch('/api/chat/edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: `${actionPrompts[action]}: "${question.question}"`,
          worksheet_id: editedWorksheet.id,
          worksheet_content: editedWorksheet.content
        })
      })
      
      const data = await response.json()
      
      if (data.success && data.actions?.length > 0) {
        // Apply the first action
        const firstAction = data.actions[0]
        if (firstAction.data?.question) {
          updateQuestion(questionId, 'question', firstAction.data.question)
          if (firstAction.data.answer) {
            updateQuestion(questionId, 'answer', firstAction.data.answer)
          }
          toast.success('Frage verbessert')
        }
      } else {
        toast.info(data.message || 'Keine Änderungen vorgenommen')
      }
    } catch (error) {
      toast.error('Verbesserung fehlgeschlagen')
    } finally {
      setChatLoading(false)
    }
  }

  // ==================================================
  // EXPORT HANDLERS
  // ==================================================

  const handleExport = async (worksheetId, format, version) => {
    setExporting(true)
    
    try {
      const response = await fetch(`/api/export/${format}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ worksheetId, format, version })
      })

      if (!response.ok) {
        throw new Error('Export fehlgeschlagen')
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = `export_${version}.${format}`
      
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/)
        if (match) filename = match[1]
      }

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      toast.success(`${format.toUpperCase()} exportiert`)
    } catch (error) {
      toast.error('Export fehlgeschlagen')
    } finally {
      setExporting(false)
    }
  }

  // ==================================================
  // DELETE WORKSHEET
  // ==================================================

  const handleDeleteWorksheet = async (worksheetId) => {
    try {
      const response = await fetch(`/api/worksheets/${worksheetId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        fetchWorksheets(token)
        if (selectedWorksheet?.id === worksheetId) {
          setSelectedWorksheet(null)
          setEditedWorksheet(null)
          setActiveView('library')
        }
        toast.success('Gelöscht')
      }
    } catch (error) {
      toast.error('Löschen fehlgeschlagen')
    }
  }

  // ==================================================
  // AI CHAT HANDLER
  // ==================================================

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading) return
    
    const userMessage = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setChatLoading(true)
    
    try {
      const isEditCommand = editedWorksheet && (
        userMessage.toLowerCase().includes('frage') ||
        userMessage.toLowerCase().includes('änder') ||
        userMessage.toLowerCase().includes('mach')
      )
      
      const endpoint = isEditCommand ? '/api/chat/edit' : '/api/chat/assistant'
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(isEditCommand ? {
          message: userMessage,
          worksheet_id: editedWorksheet.id,
          worksheet_content: editedWorksheet.content
        } : {
          message: userMessage,
          worksheet_id: editedWorksheet?.id,
          context: editedWorksheet ? {
            topic: editedWorksheet.topic,
            grade: editedWorksheet.grade,
            mode: editedWorksheet.mode
          } : null
        })
      })
      
      const data = await response.json()
      
      if (isEditCommand && data.success && data.actions?.length > 0) {
        // Apply edit actions
        let updatedQuestions = [...editedWorksheet.content.questions]
        pushUndo()
        
        for (const action of data.actions) {
          if (action.type === 'update_question' && action.questionId) {
            updatedQuestions = updatedQuestions.map(q => 
              q.id === action.questionId ? { ...q, ...action.data } : q
            )
          } else if (action.type === 'add_question' && action.data) {
            updatedQuestions.push({
              id: `q_ai_${Date.now()}`,
              number: updatedQuestions.length + 1,
              answerLines: 3,
              ...action.data
            })
          } else if (action.type === 'delete_question' && action.questionId) {
            updatedQuestions = updatedQuestions.filter(q => q.id !== action.questionId)
          }
        }
        
        updatedQuestions.forEach((q, i) => { q.number = i + 1 })
        
        setEditedWorksheet({
          ...editedWorksheet,
          content: { ...editedWorksheet.content, questions: updatedQuestions }
        })
        
        setChatMessages(prev => [...prev, { 
          role: 'assistant', 
          content: data.message + '\n\n✅ Änderungen angewendet.',
          hasActions: true
        }])
      } else {
        setChatMessages(prev => [...prev, { 
          role: 'assistant', 
          content: data.response || data.message || 'Entschuldigung, etwas ist schief gelaufen.' 
        }])
      }
    } catch (error) {
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Verbindungsfehler. Bitte versuchen Sie es erneut.' 
      }])
    } finally {
      setChatLoading(false)
    }
  }

  // ==================================================
  // FILTERED WORKSHEETS
  // ==================================================

  const filteredWorksheets = worksheets.filter(ws => {
    if (libraryFilter.search && !ws.title.toLowerCase().includes(libraryFilter.search.toLowerCase())) {
      return false
    }
    if (libraryFilter.subject !== 'all' && ws.subject !== libraryFilter.subject) {
      return false
    }
    if (libraryFilter.grade !== 'all' && ws.grade !== libraryFilter.grade) {
      return false
    }
    if (libraryFilter.type !== 'all' && ws.mode !== libraryFilter.type) {
      return false
    }
    return true
  })

  // ==================================================
  // HELPER FUNCTIONS
  // ==================================================

  const getRecentWorksheets = () => {
    return worksheets.slice(0, 5)
  }

  const getQuickStats = () => {
    return {
      total: worksheets.length,
      thisMonth: worksheets.filter(ws => {
        const created = new Date(ws.created_at)
        const now = new Date()
        return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear()
      }).length,
      exams: worksheets.filter(ws => ws.mode === 'exam').length,
      worksheetCount: worksheets.filter(ws => ws.mode === 'worksheet').length,
    }
  }

  const openWorksheetEditor = (worksheet) => {
    setSelectedWorksheet(worksheet)
    setEditedWorksheet(JSON.parse(JSON.stringify(worksheet)))
    setActiveView('editor')
    setEditMode(true)
  }

  // ==================================================
  // RENDER: AUTH SCREEN
  // ==================================================

  if (!token) {
    return (
      <TooltipProvider>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
          {/* Background decoration */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-50" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-100 rounded-full mix-blend-multiply filter blur-3xl opacity-50" />
          </div>

          <div className="relative z-10 w-full max-w-md">
            {/* Logo */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
                <BookOpen className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900">EduFlow</h1>
              <p className="text-gray-600 mt-2">Arbeitsblätter mit KI – für Schweizer Schulen</p>
            </div>

            {/* Auth Card */}
            <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
              <CardHeader className="space-y-1 pb-4">
                <CardTitle className="text-xl">
                  {authMode === 'login' ? 'Anmelden' : 'Konto erstellen'}
                </CardTitle>
                <CardDescription>
                  {authMode === 'login' 
                    ? 'Melden Sie sich an, um fortzufahren'
                    : '5 Arbeitsblätter pro Monat kostenlos'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAuth} className="space-y-4">
                  {authMode === 'register' && (
                    <div className="space-y-2">
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        type="text"
                        placeholder="Ihr Name"
                        value={authForm.name}
                        onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                        required
                        data-testid="auth-name-input"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="email">E-Mail</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="ihre@email.ch"
                      value={authForm.email}
                      onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                      required
                      data-testid="auth-email-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Passwort</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={authForm.password}
                      onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                      required
                      data-testid="auth-password-input"
                    />
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full bg-blue-600 hover:bg-blue-700" 
                    disabled={authLoading}
                    data-testid="auth-submit-button"
                  >
                    {authLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    {authMode === 'login' ? 'Anmelden' : 'Registrieren'}
                  </Button>
                </form>
              </CardContent>
              <CardFooter className="flex flex-col gap-4 pt-0">
                <Separator />
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                  data-testid="auth-toggle-button"
                >
                  {authMode === 'login' 
                    ? 'Noch kein Konto? Registrieren' 
                    : 'Bereits registriert? Anmelden'}
                </Button>
              </CardFooter>
            </Card>

            {/* Features */}
            <div className="mt-8 grid grid-cols-3 gap-4 text-center">
              {[
                { icon: Sparkles, label: 'KI-gestützt' },
                { icon: GraduationCap, label: 'Lehrplan 21' },
                { icon: Download, label: 'PDF Export' },
              ].map((feature, i) => (
                <div key={i} className="flex flex-col items-center gap-2 text-gray-600">
                  <feature.icon className="h-5 w-5" />
                  <span className="text-xs">{feature.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  // ==================================================
  // RENDER: MAIN APP
  // ==================================================

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar */}
        <aside className={`fixed left-0 top-0 h-screen bg-white border-r border-gray-200 flex flex-col transition-all z-40 ${sidebarCollapsed ? 'w-16' : 'w-56'}`}>
          {/* Logo */}
          <div className="h-16 flex items-center px-4 border-b border-gray-100">
            <button 
              onClick={() => setActiveView('dashboard')}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
              data-testid="logo-button"
            >
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              {!sidebarCollapsed && (
                <span className="font-semibold text-gray-900">EduFlow</span>
              )}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map((item) => (
              <Tooltip key={item.id} delayDuration={sidebarCollapsed ? 0 : 1000}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setActiveView(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      activeView === item.id || (item.id === 'editor' && activeView === 'editor')
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                    data-testid={`nav-${item.id}-button`}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </button>
                </TooltipTrigger>
                {sidebarCollapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
              </Tooltip>
            ))}

            <Separator className="my-4" />

            {NAV_ITEMS_SECONDARY.map((item) => (
              <Tooltip key={item.id} delayDuration={sidebarCollapsed ? 0 : 1000}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setActiveView(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      activeView === item.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                    data-testid={`nav-${item.id}-button`}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </button>
                </TooltipTrigger>
                {sidebarCollapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
              </Tooltip>
            ))}
          </nav>

          {/* User Section */}
          <div className="p-2 border-t border-gray-100">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-gray-100 transition-colors">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4 text-blue-600" />
                  </div>
                  {!sidebarCollapsed && (
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-medium text-gray-900 truncate">{user?.name}</p>
                      <p className="text-xs text-gray-500">
                        {user?.subscription_tier === 'premium' ? 'Premium' : `${user?.worksheets_used_this_month || 0}/5 genutzt`}
                      </p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Mein Konto</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setActiveView('settings')}>
                  <Settings className="h-4 w-4 mr-2" />
                  Einstellungen
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="h-4 w-4 mr-2" />
                  Abmelden
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Collapse Toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 shadow-sm"
          >
            {sidebarCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 rotate-90" />}
          </button>
        </aside>

        {/* Main Content */}
        <main className={`flex-1 transition-all ${sidebarCollapsed ? 'ml-16' : 'ml-56'}`}>
          {/* Top Bar */}
          <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-30">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-semibold text-gray-900">
                {activeView === 'dashboard' && 'Dashboard'}
                {activeView === 'create' && 'Neues Material erstellen'}
                {activeView === 'library' && 'Bibliothek'}
                {activeView === 'templates' && 'Vorlagen'}
                {activeView === 'curriculum' && 'Lehrplan 21'}
                {activeView === 'exports' && 'Exporte'}
                {activeView === 'settings' && 'Einstellungen'}
                {activeView === 'upload' && 'Material hochladen'}
                {activeView === 'editor' && editedWorksheet?.title}
              </h1>
              {activeView === 'editor' && editedWorksheet && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {editedWorksheet.grade}. Klasse
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {editedWorksheet.subject}
                  </Badge>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Save Status */}
              {activeView === 'editor' && saveStatus && (
                <Badge variant="outline" className={saveStatus === 'saved' ? 'text-green-600 border-green-200' : 'text-gray-500'}>
                  {saveStatus === 'saved' ? (
                    <><Check className="h-3 w-3 mr-1" /> Gespeichert</>
                  ) : (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Speichern...</>
                  )}
                </Badge>
              )}

              {/* Command Palette Trigger */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCommandOpen(true)}
                className="hidden md:flex items-center gap-2"
                data-testid="command-palette-trigger"
              >
                <Search className="h-4 w-4" />
                <span className="text-gray-500">Suchen...</span>
                <kbd className="ml-2 text-xs bg-gray-100 px-1.5 py-0.5 rounded">⌘K</kbd>
              </Button>

              {/* Quick Create */}
              <Button
                onClick={() => { setActiveView('create'); setWizardStep(1) }}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="quick-create-button"
              >
                <Plus className="h-4 w-4 mr-2" />
                Erstellen
              </Button>
            </div>
          </header>

          {/* Page Content */}
          <div className="p-6">
            <AnimatePresence mode="wait">
              {/* DASHBOARD */}
              {activeView === 'dashboard' && (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Welcome & Quick Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="md:col-span-2 bg-gradient-to-br from-blue-600 to-indigo-600 text-white border-0">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xl">Guten Tag, {user?.name?.split(' ')[0]}!</CardTitle>
                        <CardDescription className="text-blue-100">
                          Was möchten Sie heute für Ihren Unterricht vorbereiten?
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex gap-3">
                        <Button 
                          onClick={() => { setActiveView('create'); setWizardStep(1) }}
                          className="bg-white text-blue-600 hover:bg-blue-50"
                          data-testid="dashboard-create-button"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Neues Material
                        </Button>
                        <Button 
                          onClick={() => { setActiveView('upload'); setUploadStep(1); setSelectedMaterial(null) }}
                          variant="outline"
                          className="border-white/30 text-white hover:bg-white/10"
                          data-testid="dashboard-upload-button"
                        >
                          <FileUp className="h-4 w-4 mr-2" />
                          Material hochladen
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Stats */}
                    {[
                      { label: 'Erstellte Materialien', value: getQuickStats().total, icon: FileText, sub: 'Gesamt' },
                      { label: 'Diesen Monat', value: getQuickStats().thisMonth, icon: Calendar, sub: `davon ${getQuickStats().exams} Prüfungen` },
                    ].map((stat, i) => (
                      <Card key={i}>
                        <CardContent className="pt-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-gray-500">{stat.label}</p>
                              <p className="text-2xl font-bold">{stat.value}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{stat.sub}</p>
                            </div>
                            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                              <stat.icon className="h-5 w-5 text-blue-600" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Quick Actions */}
                  <div>
                    <h2 className="text-base font-semibold mb-1">Schnell starten</h2>
                    <p className="text-sm text-gray-500 mb-4">Wählen Sie, was Sie erstellen möchten — die KI übernimmt den Rest.</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: 'Material hochladen', icon: FileUp, type: 'upload', desc: 'PDF, Word oder Bild hochladen' },
                        { label: 'Arbeitsblatt', icon: FileText, type: 'worksheet', desc: 'Übungsblatt ohne Bewertung' },
                        { label: 'Prüfung', icon: FileCheck, type: 'exam', desc: 'Test mit Punkten' },
                        { label: 'Quiz', icon: Zap, type: 'quiz', desc: 'Schnelle Lernkontrolle' },
                      ].map((action, i) => (
                        <Card 
                          key={i}
                          className={`cursor-pointer hover:border-blue-300 hover:shadow-md transition-all ${action.type === 'upload' ? 'border-blue-200 bg-blue-50/30' : ''}`}
                          onClick={() => {
                            if (action.type === 'upload') {
                              setActiveView('upload')
                              setUploadStep(1)
                              setSelectedMaterial(null)
                            } else {
                              setForm(prev => ({ ...prev, resourceType: action.type }))
                              setActiveView('create')
                              setWizardStep(1)
                            }
                          }}
                          data-testid={`quick-action-${action.type}`}
                        >
                          <CardContent className="pt-5 pb-4 text-center">
                            <action.icon className={`h-7 w-7 mx-auto mb-2 ${action.type === 'upload' ? 'text-indigo-600' : 'text-blue-600'}`} />
                            <p className="font-medium text-sm">{action.label}</p>
                            <p className="text-xs text-gray-400 mt-1">{action.desc}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {/* Recent Documents */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-base font-semibold">Zuletzt bearbeitet</h2>
                      {worksheets.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => setActiveView('library')}>
                          Alle anzeigen
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      )}
                    </div>
                    {getRecentWorksheets().length === 0 ? (
                      <Card className="border-dashed border-gray-200">
                        <CardContent className="py-14 text-center">
                          <div className="w-14 h-14 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
                            <FileText className="h-7 w-7 text-gray-400" />
                          </div>
                          <h3 className="font-medium text-gray-900 mb-1">Noch keine Materialien erstellt</h3>
                          <p className="text-sm text-gray-500 max-w-sm mx-auto mb-5">
                            Erstellen Sie Ihr erstes Arbeitsblatt mit KI-Unterstützung oder laden Sie bestehendes Material hoch.
                          </p>
                          <div className="flex justify-center gap-3">
                            <Button 
                              onClick={() => { setActiveView('create'); setWizardStep(1) }}
                              data-testid="empty-state-create-btn"
                            >
                              <Sparkles className="h-4 w-4 mr-2" />
                              Jetzt erstellen
                            </Button>
                            <Button 
                              variant="outline"
                              onClick={() => { setActiveView('upload'); setUploadStep(1) }}
                              data-testid="empty-state-upload-btn"
                            >
                              <FileUp className="h-4 w-4 mr-2" />
                              Material hochladen
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {getRecentWorksheets().map((ws, i) => (
                          <Card 
                            key={ws.id}
                            className="cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group"
                            onClick={() => openWorksheetEditor(ws)}
                            data-testid={`recent-worksheet-${ws.id}`}
                          >
                            <CardHeader className="pb-2">
                              <CardTitle className="text-base line-clamp-1">{ws.title}</CardTitle>
                              <CardDescription className="text-xs flex items-center gap-2">
                                <span>{ws.content?.questions?.length || 0} Fragen</span>
                                <span className="text-gray-300">·</span>
                                <span>{new Date(ws.created_at).toLocaleDateString('de-CH')}</span>
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              <div className="flex flex-wrap gap-1.5">
                                <Badge variant="secondary" className="text-xs">{ws.grade}. Klasse</Badge>
                                <Badge variant="secondary" className="text-xs">{ws.subject}</Badge>
                                <Badge variant={ws.mode === 'exam' ? 'default' : 'outline'} className="text-xs">
                                  {ws.mode === 'exam' ? 'Prüfung' : 'Arbeitsblatt'}
                                </Badge>
                                {ws.source_material_id && (
                                  <Badge variant="outline" className="text-xs text-indigo-600 border-indigo-200">
                                    Aus Material
                                  </Badge>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* CREATE VIEW */}
              {activeView === 'create' && (
                <motion.div
                  key="create"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="max-w-2xl mx-auto"
                >
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-4 mb-4">
                        {[1, 2, 3].map((step) => (
                          <div key={step} className="flex items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                              wizardStep >= step 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-100 text-gray-400'
                            }`}>
                              {wizardStep > step ? <Check className="h-4 w-4" /> : step}
                            </div>
                            {step < 3 && (
                              <div className={`w-12 h-0.5 mx-2 ${
                                wizardStep > step ? 'bg-blue-600' : 'bg-gray-200'
                              }`} />
                            )}
                          </div>
                        ))}
                      </div>
                      <CardTitle>
                        {wizardStep === 1 && 'Was möchten Sie erstellen?'}
                        {wizardStep === 2 && 'Für wen ist das Material?'}
                        {wizardStep === 3 && 'Worüber soll es gehen?'}
                      </CardTitle>
                      <CardDescription>
                        {wizardStep === 1 && 'Wählen Sie das Format — Sie können es später jederzeit anpassen.'}
                        {wizardStep === 2 && 'Passen Sie Klasse, Fach und Schwierigkeitsstufe an Ihre Lerngruppe an.'}
                        {wizardStep === 3 && 'Beschreiben Sie das Thema möglichst konkret — die KI erstellt dann passende Fragen.'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Step 1: Resource Type */}
                      {wizardStep === 1 && (
                        <div className="grid grid-cols-2 gap-4">
                          {RESOURCE_TYPES.map((type) => (
                            <Card
                              key={type.value}
                              className={`cursor-pointer transition-all ${
                                form.resourceType === type.value
                                  ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-200'
                                  : 'hover:border-gray-300'
                              }`}
                              onClick={() => setForm(prev => ({ ...prev, resourceType: type.value }))}
                            >
                              <CardContent className="pt-6 text-center">
                                <type.icon className={`h-8 w-8 mx-auto mb-3 ${
                                  form.resourceType === type.value ? 'text-blue-600' : 'text-gray-400'
                                }`} />
                                <p className="font-medium">{type.label}</p>
                                <p className="text-xs text-gray-500 mt-1">{type.description}</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}

                      {/* Step 2: Details */}
                      {wizardStep === 2 && (
                        <div className="space-y-6">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Klasse</Label>
                              <Select 
                                value={form.grade} 
                                onValueChange={(value) => setForm(prev => ({ ...prev, grade: value }))}
                              >
                                <SelectTrigger data-testid="grade-select">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {GRADES.map((g) => (
                                    <SelectItem key={g.value} value={g.value}>
                                      {g.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Fach</Label>
                              <Select 
                                value={form.subject} 
                                onValueChange={(value) => setForm(prev => ({ ...prev, subject: value }))}
                              >
                                <SelectTrigger data-testid="subject-select">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {SUBJECTS.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>
                                      {s.icon} {s.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <Label>Schwierigkeitsstufe</Label>
                            <div className="grid grid-cols-3 gap-3">
                              {DIFFICULTY_LEVELS.map((level) => (
                                <Card
                                  key={level.value}
                                  className={`cursor-pointer transition-all p-3 ${
                                    form.difficulty === level.value
                                      ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-200'
                                      : 'hover:border-gray-300'
                                  }`}
                                  onClick={() => setForm(prev => ({ ...prev, difficulty: level.value }))}
                                  data-testid={`difficulty-${level.value}`}
                                >
                                  <p className={`font-medium text-center text-sm ${level.color}`}>{level.label}</p>
                                  <p className="text-xs text-gray-400 text-center mt-1">{level.description}</p>
                                </Card>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Step 3: Content */}
                      {wizardStep === 3 && (
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <Label>Thema</Label>
                            <Input
                              placeholder="z.B. Bruchrechnen, Photosynthese, Schweizer Kantone..."
                              value={form.topic}
                              onChange={(e) => setForm(prev => ({ ...prev, topic: e.target.value }))}
                              data-testid="topic-input"
                            />
                            <p className="text-xs text-gray-400">
                              Je genauer die Beschreibung, desto besser die Ergebnisse. Beispiel: «Das kleine 1x1, Reihen von 6 bis 9»
                            </p>
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label>Anzahl Fragen: <span className="font-bold text-blue-600">{form.questionCount}</span></Label>
                              <span className="text-xs text-gray-400">
                                {form.questionCount <= 8 ? 'Kurz' : form.questionCount <= 14 ? 'Mittel' : 'Umfangreich'}
                              </span>
                            </div>
                            <Slider
                              value={[form.questionCount]}
                              onValueChange={(value) => setForm(prev => ({ ...prev, questionCount: value[0] }))}
                              min={5}
                              max={20}
                              step={1}
                              data-testid="question-count-slider"
                            />
                            <div className="flex justify-between text-xs text-gray-400">
                              <span>5 (kurz)</span>
                              <span>20 (umfangreich)</span>
                            </div>
                          </div>

                          {/* Summary */}
                          <Card className="bg-gray-50/80 border-gray-200">
                            <CardContent className="pt-4">
                              <h4 className="font-medium mb-3 text-sm text-gray-700">Die KI wird für Sie erstellen:</h4>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Format</span>
                                  <span className="font-medium">{RESOURCE_TYPES.find(t => t.value === form.resourceType)?.label}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Klasse</span>
                                  <span className="font-medium">{form.grade}. Klasse</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Fach</span>
                                  <span className="font-medium">{form.subject}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Niveau</span>
                                  <span className="font-medium">{DIFFICULTY_LEVELS.find(d => d.value === form.difficulty)?.label}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Fragen</span>
                                  <span className="font-medium">{form.questionCount} Fragen</span>
                                </div>
                                {form.topic && (
                                  <div className="flex justify-between pt-2 border-t">
                                    <span className="text-gray-500">Thema</span>
                                    <span className="font-medium text-right max-w-[200px] truncate">{form.topic}</span>
                                  </div>
                                )}
                              </div>
                              <div className="mt-3 pt-3 border-t">
                                <p className="text-xs text-gray-400 flex items-center gap-1.5">
                                  <Clock className="h-3 w-3" />
                                  Geschätzte Generierungszeit: ca. {Math.max(10, form.questionCount * 2)} Sekunden
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter className="flex justify-between border-t pt-4">
                      <Button
                        variant="ghost"
                        onClick={() => wizardStep > 1 ? setWizardStep(wizardStep - 1) : setActiveView('dashboard')}
                        data-testid="wizard-back-button"
                      >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        {wizardStep > 1 ? 'Zurück' : 'Abbrechen'}
                      </Button>
                      {wizardStep < 3 ? (
                        <Button onClick={() => setWizardStep(wizardStep + 1)} data-testid="wizard-next-button">
                          Weiter
                          <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                      ) : (
                        <Button 
                          onClick={handleGenerate}
                          disabled={generating || !form.topic.trim()}
                          className="bg-blue-600 hover:bg-blue-700"
                          data-testid="generate-button"
                        >
                          {generating ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Wird generiert...</>
                          ) : (
                            <><Sparkles className="h-4 w-4 mr-2" /> Material erstellen</>
                          )}
                        </Button>
                      )}
                    </CardFooter>
                  </Card>

                  {error && (
                    <Alert variant="destructive" className="mt-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                </motion.div>
              )}

              {/* LIBRARY VIEW */}
              {activeView === 'library' && (
                <motion.div
                  key="library"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">Ihre Bibliothek</h2>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {worksheets.length} Material{worksheets.length !== 1 ? 'ien' : ''} gespeichert
                      </p>
                    </div>
                    <Button
                      onClick={() => { setActiveView('create'); setWizardStep(1) }}
                      data-testid="library-create-button"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Neues Material
                    </Button>
                  </div>

                  {/* Filters */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[200px] max-w-md">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Nach Titel oder Thema suchen..."
                          value={libraryFilter.search}
                          onChange={(e) => setLibraryFilter(prev => ({ ...prev, search: e.target.value }))}
                          className="pl-10"
                          data-testid="library-search-input"
                        />
                      </div>
                    </div>
                    <Select 
                      value={libraryFilter.subject}
                      onValueChange={(value) => setLibraryFilter(prev => ({ ...prev, subject: value }))}
                    >
                      <SelectTrigger className="w-[150px]" data-testid="library-filter-subject">
                        <SelectValue placeholder="Alle Fächer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle Fächer</SelectItem>
                        {SUBJECTS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select 
                      value={libraryFilter.grade}
                      onValueChange={(value) => setLibraryFilter(prev => ({ ...prev, grade: value }))}
                    >
                      <SelectTrigger className="w-[130px]" data-testid="library-filter-grade">
                        <SelectValue placeholder="Alle Klassen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle Klassen</SelectItem>
                        {GRADES.map((g) => (
                          <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1 border rounded-lg p-1">
                      <Button
                        variant={libraryView === 'grid' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setLibraryView('grid')}
                        data-testid="library-grid-toggle"
                      >
                        <Grid3X3 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={libraryView === 'list' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setLibraryView('list')}
                        data-testid="library-list-toggle"
                      >
                        <List className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Results */}
                  {filteredWorksheets.length === 0 ? (
                    <Card className="border-dashed border-gray-200">
                      <CardContent className="py-14 text-center">
                        <div className="w-14 h-14 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
                          {worksheets.length === 0 
                            ? <FolderOpen className="h-7 w-7 text-gray-400" />
                            : <Search className="h-7 w-7 text-gray-400" />
                          }
                        </div>
                        <h3 className="font-medium text-gray-700 mb-1">
                          {worksheets.length === 0 
                            ? 'Ihre Bibliothek ist noch leer'
                            : 'Keine Ergebnisse für diese Filter'}
                        </h3>
                        <p className="text-sm text-gray-500 max-w-sm mx-auto mb-5">
                          {worksheets.length === 0 
                            ? 'Erstellen Sie Ihr erstes Unterrichtsmaterial — die KI unterstützt Sie dabei.'
                            : 'Versuchen Sie es mit anderen Suchbegriffen oder setzen Sie die Filter zurück.'}
                        </p>
                        {worksheets.length === 0 ? (
                          <Button onClick={() => { setActiveView('create'); setWizardStep(1) }}>
                            <Sparkles className="h-4 w-4 mr-2" />
                            Erstes Material erstellen
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            onClick={() => setLibraryFilter({ search: '', subject: 'all', grade: 'all', type: 'all' })}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Filter zurücksetzen
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ) : libraryView === 'grid' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filteredWorksheets.map((ws) => (
                        <Card 
                          key={ws.id}
                          className="group cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
                          onClick={() => openWorksheetEditor(ws)}
                          data-testid={`worksheet-card-${ws.id}`}
                        >
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <CardTitle className="text-sm line-clamp-2">{ws.title}</CardTitle>
                                <p className="text-xs text-gray-400 mt-1">
                                  {ws.content?.questions?.length || 0} Fragen · {new Date(ws.created_at).toLocaleDateString('de-CH')}
                                </p>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 -mr-2 h-7 w-7 p-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openWorksheetEditor(ws) }}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Bearbeiten
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleExport(ws.id, 'pdf', 'student') }}>
                                    <Download className="h-4 w-4 mr-2" />
                                    Als PDF exportieren
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleExport(ws.id, 'docx', 'student') }}>
                                    <FileDown className="h-4 w-4 mr-2" />
                                    Als Word exportieren
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(ws.id) }}
                                    className="text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Löschen
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant="secondary" className="text-xs">{ws.grade}. Klasse</Badge>
                              <Badge variant="secondary" className="text-xs">{ws.subject}</Badge>
                              {ws.mode === 'exam' && (
                                <Badge className="text-xs bg-amber-100 text-amber-700">Prüfung</Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card>
                      <div className="divide-y">
                        {filteredWorksheets.map((ws) => (
                          <div
                            key={ws.id}
                            className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => openWorksheetEditor(ws)}
                            data-testid={`worksheet-list-${ws.id}`}
                          >
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${ws.mode === 'exam' ? 'bg-amber-50' : 'bg-blue-50'}`}>
                              {ws.mode === 'exam' ? <FileCheck className="h-4 w-4 text-amber-600" /> : <FileText className="h-4 w-4 text-blue-600" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{ws.title}</p>
                              <p className="text-xs text-gray-500">
                                {ws.content?.questions?.length || 0} Fragen · {new Date(ws.created_at).toLocaleDateString('de-CH')}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <Badge variant="secondary" className="text-xs">{ws.grade}. Kl.</Badge>
                              <Badge variant="secondary" className="text-xs">{ws.subject}</Badge>
                              {ws.mode === 'exam' && <Badge className="text-xs bg-amber-100 text-amber-700 border-0">Prüfung</Badge>}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); handleExport(ws.id, 'pdf', 'student') }}>
                                    <Download className="h-3.5 w-3.5 text-gray-400" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>PDF exportieren</TooltipContent>
                              </Tooltip>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openWorksheetEditor(ws) }}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Bearbeiten
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleExport(ws.id, 'docx', 'student') }}>
                                    <FileDown className="h-4 w-4 mr-2" />
                                    Word exportieren
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(ws.id) }}
                                    className="text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Löschen
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </motion.div>
              )}

              {/* MATERIAL UPLOAD VIEW */}
              {activeView === 'upload' && (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Upload & Actions */}
                    <div className="lg:col-span-2 space-y-6">
                      {/* Step Indicator */}
                      <div className="flex items-center gap-3">
                        {[
                          { step: 1, label: 'Hochladen' },
                          { step: 2, label: 'Analyse' },
                          { step: 3, label: 'Aktionen' },
                        ].map((s, i) => (
                          <div key={s.step} className="flex items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                              uploadStep >= s.step
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-400'
                            }`}>
                              {uploadStep > s.step ? <Check className="h-4 w-4" /> : s.step}
                            </div>
                            <span className={`ml-2 text-sm font-medium ${uploadStep >= s.step ? 'text-gray-900' : 'text-gray-400'}`}>
                              {s.label}
                            </span>
                            {i < 2 && <ChevronRight className="h-4 w-4 mx-3 text-gray-300" />}
                          </div>
                        ))}
                      </div>

                      {/* Step 1: Upload Zone */}
                      {uploadStep === 1 && (
                        <Card data-testid="upload-dropzone-card">
                          <CardHeader>
                            <CardTitle className="text-base">Eigenes Material hochladen</CardTitle>
                            <CardDescription>
                              Laden Sie ein bestehendes Arbeitsblatt, eine Prüfung oder einen Text hoch.
                              Die KI analysiert den Inhalt und schlägt passende Aktionen vor.
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div
                              onDragEnter={handleDrag}
                              onDragLeave={handleDrag}
                              onDragOver={handleDrag}
                              onDrop={handleDrop}
                              onClick={() => document.getElementById('material-file-input')?.click()}
                              className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                                dragActive
                                  ? 'border-blue-500 bg-blue-50 scale-[1.01]'
                                  : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'
                              }`}
                              data-testid="upload-dropzone"
                            >
                              <input
                                id="material-file-input"
                                type="file"
                                className="hidden"
                                accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg"
                                onChange={(e) => {
                                  if (e.target.files?.[0]) handleFileUpload(e.target.files[0])
                                }}
                                data-testid="material-file-input"
                              />
                              {uploadingFile ? (
                                <div className="space-y-4">
                                  <Loader2 className="h-10 w-10 mx-auto text-blue-500 animate-spin" />
                                  <p className="text-blue-600 font-medium">Datei wird hochgeladen...</p>
                                  <Progress value={65} className="w-48 mx-auto" />
                                </div>
                              ) : (
                                <>
                                  <div className="w-14 h-14 mx-auto mb-4 bg-blue-50 rounded-2xl flex items-center justify-center">
                                    <FileUp className="h-7 w-7 text-blue-500" />
                                  </div>
                                  <p className="text-base font-medium text-gray-900 mb-1">
                                    {dragActive ? 'Datei hier ablegen' : 'Klicken oder Datei hierher ziehen'}
                                  </p>
                                  <p className="text-sm text-gray-500 mb-3">
                                    PDF, Word, Text oder Bild (max. 10 MB)
                                  </p>
                                  <div className="flex justify-center gap-2">
                                    {['PDF', 'DOCX', 'TXT', 'PNG', 'JPG'].map(ft => (
                                      <Badge key={ft} variant="secondary" className="text-xs font-normal">{ft}</Badge>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Optional Instructions */}
                            <div className="space-y-2">
                              <Label className="text-xs text-gray-500 flex items-center gap-1.5">
                                <Wand2 className="h-3 w-3" />
                                Optionale Anweisungen an die KI
                              </Label>
                              <Textarea
                                value={uploadInstructions}
                                onChange={(e) => setUploadInstructions(e.target.value)}
                                placeholder="z.B. «Fokussiere dich auf Kapitel 3», «Passe das Material für die 5. Klasse an» oder «Nutze den Text nur als Inspiration»"
                                className="min-h-[60px] text-sm"
                                data-testid="upload-instructions-input"
                              />
                              <p className="text-xs text-gray-400">
                                Diese Anweisungen werden bei der Analyse und bei Transformationen berücksichtigt.
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Step 2: Analysis Loading */}
                      {uploadStep === 2 && analyzingMaterial && (
                        <Card data-testid="analysis-loading-card">
                          <CardContent className="py-16 text-center">
                            <Loader2 className="h-12 w-12 mx-auto text-blue-500 animate-spin mb-4" />
                            <h3 className="font-medium text-gray-900 mb-2">KI analysiert Ihr Material...</h3>
                            <p className="text-sm text-gray-500">Fach, Thema, Klassenstufe und Schlüsselwörter werden erkannt</p>
                            <Progress value={50} className="w-64 mx-auto mt-4" />
                          </CardContent>
                        </Card>
                      )}

                      {/* Step 3: Analysis Result + Smart Actions */}
                      {uploadStep === 3 && selectedMaterial?.analysis && (
                        <>
                          {/* Analysis Summary */}
                          <Card data-testid="analysis-result-card">
                            <CardHeader>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                  </div>
                                  <div>
                                    <CardTitle className="text-base">Analyse abgeschlossen</CardTitle>
                                    <CardDescription>{selectedMaterial.filename}</CardDescription>
                                  </div>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedMaterial(null)
                                    setUploadStep(1)
                                  }}
                                  data-testid="upload-new-material-btn"
                                >
                                  <FileUp className="h-4 w-4 mr-2" />
                                  Neues Material
                                </Button>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              {/* Key Metadata */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[
                                  { label: 'Fach', value: selectedMaterial.analysis.detected_subject, icon: BookOpen },
                                  { label: 'Thema', value: selectedMaterial.analysis.detected_topic, icon: Target },
                                  { label: 'Klassenstufe', value: selectedMaterial.analysis.detected_grade === 'unklar' ? 'Nicht erkannt' : `${selectedMaterial.analysis.detected_grade}. Klasse`, icon: GraduationCap },
                                  { label: 'Dokumenttyp', value: selectedMaterial.analysis.document_type, icon: FileText },
                                ].map((item, i) => (
                                  <div key={i} className="bg-gray-50 rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-1">
                                      <item.icon className="h-3.5 w-3.5 text-gray-400" />
                                      <span className="text-xs text-gray-500">{item.label}</span>
                                    </div>
                                    <p className="text-sm font-medium text-gray-900 line-clamp-1">{item.value || '—'}</p>
                                  </div>
                                ))}
                              </div>

                              {/* Summary */}
                              {selectedMaterial.analysis.content_summary && (
                                <div className="bg-blue-50 rounded-lg p-4">
                                  <div className="flex items-start gap-2">
                                    <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                      <p className="text-sm font-medium text-blue-900 mb-1">Zusammenfassung</p>
                                      <p className="text-sm text-blue-800">{selectedMaterial.analysis.content_summary}</p>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Keywords */}
                              {selectedMaterial.analysis.keywords?.length > 0 && (
                                <div>
                                  <p className="text-xs text-gray-500 mb-2">Schlüsselwörter</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {selectedMaterial.analysis.keywords.map((kw, i) => (
                                      <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Learning Goals */}
                              {selectedMaterial.analysis.learning_goals?.length > 0 && (
                                <div>
                                  <p className="text-xs text-gray-500 mb-2">Mögliche Lernziele</p>
                                  <ul className="space-y-1">
                                    {selectedMaterial.analysis.learning_goals.map((goal, i) => (
                                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                        <Target className="h-3.5 w-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                                        {goal}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Additional Info */}
                              <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t">
                                {selectedMaterial.analysis.has_exercises !== undefined && (
                                  <span className="flex items-center gap-1">
                                    {selectedMaterial.analysis.has_exercises ? <CheckCircle className="h-3 w-3 text-green-500" /> : <Circle className="h-3 w-3" />}
                                    Aufgaben vorhanden
                                  </span>
                                )}
                                {selectedMaterial.analysis.has_solutions !== undefined && (
                                  <span className="flex items-center gap-1">
                                    {selectedMaterial.analysis.has_solutions ? <CheckCircle className="h-3 w-3 text-green-500" /> : <Circle className="h-3 w-3" />}
                                    Lösungen vorhanden
                                  </span>
                                )}
                                {selectedMaterial.analysis.language_level && (
                                  <span>Sprachniveau: {selectedMaterial.analysis.language_level}</span>
                                )}
                              </div>
                            </CardContent>
                          </Card>

                          {/* Smart Actions */}
                          <Card data-testid="smart-actions-card">
                            <CardHeader>
                              <CardTitle className="text-base flex items-center gap-2">
                                <Wand2 className="h-5 w-5 text-blue-500" />
                                Material transformieren
                              </CardTitle>
                              <CardDescription>
                                Erstellen Sie neues Unterrichtsmaterial basierend auf Ihrem hochgeladenen Dokument
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              {/* Settings row */}
                              <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b">
                                <Select
                                  value={form.grade}
                                  onValueChange={(v) => setForm(p => ({ ...p, grade: v }))}
                                >
                                  <SelectTrigger className="w-[130px]" data-testid="transform-grade-select">
                                    <SelectValue placeholder="Klasse" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {GRADES.map((g) => (
                                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Select
                                  value={form.difficulty}
                                  onValueChange={(v) => setForm(p => ({ ...p, difficulty: v }))}
                                >
                                  <SelectTrigger className="w-[130px]" data-testid="transform-difficulty-select">
                                    <SelectValue placeholder="Schwierigkeit" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {DIFFICULTY_LEVELS.map((d) => (
                                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs text-gray-500">Fragen:</Label>
                                  <Select
                                    value={String(form.questionCount)}
                                    onValueChange={(v) => setForm(p => ({ ...p, questionCount: parseInt(v) }))}
                                  >
                                    <SelectTrigger className="w-[80px]" data-testid="transform-count-select">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[5, 8, 10, 12, 15, 20].map((n) => (
                                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              {/* Action Buttons Grid */}
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {TRANSFORM_ACTIONS.map((action) => (
                                  <button
                                    key={action.id}
                                    onClick={() => handleTransformMaterial(action.id)}
                                    disabled={transformingMaterial}
                                    className={`group relative flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all ${
                                      transformingMaterial && selectedAction === action.id
                                        ? 'border-blue-300 bg-blue-50'
                                        : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                                    } ${transformingMaterial && selectedAction !== action.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                    data-testid={`transform-action-${action.id}`}
                                  >
                                    <div className="flex items-center gap-2 w-full">
                                      {transformingMaterial && selectedAction === action.id ? (
                                        <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                                      ) : (
                                        <action.icon className="h-5 w-5 text-blue-500 group-hover:text-blue-600" />
                                      )}
                                      <span className="text-sm font-medium text-gray-900">{action.label}</span>
                                    </div>
                                    <p className="text-xs text-gray-500">{action.description}</p>
                                  </button>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        </>
                      )}

                      {/* Preview: file text excerpt */}
                      {uploadStep >= 2 && selectedMaterial?.preview && !analyzingMaterial && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Eye className="h-4 w-4 text-gray-400" />
                              Textvorschau
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-4 max-h-48 overflow-auto whitespace-pre-wrap font-sans">
                              {selectedMaterial.preview}
                            </pre>
                          </CardContent>
                        </Card>
                      )}
                    </div>

                    {/* Right: Material History */}
                    <div className="space-y-4">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Hochgeladene Materialien</CardTitle>
                          <CardDescription className="text-xs">{materials.length} Material{materials.length !== 1 ? 'ien' : ''}</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                          {materials.length === 0 ? (
                            <div className="text-center py-8 px-4">
                              <FolderOpen className="h-10 w-10 mx-auto text-gray-300 mb-2" />
                              <p className="text-xs text-gray-500">Noch keine Materialien hochgeladen</p>
                            </div>
                          ) : (
                            <ScrollArea className="max-h-[500px]">
                              <div className="divide-y">
                                {materials.map((mat) => (
                                  <div
                                    key={mat.id}
                                    className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                                      selectedMaterial?.material_id === mat.id ? 'bg-blue-50' : ''
                                    }`}
                                    onClick={async () => {
                                      setSelectedMaterial({
                                        material_id: mat.id,
                                        filename: mat.filename,
                                        file_type: mat.file_type,
                                        analysis: mat.analysis,
                                        preview: mat.parse_result?.full_text?.slice(0, 500) || ''
                                      })
                                      setUploadStep(mat.status === 'analyzed' ? 3 : 1)
                                    }}
                                    data-testid={`material-item-${mat.id}`}
                                  >
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                      mat.file_type === 'pdf' ? 'bg-red-50' :
                                      mat.file_type === 'docx' ? 'bg-blue-50' :
                                      mat.file_type === 'image' ? 'bg-purple-50' : 'bg-gray-50'
                                    }`}>
                                      <FileText className={`h-4 w-4 ${
                                        mat.file_type === 'pdf' ? 'text-red-500' :
                                        mat.file_type === 'docx' ? 'text-blue-500' :
                                        mat.file_type === 'image' ? 'text-purple-500' : 'text-gray-400'
                                      }`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900 truncate">{mat.filename}</p>
                                      <p className="text-xs text-gray-500">
                                        {mat.analysis?.detected_subject || mat.file_type?.toUpperCase()}
                                        {mat.created_at && ` · ${new Date(mat.created_at).toLocaleDateString('de-CH')}`}
                                      </p>
                                    </div>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                          <MoreHorizontal className="h-3.5 w-3.5" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleDeleteMaterial(mat.id)
                                          }}
                                          className="text-red-600"
                                        >
                                          <Trash2 className="h-4 w-4 mr-2" />
                                          Löschen
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          )}
                        </CardContent>
                      </Card>

                      {/* Tip Card */}
                      <Card className="border-blue-100 bg-blue-50/50">
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-3">
                            <Lightbulb className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-blue-900 mb-1">Tipp</p>
                              <p className="text-xs text-blue-700">
                                Laden Sie ein bestehendes Arbeitsblatt, eine Prüfung oder einen Text hoch.
                                Die KI erkennt automatisch Fach, Thema und Klassenstufe und kann daraus
                                neues Material in verschiedenen Formaten erstellen.
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </motion.div>
              )}



              {/* EDITOR VIEW */}
              {activeView === 'editor' && editedWorksheet && (
                <motion.div
                  key="editor"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-6"
                >
                  {/* Main Editor */}
                  <div className="lg:col-span-8 space-y-4">
                    {/* Editor Toolbar */}
                    <Card className="sticky top-20 z-20 bg-white">
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setActiveView('library'); setSelectedWorksheet(null); setEditedWorksheet(null) }}
                            >
                              <ArrowLeft className="h-4 w-4 mr-1" />
                              Zurück
                            </Button>
                            <Separator orientation="vertical" className="h-6" />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={handleUndo} disabled={undoStack.length === 0}>
                                  <Undo2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Rückgängig (⌘Z)</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={handleRedo} disabled={redoStack.length === 0}>
                                  <Redo2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Wiederholen (⌘⇧Z)</TooltipContent>
                            </Tooltip>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant={editMode ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setEditMode(!editMode)}
                            >
                              {editMode ? <Eye className="h-4 w-4 mr-1" /> : <Edit className="h-4 w-4 mr-1" />}
                              {editMode ? 'Vorschau' : 'Bearbeiten'}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSaveWorksheet()}
                              disabled={saving}
                              className="bg-green-600 hover:bg-green-700"
                              data-testid="save-button"
                            >
                              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                              Speichern
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Document */}
                    <Card className="bg-white shadow-lg" data-testid="document-stage">
                      <CardContent className="p-8">
                        {/* Header */}
                        <div className="mb-6">
                          {editMode ? (
                            <Input
                              value={editedWorksheet.title}
                              onChange={(e) => {
                                pushUndo()
                                setEditedWorksheet({
                                  ...editedWorksheet,
                                  title: e.target.value,
                                  content: { ...editedWorksheet.content, title: e.target.value }
                                })
                              }}
                              className="text-2xl font-bold border-0 border-b-2 border-dashed focus:border-blue-500 bg-transparent px-0 h-auto py-2"
                              data-testid="title-input"
                            />
                          ) : (
                            <h1 className="text-2xl font-bold text-gray-900">{editedWorksheet.title}</h1>
                          )}
                          <div className="flex flex-wrap gap-2 mt-3">
                            <Badge variant="outline">{editedWorksheet.grade}. Klasse</Badge>
                            <Badge variant="outline">{editedWorksheet.subject}</Badge>
                            <Badge variant="outline">
                              {editedWorksheet.difficulty === 'easy' ? 'Einfach' : 
                               editedWorksheet.difficulty === 'medium' ? 'Mittel' : 'Schwierig'}
                            </Badge>
                            <Badge variant={editedWorksheet.mode === 'exam' ? 'default' : 'secondary'}>
                              {editedWorksheet.mode === 'exam' ? 'Prüfung' : 'Arbeitsblatt'}
                            </Badge>
                          </div>
                        </div>

                        {/* Total Points for Exam */}
                        {editedWorksheet.mode === 'exam' && (
                          <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                            <p className="text-lg font-semibold text-blue-800">
                              Gesamtpunkte: {editedWorksheet.content.questions.reduce((sum, q) => sum + (q.points || 0), 0)}
                            </p>
                          </div>
                        )}

                        <Separator className="mb-6" />

                        {/* Add Question Button (Top) */}
                        {editMode && (
                          <Button
                            variant="outline"
                            onClick={() => addQuestion(-1)}
                            className="w-full mb-4 border-dashed"
                            data-testid="add-question-top-button"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Frage hinzufügen
                          </Button>
                        )}

                        {/* Questions */}
                        {editMode ? (
                          <Reorder.Group 
                            axis="y" 
                            values={editedWorksheet.content.questions}
                            onReorder={reorderQuestions}
                            className="space-y-4"
                          >
                            {editedWorksheet.content.questions.map((q, index) => (
                              <Reorder.Item key={q.id} value={q} className="cursor-grab active:cursor-grabbing">
                                <Card className="border-gray-200 hover:border-gray-300 transition-colors" data-testid={`question-editor-${index}`}>
                                  <CardContent className="pt-4">
                                    <div className="flex items-start gap-3">
                                      <div className="flex flex-col items-center gap-1 pt-1">
                                        <GripVertical className="h-5 w-5 text-gray-400" />
                                        <span className="text-sm font-bold text-gray-500">{q.number}</span>
                                      </div>
                                      
                                      <div className="flex-1 space-y-3">
                                        {/* Type & Points */}
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Select
                                            value={q.type}
                                            onValueChange={(value) => updateQuestion(q.id, 'type', value)}
                                          >
                                            <SelectTrigger className="w-40 h-8 text-xs">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {QUESTION_TYPES.map((type) => (
                                                <SelectItem key={type.value} value={type.value}>
                                                  {type.icon} {type.label}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                          
                                          {editedWorksheet.mode === 'exam' && (
                                            <div className="flex items-center gap-1">
                                              <Input
                                                type="number"
                                                min="0"
                                                max="20"
                                                value={q.points || 0}
                                                onChange={(e) => updateQuestion(q.id, 'points', parseInt(e.target.value) || 0)}
                                                className="w-16 h-8 text-xs"
                                              />
                                              <span className="text-xs text-gray-500">Pkt.</span>
                                            </div>
                                          )}
                                          
                                          <div className="flex items-center gap-1 ml-auto">
                                            <span className="text-xs text-gray-500">Zeilen:</span>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-6 w-6 p-0"
                                              onClick={() => updateQuestion(q.id, 'answerLines', Math.max(0, (q.answerLines || 3) - 1))}
                                            >
                                              <Minus className="h-3 w-3" />
                                            </Button>
                                            <span className="text-xs w-4 text-center">{q.answerLines || 3}</span>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-6 w-6 p-0"
                                              onClick={() => updateQuestion(q.id, 'answerLines', Math.min(10, (q.answerLines || 3) + 1))}
                                            >
                                              <Plus className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </div>
                                        
                                        {/* Question Text */}
                                        <Textarea
                                          value={q.question}
                                          onChange={(e) => updateQuestion(q.id, 'question', e.target.value)}
                                          placeholder="Fragetext eingeben..."
                                          className="min-h-[60px]"
                                        />
                                        
                                        {/* Options for MC */}
                                        {q.type === 'multiple_choice' && (
                                          <div className="space-y-2 pl-4">
                                            <Label className="text-xs text-gray-500">Optionen (eine pro Zeile)</Label>
                                            <Textarea
                                              value={(q.options || []).join('\n')}
                                              onChange={(e) => updateQuestion(q.id, 'options', e.target.value.split('\n').filter(o => o.trim()))}
                                              placeholder="A) Option 1&#10;B) Option 2&#10;C) Option 3"
                                              className="min-h-[80px] text-sm"
                                            />
                                          </div>
                                        )}
                                        
                                        {/* Answer & Explanation */}
                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <Label className="text-xs text-gray-500">Lösung</Label>
                                            <Input
                                              value={q.answer || ''}
                                              onChange={(e) => updateQuestion(q.id, 'answer', e.target.value)}
                                              placeholder="Korrekte Antwort"
                                              className="mt-1"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs text-gray-500">Erklärung</Label>
                                            <Input
                                              value={q.explanation || ''}
                                              onChange={(e) => updateQuestion(q.id, 'explanation', e.target.value)}
                                              placeholder="Optional"
                                              className="mt-1"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                      
                                      {/* Actions */}
                                      <div className="flex flex-col gap-1">
                                        {/* AI Improve */}
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                              <Wand2 className="h-4 w-4 text-purple-500" />
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent>
                                            <DropdownMenuLabel>KI-Verbesserung</DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => handleImproveQuestion(q.id, 'easier')}>
                                              Einfacher machen
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleImproveQuestion(q.id, 'harder')}>
                                              Schwieriger machen
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleImproveQuestion(q.id, 'clarify')}>
                                              Klarer formulieren
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleImproveQuestion(q.id, 'alternative')}>
                                              Alternative erstellen
                                            </DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => duplicateQuestion(q.id)}>
                                              <Copy className="h-4 w-4" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Duplizieren</TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button 
                                              size="sm" 
                                              variant="ghost" 
                                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700" 
                                              onClick={() => setDeleteConfirmId(q.id)}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Löschen</TooltipContent>
                                        </Tooltip>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              </Reorder.Item>
                            ))}
                          </Reorder.Group>
                        ) : (
                          <div className="space-y-6">
                            {editedWorksheet.content.questions.map((q, index) => (
                              <div key={q.id} className="border-l-4 border-blue-500 pl-6 py-3" data-testid={`question-view-${index}`}>
                                <p className="font-semibold text-lg mb-2">
                                  {q.number}. {q.question}
                                  {editedWorksheet.mode === 'exam' && q.points && (
                                    <Badge variant="secondary" className="ml-3">
                                      {q.points} Pkt.
                                    </Badge>
                                  )}
                                </p>
                                {q.options && q.type === 'multiple_choice' && (
                                  <div className="space-y-2 mb-3 ml-4">
                                    {q.options.map((option, i) => (
                                      <p key={i} className="text-gray-700">○ {option}</p>
                                    ))}
                                  </div>
                                )}
                                {q.type !== 'multiple_choice' && (q.answerLines || 3) > 0 && (
                                  <div className="mt-3 space-y-2 ml-4">
                                    {Array.from({ length: q.answerLines || 3 }).map((_, i) => (
                                      <div key={i} className="border-b border-gray-300 h-6" />
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add Question Button (Bottom) */}
                        {editMode && (
                          <Button
                            variant="outline"
                            onClick={() => addQuestion()}
                            className="w-full mt-4 border-dashed"
                            data-testid="add-question-bottom-button"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Frage hinzufügen
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Sidebar */}
                  <div className="lg:col-span-4 space-y-4">
                    {/* Export */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Download className="h-4 w-4" />
                          Exportieren
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-gray-500">PDF</p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => handleExport(editedWorksheet.id, 'pdf', 'student')}
                              disabled={exporting}
                              data-testid="export-pdf-student-button"
                            >
                              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Schüler'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => handleExport(editedWorksheet.id, 'pdf', 'teacher')}
                              disabled={exporting}
                              data-testid="export-pdf-teacher-button"
                            >
                              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Lehrer'}
                            </Button>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-gray-500">Word</p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => handleExport(editedWorksheet.id, 'docx', 'student')}
                              disabled={exporting}
                              data-testid="export-docx-student-button"
                            >
                              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Schüler'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => handleExport(editedWorksheet.id, 'docx', 'teacher')}
                              disabled={exporting}
                              data-testid="export-docx-teacher-button"
                            >
                              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Lehrer'}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Differentiation */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <BarChart3 className="h-4 w-4" />
                          Differenzierung
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-2">
                          {DIFFICULTY_LEVELS.map((level) => (
                            <Button
                              key={level.value}
                              size="sm"
                              variant={editedWorksheet.difficulty === level.value ? 'default' : 'outline'}
                              className="text-xs"
                              disabled={generating}
                            >
                              {level.label}
                            </Button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Teacher Notes */}
                    {editedWorksheet.content?.teacher_notes && (
                      <Card className="bg-amber-50 border-amber-200">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                            <Lightbulb className="h-4 w-4" />
                            Lehrernotizen
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-amber-900">{editedWorksheet.content.teacher_notes}</p>
                        </CardContent>
                      </Card>
                    )}

                    {/* Actions */}
                    <Card>
                      <CardContent className="pt-4 space-y-2">
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => setDeleteConfirmId(editedWorksheet.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2 text-red-500" />
                          <span className="text-red-600">Löschen</span>
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </motion.div>
              )}

              {/* TEMPLATES VIEW */}
              {activeView === 'templates' && (
                <motion.div
                  key="templates"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Header */}
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">Vorlagen</h2>
                    <p className="text-sm text-gray-500 mt-1">Nutzen Sie vorgefertigte Strukturen, um in Sekunden loszulegen.</p>
                  </div>

                  {/* Starter Templates Grid */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Vorgeschlagene Vorlagen</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[
                        { title: 'Wochentest Mathematik', subject: 'Mathematik', grade: '4', type: 'exam', desc: '10 Fragen, gemischte Aufgabentypen für den wöchentlichen Mathetest', icon: '🔢', questions: 10 },
                        { title: 'Leseverständnis', subject: 'Deutsch', grade: '3', type: 'worksheet', desc: 'Textbasierte Fragen zum Lesen und Verstehen', icon: '📖', questions: 8 },
                        { title: 'Vokabeltest Englisch', subject: 'Englisch', grade: '5', type: 'quiz', desc: 'Schneller Vokabeltest mit Zuordnung und Lückentext', icon: '🇬🇧', questions: 12 },
                        { title: 'NMG Forscherfragen', subject: 'NMG', grade: '4', type: 'worksheet', desc: 'Offene Fragen und Beobachtungsaufgaben', icon: '🌍', questions: 6 },
                        { title: 'Diktat-Vorbereitung', subject: 'Deutsch', grade: '2', type: 'worksheet', desc: 'Lückentext und Abschreibübungen zur Diktatvorbereitung', icon: '✏️', questions: 8 },
                        { title: 'Schnelle Lernkontrolle', subject: 'Mathematik', grade: '5', type: 'quiz', desc: '5-Minuten-Quiz für den Stundenanfang', icon: '⚡', questions: 5 },
                      ].map((tpl, i) => (
                        <Card
                          key={i}
                          className="cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group"
                          onClick={() => {
                            setForm(prev => ({
                              ...prev,
                              resourceType: tpl.type,
                              subject: tpl.subject,
                              grade: tpl.grade,
                              questionCount: tpl.questions,
                              topic: ''
                            }))
                            setActiveView('create')
                            setWizardStep(3) // Jump to topic step
                          }}
                          data-testid={`template-${i}`}
                        >
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between">
                              <span className="text-2xl">{tpl.icon}</span>
                              <Badge variant="secondary" className="text-xs">{tpl.grade}. Klasse</Badge>
                            </div>
                            <CardTitle className="text-sm mt-2">{tpl.title}</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <p className="text-xs text-gray-500 mb-3">{tpl.desc}</p>
                            <div className="flex gap-1.5">
                              <Badge variant="outline" className="text-xs">{tpl.subject}</Badge>
                              <Badge variant="outline" className="text-xs">{tpl.questions} Fragen</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {/* Coming soon: Custom Templates */}
                  <Card className="border-dashed border-gray-200 bg-gray-50/50">
                    <CardContent className="py-10 text-center">
                      <div className="w-12 h-12 mx-auto mb-3 bg-white rounded-xl flex items-center justify-center border">
                        <Layout className="h-6 w-6 text-gray-400" />
                      </div>
                      <h3 className="font-medium text-gray-700 mb-1">Eigene Vorlagen speichern</h3>
                      <p className="text-sm text-gray-500 max-w-md mx-auto">
                        Bald können Sie häufig verwendete Arbeitsblatt-Strukturen als persönliche Vorlage speichern und mit einem Klick wiederverwenden.
                      </p>
                      <Badge variant="secondary" className="mt-3">Demnächst verfügbar</Badge>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* CURRICULUM VIEW */}
              {activeView === 'curriculum' && (
                <motion.div
                  key="curriculum"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Header */}
                  <div>
                    <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                      Lehrplan 21
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Richten Sie Ihre Materialien gezielt an den Kompetenzen des Lehrplan 21 aus.</p>
                  </div>

                  {/* Curriculum Overview */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { zyklus: 'Zyklus 1', grades: '1.–2. Klasse', areas: ['Deutsch', 'Mathematik', 'NMG'], color: 'bg-green-50 border-green-200 text-green-800', iconColor: 'text-green-600' },
                      { zyklus: 'Zyklus 2', grades: '3.–6. Klasse', areas: ['Deutsch', 'Mathematik', 'NMG', 'Englisch', 'Französisch'], color: 'bg-blue-50 border-blue-200 text-blue-800', iconColor: 'text-blue-600' },
                    ].map((z, i) => (
                      <Card key={i} className={`${z.color}`}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                              <GraduationCap className={`h-5 w-5 ${z.iconColor}`} />
                            </div>
                            <div>
                              <CardTitle className="text-sm">{z.zyklus}</CardTitle>
                              <CardDescription className="text-xs">{z.grades}</CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {z.areas.map((area, j) => (
                              <Badge key={j} variant="secondary" className="text-xs bg-white/70">{area}</Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Feature Preview */}
                  <Card>
                    <CardContent className="py-8">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                          { icon: Target, title: 'Kompetenzen auswählen', desc: 'Durchsuchen und filtern Sie die Kompetenzbereiche des Lehrplan 21 und verknüpfen Sie diese mit Ihren Materialien.' },
                          { icon: BookMarked, title: 'Materialien ausrichten', desc: 'Die KI erstellt Fragen, die gezielt auf die gewählten Kompetenzstufen abgestimmt sind.' },
                          { icon: BarChart3, title: 'Abdeckung im Blick', desc: 'Sehen Sie auf einen Blick, welche Kompetenzbereiche Sie bereits abgedeckt haben und wo noch Lücken sind.' },
                        ].map((feat, i) => (
                          <div key={i} className="text-center">
                            <div className="w-10 h-10 mx-auto mb-3 bg-blue-50 rounded-lg flex items-center justify-center">
                              <feat.icon className="h-5 w-5 text-blue-600" />
                            </div>
                            <h4 className="text-sm font-medium text-gray-900 mb-1">{feat.title}</h4>
                            <p className="text-xs text-gray-500">{feat.desc}</p>
                          </div>
                        ))}
                      </div>
                      <div className="text-center mt-6">
                        <Badge variant="secondary">Wird gerade entwickelt</Badge>
                        <p className="text-xs text-gray-400 mt-2">Die Lehrplan-21-Integration wird in einem kommenden Update verfügbar sein.</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* EXPORTS VIEW */}
              {activeView === 'exports' && (
                <motion.div
                  key="exports"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Header */}
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">Exporte</h2>
                    <p className="text-sm text-gray-500 mt-1">Alle Ihre exportierten Materialien an einem Ort.</p>
                  </div>

                  {/* Quick Export Hint */}
                  <Card className="bg-blue-50/50 border-blue-100">
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center flex-shrink-0 border border-blue-100">
                          <Download className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-blue-900 mb-0.5">So exportieren Sie</p>
                          <p className="text-xs text-blue-700">
                            Öffnen Sie ein Arbeitsblatt im Editor und nutzen Sie die Export-Optionen in der rechten Seitenleiste.
                            Sie können zwischen PDF und Word wählen — jeweils als Schüler- oder Lehrerversion.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Exportable Materials */}
                  {worksheets.length > 0 ? (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Ihre Materialien zum Exportieren</CardTitle>
                        <CardDescription className="text-xs">{worksheets.length} Materialien verfügbar</CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="divide-y">
                          {worksheets.slice(0, 10).map((ws) => (
                            <div
                              key={ws.id}
                              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                              data-testid={`export-item-${ws.id}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ws.mode === 'exam' ? 'bg-amber-50' : 'bg-blue-50'}`}>
                                  {ws.mode === 'exam' ? <FileCheck className="h-4 w-4 text-amber-600" /> : <FileText className="h-4 w-4 text-blue-600" />}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900 line-clamp-1">{ws.title}</p>
                                  <p className="text-xs text-gray-500">{ws.subject} · {ws.grade}. Klasse · {ws.content?.questions?.length || 0} Fragen</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" data-testid={`export-btn-${ws.id}`}>
                                      <Download className="h-3.5 w-3.5 mr-1.5" />
                                      Exportieren
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Format wählen</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleExport(ws.id, 'pdf', 'student')}>
                                      PDF — Schülerversion
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleExport(ws.id, 'pdf', 'teacher')}>
                                      PDF — Lehrerversion
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleExport(ws.id, 'docx', 'student')}>
                                      Word — Schülerversion
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleExport(ws.id, 'docx', 'teacher')}>
                                      Word — Lehrerversion
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <Button variant="ghost" size="sm" onClick={() => openWorksheetEditor(ws)}>
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className="border-dashed border-gray-200">
                      <CardContent className="py-14 text-center">
                        <div className="w-14 h-14 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
                          <FileDown className="h-7 w-7 text-gray-400" />
                        </div>
                        <h3 className="font-medium text-gray-700 mb-1">Noch keine Materialien vorhanden</h3>
                        <p className="text-sm text-gray-500 max-w-sm mx-auto mb-5">
                          Erstellen Sie Ihr erstes Material und exportieren Sie es als PDF oder Word-Dokument.
                        </p>
                        <Button onClick={() => { setActiveView('create'); setWizardStep(1) }} data-testid="exports-create-btn">
                          <Sparkles className="h-4 w-4 mr-2" />
                          Erstes Material erstellen
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </motion.div>
              )}

              {/* SETTINGS VIEW */}
              {activeView === 'settings' && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="max-w-2xl space-y-6"
                >
                  {/* Header */}
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">Einstellungen</h2>
                    <p className="text-sm text-gray-500 mt-1">Passen Sie EduFlow an Ihren Unterrichtsalltag an.</p>
                  </div>

                  {/* Profile */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <CardTitle className="text-sm">Persönliche Angaben</CardTitle>
                          <CardDescription className="text-xs">Ihr Name und Ihre Kontaktdaten</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-500">Name</Label>
                          <Input value={user?.name || ''} disabled className="bg-gray-50" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-500">E-Mail</Label>
                          <Input value={user?.email || ''} disabled className="bg-gray-50" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* School & Export Identity */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                          <Building className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                          <CardTitle className="text-sm">Schule & Export-Angaben</CardTitle>
                          <CardDescription className="text-xs">Diese Angaben erscheinen auf Ihren exportierten Dokumenten.</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-500">Ihr Lehrername (z. B. auf Prüfungen)</Label>
                          <Input
                            placeholder="z.B. Frau Müller"
                            value={settings.teacherName}
                            onChange={(e) => setSettings(prev => ({ ...prev, teacherName: e.target.value }))}
                            data-testid="settings-teacher-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-500">Schulname</Label>
                          <Input
                            placeholder="z.B. Primarschule Zürich"
                            value={settings.schoolName}
                            onChange={(e) => setSettings(prev => ({ ...prev, schoolName: e.target.value }))}
                            data-testid="settings-school-name"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 flex items-center gap-1.5">
                        <Info className="h-3 w-3" />
                        Diese Angaben werden automatisch in die Kopfzeile exportierter PDFs und Word-Dokumente eingefügt.
                      </p>
                    </CardContent>
                  </Card>

                  {/* Defaults */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <Settings className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <CardTitle className="text-sm">Standardeinstellungen</CardTitle>
                          <CardDescription className="text-xs">Diese Werte werden beim Erstellen neuer Materialien vorausgefüllt.</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-500">Standard-Klasse</Label>
                          <Select
                            value={settings.defaultGrade}
                            onValueChange={(value) => setSettings(prev => ({ ...prev, defaultGrade: value }))}
                          >
                            <SelectTrigger data-testid="settings-default-grade">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {GRADES.map((g) => (
                                <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-500">Standard-Fach</Label>
                          <Select
                            value={settings.defaultSubject}
                            onValueChange={(value) => setSettings(prev => ({ ...prev, defaultSubject: value }))}
                          >
                            <SelectTrigger data-testid="settings-default-subject">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SUBJECTS.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-500">Standard-Niveau</Label>
                          <Select
                            value={settings.defaultDifficulty}
                            onValueChange={(value) => setSettings(prev => ({ ...prev, defaultDifficulty: value }))}
                          >
                            <SelectTrigger data-testid="settings-default-difficulty">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DIFFICULTY_LEVELS.map((d) => (
                                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="border-t pt-4">
                      <Button
                        onClick={() => {
                          localStorage.setItem('eduflow_settings', JSON.stringify(settings))
                          toast.success('Einstellungen gespeichert')
                        }}
                        data-testid="settings-save-button"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Einstellungen speichern
                      </Button>
                    </CardFooter>
                  </Card>

                  {/* Subscription */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                          <Crown className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <CardTitle className="text-sm">Abonnement</CardTitle>
                          <CardDescription className="text-xs">Ihr aktueller Plan und Nutzung</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">
                              {user?.subscription_tier === 'premium' ? 'Premium-Plan' : 'Kostenloser Plan'}
                            </p>
                            {user?.subscription_tier === 'premium' && (
                              <Badge className="bg-gradient-to-r from-amber-400 to-orange-500 text-white border-0 text-xs">Premium</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">
                            {user?.subscription_tier === 'premium' 
                              ? 'Unbegrenzte Materialien, alle Export-Formate, Priority-Support'
                              : `${user?.worksheets_used_this_month || 0} von 5 Materialien diesen Monat genutzt`}
                          </p>
                        </div>
                        {user?.subscription_tier !== 'premium' && (
                          <Button className="bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 shadow-md">
                            <Crown className="h-4 w-4 mr-2" />
                            Upgrade
                          </Button>
                        )}
                      </div>
                      {user?.subscription_tier === 'premium' && (
                        <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          Ihr Premium-Zugang ist aktiv. Vielen Dank für Ihre Unterstützung!
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Command Palette */}
        <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
          <CommandInput placeholder="Suchen oder Aktion ausführen..." />
          <CommandList>
            <CommandEmpty>Keine Ergebnisse</CommandEmpty>
            <CommandGroup heading="Aktionen">
              <CommandItem onSelect={() => { setActiveView('create'); setWizardStep(1); setCommandOpen(false) }}>
                <Sparkles className="h-4 w-4 mr-2" />
                Neues Material erstellen
              </CommandItem>
              <CommandItem onSelect={() => { setActiveView('upload'); setUploadStep(1); setSelectedMaterial(null); setCommandOpen(false) }}>
                <FileUp className="h-4 w-4 mr-2" />
                Material hochladen
              </CommandItem>
              <CommandItem onSelect={() => { setActiveView('library'); setCommandOpen(false) }}>
                <FolderOpen className="h-4 w-4 mr-2" />
                Bibliothek öffnen
              </CommandItem>
              <CommandItem onSelect={() => { setActiveView('templates'); setCommandOpen(false) }}>
                <Layout className="h-4 w-4 mr-2" />
                Vorlagen anzeigen
              </CommandItem>
              <CommandItem onSelect={() => { setActiveView('settings'); setCommandOpen(false) }}>
                <Settings className="h-4 w-4 mr-2" />
                Einstellungen
              </CommandItem>
            </CommandGroup>
            {worksheets.length > 0 && (
              <CommandGroup heading="Letzte Dokumente">
                {worksheets.slice(0, 5).map((ws) => (
                  <CommandItem 
                    key={ws.id} 
                    onSelect={() => { openWorksheetEditor(ws); setCommandOpen(false) }}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    {ws.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </CommandDialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Löschen bestätigen</DialogTitle>
              <DialogDescription>
                Möchten Sie dieses Element wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
                Abbrechen
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => {
                  if (deleteConfirmId) {
                    if (deleteConfirmId.startsWith('q')) {
                      deleteQuestion(deleteConfirmId)
                    } else {
                      handleDeleteWorksheet(deleteConfirmId)
                      setDeleteConfirmId(null)
                    }
                  }
                }}
              >
                Löschen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Generation Theater */}
        <AnimatePresence>
          {showGenerationTheater && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl"
              >
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="h-8 w-8 text-blue-600 animate-pulse" />
                  </div>
                  <h2 className="text-xl font-semibold">Wird erstellt...</h2>
                  <p className="text-gray-500 mt-1">Ihr Arbeitsblatt wird generiert</p>
                </div>

                <div className="space-y-3 mb-6">
                  {generationProgress.map((step, i) => (
                    <div key={i} className="flex items-center gap-3">
                      {step.type === 'complete' ? (
                        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                          <Check className="h-4 w-4 text-white" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-blue-600">{i + 1}</span>
                        </div>
                      )}
                      <span className="text-sm text-gray-700">{step.message}</span>
                    </div>
                  ))}
                </div>

                <Progress value={generationProgress.length > 0 ? generationProgress[generationProgress.length - 1].progress : 0} />

                <Button
                  variant="outline"
                  className="w-full mt-6"
                  onClick={() => setShowGenerationTheater(false)}
                >
                  Abbrechen
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Chat */}
        <AnimatePresence>
          <motion.button
            onClick={() => setChatOpen(!chatOpen)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 flex items-center justify-center"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            data-testid="chatbot-toggle-button"
          >
            {chatOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
          </motion.button>

          {chatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-3rem)]"
              data-testid="chatbot-panel"
            >
              <Card className="shadow-2xl">
                <CardHeader className="bg-blue-600 text-white rounded-t-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">KI-Assistent</CardTitle>
                        <CardDescription className="text-blue-100 text-xs">Fragen stellen oder Befehle geben</CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <ScrollArea className="h-80 p-4">
                  {chatMessages.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p className="text-sm mb-4">Wie kann ich helfen?</p>
                      <div className="space-y-2">
                        {['Mache Frage 3 einfacher', 'Füge 2 Fragen hinzu', 'Erkläre Lehrplan 21'].map((s, i) => (
                          <button
                            key={i}
                            onClick={() => setChatInput(s)}
                            className="block w-full text-left text-xs p-2 rounded-lg bg-gray-50 hover:bg-gray-100"
                          >
                            💡 {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {chatMessages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                            msg.role === 'user'
                              ? 'bg-blue-600 text-white rounded-br-md'
                              : msg.hasActions
                                ? 'bg-green-50 text-gray-800 border border-green-200 rounded-bl-md'
                                : 'bg-gray-100 text-gray-800 rounded-bl-md'
                          }`}>
                            {msg.content}
                          </div>
                        </div>
                      ))}
                      {chatLoading && (
                        <div className="flex justify-start">
                          <div className="bg-gray-100 p-3 rounded-2xl rounded-bl-md">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </ScrollArea>
                {editedWorksheet && (
                  <div className="px-4 py-2 bg-blue-50 border-t text-xs text-blue-700">
                    <span className="font-medium">Kontext:</span> {editedWorksheet.title}
                  </div>
                )}
                <CardFooter className="border-t p-4">
                  <div className="flex gap-2 w-full">
                    <Input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                      placeholder="Nachricht eingeben..."
                      disabled={chatLoading}
                      data-testid="chatbot-input"
                    />
                    <Button onClick={handleChatSend} disabled={chatLoading || !chatInput.trim()} data-testid="chatbot-send-button">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  )
}

export default EduFlowApp
