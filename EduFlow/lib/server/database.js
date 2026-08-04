import { MongoClient } from 'mongodb'

let client
let database
let connectionPromise
let indexPromise

function databaseConfig() {
  const mongoUrl = process.env.MONGO_URL
  const databaseName = process.env.DB_NAME
  if (!mongoUrl || !databaseName) {
    throw new Error('MongoDB configuration is missing')
  }
  return { mongoUrl, databaseName }
}

async function ensureOperationalIndexes(db) {
  if (!indexPromise) {
    indexPromise = Promise.all([
      db.collection('rate_limits').createIndex({ key: 1 }, { unique: true }),
      db.collection('rate_limits').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
      db.collection('password_reset_tokens').createIndex({ token_hash: 1 }, { unique: true }),
      db.collection('password_reset_tokens').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
      db.collection('password_reset_tokens').createIndex({ user_id: 1 }),
      db.collection('ai_generations').createIndex({ id: 1 }, { unique: true }),
      db.collection('ai_generations').createIndex({ user_id: 1, created_at: -1 }),
      db.collection('ai_generations').createIndex({ user_id: 1, feature: 1, created_at: -1 }),
      db.collection('generated_assets').createIndex({ id: 1 }, { unique: true }),
      db.collection('generated_assets').createIndex({ user_id: 1, created_at: -1 }),
    ]).catch((error) => {
      indexPromise = null
      throw error
    })
  }
  await indexPromise
}

export async function getDatabase() {
  if (database) return database
  if (connectionPromise) return connectionPromise

  connectionPromise = (async () => {
    const { mongoUrl, databaseName } = databaseConfig()
    const nextClient = new MongoClient(mongoUrl)
    try {
      await nextClient.connect()
      const nextDatabase = nextClient.db(databaseName)
      await ensureOperationalIndexes(nextDatabase)
      client = nextClient
      database = nextDatabase
      return database
    } catch (error) {
      await nextClient.close().catch(() => {})
      connectionPromise = null
      throw error
    }
  })()

  return connectionPromise
}
