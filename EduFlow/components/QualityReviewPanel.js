'use client'
import { Check, CheckCircle2, CircleAlert, Edit3, ShieldCheck } from 'lucide-react'
import { Button } from '@/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Progress } from '@/ui/progress'
import { materialQualityChecklist } from '@/lib/product-workspace'
import { useEduFlow } from '@/contexts/EduFlowContext'

export default function QualityReviewPanel({ worksheet, onEdit }) {
  const { updateWorksheetMetadata, setSuccessMessage, setError } = useEduFlow()
  const review = materialQualityChecklist(worksheet)
  const reviewed = worksheet.status === 'ready' || Boolean(worksheet.reviewed_at)

  const markReviewed = async () => {
    const updated = await updateWorksheetMetadata(worksheet.id, { status: 'ready', reviewed_at: new Date().toISOString() })
    if (updated) setSuccessMessage('Material wurde als geprüft markiert.')
    else setError('Prüfstatus konnte nicht gespeichert werden.')
  }

  return (
    <Card className="mb-5 border-blue-100 bg-blue-50/40">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5 text-blue-600" /> Qualitätsprüfung</CardTitle>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${reviewed ? 'bg-emerald-100 text-emerald-700' : review.ready ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-800'}`}>{reviewed ? 'Von Ihnen geprüft' : `${review.passed}/${review.total} Checks`}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3"><Progress value={review.score} className="h-2 flex-1" /><span className="text-sm font-bold text-gray-700">{review.score}%</span></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {review.checks.map(check => <div key={check.id} className="flex items-start gap-2 text-xs text-gray-700">{check.passed ? <Check className="mt-0.5 h-3.5 w-3.5 text-emerald-600" /> : <CircleAlert className="mt-0.5 h-3.5 w-3.5 text-amber-600" />}<span>{check.label}</span></div>)}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {!review.ready ? <Button size="sm" variant="outline" onClick={onEdit}><Edit3 className="mr-1.5 h-3.5 w-3.5" /> Auffälligkeiten bearbeiten</Button> : null}
          <Button size="sm" onClick={markReviewed} disabled={reviewed || !review.ready}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> {reviewed ? 'Geprüft' : 'Als geprüft markieren'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
