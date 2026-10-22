import { v7 as uuidv7, validate as validateUuid, version as uuidVersion } from 'uuid'
import { z } from 'zod'

export const DOMAIN_ID_PREFIXES = Object.freeze([
  'ten',
  'frm',
  'cmp',
  'obj',
  'tsk',
  'wqi',
  'att',
  'evd',
  'int',
  'evt',
  'req',
  'bat',
  'pol',
  'ses',
  'pcl',
  'rec',
])

const PREFIX_SET = new Set(DOMAIN_ID_PREFIXES)
const DOMAIN_ID_PATTERN = /^([a-z][a-z0-9]{2,11})_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/

export function generateDomainId(prefix) {
  if (!PREFIX_SET.has(prefix)) {
    throw new TypeError(`Unsupported Learning V2 domain ID prefix: ${prefix}`)
  }
  return `${prefix}_${uuidv7()}`
}

export function isDomainId(value, expectedPrefix) {
  if (typeof value !== 'string') return false
  const match = DOMAIN_ID_PATTERN.exec(value)
  if (!match) return false
  const [, prefix, uuid] = match
  if (!PREFIX_SET.has(prefix) || (expectedPrefix && prefix !== expectedPrefix)) return false
  return validateUuid(uuid) && uuidVersion(uuid) === 7
}

export function assertDomainId(value, expectedPrefix) {
  if (!isDomainId(value, expectedPrefix)) {
    throw new TypeError(`Invalid Learning V2${expectedPrefix ? ` ${expectedPrefix}` : ''} domain ID`)
  }
  return value
}

export function domainIdSchema(expectedPrefix) {
  return z.string().refine(
    (value) => isDomainId(value, expectedPrefix),
    { message: `Invalid Learning V2${expectedPrefix ? ` ${expectedPrefix}` : ''} domain ID` },
  )
}

export const tenantIdSchema = domainIdSchema('ten')
export const frameworkIdSchema = domainIdSchema('frm')
export const competencyIdSchema = domainIdSchema('cmp')
export const objectiveIdSchema = domainIdSchema('obj')
export const taskIdSchema = domainIdSchema('tsk')
export const worksheetQuestionIdSchema = domainIdSchema('wqi')
export const attemptIdSchema = domainIdSchema('att')
export const evidenceIdSchema = domainIdSchema('evd')
export const submissionIntentIdSchema = domainIdSchema('int')
export const tutorPolicyIdSchema = domainIdSchema('pol')
export const tutorSessionIdSchema = domainIdSchema('ses')
export const recommendationIdSchema = domainIdSchema('rec')
