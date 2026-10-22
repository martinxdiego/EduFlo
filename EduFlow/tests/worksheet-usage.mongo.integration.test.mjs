import { saveGeneratedWorksheet } from '../lib/server/worksheet-generation.js'
import worksheetFixture from './fixtures/worksheet-launch.cjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { MongoClient } from 'mongodb'
import { deletionFencedDatabase } from '../lib/server/deletion-write-fence.js'
import { completeCountedDossier, persistCountedWorksheet, refreshWorksheetUsage } from '../lib/server/worksheet-usage.js'

test('generation quota commits atomically, survives retries and rolls back failed saves', { skip: process.env.RUN_WORKSHEET_USAGE_MONGO !== '1' }, async () => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  const client = await MongoClient.connect(repl.getUri())
  const db = deletionFencedDatabase(client.db('eduflow_learning_v2_test_worksheet_usage'))
  const now = new Date()
  try {
    await db.collection('users').insertOne({ id: 'teacher', subscription_tier: 'free', worksheets_used_this_month: 4, month_reset_date: now })
    await db.collection('worksheets').createIndex({ id: 1 }, { unique: true })
    const material = id => ({ id, user_id: 'teacher', content: { questions: [] } })
    const result = await Promise.allSettled([
      persistCountedWorksheet(db, material('a'), { requestKey: 'request-a', fingerprint: 'a' }),
      persistCountedWorksheet(db, material('b'), { requestKey: 'request-b', fingerprint: 'b' }),
    ])
    assert.equal(result.filter(item => item.status === 'fulfilled').length, 1)
    assert.equal(await db.collection('worksheets').countDocuments({}), 1)
    assert.equal((await db.collection('users').findOne({ id: 'teacher' })).worksheets_used_this_month, 5)
    const saved = await db.collection('worksheets').findOne({})
    const retry = await persistCountedWorksheet(db, material('retry'), { requestKey: saved.generation_request_id, fingerprint: saved.generation_fingerprint })
    assert.equal(retry.id, saved.id)
    assert.equal((await db.collection('users').findOne({ id: 'teacher' })).worksheets_used_this_month, 5)
    await assert.rejects(persistCountedWorksheet(db, material('mismatch'), { requestKey: saved.generation_request_id, fingerprint: 'different' }))
    await db.collection('users').updateOne({ id: 'teacher' }, { $set: { worksheets_used_this_month: 0 } })
    await assert.rejects(persistCountedWorksheet(db, material(saved.id)))
    assert.equal((await db.collection('users').findOne({ id: 'teacher' })).worksheets_used_this_month, 0)
    const repeated = await Promise.all([
      persistCountedWorksheet(db, material('same-a'), { requestKey: 'same-request', fingerprint: 'same' }),
      persistCountedWorksheet(db, material('same-b'), { requestKey: 'same-request', fingerprint: 'same' }),
    ])
    assert.equal(repeated[0].id, repeated[1].id)
    assert.equal((await db.collection('users').findOne({ id: 'teacher' })).worksheets_used_this_month, 1)
    const old = { ...(await db.collection('users').findOne({ id: 'teacher' })), month_reset_date: '2026-09-01T12:00:00Z' }
    await db.collection('users').updateOne({ id: 'teacher' }, { $set: { month_reset_date: new Date(old.month_reset_date) } })
    await refreshWorksheetUsage(db, old, new Date('2026-10-20T12:00:00Z'))
    await persistCountedWorksheet(db, material('after-reset'), { now: new Date('2026-10-20T12:00:00Z') })
    await refreshWorksheetUsage(db, old, new Date('2026-10-20T12:00:00Z'))
    assert.equal((await db.collection('users').findOne({ id: 'teacher' })).worksheets_used_this_month, 1)
    await db.collection('dossiers').insertOne({ id: 'dossier', user_id: 'teacher', generation_status: 'pending' })
    const dossier = { id: 'dossier', user_id: 'teacher', generation_status: 'complete', quality: { passed: true } }
    await completeCountedDossier(db, dossier, new Date('2026-10-20T12:00:00Z'))
    await completeCountedDossier(db, dossier, new Date('2026-10-20T12:00:00Z'))
    assert.equal((await db.collection('users').findOne({ id: 'teacher' })).worksheets_used_this_month, 2)
    await assert.rejects(completeCountedDossier(db, { ...dossier, id: 'bad', quality: { passed: false } }))
    await db.collection('users').updateOne({ id: 'teacher' }, { $set: { account_deletion: { status: 'pending' } } })
    await assert.rejects(persistCountedWorksheet(db, material('deleted-account')))
    assert.equal(await db.collection('worksheets').countDocuments({}), 3)
    const generationUser = { id: 'generator', subscription_tier: 'free', worksheets_used_this_month: 0, month_reset_date: now }
    await db.collection('users').insertOne(generationUser)
    const params = { db, user: generationUser, topic: 'Wasserkreislauf', grade: '5', subject: 'NMG', difficulty: 'medium', questionCount: 11,
      aiProvider: 'openai', resourceType: 'worksheet', competencyCode: 'NMG.2.2.f', requestKey: 'generated-request', requestFingerprint: 'fixture' }
    await assert.rejects(saveGeneratedWorksheet({ ...params, content: { title: 'Ungültig', questions: [{ type: 'ordering', question: 'Ordne die Schritte.', answer: { invalid: true } }] } }))
    assert.equal((await db.collection('users').findOne({ id: 'generator' })).worksheets_used_this_month, 0)
    const generated = await saveGeneratedWorksheet({ ...params, content: worksheetFixture.content })
    assert.equal(generated.content.questions[0].answer, 'Verdunstung, Kondensation, Niederschlag')
    assert.equal(generated.content.questions[1].answer, 'Falsch')
    assert.equal(generated.content.questions[4].answer, '0')
    assert.equal(generated.competency_reference.code, 'NMG.2.2.f')
    assert.ok(generated.content.quality.score >= 80)
    assert.equal(new Set(generated.content.questions.map(question => question.question_id)).size, 11)
    assert.equal((await db.collection('users').findOne({ id: 'generator' })).worksheets_used_this_month, 1)
    assert.equal((await saveGeneratedWorksheet({ ...params, content: worksheetFixture.content })).id, generated.id)
    assert.equal((await db.collection('users').findOne({ id: 'generator' })).worksheets_used_this_month, 1)
  } finally {
    await client.close()
    await repl.stop()
  }
})
