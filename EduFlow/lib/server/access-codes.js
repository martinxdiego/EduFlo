import { randomBytes } from 'crypto'

export async function generateUniqueCode(db, collectionName, field = 'code', length = 8) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomBytes(9).toString('base64url').replace(/[-_]/g, '').slice(0, length).toUpperCase()
    if (code.length === length && !await db.collection(collectionName).findOne({ [field]: code })) return code
  }
  throw new Error('Could not create a unique access code')
}
