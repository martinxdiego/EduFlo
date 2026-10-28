import MotionStudio from '@/components/motion/MotionStudio'

export const metadata = {
  title: 'EduFlow Motion – drei Intros, ein eigener Flow',
  description: 'Interaktive Motion-Entwürfe für EduFlow: Paper, Orbit und Focus. Mit einer Vorschau der Anmeldung und reduzierter Bewegung.',
  robots: { index: false, follow: false },
}

export default function IntroPage() {
  return <MotionStudio demoMode={process.env.NEXT_PUBLIC_EDUFLOW_DEMO === 'true'} />
}
