import { z } from 'zod'

const resourceId = z.string().trim().min(1).max(100)

export const shareWorksheetSchema = z.object({
  worksheetId: resourceId,
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(['view', 'comment', 'edit']).default('view'),
}).strict()

export const commentSchema = z.object({
  worksheetId: resourceId,
  text: z.string().trim().min(1).max(2_000),
  questionIndex: z.number().int().min(0).max(1_000).nullish(),
}).strict()

export const versionSchema = z.object({
  worksheetId: resourceId,
  label: z.string().trim().min(1).max(100).optional(),
}).strict()

export const restoreVersionSchema = z.object({
  worksheetId: resourceId,
  versionId: resourceId,
}).strict()

export const worksheetIdSchema = resourceId
