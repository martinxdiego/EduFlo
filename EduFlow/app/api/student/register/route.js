import { registerStudent, studentAuthOptions } from '@/lib/server/student-auth'

export const runtime = 'nodejs'
export const POST = registerStudent
export const OPTIONS = studentAuthOptions
