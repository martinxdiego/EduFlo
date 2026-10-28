import { notFound } from 'next/navigation'
import DemoWorkspace from '@/components/demo/DemoWorkspace'

export const metadata = { title: 'EduFlow ausprobieren – kostenlose Demo', robots: { index: false, follow: false } }

export default function DemoPage() {
  if (process.env.NEXT_PUBLIC_EDUFLOW_DEMO !== 'true') notFound()
  return <DemoWorkspace />
}
