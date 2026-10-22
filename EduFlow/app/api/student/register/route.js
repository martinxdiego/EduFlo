import { withHostingPolicy } from '@/lib/server/hosting-route-policy'
import { registerStudent, studentAuthOptions } from '@/lib/server/student-auth'

export const runtime = 'nodejs'
export const POST = withHostingPolicy(registerStudent)
export const OPTIONS = studentAuthOptions
