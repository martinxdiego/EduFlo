import { z } from 'zod'

const password = z.string().min(8).max(128)

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password,
  name: z.string().trim().min(1).max(100),
}).strict()

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password,
}).strict()

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
}).strict()

export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(512),
  password,
}).strict()

export const deleteAccountSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().max(128).optional().default(''),
}).strict()

export const teacherTypeSchema = z.object({
  teacher_type: z.enum(['primar', 'sekundar', 'sonstiges']),
}).strict()

export const googleAuthSchema = z.object({
  code: z.string().min(1).max(4096),
  codeVerifier: z.string().min(43).max(128),
}).strict()
