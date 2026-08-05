import { z } from 'zod'
import { ACTIVITY_MODE_IDS, FEEDBACK_MODE_IDS } from '../../learning-workflow.js'

export const assignmentIdSchema = z.string().trim().min(1).max(100)
const deadline = z.string().trim().max(40).refine((value) => Number.isFinite(Date.parse(value)), 'Invalid deadline.')

export const shareAssignmentSchema = z.object({
  worksheetId: z.string().trim().min(1).max(100),
  className: z.string().trim().max(100).optional().default(''),
  classId: z.string().trim().min(1).max(100).nullish(),
  deadline: deadline.nullish(),
  status: z.enum(['active', 'closed', 'draft']).optional().default('active'),
  studentNames: z.array(z.string().trim().min(1).max(100)).max(200).optional().default([]),
  targetNiveau: z.enum(['A', 'B', 'C']).nullish(),
  activityType: z.enum(ACTIVITY_MODE_IDS).optional().default('exercise'),
  feedbackMode: z.enum(FEEDBACK_MODE_IDS).optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  timeLimitMinutes: z.number().int().min(0).max(180).optional(),
  showSolutions: z.boolean().optional(),
  graded: z.boolean().optional(),
  learningGoals: z.array(z.string().trim().min(1).max(240)).max(8).optional().default([]),
  instructions: z.string().trim().max(1_000).optional().default(''),
  unit: z.string().trim().max(100).optional().default(''),
}).strict()

export const updateAssignmentSchema = z.object({
  status: z.enum(['active', 'closed', 'draft']).optional(),
  deadline: deadline.nullable().optional(),
  feedbackReleased: z.boolean().optional(),
  unit: z.string().trim().max(100).optional(),
}).strict().refine((value) => value.status !== undefined || value.deadline !== undefined || value.feedbackReleased !== undefined || value.unit !== undefined, {
  message: 'At least one assignment field is required.',
})

export const gradeSubmissionSchema = z.object({
  questionIndex: z.number().int().min(0).max(1_000),
  pointsAwarded: z.number().finite().min(0).max(10_000).optional(),
  feedback: z.string().trim().max(2_000).optional(),
  teacherComment: z.string().trim().max(2_000).optional(),
}).strict().refine((value) => value.pointsAwarded !== undefined || value.feedback !== undefined || value.teacherComment !== undefined, {
  message: 'At least one grading field is required.',
})

export const studentSubmissionSchema = z.object({
  assignmentCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,20}$/),
  studentName: z.string().trim().min(1).max(100),
  answers: z.array(z.unknown()).max(200),
  duration: z.number().finite().int().min(0).max(7 * 24 * 60 * 60),
}).strict()
