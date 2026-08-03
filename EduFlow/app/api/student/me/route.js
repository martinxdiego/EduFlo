import { currentStudent, studentAuthOptions } from '@/lib/server/student-auth'

export const runtime = 'nodejs'
export const GET = currentStudent
export const OPTIONS = studentAuthOptions
