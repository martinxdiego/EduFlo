// Explicit, read-only Atlas preflight. Never loads the application's .env files.
import { readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MongoClient } from 'mongodb'
import { z } from 'zod'
import { hostingDigest } from '../lib/server/hosting-capabilities-v1.js'

export const stagingTargetSchema = z.object({
  project_id: z.string().regex(/^[a-f0-9]{24}$/),
  cluster_name: z.string().min(1),
  database_name: z.string().regex(/^eduflow_learning_v2_test_[a-z0-9_-]+$/).max(38),
  srv_hostname: z.string().regex(/^[a-z0-9-]+\.[a-z0-9-]+\.mongodb\.net$/),
  replica_set: z.string().min(1),
  hosts: z.array(z.string().regex(/^[a-z0-9.-]+\.mongodb\.net:\d+$/)).min(1),
  principal: z.object({ user: z.string().min(1), db: z.literal('admin') }).strict(),
}).strict()

function requireMatch(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { preflightCode: code })
}

export function inspectStagingObservation(targetInput, hello, connection) {
  const target = stagingTargetSchema.parse(targetInput)
  const info = connection?.authInfo
  const grants = info?.authenticatedUserPrivileges
  requireMatch(hello?.setName === target.replica_set
    && hostingDigest(hello?.hosts) === hostingDigest(target.hosts)
    && hello?.isWritablePrimary === true
    && Number.isInteger(hello?.logicalSessionTimeoutMinutes), 'STAGING_TOPOLOGY_MISMATCH')
  requireMatch(hostingDigest(info?.authenticatedUsers) === hostingDigest([target.principal]), 'STAGING_PRINCIPAL_MISMATCH')
  requireMatch(hostingDigest(info?.authenticatedUserRoles) === hostingDigest([
    { role: 'readWrite', db: target.database_name },
  ]), 'STAGING_ROLE_MISMATCH')
  requireMatch(Array.isArray(grants) && grants.length > 0
    && grants.every((grant) => grant.resource?.db === target.database_name
      && !grant.resource.anyResource && !grant.resource.cluster
      && Array.isArray(grant.actions) && grant.actions.length > 0), 'STAGING_PRIVILEGES_NOT_ISOLATED')
  return {
    project_id: target.project_id, cluster_name: target.cluster_name,
    database: {
      name: target.database_name, replica_set: hello.setName, hosts: hello.hosts,
      principal: target.principal, privileges_digest: hostingDigest(grants),
    },
    checked_at: new Date().toISOString(),
  }
}

async function main(args) {
  requireMatch(args.length === 3, 'USAGE: node scripts/verify-atlas-staging.mjs TARGET_JSON PASSWORD_JSON OUTPUT_JSON')
  const [targetPath, passwordPath, outputPath] = args.map((file) => resolve(file))
  requireMatch(new Set([targetPath, passwordPath, outputPath]).size === 3, 'PREFLIGHT_PATHS_MUST_DIFFER')
  const target = stagingTargetSchema.parse(JSON.parse(await readFile(targetPath, 'utf8')))
  const passwordStat = await stat(passwordPath)
  requireMatch((passwordStat.mode & 0o077) === 0, 'STAGING_PASSWORD_FILE_MUST_BE_PRIVATE')
  const credentials = JSON.parse(await readFile(passwordPath, 'utf8'))
  requireMatch(typeof credentials.password === 'string' && credentials.password.length > 0, 'STAGING_PASSWORD_MISSING')
  const uri = `mongodb+srv://${encodeURIComponent(target.principal.user)}:${encodeURIComponent(credentials.password)}@${target.srv_hostname}/?authSource=admin&retryWrites=true&w=majority`
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000 })
  try {
    await client.connect()
    const db = client.db(target.database_name)
    const hello = await db.command({ hello: 1 }, { maxTimeMS: 5000 })
    const connection = await db.command({ connectionStatus: 1, showPrivileges: true }, { maxTimeMS: 5000 })
    const observation = inspectStagingObservation(target, hello, connection)
    await writeFile(outputPath, `${JSON.stringify(observation, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    console.log('Atlas staging identity and database-scoped privileges verified. Observation saved; no application deployment approval issued.')
  } finally {
    await client.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    // Driver errors can contain connection information. Emit only controlled codes.
    console.error(error.preflightCode || (error instanceof z.ZodError ? 'INVALID_STAGING_TARGET' : 'STAGING_PREFLIGHT_FAILED'))
    process.exitCode = 1
  })
}
