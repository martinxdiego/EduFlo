import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { syncBuiltinESMExports } from 'node:module'
import test, { before, after } from 'node:test'
import { createInternalPaidExecutionTestHarness, createPaidExecutionSession, inspectPaidExecution } from '../../lib/server/learning-v2/tutor/evaluation/paid-execution-framework.js'
import { sealPaidArtifact, paidFileHash } from '../../lib/server/learning-v2/tutor/evaluation/paid-execution-contract.js'
import { jcsUtf8Bytes } from '../../lib/server/learning-v2/tutor/evaluation/human-review-canonical.js'
import { localTutorFallback } from '../../lib/server/learning-v2/tutor/fallback-registry.js'
const roots = []; let serial = 0
const oldEnv = process.env.NODE_ENV
before(() => { process.env.NODE_ENV = 'test' })
after(async () => {
  for (const root of roots) { assert.ok(path.basename(root).startsWith('paid-execution-test-additional-')); assert.ok(!path.relative(tmpdir(), root).startsWith('..')); await fs.rm(root, { recursive: true, force: true }) }
  if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv
})
async function setup() {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'paid-execution-test-additional-')); roots.push(root)
  const runId = 'test-paid-additional-' + (++serial); let calls = 0
  const h = await createInternalPaidExecutionTestHarness({ repositoryRoot: root, runId, eventForFixture: f => { calls++; return { kind: 'PROVIDER_CANDIDATE', candidate: localTutorFallback(f.level), usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140 } } }, faultCapability: null, fallbackFactory: null })
  return { root, runId, h, r: h.repository, args: { repositoryRoot: root, runId, authority: h.authority }, calls: () => calls }
}
const unsigned = v => { const b = structuredClone(v); delete b.artifact_digest; return b }
test('T: existing owner transport/prepare/settle/finalize/complete fail in actual production environment', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args), p = await s.prepare()
  process.env.NODE_ENV = 'production'
  try { for (const action of [() => s.invoke(p), () => s.prepare(), () => s.settle(), () => s.finalize(), () => s.complete()]) await assert.rejects(action()); assert.equal(c.calls(), 0) }
  finally { process.env.NODE_ENV = 'test' }
})
test('F/J DEFECT: replay verifier must reject a next prepared slot after a known per-call token breach', async () => {
  const c = await setup(), s = await createPaidExecutionSession(c.args), p = await s.prepare(); await s.invoke(p); await s.settle(); await s.prepare()
  const ref = c.r.refs.checkpoints + '/001.settled.json', b = unsigned((await c.r.read(ref)).value)
  Object.assign(b.facts, { known_input_tokens: 40001, known_output_tokens: 40, known_total_tokens: 40041, known_actual_cost_usd_micros: 80482 })
  const updated = jcsUtf8Bytes(sealPaidArtifact(b)); await fs.writeFile(path.join(c.root, ref), updated)
  const nextRef = c.r.refs.checkpoints + '/002.prepared.json', following = unsigned((await c.r.read(nextRef)).value)
  following.previous_checkpoint_sha256 = paidFileHash(updated)
  await fs.writeFile(path.join(c.root, nextRef), jcsUtf8Bytes(sealPaidArtifact(following)))
  await assert.rejects(inspectPaidExecution(c.args))
})
test('R DEFECT: directory swap between validation and open must not create a file outside the authoritative root', async () => {
  const c = await setup(), outside = await setup(), s = await createPaidExecutionSession(c.args)
  const originalOpen = fs.open; let attacked = false
  fs.open = async function (p, ...args) {
    if (!attacked && String(p).endsWith('001.prepared.json')) {
      attacked = true
      const parent = path.dirname(p), moved = parent + '-held'
      assert.ok(!path.relative(c.root, parent).startsWith('..')); assert.ok(!path.relative(c.root, moved).startsWith('..'))
      await fs.rename(parent, moved)
      await fs.symlink(outside.root, parent, process.platform === 'win32' ? 'junction' : 'dir')
    }
    return originalOpen.call(this, p, ...args)
  }
  syncBuiltinESMExports()
  try {
    await assert.rejects(s.prepare()); assert.equal(attacked, true); assert.equal(c.calls(), 0)
    const escaped = await fs.stat(path.join(outside.root, '001.prepared.json')).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e))
    assert.equal(escaped, null, 'pretransport check rejected, but exclusive open already created an outside-root tombstone')
  } finally { fs.open = originalOpen; syncBuiltinESMExports() }
})
