import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import path from 'node:path'
import { jcsUtf8Bytes } from './human-review-canonical.js'
import { tutorHumanReviewServerClock, readTrustedTutorHumanReviewNow } from '../governance/human-review-clock.js'
import { tutorSyntheticEvalCases } from '../eval-fixtures.js'
import { localTutorFallback } from '../fallback-registry.js'
import { evaluateTutorCandidateSafety, canonicalNotReachedGateResults } from '../canonical-safety-gates.js'
import { TUTOR_REVIEW_CAPABLE_EVALUATION_MANIFEST as manifest } from './human-review-evaluation-contract.js'
import { verifyTutorReviewCapableResultV5 } from './human-review-evaluator-v7.js'
import { buildTutorHumanReviewSampleManifest, verifyTutorHumanReviewSampleManifestAgainstInput } from './human-review-sampling.js'
import { buildTutorHumanReviewPacket, verifyTutorHumanReviewPacket } from './human-review-packet.js'
import { TUTOR_PROVIDER_FAILURE_CODES } from './provider-diagnostics.js'
import { PAID_EXECUTION_VERSION, PAID_EXECUTION_NO_RESUME, PAID_GOVERNANCE, PAID_LIMITS, PAID_PROOF_NAMES,
  assertPaidNonProduction, paidPaths, paidBlocked, paidFileHash, sealPaidArtifact, exactInput, deepFreeze,
  paidCaseFactsSchema, PAID_EXECUTION_CAUSES, sha, id } from './paid-execution-contract.js'
import { paidKnownUsage, paidUnknownFacts, derivePaidAccounting, paidNextReservationFailure, paidPerCallBreach } from './paid-execution-accounting.js'
import { createPaidRepository, paidCheckpointName } from './paid-execution-repository.js'
import { provisionInternalPaidProtectionTest, verifyPaidProtection, PAID_PROTECTION_CLASSIFICATIONS } from './paid-execution-protection.js'

const authorities = new WeakMap(), owners = new WeakMap(), permissions = new WeakMap(), reconciliationProofs = new WeakMap()
const clock = tutorHumanReviewServerClock()
const now = () => readTrustedTutorHumanReviewNow(clock).toISOString()
const fixtures = tutorSyntheticEvalCases()
const common = (runId, hash) => ({ execution_contract_version: PAID_EXECUTION_VERSION, run_id: runId, run_contract_hash: hash })
const rawValue = artifact => { try { return JSON.parse(artifact.bytes.toString('utf8')) } catch { throw paidBlocked('DIGEST_MISMATCH') } }
function trusted(capability, runId) {
  assertPaidNonProduction()
  const a = authorities.get(capability)
  // No real operator integration or transport authority is provisioned by this framework implementation.
  if (!a || process.env.NODE_ENV !== 'test' || a.runId !== runId) throw paidBlocked('AUTHORIZATION_INVALID')
  return a
}

export async function paidExecutionReadiness(args) {
  const classifications = PAID_PROTECTION_CLASSIFICATIONS
  try {
    exactInput(args, ['runId', 'authority'])
    const a = trusted(args.authority, args.runId)
    if (!a.operationsReady) throw paidBlocked('OPERATIONS_NOT_READY')
    await verifyPaidProtection(a.repositoryRoot, args.runId)
    await createPaidRepository({ repositoryRoot: a.repositoryRoot, runId: args.runId, faultCapability: a.faultCapability }).checkpointEntries()
    return Object.freeze({ status: 'READY_PROVIDER_FREE_TEST_ONLY', ready: true, classifications,
      actual_platform_qualification: 'NOT_PERFORMED', external_properties_technically_proven: false, paid_v9_authorized: false, provider_transport_available: false })
  } catch (e) { return Object.freeze({ status: 'BLOCKED', ready: false, reason_code: e.reason_code || 'OPERATIONS_NOT_READY', classifications,
    actual_platform_qualification: 'NOT_PERFORMED', external_properties_technically_proven: false, paid_v9_authorized: false, provider_transport_available: false }) }
}

async function sourceAuthority(repository, capability, runId) {
  const a = trusted(capability, runId)
  await verifyPaidProtection(a.repositoryRoot, runId)
  const att = await repository.read(repository.refs.attestation), auth = await repository.read(repository.refs.authorization)
  if (auth.sha256 !== a.authorizationHash || att.sha256 !== a.attestationHash
    || auth.value.run_contract_hash !== a.hash || att.value.run_contract_hash !== a.hash
    || auth.value.operations_attestation_sha256 !== att.sha256 || auth.value.operations_attestation_ref !== att.value.attestation_ref
    || auth.value.coordinator_ref !== a.coordinator || att.value.coordinator_ref !== a.coordinator
    || auth.value.execution_revision !== a.revision || att.value.execution_revision !== a.revision
    || auth.value.approved_by !== a.operator || auth.value.operator_authority_ref !== a.operatorAuthority
    || auth.value.authorized_at > now() || !a.operationsReady) throw paidBlocked('AUTHORIZATION_INVALID')
  for (const k of PAID_PROOF_NAMES) if (att.value[k].attested_by !== a.operator || att.value[k].attested_at > now()
    || !a.evidenceRefs.has(att.value[k].evidence_ref)) throw paidBlocked('OPERATIONS_NOT_READY')
  await verifyPaidProtection(a.repositoryRoot, runId, att.value.protected_authoritative_branch_attested.evidence_ref)
  return { a, att, auth }
}

// The sole provisioning seam is test-process and test-namespace restricted. It creates no real authority.
export async function createInternalPaidExecutionTestHarness(args) {
  exactInput(args, ['repositoryRoot', 'runId', 'eventForFixture', 'faultCapability', 'fallbackFactory'])
  assertPaidNonProduction()
  if (process.env.NODE_ENV !== 'test' || !/^test-paid-[a-z0-9-]+$/.test(args.runId)
    || !path.basename(args.repositoryRoot).startsWith('paid-execution-test-')
    || typeof args.eventForFixture !== 'function' || (args.fallbackFactory !== null && typeof args.fallbackFactory !== 'function')) throw paidBlocked('AUTHORIZATION_INVALID')
  const hash = paidFileHash(Buffer.from(`SYNTHETIC TEST CONTRACT ONLY:${args.runId}`))
  const protection = await provisionInternalPaidProtectionTest({ repositoryRoot: args.repositoryRoot, runId: args.runId })
  const cap = Object.freeze({}), repository = createPaidRepository({ repositoryRoot: args.repositoryRoot, runId: args.runId, faultCapability: args.faultCapability })
  const a = { ...args, hash, operator: 'test-paid-operator', operatorAuthority: 'test-paid-operator-authority',
    coordinator: 'test-paid-coordinator', revision: 'a'.repeat(40), evidenceRefs: new Set(), operationsReady: true, stoppedOwners: new Set(),
    finalizations: new Map(), reconciliationWitnesses: new Map() }
  authorities.set(cap, a)
  const proof = key => { const evidence = `test-paid-${key.replaceAll('_', '-')}`; a.evidenceRefs.add(evidence)
    return { value: true, attested_by: a.operator, attested_at: now(), run_id: args.runId, run_contract_hash: hash, evidence_ref: evidence } }
  const att = sealPaidArtifact({ ...common(args.runId, hash), artifact_kind: 'OPERATIONS_ATTESTATION', attestation_ref: 'test-paid-attestation',
    repository_ref: 'test-paid-repository', authoritative_branch_ref: 'test-paid-protected-branch', execution_revision: a.revision,
    coordinator_ref: a.coordinator, ...Object.fromEntries(PAID_PROOF_NAMES.map(k => [k, proof(k)])), external_properties_technically_proven: false })
  const attFile = await repository.write(repository.refs.attestation, att); a.attestationHash = attFile.sha256
  const auth = sealPaidArtifact({ ...common(args.runId, hash), ...PAID_GOVERNANCE, artifact_kind: 'AUTHORIZATION', authorization_ref: 'test-paid-authorization',
    provider: manifest.provider_id, model: manifest.model_id, prompt_version: manifest.prompt_version, prompt_digest: manifest.prompt_digest,
    response_schema: manifest.schema_version, evaluation_version: manifest.eval_manifest_version, evaluator_version: manifest.evaluator_version,
    result_version: manifest.result_contract_version, evaluation_scope_fingerprint: manifest.scope_fingerprint,
    fixture_version: manifest.fixture_set_version, fixture_digest: manifest.fixture_set_hash, sampling_contract: 'tutor-human-review-sampling-v1',
    packet_contract: 'tutor-human-review-packet-v1', pricing_contract: manifest.frozen_token_pricing.pricing_contract_version,
    pricing_ref: manifest.frozen_token_pricing.pricing_ref, accounting_contract: 'tutor-paid-evaluation-accounting-v1', limits: PAID_LIMITS,
    repetitions: 1, external_provider_calls_allowed: true, review_capture_required: true, max_retries: 0, provider_failover: false,
    replay_allowed: false, resume_policy: PAID_EXECUTION_NO_RESUME, operations_attestation_ref: att.attestation_ref,
    operations_attestation_sha256: attFile.sha256, approved_by: a.operator, operator_authority_ref: a.operatorAuthority,
    authorized_at: now(), execution_revision: a.revision, coordinator_ref: a.coordinator, claim_ref: repository.refs.claim,
    result_ref: repository.refs.result, execution_ref: repository.refs.execution, single_use: true, create_once: true, consumed_on_claim: true })
  a.authorizationHash = (await repository.write(repository.refs.authorization, auth)).sha256
  return Object.freeze({ authority: cap, repository, protection,
    crash(session) {
      const s = owners.get(session); if (!s || s.capability !== cap) throw paidBlocked()
      s.dead = true; s.outputs.clear(); s.caseResults.length = 0; s.pendingFacts = null; s.inFlight = false
      a.stoppedOwners.add(s.claim.value.execution_owner_ref)
      const proofCap = Object.freeze({}); const witness = { cap, owner: s.claim.value.execution_owner_ref,
        value: { operator_ref: a.operator, evidence_ref: 'test-paid-stopped-owner', original_owner_stopped: true,
          exclusive_coordinator_attested: true, verified_at: now() } }
      reconciliationProofs.set(proofCap, witness); a.reconciliationWitnesses.set(witness.owner, witness); return proofCap
    },
    setOperationsReady(value) { if (process.env.NODE_ENV !== 'test' || typeof value !== 'boolean') throw paidBlocked(); a.operationsReady = value },
    transientCount(session) { const s = owners.get(session); if (!s || s.capability !== cap) throw paidBlocked(); return s.outputs.size },
  })
}

function checkpointBinding(claim) {
  const v = claim.value
  return { ...common(v.run_id, v.run_contract_hash), claim_ref: claim.ref, claim_sha256: claim.sha256,
    authorization_ref: v.authorization_ref, authorization_sha256: v.authorization_sha256, execution_owner_ref: v.execution_owner_ref }
}
function checkpointMatches(c, claim, previous, sequence) {
  const expected = checkpointBinding(claim)
  if (Object.entries(expected).some(([k, v]) => c.value[k] !== v) || c.value.sequence !== sequence
    || c.value.previous_checkpoint_sha256 !== previous || c.value.created_at > now()) throw paidBlocked('DIGEST_MISMATCH')
}
function samplingInput(result, resultHash) {
  return { source_run_id: result.source_run_id, source_result_sha256: resultHash,
    fixture_set_version: result.fixture_set_version, fixture_set_sha256: result.fixture_set_sha256,
    cases: result.cases.map(c => ({ case_id: c.case_id, final_source: c.final_source, subject_category: c.subject_category,
      hint_level: c.hint_level, bounded_cause_class: c.bounded_cause_class, bounded_cause_code: c.bounded_cause_code })) }
}

async function inspect(repository, capability, runId) {
  const { a, auth, att } = await sourceAuthority(repository, capability, runId)
  const claim = await repository.read(repository.refs.claim)
  if (claim.value.run_id !== runId || claim.value.run_contract_hash !== a.hash || claim.value.authorization_sha256 !== auth.sha256
    || claim.value.operations_attestation_sha256 !== att.sha256 || claim.value.authorization_ref !== auth.value.authorization_ref
    || claim.value.operations_attestation_ref !== att.value.attestation_ref || claim.value.coordinator_ref !== a.coordinator
    || claim.value.claimed_at > now()) throw paidBlocked('AUTHORIZATION_INVALID')
  const scan = await repository.scanCheckpoints(), checkpoints = []
  let cases = [], accounting = derivePaidAccounting(cases), prefixFailure = null
  let head = claim.sha256, lastTimestamp = claim.value.claimed_at
  // Byte/schema scanning is not authority. Commit each checkpoint to the prefix only
  // after its sequence, bindings, transition and accounting have all been verified.
  for (const c of scan.artifacts) {
    const index = checkpoints.length + 1
    try {
      if (c.ref !== `${repository.refs.checkpoints}/${paidCheckpointName(index)}`) throw paidBlocked('EXECUTION_DRIFT')
      checkpointMatches(c, claim, head, index)
      if (c.value.created_at < lastTimestamp) throw paidBlocked('DIGEST_MISMATCH')
      const kind = index <= 240 ? index % 2 ? 'CASE_PREPARED' : 'CASE_SETTLED'
        : ['RESULT_PREPARED', 'RESULT_VERIFIED', 'REVIEW_MATERIAL_PREPARED', 'REVIEW_MATERIAL_SETTLED'][index - 241]
      if (c.value.artifact_kind !== kind) throw paidBlocked('EXECUTION_DRIFT')
      const nextCases = cases.slice()
      if (index <= 240) {
        const ordinal = Math.ceil(index / 2)
        if (c.value.case_ordinal !== ordinal || c.value.case_id !== fixtures[ordinal - 1].case_id) throw paidBlocked('EXECUTION_DRIFT')
        if (kind === 'CASE_PREPARED') {
          if (paidPerCallBreach(cases)) throw paidBlocked('TOKEN_LIMIT')
          if (cases.length && (!cases.at(-1).facts.case_completed || cases.at(-1).facts.final_outcome_status === 'FINAL_OUTCOME_FAIL')) throw paidBlocked()
          const limit = paidNextReservationFailure(accounting); if (limit) throw paidBlocked(limit)
          nextCases.push({ case_ordinal: ordinal, case_id: c.value.case_id, prepared_ref: c.ref, prepared_sha256: c.sha256,
            settled_ref: null, settled_sha256: null, facts: paidUnknownFacts() })
        } else {
          if (c.value.prepared_sha256 !== cases.at(-1).prepared_sha256 || c.value.facts.transport_started === null) throw paidBlocked()
          nextCases[nextCases.length - 1] = { ...cases.at(-1), settled_ref: c.ref, settled_sha256: c.sha256, facts: c.value.facts }
        }
      } else {
        if (cases.length !== 120 || cases.some(c => !c.facts.case_completed)) throw paidBlocked()
        if (index >= 242 && c.value.result_sha256 !== checkpoints[240].value.result_sha256) throw paidBlocked('DIGEST_MISMATCH')
        if (index === 243 && (c.value.packet_created_at > c.value.created_at || c.value.packet_created_at < claim.value.claimed_at)) throw paidBlocked('DIGEST_MISMATCH')
        if (index === 244 && ['sample_sha256', 'packet_sha256'].some(k => c.value[k] !== checkpoints[242].value[k])) throw paidBlocked('DIGEST_MISMATCH')
      }
      const nextAccounting = index <= 240 ? derivePaidAccounting(nextCases) : accounting
      cases = nextCases; accounting = nextAccounting
      checkpoints.push(c); head = c.sha256; lastTimestamp = c.value.created_at
    } catch (e) {
      if (e?.reason_code === 'OPERATIONS_NOT_READY') throw e
      prefixFailure = { layer: 'EXECUTION_PREFIX', checkpoint_ref: c.ref,
        reason_code: ['DIGEST_MISMATCH', 'EXECUTION_DRIFT', 'TOKEN_LIMIT', 'CALL_LIMIT', 'BUDGET_LIMIT', 'AUTHORIZATION_INVALID'].includes(e?.reason_code) ? e.reason_code : 'DIGEST_MISMATCH' }
      break
    }
  }
  // A semantic failure earlier in the scan takes precedence over any later byte failure.
  prefixFailure ||= scan.failure
  const rp = checkpoints[240], rv = checkpoints[241], mp = checkpoints[242], ms = checkpoints[243]
  const issues = prefixFailure ? [prefixFailure] : []
  const damaged = (layer, e) => {
    if (e?.reason_code === 'OPERATIONS_NOT_READY') throw e
    issues.push({ layer, reason_code: ['DIGEST_MISMATCH', 'ARTIFACT_READBACK_FAILURE'].includes(e?.reason_code) ? e.reason_code : 'DIGEST_MISMATCH' })
  }
  const readLayer = async (ref, layer) => {
    try { return await repository.rawRead(ref, true) } catch (e) { damaged(layer, e); return null }
  }
  let result = await readLayer(repository.refs.result, 'RESULT')
  let sample = await readLayer(repository.refs.sample, 'REVIEW_MATERIAL')
  let packet = await readLayer(repository.refs.packet, 'REVIEW_MATERIAL')
  let sampleVerified = false
  try {
    if (result) {
      if (!rp || result.sha256 !== rp.value.result_sha256 || (rv && rv.value.result_sha256 !== result.sha256)) throw paidBlocked('DIGEST_MISMATCH')
      result.value = verifyTutorReviewCapableResultV5(rawValue(result))
      if (!jcsUtf8Bytes(result.value).equals(result.bytes) || result.value.source_run_id !== runId
        || result.value.evaluation_scope_fingerprint !== manifest.scope_fingerprint) throw paidBlocked('DIGEST_MISMATCH')
      for (const [i, c] of result.value.cases.entries()) {
        if (c.final_source !== cases[i].facts.final_outcome_status
          || (c.provider_candidate_status === 'PROVIDER_FAILURE' ? c.provider_candidate_code : null) !== cases[i].facts.provider_technical_cause) throw paidBlocked('DIGEST_MISMATCH')
      }
    } else if (rv) throw paidBlocked('DIGEST_MISMATCH')
  } catch (e) { damaged('RESULT', e); result = null }
  const eligible = Boolean(result?.value.system_safety_pass)
  try {
    if (mp && (!eligible || !rv || mp.value.result_sha256 !== result.sha256 || mp.value.packet_created_at > mp.value.created_at
      || mp.value.packet_created_at < claim.value.claimed_at)) throw paidBlocked('DIGEST_MISMATCH')
    if (sample || packet) {
      if (!mp || !result) throw paidBlocked('DIGEST_MISMATCH')
      if (sample) {
        if (sample.sha256 !== mp.value.sample_sha256) throw paidBlocked('DIGEST_MISMATCH')
        sample.value = verifyTutorHumanReviewSampleManifestAgainstInput(rawValue(sample), samplingInput(result.value, result.sha256))
        if (!jcsUtf8Bytes(sample.value).equals(sample.bytes)) throw paidBlocked('DIGEST_MISMATCH')
        sampleVerified = true
      }
      if (packet) {
        if (!sample || packet.sha256 !== mp.value.packet_sha256) throw paidBlocked('DIGEST_MISMATCH')
        packet.value = verifyTutorHumanReviewPacket(rawValue(packet))
        if (!jcsUtf8Bytes(packet.value).equals(packet.bytes) || packet.value.source_run_id !== runId
          || packet.value.source_result_sha256 !== result.sha256 || packet.value.sample_manifest_sha256 !== sample.value.sample_manifest_sha256
          || packet.value.packet_created_at !== mp.value.packet_created_at) throw paidBlocked('DIGEST_MISMATCH')
      }
    }
    if (ms && (!mp || ['result_sha256', 'sample_sha256', 'packet_sha256'].some(k => ms.value[k] !== mp.value[k])
      || (ms.value.material_state === 'REVIEW_MATERIAL_READY' && (!sample || !packet)))) throw paidBlocked('DIGEST_MISMATCH')
  } catch (e) { damaged('REVIEW_MATERIAL', e); if (!sampleVerified) sample = null; packet = null }
  return { a, claim, checkpoints, cases, accounting, head, result, sample, packet, eligible, issues,
    lastTimestamp, materialReady: Boolean(sample && packet && ms?.value.material_state !== 'BLOCKED'
      && !issues.some(i => i.layer === 'REVIEW_MATERIAL')) }

}

export async function inspectPaidExecution(args) {
  exactInput(args, ['repositoryRoot', 'runId', 'authority'])
  const a = trusted(args.authority, args.runId)
  if (path.resolve(args.repositoryRoot) !== path.resolve(a.repositoryRoot)) throw paidBlocked()
  const repository = createPaidRepository({ repositoryRoot: args.repositoryRoot, runId: args.runId, faultCapability: a.faultCapability })
  const view = await inspect(repository, args.authority, args.runId)
  return paidProjection(view, await terminalLayer(view, repository))
}

async function terminalLayer(view, repository) {
  try {
    const artifact = await repository.read(repository.refs.execution, true)
    if (!artifact) return { state: 'ABSENT', artifact: null, reason: null }
    if (view.issues.some(i => i.layer === 'EXECUTION_PREFIX')) throw paidBlocked('DIGEST_MISMATCH')
    validateTerminal(view, repository.refs, artifact)
    return { state: 'VERIFIED', artifact, reason: null }
  } catch (e) {
    // Loss of the trusted namespace remains a hard gate. Invalid terminal bytes/authority
    // never authenticate themselves, but cannot erase independently verified lower layers.
    if (e.reason_code === 'OPERATIONS_NOT_READY') throw e
    const reason = ['AUTHORIZATION_INVALID', 'DIGEST_MISMATCH', 'ARTIFACT_READBACK_FAILURE'].includes(e.reason_code)
      ? e.reason_code : 'DIGEST_MISMATCH'
    view.issues.push({ layer: 'TERMINAL', reason_code: reason })
    return { state: 'BLOCKED_INVALID', artifact: null, reason }
  }
}
function paidProjection(view, layer) {
  const terminal = layer.artifact?.value
  const invalid = view.issues.find(i => i.layer === 'EXECUTION_PREFIX')
  return deepFreeze({ ...evidenceLayers(view), accounting: terminal?.accounting || view.accounting,
    checkpoint_count: view.checkpoints.length, checkpoint_head: view.head, cases: terminal?.case_accounting || view.cases,
    verified_checkpoint_count: view.checkpoints.length,
    first_invalid_checkpoint_ref: invalid?.checkpoint_ref || null, first_invalid_checkpoint_reason: invalid?.reason_code || null,
    next_checkpoint_state: invalid ? 'PRESENT_BUT_INVALID' : view.checkpoints.length === 244 ? 'CHAIN_COMPLETE' : 'ABSENT',
    terminal_evidence_state: invalid ? 'BLOCKED_PREFIX_INVALID' : layer.state,
    result_verified: Boolean(view.result), review_material_eligible: view.eligible, review_material_ready: view.materialReady,
    terminal_state: layer.state, terminal_failure_reason: layer.reason, terminal: terminal || null,
    terminal_persisted: layer.state !== 'ABSENT', terminal_verified: layer.state === 'VERIFIED' })
}

export async function createPaidExecutionSession(args) {
  exactInput(args, ['repositoryRoot', 'runId', 'authority'])
  const a = trusted(args.authority, args.runId)
  if (path.resolve(args.repositoryRoot) !== path.resolve(a.repositoryRoot)) throw paidBlocked('OPERATIONS_NOT_READY')
  const repository = createPaidRepository({ repositoryRoot: args.repositoryRoot, runId: args.runId, faultCapability: a.faultCapability })
  const { auth, att } = await sourceAuthority(repository, args.authority, args.runId)
  for (const ref of [repository.refs.claim, repository.refs.execution, repository.refs.result, repository.refs.sample, repository.refs.packet]) {
    if (await repository.rawRead(ref, true)) throw paidBlocked('CLAIM_CONFLICT')
  }
  if ((await repository.checkpointEntries()).length) throw paidBlocked('CLAIM_CONFLICT')
  const claim = await repository.write(repository.refs.claim, sealPaidArtifact({ ...common(args.runId, a.hash), ...PAID_GOVERNANCE,
    artifact_kind: 'CLAIM', authorization_ref: auth.value.authorization_ref, authorization_sha256: auth.sha256,
    operations_attestation_ref: att.value.attestation_ref, operations_attestation_sha256: att.sha256, coordinator_ref: a.coordinator,
    execution_owner_ref: `owner-${randomUUID()}`, claimed_at: now(), authorization_consumed: true,
    execution_ref: repository.refs.execution, checkpoint_ref: repository.refs.checkpoints, result_ref: repository.refs.result }))
  const s = { a, capability: args.authority, runId: args.runId, repository, claim, dead: false, halted: false, busy: false,
    inFlight: false, permission: null, pendingFacts: null, outputs: new Map(), caseResults: [], failure: null,
    operationPhase: 'PRETRANSPORT', operationCase: null,
    lastVerified: { head: claim.sha256, checkpoint_count: 0, accounting: derivePaidAccounting([]) } }
  const session = Object.freeze({
    prepare: (...extra) => operation(s, extra, () => prepare(s), false, 'CASE_CHECKPOINT'),
    invoke: permission => operation(s, [], () => invoke(s, permission), false, 'PRETRANSPORT'),
    settle: (...extra) => operation(s, extra, () => settle(s), false, 'CASE_CHECKPOINT'),
    complete: (...extra) => operation(s, extra, () => complete(s), true, 'RESULT'),
    finalize: (...extra) => operation(s, extra, () => finalizeLive(s), true, 'FINAL_RECORD'),
  })
  owners.set(session, s); return session
}

async function inspectLive(s) {
  const v = await inspect(s.repository, s.capability, s.runId)
  s.lastVerified = deepFreeze({ head: v.head, checkpoint_count: v.checkpoints.length, accounting: structuredClone(v.accounting) })
  return v
}
async function operation(s, extra, fn, terminal = false, phase = 'PRETRANSPORT') {
  assertPaidNonProduction()
  if (extra.length || s.dead || s.busy || (s.halted && !terminal)) throw paidBlocked('EXECUTION_DRIFT')
  s.busy = true
  s.operationPhase = phase
  try { await sourceAuthority(s.repository, s.capability, s.runId); return await fn() }
  catch (e) {
    const cause = PAID_EXECUTION_CAUSES.includes(e.reason_code) ? e.reason_code : 'EXECUTION_INTERNAL_FAILURE'
    if (!s.failure) s.failure = deepFreeze({ cause, phase: s.operationPhase, case_id: s.operationCase,
      claim_sha256: s.claim.sha256, prefix: structuredClone(s.lastVerified), occurred_at: now(), uninvoked_intent: !permissions.get(s.permission)?.consumed })
    s.halted = true; s.outputs.clear(); s.pendingFacts = null
    throw e.code === 'BLOCKED' ? e : paidBlocked(cause)
  }
  finally { s.busy = false }
}
async function append(s, view, kind, values) {
  if (s.dead) throw paidBlocked('PROCESS_FAILURE')
  const sequence = view.checkpoints.length + 1
  const body = sealPaidArtifact({ ...checkpointBinding(s.claim), artifact_kind: kind, sequence,
    previous_checkpoint_sha256: view.head, created_at: now(), ...values })
  return s.repository.write(`${s.repository.refs.checkpoints}/${paidCheckpointName(sequence)}`, body)
}
async function prepare(s) {
  const v = await inspectLive(s)
  if (v.issues.length) throw paidBlocked('DIGEST_MISMATCH')
  if (await s.repository.rawRead(s.repository.refs.execution, true)) throw paidBlocked('CLAIM_CONFLICT')
  if (v.claim.sha256 !== s.claim.sha256 || s.permission || v.checkpoints.length % 2 || v.checkpoints.length >= 240) throw paidBlocked('CALL_LIMIT')
  if (v.cases.some(c => !c.facts.case_completed || c.facts.final_outcome_status === 'FINAL_OUTCOME_FAIL')) throw paidBlocked('EXECUTION_DRIFT')
  const breach = paidPerCallBreach(v.cases)
  if (breach) { s.operationCase = breach.case_id; throw paidBlocked('TOKEN_LIMIT') }
  const limit = paidNextReservationFailure(v.accounting); if (limit) throw paidBlocked(limit)
  const ordinal = v.cases.length + 1
  s.operationCase = fixtures[ordinal - 1].case_id
  const p = await append(s, v, 'CASE_PREPARED', { case_ordinal: ordinal, case_id: fixtures[ordinal - 1].case_id,
    reservation: { input_tokens: 40000, output_tokens: 160, total_tokens: 40160, cost_usd_micros: 81920, max_invocations: 1 } })
  if (s.dead) throw paidBlocked('PROCESS_FAILURE')
  const permission = Object.freeze({})
  permissions.set(permission, { s, prepared: p, consumed: false }); s.permission = permission; return permission
}
async function invoke(s, permission) {
  const p = permissions.get(permission)
  if (!p || p.s !== s || p.consumed || s.permission !== permission || s.inFlight) throw paidBlocked('EXECUTION_DRIFT')
  const view = await inspectLive(s)
  if (view.issues.length) throw paidBlocked('DIGEST_MISMATCH')
  if ((await terminalLayer(view, s.repository)).state !== 'ABSENT') throw paidBlocked('CLAIM_CONFLICT')
  if (view.head !== p.prepared.sha256) throw paidBlocked('DIGEST_MISMATCH')
  await sourceAuthority(s.repository, s.capability, s.runId)
  if (s.dead) throw paidBlocked('PROCESS_FAILURE')
  p.consumed = true; s.inFlight = true
  s.operationPhase = 'TRANSPORT'
  const fixture = fixtures[p.prepared.value.case_ordinal - 1]
  let event
  try { event = await s.a.eventForFixture(fixture) } catch { event = { kind: 'PROVIDER_FAILURE', code: 'PROVIDER_UNKNOWN_ERROR', usage: null } }
  finally { s.inFlight = false }
  if (s.dead) throw paidBlocked('PROCESS_FAILURE')
  const evaluated = evaluateEvent(fixture, event, s.a.fallbackFactory || localTutorFallback)
  s.pendingFacts = evaluated.facts; s.caseResults.push(evaluated.resultCase)
  if (evaluated.output) s.outputs.set(fixture.case_id, evaluated.output)
  // Return bounded process information only; candidates/messages never escape this boundary.
  return deepFreeze({ invoked: true, final_outcome_status: evaluated.facts.final_outcome_status })
}
function evaluateEvent(fixture, event, fallbackFactory) {
  let usage = paidKnownUsage(event?.usage), providerCode = null, providerStatus, candidateCode, checked, fallback = false
  if (!usage) providerCode = event?.kind === 'PROVIDER_FAILURE' && TUTOR_PROVIDER_FAILURE_CODES.includes(event.code) ? event.code : 'PROVIDER_USAGE_MISSING'
  else if (event?.kind === 'PROVIDER_FAILURE' && TUTOR_PROVIDER_FAILURE_CODES.includes(event.code)) providerCode = event.code
  if (providerCode) { providerStatus = 'PROVIDER_FAILURE'; candidateCode = providerCode; fallback = true }
  else if (event?.kind === 'PROVIDER_CANDIDATE') {
    checked = evaluateTutorCandidateSafety(event.candidate, fixture)
    providerStatus = checked.passed ? 'PASS' : 'FAIL'; candidateCode = checked.code; fallback = !checked.passed
  } else throw paidBlocked('EXECUTION_DRIFT')
  if (fallback) { try { checked = evaluateTutorCandidateSafety(fallbackFactory(fixture.level), fixture) } catch { checked = null } }
  const source = checked?.passed ? fallback ? 'LOCAL_FALLBACK_ACCEPTED' : 'PROVIDER_ACCEPTED' : 'FINAL_OUTCOME_FAIL'
  const gates = checked?.gate_results || canonicalNotReachedGateResults()
  const outcome = providerCode === 'PROVIDER_TIMEOUT' ? 'TIMEOUT' : providerCode?.startsWith('PROVIDER_HTTP_') ? 'HTTP_FAILURE'
    : providerCode === 'PROVIDER_NETWORK_ERROR' ? 'NETWORK_FAILURE' : providerCode === 'PROVIDER_SCHEMA_PARSE_ERROR' ? 'SCHEMA_PARSE_FAILURE'
      : providerCode === 'PROVIDER_UNKNOWN_ERROR' ? 'OTHER_PROVIDER_FAILURE' : 'RESPONSE_RECEIVED'
  const facts = paidCaseFactsSchema.parse({ transport_started: true, transport_outcome: outcome, usage_status: usage ? 'KNOWN' : 'UNKNOWN',
    ...(usage || { known_input_tokens: null, known_output_tokens: null, known_total_tokens: null, known_actual_cost_usd_micros: null }),
    unknown_reservation_applied: !usage, provider_technical_cause: providerCode, fallback_used: fallback,
    final_outcome_status: source, case_completed: true })
  const resultCase = { case_id: fixture.case_id, subject_category: fixture.subject, hint_level: fixture.level, expected_tutor_action: fixture.expected_action,
    provider_candidate_status: providerStatus, provider_candidate_code: candidateCode, final_source: source,
    bounded_cause_class: fallback ? providerCode ? 'PROVIDER_TECHNICAL_FAILURE' : 'SAFETY_CANDIDATE_REJECTION' : null,
    bounded_cause_code: fallback ? candidateCode : null, final_gate_results: gates, raw_provider_response_retained: false,
    rejected_provider_candidate_retained: false, final_learner_message_retained: false }
  return { facts, resultCase, output: checked?.passed ? { synthetic_case_ref: fixture.case_id, subject_category: fixture.subject,
    hint_level: fixture.level, expected_tutor_action: fixture.expected_action, learner_message: checked.value.learner_message,
    final_gate_pass_proof: { canonical_safety_contract_version: manifest.canonical_safety_contract_version,
      gates: gates.map(g => ({ gate: g.gate, status: g.state })) } } : null }
}
async function settle(s) {
  const p = permissions.get(s.permission)
  if (!p?.consumed || !s.pendingFacts) throw paidBlocked('EXECUTION_DRIFT')
  const v = await inspectLive(s)
  if (v.issues.length) throw paidBlocked('DIGEST_MISMATCH')
  if (v.head !== p.prepared.sha256) throw paidBlocked('DIGEST_MISMATCH')
  const facts = s.pendingFacts
  await append(s, v, 'CASE_SETTLED', { case_ordinal: p.prepared.value.case_ordinal, case_id: p.prepared.value.case_id,
    prepared_sha256: p.prepared.sha256, facts })
  s.permission = null; s.pendingFacts = null
  if (facts.final_outcome_status === 'FINAL_OUTCOME_FAIL' || facts.known_input_tokens > 40000 || facts.known_output_tokens > 160) {
    s.halted = true; s.outputs.clear()
  }
  return facts
}
function buildResult(s) {
  const failures = s.caseResults.filter(c => c.final_source === 'FINAL_OUTCOME_FAIL').length
  return verifyTutorReviewCapableResultV5({ result_contract_version: manifest.result_contract_version, evaluator_version: manifest.evaluator_version,
    evaluation_manifest_version: manifest.eval_manifest_version, source_run_id: s.runId, evaluation_scope_fingerprint: manifest.scope_fingerprint,
    fixture_set_version: manifest.fixture_set_version, fixture_set_sha256: manifest.fixture_set_hash, fixture_count: 120, repetitions: 1,
    fixtures_completed: s.caseResults.length, coverage_complete: s.caseResults.length === 120, final_outcome_fail_count: failures,
    system_safety_pass: s.caseResults.length === 120 && failures === 0, cases: s.caseResults,
    raw_prompt_retained: false, raw_provider_response_retained: false, raw_provider_error_retained: false,
    rejected_provider_candidate_retained: false, learner_answer_retained: false, final_learner_messages_retained: false,
    approval_effect: 'NONE', runtime_approval_effect: 'NONE', production_approval_effect: 'NONE', learning_authority: 'NONE',
    evidence_effect: 'NONE', learning_truth_mutations: 0 })
}
async function complete(s) {
  try {
    s.operationCase = null
    let v = await inspectLive(s)
    if (v.issues.some(i => i.layer === 'EXECUTION_PREFIX')) throw paidBlocked('DIGEST_MISMATCH')
    if (v.checkpoints.length !== 240 || v.accounting.completed_case_count !== 120 || s.caseResults.length !== 120) throw paidBlocked('EXECUTION_DRIFT')
    const result = buildResult(s), bytes = jcsUtf8Bytes(result), resultHash = paidFileHash(bytes)
    await append(s, v, 'RESULT_PREPARED', { result_ref: s.repository.refs.result, result_sha256: resultHash })
    await s.repository.writeBytes(s.repository.refs.result, bytes)
    v = await inspectLive(s)
    await append(s, v, 'RESULT_VERIFIED', { result_ref: s.repository.refs.result, result_sha256: resultHash })
    if (!result.system_safety_pass) return
    s.operationPhase = 'REVIEW_MATERIAL'
    const input = samplingInput(result, resultHash), sample = buildTutorHumanReviewSampleManifest(input)
    const selected = sample.selected_cases.map(c => s.outputs.get(c.case_id))
    if (selected.some(x => !x)) throw paidBlocked('REVIEW_MATERIAL_UNAVAILABLE')
    const created = now()
    const packet = buildTutorHumanReviewPacket({ source: { source_run_id: s.runId, source_result_sha256: resultHash,
      source_evaluation_manifest_version: manifest.eval_manifest_version, source_evaluator_version: manifest.evaluator_version,
      source_result_contract_version: manifest.result_contract_version, fixture_set_version: manifest.fixture_set_version,
      fixture_set_sha256: manifest.fixture_set_hash, fixtures_expected: 120, fixtures_completed: 120, coverage_complete: true,
      final_outcome_fail_count: 0, system_safety_pass: true, source_result_persisted: true, source_result_hash_verified: true },
      source_result_bytes: bytes, sample_manifest: sample, sampling_input: input, selected_final_outputs: selected, packet_created_at: created })
    const sampleBytes = jcsUtf8Bytes(sample), packetBytes = jcsUtf8Bytes(packet)
    const bindings = { result_ref: s.repository.refs.result, result_sha256: resultHash, sample_ref: s.repository.refs.sample,
      sample_sha256: paidFileHash(sampleBytes), packet_ref: s.repository.refs.packet, packet_sha256: paidFileHash(packetBytes) }
    v = await inspectLive(s)
    await append(s, v, 'REVIEW_MATERIAL_PREPARED', { ...bindings, review_material_eligible: true, attempt_committed: true, packet_created_at: created })
    let failure = null
    try { await s.repository.writeBytes(s.repository.refs.sample, sampleBytes); await s.repository.writeBytes(s.repository.refs.packet, packetBytes) }
    catch (e) { failure = ['ARTIFACT_WRITE_FAILURE', 'ARTIFACT_READBACK_FAILURE', 'DIGEST_MISMATCH'].includes(e.reason_code) ? e.reason_code : 'ARTIFACT_WRITE_FAILURE' }
    // Use the verified prepared prefix even if a material file is torn. Its bounded failure settlement stores no payload.
    const mp = await s.repository.read(`${s.repository.refs.checkpoints}/review-material.prepared.json`)
    const beforeSettlement = { checkpoints: Array(243), head: mp.sha256 }
    await append(s, beforeSettlement, 'REVIEW_MATERIAL_SETTLED', { ...bindings,
      material_state: failure ? 'BLOCKED' : 'REVIEW_MATERIAL_READY', failure_cause: failure })
    if (failure) s.halted = true
  } finally { s.outputs.clear(); s.caseResults.length = 0; s.pendingFacts = null }
}

function evidenceLayers(v) {
  return { claim_state: 'CONSUMED_VERIFIED', execution_prefix_state: v.issues.some(i => i.layer === 'EXECUTION_PREFIX') ? 'BLOCKED_VALID_PREFIX' : 'VERIFIED',
    accounting_state: v.issues.some(i => i.layer === 'EXECUTION_PREFIX') ? 'VERIFIED_PREFIX_ONLY' : 'VERIFIED',
    result_state: v.result ? 'PERSISTED_VERIFIED' : v.issues.some(i => i.layer === 'RESULT') ? 'INVALID' : 'ABSENT',
    review_material_state: v.materialReady ? 'REVIEW_MATERIAL_READY' : 'BLOCKED',
    blocking_integrity_state: v.issues.length ? 'BLOCKED' : 'CLEAR', integrity_failures: v.issues,
    system_safety_pass: v.result?.value.system_safety_pass ?? null, replay_allowed: false, resume_allowed: false }
}
function terminalBody(view, refs, mode, proof, evidence) {
  let v = view
  const failure = evidence.failure
  if (failure && (failure.claim_sha256 !== view.claim.sha256
    || (failure.prefix.checkpoint_count ? view.checkpoints[failure.prefix.checkpoint_count - 1]?.sha256 : view.claim.sha256) !== failure.prefix.head)) throw paidBlocked('AUTHORIZATION_INVALID')
  // Only independently held live-operation evidence can prove an intent never invoked.
  if (failure?.uninvoked_intent && view.cases.at(-1)?.settled_ref === null
    && view.cases.at(-1)?.case_id === failure.case_id) {
    const cases = structuredClone(view.cases)
    cases.at(-1).facts = { transport_started: false, transport_outcome: 'NOT_STARTED', usage_status: 'NOT_APPLICABLE',
      known_input_tokens: 0, known_output_tokens: 0, known_total_tokens: 0, known_actual_cost_usd_micros: 0,
      unknown_reservation_applied: false, provider_technical_cause: null, fallback_used: false,
      final_outcome_status: 'NOT_COMPLETED', case_completed: false }
    v = { ...view, cases, accounting: derivePaidAccounting(cases) }
  }
  const complete = v.accounting.completed_case_count === 120
  const failureCase = v.cases.find(c => c.facts.final_outcome_status === 'FINAL_OUTCOME_FAIL')
  const breach = paidPerCallBreach(v.cases)
  const materialFailure = v.checkpoints[243]?.value.failure_cause
  const cause = failure?.cause || (failureCase ? 'FINAL_FALLBACK_SAFETY_FAILURE' : breach ? 'TOKEN_LIMIT' : materialFailure
    || (complete && v.result && (!v.eligible || v.materialReady) ? 'COMPLETED' : 'PROCESS_FAILURE'))
  const phase = failure?.phase || (failureCase ? 'FINAL_GATES' : breach ? 'CASE_CHECKPOINT' : materialFailure ? 'REVIEW_MATERIAL'
    : cause === 'COMPLETED' ? 'FINAL_RECORD' : mode === 'POST_FAILURE_RECONCILIATION' ? 'RECONCILIATION' : 'FINAL_RECORD')
  return { ...checkpointBinding(v.claim), ...PAID_GOVERNANCE, artifact_kind: 'TERMINAL_RECORD', record_state: 'TERMINAL',
    terminalization_mode: mode, reconciliation_authority: proof,
    execution_completion: complete ? 'COMPLETE' : v.accounting.possibly_started_transport_count ? 'PARTIAL' : 'NOT_STARTED',
    evaluation_state: complete ? 'EVALUATION_COMPLETE' : 'INCOMPLETE', result_state: v.result ? 'PERSISTED_VERIFIED' : complete ? 'BLOCKED' : 'NOT_ELIGIBLE',
    review_material_eligible: v.eligible, review_material_attempted: Boolean(v.checkpoints[242]),
    review_material_state: !v.eligible ? 'NOT_ELIGIBLE' : v.materialReady ? 'REVIEW_MATERIAL_READY' : 'BLOCKED',
    terminal_cause: cause, terminal_phase: phase, terminal_case_id: failure?.case_id || (failureCase || breach)?.case_id || null, secondary_failure_cause: null,
    checkpoint_count: v.checkpoints.length, checkpoint_head: v.head, case_accounting: v.cases, accounting: v.accounting,
    result_ref: v.result?.ref || null, result_sha256: v.result?.sha256 || null,
    sample_ref: v.sample?.ref || null, sample_sha256: v.sample?.sha256 || null, packet_ref: v.packet?.ref || null, packet_sha256: v.packet?.sha256 || null,
    terminalized_at: evidence.terminalized_at }
}
function finalization(v, refs, mode, proof, failure = null) {
  const evidence = deepFreeze({ mode, proof: proof ? structuredClone(proof) : null, failure,
    terminalized_at: now(), claim_sha256: v.claim.sha256 })
  const value = sealPaidArtifact(terminalBody(v, refs, mode, evidence.proof, evidence))
  // Independent trusted process evidence, never populated by reading the terminal file.
  v.a.finalizations.set(paidFileHash(jcsUtf8Bytes(value)), { evidence, value })
  return value
}
function validateTerminal(v, refs, terminal) {
  const witness = v.a.finalizations.get(terminal.sha256)
  if (!witness || witness.evidence.claim_sha256 !== v.claim.sha256) throw paidBlocked('AUTHORIZATION_INVALID')
  const e = witness.evidence, time = e.terminalized_at
  if (time > now() || time < v.lastTimestamp || (e.failure && time < e.failure.occurred_at)
    || (v.checkpoints[242] && time < v.checkpoints[242].value.packet_created_at)) throw paidBlocked('AUTHORIZATION_INVALID')
  if (e.mode === 'LIVE_OWNER') {
    if (e.proof !== null || terminal.value.reconciliation_authority !== null) throw paidBlocked('AUTHORIZATION_INVALID')
  } else {
    const p = v.a.reconciliationWitnesses.get(v.claim.value.execution_owner_ref)
    if (!p || !v.a.stoppedOwners.has(p.owner) || !isDeepStrictEqual(p.value, e.proof)
      || p.value.verified_at > time || p.value.verified_at < v.lastTimestamp
      || !isDeepStrictEqual(terminal.value.reconciliation_authority, p.value)) throw paidBlocked('AUTHORIZATION_INVALID')
  }
  if (!isDeepStrictEqual(terminal.value, witness.value)
    || !isDeepStrictEqual(sealPaidArtifact(terminalBody(v, refs, e.mode, e.proof, e)), terminal.value)) throw paidBlocked('DIGEST_MISMATCH')
}
async function finalizeLive(s) {
  const v = await inspectLive(s)
  if (v.issues.some(i => i.layer === 'EXECUTION_PREFIX')) throw paidBlocked('DIGEST_MISMATCH')
  if (!s.failure && v.accounting.completed_case_count !== 120 && !v.cases.some(c => c.facts.final_outcome_status === 'FINAL_OUTCOME_FAIL'
    || c.facts.known_input_tokens > 40000 || c.facts.known_output_tokens > 160)) throw paidBlocked('EXECUTION_DRIFT')
  const result = await s.repository.write(s.repository.refs.execution, finalization(v, s.repository.refs, 'LIVE_OWNER', null, s.failure))
  s.dead = true; s.outputs.clear(); s.caseResults.length = 0; return result.value
}
export async function reconcilePaidExecution(args) {
  exactInput(args, ['repositoryRoot', 'runId', 'authority', 'reconciliationAuthority', 'commit'])
  if (typeof args.commit !== 'boolean') throw paidBlocked()
  const a = trusted(args.authority, args.runId)
  if (path.resolve(args.repositoryRoot) !== path.resolve(a.repositoryRoot)) throw paidBlocked()
  const repository = createPaidRepository({ repositoryRoot: args.repositoryRoot, runId: args.runId, faultCapability: a.faultCapability })
  const v = await inspect(repository, args.authority, args.runId)
  const layer = await terminalLayer(v, repository)
  if (!args.commit) return deepFreeze({ ...paidProjection(v, layer), status: 'PROVISIONAL', material_ready: v.materialReady })
  if (layer.state === 'BLOCKED_INVALID') throw paidBlocked(layer.reason)
  if (layer.artifact) return layer.artifact.value
  const p = reconciliationProofs.get(args.reconciliationAuthority)
  if (!p || p.cap !== args.authority || p.owner !== v.claim.value.execution_owner_ref || !a.stoppedOwners.has(p.owner)) throw paidBlocked('OPERATIONS_NOT_READY')
  if (v.issues.some(i => i.layer === 'EXECUTION_PREFIX') || p.value.verified_at > now() || p.value.verified_at < v.lastTimestamp) throw paidBlocked('OPERATIONS_NOT_READY')
  return (await repository.write(repository.refs.execution, finalization(v, repository.refs, 'POST_FAILURE_RECONCILIATION', p.value))).value
}
