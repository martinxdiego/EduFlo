import { z } from 'zod'

export const classIdSchema = z.string().trim().min(1).max(100)
export const studentIdSchema = z.string().trim().min(1).max(100)

export const classSchema = z.object({
  name: z.string().trim().min(1).max(100),
  students: z.array(z.string().trim().min(1).max(100)).max(200).optional(),
}).strict()

export const niveauSchema = z.object({
  niveau: z.enum(['A', 'B', 'C']),
}).strict()
