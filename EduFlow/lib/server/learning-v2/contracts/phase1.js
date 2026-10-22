import { z } from 'zod'
import {
  competencyIdSchema,
  frameworkIdSchema,
  objectiveIdSchema,
  taskIdSchema,
  worksheetQuestionIdSchema,
} from './ids.js'
import { boundedTextSchema, internalActorIdSchema } from './schemas.js'

export const PHASE_1_SCHEMA_VERSION = 'learning-v2-phase1-v1'
export const DEFINITION_STATUSES = Object.freeze(['draft', 'published', 'retired'])

const shortCodeSchema = z.string().trim().min(1).max(160)
const localeSchema = z.string().trim().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).max(16)
const versionSchema = z.number().int().min(1).max(1_000_000)
const ratioSchema = z.number().min(0).max(1)

export const curriculumReferenceSchema = z.object({
  competency_id: competencyIdSchema,
  framework_id: frameworkIdSchema,
  framework_version: shortCodeSchema,
}).strict()

export const competencyTargetSchema = curriculumReferenceSchema.extend({
  role: z.enum(['primary', 'supporting']),
}).strict()

export const competencyTargetsSchema = z.array(competencyTargetSchema).min(1).max(16).superRefine((targets, context) => {
  const primaryCount = targets.filter((target) => target.role === 'primary').length
  if (primaryCount !== 1) {
    context.addIssue({ code: 'custom', path: [], message: 'Exactly one primary competency is required' })
  }
  const seen = new Set()
  targets.forEach((target, index) => {
    const key = `${target.framework_id}:${target.framework_version}:${target.competency_id}`
    if (seen.has(key)) context.addIssue({ code: 'custom', path: [index], message: 'Duplicate competency target' })
    seen.add(key)
  })
})

const audienceSchema = z.object({
  cycles: z.array(shortCodeSchema).max(8).default([]),
  grades: z.array(z.number().int().min(1).max(13)).max(13).default([]),
}).strict()

export const objectiveDefinitionSchema = z.object({
  source_type: z.enum(['curriculum', 'teacher_created', 'imported_legacy']),
  visibility: z.enum(['tenant', 'private']).default('tenant'),
  title: boundedTextSchema(240),
  learner_statement: boundedTextSchema(1_000),
  competency_targets: competencyTargetsSchema,
  audience: audienceSchema.default({ cycles: [], grades: [] }),
  difficulty: ratioSchema.optional(),
  estimated_effort_minutes: z.number().int().min(1).max(1_440).optional(),
  legacy_learning_goal: boundedTextSchema(1_000).optional(),
}).strict()

export const createObjectiveRequestSchema = objectiveDefinitionSchema.extend({
  schema_version: z.literal(PHASE_1_SCHEMA_VERSION),
}).strict()

export const createObjectiveVersionRequestSchema = createObjectiveRequestSchema.extend({
  expected_version: versionSchema,
}).strict()

export const publishDefinitionRequestSchema = z.object({
  schema_version: z.literal(PHASE_1_SCHEMA_VERSION),
  expected_version: versionSchema,
}).strict()

export const objectiveReferenceSchema = z.object({
  objective_id: objectiveIdSchema,
  version: versionSchema,
}).strict()

const taskSourceRequestSchema = z.object({
  kind: z.literal('worksheet_question'),
  worksheet_id: internalActorIdSchema,
  question_id: worksheetQuestionIdSchema.optional(),
  question_index: z.number().int().min(0).max(999).optional(),
}).strict().superRefine((source, context) => {
  if (!source.question_id && source.question_index === undefined) {
    context.addIssue({ code: 'custom', path: ['question_id'], message: 'Question ID or index is required' })
  }
})

export const TASK_TYPES = Object.freeze([
  'selected_response',
  'constructed_response',
  'numeric',
  'ordering',
  'matching',
  'explanation',
  'practice',
  'diagnostic',
  'transfer',
])

export const RESPONSE_MODALITIES = Object.freeze([
  'choice',
  'text',
  'number',
  'ordered_items',
  'matched_pairs',
])

export const taskDefinitionRequestSchema = z.object({
  schema_version: z.literal(PHASE_1_SCHEMA_VERSION),
  source: taskSourceRequestSchema,
  objective_ref: objectiveReferenceSchema,
  task_type: z.enum(TASK_TYPES),
  response_modality: z.enum(RESPONSE_MODALITIES),
  difficulty: ratioSchema.optional(),
  estimated_effort_minutes: z.number().int().min(1).max(1_440).optional(),
}).strict()

export const createTaskVersionRequestSchema = taskDefinitionRequestSchema.extend({
  expected_version: versionSchema,
}).strict()

export const definitionVersionQuerySchema = z.object({
  version: z.coerce.number().int().min(1).max(1_000_000).optional(),
}).strict()

export const objectiveIdParamSchema = objectiveIdSchema
export const taskIdParamSchema = taskIdSchema

export const curriculumFrameworkQuerySchema = z.object({
  framework_id: frameworkIdSchema.optional(),
  version: shortCodeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict()

export const curriculumNodeQuerySchema = curriculumFrameworkQuerySchema.extend({
  node_type: z.enum(['subject', 'cycle', 'domain', 'competency', 'competency_level', 'curriculum_objective']).optional(),
}).strict()

export const externalReferenceSchema = z.object({
  namespace: shortCodeSchema,
  code: shortCodeSchema,
  locale: localeSchema,
}).strict()
