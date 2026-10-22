import { createPublicKey, verify } from 'node:crypto'
import { z } from 'zod'
import { canonical, CORE_FEATURES, hostingDigest, stagingBindingSchema } from './hosting-binding-shared.js'

export const ACTIVATION_BINDING_CONTRACT = 'hosting-capabilities-v2'
export const ACTIVATION_GRANT_CONTRACT = 'hosting-activation-grant-v1'
// One explicitly reviewed overnight test window; no automatic renewal.
export const MAX_ACTIVATION_MS = 12 * 60 * 60 * 1000
const MAX_BODY_BYTES = 16_384
const text = z.string().min(1).max(200).regex(/\S/)
export const deploymentIdSchema = z.string().regex(/^dpl_[A-Za-z0-9]{8,100}$/)

// The reviewed candidate is fixed before deployment. Only a separately signed
// grant may bind the subsequently observed real deployment ID to this candidate.
export const stagingActivationBindingSchema = stagingBindingSchema
  .omit({ contract_version: true, deployment_id: true, features: true })
  .extend({
    contract_version: z.literal(ACTIVATION_BINDING_CONTRACT),
    features: z.array(z.enum(CORE_FEATURES)).max(CORE_FEATURES.length)
      .refine((items) => new Set(items).size === items.length),
    activation: z.object({
      store_id: z.string().regex(/^ecfg_[A-Za-z0-9]{8,100}$/),
      item_key: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
      key_id: text,
      public_key: z.string().regex(/^[A-Za-z0-9+/]{59}=$/),
    }).strict(),
  }).strict()

export const activationGrantPayloadSchema = z.object({
  contract_version: z.literal(ACTIVATION_GRANT_CONTRACT),
  candidate_digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  deployment_id: deploymentIdSchema, project_id: text,
  revision: z.string().regex(/^[a-f0-9]{40}$/), staging_epoch: text,
  key_id: text, review_ref: text,
  issued_at: z.number().int().nonnegative().safe(), expires_at: z.number().int().positive().safe(),
}).strict()
const envelopeSchema = z.object({
  payload: activationGrantPayloadSchema,
  signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
}).strict()

export const stagingCandidateDigest = (binding) => hostingDigest(stagingActivationBindingSchema.parse(binding))
export const activationCurrent = (grant, now = Date.now()) => Number.isSafeInteger(now)
  && now >= grant.issued_at && now < grant.expires_at

export function verifyStagingActivationGrant(value, candidate, deploymentId, now = Date.now()) {
  const binding = stagingActivationBindingSchema.parse(candidate)
  const { payload, signature } = envelopeSchema.parse(value)
  if (payload.candidate_digest !== stagingCandidateDigest(binding)
    || payload.deployment_id !== deploymentId || payload.project_id !== binding.project_id
    || payload.revision !== binding.revision || payload.staging_epoch !== binding.staging_epoch
    || payload.key_id !== binding.activation.key_id || !activationCurrent(payload, now)
    || payload.expires_at <= payload.issued_at || payload.expires_at - payload.issued_at > MAX_ACTIVATION_MS) {
    throw new Error('STAGING_ACTIVATION_DENIED')
  }
  const bytes = Buffer.from(binding.activation.public_key, 'base64')
  const key = createPublicKey({ key: bytes, format: 'der', type: 'spki' })
  const signed = Buffer.from(signature, 'base64url')
  if (key.asymmetricKeyType !== 'ed25519' || signed.length !== 64 || signed.toString('base64url') !== signature
    || !verify(null, Buffer.from(canonical(payload)), key, signed)) throw new Error('STAGING_ACTIVATION_DENIED')
  return Object.freeze(payload)
}

export function validActivationReadToken(value) {
  return typeof value === 'string' && /^[\x21-\x7e]{16,512}$/.test(value)
}

// No caller-supplied URL, loader, clock, response cache or write credential.
// Global Config replicates writes; removal can take up to 10 seconds to propagate.
// The signed twelve-hour ceiling still applies to an older replicated response.
export async function readStagingActivation(candidate, environment) {
  const binding = stagingActivationBindingSchema.parse(candidate)
  const token = environment.EDUFLOW_STAGING_APPROVAL_READ_TOKEN
  if (!validActivationReadToken(token)) throw new Error('STAGING_ACTIVATION_DENIED')
  const { store_id: store, item_key: item } = binding.activation
  const response = await fetch(`https://global-config.vercel.com/${store}/item/${item}`, {
    method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(3000),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Cache-Control': 'no-cache' },
  })
  if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')
    || Number(response.headers.get('content-length') || 0) > MAX_BODY_BYTES || !response.body) {
    await response.body?.cancel().catch(() => {})
    throw new Error('STAGING_ACTIVATION_DENIED')
  }
  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      if (length > MAX_BODY_BYTES) throw new Error('STAGING_ACTIVATION_DENIED')
      chunks.push(Buffer.from(part.value))
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
  return verifyStagingActivationGrant(value, binding, environment.VERCEL_DEPLOYMENT_ID)
}
