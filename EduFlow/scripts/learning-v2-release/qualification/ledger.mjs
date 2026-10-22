import { randomBytes, createHmac } from 'node:crypto'
import { z } from 'zod'
import { VERSION, ref, digest, bindingSchema, parse, canonical, hash, testOnly, nonProduction, blocked, immutable } from './contracts.mjs'

const stores = new WeakMap()
const recordSchema = z.object({ kind: z.enum(['EPOCH', 'REGISTER_INTENT', 'REGISTERED', 'CONSUMED', 'REDEEMED', 'EVIDENCE', 'FINALIZED']),
  fixture: ref, binding: bindingSchema.nullable(), test: ref.nullable(), value: digest.nullable(), epoch: ref }).strict()
const frameSchema = z.object({ version: z.literal(VERSION), sequence: z.number().int().positive().safe(), previous: digest,
  length: z.number().int().nonnegative().max(1048576), record: recordSchema, mac: digest }).strict()
const mac = (key, v) => createHmac('sha256', key).update(canonical(v)).digest('hex')

// Deliberately synthetic. No filesystem, network store, key export or deployment authority.
export function createSyntheticJournal({ failAt = null } = {}) {
  testOnly()
  const cap = Object.freeze({}), state = { bytes: Buffer.alloc(0), key: randomBytes(32), active: false, failAt, writes: 0,
    committedSequence: 0, committedHead: '0'.repeat(64), ambiguous: false }
  stores.set(cap, state)
  return Object.freeze({ capability: cap,
    snapshot() { testOnly(); return Buffer.from(state.bytes) },
    corrupt(bytes) { testOnly(); if (state.active) throw blocked('JOURNAL_ACTIVE'); state.bytes = Buffer.from(bytes) },
  })
}

export function openJournal(capability) {
  testOnly()
  const store = stores.get(capability)
  if (!store || store.active) throw blocked('SERIALIZATION_AUTHORITY')
  store.active = true
  let closed = false, failed = false, sequence = 0, previous = '0'.repeat(64), tail = Promise.resolve()
  const records = []
  try {
    const lines = store.bytes.toString('utf8').split('\n')
    const torn = lines.pop() !== ''
    for (const line of lines) {
      const frame = parse(frameSchema, line), { mac: observed, ...body } = frame
      if (body.sequence !== sequence + 1 || body.previous !== previous || body.length !== Buffer.byteLength(canonical(body.record))
        || observed !== mac(store.key, body)) throw blocked('JOURNAL_INTEGRITY')
      sequence = body.sequence; previous = hash(frame); records.push(body.record)
    }
    if (torn || store.ambiguous || sequence !== store.committedSequence || previous !== store.committedHead) throw blocked('JOURNAL_ROLLBACK_OR_AMBIGUITY')
  } catch { failed = true }
  function alive() { testOnly(); if (closed || failed) throw blocked('JOURNAL_UNAVAILABLE') }
  return Object.freeze({
    recovered() { testOnly(); return immutable({ records: structuredClone(records), complete: !failed }) },
    transaction(fn) {
      testOnly()
      const work = tail.then(async () => {
        alive()
        const append = async value => {
          alive(); const record = parse(recordSchema, value)
          const body = { version: VERSION, sequence: sequence + 1, previous, length: Buffer.byteLength(canonical(record)), record }
          const frame = { ...body, mac: mac(store.key, body) }, bytes = Buffer.from(canonical(frame) + '\n')
          store.writes++
          if (store.failAt === store.writes) {
            store.bytes = Buffer.concat([store.bytes, bytes.subarray(0, Math.max(1, bytes.length >> 1))]); failed = true; store.ambiguous = true
            throw blocked('PERSISTENCE_AMBIGUOUS')
          }
          store.bytes = Buffer.concat([store.bytes, bytes]); sequence++; previous = hash(frame); records.push(record)
          store.committedSequence = sequence; store.committedHead = previous
          return hash(frame)
        }
        return fn(append)
      })
      tail = work.catch(() => {})
      return work
    },
    close() { testOnly(); if (!closed) { closed = true; store.active = false } },
  })
}
