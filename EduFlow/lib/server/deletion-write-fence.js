import { mongoTransaction, withTenantWrite, advanceEvidenceRevision } from './learning-v2/database/tenant-write.js'
import { LearningV2Error } from './learning-v2/contracts/errors.js'

export const PERSONAL_TENANT_CHILDREN = Object.freeze([
  'learning_objectives', 'learning_tasks', 'learning_recommendations', 'curriculum_nodes', 'curriculum_frameworks',
  'learning_attempts', 'evidence_events', 'learning_events', 'student_knowledge_states', 'tutor_policies', 'tutor_sessions',
])
const tenantCollections = new Set([...PERSONAL_TENANT_CHILDREN, 'learning_v2_tenant_memberships'])
const ownerFields = {
  worksheets: 'user_id', assignments: 'teacher_id', classes: 'teacher_id', dossiers: 'user_id',
  ai_generations: 'user_id', generated_assets: 'user_id', studio_packages: 'user_id', password_reset_tokens: 'user_id',
  comments: 'user_id', versions: 'user_id', shares: 'owner_id', submissions: null, students: null,
}
const writes = new Map([['insertOne', 1], ['insertMany', 1], ['updateOne', 2], ['updateMany', 2],
  ['replaceOne', 2], ['findOneAndUpdate', 2], ['deleteOne', 1], ['deleteMany', 1]])
const RAW = Symbol('deletion-fence-raw-database')
const cache = new WeakMap()
export function unfencedDatabase(db) { return db[RAW] || db }

export async function withAccountWrite(db, userId, operation) {
  const raw = unfencedDatabase(db)
  return mongoTransaction(raw, async (session) => {
    const owner = await raw.collection('users').findOneAndUpdate({ id: userId, account_deletion: { $exists: false } },
      { $inc: { account_write_fence: 1 } }, { session, returnDocument: 'after' })
    if (!owner) throw new LearningV2Error('NOT_FOUND')
    return operation(session)
  })
}

// Only the existing personal-tenant/legacy-owned collections participate. Reads,
// auth registration, shared curriculum and unrelated operational data are unchanged.
export function deletionFencedDatabase(db) {
  if (db[RAW]) return db
  if (cache.has(db)) return cache.get(db)
  const wrapped = new Proxy(db, {
    get(target, key) {
      if (key === RAW) return target
      if (key !== 'collection') return typeof target[key] === 'function' ? target[key].bind(target) : target[key]
      return (name, options) => {
        const collection = target.collection(name, options)
        if (!tenantCollections.has(name) && !Object.hasOwn(ownerFields, name) && name !== 'rate_limits') return collection
        return new Proxy(collection, { get(coll, method) {
          if (!writes.has(method)) return typeof coll[method] === 'function' ? coll[method].bind(coll) : coll[method]
          return async (...args) => {
            const optionIndex = writes.get(method)
            if (args[optionIndex]?.session) return coll[method](...args)
            const input = args[0] || {}
            // Every current assignment/config edit invalidates older interaction
            // snapshots. Internal fence writes carry a transaction session and
            // return above; they do not increment the configuration revision.
            if (name === 'assignments' && ['updateOne', 'updateMany', 'findOneAndUpdate'].includes(method)) {
              args[1] = { ...args[1], $inc: { ...args[1]?.$inc, learning_v2_revision: 1 } }
            }
            const proposed = method.startsWith('insert') ? input : { ...input, ...args[1]?.$setOnInsert, ...args[1]?.$set }
            const enrollmentUpdate = args[1]?.$push?.enrolled_classes || args[1]?.$addToSet?.enrolled_classes
            const addedEnrollments = proposed.enrolled_classes || (enrollmentUpdate ? enrollmentUpdate.$each || [enrollmentUpdate] : [])
            if (name === 'students' && !addedEnrollments.length) return coll[method](...args)
            const tenantId = proposed.tenant_id
            const run = (session) => {
              const next = [...args]; next[optionIndex] = { ...args[optionIndex], session }
              return coll[method](...next)
            }
            if (typeof tenantId === 'string') return withTenantWrite(target, { tenant_id: tenantId }, async (session) => {
              const result = await run(session)
              if (name === 'evidence_events') await advanceEvidenceRevision(target, { tenant_id: tenantId }, session)
              return result
            })
            if (tenantCollections.has(name)) {
              if (['curriculum_nodes', 'curriculum_frameworks'].includes(name) && tenantId === null) return coll[method](...args)
              throw new LearningV2Error('FORBIDDEN')
            }
            if (name === 'rate_limits') return coll[method](...args) // pre-existing non-identifying TTL counters
            return mongoTransaction(target, async (session) => {
              const rows = method.startsWith('insert') ? (Array.isArray(input) ? input : [input])
                : await coll.find(input, { session }).toArray()
              if (!rows.length && args[optionIndex]?.upsert) rows.push(proposed)
              const owners = new Set()
              if (typeof proposed[ownerFields[name]] === 'string') owners.add(proposed[ownerFields[name]])
              if (name === 'shares' && typeof proposed.shared_with_id === 'string') owners.add(proposed.shared_with_id)
              if (name === 'students') for (const reference of addedEnrollments) {
                const ownedClass = await target.collection('classes').findOne({ id: reference.class_id }, { session })
                if (!ownedClass) throw new LearningV2Error('NOT_FOUND')
                owners.add(ownedClass.teacher_id)
              }
              for (const row of rows) {
                if (ownerFields[name] && row[ownerFields[name]]) owners.add(row[ownerFields[name]])
                if (name === 'shares' && row.shared_with_id) owners.add(row.shared_with_id)
                if (row.worksheet_id) {
                  const worksheet = await target.collection('worksheets').findOne({ id: row.worksheet_id }, { session })
                  if (!worksheet) throw new LearningV2Error('NOT_FOUND')
                  owners.add(worksheet.user_id)
                }
                if (name === 'submissions') {
                  const assignment = await target.collection('assignments').findOne({ id: row.assignment_id }, { session })
                  if (!assignment) throw new LearningV2Error('NOT_FOUND')
                  owners.add(assignment.teacher_id)
                }
              }
              for (const id of [...owners].sort()) {
                const owner = await target.collection('users').findOneAndUpdate({ id, account_deletion: { $exists: false } },
                  { $inc: { account_write_fence: 1 } }, { session, returnDocument: 'after' })
                if (!owner) throw new LearningV2Error('NOT_FOUND')
              }
              if (rows.length && !owners.size) throw new LearningV2Error('FORBIDDEN')
              return run(session)
            })
          }
        } })
      }
    },
  })
  cache.set(db, wrapped)
  return wrapped
}
