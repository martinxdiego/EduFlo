'use client'

import { useEffect, useState } from 'react'
import { Activity, CircleDollarSign, Gauge, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'

export default function AIQualityCard({ token }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/ai/metrics?days=30', { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Metriken konnten nicht geladen werden.')
      setData(await response.json())
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (token) load() }, [token])

  return (
    <Card className="glass-card border-0">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-lg flex items-center gap-2"><Activity className="h-5 w-5 text-blue-500" /> KI-Qualitaet & Nutzung</CardTitle>
          <CardDescription>Generierungen, Fehler und geschaetzte Modellkosten der letzten 30 Tage.</CardDescription>
        </div>
        <Button type="button" size="icon" variant="ghost" onClick={load} disabled={loading} aria-label="KI-Metriken aktualisieren">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        {error ? <p className="text-sm text-red-600">{error}</p> : !data ? <div className="h-20 animate-pulse rounded-xl bg-gray-100" /> : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-blue-50 p-3"><Gauge className="h-4 w-4 text-blue-600 mb-2" /><p className="text-xl font-bold">{data.totals.requests}</p><p className="text-xs text-gray-500">Aufrufe</p></div>
              <div className="rounded-xl bg-emerald-50 p-3"><Activity className="h-4 w-4 text-emerald-600 mb-2" /><p className="text-xl font-bold">{data.totals.requests ? Math.round(data.totals.completed / data.totals.requests * 100) : 100}%</p><p className="text-xs text-gray-500">Erfolgreich</p></div>
              <div className="rounded-xl bg-amber-50 p-3"><CircleDollarSign className="h-4 w-4 text-amber-600 mb-2" /><p className="text-xl font-bold">${data.totals.costUsd.toFixed(2)}</p><p className="text-xs text-gray-500">Geschaetzt</p></div>
            </div>
            {data.features.length > 0 && <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
              {data.features.slice(0, 8).map(row => <div key={row.feature} className="flex items-center justify-between px-3 py-2 text-sm"><span className="font-medium text-gray-700">{row.feature}</span><span className="text-gray-500">{row.completed}/{row.requests} · ${row.costUsd.toFixed(3)}</span></div>)}
            </div>}
            <p className="text-xs text-gray-400">Kostensaetze sind konfigurierbare Schaetzwerte; die Anbieterabrechnung bleibt massgebend.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
