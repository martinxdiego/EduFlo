import { z } from 'zod'
import {
  TUTOR_MODEL,
  TUTOR_PROMPT_VERSION,
  TUTOR_PROVIDER_SCHEMA_VERSION,
} from '../../contracts/phase3.js'
import { TUTOR_PROMPT_REGISTRY, TUTOR_PROMPT_V2_DIGEST, TUTOR_PROMPT_V3_DIGEST } from '../prompt-registry.js'
import {
  TUTOR_HUMAN_REVIEW_WORKFLOW_REF,
  TUTOR_HUMAN_REVIEWER_ROLE,
} from './human-review-workflow.js'

export const TUTOR_RUNTIME_APPROVAL_CONTRACT_VERSION_V3 = 'tutor-runtime-approval-v3'
export const TUTOR_RUNTIME_APPROVAL_REF_V3 = 'approval:openai-tutor-guidance-v2:pending'
export const TUTOR_RUNTIME_APPROVAL_CONTRACT_VERSION = 'tutor-runtime-approval-v4'
export const TUTOR_RUNTIME_APPROVAL_REF = 'approval:openai-tutor-guidance-v3:pending'
export const TUTOR_RUNTIME_GATE_ENV = 'LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED'

export const tutorRuntimeApprovalContractSchema = z.object({
  approval_contract_version: z.literal(TUTOR_RUNTIME_APPROVAL_CONTRACT_VERSION),
  approval_ref: z.string().trim().min(1).max(160),
  provider_id: z.string().trim().min(1).max(60),
  model_id: z.string().trim().min(1).max(120),
  prompt_version: z.string().trim().min(1).max(120),
  prompt_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  structured_output_schema_version: z.string().trim().min(1).max(120),
  evaluator_version: z.string().trim().min(1).max(120),
  approved_for_runtime: z.boolean(),
  human_review: z.object({
    required: z.literal(true),
    workflow_ref: z.literal(TUTOR_HUMAN_REVIEW_WORKFLOW_REF),
    required_reviewer_role: z.literal(TUTOR_HUMAN_REVIEWER_ROLE),
    status: z.enum(['NOT_REVIEWED', 'APPROVED', 'REJECTED']),
    reviewer_ref: z.string().trim().min(1).max(160).nullable(),
    review_ref: z.string().trim().min(1).max(160).nullable(),
    approved_at: z.string().datetime().nullable(),
  }).strict(),
}).strict()

const historicalV3 = {
  approval_contract_version: TUTOR_RUNTIME_APPROVAL_CONTRACT_VERSION_V3,
  approval_ref: TUTOR_RUNTIME_APPROVAL_REF_V3,
  provider_id: 'openai',
  model_id: TUTOR_MODEL,
  prompt_version: 'tutor-guidance-v2',
  prompt_digest: TUTOR_PROMPT_V2_DIGEST,
  structured_output_schema_version: TUTOR_PROVIDER_SCHEMA_VERSION,
  evaluator_version: 'tutor-paid-evaluator-v3',
  approved_for_runtime: false,
  human_review: {
    required: true,
    workflow_ref: TUTOR_HUMAN_REVIEW_WORKFLOW_REF,
    required_reviewer_role: TUTOR_HUMAN_REVIEWER_ROLE,
    status: 'NOT_REVIEWED',
    reviewer_ref: null,
    review_ref: null,
    approved_at: null,
  },
}
Object.freeze(historicalV3.human_review)
export const TUTOR_RUNTIME_APPROVAL_CONTRACT_V3 = Object.freeze(historicalV3)

// This prospective v3-prompt tuple is a versioned static contract, not an
// approval. A paid evaluation or automated test cannot mutate or promote it.
const parsedContract = tutorRuntimeApprovalContractSchema.parse({
  approval_contract_version: TUTOR_RUNTIME_APPROVAL_CONTRACT_VERSION,
  approval_ref: TUTOR_RUNTIME_APPROVAL_REF,
  provider_id: 'openai',
  model_id: TUTOR_MODEL,
  prompt_version: TUTOR_PROMPT_VERSION,
  prompt_digest: TUTOR_PROMPT_V3_DIGEST,
  structured_output_schema_version: TUTOR_PROVIDER_SCHEMA_VERSION,
  evaluator_version: 'tutor-paid-evaluator-v4',
  approved_for_runtime: false,
  human_review: {
    required: true,
    workflow_ref: TUTOR_HUMAN_REVIEW_WORKFLOW_REF,
    required_reviewer_role: TUTOR_HUMAN_REVIEWER_ROLE,
    status: 'NOT_REVIEWED',
    reviewer_ref: null,
    review_ref: null,
    approved_at: null,
  },
})
Object.freeze(parsedContract.human_review)
export const TUTOR_RUNTIME_APPROVAL_CONTRACT = Object.freeze(parsedContract)

function denied(reasonCode) {
  return Object.freeze({ allowed: false, reasonCode })
}

export class TutorRuntimeApprovalGate {
  constructor(options = {}) {
    this.environment = options.environment || process.env
    this.nodeEnvironment = options.nodeEnvironment || this.environment.NODE_ENV || 'development'
    const contract = tutorRuntimeApprovalContractSchema.parse(options.contract || TUTOR_RUNTIME_APPROVAL_CONTRACT)
    Object.freeze(contract.human_review)
    this.contract = Object.freeze(contract)
  }

  configuration() {
    return Object.freeze({
      provider: this.contract.provider_id,
      model: this.contract.model_id,
      prompt_version: this.contract.prompt_version,
      structured_output_schema_version: this.contract.structured_output_schema_version,
      approval_ref: this.contract.approval_ref,
    })
  }

  evaluate(configuration) {
    if (!['development', 'test'].includes(this.nodeEnvironment)) return denied('PROVIDER_ENVIRONMENT_NOT_ALLOWED')
    if (this.environment[TUTOR_RUNTIME_GATE_ENV] !== '1') return denied('PROVIDER_RUNTIME_GATE_OFF')
    const prompt = TUTOR_PROMPT_REGISTRY[this.contract.prompt_version]
    if (!prompt || prompt.digest !== this.contract.prompt_digest) return denied('PROVIDER_PROMPT_NOT_APPROVED')
    if (configuration.provider !== this.contract.provider_id) return denied('PROVIDER_NOT_APPROVED')
    if (configuration.model !== this.contract.model_id) return denied('PROVIDER_MODEL_NOT_APPROVED')
    if (configuration.prompt_version !== this.contract.prompt_version) return denied('PROVIDER_PROMPT_NOT_APPROVED')
    if (configuration.structured_output_schema_version !== this.contract.structured_output_schema_version) {
      return denied('PROVIDER_SCHEMA_NOT_APPROVED')
    }
    if (configuration.approval_ref !== this.contract.approval_ref) return denied('PROVIDER_APPROVAL_REF_MISMATCH')
    if (!this.contract.approved_for_runtime) return denied('PROVIDER_APPROVAL_NOT_APPROVED')
    const review = this.contract.human_review
    if (review.status !== 'APPROVED' || !review.reviewer_ref || !review.review_ref || !review.approved_at) {
      return denied('PROVIDER_HUMAN_REVIEW_REQUIRED')
    }
    return Object.freeze({ allowed: true, approvalRef: this.contract.approval_ref })
  }
}

export function createTutorRuntimeApprovalGate(options = {}) {
  return new TutorRuntimeApprovalGate(options)
}
