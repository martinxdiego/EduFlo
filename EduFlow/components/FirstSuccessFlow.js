'use client'
import { useState } from 'react'
import { ArrowRight, BookOpen, FileText, Sparkles, UploadCloud } from 'lucide-react'
import { Button } from '@/ui/button'
import { Card, CardContent } from '@/ui/card'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { useEduFlow } from '@/contexts/EduFlowContext'

const OUTPUTS = [
  { id: 'worksheet', label: 'Arbeitsblatt', icon: FileText },
  { id: 'dossier', label: 'Arbeitsdossier', icon: BookOpen },
  { id: 'studio', label: 'Folien & Lernmedien', icon: Sparkles },
]

export default function FirstSuccessFlow() {
  const { form, setForm, setActiveView } = useEduFlow()
  const [step, setStep] = useState(1)
  const [source, setSource] = useState('topic')
  const [output, setOutput] = useState('worksheet')

  const continueFlow = () => {
    if (step < 3) return setStep(current => current + 1)
    if (source === 'upload') return setActiveView('upload')
    if (output === 'studio') {
      sessionStorage.setItem('eduflow_studio_source', `Erstelle Unterrichtsmedien zum Thema: ${form.topic}`)
      return setActiveView('studio')
    }
    setForm(previous => ({ ...previous, resourceType: output }))
    setActiveView('create')
  }

  return (
    <Card className="mb-8 overflow-hidden border-blue-200 bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xl">
      <CardContent className="p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="lg:w-5/12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">Ihr erster Erfolg · Schritt {step} von 3</p>
            <h2 className="mt-3 text-2xl font-bold">In wenigen Minuten zum einsetzbaren Material.</h2>
            <p className="mt-2 text-sm leading-6 text-blue-100">EduFlow führt Sie von der Quelle bis zum geprüften Export. Alle Angaben bleiben danach editierbar.</p>
            <div className="mt-5 flex gap-2" aria-hidden="true">
              {[1, 2, 3].map(item => <span key={item} className={`h-1.5 flex-1 rounded-full ${item <= step ? 'bg-white' : 'bg-white/25'}`} />)}
            </div>
          </div>
          <div className="rounded-2xl bg-white p-5 text-gray-900 shadow-lg lg:w-7/12">
            {step === 1 ? (
              <div>
                <Label className="text-sm font-semibold">Wie möchten Sie beginnen?</Label>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {[{ id: 'topic', label: 'Mit einem Thema', icon: FileText }, { id: 'upload', label: 'Mit eigenem Material', icon: UploadCloud }].map(option => (
                    <button key={option.id} type="button" onClick={() => setSource(option.id)} className={`rounded-xl border-2 p-4 text-left transition ${source === option.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-200'}`}>
                      <option.icon className="mb-2 h-5 w-5 text-blue-600" /><span className="text-sm font-semibold">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : step === 2 ? (
              <div>
                <Label className="text-sm font-semibold">Was soll entstehen?</Label>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {OUTPUTS.map(option => (
                    <button key={option.id} type="button" onClick={() => setOutput(option.id)} className={`rounded-xl border-2 p-3 text-left transition ${output === option.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-200'}`}>
                      <option.icon className="mb-2 h-5 w-5 text-blue-600" /><span className="block text-xs font-semibold">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div><Label htmlFor="quick-topic">Thema oder Lernziel</Label><Input id="quick-topic" className="mt-1.5" value={form.topic} onChange={event => setForm(previous => ({ ...previous, topic: event.target.value }))} placeholder="z.B. Wasserkreislauf verstehen" disabled={source === 'upload'} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Klasse</Label><Select value={String(form.grade)} onValueChange={grade => setForm(previous => ({ ...previous, grade }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 9 }, (_, index) => String(index + 1)).map(grade => <SelectItem key={grade} value={grade}>{grade}. Klasse</SelectItem>)}</SelectContent></Select></div>
                  <div><Label htmlFor="quick-subject">Fach</Label><Input id="quick-subject" className="mt-1.5" value={form.subject} onChange={event => setForm(previous => ({ ...previous, subject: event.target.value }))} /></div>
                </div>
              </div>
            )}
            <div className="mt-5 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep(current => Math.max(1, current - 1))} disabled={step === 1}>Zurück</Button>
              <Button size="sm" onClick={continueFlow} disabled={step === 3 && source === 'topic' && form.topic.trim().length < 3}>{step === 3 ? 'Workspace öffnen' : 'Weiter'}<ArrowRight className="ml-2 h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
