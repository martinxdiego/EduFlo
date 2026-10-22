export const STUDENT_ASSIGNMENT_DRAFT_VERSION = 'student-assignment-draft-v2'
export const STUDENT_ASSIGNMENT_DRAFT_TTL_MS = 2 * 60 * 60 * 1000

const PREFIX = 'eduflow_assignment_draft_v2:'
const LEGACY_PREFIX = 'eduflow_assignment_draft_v1:'
const MAX_SERIALIZED_DRAFT_BYTES = 256 * 1024

export function assignmentDraftStorage(browser, guest = false) {
  try { return guest ? browser?.sessionStorage || null : browser?.localStorage || null } catch { return null }
}

function storageKey(code) {
  return `${PREFIX}${encodeURIComponent(String(code || '').trim().toUpperCase())}`
}

function safeRemove(storage, key) {
  try { storage?.removeItem(key) } catch { /* unavailable storage is equivalent to no draft */ }
}

function bindingMatches(envelope, binding) {
  return envelope.storage_scope === binding.storageScope
    && envelope.actor_id === binding.actorId
    && envelope.assignment_id === binding.assignmentId
    && envelope.assignment_code === binding.assignmentCode
    && envelope.source_version === binding.sourceVersion
}

function validBinding(binding) {
  return binding && ['authenticated', 'guest'].includes(binding.storageScope)
    && typeof binding.actorId === 'string' && binding.actorId.length > 0
    && typeof binding.assignmentId === 'string' && binding.assignmentId.length > 0
    && typeof binding.assignmentCode === 'string' && binding.assignmentCode.length > 0
    && typeof binding.sourceVersion === 'string' && binding.sourceVersion.length > 0
}

function safeDraftValue(value) {
  const serialized = JSON.stringify(value)
  if (!serialized || serialized.length > MAX_SERIALIZED_DRAFT_BYTES) return null
  return JSON.parse(serialized)
}

export function assignmentDraftBinding({ student, assignment, guest = false }) {
  const actorId = guest ? 'guest-session' : String(student?.id || student?.student_id || '')
  const assignmentCode = String(assignment?.assignmentCode || '').trim().toUpperCase()
  const binding = {
    storageScope: guest ? 'guest' : 'authenticated',
    actorId,
    assignmentId: String(assignment?.assignmentId || ''),
    assignmentCode,
    sourceVersion: String(assignment?.draftSourceVersion || ''),
  }
  return validBinding(binding) ? binding : null
}

export function writeAssignmentDraft(storage, binding, draft, options = {}) {
  if (!storage || !validBinding(binding)) return false
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now())
  let bounded
  try { bounded = safeDraftValue({ answers: draft?.answers || {}, current_question: draft?.currentQuestion || 0 }) } catch { return false }
  if (!bounded || !Number.isInteger(bounded.current_question) || bounded.current_question < 0) return false
  const envelope = {
    schema_version: STUDENT_ASSIGNMENT_DRAFT_VERSION,
    storage_scope: binding.storageScope,
    actor_id: binding.actorId,
    assignment_id: binding.assignmentId,
    assignment_code: binding.assignmentCode,
    source_version: binding.sourceVersion,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + STUDENT_ASSIGNMENT_DRAFT_TTL_MS).toISOString(),
    draft: bounded,
  }
  try {
    storage.setItem(storageKey(binding.assignmentCode), JSON.stringify(envelope))
    safeRemove(storage, `${LEGACY_PREFIX}${binding.assignmentCode}`)
    return true
  } catch { return false }
}

export function readAssignmentDraft(storage, binding, options = {}) {
  if (!storage || !validBinding(binding)) return null
  const key = storageKey(binding.assignmentCode)
  safeRemove(storage, `${LEGACY_PREFIX}${binding.assignmentCode}`)
  let envelope
  try { envelope = JSON.parse(storage.getItem(key) || 'null') } catch { safeRemove(storage, key); return null }
  if (!envelope) return null
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now())
  const createdAt = Date.parse(envelope.created_at)
  const expiresAt = Date.parse(envelope.expires_at)
  const valid = envelope.schema_version === STUDENT_ASSIGNMENT_DRAFT_VERSION
    && bindingMatches(envelope, binding)
    && Number.isFinite(createdAt) && Number.isFinite(expiresAt)
    && createdAt <= now.getTime() && expiresAt > now.getTime()
    && envelope.draft && typeof envelope.draft.answers === 'object'
    && Number.isInteger(envelope.draft.current_question) && envelope.draft.current_question >= 0
  if (!valid) { safeRemove(storage, key); return null }
  return { answers: envelope.draft.answers, currentQuestion: envelope.draft.current_question }
}

export function clearAssignmentDraft(storage, assignmentCode) {
  safeRemove(storage, storageKey(assignmentCode))
  safeRemove(storage, `${LEGACY_PREFIX}${String(assignmentCode || '').trim().toUpperCase()}`)
}

export function clearAllAssignmentDrafts(...storages) {
  for (const storage of storages) {
    if (!storage) continue
    try {
      const keys = []
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (key?.startsWith(PREFIX) || key?.startsWith(LEGACY_PREFIX)) keys.push(key)
      }
      for (const key of keys) safeRemove(storage, key)
    } catch { /* storage enumeration can fail in private or restricted modes */ }
  }
}

export function clearLegacyAssignmentDrafts(...storages) {
  for (const storage of storages) {
    if (!storage) continue
    try {
      const keys = []
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (key?.startsWith(LEGACY_PREFIX)) keys.push(key)
      }
      for (const key of keys) safeRemove(storage, key)
    } catch { /* unavailable storage is equivalent to no legacy draft */ }
  }
}

export function clearExpiredAssignmentDrafts(storage, options = {}) {
  if (!storage) return
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now())
  try {
    const keys = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(PREFIX)) keys.push(key)
    }
    for (const key of keys) {
      let envelope
      try { envelope = JSON.parse(storage.getItem(key) || 'null') } catch { safeRemove(storage, key); continue }
      const expiresAt = Date.parse(envelope?.expires_at)
      if (envelope?.schema_version !== STUDENT_ASSIGNMENT_DRAFT_VERSION || !Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
        safeRemove(storage, key)
      }
    }
  } catch { /* storage enumeration can fail */ }
}

export function clearForeignAuthenticatedDrafts(storage, actorId) {
  if (!storage || typeof actorId !== 'string' || !actorId) return
  try {
    const keys = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(PREFIX)) keys.push(key)
    }
    for (const key of keys) {
      let envelope
      try { envelope = JSON.parse(storage.getItem(key) || 'null') } catch { safeRemove(storage, key); continue }
      if (envelope?.storage_scope === 'authenticated' && envelope.actor_id !== actorId) safeRemove(storage, key)
    }
  } catch { /* unavailable storage cannot restore a foreign draft */ }
}
