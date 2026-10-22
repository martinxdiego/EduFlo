import { requireStudent } from '../auth/learning-authorization.js'
import { LearningV2Error, validationError } from '../contracts/errors.js'
import { generateDomainId } from '../contracts/ids.js'
import {
  PHASE_3_SCHEMA_VERSION, TUTOR_ACTION_BY_LEVEL, TUTOR_EVIDENCE_POLICY_VERSION,
  TUTOR_FALLBACK_REGISTRY_VERSION, TUTOR_SESSION_SCHEMA_VERSION,
  startTutorSessionRequestSchema, tutorHintRequestSchema, tutorRetryRequestSchema, tutorSessionDocumentSchema,
} from '../contracts/phase3.js'
import {
  PHASE_3B_SCHEMA_VERSION,
  REFLECTION_LOCALE,
  REFLECTION_PROMPT_ID,
  REFLECTION_PROMPT_VERSION,
  REFLECTION_TYPE,
  reflectionCharacterCount,
  reflectionSubmissionRequestSchema,
  reflectionWordCount,
} from '../contracts/phase3b.js'
import { isLearningV2Phase3bDevelopmentEnabled } from '../feature-flags/learning-v2.js'
import { identifyMistakeReflectionPrompt, reflectionPrompt } from '../reflection/prompt-registry.js'
import { localTutorFallback } from './fallback-registry.js'
import { resolveTutorPolicy } from './policy.js'
import { buildTutorProviderContext, providerContextContainsForbiddenKey } from './provider-context.js'
import { validateTutorCandidate } from './output-validator.js'
import { boundedIdempotencyKey, stableInputHash } from '../idempotency.js'
import { worksheetQuestionContentHash, WORKSHEET_QUESTION_HASH_VERSION } from '../../worksheet-question-identity.js'
import { canonicalTutorRetry } from '../attempts/attempt-service.js'
import { CurrentTutorInteractionAuthority } from './current-interaction-authority.js'
import { studentTutorSessionDto } from './student-tutor-dto.js'
import { safeTutorTelemetry } from './safe-telemetry.js'
import { TUTOR_RUNTIME_APPROVAL_CONTRACT } from './governance/runtime-approval.js'
import { TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION } from './canonical-safety-gates.js'

function parse(schema, value) {
  const result = schema.safeParse(value)
  if (!result.success) throw validationError(result.error)
  return result.data
}
function providerFailureCode(error) {
  if (error?.name === 'AbortError' || /abort|timed?\s*out|timeout/i.test(`${error?.name || ''} ${error?.message || ''}`)) return 'PROVIDER_TIMEOUT'
  return /oversized/i.test(String(error?.message || '')) ? 'CONTEXT_OVERSIZE' : 'PROVIDER_ERROR'
}

export class TutorService {
  constructor(db, dependencies, options = {}) {
    this.db = db
    Object.assign(this, dependencies)
    this.generateId = options.generateId || generateDomainId
    this.now = options.now || (() => new Date())
    this.interactionAuthority = options.interactionAuthority || new CurrentTutorInteractionAuthority(db, { now: this.now })
    this.phase3bEnabled = options.phase3bEnabled ?? isLearningV2Phase3bDevelopmentEnabled(options.environment || process.env)
    this.providerLeaseMs = Math.min(Math.max(Number(options.providerLeaseMs) || 20_000, 25), 60_000)
    this.providerLoserWaitMs = Math.min(Math.max(Number(options.providerLoserWaitMs) || 250, 25), 1_000)
    this.afterProviderSlotReserved = options.afterProviderSlotReserved
    this.localTutorFallback = options.localTutorFallback || localTutorFallback
  }

  providerRuntimeConfiguration() {
    if (this.runtimeApprovalGate?.configuration) return this.runtimeApprovalGate.configuration()
    return {
      provider: TUTOR_RUNTIME_APPROVAL_CONTRACT.provider_id,
      model: TUTOR_RUNTIME_APPROVAL_CONTRACT.model_id,
      prompt_version: TUTOR_RUNTIME_APPROVAL_CONTRACT.prompt_version,
      structured_output_schema_version: TUTOR_RUNTIME_APPROVAL_CONTRACT.structured_output_schema_version,
      approval_ref: TUTOR_RUNTIME_APPROVAL_CONTRACT.approval_ref,
    }
  }

  async waitForHintReceipt(actor, sessionId, level) {
    const deadline = Date.now() + this.providerLoserWaitMs
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      const current = await this.sessionRepository.findForStudent(actor, sessionId)
      const receipt = current?.hint_receipts?.find((item) => item.hint_level === level)
      if (receipt) return { session: current, receipt }
      const slot = current?.provider_slots?.[`level_${level}`]
      if (!slot || slot.status === 'completed') break
    }
    return null
  }

  async recordEvent(actor, session, sequence, type, payload = {}, options = {}) {
    return this.events.record(actor, {
      type, aggregate: { type: 'tutor_session', id: session.session_id }, sequence,
      correlationId: session.session_id, causationId: options.causationId ?? session.trigger_attempt_id,
      occurredAt: options.occurredAt || this.now(), actorKind: options.actorKind || actor.actor_type, actorId: options.actorId || actor.actor_id,
      eventId: options.eventId, idempotencyParts: options.idempotencyParts,
      payloadConflict: options.payloadConflict,
      payload,
    })
  }

  reflectionContextPayload(actor, session, context, trigger) {
    return {
      schema_version: PHASE_3B_SCHEMA_VERSION,
      student_id: actor.student_id,
      session_id: session.session_id,
      task_ref: {
        task_id: session.task_ref.task_id,
        version: session.task_ref.version,
        source_hash: context.pin.content_hash,
        hash_version: context.pin.hash_version,
      },
      objective_ref: structuredClone(session.objective_ref),
      primary_competency_ref: structuredClone(trigger.primary_competency_ref),
    }
  }

  async recordReflectionRequest(actor, session, context, trigger, finalAttempt) {
    const prompt = identifyMistakeReflectionPrompt()
    return this.recordEvent(actor, session, session.last_sequence, 'REFLECTION_REQUESTED', {
      ...this.reflectionContextPayload(actor, session, context, trigger),
      cause: { code: 'supported_correction', final_attempt_id: finalAttempt.attempt_id, support_level: session.reflection.support_level },
      reflection: {
        type: prompt.type,
        prompt_id: prompt.prompt_id,
        prompt_version: prompt.prompt_version,
        locale: prompt.locale,
        prompt_text: prompt.text,
      },
    }, {
      eventId: session.reflection.request_event_id,
      causationId: finalAttempt.attempt_id,
      actorKind: 'system',
      actorId: 'reflection-service',
      occurredAt: session.reflection.requested_at,
      idempotencyParts: [
        'reflection-request-v1', actor.tenant_id, session.session_id, finalAttempt.attempt_id,
        prompt.prompt_id, prompt.prompt_version,
      ],
    })
  }

  async ensureReflectionRequestEvent(actor, session, context) {
    if (!session.reflection || session.reflection.status === 'not_required') return null
    const events = await this.events.listForAggregate(actor, 'tutor_session', session.session_id)
    const existing = events.find((item) => item.event_id === session.reflection.request_event_id)
    if (existing) return existing
    const [trigger, finalAttempt] = await Promise.all([
      this.attemptRepository.findById(actor, session.trigger_attempt_id),
      this.attemptRepository.findById(actor, session.reflection.final_attempt_id),
    ])
    if (!trigger || !finalAttempt) throw new LearningV2Error('NOT_FOUND')
    return this.recordReflectionRequest(actor, session, context, trigger, finalAttempt)
  }

  async reflectionSubmissionEvent(actor, session) {
    if (!session.reflection || session.reflection.status !== 'submitted') return null
    const events = await this.events.listForAggregate(actor, 'tutor_session', session.session_id)
    return events.find((item) => item.event_id === session.reflection.submission_event_id) || null
  }

  async studentDto(actor, session) {
    await this.repairSessionAudit(actor, session)
    if (!session.reflection || session.reflection.status === 'not_required') return studentTutorSessionDto(session)
    const prompt = reflectionPrompt(session.reflection.prompt_id, session.reflection.prompt_version)
    if (!prompt) throw new LearningV2Error('NOT_FOUND')
    const presentation = {
      promptText: prompt.text,
      locale: prompt.locale,
      maximumResponseCharacters: prompt.maximum_response_characters,
      maximumResponseWords: prompt.maximum_response_words,
    }
    if (session.reflection.status === 'submitted') {
      const submitted = await this.reflectionSubmissionEvent(actor, session)
      if (!submitted) throw new LearningV2Error('CONFLICT')
      presentation.responseText = submitted.payload?.reflection?.response_text
    }
    return studentTutorSessionDto(session, { reflection: presentation })
  }

  async repairSessionAudit(actor, session) {
    await this.recordEvent(actor, session, 1, 'TUTOR_SESSION_STARTED', {
      policy_id: session.policy_ref.policy_id, policy_version: session.policy_ref.version, preset: session.preset,
      task_id: session.task_ref.task_id, task_version: session.task_ref.version,
      model: session.model_config.model, prompt_version: session.model_config.prompt_version,
      fallback_registry_version: session.fallback_registry_version, evidence_policy_version: session.evidence_policy_version,
    }, { occurredAt: session.started_at })
    for (const receipt of session.hint_receipts || []) {
      const {
        hint_level: level, first_sequence: first, response, source, fallback_code: fallback,
        candidate_source: candidateSource, candidate_gate_result: candidateGateResult,
        safety_gate_contract_version: safetyContractVersion,
      } = receipt
      const options = { occurredAt: receipt.occurred_at }
      await this.recordEvent(actor, session, first, 'HINT_REQUESTED', { hint_level: level }, options)
      await this.recordEvent(actor, session, first + 1, 'TUTOR_DECIDED', { hint_level: level, action: TUTOR_ACTION_BY_LEVEL[level], reason_code: response.reason_code }, options)
      if (fallback) await this.recordEvent(actor, session, first + 2, 'TUTOR_FALLBACK', {
        hint_level: level, code: fallback, fallback_registry_version: session.fallback_registry_version,
        candidate_source: candidateSource || null, candidate_gate_result: candidateGateResult || 'NOT_EVALUATED',
        final_source: source, safety_gate_contract_version: safetyContractVersion || TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
      }, options)
      await this.recordEvent(actor, session, first + (fallback ? 3 : 2), 'HINT_GIVEN', {
        hint_level: level, action: response.action, learner_message: response.learner_message, source,
        final_source: source, safety_gate_contract_version: safetyContractVersion || TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
        provider: source === 'openai' ? session.model_config.provider : 'local', model: source === 'openai' ? session.model_config.model : null,
        prompt_version: session.model_config.prompt_version, policy_id: session.policy_ref.policy_id,
        policy_version: session.policy_ref.version, fallback_registry_version: session.fallback_registry_version,
      }, options)
    }
    for (const receipt of session.retry_receipts || []) await this.recordEvent(actor, session, receipt.first_sequence, 'RETRY_SUBMITTED', {
      hint_level: receipt.hint_level, attempt_id: receipt.attempt_id, correctness: receipt.response.correctness,
    }, { occurredAt: receipt.occurred_at })
    if (session.reflection && session.reflection.status !== 'not_required') {
      // Historical audit repair uses immutable Attempt pins, not renewed current
      // delivery authority. It cannot create new pedagogical interaction.
      const trigger = await this.attemptRepository.findById(actor, session.trigger_attempt_id)
      const finalAttempt = await this.attemptRepository.findById(actor, session.reflection.final_attempt_id)
      if (!trigger || !finalAttempt) throw new LearningV2Error('CONFLICT')
      const sequence = session.retry_receipts?.find((item) => item.attempt_id === finalAttempt.attempt_id)?.first_sequence
      const requestSession = { ...session, last_sequence: sequence === undefined ? session.last_sequence : sequence + 1 }
      await this.ensureReflectionRequestEvent(actor, requestSession, { pin: trigger.source })
    }
    if (session.completion_receipt) {
      const receipt = session.completion_receipt
      await this.recordEvent(actor, session, receipt.sequence, 'TUTOR_SESSION_COMPLETED', receipt.payload,
        { ...receipt.options, occurredAt: receipt.occurred_at })
    }
  }

  async finishSubmittedReflection(actor, session, submissionEvent) {
    let current = session
    const submittedAt = submissionEvent.occurred_at instanceof Date ? submissionEvent.occurred_at : new Date(submissionEvent.occurred_at)
    const completionSequence = submissionEvent.sequence + 1
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (current.reflection?.status === 'submitted') break
      const baseReflection = current.reflection
      if (!baseReflection || baseReflection.status === 'not_required') throw new LearningV2Error('CONFLICT')
      try {
        current = await this.sessionRepository.transition(actor, current, {
          status: 'completed', phase: 'closed', outcome: 'correct_after_hint', completed_at: submittedAt,
          reflection: {
            ...baseReflection,
            status: 'submitted',
            submission_event_id: submissionEvent.event_id,
            submitted_at: submittedAt,
          },
          last_sequence: completionSequence,
          completion_receipt: { sequence: completionSequence, occurred_at: submittedAt, payload: {
            outcome: 'correct_after_hint', retry_count: current.retry_count, hint_count: current.hint_count,
            reflection_status: 'submitted', reflection_submission_event_id: submissionEvent.event_id,
          }, options: { causationId: submissionEvent.event_id, actorKind: 'system', actorId: 'reflection-service',
            idempotencyParts: ['tutor-complete-reflection-v1', actor.tenant_id, current.session_id, submissionEvent.event_id] } },
          updated_at: this.now(), last_activity_at: this.now(),
        })
        break
      } catch (error) {
        current = await this.sessionRepository.findForStudent(actor, session.session_id)
        if (!current) throw error
        if (current.reflection?.status === 'submitted') break
        if (attempt === 3) throw error
      }
    }
    await this.recordEvent(actor, current, completionSequence, 'TUTOR_SESSION_COMPLETED', {
      outcome: 'correct_after_hint',
      retry_count: current.retry_count,
      hint_count: current.hint_count,
      reflection_status: 'submitted',
      reflection_submission_event_id: submissionEvent.event_id,
    }, {
      causationId: submissionEvent.event_id,
      actorKind: 'system',
      actorId: 'reflection-service',
      idempotencyParts: ['tutor-complete-reflection-v1', actor.tenant_id, current.session_id, submissionEvent.event_id],
    })
    return current
  }

  async expireReflection(actor, session) {
    const existingEvents = await this.events.listForAggregate(actor, 'tutor_session', session.session_id)
    const submitted = existingEvents.find((item) => item.type === 'REFLECTION_SUBMITTED')
    if (submitted) return this.finishSubmittedReflection(actor, session, submitted)
    const sequence = session.last_sequence + 1
    let current
    try {
      current = await this.sessionRepository.transition(actor, session, {
        status: 'completed', phase: 'closed', outcome: 'correct_after_hint', completed_at: this.now(),
        reflection: { ...session.reflection, status: 'expired_unsubmitted' },
        completion_receipt: { sequence, occurred_at: this.now(), payload: { outcome: 'correct_after_hint',
          retry_count: session.retry_count, hint_count: session.hint_count, reflection_status: 'expired_unsubmitted' },
          options: { causationId: session.reflection.request_event_id, actorKind: 'system', actorId: 'reflection-service',
            idempotencyParts: ['tutor-complete-reflection-expired-v1', actor.tenant_id, session.session_id, session.reflection.request_event_id] } },
        updated_at: this.now(), last_activity_at: this.now(), last_sequence: sequence,
      })
    } catch (error) {
      const canonical = await this.sessionRepository.findForStudent(actor, session.session_id)
      if (canonical?.reflection?.status === 'submitted') return canonical
      if (canonical?.reflection?.status === 'expired_unsubmitted') return canonical
      throw error
    }
    try {
      await this.recordEvent(actor, current, sequence, 'TUTOR_SESSION_COMPLETED', {
        outcome: 'correct_after_hint',
        retry_count: current.retry_count,
        hint_count: current.hint_count,
        reflection_status: 'expired_unsubmitted',
      }, {
        causationId: current.reflection.request_event_id,
        actorKind: 'system',
        actorId: 'reflection-service',
        idempotencyParts: ['tutor-complete-reflection-expired-v1', actor.tenant_id, current.session_id, current.reflection.request_event_id],
      })
    } catch (error) {
      if (error?.code !== 11000 && error?.code !== 'CONFLICT') throw error
      const winner = await this.events.findForAggregateSequence(actor, 'tutor_session', current.session_id, sequence)
      if (winner?.type !== 'REFLECTION_SUBMITTED') throw error
      current = await this.finishSubmittedReflection(actor, current, winner)
    }
    return current
  }

  async ensureFresh(actor, session) {
    if (new Date(session.expires_at) > this.now()) return session
    if (session.status === 'active') {
      if (session.phase === 'awaiting_reflection' && session.reflection?.status === 'awaiting_submission') {
        await this.expireReflection(actor, session)
        throw new LearningV2Error('CONFLICT')
      }
      session = await this.sessionRepository.transition(actor, session, {
        status: 'completed', phase: 'closed', outcome: 'pending', completed_at: this.now(),
        updated_at: this.now(), last_activity_at: this.now(), last_sequence: session.last_sequence + 1,
        completion_receipt: { sequence: session.last_sequence + 1, occurred_at: this.now(), payload: { outcome: 'expired' } },
      })
      await this.recordEvent(actor, session, session.last_sequence, 'TUTOR_SESSION_COMPLETED', { outcome: 'expired' })
    }
    throw new LearningV2Error('CONFLICT')
  }

  async taskContext(actor, session) {
    return this.interactionAuthority.read(actor, session)
  }

  async start(actor, rawInput) {
    requireStudent(actor)
    const input = parse(startTutorSessionRequestSchema, rawInput)
    const attempts = await this.attemptRepository.findBySubmission(actor, input.submission_id)
    const trigger = attempts.find((item) => item.student_id === actor.student_id && item.source.question_index === input.question_index)
    if (!trigger || trigger.outcome.correctness !== 'incorrect' || trigger.source.kind !== 'legacy_submission_question') throw new LearningV2Error('NOT_FOUND')
    const active = await this.sessionRepository.findActiveForSlot(actor, trigger.source.assignment_id, trigger.task_ref)
    if (active && new Date(active.expires_at) <= this.now()) {
      try { await this.ensureFresh(actor, active) } catch (error) { if (error.code !== 'CONFLICT') throw error }
    }
    return this.interactionAuthority.run(actor, { assignment_id: trigger.source.assignment_id, task_ref: trigger.task_ref,
      trigger_attempt_id: trigger.attempt_id }, () => this.startEligible(actor, trigger))
  }

  async startEligible(actor, trigger) {
    const assignment = await this.db.collection('assignments').findOne({ id: trigger.source.assignment_id, 'learning_v2.enabled': true, 'learning_v2.tenant_id': actor.tenant_id })
    if (!assignment) throw new LearningV2Error('NOT_FOUND')
    const triggerPin = assignment.learning_v2.task_pins?.find((pin) => pin.task_id === trigger.task_ref.task_id
      && pin.task_version === trigger.task_ref.version && pin.question_id === trigger.source.question_id)
    if (!triggerPin || triggerPin.content_hash !== trigger.source.content_hash || triggerPin.hash_version !== trigger.source.hash_version) {
      throw new LearningV2Error('NOT_FOUND')
    }
    const [worksheet, pinnedTask] = await Promise.all([
      this.db.collection('worksheets').findOne({ id: triggerPin.worksheet_id }),
      this.db.collection('learning_tasks').findOne({
        tenant_id: actor.tenant_id, task_id: triggerPin.task_id, version: triggerPin.task_version, status: 'published',
      }),
    ])
    const pinnedQuestion = worksheet?.content?.questions?.find((item) => item.question_id === triggerPin.question_id)
    if (!pinnedQuestion || worksheetQuestionContentHash(pinnedQuestion) !== triggerPin.content_hash
      || triggerPin.hash_version !== WORKSHEET_QUESTION_HASH_VERSION
      || pinnedTask?.source?.worksheet_id !== triggerPin.worksheet_id
      || pinnedTask?.source?.question_id !== triggerPin.question_id
      || pinnedTask?.source?.content_hash !== triggerPin.content_hash
      || pinnedTask?.source?.hash_version !== triggerPin.hash_version) {
      throw new LearningV2Error('NOT_FOUND')
    }
    let resolved
    const configuredRef = assignment.learning_v2?.tutor_policy_ref
    if (configuredRef) {
      const configured = await this.policyRepository.findVersion(actor, configuredRef.policy_id, configuredRef.version)
      if (!configured || configured.content_hash !== configuredRef.content_hash) throw new LearningV2Error('NOT_FOUND')
      resolved = resolveTutorPolicy(assignment, configured.requested_preset)
    } else resolved = resolveTutorPolicy(assignment, assignment.learning_v2?.tutor_preset)
    const policy = await this.policyRepository.createSnapshot(actor, assignment.id, resolved, 'learning-v2')
    if (policy.effective_preset === 'TUTOR_OFF') throw new LearningV2Error('NOT_FOUND')
    const now = this.now()
    const proposed = tutorSessionDocumentSchema.parse({
      session_id: this.generateId('ses'), schema_version: TUTOR_SESSION_SCHEMA_VERSION,
      tenant_id: actor.tenant_id, student_id: actor.student_id, assignment_id: assignment.id,
      assignment_revision: assignment.learning_v2_revision || 0,
      task_ref: structuredClone(trigger.task_ref), objective_ref: structuredClone(trigger.objective_ref), trigger_attempt_id: trigger.attempt_id,
      start_key: boundedIdempotencyKey('tutor-session-v1', [actor.tenant_id, actor.student_id, assignment.id, trigger.task_ref.task_id, trigger.task_ref.version, trigger.attempt_id]),
      policy_ref: { policy_id: policy.policy_id, version: policy.policy_version, content_hash: policy.content_hash }, preset: policy.effective_preset,
      model_config: this.providerRuntimeConfiguration(),
      fallback_registry_version: TUTOR_FALLBACK_REGISTRY_VERSION, evidence_policy_version: TUTOR_EVIDENCE_POLICY_VERSION,
      status: 'active', phase: 'awaiting_hint', highest_hint_level: 0, hint_count: 0, retry_count: 0,
      state_version: 1, last_sequence: 1, last_hint: null, last_retry: null, outcome: 'pending',
      provider_slots: {},
      ...(this.phase3bEnabled ? { reflection: { status: 'not_required' } } : {}),
      started_at: now, updated_at: now, last_activity_at: now,
      expires_at: new Date(now.getTime() + 30 * 60_000), completed_at: null,
    })
    const session = await this.sessionRepository.insertActive(actor, proposed)
    await this.ensureFresh(actor, session)
    await this.interactionAuthority.read(actor, session)
    if (session.status !== 'active' || session.trigger_attempt_id !== trigger.attempt_id) throw new LearningV2Error('CONFLICT')
    await this.recordEvent(actor, session, 1, 'TUTOR_SESSION_STARTED', {
      policy_id: session.policy_ref.policy_id, policy_version: session.policy_ref.version,
      preset: session.preset, task_id: session.task_ref.task_id, task_version: session.task_ref.version,
      model: session.model_config.model, prompt_version: session.model_config.prompt_version,
      fallback_registry_version: session.fallback_registry_version, evidence_policy_version: session.evidence_policy_version,
    })
    return this.studentDto(actor, session)
  }

  async get(actor, sessionId) {
    requireStudent(actor)
    let session = await this.sessionRepository.findForStudent(actor, sessionId)
    if (!session) throw new LearningV2Error('NOT_FOUND')
    if (session.status === 'active') {
      session = await this.ensureFresh(actor, session)
      await this.interactionAuthority.read(actor, session)
      const context = await this.taskContext(actor, session)
      if (session.phase === 'awaiting_reflection') await this.ensureReflectionRequestEvent(actor, session, context)
    }
    return this.studentDto(actor, session)
  }

  async hint(actor, sessionId, rawInput) {
    requireStudent(actor)
    const session = await this.sessionRepository.findForStudent(actor, sessionId)
    if (!session) throw new LearningV2Error('NOT_FOUND')
    await this.ensureFresh(actor, session)
    return this.interactionAuthority.run(actor, session, () => this.hintEligible(actor, sessionId, rawInput))
  }

  async hintEligible(actor, sessionId, rawInput) {
    requireStudent(actor)
    const input = parse(tutorHintRequestSchema, rawInput)
    let session = await this.sessionRepository.findForStudent(actor, sessionId)
    if (!session) throw new LearningV2Error('NOT_FOUND')
    session = await this.ensureFresh(actor, session)
    const priorHint = (session.hint_receipts || [session.last_hint]).find((item) => item?.idempotency_key === input.idempotency_key)
    if (priorHint) return { session: await this.studentDto(actor, session), hint: priorHint.response }
    if (session.status !== 'active' || session.phase !== 'awaiting_hint' || session.highest_hint_level >= 3) throw new LearningV2Error('CONFLICT')
    const level = session.highest_hint_level + 1
    const context = await this.taskContext(actor, session)
    let response = null
    let source = 'local'
    let fallbackCode = session.preset === 'LOCAL_HINTS' ? 'LOCAL_PRESET' : null
    let callId = null
    let telemetryValues = null
    let ambiguousTransportRecovery = false
    let candidateSource = null
    let candidateGateResult = 'NOT_EVALUATED'
    if (session.preset === 'GUIDED_TUTOR') {
      const reservedAt = this.now()
      callId = this.generateId('pcl')
      const reservation = await this.sessionRepository.reserveProviderSlot(actor, session, level, {
        callId, now: reservedAt, leaseExpiresAt: new Date(reservedAt.getTime() + this.providerLeaseMs),
      })
      session = reservation.session
      if (reservation.state === 'completed') {
        const receipt = session?.hint_receipts?.find((item) => item.hint_level === level)
        if (receipt) return { session: await this.studentDto(actor, session), hint: receipt.response }
        throw new LearningV2Error('CONFLICT')
      }
      if (reservation.state === 'in_progress') {
        const winner = await this.waitForHintReceipt(actor, sessionId, level)
        if (winner) return { session: await this.studentDto(actor, winner.session), hint: winner.receipt.response }
        throw new LearningV2Error('OPERATION_IN_PROGRESS', { retryAfterSeconds: 1 })
      }
      if (reservation.state === 'ambiguous_transport') {
        ambiguousTransportRecovery = true
        fallbackCode = 'AMBIGUOUS_TRANSPORT_LOCAL_FALLBACK'
      } else {
        await this.afterProviderSlotReserved?.({ actor, session, level, callId })
      }
    }
    await this.rateLimiter?.consumeHint(actor)

    let providerAvailable = false
    if (session.preset === 'GUIDED_TUTOR' && !ambiguousTransportRecovery) {
      const approval = this.runtimeApprovalGate?.evaluate?.(session.model_config)
        || { allowed: false, reasonCode: 'PROVIDER_APPROVAL_NOT_APPROVED' }
      if (!approval.allowed) fallbackCode = approval.reasonCode || 'PROVIDER_APPROVAL_NOT_APPROVED'
      else {
        try { providerAvailable = this.provider?.available() === true } catch { providerAvailable = false }
        if (!providerAvailable) fallbackCode = 'PROVIDER_UNAVAILABLE'
      }
    }
    if (session.preset === 'GUIDED_TUTOR' && !ambiguousTransportRecovery && providerAvailable) {
      try {
        const providerContext = buildTutorProviderContext({ task: context.task, question: context.question, level })
        if (providerContextContainsForbiddenKey(providerContext)) throw new Error('Unsafe provider context')
        if (JSON.stringify(providerContext).length > 8_000) throw new Error('Tutor provider context oversized')
        const generated = await this.provider.generate(providerContext, { beforeTransport: async () => {
          const consumeProviderCall = this.rateLimiter?.consumeProviderCall || this.rateLimiter?.allowProvider
          let providerBudgetAvailable = true
          try {
            if (consumeProviderCall) providerBudgetAvailable = await consumeProviderCall.call(this.rateLimiter, actor) !== false
          } catch {
            providerBudgetAvailable = false
            fallbackCode = 'BUDGET_ERROR'
          }
          if (!providerBudgetAvailable) {
            fallbackCode ||= 'BUDGET_EXHAUSTED'
            throw new LearningV2Error('RATE_LIMITED')
          }
          const transportStartedAt = this.now()
          session = await this.sessionRepository.markProviderTransportStarted(actor, session, level, callId, {
            now: transportStartedAt,
            leaseExpiresAt: new Date(transportStartedAt.getTime() + this.providerLeaseMs),
          })
        } })
        const checked = validateTutorCandidate(generated.candidate, { level, correctAnswer: context.question.answer, options: context.question.options })
        candidateSource = 'provider'
        if (!checked.valid) {
          candidateGateResult = 'REJECTED'
          fallbackCode = checked.code
          telemetryValues = { callId, status: 'rejected', validationCode: checked.code, usage: generated.usage, candidateGateResult }
        } else {
          candidateGateResult = 'ACCEPTED'
          response = checked.value; source = 'openai'
          telemetryValues = { callId, status: 'complete', usage: generated.usage, candidateGateResult }
        }
      } catch (error) {
        if (error?.code === 'OPERATION_IN_PROGRESS') throw error
        if (!['BUDGET_EXHAUSTED', 'BUDGET_ERROR'].includes(fallbackCode)) {
          fallbackCode = providerFailureCode(error)
          if (session.provider_slots?.[`level_${level}`]?.status === 'transport_started') {
            candidateSource = 'provider'
            candidateGateResult = 'PROVIDER_FAILURE'
            telemetryValues = { callId, status: 'error', validationCode: fallbackCode, candidateGateResult }
          }
        }
      }
    }
    if (!response) {
      const fallback = this.localTutorFallback(level)
      const checked = validateTutorCandidate(fallback, { level, correctAnswer: context.question.answer, options: context.question.options })
      if (!checked.valid) throw new Error(`Invalid immutable fallback: ${checked.code}`)
      response = checked.value
    }
    const eventCount = fallbackCode ? 4 : 3
    const firstSequence = session.last_sequence + 1
    const lastHint = { idempotency_key: input.idempotency_key, response, source, final_source: source,
      fallback_code: fallbackCode, candidate_source: candidateSource, candidate_gate_result: candidateGateResult,
      safety_gate_contract_version: TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
      hint_level: level, first_sequence: firstSequence, occurred_at: this.now() }
    const transitionSet = {
      phase: 'awaiting_retry', highest_hint_level: level, hint_count: level,
      last_hint: lastHint, last_sequence: session.last_sequence + eventCount, updated_at: this.now(), last_activity_at: this.now(),
      hint_receipts: [...(session.hint_receipts || []), lastHint],
    }
    try {
      if (session.preset === 'GUIDED_TUTOR') {
        const committedAt = this.now()
        if (ambiguousTransportRecovery) {
          session = await this.sessionRepository.recoverAmbiguousTransportWithLocalFallback(
            actor, session, level, transitionSet, committedAt,
          )
        } else {
          const outcomeCode = source === 'openai' ? 'PROVIDER_ACCEPTED' : 'LOCAL_FALLBACK'
          session = await this.sessionRepository.commitHintWithProviderSlot(
            actor, session, level, callId, transitionSet,
            { outcomeCode, errorCode: fallbackCode }, committedAt,
          )
        }
        if (!session) throw new LearningV2Error('OPERATION_IN_PROGRESS', { retryAfterSeconds: 1 })
      } else session = await this.sessionRepository.transition(actor, session, transitionSet)
    } catch (error) {
      const canonical = await this.sessionRepository.findForStudent(actor, sessionId)
      const receipt = canonical?.hint_receipts?.find((item) => item.hint_level === level)
      if (receipt) return { session: await this.studentDto(actor, canonical), hint: receipt.response }
      const slot = canonical?.provider_slots?.[`level_${level}`]
      if (slot && slot.status !== 'completed' && ['CONFLICT', 'OPERATION_IN_PROGRESS'].includes(error?.code)) {
        throw new LearningV2Error('OPERATION_IN_PROGRESS', { retryAfterSeconds: 1 })
      }
      throw error
    }
    if (telemetryValues) await safeTutorTelemetry(this.telemetry, actor, session, { ...telemetryValues, finalSource: source })
    await this.recordEvent(actor, session, firstSequence, 'HINT_REQUESTED', { hint_level: level })
    await this.recordEvent(actor, session, firstSequence + 1, 'TUTOR_DECIDED', { hint_level: level, action: TUTOR_ACTION_BY_LEVEL[level], reason_code: response.reason_code })
    let hintSequence = firstSequence + 2
    if (fallbackCode) {
      await this.recordEvent(actor, session, hintSequence, 'TUTOR_FALLBACK', {
        hint_level: level, code: fallbackCode, fallback_registry_version: session.fallback_registry_version,
        candidate_source: candidateSource, candidate_gate_result: candidateGateResult, final_source: source,
        safety_gate_contract_version: TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
      })
      hintSequence += 1
    }
    await this.recordEvent(actor, session, hintSequence, 'HINT_GIVEN', {
      hint_level: level, action: response.action, learner_message: response.learner_message, source,
      final_source: source, safety_gate_contract_version: TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
      provider: source === 'openai' ? session.model_config.provider : 'local',
      model: source === 'openai' ? session.model_config.model : null,
      prompt_version: session.model_config.prompt_version,
      policy_id: session.policy_ref.policy_id, policy_version: session.policy_ref.version,
      fallback_registry_version: session.fallback_registry_version,
    })
    return { session: await this.studentDto(actor, session), hint: response }
  }

  async retry(actor, sessionId, rawInput) {
    requireStudent(actor)
    const session = await this.sessionRepository.findForStudent(actor, sessionId)
    if (!session) throw new LearningV2Error('NOT_FOUND')
    await this.ensureFresh(actor, session)
    return this.interactionAuthority.run(actor, session, () => this.retryEligible(actor, sessionId, rawInput))
  }

  async retryEligible(actor, sessionId, rawInput) {
    requireStudent(actor)
    const input = parse(tutorRetryRequestSchema, rawInput)
    let session = await this.sessionRepository.findForStudent(actor, sessionId)
    if (!session) throw new LearningV2Error('NOT_FOUND')
    session = await this.ensureFresh(actor, session)
    const priorRetry = (session.retry_receipts || [session.last_retry]).find((item) => item?.idempotency_key === input.idempotency_key)
    if (priorRetry) return { session: await this.studentDto(actor, session), result: priorRetry.response }
    if (session.status !== 'active' || session.phase !== 'awaiting_retry') throw new LearningV2Error('CONFLICT')
    const context = await this.taskContext(actor, session)
    if (!context.question.options.includes(input.selected_response)) throw new LearningV2Error('VALIDATION_ERROR')
    const proposedCorrectness = input.selected_response === context.question.answer
    const trigger = await this.attemptRepository.findById(actor, session.trigger_attempt_id)
    if (!trigger) throw new LearningV2Error('NOT_FOUND')
    const retryAttempt = await this.attempts.recordTutorRetry(actor, {
      session, triggerAttempt: trigger, selectedResponse: input.selected_response,
      isCorrect: proposedCorrectness, hintLevel: session.highest_hint_level,
    })
    // First writer owns the semantic retry slot. A losing request must use the
    // stored fact, including after an earlier request lost its response.
    const { correct: isCorrect } = canonicalTutorRetry(actor, retryAttempt, { session, triggerAttempt: trigger, context })
    let status = 'active'; let phase = 'awaiting_hint'; let outcome = 'pending'; let completedAt = null
    let reflection = session.reflection
    let reflectionRequired = false
    if (isCorrect) {
      await this.evidence.recordTutorOutcome(actor, retryAttempt, { hintLevel: session.highest_hint_level, sessionId: session.session_id })
      await this.projection.rebuild(actor, actor.student_id, trigger.primary_competency_ref, session.session_id)
      outcome = 'correct_after_hint'
      reflectionRequired = this.phase3bEnabled && [2, 3].includes(session.highest_hint_level)
      if (reflectionRequired) {
        const prompt = identifyMistakeReflectionPrompt()
        status = 'active'; phase = 'awaiting_reflection'; completedAt = null
        reflection = {
          status: 'awaiting_submission',
          type: REFLECTION_TYPE,
          prompt_id: prompt.prompt_id,
          prompt_version: prompt.prompt_version,
          cause: 'supported_correction',
          support_level: session.highest_hint_level,
          final_attempt_id: retryAttempt.attempt_id,
          request_event_id: this.generateId('evt'),
          requested_at: this.now(),
        }
      } else {
        status = 'completed'; phase = 'closed'; completedAt = this.now()
        if (this.phase3bEnabled) reflection = { status: 'not_required' }
      }
    } else if (session.highest_hint_level === 3) {
      status = 'escalated'; phase = 'closed'; outcome = 'support_required'; completedAt = this.now()
      await this.evidence.recordTutorOutcome(actor, retryAttempt, { hintLevel: 3, supportRequired: true, sessionId: session.session_id })
      await this.projection.rebuild(actor, actor.student_id, trigger.primary_competency_ref, session.session_id)
      if (this.phase3bEnabled) reflection = { status: 'not_required' }
    }
    const nextAction = phase === 'awaiting_hint' ? 'request_hint' : phase === 'awaiting_reflection' ? 'submit_reflection' : 'session_closed'
    const response = { correctness: isCorrect ? 'correct' : 'incorrect', outcome, next_action: nextAction }
    const firstSequence = session.last_sequence + 1
    const eventCount = phase === 'closed' || phase === 'awaiting_reflection' ? 2 : 1
    const retryReceipt = { idempotency_key: input.idempotency_key, hint_level: session.highest_hint_level,
      attempt_id: retryAttempt.attempt_id, response, first_sequence: firstSequence, occurred_at: retryAttempt.submitted_at }
    try {
      session = await this.sessionRepository.transition(actor, session, {
        status, phase, outcome, completed_at: completedAt, retry_count: session.retry_count + 1,
        last_retry: retryReceipt,
        retry_receipts: [...(session.retry_receipts || []), retryReceipt],
        ...(phase === 'closed' ? { completion_receipt: { sequence: firstSequence + 1, occurred_at: completedAt,
          payload: { outcome, retry_count: session.retry_count + 1, hint_count: session.hint_count } } } : {}),
        ...(this.phase3bEnabled ? { reflection } : {}),
        last_sequence: session.last_sequence + eventCount, updated_at: this.now(), last_activity_at: this.now(),
      })
    } catch (error) {
      const canonical = await this.sessionRepository.findForStudent(actor, sessionId)
      if (canonical?.last_retry?.hint_level === session.highest_hint_level) return { session: await this.studentDto(actor, canonical), result: canonical.last_retry.response }
      throw error
    }
    await this.recordEvent(actor, session, firstSequence, 'RETRY_SUBMITTED', { hint_level: session.highest_hint_level, attempt_id: retryAttempt.attempt_id, correctness: response.correctness })
    if (reflectionRequired) await this.recordReflectionRequest(actor, session, context, trigger, retryAttempt)
    else if (phase === 'closed') await this.recordEvent(actor, session, firstSequence + 1, 'TUTOR_SESSION_COMPLETED', { outcome, retry_count: session.retry_count, hint_count: session.hint_count })
    return { session: await this.studentDto(actor, session), result: response }
  }

  async reflect(actor, sessionId, rawInput) {
    requireStudent(actor)
    const session = await this.sessionRepository.findForStudent(actor, sessionId)
    if (!session) throw new LearningV2Error('NOT_FOUND')
    if (session.reflection?.status === 'submitted') return this.reflectEligible(actor, sessionId, rawInput)
    await this.ensureFresh(actor, session)
    return this.interactionAuthority.run(actor, session, () => this.reflectEligible(actor, sessionId, rawInput))
  }

  async reflectEligible(actor, sessionId, rawInput) {
    requireStudent(actor)
    if (!this.phase3bEnabled) throw new LearningV2Error('NOT_FOUND')
    const input = parse(reflectionSubmissionRequestSchema, rawInput)
    let session = await this.sessionRepository.findForStudent(actor, sessionId)
    if (!session) throw new LearningV2Error('NOT_FOUND')

    if (session.reflection?.status === 'submitted') {
      const canonical = await this.reflectionSubmissionEvent(actor, session)
      if (!canonical) throw new LearningV2Error('CONFLICT')
      const canonicalText = canonical.payload?.reflection?.response_text
      const canonicalReceipt = canonical.payload?.receipt?.client_idempotency_key_hash
      if (canonicalReceipt === stableInputHash(input.idempotency_key) && canonicalText !== input.response_text) throw new LearningV2Error('CONFLICT')
      session = await this.finishSubmittedReflection(actor, session, canonical)
      return { session: await this.studentDto(actor, session), reflection: { status: 'submitted', response_text: canonicalText } }
    }

    session = await this.ensureFresh(actor, session)
    if (session.status !== 'active' || session.phase !== 'awaiting_reflection'
      || session.reflection?.status !== 'awaiting_submission' || ![2, 3].includes(session.reflection.support_level)) {
      throw new LearningV2Error('CONFLICT')
    }
    const context = await this.taskContext(actor, session)
    const [trigger, finalAttempt] = await Promise.all([
      this.attemptRepository.findById(actor, session.trigger_attempt_id),
      this.attemptRepository.findById(actor, session.reflection.final_attempt_id),
    ])
    if (!trigger || !finalAttempt || finalAttempt.student_id !== actor.student_id
      || finalAttempt.source?.kind !== 'tutor_retry' || finalAttempt.source?.tutor_session_id !== session.session_id
      || finalAttempt.source?.hint_level !== session.reflection.support_level || finalAttempt.outcome?.correctness !== 'correct') {
      throw new LearningV2Error('NOT_FOUND')
    }
    await this.ensureReflectionRequestEvent(actor, session, context)

    const prompt = reflectionPrompt(session.reflection.prompt_id, session.reflection.prompt_version)
    if (!prompt) throw new LearningV2Error('NOT_FOUND')
    const sequence = session.last_sequence + 1
    let submissionEvent
    try {
      submissionEvent = await this.recordEvent(actor, session, sequence, 'REFLECTION_SUBMITTED', {
        ...this.reflectionContextPayload(actor, session, context, trigger),
        cause: {
          request_event_id: session.reflection.request_event_id,
          final_attempt_id: finalAttempt.attempt_id,
          support_level: session.reflection.support_level,
        },
        reflection: {
          type: REFLECTION_TYPE,
          prompt_id: REFLECTION_PROMPT_ID,
          prompt_version: REFLECTION_PROMPT_VERSION,
          response_text: input.response_text,
          character_count: reflectionCharacterCount(input.response_text),
          word_count: reflectionWordCount(input.response_text),
        },
        receipt: { client_idempotency_key_hash: stableInputHash(input.idempotency_key) },
      }, {
        eventId: this.generateId('evt'),
        causationId: session.reflection.request_event_id,
        idempotencyParts: ['reflection-submit-v1', actor.tenant_id, session.session_id, session.reflection.request_event_id],
        payloadConflict: 'canonical',
      })
    } catch (error) {
      if (error?.code !== 11000) throw error
      submissionEvent = await this.events.findForAggregateSequence(actor, 'tutor_session', session.session_id, sequence)
      if (submissionEvent?.type !== 'REFLECTION_SUBMITTED') throw new LearningV2Error('CONFLICT')
    }
    const canonicalText = submissionEvent.payload?.reflection?.response_text
    const canonicalReceipt = submissionEvent.payload?.receipt?.client_idempotency_key_hash
    if (canonicalReceipt === stableInputHash(input.idempotency_key) && canonicalText !== input.response_text) throw new LearningV2Error('CONFLICT')
    session = await this.finishSubmittedReflection(actor, session, submissionEvent)
    return {
      session: await this.studentDto(actor, session),
      reflection: { status: 'submitted', response_text: canonicalText },
    }
  }
}
