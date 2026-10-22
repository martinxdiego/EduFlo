// Server-only: Node AsyncLocalStorage and crypto deliberately cannot enter a client bundle.
// Provisioning configuration and authenticated Mongo observations are the only inputs.
import { AsyncLocalStorage } from 'node:async_hooks'
import { HOSTING_CAPABILITY_CONTRACT, CORE_FEATURES, SYNTHETIC_V2_FEATURES, stagingBindingSchema, canonical, hostingDigest } from './hosting-binding-shared.js'
import { ACTIVATION_BINDING_CONTRACT, stagingActivationBindingSchema, deploymentIdSchema,
  validActivationReadToken, readStagingActivation, activationCurrent } from './hosting-activation-v2.js'
export { HOSTING_CAPABILITY_CONTRACT, CORE_FEATURES, SYNTHETIC_V2_FEATURES, stagingBindingSchema, hostingDigest }
const allowedFeatures = [...CORE_FEATURES, ...SYNTHETIC_V2_FEATURES.map((name) => `learning_v2.${name}`)]

const requestAuthority = new AsyncLocalStorage()
const bindingKeys = ['NODE_ENV', 'VERCEL', 'VERCEL_ENV', 'VERCEL_TARGET_ENV', 'VERCEL_PROJECT_ID',
  'VERCEL_GIT_PROVIDER', 'VERCEL_GIT_REPO_OWNER', 'VERCEL_GIT_REPO_SLUG', 'VERCEL_GIT_COMMIT_REF',
  'VERCEL_GIT_COMMIT_SHA', 'VERCEL_DEPLOYMENT_ID', 'EDUFLOW_APP_ENV', 'EDUFLOW_HOSTING_BINDING',
  'EDUFLOW_HOSTING_CONFIG_VERSION', 'EDUFLOW_STAGING_EPOCH', 'EDUFLOW_SYNTHETIC_DATA',
  'EDUFLOW_RUNTIME_APPROVAL', 'EDUFLOW_PAID_AUTHORITY', 'DB_NAME', 'MONGO_URL', 'LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED',
  'EDUFLOW_HOSTING_ACTIVATION_REQUIRED', 'EDUFLOW_STAGING_APPROVAL_READ_TOKEN']
function fingerprint(environment) {
  return hostingDigest(Object.fromEntries(Object.entries(environment).filter(([key]) => bindingKeys.includes(key)
    || key.startsWith('RUN_TUTOR_PROVIDER_') || key.startsWith('LEARNING_V2_PHASE_') || key === 'LEARNING_V2_ENABLED')))
}
function productionSignal(environment) {
  let binding
  try { binding = JSON.parse(environment.EDUFLOW_HOSTING_BINDING || 'null') } catch {}
  return environment.VERCEL_ENV === 'production' || environment.VERCEL_TARGET_ENV === 'production'
    || environment.EDUFLOW_APP_ENV === 'production' || binding?.application_environment === 'production'
}
function decision(environment, reason, features = [], contract = HOSTING_CAPABILITY_CONTRACT) {
  return Object.freeze({ contract_version: contract, environment, reason,
    features: Object.freeze([...features]), runtime_approval: false, paid_authority: false,
    provider_transport: false, ai_grading: false, live_tutor: false,
    staging_core_ready: false, staging_learning_v2_ready: false, staging_provider_ready: false })
}

// This inspects controlled configuration only. staging_candidate is NOT a capability.
export function inspectHostingConfiguration(environment = process.env) {
  if (productionSignal(process.env) || productionSignal(environment)) return { environment: 'production', reason: 'PRODUCTION_SIGNAL' }
  if (environment !== process.env && process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview') {
    return { environment: 'production', reason: 'PRODUCTION_PROCESS' }
  }
  if (environment !== process.env && process.env.VERCEL && fingerprint(environment) !== fingerprint(process.env)) {
    return { environment: 'deny', reason: 'CALLER_OVERRIDE_DENIED' }
  }
  const hosted = Object.entries(environment).some(([key, value]) => key.startsWith('VERCEL') && Boolean(value))
  if (!hosted && !environment.EDUFLOW_HOSTING_BINDING && !environment.EDUFLOW_STAGING_EPOCH
    && !environment.EDUFLOW_APP_ENV?.match(/^(staging|production)$/)) {
    let localDatabase = false
    try {
      const uri = new URL(environment.MONGO_URL)
      localDatabase = uri.protocol === 'mongodb:' && ['127.0.0.1', 'localhost', '[::1]'].includes(uri.hostname)
        && /^eduflow_learning_v2_test_[a-z0-9_-]+$/.test(environment.DB_NAME || '')
    } catch {}
    if (['development', 'test'].includes(environment.NODE_ENV)
      && environment.EDUFLOW_HOSTING_PROFILE === 'local-synthetic' && environment.EDUFLOW_SYNTHETIC_DATA === 'true'
      && (!environment.EDUFLOW_APP_ENV || environment.EDUFLOW_APP_ENV === 'development') && localDatabase) {
      return { environment: 'development', reason: 'EXPLICIT_LOCAL_SYNTHETIC_PROFILE' }
    }
    return { environment: environment.NODE_ENV === 'production' ? 'production' : 'deny', reason: 'UNBOUND_ENVIRONMENT' }
  }
  let binding
  let activationRequired = false
  try {
    const raw = JSON.parse(environment.EDUFLOW_HOSTING_BINDING)
    activationRequired = raw?.contract_version === ACTIVATION_BINDING_CONTRACT
    binding = (activationRequired ? stagingActivationBindingSchema : stagingBindingSchema).parse(raw)
    if (activationRequired && (environment.EDUFLOW_HOSTING_ACTIVATION_REQUIRED !== 'true'
      || !deploymentIdSchema.safeParse(environment.VERCEL_DEPLOYMENT_ID).success
      || !validActivationReadToken(environment.EDUFLOW_STAGING_APPROVAL_READ_TOKEN))) throw new Error('Missing activation configuration')
    if (!activationRequired && environment.EDUFLOW_HOSTING_ACTIVATION_REQUIRED) throw new Error('Unsigned binding denied')
  } catch {
    return { environment: 'deny', reason: 'INVALID_STAGING_BINDING' }
  }
  const expected = {
    VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview', NODE_ENV: 'production', EDUFLOW_APP_ENV: 'staging',
    VERCEL_PROJECT_ID: binding.project_id, VERCEL_GIT_PROVIDER: binding.repository.provider,
    VERCEL_GIT_REPO_OWNER: binding.repository.owner, VERCEL_GIT_REPO_SLUG: binding.repository.slug,
    VERCEL_GIT_COMMIT_REF: binding.branch, VERCEL_GIT_COMMIT_SHA: binding.revision,
    ...(!activationRequired ? { VERCEL_DEPLOYMENT_ID: binding.deployment_id } : {}),
    DB_NAME: binding.database.name, EDUFLOW_STAGING_EPOCH: binding.staging_epoch,
    EDUFLOW_HOSTING_CONFIG_VERSION: binding.configuration_version, EDUFLOW_SYNTHETIC_DATA: 'true',
    EDUFLOW_RUNTIME_APPROVAL: 'false', EDUFLOW_PAID_AUTHORITY: 'false',
  }
  if (Object.entries(expected).some(([key, value]) => environment[key] !== value)
    || (environment.LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED && environment.LEARNING_V2_TUTOR_PROVIDER_RUNTIME_ENABLED !== '0')
    || Object.entries(environment).some(([key, value]) => key.startsWith('RUN_TUTOR_PROVIDER_') && value && value !== '0')) {
    return { environment: 'deny', reason: 'STAGING_BINDING_MISMATCH' }
  }
  return { environment: 'staging_candidate', reason: 'DATABASE_VERIFICATION_REQUIRED', binding }
}

export function resolveHostingCapabilities(environment = process.env) {
  const config = inspectHostingConfiguration(environment)
  if (config.environment === 'development') return decision('development', config.reason, allowedFeatures)
  const authority = requestAuthority.getStore()
  if (config.environment === 'staging_candidate' && authority?.fingerprint === fingerprint(environment)
    && (!authority.activation || activationCurrent(authority.activation))) {
    return decision('staging', 'VERIFIED_SYNTHETIC_PREVIEW', config.binding.features, config.binding.contract_version)
  }
  return decision(config.environment === 'production' ? 'production' : 'deny', config.reason)
}

export class HostingCapabilityError extends Error {
  constructor() { super('Hosting capability denied.'); this.code = 'HOSTING_CAPABILITY_DENIED'; this.status = 403 }
}

// Proof lives only within the verified request. No caller completeness flag, DB marker,
// header, cookie, cached readiness record or persisted claim can manufacture this scope.
export async function withVerifiedHostingDatabase(db, operation, environment = process.env) {
  const config = inspectHostingConfiguration(environment)
  if (config.environment !== 'staging_candidate') throw new HostingCapabilityError()
  const before = fingerprint(environment)
  let activation
  if (config.binding.contract_version === ACTIVATION_BINDING_CONTRACT) {
    try { activation = await readStagingActivation(config.binding, environment) } catch { throw new HostingCapabilityError() }
  }
  const expected = config.binding.database
  const hello = await db.command({ hello: 1 }, { maxTimeMS: 5000 })
  const connection = await db.command({ connectionStatus: 1, showPrivileges: true }, { maxTimeMS: 5000 })
  const privileges = connection.authInfo?.authenticatedUserPrivileges
  if (db.databaseName !== expected.name || hello.setName !== expected.replica_set || hello.isWritablePrimary !== true
    || !Number.isInteger(hello.logicalSessionTimeoutMinutes)
    || canonical(hello.hosts) !== canonical(expected.hosts)
    || canonical(connection.authInfo?.authenticatedUsers) !== canonical([expected.principal])
    || !Array.isArray(privileges) || !privileges.length
    || privileges.some((grant) => grant.resource?.db !== expected.name || grant.resource?.anyResource || grant.resource?.cluster)
    || hostingDigest(privileges) !== expected.privileges_digest || fingerprint(environment) !== before
    || (activation && !activationCurrent(activation))) throw new HostingCapabilityError()
  return requestAuthority.run(Object.freeze({ fingerprint: before, activation }), operation)
}
