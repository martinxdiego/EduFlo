import { PUBLIC_V2_ROUTES, ROUTE_MANIFEST_VERSION } from './routes-v1.mjs'

export const RELEASE_MANIFEST_VERSION = 'learning-v2-release-profiles-v41'

export const FEATURE_FLAGS = Object.freeze([
  'LEARNING_V2_ENABLED',
  'LEARNING_V2_PHASE_2_ENABLED',
  'LEARNING_V2_PHASE_3_ENABLED',
  'LEARNING_V2_PHASE_3B_ENABLED',
  'LEARNING_V2_PHASE_4_ENABLED',
  'LEARNING_V2_PHASE_5_ENABLED',
])

const flags = (...enabled) => Object.freeze(Object.fromEntries(FEATURE_FLAGS.map((name, index) => [name, enabled[index] ? '1' : '0'])))
const counts = (tests, pass, skipped = 0) => Object.freeze({ tests, pass, fail: 0, skipped })
const step = (id, files, expected, extra = {}) => Object.freeze({ id, files: Object.freeze(files), expected, ...extra })
const profile = (id, values) => Object.freeze({ id, required: true, nodeEnv: 'test', flags: flags(), ...values })

const SECURITY_TESTS = Object.freeze([
  'tests/security.test.mjs', 'tests/validation.test.mjs', 'tests/worksheet-quality.test.mjs',
  'tests/worksheet-answers.test.mjs', 'tests/worksheet-generation.test.mjs', 'tests/worksheet-usage.test.mjs',
  'tests/teaching-context.test.mjs', 'tests/launch-readiness.test.mjs', 'tests/student-material.test.mjs',
  'tests/ai-cost.test.mjs', 'tests/public-site.test.mjs',
  'tests/dossier-quality.test.mjs', 'tests/chat-tools.test.mjs', 'tests/studio-quality.test.mjs',
  'tests/product-workspace.test.mjs', 'tests/learning-workflow.test.mjs',
  'tests/demo-store.test.mjs', 'tests/demo-export.test.mjs',
])

const LEARNING_UNIT_TESTS = Object.freeze([
  'tests/learning-v2-phase0.test.mjs', 'tests/learning-v2-phase1.test.mjs', 'tests/learning-v2-phase2.test.mjs',
  'tests/learning-v2-phase3.test.mjs', 'tests/learning-v2-phase3b.test.mjs', 'tests/learning-v2-phase4.test.mjs',
  'tests/learning-v2-phase5.test.mjs', 'tests/learning-v2-hardening-p1a.test.mjs', 'tests/learning-v2-h10-runner.test.mjs',
  'tests/learning-v2-h12a.test.mjs', 'tests/learning-v2-h12b.test.mjs', 'tests/learning-v2-h14a.test.mjs',
  'tests/learning-v2-h14b.test.mjs', 'tests/learning-v2-h14b-diagnostic-probe.test.mjs',
  'tests/learning-v2-h14b-full-evaluation-run-2.test.mjs', 'tests/learning-v2-h14b-prompt-v2.test.mjs',
  'tests/learning-v2-h14b-prompt-v2-full-evaluation-run-1.test.mjs',
  'tests/learning-v2-h14b-leakage-evidence.test.mjs',
  'tests/learning-v2-h14b-evidence-hardened-run-1.test.mjs',
  'tests/learning-v2-h14b-prompt-v3.test.mjs',
  'tests/learning-v2-h14b-prompt-v3-fixture-006-probe.test.mjs',
  'tests/learning-v2-h14b-safe-fallback.test.mjs',
  'tests/learning-v2-h14b-v7-r1-r2-run-1.test.mjs',
  'tests/learning-v2-h14b-evaluation-accounting.test.mjs',
  'tests/learning-v2-h14b-accounting-release-truth-verification.test.mjs',
  'tests/learning-v2-h14b-v8-r1-r2-run-1.test.mjs',
  'tests/learning-v2-h14b-quality-policy.test.mjs',
  'tests/learning-v2-h14b-human-review-framework.test.mjs',
  'tests/learning-v2-h14b-human-review-verification-fixes.test.mjs',
  'tests/learning-v2-h14b-human-review-trusted-clock.test.mjs',
  'tests/learning-v2-h14b-human-review-first-pass-binding.test.mjs',
  'tests/learning-v2-h14b-paid-execution-framework.test.mjs',
  'tests/learning-v2-h14b-paid-execution-fixes.test.mjs',
  'tests/learning-v2-h14b-paid-execution-rv-fixes.test.mjs',
  'tests/learning-v2-h14b-paid-execution-fia01.test.mjs',
  'tests/learning-v2-qualification-integration.test.mjs',
  'tests/learning-v2-qualification-native-wire.test.mjs',
  'tests/learning-v2-qualification-native-bridge.test.mjs',
  'tests/learning-v2-qualification-user-mode-trust.test.mjs',
  'tests/learning-v2-qualification-qi-a2.test.mjs',
])

const MONGO_TESTS = Object.freeze([
  'tests/hosting-capabilities-mongo.integration.test.mjs',
  'tests/learning-v2-mongo.integration.test.mjs', 'tests/learning-v2-phase4-mongo.integration.test.mjs',
  'tests/learning-v2-phase3b-mongo.integration.test.mjs', 'tests/learning-v2-phase5-mongo.integration.test.mjs',
  'tests/learning-v2-hardening-p0-mongo.integration.test.mjs', 'tests/learning-v2-hardening-p1a-mongo.integration.test.mjs',
  'tests/learning-v2-h12b-mongo.integration.test.mjs', 'tests/learning-v2-h14a-mongo.integration.test.mjs',
  'tests/learning-v2-h14b-mongo.integration.test.mjs',
  'tests/learning-v2-h14b-safe-fallback.mongo.integration.test.mjs',
])

const routeProfile = (id, profileFlags, capabilities, nodeEnv = 'test') => profile(id, {
  nodeEnv, flags: profileFlags, mongo: 'replica-set', server: nodeEnv === 'production' ? 'production' : 'development',
  expectedCapabilities: Object.freeze(capabilities),
  steps: Object.freeze([step('route-matrix', ['tests/learning-v2-h10-route-matrix.integration.test.mjs'], counts(1, 1), { gate: 'RUN_INTEGRATION_TESTS' })]),
})

export const RELEASE_PROFILES = Object.freeze([
  profile('unit-default', {
    steps: Object.freeze([
      step('security-unit', SECURITY_TESTS, counts(86, 86)),
      step('hosting-provider-foundations', ['tests/hosting-provider-foundations.test.mjs'], counts(7, 7)),
      step('hosting-capabilities', ['tests/hosting-capabilities.test.mjs'], counts(36, 36)),
      step('staging-activation', ['tests/hosting-activation-v2.test.mjs', 'tests/staging-activation-cli.test.mjs'], counts(46, 46)),
      // Updated only when this manifest version changes after an observed, reviewed run.
      step('learning-v2-unit', LEARNING_UNIT_TESTS, counts(943, 943)),
    ]),
  }),
  profile('mongo-invariants', {
    mongo: 'replica-set', flags: flags(true, true, true, true, true, true),
    steps: Object.freeze([step('mongo-invariants', MONGO_TESTS, counts(153, 153), { gate: 'RUN_LEARNING_V2_MONGO_TESTS' })]),
  }),
  profile('phase2', {
    mongo: 'replica-set', server: 'development', flags: flags(true, true),
    steps: Object.freeze([step('phase2-http', ['tests/learning-v2-phase2-api.integration.test.mjs'], counts(1, 1), { gate: 'RUN_INTEGRATION_TESTS' })]),
  }),
  profile('phase3-baseline', {
    mongo: 'replica-set', server: 'development', flags: flags(true, true, true),
    steps: Object.freeze([step('phase3-http', ['tests/learning-v2-phase3-api.integration.test.mjs'], counts(1, 1), { gate: 'RUN_INTEGRATION_TESTS' })]),
  }),
  profile('phase3b', {
    // The accepted Phase-3b HTTP contract also verifies the bounded Phase-4
    // teacher detail projection after Reflection. It stays separate from the
    // incompatible Phase-3 baseline and does not enable recommendations.
    mongo: 'replica-set', server: 'development', flags: flags(true, true, true, true, true),
    steps: Object.freeze([step('phase3b-http', ['tests/learning-v2-phase3b-api.integration.test.mjs'], counts(1, 1), { gate: 'RUN_INTEGRATION_TESTS' })]),
  }),
  profile('phase4', {
    mongo: 'replica-set', server: 'development', flags: flags(true, true, true, true, true),
    steps: Object.freeze([step('phase4-http', ['tests/learning-v2-phase4-api.integration.test.mjs'], counts(1, 1), { gate: 'RUN_INTEGRATION_TESTS' })]),
  }),
  profile('phase5', {
    mongo: 'replica-set', server: 'development', flags: flags(true, true, true, true, true, true),
    steps: Object.freeze([step('phase5-http', [
      'tests/learning-v2-phase5-api.integration.test.mjs',
      'tests/learning-v2-hardening-p0-api.integration.test.mjs',
      'tests/api-authz.integration.test.mjs',
    ], counts(14, 14), { gate: 'RUN_INTEGRATION_TESTS' })]),
  }),
  routeProfile('base-disabled', flags(), { definitions: false, ingestion: false, tutor: false, reflection: false, teacher: false, recommendations: false }),
  routeProfile('no-tutor', flags(true, true, false, true, true, true), { definitions: true, ingestion: true, tutor: false, reflection: false, teacher: true, recommendations: true }),
  routeProfile('no-teacher', flags(true, true, true, true, false, true), { definitions: true, ingestion: true, tutor: true, reflection: true, teacher: false, recommendations: false }),
  routeProfile('production-all-off', flags(), { definitions: false, ingestion: false, tutor: false, reflection: false, teacher: false, recommendations: false }, 'production'),
  routeProfile('production-all-requested-on', flags(true, true, true, true, true, true), { definitions: false, ingestion: false, tutor: false, reflection: false, teacher: false, recommendations: false }, 'production'),
  profile('unavailable-db', {
    server: 'development', mongo: 'unavailable', flags: flags(true, true, true, true, true, true),
    steps: Object.freeze([step('unavailable-db-http', ['tests/learning-v2-h10-unavailable-db.integration.test.mjs'], counts(1, 1), { gate: 'RUN_INTEGRATION_TESTS' })]),
  }),
  profile('standalone-mongo', {
    server: 'development', mongo: 'standalone', flags: flags(true, true, true, true, true, true),
    steps: Object.freeze([step('standalone-transaction', ['tests/learning-v2-h10-standalone-mongo.integration.test.mjs'], counts(1, 1), { gate: 'RUN_LEARNING_V2_MONGO_TESTS' })]),
  }),
  Object.freeze({
    id: 'paid-provider-evaluation', required: false, optInEnv: 'RUN_TUTOR_PROVIDER_EVALS', preflight: 'paid-tutor-governance', nodeEnv: 'test', flags: flags(true, true, true),
    steps: Object.freeze([step('paid-provider', ['tests/learning-v2-tutor-provider.evaluation.test.mjs'], counts(1, 1), { gate: 'RUN_TUTOR_PROVIDER_EVALS' })]),
  }),
])

export const RELEASE_PROFILE_MANIFEST = Object.freeze({
  version: RELEASE_MANIFEST_VERSION,
  routeManifestVersion: ROUTE_MANIFEST_VERSION,
  routes: PUBLIC_V2_ROUTES,
  profiles: RELEASE_PROFILES,
})

export function getReleaseProfile(id) {
  return RELEASE_PROFILES.find((item) => item.id === id) || null
}
