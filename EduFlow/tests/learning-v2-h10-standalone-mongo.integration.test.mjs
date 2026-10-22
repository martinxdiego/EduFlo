import assert from 'node:assert/strict'
import test from 'node:test'
import { MongoClient } from 'mongodb'
import { mongoTransaction } from '../lib/server/learning-v2/database/tenant-write.js'

const enabled = process.env.RUN_LEARNING_V2_MONGO_TESTS === '1'

test('H10 standalone Mongo rejects the mandatory transaction boundary', { skip: !enabled }, async () => {
  const client = new MongoClient(process.env.MONGO_URL)
  await client.connect()
  const db = client.db(process.env.DB_NAME)
  try {
    await assert.rejects(
      mongoTransaction(db, (session) => db.collection('h10_transaction_probe').insertOne({ synthetic: true }, { session })),
      (error) => /Transaction numbers are only allowed|replica set|mongos/i.test(String(error?.message)),
    )
    assert.equal(await db.collection('h10_transaction_probe').countDocuments({}), 0)
  } finally { await client.close() }
})
