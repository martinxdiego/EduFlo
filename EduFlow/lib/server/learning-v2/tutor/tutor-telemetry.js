import { deletionFencedDatabase } from '../../deletion-write-fence.js'
import { randomUUID } from 'node:crypto'
import { TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION } from './canonical-safety-gates.js'

export class TutorTelemetry {
  constructor(db, options = {}) {
    db = deletionFencedDatabase(db)
    this.collection = db.collection('ai_generations')
    this.now = options.now || (() => new Date())
    this.maxTimeMS = 200
  }

  async record(actor, session, values) {
    const now = this.now()
    const callId = typeof values.callId === 'string' ? values.callId : `telemetry_${randomUUID()}`
    const document = {
      id: callId, call_id: callId, user_id: actor.actor_id, tenant_id: actor.tenant_id,
      feature: 'learning-v2-tutor', provider: 'openai', model: session.model_config.model,
      prompt_version: session.model_config.prompt_version, policy_version: session.policy_ref.version,
      fallback_registry_version: session.fallback_registry_version,
      safety_gate_contract_version: TUTOR_CANONICAL_SAFETY_CONTRACT_VERSION,
      status: values.status, validation_code: values.validationCode || null,
      candidate_gate_result: values.candidateGateResult || 'NOT_EVALUATED',
      final_source: values.finalSource || null,
      usage: values.usage ? {
        input_tokens: Number(values.usage.input_tokens || 0), output_tokens: Number(values.usage.output_tokens || 0),
      } : {},
      raw_payload_stored: false, created_at: now, updated_at: now,
    }
    await this.collection.updateOne(
      { id: callId, tenant_id: actor.tenant_id, feature: 'learning-v2-tutor' },
      { $setOnInsert: document },
      { upsert: true, maxTimeMS: this.maxTimeMS },
    )
  }
}
