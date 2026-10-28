import assert from 'node:assert/strict'
import test from 'node:test'
import { worksheetGenerationSchema, regenerateWorksheetSchema } from '../lib/server/schemas/worksheet-generation.js'
import { buildGeneratedWorksheet, worksheetCompetencyContext } from '../lib/server/worksheet-generation.js'
import worksheetFixture from './fixtures/worksheet-launch.cjs'

const valid = { topic: 'Wasserkreislauf', grade: '5', subject: 'NMG', difficulty: 'medium', questionCount: 10 }

test('generation input bounds expensive work and rejects invalid providers and types', () => {
  for (const patch of [
    { questionCount: 100_000 }, { questionCount: -1 }, { grade: 10 }, { grade: 'invalid' },
    { questionTypes: ['unknown'] }, { questionTypes: ['open', 'open'] },
    { aiProvider: 'unknown' }, { aiProvider: 'openai', provider: 'gemini' }, { sourceText: 'x'.repeat(128_001) },
  ]) assert.equal(worksheetGenerationSchema.safeParse({ ...valid, ...patch }).success, false, JSON.stringify(Object.keys(patch)))
  const normalized = worksheetGenerationSchema.parse({ ...valid, grade: 5, subscription_tier: 'premium' })
  assert.equal(normalized.grade, '5')
  assert.equal('subscription_tier' in normalized, false)
  const { questionCount: _omitted, ...withoutCount } = valid
  const defaults = worksheetGenerationSchema.parse({ ...withoutCount, dyslexiaFont: false })
  assert.equal(defaults.questionCount, 10)
  assert.equal(defaults.resourceType, 'worksheet')
  assert.equal(defaults.dyslexiaFont, false)
  assert.equal(defaults.grade, '5')
  assert.equal(Object.hasOwn(defaults, 'questionTypes'), false)
  for (const grade of [undefined, 5.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) {
    assert.equal(worksheetGenerationSchema.safeParse({ ...valid, grade }).success, false)
  }
  assert.equal(regenerateWorksheetSchema.safeParse({ worksheetId: 'saved', newDifficulty: 'hard' }).success, true)
  assert.equal(regenerateWorksheetSchema.safeParse({ worksheetId: 'saved', newDifficulty: 'unlimited' }).success, false)

  const original = {
    ...valid, id: 'original', competency_code: 'NMG.2.2.f',
    competency_reference: { code: 'NMG.2.2.f', sourceVerified: true, description: 'UNTRUSTED DESCRIPTION', sourceUrl: 'https://untrusted.invalid/' },
  }
  const competency = worksheetCompetencyContext(original.competency_code, original.grade, original.subject)
  assert.equal(competency.code, original.competency_code)
  assert.ok(competency.instruction.startsWith('\n\n'))
  assert.ok(competency.instruction.includes(competency.reference.description))
  assert.ok(competency.instruction.includes(competency.reference.sourceUrl))
  assert.equal(competency.instruction.includes('UNTRUSTED'), false)
  const params = { ...original, user: { id: 'teacher' }, content: worksheetFixture.content, questionCount: 11,
    competencyCode: competency.code, resourceType: 'exam', aiProvider: 'openai' }
  const created = buildGeneratedWorksheet(params)
  const regenerated = buildGeneratedWorksheet({ ...params, difficulty: 'hard', regeneratedFrom: original.id })
  assert.equal(regenerated.regenerated_from, original.id)
  assert.equal(regenerated.difficulty, 'hard')
  assert.equal(regenerated.resourceType, 'exam')
  assert.equal(regenerated.content.resourceType, 'exam')
  assert.equal(regenerated.competency_code, created.competency_code)
  assert.deepEqual(regenerated.competency_reference, created.competency_reference)
  assert.deepEqual(regenerated.competency_reference, competency.reference)
  assert.notEqual(regenerated.competency_reference.sourceUrl, original.competency_reference.sourceUrl)
  for (const patch of [
    { competencyCode: 'NMG.4.2' }, { grade: '1' }, { subject: 'Deutsch' },
    { competencyCode: undefined }, { competencyCode: 'NMG.fake', competency_reference: { ...competency.reference, sourceVerified: true } },
  ]) {
    const input = { ...params, ...patch }
    const rejected = worksheetCompetencyContext(input.competencyCode, input.grade, input.subject)
    assert.equal(rejected.code, null)
    assert.equal(rejected.reference, null)
    assert.equal(rejected.instruction, '')
    const unbound = buildGeneratedWorksheet(input)
    assert.equal(unbound.competency_code, null)
    assert.equal(unbound.competency_reference, null)
  }
})
