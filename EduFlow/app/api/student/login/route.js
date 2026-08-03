import { loginStudent, studentAuthOptions } from '@/lib/server/student-auth'

export const runtime = 'nodejs'
export const POST = loginStudent
export const OPTIONS = studentAuthOptions
