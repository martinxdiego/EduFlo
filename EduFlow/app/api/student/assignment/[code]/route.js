import { withHostingPolicy } from '@/lib/server/hosting-route-policy'
import { getStudentAssignment, studentAssignmentOptions } from '@/lib/server/student-assignments'

export const runtime = 'nodejs'
export const GET = withHostingPolicy(getStudentAssignment)
export const OPTIONS = studentAssignmentOptions
