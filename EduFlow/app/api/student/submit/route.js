import { studentAssignmentOptions, submitStudentAssignment } from '@/lib/server/student-assignments'

export const runtime = 'nodejs'
export const POST = submitStudentAssignment
export const OPTIONS = studentAssignmentOptions
