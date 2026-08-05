'use client'
import { FileText, UploadCloud, Sparkles, ArrowRight } from 'lucide-react'
import { Button } from '@/ui/button'
import { useEduFlow } from '@/contexts/EduFlowContext'

const MODES = [
  { id: 'create', label: 'Thema', description: 'Mit Lernziel oder Thema starten', icon: FileText },
  { id: 'upload', label: 'Quellen', description: 'Dateien, Scans oder Audio verwenden', icon: UploadCloud },
  { id: 'studio', label: 'Studio', description: 'Folien, Karten, Quiz und Audio', icon: Sparkles },
]

export default function CreationWorkspaceHeader({ current }) {
  const { setActiveView } = useEduFlow()
  return (
    <section className="max-w-7xl mx-auto mb-6 rounded-2xl border border-blue-100 bg-white/90 p-3 shadow-sm" aria-label="Erstellungsworkspace">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="px-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Erstellen</p>
          <p className="text-sm text-gray-500">Eine Quelle, mehrere einsatzbereite Unterrichtsformate.</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MODES.map(mode => {
            const active = current === mode.id
            return (
              <Button
                key={mode.id}
                type="button"
                variant={active ? 'default' : 'ghost'}
                onClick={() => setActiveView(mode.id)}
                className={`h-auto justify-start gap-3 px-3 py-2 text-left ${active ? 'shadow-sm' : 'hover:bg-blue-50'}`}
                aria-pressed={active}
              >
                <mode.icon className="h-4 w-4 flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{mode.label}</span>
                  <span className={`block truncate text-[11px] ${active ? 'text-blue-100' : 'text-gray-400'}`}>{mode.description}</span>
                </span>
                {!active ? <ArrowRight className="ml-auto h-3.5 w-3.5 text-gray-300" /> : null}
              </Button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
