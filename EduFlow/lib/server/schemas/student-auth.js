import { z } from 'zod'

const username = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/)
const password = z.string().min(8).max(128)

export const studentRegisterSchema = z.object({
  username,
  password,
  displayName: z.string().trim().min(1).max(100),
}).strict()

export const studentLoginSchema = z.object({
  username,
  password,
}).strict()
