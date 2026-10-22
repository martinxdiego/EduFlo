import { createHash } from 'node:crypto'
import { z } from 'zod'

export const HOSTING_CAPABILITY_CONTRACT = 'hosting-capabilities-v1'
export const CORE_FEATURES = Object.freeze(['auth', 'teacher_ui', 'student_ui', 'classes', 'assignments', 'manual_worksheets'])
export const SYNTHETIC_V2_FEATURES = Object.freeze(['definitions', 'ingestion', 'tutor', 'reflection', 'teacher', 'recommendations'])
const allowedFeatures = [...CORE_FEATURES, ...SYNTHETIC_V2_FEATURES.map((name) => `learning_v2.${name}`)]
const text = z.string().min(1).max(200)
export const stagingBindingSchema = z.object({
  contract_version: z.literal(HOSTING_CAPABILITY_CONTRACT),
  configuration_version: text, review_ref: text, application_environment: z.literal('staging'),
  repository: z.object({ provider: z.literal('github'), owner: text, slug: text }).strict(),
  project_id: text, branch: z.literal('codex/synthetic-staging'), revision: z.string().regex(/^[a-f0-9]{40}$/), deployment_id: text,
  database: z.object({ name: text, replica_set: text, hosts: z.array(text).min(1).max(20),
    principal: z.object({ user: text, db: text }).strict(), privileges_digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  }).strict(),
  staging_epoch: text, synthetic_data: z.literal(true), runtime_approval: z.literal(false), paid_authority: z.literal(false),
  features: z.array(z.enum(allowedFeatures)).max(allowedFeatures.length).refine((items) => new Set(items).size === items.length),
}).strict()

// Keep V1's set-like array canonicalization unchanged for existing DB privilege digests.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export const hostingDigest = (value) => `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`
