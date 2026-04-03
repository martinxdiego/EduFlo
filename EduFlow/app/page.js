'use client'

import { EduFlowProvider } from '@/contexts/EduFlowContext'
import AppContent from '@/components/AppContent'

export default function Home() {
  return (
    <EduFlowProvider>
      <AppContent />
    </EduFlowProvider>
  )
}
