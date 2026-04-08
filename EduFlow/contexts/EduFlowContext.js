'use client'
import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useWorksheets } from '@/hooks/useWorksheets'
import { useUpload } from '@/hooks/useUpload'
import { useGeneration } from '@/hooks/useGeneration'
import { useEditor } from '@/hooks/useEditor'
import { useSettings } from '@/hooks/useSettings'

const EduFlowContext = createContext(null)

export function EduFlowProvider({ children }) {
  const auth = useAuth()
  const worksheetsMgr = useWorksheets(auth.token)
  const upload = useUpload(auth.token)
  const generation = useGeneration(auth.token)
  const editor = useEditor(auth.token)
  const { settings, setSettings, handleSaveSettings, applyTeacherTypeDefaults } = useSettings()

  // App-level state
  const [activeView, setActiveView] = useState('home')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)

  // Form state (shared between create + upload views)
  const [form, setForm] = useState({
    topic: '', grade: '3', subject: 'Deutsch', difficulty: 'medium',
    questionCount: 10, resourceType: 'worksheet', dyslexiaFont: false,
    competencyCode: '', theme: 'classic'
  })

  // Form question type preferences
  const [selectedQuestionTypes, setSelectedQuestionTypes] = useState([])

  // Dossier state
  const [dossiers, setDossiers] = useState([])
  const [selectedDossier, setSelectedDossier] = useState(null)
  const [dossierSaving, setDossierSaving] = useState(false)

  // Library state
  const [librarySearch, setLibrarySearch] = useState('')
  const [libraryFilterSubject, setLibraryFilterSubject] = useState('all')
  const [libraryFilterGrade, setLibraryFilterGrade] = useState('all')

  // Template state
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateFilterSubject, setTemplateFilterSubject] = useState('all')
  const [templateCategory, setTemplateCategory] = useState('all')

  // Lehrplan state
  const [expandedCycle, setExpandedCycle] = useState(null)
  const [expandedArea, setExpandedArea] = useState(null)
  const [curriculumSearch, setCurriculumSearch] = useState('')
  const [curriculumFilterSubject, setCurriculumFilterSubject] = useState('all')
  const [curriculumFilterCycle, setCurriculumFilterCycle] = useState('all')
  const [competencyTracker, setCompetencyTracker] = useState({})
  const [showSequenceFor, setShowSequenceFor] = useState(null)

  // Export history
  const [exportHistory, setExportHistory] = useState([])

  // Chat state
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef(null)

  // Planner state
  const [showPlanner, setShowPlanner] = useState(false)
  const [plannerEvents, setPlannerEvents] = useState([])
  const [plannerMonth, setPlannerMonth] = useState(new Date().getMonth())
  const [plannerYear, setPlannerYear] = useState(new Date().getFullYear())
  const [plannerView, setPlannerView] = useState('month')
  const [plannerWeekStart, setPlannerWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().split('T')[0]
  })
  const [quickAddForm, setQuickAddForm] = useState({ date: '', title: '', type: 'material', subject: '' })

  // Assignment state
  const [assignments, setAssignments] = useState([])
  const [selectedAssignment, setSelectedAssignment] = useState(null)
  const [assignmentSubmissions, setAssignmentSubmissions] = useState([])
  const [errorAnalysis, setErrorAnalysis] = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [expandedSubmission, setExpandedSubmission] = useState(null)
  const [errorAnalysisOpen, setErrorAnalysisOpen] = useState(true)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareForm, setShareForm] = useState({ className: '', classId: '', deadline: '', targetNiveau: '' })
  const [editingQuestion, setEditingQuestion] = useState(null)
  const [classOverview, setClassOverview] = useState(null)
  const [classOverviewOpen, setClassOverviewOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // Class management
  const [teacherClasses, setTeacherClasses] = useState([])
  const [selectedClass, setSelectedClass] = useState(null)
  const [classDetailData, setClassDetailData] = useState(null)
  const [newClassName, setNewClassName] = useState('')
  const [classLoading, setClassLoading] = useState(false)
  const [classStats, setClassStats] = useState(null)
  const [classInsights, setClassInsights] = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)

  // Collaboration
  const [comments, setComments] = useState([])
  const [versions, setVersions] = useState([])
  const [shareEmail, setShareEmail] = useState('')
  const [shareRole, setShareRole] = useState('view')
  const [sharedWithMe, setSharedWithMe] = useState([])

  // Gamification
  const [studentProgress, setStudentProgress] = useState({ totalCreated: 0, totalExported: 0, streak: 0 })

  // Image generation
  const [imageGenerating, setImageGenerating] = useState(false)
  const [imagePrompt, setImagePrompt] = useState('')
  const [imageStyle, setImageStyle] = useState('educational')

  // ============================================================
  // EFFECTS
  // ============================================================

  // Init from storage or Google OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const googleCode = params.get('google_code')
    const googleError = params.get('google_error')

    // Clean up URL params
    if (googleCode || googleError) {
      window.history.replaceState({}, '', window.location.pathname)
    }

    if (googleCode) {
      auth.handleGoogleCallback(googleCode).then(result => {
        if (result?.success && result.token) {
          auth.fetchCurrentUser(result.token).then(userData => {
            if (userData?.teacher_type) {
              worksheetsMgr.fetchWorksheets(result.token)
              fetchDossiers(result.token)
              loadAssignments(result.token)
              loadTeacherClasses(result.token)
            }
          })
        }
      })
      return
    }

    const savedToken = auth.initFromStorage()
    if (savedToken) {
      auth.fetchCurrentUser(savedToken).then(userData => {
        if (userData?.teacher_type) {
          worksheetsMgr.fetchWorksheets(savedToken)
          fetchDossiers(savedToken)
          loadAssignments(savedToken)
          loadTeacherClasses(savedToken)
        }
      })
    }
  }, [])

  // Cmd+K shortcut
  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setCommandOpen(o => !o) }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  // Load export history & competency tracker
  useEffect(() => {
    const saved = localStorage.getItem('eduflow_export_history')
    if (saved) { try { setExportHistory(JSON.parse(saved)) } catch(e) {} }
    const ct = localStorage.getItem('eduflow_competency_tracker')
    if (ct) { try { setCompetencyTracker(JSON.parse(ct)) } catch(e) {} }
  }, [])

  // Persist competency tracker
  useEffect(() => {
    if (Object.keys(competencyTracker).length > 0) {
      localStorage.setItem('eduflow_competency_tracker', JSON.stringify(competencyTracker))
    }
  }, [competencyTracker])

  // Auto-expand Lehrplan cycle
  useEffect(() => {
    if (activeView !== 'curriculum' || !auth.user?.teacher_type || expandedCycle) return
    if (auth.user.teacher_type === 'primar') setExpandedCycle('z2')
    else if (auth.user.teacher_type === 'sekundar') setExpandedCycle('z3')
  }, [activeView])

  // Apply teacher type defaults
  useEffect(() => {
    if (!auth.user?.teacher_type) return
    const defaults = applyTeacherTypeDefaults(auth.user.teacher_type)
    if (defaults) setForm(prev => ({ ...prev, grade: defaults.defaultGrade, subject: defaults.defaultSubject }))
  }, [auth.user?.teacher_type])

  // Auto-clear success message
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 4000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  // Chat scroll
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  // Load classes on view switch
  useEffect(() => {
    if (activeView === 'classes' && auth.token) loadTeacherClasses()
  }, [activeView])

  // Autosave
  useEffect(() => {
    return editor.setupAutosave(worksheetsMgr.selectedWorksheet)
  }, [editor.editMode, editor.hasUnsavedChanges, editor.editedQuestions])

  // ============================================================
  // DATA LOADERS
  // ============================================================

  const fetchDossiers = useCallback(async (authToken) => {
    try {
      const response = await fetch('/api/dossiers', { headers: { 'Authorization': `Bearer ${authToken || auth.token}` } })
      if (response.ok) setDossiers(await response.json())
    } catch (error) { console.error('Fehler beim Laden der Dossiers:', error) }
  }, [auth.token])

  const loadAssignments = useCallback(async (authToken) => {
    try {
      const response = await fetch('/api/assignments', { headers: { 'Authorization': `Bearer ${authToken || auth.token}` } })
      if (response.ok) setAssignments(await response.json())
    } catch (error) { console.error('Error loading assignments:', error) }
  }, [auth.token])

  const loadSubmissions = useCallback(async (assignmentId) => {
    setSelectedAssignment(assignmentId)
    try {
      const response = await fetch(`/api/assignment/${assignmentId}`, { headers: { 'Authorization': `Bearer ${auth.token}` } })
      if (response.ok) {
        const data = await response.json()
        setAssignmentSubmissions(data.submissions || [])
      }
    } catch (error) { console.error('Error loading submissions:', error) }
  }, [auth.token])

  const loadTeacherClasses = useCallback(async (authToken) => {
    setClassLoading(true)
    try {
      const response = await fetch('/api/classes', { headers: { 'Authorization': `Bearer ${authToken || auth.token}` } })
      if (response.ok) setTeacherClasses(await response.json())
    } catch (error) { console.error('Error loading classes:', error) }
    finally { setClassLoading(false) }
  }, [auth.token])

  // ============================================================
  // GENERATION WRAPPERS
  // ============================================================

  const handleGenerate = useCallback(async (e) => {
    e.preventDefault()
    setError('')
    await generation.handleGenerate(form, {
      questionTypes: selectedQuestionTypes,
      sourceText: upload.getCombinedSourceText(),
      onComplete: (worksheet) => {
        worksheetsMgr.setSelectedWorksheet(worksheet)
        worksheetsMgr.setShowEditorPanel(true)
        editor.setShowPostCreationBar(true)
        worksheetsMgr.fetchWorksheets(auth.token)
        auth.fetchCurrentUser(auth.token)
        setSuccessMessage('Ihr Material wurde erfolgreich erstellt.')
      },
      onError: (msg) => setError(msg)
    })
  }, [form, selectedQuestionTypes, upload, generation, worksheetsMgr, editor, auth])

  const handleGenerateDossier = useCallback(async (e) => {
    e.preventDefault()
    setError('')
    await generation.handleGenerateDossier({
      topic: form.topic, grade: form.grade, subject: form.subject,
      difficulty: form.difficulty, theme: form.theme,
      competency_codes: form.competencyCode ? [form.competencyCode] : [],
      sourceText: upload.getCombinedSourceText()
    }, {
      onComplete: (dossier) => {
        setSelectedDossier(dossier)
        setActiveView('dossier-editor')
        fetchDossiers(auth.token)
        auth.fetchCurrentUser(auth.token)
        setSuccessMessage('Ihr Arbeitsdossier wurde erfolgreich erstellt.')
      },
      onError: (msg) => setError(msg)
    })
  }, [form, upload, generation, auth, fetchDossiers])

  // ============================================================
  // AFTER AUTH SUCCESS
  // ============================================================

  const onAuthSuccess = useCallback((authToken) => {
    worksheetsMgr.fetchWorksheets(authToken)
    fetchDossiers(authToken)
    loadAssignments(authToken)
    loadTeacherClasses(authToken)
  }, [worksheetsMgr.fetchWorksheets, fetchDossiers, loadAssignments, loadTeacherClasses])

  // Bundle everything into context value
  const value = {
    // Auth
    ...auth, onAuthSuccess,
    // Worksheets
    worksheets: worksheetsMgr.worksheets, setWorksheets: worksheetsMgr.setWorksheets,
    selectedWorksheet: worksheetsMgr.selectedWorksheet, setSelectedWorksheet: worksheetsMgr.setSelectedWorksheet,
    showEditorPanel: worksheetsMgr.showEditorPanel, setShowEditorPanel: worksheetsMgr.setShowEditorPanel,
    fetchWorksheets: worksheetsMgr.fetchWorksheets,
    handleDeleteWorksheet: worksheetsMgr.handleDelete,
    handleDuplicate: worksheetsMgr.handleDuplicate,
    // Upload
    ...upload,
    // Generation
    generating: generation.generating,
    generationProgress: generation.generationProgress,
    streamingQuestions: generation.streamingQuestions,
    showGenerationTheater: generation.showGenerationTheater,
    setShowGenerationTheater: generation.setShowGenerationTheater,
    handleGenerate, handleGenerateDossier,
    handleRegenerate: generation.handleRegenerate,
    // Editor
    ...editor,
    // Settings
    settings, setSettings, handleSaveSettings,
    // App state
    activeView, setActiveView,
    error, setError,
    successMessage, setSuccessMessage,
    mobileNavOpen, setMobileNavOpen,
    commandOpen, setCommandOpen,
    // Form
    form, setForm,
    selectedQuestionTypes, setSelectedQuestionTypes,
    // Dossiers
    dossiers, setDossiers, selectedDossier, setSelectedDossier, dossierSaving, setDossierSaving,
    fetchDossiers,
    // Library
    librarySearch, setLibrarySearch,
    libraryFilterSubject, setLibraryFilterSubject,
    libraryFilterGrade, setLibraryFilterGrade,
    // Templates
    templateSearch, setTemplateSearch,
    templateFilterSubject, setTemplateFilterSubject,
    templateCategory, setTemplateCategory,
    // Curriculum
    expandedCycle, setExpandedCycle,
    expandedArea, setExpandedArea,
    curriculumSearch, setCurriculumSearch,
    curriculumFilterSubject, setCurriculumFilterSubject,
    curriculumFilterCycle, setCurriculumFilterCycle,
    competencyTracker, setCompetencyTracker,
    showSequenceFor, setShowSequenceFor,
    // Export
    exportHistory, setExportHistory,
    // Chat
    chatOpen, setChatOpen, chatMessages, setChatMessages,
    chatInput, setChatInput, chatLoading, setChatLoading, chatEndRef,
    // Planner
    showPlanner, setShowPlanner, plannerEvents, setPlannerEvents,
    plannerMonth, setPlannerMonth, plannerYear, setPlannerYear,
    plannerView, setPlannerView, plannerWeekStart, setPlannerWeekStart,
    quickAddForm, setQuickAddForm,
    // Assignments
    assignments, setAssignments,
    selectedAssignment, setSelectedAssignment,
    assignmentSubmissions, setAssignmentSubmissions,
    errorAnalysis, setErrorAnalysis,
    analysisLoading, setAnalysisLoading,
    expandedSubmission, setExpandedSubmission,
    errorAnalysisOpen, setErrorAnalysisOpen,
    shareModalOpen, setShareModalOpen, shareForm, setShareForm,
    editingQuestion, setEditingQuestion,
    classOverview, setClassOverview, classOverviewOpen, setClassOverviewOpen,
    deleteConfirm, setDeleteConfirm,
    loadAssignments, loadSubmissions,
    // Classes
    teacherClasses, setTeacherClasses,
    selectedClass, setSelectedClass,
    classDetailData, setClassDetailData,
    newClassName, setNewClassName,
    classLoading, setClassLoading,
    classStats, setClassStats,
    classInsights, setClassInsights,
    insightsLoading, setInsightsLoading,
    loadTeacherClasses,
    // Collaboration
    comments, setComments, versions, setVersions,
    shareEmail, setShareEmail, shareRole, setShareRole,
    sharedWithMe, setSharedWithMe,
    // Gamification
    studentProgress, setStudentProgress,
    // Image
    imageGenerating, setImageGenerating,
    imagePrompt, setImagePrompt, imageStyle, setImageStyle,
  }

  return <EduFlowContext.Provider value={value}>{children}</EduFlowContext.Provider>
}

export function useEduFlow() {
  const ctx = useContext(EduFlowContext)
  if (!ctx) throw new Error('useEduFlow must be used within EduFlowProvider')
  return ctx
}
