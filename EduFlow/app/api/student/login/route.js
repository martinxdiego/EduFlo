import { withHostingPolicy } from '@/lib/server/hosting-route-policy'
import { loginStudent, studentAuthOptions } from '@/lib/server/student-auth'

export const runtime = 'nodejs'
export const POST = withHostingPolicy(loginStudent)
export const OPTIONS = studentAuthOptions
