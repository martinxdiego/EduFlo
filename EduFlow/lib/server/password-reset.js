import { createHash, randomBytes } from 'node:crypto'

const RESET_TOKEN_BYTES = 32
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000

export function hashPasswordResetToken(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

export function createPasswordResetToken(now = Date.now()) {
  const token = randomBytes(RESET_TOKEN_BYTES).toString('base64url')
  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(now + RESET_TOKEN_TTL_MS),
  }
}
