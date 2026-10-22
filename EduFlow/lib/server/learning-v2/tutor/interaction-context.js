import { AsyncLocalStorage } from 'node:async_hooks'

// Request-local, server-only guard. A shared service instance cannot leak the
// learner/snapshot of one concurrent request into another.
const interactions = new AsyncLocalStorage()
export function withTutorInteractionGuard(guard, operation) { return interactions.run(guard, operation) }
export async function guardTutorWrite(db, actor, session, tenant) {
  const guard = interactions.getStore()
  if (guard) await guard(db, actor, session, tenant)
}
