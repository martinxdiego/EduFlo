'use client'
import { useState, useCallback, useEffect, useRef } from 'react'

const SESSION_MARKER = 'cookie-session'

export function useAuth() {
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' })
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [selectedTeacherType, setSelectedTeacherType] = useState(null)
  const [savingTeacherType, setSavingTeacherType] = useState(false)
  const [isSessionChecking, setIsSessionChecking] = useState(true)
  const [authTransition, setAuthTransition] = useState(null)
  const transitionTimerRef = useRef(null)

  const startAuthTransition = useCallback((message = 'Ihr Arbeitsbereich wird vorbereitet …') => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
    setAuthTransition(message)
    transitionTimerRef.current = setTimeout(() => setAuthTransition(null), 850)
  }, [])

  useEffect(() => () => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
  }, [])

  const fetchCurrentUser = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store' })
      if (response.ok) {
        const userData = await response.json()
        setToken(SESSION_MARKER)
        setUser(userData)
        if (!userData.teacher_type) {
          setShowOnboarding(true)
        }
        return userData
      } else {
        setToken(null)
        setUser(null)
        return null
      }
    } catch (error) {
      console.error('Fehler beim Laden des Nutzers:', error)
      setToken(null)
      setUser(null)
      return null
    } finally {
      setIsSessionChecking(false)
    }
  }, [])

  const handleAuth = useCallback(async (e, onSuccess) => {
    e.preventDefault()
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register'
    const requestBody = authMode === 'login'
      ? { email: authForm.email, password: authForm.password }
      : authForm
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    const data = await response.json()
    if (response.ok) {
      setToken(SESSION_MARKER)
      setUser(data.user)
      startAuthTransition(authMode === 'login' ? 'Willkommen zurück – Dashboard wird geladen …' : 'Willkommen bei EduFlow – wir richten alles ein …')
      localStorage.removeItem('teachertime_token')
      if (!data.user.teacher_type) {
        setShowOnboarding(true)
      } else if (onSuccess) {
        onSuccess(SESSION_MARKER)
      }
      return { success: true, token: SESSION_MARKER, user: data.user }
    }
    const errorMsg = data.error === 'Invalid credentials' ? 'E-Mail oder Passwort ist falsch.'
      : data.error === 'User already exists' ? 'Diese E-Mail-Adresse ist bereits registriert.'
      : data.error || 'Ein Fehler ist aufgetreten.'
    return { success: false, error: errorMsg }
  }, [authMode, authForm, startAuthTransition])

  const handleGoogleLogin = useCallback(async () => {
    const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const redirectUri = `${window.location.origin}/api/auth/google/callback`
    if (!GOOGLE_CLIENT_ID) return { success: false, error: 'Google-Anmeldung ist nicht konfiguriert.' }

    const randomBase64Url = (byteLength) => {
      const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
      return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    }
    const codeVerifier = randomBase64Url(64)
    const state = randomBase64Url(32)
    const challengeBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(challengeBytes)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

    sessionStorage.setItem('eduflow_google_oauth_state', state)
    sessionStorage.setItem('eduflow_google_code_verifier', codeVerifier)

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'email profile',
      access_type: 'offline',
      prompt: 'select_account',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })

    // Redirect to Google (no popup — avoids COOP issues)
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  }, [])

  const handleGoogleCallback = useCallback(async (code, returnedState) => {
    try {
      const expectedState = sessionStorage.getItem('eduflow_google_oauth_state')
      const codeVerifier = sessionStorage.getItem('eduflow_google_code_verifier')
      sessionStorage.removeItem('eduflow_google_oauth_state')
      sessionStorage.removeItem('eduflow_google_code_verifier')

      if (!expectedState || !returnedState || returnedState !== expectedState || !codeVerifier) {
        return { success: false, error: 'Google-Anmeldung konnte nicht sicher bestätigt werden.' }
      }

      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, codeVerifier }),
      })
      const data = await response.json()

      if (response.ok) {
        setToken(SESSION_MARKER)
        setUser(data.user)
        setIsSessionChecking(false)
        startAuthTransition('Google-Anmeldung bestätigt – Dashboard wird geladen …')
        localStorage.removeItem('teachertime_token')
        if (!data.user.teacher_type) {
          setShowOnboarding(true)
        }
        return { success: true, token: SESSION_MARKER, user: data.user }
      } else {
        return { success: false, error: data.error || 'Google-Anmeldung fehlgeschlagen.' }
      }
    } catch (err) {
      return { success: false, error: 'Verbindungsfehler bei Google-Anmeldung.' }
    }
  }, [startAuthTransition])

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      console.error('Abmeldung konnte serverseitig nicht bestätigt werden:', error)
    }
    localStorage.removeItem('teachertime_token')
    setToken(null)
    setUser(null)
    setAuthTransition(null)
  }, [])

  const handleSaveTeacherType = useCallback(async (onSuccess) => {
    if (!selectedTeacherType) return
    setSavingTeacherType(true)
    try {
      const res = await fetch('/api/auth/teacher-type', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ teacher_type: selectedTeacherType })
      })
      if (res.ok) {
        setUser(prev => ({ ...prev, teacher_type: selectedTeacherType }))
        setShowOnboarding(false)
        startAuthTransition('Ihr persönlicher Arbeitsbereich ist bereit …')
        if (onSuccess) onSuccess()
      }
    } catch (err) {
      console.error('Fehler beim Speichern:', err)
    } finally {
      setSavingTeacherType(false)
    }
  }, [selectedTeacherType, token, startAuthTransition])

  const initFromStorage = useCallback(() => {
    // JWTs from older versions must not remain readable by JavaScript.
    localStorage.removeItem('teachertime_token')
    setIsSessionChecking(true)
    return SESSION_MARKER
  }, [])

  return {
    token, setToken, user, setUser,
    authMode, setAuthMode, authForm, setAuthForm,
    showOnboarding, setShowOnboarding,
    selectedTeacherType, setSelectedTeacherType,
    savingTeacherType,
    isSessionChecking, authTransition,
    fetchCurrentUser, handleAuth, handleGoogleLogin, handleGoogleCallback, handleLogout, handleSaveTeacherType,
    initFromStorage,
  }
}
