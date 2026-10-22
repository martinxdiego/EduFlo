import { stableInputHash } from '../idempotency.js'
import { taskKey } from './rules.js'
import { isDomainId } from '../contracts/ids.js'

export const TASK_PROJECTION = Object.freeze({
  _id: 0, tenant_id: 1, task_id: 1, version: 1, status: 1, task_type: 1, response_modality: 1,
  objective_refs: 1, competency_targets: 1, published_at: 1, definition_schema_version: 1,
  'source.kind': 1, 'source.worksheet_id': 1, 'source.question_id': 1,
  'source.content_hash': 1, 'source.hash_version': 1,
})
export function sameCompetency(left, right) {
  return left?.competency_id === right?.competency_id && left?.framework_id === right?.framework_id && left?.framework_version === right?.framework_version
}
export function taskPin(task) {
  return { task_id: task.task_id, version: task.version, source_kind: task.source.kind,
    worksheet_id: task.source.worksheet_id, question_id: task.source.question_id,
    content_hash: task.source.content_hash, hash_version: task.source.hash_version }
}

export async function selectRecommendationTasks({ actor, competencyRef, objectiveRef, tasks, usedTaskKeys, verifySource, countPublishedVersions, countSourceBindings }) {
  const candidates = []; const exclusions = new Set()
  for (const task of tasks) {
    if (!isDomainId(task.task_id, 'tsk') || !Number.isInteger(task.version) || task.version < 1) continue
    if (task.tenant_id !== actor.tenant_id || task.status !== 'published' || !task.published_at || !Number.isFinite(new Date(task.published_at).getTime())) continue
    const primary = (task.competency_targets || []).filter((target) => target.role === 'primary')
    if (primary.length !== 1 || !sameCompetency(primary[0], competencyRef)) continue
    if (task.objective_refs?.length !== 1 || task.objective_refs[0].objective_id !== objectiveRef.objective_id || task.objective_refs[0].version !== objectiveRef.version) continue
    if (task.task_type !== 'selected_response' || task.response_modality !== 'choice' || task.source?.kind !== 'worksheet_question') { exclusions.add('UNSUPPORTED_TASK_TYPE'); continue }
    if (!isDomainId(task.source.question_id, 'wqi') || typeof task.source.worksheet_id !== 'string' || task.source.worksheet_id.length > 160 || !/^sha256:[0-9a-f]{64}$/.test(task.source.content_hash || '')) continue
    if (usedTaskKeys.has(taskKey(task.task_id, task.version))) continue
    if (await countPublishedVersions(task) !== 1) { exclusions.add('AMBIGUOUS_TASK_VERSION'); continue }
    if (await countSourceBindings(task) !== 1) { exclusions.add('AMBIGUOUS_TASK_BINDING'); continue }
    if (!await verifySource(task.source)) continue
    candidates.push(task)
  }
  candidates.sort((a, b) => new Date(a.published_at) - new Date(b.published_at) || a.task_id.localeCompare(b.task_id) || a.version - b.version)
  return {
    candidates: candidates.map(taskPin), exclusion_codes: [...exclusions].sort(),
    // Include tie-break facts: a changed publication time can change the choice.
    hash: stableInputHash(candidates.map((task) => ({ ...taskPin(task), published_at: new Date(task.published_at).toISOString() }))),
  }
}
