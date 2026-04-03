'use client'
import { useState, useCallback } from 'react'

export function useAuth() {
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' })
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [selectedTeacherType, setSelectedTeacherType] = useState(null)
  const [savingTeacherType, setSavingTeacherType] = useState(false)

  const fetchCurrentUser = useCallback(async (authToken) => {
    try {
      const response = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${authToken}` } })
      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
        if (!userData.teacher_type) {
          setShowOnboarding(true)
        }
        return userData
      } else {
        localStorage.removeItem('teachertime_token')
        setToken(null)
        return null
      }
    } catch (error) {
      console.error('Fehler beim Laden des Nutzers:', error)
      return null
    }
  }, [])

  const handleAuth = useCallback(async (e, onSuccess) => {
    e.preventDefault()
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register'
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authForm)
    })
    const data = await response.json()
    if (response.ok) {
      setToken(data.token)
      setUser(data.user)
      localStorage.setItem('teachertime_token', data.token)
      if (!data.user.teacher_type) {
        setShowOnboarding(true)
      } else if (onSuccess) {
        onSuccess(data.token)
      }
      return { success: true, token: data.token, user: data.user }
    }
    const errorMsg = data.error === 'Invalid credentials' ? 'E-Mail oder Passwort ist falsch.'
      : data.error === 'User already exists' ? 'Diese E-Mail-Adresse ist bereits registriert.'
      : data.error || 'Ein Fehler ist aufgetreten.'
    return { success: false, error: errorMsg }
  }, [authMode, authForm])

  const handleLogout = useCallback(() => {
    localStorage.removeItem('teachertime_token')
    setToken(null)
    setUser(null)
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
        if (onSuccess) onSuccess()
      }
    } catch (err) {
      console.error('Fehler beim Speichern:', err)
    } finally {
      setSavingTeacherType(false)
    }
  }, [selectedTeacherType, token])

  const initFromStorage = useCallback(() => {
    const savedToken = localStorage.getItem('teachertime_token')
    if (savedToken) {
      setToken(savedToken)
      return savedToken
    }
    return null
  }, [])

  return {
    token, setToken, user, setUser,
    authMode, setAuthMode, authForm, setAuthForm,
    showOnboarding, setShowOnboarding,
    selectedTeacherType, setSelectedTeacherType,
    savingTeacherType,
    fetchCurrentUser, handleAuth, handleLogout, handleSaveTeacherType,
    initFromStorage,
  }
}
