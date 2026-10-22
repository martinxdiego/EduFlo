// Research-only offline model. No filesystem, process, paid or qualification imports.
export const VERSION = 'replacement-identity-stage1-v1'
export const RESULTS = Object.freeze(['SUPPORTED_CORRELATION', 'AMBIGUOUS', 'MISSING_REQUIRED_IDENTITY', 'OBSERVATION_LOSS', 'OBSERVER_INTERFERENCE', 'UNSUPPORTED'])
export const CASES = Object.freeze(['rename', 'posix-rename', 'link-alias', 'concurrent-rename'])
export function requireFact(ok, message) { if (!ok) throw new Error(message) }
function keys(value, names) {
  requireFact(value && typeof value === 'object' && !Array.isArray(value), 'object required')
  requireFact(Object.keys(value).sort().join('|') === [...names].sort().join('|'), 'unexpected or missing field')
}
export function fixturePlan() {
  return CASES.flatMap((kind, i) => [false, true].map(observer => Object.freeze({
    version: VERSION, slot: `research-stage1-${i + 1}-${observer ? 'on' : 'off'}`, kind, observer,
    names: Object.freeze(kind === 'concurrent-rename' ? ['source-a', 'source-b', 'target'] : kind === 'link-alias' ? ['source-a', 'target', 'victim-alias'] : ['source-a', 'target']),
    retained_subject_victim: kind === 'posix-rename', maximum_operations: kind === 'concurrent-rename' ? 2 : 1,
    cleanup: 'RETAIN', paid_authority: false,
  })))
}

// Irreversible pure replay of an external append-only fixture log. This is not
// persistence, a launch ticket, or a substitute for the frozen controller.
export function fixtureState(events) {
  requireFact(Array.isArray(events) && events.length <= 8, 'bounded fixture log required')
  const transitions = { NEW: { RESERVE: 'RESERVED' }, RESERVED: { CONSUME: 'CONSUMED' }, CONSUMED: { START: 'STARTED', ABORT: 'RETAINED' }, STARTED: { CAPTURED: 'CAPTURED', ABORT: 'RETAINED' }, CAPTURED: { SEAL: 'RETAINED' }, RETAINED: {} }
  let state = 'NEW'
  for (const event of events) { requireFact(Object.hasOwn(transitions[state], event), 'fixture reuse/order rejected'); state = transitions[state][event] }
  return Object.freeze({ state, consumed: !['NEW', 'RESERVED'].includes(state), executable: false })
}

function graph(g, names, partial = false) {
  keys(g, names)
  for (const x of Object.values(g)) requireFact(x === null || (partial && x === '?') || (typeof x === 'string' && /^[a-f0-9]{16}:[a-f0-9]{32}$/.test(x)), 'invalid bound file identity')
}
const equalGraph = (actual, observed) => Object.entries(observed).every(([k, v]) => v === '?' || actual[k] === v)
const permutations = values => values.length ? values.flatMap((v, i) => permutations(values.filter((_, j) => i !== j)).map(rest => [v, ...rest])) : [[]]

// This function intentionally accepts no notifications, USN, inferred victim,
// timing or observer fields. '?' represents unavailable independent evidence.
export function enumerateHistories(evidence) {
  keys(evidence, ['kind', 'parent', 'initial', 'final', 'operations', 'retained'])
  requireFact(CASES.includes(evidence.kind), 'unsupported case')
  const plan = fixturePlan().find(x => x.kind === evidence.kind)
  keys(evidence.parent, ['before', 'after'])
  requireFact(typeof evidence.parent.before === 'string' && /^[a-f0-9]{16}:[a-f0-9]{32}$/.test(evidence.parent.before) && evidence.parent.before === evidence.parent.after, 'parent continuity unproven')
  graph(evidence.initial, plan.names); graph(evidence.final, plan.names, true)
  requireFact(Object.values(evidence.initial).every(x => x.slice(0, 16) === evidence.parent.before.slice(0, 16)), 'cross-volume fixture unsupported')
  requireFact(Object.values(evidence.initial).every(x => x !== null), 'initial graph incomplete')
  requireFact(evidence.initial['source-a'] !== evidence.initial.target, 'source aliases victim')
  if (evidence.kind === 'link-alias') requireFact(evidence.initial['victim-alias'] === evidence.initial.target, 'victim alias mismatch')
  if (evidence.kind === 'concurrent-rename') requireFact(new Set(Object.values(evidence.initial)).size === 3, 'sources/victim must be distinct')
  requireFact(Array.isArray(evidence.operations) && evidence.operations.length === plan.maximum_operations, 'operation coverage incomplete')
  const sourceNames = plan.maximum_operations === 2 ? ['source-a', 'source-b'] : ['source-a']
  const spec = evidence.kind === 'link-alias' ? [11, 1] : evidence.kind === 'posix-rename' ? [65, 3] : [10, 1]
  const seen = new Set()
  for (const op of evidence.operations) {
    keys(op, ['source', 'information_class', 'flags', 'result'])
    requireFact(sourceNames.includes(op.source) && !seen.has(op.source), 'duplicate/unknown actor')
    seen.add(op.source)
    requireFact(op.information_class === spec[0] && op.flags === spec[1], 'wrong operation semantics')
    requireFact(op.result === 'SUCCESS' || op.result === 'NO_EFFECT_FAILURE', 'unresolved actor result')
  }
  if (evidence.kind === 'posix-rename') {
    keys(evidence.retained, ['before', 'after'])
    requireFact(evidence.retained.before === evidence.initial.target && evidence.retained.after === evidence.initial.target, 'retained identity unproven')
  } else requireFact(evidence.retained === null, 'unnatural retained victim handle')
  const histories = []
  for (const order of permutations(evidence.operations)) {
    const state = { ...evidence.initial }, victims = {}, sequence = []
    for (const op of order) {
      sequence.push(op.source)
      if (op.result !== 'SUCCESS') { victims[op.source] = null; continue }
      victims[op.source] = state.target
      state.target = state[op.source]
      if (evidence.kind !== 'link-alias') state[op.source] = null
    }
    if (equalGraph(state, evidence.final)) histories.push({ sequence, victims, final: state })
  }
  const assignments = [...new Map(histories.map(h => [JSON.stringify(Object.entries(h.victims).sort()), h.victims])).values()]
  return { histories, assignments, status: !histories.length ? 'UNSUPPORTED' : assignments.length > 1 ? 'AMBIGUOUS' : 'UNIQUE', incomplete_final: Object.values(evidence.final).includes('?') }
}

// Candidate sets must be independently produced; the oracle never selects a
// candidate interpretation. Positive classification additionally needs sealed
// capture provenance supplied by a future integration, not a completeness flag.
export function compareAssignments(independent, candidateAssignments) {
  const oracle = enumerateHistories(independent)
  requireFact(Array.isArray(candidateAssignments) && candidateAssignments.length <= 2, 'bounded candidates required')
  const sources = independent.operations.map(x => x.source)
  for (const c of candidateAssignments) {
    keys(c, sources)
    for (const id of Object.values(c)) requireFact(id === null || (typeof id === 'string' && /^[a-f0-9]{16}:[a-f0-9]{32}$/.test(id)), 'invalid candidate identity')
  }
  if (oracle.status === 'UNSUPPORTED') return 'UNSUPPORTED'
  if (oracle.status === 'AMBIGUOUS' || candidateAssignments.length > 1) return 'AMBIGUOUS'
  if (!candidateAssignments.length || oracle.incomplete_final) return 'MISSING_REQUIRED_IDENTITY'
  const matches = sources.every(s => candidateAssignments[0][s] === oracle.assignments[0][s])
  return matches ? 'ASSIGNMENT_MATCH_ONLY' : 'MISSING_REQUIRED_IDENTITY'
}

// Deliberately no public positive-result constructor. Matching IDs is not proof
// of loss-free capture or noninterference. All final result names are frozen.
export function captureDisposition({ unsupported, interference, loss, drain, assignment }) {
  requireFact(typeof unsupported === 'boolean' && typeof interference === 'boolean' && typeof loss === 'boolean', 'invalid capture status')
  requireFact(['UNPROVEN', 'CANCEL_COMPLETED'].includes(drain), 'unsupported drain proof')
  requireFact(['UNSUPPORTED', 'AMBIGUOUS', 'MISSING_REQUIRED_IDENTITY', 'ASSIGNMENT_MATCH_ONLY'].includes(assignment), 'invalid assignment status')
  if (interference) return 'OBSERVER_INTERFERENCE'
  if (loss) return 'OBSERVATION_LOSS'
  if (unsupported) return 'UNSUPPORTED'
  if (assignment !== 'ASSIGNMENT_MATCH_ONLY') return assignment
  // Cancellation completion does not establish all namespace notifications have
  // been delivered. Preserve this outstanding integration/contract gap.
  return 'UNSUPPORTED'
}

export const HANDLE_POLICY = Object.freeze({
  watch: Object.freeze({ access: 0x1, share: 0x7, disposition: 3, flags: 0x42200000 }),
  journal: Object.freeze({ access: 0x80000000, share: 0x7, disposition: 3, flags: 0 }),
  identity: Object.freeze({ access: 0x80, share: 0x7, disposition: 3, flags: 0x02200000 }),
})
export function inspectHandlePolicy(log) {
  requireFact(Array.isArray(log) && log.length <= 64, 'bounded handle log required')
  return log.every(h => {
    keys(h, ['kind', 'access', 'share', 'disposition', 'flags', 'inherited', 'critical_interval'])
    const rule = HANDLE_POLICY[h.kind]
    return rule && h.inherited === false && Object.entries(rule).every(([k, v]) => h[k] === v)
      && typeof h.critical_interval === 'boolean' && !(h.kind === 'identity' && h.critical_interval)
  })
}
export function compareControls(off, on) {
  for (const x of [off, on]) {
    keys(x, ['slot', 'kind', 'observer', 'operations', 'handles'])
    requireFact(CASES.includes(x.kind), 'invalid control kind')
  }
  requireFact(off.slot !== on.slot && off.kind === on.kind && off.observer === false && on.observer === true, 'fresh matching pair required')
  if (off.handles.length || !inspectHandlePolicy(on.handles)) return 'OBSERVER_INTERFERENCE'
  // Timing/winner differences alone are not proof of interference. Compare each
  // actor's native result and semantics, not which concurrent actor wins.
  const normalized = ops => JSON.stringify(ops.map(op => {
    keys(op, ['source', 'information_class', 'flags', 'native_status'])
    requireFact(Number.isInteger(op.native_status) && op.native_status >= 0 && op.native_status <= 0xffffffff, 'native status required')
    return op
  }).sort((a, b) => a.source.localeCompare(b.source)))
  for (const x of [off, on]) {
    const expected = x.kind === 'concurrent-rename' ? ['source-a', 'source-b'] : ['source-a']
    requireFact(Array.isArray(x.operations) && x.operations.map(o => o.source).sort().join('|') === expected.join('|'), 'control actor coverage')
  }
  return normalized(off.operations) === normalized(on.operations) ? 'NO_DIFFERENCE_OBSERVED' : 'OBSERVER_INTERFERENCE'
}
