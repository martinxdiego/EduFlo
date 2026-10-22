import { z } from 'zod'
import { domainSeparatedJcsSha256, utf8LexicographicCompare } from './human-review-canonical.js'
import {
  TUTOR_PROVIDER_TECHNICAL_FAILURE_CATEGORIES,
  TUTOR_SAFETY_REJECTION_CATEGORIES,
} from '../governance/quality-policy.js'

export const TUTOR_HUMAN_REVIEW_SAMPLING_VERSION = 'tutor-human-review-sampling-v1'
export const TUTOR_HUMAN_REVIEW_SAMPLE_RANK_DOMAIN = 'EDUFLOW\0H14B\0HUMAN_REVIEW_SAMPLE_RANK\0v1\0'
export const TUTOR_HUMAN_REVIEW_SAMPLE_MANIFEST_DOMAIN = 'EDUFLOW\0H14B\0HUMAN_REVIEW_SAMPLE_MANIFEST\0v1\0'
export const TUTOR_HUMAN_REVIEW_SELECTION_RULE = 'ALL_LOCAL_FALLBACK_PLUS_TWO_PER_NONEMPTY_PROVIDER_SUBJECT_HINT_STRATUM'

const identifierSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/)
const shaSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/)
const rankingShaSchema = z.string().regex(/^[0-9a-f]{64}$/)
const sourceSchema = z.enum(['LOCAL_FALLBACK_ACCEPTED', 'PROVIDER_ACCEPTED'])
const causeClassSchema = z.enum(['SAFETY_CANDIDATE_REJECTION', 'PROVIDER_TECHNICAL_FAILURE'])
const causeCodeSchema = z.enum([
  ...TUTOR_SAFETY_REJECTION_CATEGORIES,
  ...TUTOR_PROVIDER_TECHNICAL_FAILURE_CATEGORIES,
])

const sampleCandidateFields = {
  case_id: identifierSchema,
  final_source: sourceSchema,
  subject_category: z.string().min(1).max(80).nullable(),
  hint_level: z.number().int().min(1).max(3),
  bounded_cause_class: causeClassSchema.nullable(),
  bounded_cause_code: causeCodeSchema.nullable(),
}

const validateSampleCandidate = (value, context) => {
  if (value.subject_category !== null && value.subject_category !== value.subject_category.normalize('NFC')) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Subject category must already be NFC' })
  }
  if (value.final_source === 'PROVIDER_ACCEPTED' && (value.bounded_cause_class !== null || value.bounded_cause_code !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Provider-accepted cases cannot carry a fallback cause' })
  }
  if (value.final_source === 'LOCAL_FALLBACK_ACCEPTED' && (!value.bounded_cause_class || !value.bounded_cause_code)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Local-fallback cases require a bounded cause' })
  }
  if (value.bounded_cause_class === 'SAFETY_CANDIDATE_REJECTION'
    && !TUTOR_SAFETY_REJECTION_CATEGORIES.includes(value.bounded_cause_code)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Cause code does not belong to the safety taxonomy' })
  }
  if (value.bounded_cause_class === 'PROVIDER_TECHNICAL_FAILURE'
    && !TUTOR_PROVIDER_TECHNICAL_FAILURE_CATEGORIES.includes(value.bounded_cause_code)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Cause code does not belong to the provider taxonomy' })
  }
}

const sampleCandidateSchema = z.object(sampleCandidateFields).strict().superRefine(validateSampleCandidate)

export const tutorHumanReviewSamplingInputSchema = z.object({
  source_run_id: identifierSchema,
  source_result_sha256: shaSchema,
  fixture_set_version: identifierSchema,
  fixture_set_sha256: shaSchema,
  cases: z.array(sampleCandidateSchema).length(120),
}).strict()

const selectedCaseSchema = z.object({
  ...sampleCandidateFields,
  selection_ordinal: z.number().int().min(1).max(120),
  ranking_sha256: rankingShaSchema,
}).strict().superRefine(validateSampleCandidate)

export const tutorHumanReviewSampleManifestSchema = z.object({
  sampling_contract_version: z.literal(TUTOR_HUMAN_REVIEW_SAMPLING_VERSION),
  source_run_id: identifierSchema,
  source_result_sha256: shaSchema,
  fixture_set_version: identifierSchema,
  fixture_set_sha256: shaSchema,
  selection_rule: z.literal(TUTOR_HUMAN_REVIEW_SELECTION_RULE),
  selected_case_count: z.number().int().min(1).max(120),
  selected_cases: z.array(selectedCaseSchema).min(1).max(120),
  sample_manifest_sha256: shaSchema,
}).strict()

function rankObject(input, candidate) {
  return {
    sampling_contract_version: TUTOR_HUMAN_REVIEW_SAMPLING_VERSION,
    source_run_id: input.source_run_id,
    source_result_sha256: input.source_result_sha256,
    final_source: candidate.final_source,
    subject_category: candidate.subject_category,
    hint_level: candidate.hint_level,
    case_id: candidate.case_id,
  }
}

export function tutorHumanReviewRankingSha256(input, candidate) {
  const parsedInput = tutorHumanReviewSamplingInputSchema.parse(input)
  const parsedCandidate = sampleCandidateSchema.parse(candidate)
  return rankingSha256(rankObject(parsedInput, parsedCandidate))
}

function rankingSha256(value) {
  return domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_SAMPLE_RANK_DOMAIN, value).slice('sha256:'.length)
}

function compareSubject(left, right) {
  if (left === right) return 0
  if (left === null) return -1
  if (right === null) return 1
  return utf8LexicographicCompare(left, right)
}

function compareRanked(left, right) {
  const hashOrder = utf8LexicographicCompare(left.ranking_sha256, right.ranking_sha256)
  return hashOrder || utf8LexicographicCompare(left.case_id, right.case_id)
}

export function compareTutorHumanReviewRankedCases(left, right) {
  return compareRanked(left, right)
}

function compareSelected(left, right) {
  const sourceOrder = left.final_source === right.final_source ? 0 : left.final_source === 'LOCAL_FALLBACK_ACCEPTED' ? -1 : 1
  return sourceOrder
    || compareSubject(left.subject_category, right.subject_category)
    || left.hint_level - right.hint_level
    || compareRanked(left, right)
}

function withoutManifestDigest(value) {
  const { sample_manifest_sha256: _ignored, ...unsigned } = value
  return unsigned
}

export function verifyTutorHumanReviewSampleManifest(value) {
  const parsed = tutorHumanReviewSampleManifestSchema.parse(value)
  if (parsed.selected_case_count !== parsed.selected_cases.length) throw new TypeError('Selected case count mismatch')
  if (new Set(parsed.selected_cases.map((candidate) => candidate.case_id)).size !== parsed.selected_cases.length) throw new TypeError('Sample manifest has duplicate case references')
  for (const [index, candidate] of parsed.selected_cases.entries()) {
    if (candidate.selection_ordinal !== index + 1) throw new TypeError('Sample manifest ordinals must be contiguous from one')
    const expectedRanking = rankingSha256(rankObject(parsed, candidate))
    if (candidate.ranking_sha256 !== expectedRanking) throw new TypeError('Sample manifest ranking digest mismatch')
    if (index > 0 && compareSelected(parsed.selected_cases[index - 1], candidate) > 0) throw new TypeError('Sample manifest cases are not in canonical order')
  }
  const digest = domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_SAMPLE_MANIFEST_DOMAIN, withoutManifestDigest(parsed))
  if (digest !== parsed.sample_manifest_sha256) throw new TypeError('Sample manifest digest mismatch')
  return parsed
}

export function verifyTutorHumanReviewSampleManifestAgainstInput(manifest, input) {
  const verified = verifyTutorHumanReviewSampleManifest(manifest)
  const rebuilt = buildTutorHumanReviewSampleManifest(input)
  if (rebuilt.sample_manifest_sha256 !== verified.sample_manifest_sha256) throw new TypeError('Sample manifest does not match the exact source population')
  return verified
}

export function buildTutorHumanReviewSampleManifest(value) {
  const input = tutorHumanReviewSamplingInputSchema.parse(value)
  const ids = new Set()
  for (const candidate of input.cases) {
    if (ids.has(candidate.case_id)) throw new TypeError('Duplicate synthetic case reference')
    ids.add(candidate.case_id)
  }

  const ranked = input.cases.map((candidate) => ({
    ...candidate,
    ranking_sha256: rankingSha256(rankObject(input, candidate)),
  }))
  const selected = ranked.filter((candidate) => candidate.final_source === 'LOCAL_FALLBACK_ACCEPTED')
  const providerStrata = new Map()
  for (const candidate of ranked.filter((item) => item.final_source === 'PROVIDER_ACCEPTED')) {
    const key = `${candidate.subject_category === null ? '-1:' : `${Buffer.byteLength(candidate.subject_category, 'utf8')}:`}${candidate.subject_category || ''}\0${candidate.hint_level}`
    const stratum = providerStrata.get(key) || []
    stratum.push(candidate)
    providerStrata.set(key, stratum)
  }
  for (const stratum of providerStrata.values()) selected.push(...stratum.sort(compareRanked).slice(0, 2))
  selected.sort(compareSelected)

  const selectedCases = selected.map((candidate, index) => ({ selection_ordinal: index + 1, ...candidate }))
  const unsigned = {
    sampling_contract_version: TUTOR_HUMAN_REVIEW_SAMPLING_VERSION,
    source_run_id: input.source_run_id,
    source_result_sha256: input.source_result_sha256,
    fixture_set_version: input.fixture_set_version,
    fixture_set_sha256: input.fixture_set_sha256,
    selection_rule: TUTOR_HUMAN_REVIEW_SELECTION_RULE,
    selected_case_count: selectedCases.length,
    selected_cases: selectedCases,
  }
  return deepFreeze(verifyTutorHumanReviewSampleManifest({
    ...unsigned,
    sample_manifest_sha256: domainSeparatedJcsSha256(TUTOR_HUMAN_REVIEW_SAMPLE_MANIFEST_DOMAIN, unsigned),
  }))
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}
