import { createHash } from 'crypto'

export function boundedIdempotencyKey(kind, components) {
  const digest = createHash('sha256').update(JSON.stringify(components)).digest('hex')
  return `${kind}:${digest}`
}

export function stableInputHash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}
