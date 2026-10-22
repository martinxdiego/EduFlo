import { z } from 'zod'

const questionType = z.enum(['multiple_choice', 'true_false', 'open', 'math', 'image', 'matching', 'fill_blank', 'ordering', 'either_or', 'table', 'image_block'])

export const worksheetGenerationSchema = z.object({
  topic: z.string().trim().min(3).max(1_000),
  grade: z.coerce.number().int().min(1).max(9).transform(String),
  subject: z.string().trim().min(1).max(100),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  questionCount: z.coerce.number().int().min(3).max(25).optional().default(10),
  questionTypes: z.array(questionType).max(11).refine(values => new Set(values).size === values.length).optional(),
  resourceType: z.enum(['worksheet', 'exam', 'quiz', 'vocabulary']).optional().default('worksheet'),
  sourceText: z.string().max(128_000).nullish(),
  competencyCode: z.string().trim().max(80).nullish(),
  aiProvider: z.enum(['openai', 'gemini']).optional(),
  provider: z.enum(['openai', 'gemini']).optional(),
  theme: z.string().max(60).optional(),
  dyslexiaFont: z.boolean().optional(),
}).refine(value => !value.aiProvider || !value.provider || value.aiProvider === value.provider, { message: 'Widersprüchliche KI-Anbieter.' })

export const regenerateWorksheetSchema = z.object({
  worksheetId: z.string().trim().min(1).max(100),
  newDifficulty: z.enum(['easy', 'medium', 'hard']),
}).strict()
