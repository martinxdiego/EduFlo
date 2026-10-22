import { z } from 'zod'
import { ref, parse, immutable, blocked, nonProduction } from './contracts.mjs'

export const MATRIX_VERSION = 'windows-qualification-matrix-v2'
export const WRITE_BOUNDARIES = Object.freeze(['EVALUATION', 'CHECKPOINT', 'HUMAN_REVIEW'])
const argsSchema = z.object({ runId: ref, ancestors: z.array(ref).max(32).default([]),
  roles: z.array(z.enum(['RUNNER', 'COORDINATOR', 'ATTACKER_DEVELOPER', 'ATTACKER_SERVICE'])).min(1).max(4).default(['RUNNER', 'COORDINATOR', 'ATTACKER_DEVELOPER', 'ATTACKER_SERVICE']) }).strict()
export function qualificationMatrix(input) {
  const { runId, ancestors, roles } = parse(argsSchema, input)
  if (!runId.startsWith('test-paid-') || new Set(roles).size !== roles.length || new Set(ancestors).size !== ancestors.length) throw blocked('MATRIX_BINDING')
  const leaves = ['docs/evaluation-results', `docs/evaluation-results/execution-checkpoints/${runId}`, `docs/evaluation-results/human-review/${runId}`]
  const parents = [...ancestors.map(a => `@ancestor/${a}`), '', 'docs', leaves[0], 'docs/evaluation-results/execution-checkpoints', leaves[1], 'docs/evaluation-results/human-review', leaves[2]]
  const base = ['rename', 'replace-junction', 'delete-child', 'dacl', 'owner', 'direct-reparse', 'remove-reparse', 'symlink-set']
  const cells = []
  const add = (parent, action, targetType, role, writeBoundary) => cells.push({ version: MATRIX_VERSION, id: `test-paid-cell-${cells.length + 1}`,
    parent, action, targetType, role, writeBoundary, mandatory: true, expected: 'OS_PREVENTION', positiveControl: 'SEPARATE_FRESH_FIXTURE' })
  for (const role of roles) for (const writeBoundary of WRITE_BOUNDARIES) {
    for (const parent of parents) {
      for (const action of base) add(parent, action, 'DIRECTORY', role, writeBoundary)
      if (leaves.includes(parent)) {
        add(parent, 'child-directory', 'DIRECTORY', role, writeBoundary)
        for (const action of ['guard-remove', 'guard-change', 'dacl', 'owner', 'direct-reparse', 'remove-reparse', 'rename', 'replacement']) add(`${parent}/.namespace-guard`, action, 'GUARD', role, writeBoundary)
      }
    }
    for (const action of ['retained-handle', 'duplicate-handle', 'inherited-handle', 'impersonation', 'helper-escalation', 'device-redirection']) add('', action, 'AUTHORITY', role, writeBoundary)
  }
  return immutable(cells)
}
const oracleSchema = z.object({ code: z.number().int().nonnegative().safe(), applicable: z.boolean().default(false),
  partialMutation: z.boolean().default(false), observedMutation: z.boolean().default(false),
  positiveControl: z.boolean().default(false), nonemptyQualified: z.boolean().default(false) }).strict()
export function classifyAttack(input) {
  nonProduction()
  let value
  try { value = parse(oracleSchema, input) } catch { return 'BLOCKED' }
  const { code, applicable, partialMutation, observedMutation, positiveControl, nonemptyQualified } = value
  // Classification only: a PREVENTED label is never a launch or qualification capability.
  if (partialMutation || observedMutation) return 'FAILED'
  if (!applicable || !positiveControl || code === 4390) return 'BLOCKED'
  if (code === 5 || code === 1314) return 'PREVENTED'
  if (code === 145 && nonemptyQualified) return 'PREVENTED'
  return 'BLOCKED'
}
