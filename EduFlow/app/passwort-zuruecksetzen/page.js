'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, KeyRound } from 'lucide-react'
import { Alert, AlertDescription } from '@/ui/alert'
import { Button } from '@/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'

export default function PasswordResetPage() {
  const [token, setToken] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') || '')
  }, [])

  const requestReset = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsSubmitting(true)
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Die Anfrage konnte nicht gesendet werden.')
      setMessage(data.message)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitNewPassword = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (password !== confirmation) {
      setError('Die beiden Passwörter stimmen nicht überein.')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Das Passwort konnte nicht aktualisiert werden.')
      setMessage(data.message)
      setPassword('')
      setConfirmation('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetComplete = Boolean(token && message)

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-5 py-12 text-slate-950">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-blue-200/45 blur-3xl" />
        <div className="absolute -right-24 top-[-4rem] h-80 w-80 rounded-full bg-indigo-200/40 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-blue-700">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Zurück zur Anmeldung
        </Link>

        <Card className="border-slate-200/80 bg-white/95 shadow-2xl shadow-slate-900/10 backdrop-blur">
          <CardHeader className="space-y-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
              {resetComplete ? <CheckCircle2 className="h-5 w-5" /> : token ? <KeyRound className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
            </span>
            <div>
              <CardTitle className="text-2xl tracking-tight">
                {resetComplete ? 'Passwort aktualisiert' : token ? 'Neues Passwort festlegen' : 'Passwort vergessen?'}
              </CardTitle>
              <CardDescription className="mt-2 text-base leading-6">
                {resetComplete
                  ? 'Sie können sich jetzt mit Ihrem neuen Passwort anmelden.'
                  : token
                    ? 'Wählen Sie ein sicheres Passwort mit mindestens 8 Zeichen.'
                    : 'Wir senden Ihnen einen einmalig verwendbaren Link an Ihre E-Mail-Adresse.'}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            {resetComplete ? (
              <Button asChild className="h-12 w-full text-base font-semibold">
                <Link href="/">Zur Anmeldung <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            ) : (
              <form onSubmit={token ? submitNewPassword : requestReset} className="space-y-4">
                {token ? (
                  <>
                    <div>
                      <Label htmlFor="new-password">Neues Passwort</Label>
                      <Input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} className="input-premium mt-1.5 h-11" />
                    </div>
                    <div>
                      <Label htmlFor="confirm-password">Passwort wiederholen</Label>
                      <Input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="input-premium mt-1.5 h-11" />
                    </div>
                  </>
                ) : (
                  <div>
                    <Label htmlFor="reset-email">E-Mail-Adresse</Label>
                    <Input id="reset-email" type="email" inputMode="email" autoComplete="email" placeholder="name@schule.ch" required value={email} onChange={(event) => setEmail(event.target.value)} className="input-premium mt-1.5 h-11" />
                  </div>
                )}

                {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
                {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}

                <Button type="submit" disabled={isSubmitting} className="h-12 w-full text-base font-semibold">
                  {isSubmitting ? 'Bitte warten …' : token ? 'Passwort aktualisieren' : 'Reset-Link anfordern'}
                  {!isSubmitting && <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />}
                </Button>
              </form>
            )}

            <p className="mt-5 text-center text-xs leading-5 text-slate-500">
              Aus Sicherheitsgründen verraten wir nicht, ob eine E-Mail-Adresse registriert ist.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
