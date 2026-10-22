import { CORE_FEATURES, SYNTHETIC_V2_FEATURES, hostingDigest } from '../../lib/server/hosting-capabilities-v1.js'

export function stagingFixture() {
  const privileges = [{ resource: { db: 'eduflow_synthetic_stage', collection: '' }, actions: ['find', 'insert', 'update'] }]
  const binding = { contract_version: 'hosting-capabilities-v1', configuration_version: 'synthetic-config-v1',
    review_ref: 'synthetic-offline-review', application_environment: 'staging',
    repository: { provider: 'github', owner: 'synthetic-owner', slug: 'synthetic-repository' },
    project_id: 'synthetic-project', branch: 'codex/synthetic-staging', revision: 'a'.repeat(40), deployment_id: 'synthetic-deployment',
    database: { name: 'eduflow_synthetic_stage', replica_set: 'synthetic-rs', hosts: ['127.0.0.1:27017'],
      principal: { user: 'synthetic-runtime', db: 'eduflow_synthetic_stage' }, privileges_digest: hostingDigest(privileges) },
    staging_epoch: 'synthetic-epoch-1', synthetic_data: true, runtime_approval: false, paid_authority: false,
    features: [...CORE_FEATURES, ...SYNTHETIC_V2_FEATURES.map((key) => `learning_v2.${key}`)],
  }
  const environment = { NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview',
    EDUFLOW_APP_ENV: 'staging', EDUFLOW_HOSTING_BINDING: JSON.stringify(binding), EDUFLOW_HOSTING_CONFIG_VERSION: binding.configuration_version,
    VERCEL_PROJECT_ID: binding.project_id, VERCEL_GIT_PROVIDER: 'github', VERCEL_GIT_REPO_OWNER: binding.repository.owner,
    VERCEL_GIT_REPO_SLUG: binding.repository.slug, VERCEL_GIT_COMMIT_REF: binding.branch, VERCEL_GIT_COMMIT_SHA: binding.revision,
    VERCEL_DEPLOYMENT_ID: binding.deployment_id, DB_NAME: binding.database.name, MONGO_URL: 'mongodb://127.0.0.1:27017',
    EDUFLOW_STAGING_EPOCH: binding.staging_epoch, EDUFLOW_SYNTHETIC_DATA: 'true', EDUFLOW_RUNTIME_APPROVAL: 'false', EDUFLOW_PAID_AUTHORITY: 'false',
    LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED: '0', LEARNING_V2_ENABLED: '1', LEARNING_V2_PHASE_2_ENABLED: '1',
    LEARNING_V2_PHASE_3_ENABLED: '1', LEARNING_V2_PHASE_3B_ENABLED: '1', LEARNING_V2_PHASE_4_ENABLED: '1', LEARNING_V2_PHASE_5_ENABLED: '1' }
  const observations = { hello: { isWritablePrimary: true, logicalSessionTimeoutMinutes: 30, setName: binding.database.replica_set, hosts: [...binding.database.hosts] },
    connection: { authInfo: { authenticatedUsers: [{ ...binding.database.principal }], authenticatedUserPrivileges: privileges } } }
  const db = { databaseName: binding.database.name, async command(command) { return structuredClone(command.hello ? observations.hello : observations.connection) } }
  return { binding, environment, observations, db }
}
