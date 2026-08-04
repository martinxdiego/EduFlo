'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Badge } from '@/ui/badge'
import { Separator } from '@/ui/separator'
import { Switch } from '@/ui/switch'
import { Alert, AlertDescription } from '@/ui/alert'
import { User, Settings, Crown, Bell, Printer, CheckCircle2, ShieldAlert, Trash2 } from 'lucide-react'
import { useEduFlow } from '@/contexts/EduFlowContext'

export default function SettingsView({ GRADES, SUBJECTS, DIFFICULTY_LABELS }) {
  const ctx = useEduFlow()
  const { user, token, settings, setSettings, handleSaveSettings, setSuccessMessage, handleLogout } = ctx
  const [deleteEmail, setDeleteEmail] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  const handleSave = () => {
    handleSaveSettings()
    setSuccessMessage('Einstellungen gespeichert.')
  }

  const canDelete = deleteEmail.trim().toLowerCase() === user?.email?.toLowerCase()
    && (user?.has_password === false || Boolean(deletePassword))

  const handleDeleteAccount = async () => {
    setDeleteError('')
    setDeleteLoading(true)
    try {
      const response = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: deleteEmail, password: deletePassword }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Das Konto konnte nicht gelöscht werden.')
      await handleLogout()
      window.location.assign('/')
    } catch (error) {
      setDeleteError(error.message)
      setDeleteLoading(false)
    }
  }

  return (
    <motion.div key="settings" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gradient mb-2">Einstellungen</h2>
        <p className="text-gray-600">Passen Sie EduFlow an Ihre Bedürfnisse an.</p>
      </div>
      <div className="space-y-6">
        {/* Profile */}
        <Card className="glass-card border-0">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><User className="h-5 w-5 text-blue-500" /> Profil</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div><p className="font-medium text-gray-900">{user?.name}</p><p className="text-sm text-gray-500">{user?.email}</p></div>
              {user?.subscription_tier === 'premium' ? (
                <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500"><Crown className="h-3 w-3 mr-1" /> Premium</Badge>
              ) : (
                <div className="text-right"><Badge variant="secondary" className="mb-1">Free</Badge><p className="text-xs text-gray-500">{user?.worksheets_used_this_month || 0}/5 diesen Monat</p></div>
              )}
            </div>
            <div>
              <Label className="text-sm font-medium">Lehrertyp</Label>
              <Select value={user?.teacher_type || ''} onValueChange={async (v) => {
                try {
                  const res = await fetch('/api/auth/teacher-type', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ teacher_type: v }) })
                  if (res.ok) { ctx.setUser(prev => ({ ...prev, teacher_type: v })); setSuccessMessage('Lehrertyp wurde aktualisiert.') }
                } catch (err) { console.error(err) }
              }}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="primar">Primarlehrperson (1.–6. Klasse)</SelectItem>
                  <SelectItem value="sekundar">Sekundarlehrperson (7.–9. Klasse)</SelectItem>
                  <SelectItem value="sonstiges">Sonstiges (Heilpädagogik, DaZ etc.)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400 mt-1">Beeinflusst Voreinstellungen für Klassen, Fächer und Lehrplan-Ansicht.</p>
            </div>
          </CardContent>
        </Card>

        {/* Defaults */}
        <Card className="glass-card border-0">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Settings className="h-5 w-5 text-blue-500" /> Standard-Einstellungen</CardTitle><CardDescription>Diese Werte werden beim Erstellen neuer Materialien vorausgefüllt.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-sm">Standard-Klasse</Label><Select value={settings.defaultGrade} onValueChange={(v) => setSettings({...settings, defaultGrade: v})}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{GRADES.map(n => <SelectItem key={n} value={String(n)}>{n}. Klasse</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-sm">Standard-Fach</Label><Select value={settings.defaultSubject} onValueChange={(v) => setSettings({...settings, defaultSubject: v})}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-sm">Standard-Schwierigkeit</Label><Select value={settings.defaultDifficulty} onValueChange={(v) => setSettings({...settings, defaultDifficulty: v})}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DIFFICULTY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-sm">Standard-Fragenanzahl</Label><Input type="number" min={3} max={25} value={settings.defaultQuestionCount} onChange={(e) => setSettings({...settings, defaultQuestionCount: parseInt(e.target.value) || 10})} className="mt-1.5" /></div>
            </div>
          </CardContent>
        </Card>

        {/* Export */}
        <Card className="glass-card border-0">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Printer className="h-5 w-5 text-blue-500" /> Export-Einstellungen</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"><div><p className="text-sm font-medium">Lehrernotizen einschliessen</p><p className="text-xs text-gray-500">Tipps zur Bewertung und häufige Schüler-Fehler</p></div><Switch checked={settings.includeTeacherNotes} onCheckedChange={(v) => setSettings({...settings, includeTeacherNotes: v})} /></div>
            <Separator />
            <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"><div><p className="text-sm font-medium">Lösungsschlüssel einschliessen</p><p className="text-xs text-gray-500">Separate Seite mit allen Antworten</p></div><Switch checked={settings.includeAnswerKey} onCheckedChange={(v) => setSettings({...settings, includeAnswerKey: v})} /></div>
            <Separator />
            <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"><div><p className="text-sm font-medium">Legasthenie-freundliche Schrift</p><p className="text-xs text-gray-500">Verwendet OpenDyslexic für bessere Lesbarkeit</p></div><Switch checked={settings.dyslexiaFont} onCheckedChange={(v) => setSettings({...settings, dyslexiaFont: v})} /></div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="glass-card border-0">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Bell className="h-5 w-5 text-blue-500" /> Benachrichtigungen</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"><div><p className="text-sm font-medium">E-Mail-Benachrichtigungen</p><p className="text-xs text-gray-500">Tipps, neue Funktionen und wöchentliche Zusammenfassungen</p></div><Switch checked={settings.emailNotifications} onCheckedChange={(v) => setSettings({...settings, emailNotifications: v})} /></div>
          </CardContent>
        </Card>

        <Button className="w-full btn-premium" onClick={handleSave}><CheckCircle2 className="h-4 w-4 mr-2" /> Einstellungen speichern</Button>

        <Card className="border-red-200 bg-red-50/40 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-red-900">
              <ShieldAlert className="h-5 w-5 text-red-600" /> Konto dauerhaft löschen
            </CardTitle>
            <CardDescription className="leading-6 text-red-800/80">
              Ihr Profil, Ihre Materialien, Dossiers, Klassen, Aufträge und zugehörige Abgaben werden unwiderruflich gelöscht.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="delete-email">Zur Bestätigung Ihre E-Mail-Adresse eingeben</Label>
              <Input
                id="delete-email"
                type="email"
                autoComplete="email"
                placeholder={user?.email || 'name@schule.ch'}
                value={deleteEmail}
                onChange={(event) => setDeleteEmail(event.target.value)}
                className="mt-1.5 border-red-200 bg-white"
              />
            </div>
            {user?.has_password !== false && (
              <div>
                <Label htmlFor="delete-password">Aktuelles Passwort</Label>
                <Input
                  id="delete-password"
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  className="mt-1.5 border-red-200 bg-white"
                />
              </div>
            )}
            {deleteError && <Alert variant="destructive" role="alert"><AlertDescription>{deleteError}</AlertDescription></Alert>}
            <Button
              type="button"
              variant="destructive"
              disabled={!canDelete || deleteLoading}
              onClick={handleDeleteAccount}
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleteLoading ? 'Konto wird gelöscht …' : 'Mein Konto dauerhaft löschen'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  )
}
