'use client'

import { LoadingScreen } from './EduFlowMotion'

export default function AuthTransition({ message }) {
  return <LoadingScreen message={message} />
}
