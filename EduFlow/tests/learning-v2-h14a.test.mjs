import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import OpenAI from 'openai'
import { generateDomainId } from '../lib/server/learning-v2/contracts/ids.js'
import {
  TUTOR_MODEL,
  TUTOR_PROVIDER_SCHEMA_VERSION,
  TUTOR_SESSION_SCHEMA_VERSION,
  tutorProviderSlotSchema,
  tutorProviderSlotsSchema,
} from '../lib/server/learning-v2/contracts/phase3.js'
import { learningV2ErrorPayload, LearningV2Error } from '../lib/server/learning-v2/contracts/errors.js'
import { inventoryEntry, LEARNING_V2_DATA_INVENTORY_VERSION } from '../lib/server/learning-v2/privacy/data-inventory-v1.js'
import { buildTutorProviderContext } from '../lib/server/learning-v2/tutor/provider-context.js'
import { OpenAITutorProvider } from '../lib/server/learning-v2/tutor/providers/openai-tutor-provider.js'
import { safeTutorTelemetry, TUTOR_TELEMETRY_DEADLINE_MS } from '../lib/server/learning-v2/tutor/safe-telemetry.js'
import { TutorTelemetry } from '../lib/server/learning-v2/tutor/tutor-telemetry.js'

const now = new Date('2026-08-31T12:00:00.000Z')
const callId = generateDomainId('pcl')
const tenantId = generateDomainId('ten')
const actor = {
  actor_id: 'h14a-synthetic-student', actor_type: 'student', role: 'student', tenant_id: tenantId,
  student_id: 'h14a-synthetic-student', teacher_id: null, permissions: ['learning:read:self', 'learning:write:self'],
}

function candidate(level = 1) {
  return {
    schema_version: TUTOR_PROVIDER_SCHEMA_VERSION,
    action: 'ASK_METACOGNITIVE_QUESTION', hint_level: level,
    learner_message: 'Welche Information aus der Aufgabe bestimmt deinen nächsten Schritt?',
    reason_code: 'METACOGNITIVE_CHECK', teacher_attention: false,
  }
}

function context() {
  return buildTutorProviderContext({
    level: 1,
    task: { provider_safe_objective_label: 'Synthetisches Lernziel' },
    question: { question: 'Welche Option passt?', options: ['A', 'B', 'C'] },
  })
}

test('provider slot schema is versioned, bounded to technical metadata and rejects content/history expansion', () => {
  assert.equal(TUTOR_SESSION_SCHEMA_VERSION, 'tutor-session-v4')
  const slot = {
    status: 'reserved', call_id: callId, reservation_count: 1, transport_count: 0,
    lease_expires_at: new Date(now.getTime() + 20_000),
    outcome_code: null, error_code: null, reserved_at: now, transport_started_at: null, completed_at: null, updated_at: now,
  }
  assert.equal(tutorProviderSlotSchema.parse(slot).call_id, callId)
  assert.equal(tutorProviderSlotSchema.safeParse({ ...slot, prompt: 'forbidden' }).success, false)
  assert.equal(tutorProviderSlotSchema.safeParse({ ...slot, response: 'forbidden' }).success, false)
  assert.equal(tutorProviderSlotSchema.safeParse({ ...slot, history: [] }).success, false)
  assert.equal(tutorProviderSlotSchema.safeParse({ ...slot, reservation_count: 101 }).success, false)
  assert.equal(tutorProviderSlotSchema.safeParse({ ...slot, transport_count: 2 }).success, false)
  assert.equal(tutorProviderSlotSchema.safeParse({ ...slot, attempt_count: 1 }).success, false)
  assert.equal(tutorProviderSlotSchema.safeParse({ ...slot, status: 'completed', transport_count: 1,
    outcome_code: 'LOCAL_FALLBACK', error_code: 'AMBIGUOUS_TRANSPORT_LOCAL_FALLBACK', completed_at: now }).success, true)
  assert.equal(tutorProviderSlotsSchema.safeParse({ level_1: slot, level_2: slot, level_3: slot }).success, true)
  assert.equal(tutorProviderSlotsSchema.safeParse({ level_4: slot }).success, false)
})

test('OpenAI adapter explicitly disables retries and applies the same bounded timeout/abort request options', async () => {
  let request; let requestOptions
  const provider = new OpenAITutorProvider({
    timeoutMs: 750,
    client: { responses: { async parse(input, options) {
      request = input; requestOptions = options
      return { output_parsed: candidate(), usage: { input_tokens: 3, output_tokens: 2 } }
    } } },
  })
  let transportStarts = 0
  const result = await provider.generate(context(), { beforeTransport: async () => { transportStarts += 1 } })
  assert.equal(provider.maxRetries, 0)
  assert.equal(requestOptions.maxRetries, 0)
  assert.equal(requestOptions.timeout, 750)
  assert.equal(transportStarts, 1)
  assert.ok(requestOptions.signal instanceof AbortSignal)
  assert.equal(request.model, TUTOR_MODEL)
  assert.equal(request.service_tier, 'default')
  assert.equal(request.store, false)
  assert.equal(result.candidate.schema_version, TUTOR_PROVIDER_SCHEMA_VERSION)
})

async function fakeTransport(mode, operation) {
  let requests = 0
  const server = http.createServer((request, response) => {
    requests += 1
    request.resume()
    if (mode === 'hung') return
    response.writeHead(mode, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: { message: `synthetic ${mode}`, type: 'synthetic_error', code: `synthetic_${mode}` } }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    await operation(`http://127.0.0.1:${address.port}/v1`)
    return requests
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
}

test('429, 500 and hung loopback transports each perform exactly one HTTP attempt with bounded abort', async () => {
  for (const mode of [429, 500, 'hung']) {
    const started = Date.now()
    const requests = await fakeTransport(mode, async (baseURL) => {
      const client = new OpenAI({ apiKey: 'synthetic-h14a-key', baseURL, maxRetries: 0, timeout: 500 })
      const provider = new OpenAITutorProvider({ client, timeoutMs: 500 })
      await assert.rejects(provider.generate(context()))
    })
    assert.equal(requests, 1, String(mode))
    if (mode === 'hung') assert.ok(Date.now() - started < 2_000, 'hung transport must abort within the fixed bound')
  }
})

test('safe telemetry rejects, times out or never resolves without blocking or producing unhandled rejection', async () => {
  const session = { model_config: {}, policy_ref: {} }
  assert.deepEqual(await safeTutorTelemetry({ record: async () => { throw new Error('synthetic reject') } }, actor, session, {}), { status: 'discarded' })
  const started = Date.now()
  assert.deepEqual(await safeTutorTelemetry({ record: () => new Promise(() => {}) }, actor, session, {}, 30), { status: 'deadline' })
  assert.ok(Date.now() - started < 250)
  const late = safeTutorTelemetry({ record: () => new Promise((_, reject) => setTimeout(() => reject(new Error('late reject')), 60)) }, actor, session, {}, 20)
  assert.deepEqual(await late, { status: 'deadline' })
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(TUTOR_TELEMETRY_DEADLINE_MS, 200)
})

test('telemetry uses opaque call ID as an idempotent key and persists no provider payload', async () => {
  const writes = []
  const db = {
    client: { startSession() { return { async withTransaction(operation) { return operation() }, async endSession() {} } } },
    collection(name) {
      if (name === 'learning_v2_tenants') return { async findOneAndUpdate() { return { tenant_id: tenantId, status: 'active' } } }
      return { async updateOne(filter, update, options) { writes.push({ filter, update, options }); return { upsertedCount: writes.length === 1 ? 1 : 0 } } }
    },
  }
  const telemetry = new TutorTelemetry(db, { now: () => now })
  const session = { model_config: { model: TUTOR_MODEL, prompt_version: 'tutor-guidance-v1' }, policy_ref: { version: 1 }, fallback_registry_version: 'tutor-fallback-v1' }
  const values = { callId, status: 'complete', usage: { input_tokens: 2, output_tokens: 1 }, prompt: 'FORBIDDEN_PROMPT', response: 'FORBIDDEN_RESPONSE' }
  await telemetry.record(actor, session, values)
  await telemetry.record(actor, session, values)
  assert.equal(writes.length, 2)
  assert.deepEqual(writes[0].filter, { id: callId, tenant_id: tenantId, feature: 'learning-v2-tutor' })
  assert.equal(writes[0].update.$setOnInsert.call_id, callId)
  assert.equal(writes[0].options.maxTimeMS, 200)
  const serialized = JSON.stringify(writes)
  assert.equal(serialized.includes('FORBIDDEN_PROMPT'), false)
  assert.equal(serialized.includes('FORBIDDEN_RESPONSE'), false)
  assert.equal(writes[0].update.$setOnInsert.raw_payload_stored, false)
})

test('operation-in-progress is a bounded public error and H12 inventory v12 records the irreversible transport fence', () => {
  const mapped = learningV2ErrorPayload(new LearningV2Error('OPERATION_IN_PROGRESS', { retryAfterSeconds: 1 }), 'synthetic-request')
  assert.equal(mapped.status, 409)
  assert.equal(mapped.payload.error.code, 'OPERATION_IN_PROGRESS')
  assert.equal(mapped.retryAfterSeconds, 1)
  assert.equal(LEARNING_V2_DATA_INVENTORY_VERSION, 'learning-v2-data-inventory-v23')
  assert.match(inventoryEntry('tutor_sessions').field_groups.join(' '), /provider slots/u)
  assert.match(inventoryEntry('tutor_sessions').field_groups.join(' '), /irreversible transport fence/u)
  assert.match(inventoryEntry('ai_generations').field_groups.join(' '), /call\/generation id/u)
})
