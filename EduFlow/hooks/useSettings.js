'use client'
import { useState, useCallback, useEffect } from 'react'

export function useSettings() {
  const [settings, setSettings] = useState({
    defaultGrade: '3',
    defaultSubject: 'Deutsch',
    defaultDifficulty: 'medium',
    defaultQuestionCount: 10,
    includeTeacherNotes: true,
    includeAnswerKey: true,
    dyslexiaFont: false,
    emailNotifications: true,
    language: 'de-CH',
  })

  useEffect(() => {
    const saved = localStorage.getItem('eduflow_settings')
    if (saved) {
      try { setSettings(prev => ({ ...prev, ...JSON.parse(saved) })) } catch(e) {}
    }
  }, [])

  const handleSaveSettings = useCallback(() => {
    localStorage.setItem('eduflow_settings', JSON.stringify(settings))
    return true
  }, [settings])

  const applyTeacherTypeDefaults = useCallback((teacherType) => {
    const savedSettings = localStorage.getItem('eduflow_settings')
    if (savedSettings) return // don't override manual settings
    const defaultGrade = teacherType === 'sekundar' ? '8' : '3'
    setSettings(prev => ({ ...prev, defaultGrade, defaultSubject: 'Deutsch' }))
    return { defaultGrade, defaultSubject: 'Deutsch' }
  }, [])

  return {
    settings, setSettings,
    handleSaveSettings,
    applyTeacherTypeDefaults,
  }
}
