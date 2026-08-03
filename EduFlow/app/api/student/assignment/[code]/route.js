import { getStudentAssignment, studentAssignmentOptions } from '@/lib/server/student-assignments'

export const runtime = 'nodejs'
export const GET = getStudentAssignment
export const OPTIONS = studentAssignmentOptions
