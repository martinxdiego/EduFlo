import { constants } from 'node:fs'
import * as nativeFs from 'node:fs/promises'
import path from 'node:path'
import { jcsUtf8Bytes } from './human-review-canonical.js'
import {
  assertTutorHumanReviewMaterialActive,
  tutorHumanReviewPacketDeleteAt,
} from '../governance/human-review-retention.js'
import { verifyTutorHumanReviewPacket } from './human-review-packet.js'
import { verifyTutorHumanReviewRecord } from '../governance/human-review-record-v1.js'
import {
  assertTrustedTutorHumanReviewClock,
  readTrustedTutorHumanReviewNow,
  tutorHumanReviewServerClock,
} from '../governance/human-review-clock.js'

export const TUTOR_HUMAN_REVIEW_REPOSITORY_ROOT = Object.freeze(['docs', 'evaluation-results', 'human-review'])
export const TUTOR_HUMAN_REVIEW_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/
export const TUTOR_HUMAN_REVIEW_PACKET_TERMINAL_SCOPE = 'EXACT_BOUND_REVIEW_REF'

const fixedArtifacts = new Set(['sample-manifest.json', 'review-packet.json'])
const reviewArtifactKinds = new Set(['claim', 'assignment', 'first-pass', 'adjudication', 'second-pass', 'final-record'])
const nativeOperations = Object.freeze({
  lstat: nativeFs.lstat,
  mkdir: nativeFs.mkdir,
  open: nativeFs.open,
  readFile: nativeFs.readFile,
  realpath: nativeFs.realpath,
  readdir: nativeFs.readdir,
})

function assertNonProductionProcess() {
  if (process.env.NODE_ENV === 'production') {
    throw tutorHumanReviewBlocked('OPERATIONS_NOT_READY', 'Human Review repository is unavailable in Production')
  }
}

function assertExactBoundaryInput(value, allowedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} input must be an object`)
  const keys = Object.keys(value)
  if (keys.some((key) => !allowedKeys.includes(key)) || allowedKeys.some((key) => !(key in value))) {
    throw new TypeError(`${label} input contains missing or caller-controlled fields`)
  }
  return value
}

export function tutorHumanReviewBlocked(reasonCode, message = 'Human Review repository operation blocked') {
  const error = new Error(message)
  error.code = 'BLOCKED'
  error.reasonCode = reasonCode
  return error
}

function boundedFilesystemError(error, reasonCode, message) {
  return error?.code === 'BLOCKED' ? error : tutorHumanReviewBlocked(reasonCode, message)
}

export function assertTutorHumanReviewIdentifier(value, label = 'identifier') {
  if (typeof value !== 'string' || !TUTOR_HUMAN_REVIEW_IDENTIFIER_PATTERN.test(value)
    || value.includes('..') || path.isAbsolute(value) || value !== value.normalize('NFC')) {
    throw new TypeError(`Invalid Human Review ${label}`)
  }
  return value
}

export function assertTutorHumanReviewArtifactName(value) {
  if (typeof value !== 'string' || !fixedArtifacts.has(value)
    || value.includes('..') || value.includes('/') || value.includes('\\') || path.isAbsolute(value)) {
    throw new TypeError('Invalid Human Review artifact name')
  }
  return value
}

export const TUTOR_HUMAN_REVIEW_REPOSITORY_GOVERNANCE = Object.freeze({
  scope: 'DEVELOPMENT_EVALUATION_ONLY',
  repository_visibility_required: 'PRIVATE',
  authoritative_branch_required: 'PROTECTED_DEFAULT_BRANCH',
  coordinator_access: 'BOUND_READ_CREATE_ONLY_WRITE',
  reviewer_direct_repository_access: false,
  learner_access: false,
  tenant_user_access: false,
  production_process_access: false,
  application_copies_allowed: false,
  global_git_history_erasure_claim: false,
  packet_terminal_scope: TUTOR_HUMAN_REVIEW_PACKET_TERMINAL_SCOPE,
})

function repositoryPaths(repositoryRoot, sourceRunId) {
  assertTutorHumanReviewIdentifier(sourceRunId, 'source_run_id')
  const root = path.resolve(repositoryRoot)
  const evaluationRoot = path.resolve(root, 'docs', 'evaluation-results')
  const reviewRoot = path.resolve(evaluationRoot, 'human-review')
  const runDirectory = path.resolve(reviewRoot, sourceRunId)
  if (!runDirectory.startsWith(`${reviewRoot}${path.sep}`)) throw new TypeError('Human Review path escaped its fixed root')
  return { root, evaluationRoot, reviewRoot, runDirectory }
}

export function tutorHumanReviewRunDirectory(repositoryRoot, sourceRunId) {
  return repositoryPaths(repositoryRoot, sourceRunId).runDirectory
}

async function lstatOrNull(target, operations) {
  try { return await operations.lstat(target) } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function assertDirectoryStat(stat) {
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw tutorHumanReviewBlocked('PACKET_INTEGRITY_FAILURE', 'Human Review repository component is unsafe')
  }
}

async function assertCanonicalRepositoryRoot(root, operations) {
  const stat = await operations.lstat(root)
  assertDirectoryStat(stat)
  const canonical = path.resolve(await operations.realpath(root))
  if (canonical !== root) throw tutorHumanReviewBlocked('PACKET_INTEGRITY_FAILURE', 'Human Review repository root is not canonical')
  return canonical
}

async function ensureDirectory(target, operations) {
  let stat = await lstatOrNull(target, operations)
  if (!stat) {
    try { await operations.mkdir(target) } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
    stat = await operations.lstat(target)
  }
  assertDirectoryStat(stat)
  return target
}

async function ensureDirectoryChain(repositoryRoot, components, operations) {
  const root = path.resolve(repositoryRoot)
  await assertCanonicalRepositoryRoot(root, operations)
  let current = root
  for (const component of components) {
    current = path.join(current, component)
    await ensureDirectory(current, operations)
  }
  return current
}

async function assertExistingDirectoryChain(repositoryRoot, components, operations, { optional = false } = {}) {
  const root = path.resolve(repositoryRoot)
  try {
    await assertCanonicalRepositoryRoot(root, operations)
    let current = root
    for (const component of components) {
      current = path.join(current, component)
      const stat = await operations.lstat(current)
      assertDirectoryStat(stat)
    }
    return current
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null
    throw error
  }
}

async function assertContainedRealPath(target, canonicalBoundary, operations) {
  const canonicalTarget = path.resolve(await operations.realpath(target))
  if (canonicalTarget !== canonicalBoundary && !canonicalTarget.startsWith(`${canonicalBoundary}${path.sep}`)) {
    throw tutorHumanReviewBlocked('PACKET_INTEGRITY_FAILURE', 'Human Review artifact escaped its canonical root')
  }
  return canonicalTarget
}

async function readRegularFile(target, canonicalBoundary, operations, { optional = false } = {}) {
  let handle
  try {
    const existing = await lstatOrNull(target, operations)
    if (!existing && optional) return null
    if (!existing) throw Object.assign(new Error('missing artifact'), { code: 'ENOENT' })
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw tutorHumanReviewBlocked('PACKET_INTEGRITY_FAILURE', 'Human Review artifact is not a regular file')
    }
    await assertContainedRealPath(target, canonicalBoundary, operations)
    handle = await operations.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
    const opened = await handle.stat()
    if (!opened.isFile()) throw tutorHumanReviewBlocked('PACKET_INTEGRITY_FAILURE', 'Human Review opened artifact is not a regular file')
    const bytes = await handle.readFile()
    await assertContainedRealPath(target, canonicalBoundary, operations)
    return bytes
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null
    throw boundedFilesystemError(error, 'PACKET_INTEGRITY_FAILURE', 'Human Review artifact read failed')
  } finally {
    try { await handle?.close() } catch (error) {
      throw boundedFilesystemError(error, 'PACKET_INTEGRITY_FAILURE', 'Human Review artifact close failed')
    }
  }
}

async function writeCreateOnce(target, bytes, canonicalBoundary, operations, duplicateReason = 'DUPLICATE_SUBMISSION') {
  let handle
  try {
    await assertContainedRealPath(path.dirname(target), canonicalBoundary, operations)
    handle = await operations.open(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW || 0), 0o600)
    await assertContainedRealPath(target, canonicalBoundary, operations)
    await handle.writeFile(bytes)
    await handle.sync()
    await assertContainedRealPath(target, canonicalBoundary, operations)
    await handle.close()
    handle = null
    const readback = await readRegularFile(target, canonicalBoundary, operations)
    if (!readback.equals(bytes)) throw tutorHumanReviewBlocked('PACKET_INTEGRITY_FAILURE', 'Human Review artifact readback mismatch')
  } catch (error) {
    try { await handle?.close() } catch {}
    if (error?.code === 'EEXIST') throw tutorHumanReviewBlocked(duplicateReason, 'Human Review create-once artifact already exists')
    throw boundedFilesystemError(error, 'PACKET_INTEGRITY_FAILURE', 'Human Review create-once write failed')
  }
}

function parseJson(bytes) {
  try { return JSON.parse(bytes.toString('utf8')) } catch {
    throw tutorHumanReviewBlocked('PACKET_INTEGRITY_FAILURE', 'Human Review artifact JSON is invalid')
  }
}

function reviewArtifactParts(reviewRef, kind, submissionRef = null) {
  assertTutorHumanReviewIdentifier(reviewRef, 'review_ref')
  if (!reviewArtifactKinds.has(kind)) throw new TypeError('Invalid Human Review artifact kind')
  if (kind === 'claim' || kind === 'final-record') {
    if (submissionRef !== null) throw new TypeError(`${kind} does not accept a submission_ref`)
    return { directories: ['reviews', reviewRef], fileName: `${kind}.json` }
  }
  assertTutorHumanReviewIdentifier(submissionRef, 'submission_ref')
  const directory = kind === 'assignment' ? 'assignments' : kind
  return { directories: ['reviews', reviewRef, directory], fileName: `${submissionRef}.json` }
}

async function createFixedArtifact(args, operations) {
  const { repositoryRoot, sourceRunId, artifactName, value } = args
  const { reviewRoot } = repositoryPaths(repositoryRoot, sourceRunId)
  try {
    const runDirectory = await ensureDirectoryChain(repositoryRoot, [...TUTOR_HUMAN_REVIEW_REPOSITORY_ROOT, sourceRunId], operations)
    const canonicalReviewRoot = path.resolve(await operations.realpath(reviewRoot))
    const artifactPath = path.join(runDirectory, assertTutorHumanReviewArtifactName(artifactName))
    const bytes = jcsUtf8Bytes(value)
    await writeCreateOnce(artifactPath, bytes, canonicalReviewRoot, operations)
    return Object.freeze({ artifactPath, bytes: bytes.byteLength })
  } catch (error) {
    throw boundedFilesystemError(error, error?.reasonCode || 'PACKET_INTEGRITY_FAILURE', 'Human Review fixed artifact creation failed')
  }
}

async function readFixedArtifact(args, operations) {
  const { repositoryRoot, sourceRunId, artifactName } = args
  const { reviewRoot } = repositoryPaths(repositoryRoot, sourceRunId)
  try {
    const runDirectory = await assertExistingDirectoryChain(repositoryRoot, [...TUTOR_HUMAN_REVIEW_REPOSITORY_ROOT, sourceRunId], operations)
    const canonicalReviewRoot = path.resolve(await operations.realpath(reviewRoot))
    const artifactPath = path.join(runDirectory, assertTutorHumanReviewArtifactName(artifactName))
    const bytes = await readRegularFile(artifactPath, canonicalReviewRoot, operations)
    return Object.freeze({ artifactPath, bytes, value: parseJson(bytes) })
  } catch (error) {
    throw boundedFilesystemError(error, error?.reasonCode || 'PACKET_INTEGRITY_FAILURE', 'Human Review fixed artifact read failed')
  }
}

async function createExecutionArtifact(args, operations) {
  const { repositoryRoot, sourceRunId, reviewRef, kind, submissionRef = null, value } = args
  const { reviewRoot } = repositoryPaths(repositoryRoot, sourceRunId)
  try {
    const runDirectory = await ensureDirectoryChain(repositoryRoot, [...TUTOR_HUMAN_REVIEW_REPOSITORY_ROOT, sourceRunId], operations)
    const parts = reviewArtifactParts(reviewRef, kind, submissionRef)
    const targetDirectory = await ensureDirectoryChain(runDirectory, parts.directories, operations)
    const canonicalReviewRoot = path.resolve(await operations.realpath(reviewRoot))
    const artifactPath = path.join(targetDirectory, parts.fileName)
    const bytes = jcsUtf8Bytes(value)
    await writeCreateOnce(artifactPath, bytes, canonicalReviewRoot, operations)
    return Object.freeze({ artifactPath, bytes: bytes.byteLength })
  } catch (error) {
    throw boundedFilesystemError(error, error?.reasonCode || 'PACKET_INTEGRITY_FAILURE', 'Human Review execution artifact creation failed')
  }
}

async function readExecutionArtifact(args, operations, { optional = false } = {}) {
  const { repositoryRoot, sourceRunId, reviewRef, kind, submissionRef = null } = args
  const { reviewRoot } = repositoryPaths(repositoryRoot, sourceRunId)
  const parts = reviewArtifactParts(reviewRef, kind, submissionRef)
  try {
    const components = [...TUTOR_HUMAN_REVIEW_REPOSITORY_ROOT, sourceRunId, ...parts.directories]
    const targetDirectory = await assertExistingDirectoryChain(repositoryRoot, components, operations, { optional })
    if (targetDirectory === null) return null
    const canonicalReviewRoot = path.resolve(await operations.realpath(reviewRoot))
    const artifactPath = path.join(targetDirectory, parts.fileName)
    const bytes = await readRegularFile(artifactPath, canonicalReviewRoot, operations, { optional })
    if (bytes === null) return null
    return Object.freeze({ artifactPath, bytes, value: parseJson(bytes) })
  } catch (error) {
    throw boundedFilesystemError(error, error?.reasonCode || 'PACKET_INTEGRITY_FAILURE', 'Human Review execution artifact read failed')
  }
}

async function listExecutionArtifacts(args, operations) {
  const { repositoryRoot, sourceRunId, reviewRef, kind } = args
  if (!['assignment', 'first-pass', 'adjudication', 'second-pass'].includes(kind)) throw new TypeError('Human Review artifact kind is not listable')
  const { reviewRoot } = repositoryPaths(repositoryRoot, sourceRunId)
  const directory = kind === 'assignment' ? 'assignments' : kind
  try {
    const targetDirectory = await assertExistingDirectoryChain(repositoryRoot,
      [...TUTOR_HUMAN_REVIEW_REPOSITORY_ROOT, sourceRunId, 'reviews', assertTutorHumanReviewIdentifier(reviewRef, 'review_ref'), directory],
      operations, { optional: true })
    if (targetDirectory === null) return Object.freeze([])
    const canonicalReviewRoot = path.resolve(await operations.realpath(reviewRoot))
    const entries = await operations.readdir(targetDirectory, { withFileTypes: true })
    const artifacts = []
    for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
      if (!entry.isFile() || entry.isSymbolicLink() || !/^[a-z0-9][a-z0-9-]{0,119}\.json$/.test(entry.name)) {
        throw tutorHumanReviewBlocked('PACKET_INTEGRITY_FAILURE', 'Unexpected Human Review execution artifact')
      }
      const submissionRef = entry.name.slice(0, -'.json'.length)
      artifacts.push(await readExecutionArtifact({ ...args, submissionRef }, operations))
    }
    return Object.freeze(artifacts)
  } catch (error) {
    throw boundedFilesystemError(error, error?.reasonCode || 'PACKET_INTEGRITY_FAILURE', 'Human Review execution artifact listing failed')
  }
}

async function createSourceResultArtifact(args, operations) {
  const { repositoryRoot, sourceRunId, value } = args
  const { evaluationRoot } = repositoryPaths(repositoryRoot, sourceRunId)
  try {
    const directory = await ensureDirectoryChain(repositoryRoot, ['docs', 'evaluation-results'], operations)
    const canonicalEvaluationRoot = path.resolve(await operations.realpath(evaluationRoot))
    const artifactPath = path.join(directory, `${sourceRunId}.result.json`)
    const bytes = jcsUtf8Bytes(value)
    await writeCreateOnce(artifactPath, bytes, canonicalEvaluationRoot, operations)
    return Object.freeze({ artifactPath, bytes: bytes.byteLength })
  } catch (error) {
    throw boundedFilesystemError(error, error?.reasonCode || 'PACKET_INTEGRITY_FAILURE', 'Human Review source Result creation failed')
  }
}

async function readSourceResultArtifact(args, operations) {
  const { repositoryRoot, sourceRunId } = args
  const { evaluationRoot } = repositoryPaths(repositoryRoot, sourceRunId)
  try {
    const directory = await assertExistingDirectoryChain(repositoryRoot, ['docs', 'evaluation-results'], operations)
    const canonicalEvaluationRoot = path.resolve(await operations.realpath(evaluationRoot))
    const artifactPath = path.join(directory, `${sourceRunId}.result.json`)
    const bytes = await readRegularFile(artifactPath, canonicalEvaluationRoot, operations)
    return Object.freeze({ artifactPath, bytes, value: parseJson(bytes) })
  } catch (error) {
    throw boundedFilesystemError(error, error?.reasonCode || 'PACKET_INTEGRITY_FAILURE', 'Human Review source Result read failed')
  }
}

export async function createTutorHumanReviewArtifact(args) { assertNonProductionProcess(); return createFixedArtifact(args, nativeOperations) }
export async function readTutorHumanReviewArtifact(args) { assertNonProductionProcess(); return readFixedArtifact(args, nativeOperations) }
export async function createTutorHumanReviewExecutionArtifact(args) { assertNonProductionProcess(); return createExecutionArtifact(args, nativeOperations) }
export async function readTutorHumanReviewExecutionArtifact(args) { assertNonProductionProcess(); return readExecutionArtifact(args, nativeOperations) }
export async function readOptionalTutorHumanReviewExecutionArtifact(args) { assertNonProductionProcess(); return readExecutionArtifact(args, nativeOperations, { optional: true }) }
export async function listTutorHumanReviewExecutionArtifacts(args) { assertNonProductionProcess(); return listExecutionArtifacts(args, nativeOperations) }
export async function createTutorHumanReviewSourceResultArtifact(args) { assertNonProductionProcess(); return createSourceResultArtifact(args, nativeOperations) }
export async function readTutorHumanReviewSourceResultArtifact(args) { assertNonProductionProcess(); return readSourceResultArtifact(args, nativeOperations) }

export async function verifyTutorHumanReviewRepositoryRoot({ repositoryRoot, sourceRunId }) {
  assertNonProductionProcess()
  const { reviewRoot } = repositoryPaths(repositoryRoot, sourceRunId)
  try {
    await assertExistingDirectoryChain(repositoryRoot, TUTOR_HUMAN_REVIEW_REPOSITORY_ROOT, nativeOperations)
    return Object.freeze({ reviewRoot, canonicalReviewRoot: path.resolve(await nativeOperations.realpath(reviewRoot)) })
  } catch (error) {
    throw boundedFilesystemError(error, error?.reasonCode || 'PACKET_INTEGRITY_FAILURE', 'Human Review repository root verification failed')
  }
}

async function loadActiveTutorHumanReviewPacketWithClock(args, clock) {
  assertNonProductionProcess()
  assertTrustedTutorHumanReviewClock(clock)
  const { repositoryRoot, sourceRunId, reviewRef } = assertExactBoundaryInput(args,
    ['repositoryRoot', 'sourceRunId', 'reviewRef'], 'Active Review Packet loader')
  assertTutorHumanReviewIdentifier(reviewRef, 'review_ref')
  const artifact = await readTutorHumanReviewArtifact({ repositoryRoot, sourceRunId, artifactName: 'review-packet.json' })
  let packet
  try { packet = verifyTutorHumanReviewPacket(artifact.value) } catch {
    throw tutorHumanReviewBlocked('PACKET_INTEGRITY_FAILURE', 'Review Packet verification failed')
  }
  if (packet.source_run_id !== sourceRunId) throw tutorHumanReviewBlocked('SOURCE_BINDING_MISMATCH', 'Review Packet source binding mismatch')
  let terminalAt = null
  const terminal = await readOptionalTutorHumanReviewExecutionArtifact({ repositoryRoot, sourceRunId, reviewRef, kind: 'final-record' })
  if (terminal) {
    let record
    try { record = verifyTutorHumanReviewRecord(terminal.value) } catch {
      throw tutorHumanReviewBlocked('PACKET_INTEGRITY_FAILURE', 'Terminal Review Record verification failed')
    }
    if (record.review_ref !== reviewRef || record.source_run_id !== sourceRunId || record.packet_sha256 !== packet.packet_sha256
      || record.source_result_sha256 !== packet.source_result_sha256
      || record.sample_manifest_sha256 !== packet.sample_manifest_sha256
      || !['COMPLETE', 'BLOCKED'].includes(record.lifecycle_state)) {
      throw tutorHumanReviewBlocked('SOURCE_BINDING_MISMATCH', 'Terminal Review Record binding mismatch')
    }
    terminalAt = record.terminal_at
  }
  const effectiveDeleteAt = tutorHumanReviewPacketDeleteAt(packet.packet_created_at, terminalAt)
  if (packet.packet_expires_at !== tutorHumanReviewPacketDeleteAt(packet.packet_created_at)) {
    throw tutorHumanReviewBlocked('PACKET_INTEGRITY_FAILURE', 'Review Packet base retention binding mismatch')
  }
  try { assertTutorHumanReviewMaterialActive(effectiveDeleteAt, readTrustedTutorHumanReviewNow(clock)) } catch (error) {
    if (error?.code === 'REVIEW_MATERIAL_EXPIRED') throw tutorHumanReviewBlocked('REVIEW_MATERIAL_EXPIRED', 'Review Packet has expired')
    throw error
  }
  return packet
}

export async function loadActiveTutorHumanReviewPacket(args) {
  return loadActiveTutorHumanReviewPacketWithClock(args, tutorHumanReviewServerClock())
}

export async function loadActiveTutorHumanReviewPacketWithInternalClock(args, clock) {
  return loadActiveTutorHumanReviewPacketWithClock(args, clock)
}

export function createTutorHumanReviewRepositoryTestSeam(overrides = {}) {
  if (process.env.NODE_ENV === 'production') throw tutorHumanReviewBlocked('PACKET_INTEGRITY_FAILURE', 'Repository test seam is forbidden in Production')
  const operations = Object.freeze({ ...nativeOperations, ...overrides })
  return Object.freeze({
    createArtifact: (args) => createFixedArtifact(args, operations),
    readArtifact: (args) => readFixedArtifact(args, operations),
    createExecutionArtifact: (args) => createExecutionArtifact(args, operations),
    readExecutionArtifact: (args) => readExecutionArtifact(args, operations),
  })
}
