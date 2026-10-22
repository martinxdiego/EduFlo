import { withHostingPolicy } from '@/lib/server/hosting-route-policy'
import { studentAssignmentOptions, submitStudentAssignment } from '@/lib/server/student-assignments'

export const runtime = 'nodejs'
export const POST = withHostingPolicy(submitStudentAssignment)
export const OPTIONS = studentAssignmentOptions
