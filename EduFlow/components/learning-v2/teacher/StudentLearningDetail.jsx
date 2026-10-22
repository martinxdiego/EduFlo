'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/dialog'
import CompetencySelector from './CompetencySelector'
import EvidenceInvalidationDialog from './EvidenceInvalidationDialog'
import EvidenceTimeline from './EvidenceTimeline'
import KnowledgeStateSummary from './KnowledgeStateSummary'
import TeacherAssessmentForm from './TeacherAssessmentForm'
import TechnicalProvenanceDisclosure from './TechnicalProvenanceDisclosure'
import TutorSessionDetail from './TutorSessionDetail'
import RecommendationPanel from './RecommendationPanel'
import { useRequestScope } from '../request-scope'

async function api(url, token, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...options.headers } })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error?.message || 'Lerndaten konnten nicht geladen werden.')
  return body
}

export default function StudentLearningDetail(props) {
  return props.open && props.student?.student_id ? <LearningDetail key={`${props.student.student_id}:${props.token}`} {...props} /> : null
}

function LearningDetail({ open, onOpenChange, student, token, returnFocusRef }) {
  const dialogRef = useRef(null)
  const detailLauncherRef = useRef(null)
  const invalidationLauncherRef = useRef(null)
  const [list, setList] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [loadedState, setLoadedState] = useState(null)
  const [loadedEvidence, setLoadedEvidence] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [filter, setFilter] = useState('all')
  const [loadedDetail, setLoadedDetail] = useState(null)
  const [invalidating, setInvalidating] = useState(null)
  const [correction, setCorrection] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recommendationRevision, setRecommendationRevision] = useState(0)
  const studentId = student?.student_id
  const listRequests = useRequestScope(`${studentId}:${token}`)
  const requests = useRequestScope(`${studentId}:${selectedId}:${filter}:${token}`)
  const state = loadedState?.scope === requests && loadedState.data.learner?.student_id === studentId
    && loadedState.data.competency?.competency_id === selectedId ? loadedState.data : null
  const ready = Boolean(state) && !loading
  const evidence = loadedEvidence?.scope === requests ? loadedEvidence.data : []
  const detail = loadedDetail?.scope === requests ? loadedDetail.data : null
  const setDetail = (data) => setLoadedDetail(data ? { scope: requests, data } : null)
  const restoreNestedFocus = (event, launcherRef) => {
    event.preventDefault()
    const dialog = dialogRef.current
    const launcher = launcherRef.current
    if (launcher?.isConnected && dialog?.contains(launcher)) launcher.focus()
    else dialog?.querySelector('#learning-v2-competency')?.focus()
  }

  const loadList = useCallback(async () => {
    if (!studentId) return
    const request = listRequests.begin('list')
    try {
    const result = await api(`/api/v2/learning/teacher/students/${encodeURIComponent(studentId)}/competencies`, token, { signal: request.signal })
    if (!request.current() || result.learner?.student_id !== studentId) return
    setList(result.competencies || [])
    setSelectedId((current) => current && result.competencies.some((item) => item.competency.competency_id === current) ? current : result.competencies[0]?.competency.competency_id || '')
    } catch (error) { if (request.current()) setError(error.message) }
  }, [studentId, token, listRequests])

  const loadState = useCallback(async () => {
    if (!studentId || !selectedId) return
    setLoading(true); setError('')
    const request = requests.begin('state')
    try { const data = await api(`/api/v2/learning/teacher/students/${encodeURIComponent(studentId)}/competencies/${encodeURIComponent(selectedId)}`, token, { signal: request.signal }); if (request.current()) setLoadedState({ scope: requests, data }) }
    catch (requestError) { if (request.current()) setError(requestError.message) }
    finally { if (request.current()) setLoading(false) }
  }, [studentId, selectedId, token, requests])

  const loadEvidence = useCallback(async ({ append = false, nextCursor = null } = {}) => {
    if (!studentId || !selectedId) return
    const search = new URLSearchParams({ filter, limit: '20' }); if (nextCursor) search.set('cursor', nextCursor)
    const request = requests.begin('evidence')
    try {
    const result = await api(`/api/v2/learning/teacher/students/${encodeURIComponent(studentId)}/competencies/${encodeURIComponent(selectedId)}/evidence?${search}`, token, { signal: request.signal })
    if (!request.current()) return
    setLoadedEvidence((current) => ({ scope: requests, data: append && current?.scope === requests ? [...current.data, ...result.evidence] : result.evidence }))
    setCursor(result.next_cursor)
    } catch (error) { if (request.current()) setError(error.message) }
  }, [studentId, selectedId, filter, token, requests])

  useEffect(() => { if (open) { setError(''); loadList() } }, [open, loadList])
  useEffect(() => { setLoadedEvidence(null); setCursor(null); setLoadedDetail(null); setInvalidating(null); setCorrection(null)
    if (open && selectedId) { loadState(); loadEvidence() }
  }, [open, selectedId, filter, loadState, loadEvidence])

  const refresh = async () => { const request = requests.begin('refresh'); setInvalidating(null); setCorrection(null); setDetail(null); await Promise.all([loadList(), loadState(), loadEvidence()]); if (request.current()) setRecommendationRevision((value) => value + 1) }
  const inspect = async (item) => {
    if (!ready) return
    detailLauncherRef.current = document.activeElement
    const request = requests.begin('detail')
    try { const result = await api(`/api/v2/learning/teacher/students/${encodeURIComponent(studentId)}/competencies/${encodeURIComponent(selectedId)}/evidence?evidence_id=${encodeURIComponent(item.evidence_id)}`, token, { signal: request.signal }); if (request.current() && result.evidence?.evidence_id === item.evidence_id) setDetail(result.evidence) }
    catch (requestError) { if (request.current()) setError(requestError.message) }
  }

  return <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={dialogRef} onCloseAutoFocus={(event) => { event.preventDefault(); returnFocusRef?.current?.focus() }} className="left-0 top-0 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none p-4 sm:left-[50%] sm:top-[50%] sm:h-[92dvh] sm:max-w-5xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-xl sm:p-6">
        <DialogHeader className="pr-8"><DialogTitle>Lernstand · {student?.display_name || 'Schüler/in'}</DialogTitle><DialogDescription>Teacher-only development view. Qualitative labels are shown by default.</DialogDescription></DialogHeader>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {list.length === 0 && !error ? <p className="rounded-lg bg-slate-50 p-4 text-sm">Noch kein Learning V2 Kompetenzstand vorhanden.</p> : <div className="space-y-5">
          <CompetencySelector competencies={list} value={selectedId} onChange={(value) => { setSelectedId(value); setCorrection(null); setDetail(null) }} />
          {loading ? <p role="status">Lernstand wird geladen…</p> : <KnowledgeStateSummary state={state} />}
          {open && !loading && state?.recommendations_enabled && state.competency?.competency_id === selectedId && <RecommendationPanel key={`${studentId}:${selectedId}:${recommendationRevision}`} studentId={studentId} competencyId={selectedId} token={token} />}
          {ready && <TeacherAssessmentForm key={`${studentId}:${selectedId}:${state.objective?.objective_id}:${state.objective?.version}:${correction?.evidence_id || ''}`} studentId={studentId} competency={state} token={token} correction={correction} onCancelCorrection={() => setCorrection(null)} onSaved={refresh} />}
          {!ready && <button type="button" disabled className="rounded-md border px-4 py-2 opacity-50">Beurteilung speichern · passende Lerndaten werden geladen</button>}
          <EvidenceTimeline evidence={ready ? evidence : []} filter={filter} onFilter={setFilter} onLoadMore={() => loadEvidence({ append: true, nextCursor: cursor })} hasMore={ready && Boolean(cursor)} onInspect={inspect} onInvalidate={(item) => { if (ready) { invalidationLauncherRef.current = document.activeElement; setInvalidating(item) } }} onCorrect={(item) => ready && setCorrection(item)} />
          {state?.tutor_sessions?.length > 0 && <section aria-labelledby="tutor-sessions-title"><h3 id="tutor-sessions-title" className="mb-3 font-semibold">Tutor sessions</h3><div className="space-y-3">{state.tutor_sessions.map((session) => <TutorSessionDetail key={session.session_id} session={session} studentId={studentId} token={token} />)}</div></section>}
        </div>}
      </DialogContent>
    </Dialog>
    <Dialog open={ready && Boolean(detail)} onOpenChange={(next) => !next && setDetail(null)}><DialogContent onCloseAutoFocus={(event) => restoreNestedFocus(event, detailLauncherRef)} className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Evidence detail</DialogTitle><DialogDescription>Authorized teacher detail. Sensitive notes are shown only here.</DialogDescription></DialogHeader>{ready && detail && <div className="space-y-2 text-sm"><p><strong>Type:</strong> {detail.type}</p><p><strong>Claim:</strong> {detail.claim}</p><p><strong>Status:</strong> {detail.status}</p>{detail.note && <div className="rounded bg-amber-50 p-3"><strong>Internal note:</strong> {detail.note}</div>}{detail.invalidation_note && <div className="rounded bg-amber-50 p-3"><strong>Invalidation note:</strong> {detail.invalidation_note}</div>}<TechnicalProvenanceDisclosure technical={detail.technical} /></div>}</DialogContent></Dialog>
    <EvidenceInvalidationDialog key={`${studentId}:${selectedId}:${invalidating?.evidence_id || ""}`} evidence={ready ? invalidating : null} token={token} onClose={() => setInvalidating(null)} onChanged={refresh} onCloseAutoFocus={(event) => restoreNestedFocus(event, invalidationLauncherRef)} />
  </>
}
