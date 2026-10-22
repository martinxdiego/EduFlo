// UI retry identity only. The server still owns semantic slots and authority.
export function createOperationReceipts(generateKey = () => crypto.randomUUID()) {
  const pending = new Map()
  return {
    get(slot, payload) {
      if (!pending.has(slot)) pending.set(slot, { ...structuredClone(payload), idempotency_key: generateKey() })
      return structuredClone(pending.get(slot))
    },
    confirmed(slot) { pending.delete(slot) },
  }
}
