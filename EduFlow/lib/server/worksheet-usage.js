import { createHash } from 'node:crypto'
import { unfencedDatabase, withAccountWrite } from './deletion-write-fence.js'

export const FREE_WORKSHEET_LIMIT = 5

export function swissMonth(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit' }).formatToParts(new Date(date))
  return `${parts.find(part => part.type === 'year').value}-${parts.find(part => part.type === 'month').value}`
}

export function worksheetUsage(user, now = new Date()) {
  const resetDate = new Date(user?.month_reset_date || user?.created_at || now)
  const reset = Number.isFinite(resetDate.getTime()) && swissMonth(resetDate) !== swissMonth(now)
  const used = reset ? 0 : Math.max(0, Number(user?.worksheets_used_this_month) || 0)
  return { used, reset, exhausted: user?.subscription_tier !== 'premium' && used >= FREE_WORKSHEET_LIMIT }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
}

export function generationFingerprint(input) {
  return createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex')
}

export function validGenerationRequestKey(key) {
  return key == null || /^[a-zA-Z0-9_-]{8,128}$/.test(key)
}

export async function refreshWorksheetUsage(db, user, now = new Date()) {
  if (!worksheetUsage(user, now).reset) return user
  const raw = unfencedDatabase(db)
  return withAccountWrite(db, user.id, async session => {
    const current = await raw.collection('users').findOne({ id: user.id }, { session })
    if (!worksheetUsage(current, now).reset) return current
    await raw.collection('users').updateOne({ id: user.id }, {
      $set: { worksheets_used_this_month: 0, month_reset_date: now },
    }, { session })
    return { ...current, worksheets_used_this_month: 0, month_reset_date: now }
  })
}

// The account write fence serializes concurrent requests and prevents writes to
// deleted accounts. Counter and material commit together, or neither commits.
export async function persistCountedWorksheet(db, worksheet, { requestKey, fingerprint, now = new Date() } = {}) {
  if (!validGenerationRequestKey(requestKey)) throw new Error('Ungültiger Generierungsschlüssel.')
  const raw = unfencedDatabase(db)
  return withAccountWrite(db, worksheet.user_id, async session => {
    if (requestKey) {
      const existing = await raw.collection('worksheets').findOne({ user_id: worksheet.user_id, generation_request_id: requestKey }, { session })
      if (existing) {
        if (existing.generation_fingerprint !== fingerprint) throw new Error('Der Generierungsschlüssel wurde bereits für eine andere Anfrage verwendet.')
        const { _id, ...saved } = existing
        return saved
      }
    }
    const user = await raw.collection('users').findOne({ id: worksheet.user_id }, { session })
    const usage = worksheetUsage(user, now)
    if (usage.exhausted) throw new Error('Ihr Monatskontingent ist aufgebraucht. Es wurde kein weiteres Material berechnet.')
    const saved = {
      ...worksheet,
      ...(requestKey ? { generation_request_id: requestKey, generation_fingerprint: fingerprint } : {}),
    }
    await raw.collection('users').updateOne({ id: worksheet.user_id }, {
      $set: { worksheets_used_this_month: usage.used + 1, ...(usage.reset ? { month_reset_date: now } : {}) },
    }, { session })
    await raw.collection('worksheets').insertOne(saved, { session })
    const { _id, ...result } = saved
    return result
  })
}

export async function completeCountedDossier(db, dossier, now = new Date()) {
  if (dossier.generation_status !== 'complete' || !dossier.quality?.passed) throw new Error('Das Dossier hat die Qualitätsprüfung nicht bestanden.')
  const raw = unfencedDatabase(db)
  return withAccountWrite(db, dossier.user_id, async session => {
    const existing = await raw.collection('dossiers').findOne({ id: dossier.id, user_id: dossier.user_id }, { session })
    if (!existing) throw new Error('Der Dossier-Checkpoint wurde nicht gefunden.')
    if (existing.usage_charged_at) {
      const { _id, ...saved } = existing
      return saved
    }
    const user = await raw.collection('users').findOne({ id: dossier.user_id }, { session })
    const usage = worksheetUsage(user, now)
    if (usage.exhausted) throw new Error('Ihr Monatskontingent ist aufgebraucht. Es wurde kein weiteres Material berechnet.')
    const saved = { ...dossier, completed_at: now, usage_charged_at: now }
    await raw.collection('users').updateOne({ id: dossier.user_id }, {
      $set: { worksheets_used_this_month: usage.used + 1, ...(usage.reset ? { month_reset_date: now } : {}) },
    }, { session })
    await raw.collection('dossiers').updateOne({ id: dossier.id, user_id: dossier.user_id }, { $set: saved }, { session })
    return saved
  })
}
