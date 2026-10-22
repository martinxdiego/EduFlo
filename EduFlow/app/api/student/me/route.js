import { withHostingPolicy } from '@/lib/server/hosting-route-policy'
import { currentStudent, studentAuthOptions } from '@/lib/server/student-auth'

export const runtime = 'nodejs'
export const GET = withHostingPolicy(currentStudent)
export const OPTIONS = studentAuthOptions
