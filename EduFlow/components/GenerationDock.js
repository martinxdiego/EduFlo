'use client'
import { CheckCircle2, CircleAlert, Loader2, Maximize2, RotateCcw, X } from 'lucide-react'
import { Button } from '@/ui/button'
import { Progress } from '@/ui/progress'
import { useEduFlow } from '@/contexts/EduFlowContext'

const STATUS_COPY = {
  running: 'EduFlow arbeitet im Hintergrund',
  complete: 'Material ist bereit',
  failed: 'Generierung braucht Aufmerksamkeit',
  interrupted: 'Generierung wurde unterbrochen',
}
export default function GenerationDock() {
  const {
    generationJob, generating, dismissGenerationJob, setShowGenerationTheater,
    resumeGenerationJob, setActiveView,
  } = useEduFlow()
  if (!generationJob) return null

  const isRunning = generating || generationJob.status === 'running'
  const canResume = generationJob.kind === 'dossier' && generationJob.resumeDossierId && ['failed', 'interrupted'].includes(generationJob.status)
  return (
    <aside className="fixed bottom-20 right-3 z-[58] w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border border-blue-100 bg-white/95 p-4 shadow-2xl backdrop-blur-xl sm:bottom-5 sm:right-5" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl ${isRunning ? 'bg-blue-100 text-blue-600' : generationJob.status === 'complete' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-700'}`}>
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : generationJob.status === 'complete' ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{STATUS_COPY[generationJob.status] || STATUS_COPY.running}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{generationJob.message}</p>
        </div>
        {!isRunning ? <Button variant="ghost" size="icon" className="h-8 w-8" onClick={dismissGenerationJob} aria-label="Status schliessen"><X className="h-4 w-4" /></Button> : null}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Progress value={generationJob.progress || 0} className="h-2 flex-1" />
        <span className="w-9 text-right text-xs font-semibold text-gray-500">{Math.round(generationJob.progress || 0)}%</span>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        {isRunning ? (
          <Button size="sm" variant="outline" onClick={() => setShowGenerationTheater(true)}><Maximize2 className="mr-1.5 h-3.5 w-3.5" /> Details</Button>
        ) : canResume ? (
          <Button size="sm" onClick={resumeGenerationJob}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Fortsetzen</Button>
        ) : generationJob.status === 'failed' ? (
          <Button size="sm" onClick={() => setActiveView('create')}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Neu starten</Button>
        ) : null}
      </div>
    </aside>
  )
}
