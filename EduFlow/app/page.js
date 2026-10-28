import { EduFlowProvider } from '@/contexts/EduFlowContext'
import AppContent from '@/components/AppContent'
import DemoLanding from '@/components/demo/DemoLanding'

export default function Home() {
  if (process.env.NEXT_PUBLIC_EDUFLOW_DEMO === 'true') return <DemoLanding />
  return (
    <EduFlowProvider>
      <AppContent />
    </EduFlowProvider>
  )
}
