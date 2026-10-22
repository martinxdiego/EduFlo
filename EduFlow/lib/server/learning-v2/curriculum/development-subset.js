export const DEVELOPMENT_FRAMEWORK_ID = 'frm_01a035a6-a6c1-743d-95b0-f5962270d126'
export const DEVELOPMENT_FRAMEWORK_VERSION = 'dev-test-v1'

export const DEVELOPMENT_CURRICULUM_SUBSET = Object.freeze({
  framework: Object.freeze({
    framework_id: DEVELOPMENT_FRAMEWORK_ID,
    version: DEVELOPMENT_FRAMEWORK_VERSION,
    scope: 'global',
    tenant_id: null,
    name: 'EduFlow Development Curriculum Subset (NON-AUTHORITATIVE)',
    locale: 'de-CH',
    source_type: 'development_test',
    authoritative: false,
    source: Object.freeze({
      publisher: 'EduFlow development fixture',
      namespace: 'eduflow-development',
      license_review_status: 'not_applicable_non_authoritative',
    }),
    status: 'published',
  }),
  nodes: Object.freeze([
    Object.freeze({
      competency_id: 'cmp_01a035a6-a6c4-719a-940a-dc4d78a9cba6',
      node_type: 'subject',
      external_reference: Object.freeze({ namespace: 'eduflow-development', code: 'DEV-SUBJECT-MATH', locale: 'de-CH' }),
      labels: Object.freeze({ 'de-CH': 'Entwicklungsfach Mathematik (nicht autoritativ)' }),
      parent_competency_id: null,
      prerequisites: Object.freeze([]),
    }),
    Object.freeze({
      competency_id: 'cmp_01a035a6-a6c4-719a-940a-e23172eb4dd6',
      node_type: 'domain',
      external_reference: Object.freeze({ namespace: 'eduflow-development', code: 'DEV-DOMAIN-NUMBERS', locale: 'de-CH' }),
      labels: Object.freeze({ 'de-CH': 'Entwicklungsbereich Zahlen (nicht autoritativ)' }),
      parent_competency_id: 'cmp_01a035a6-a6c4-719a-940a-dc4d78a9cba6',
      prerequisites: Object.freeze([]),
    }),
    Object.freeze({
      competency_id: 'cmp_01a035a6-a6c5-7091-82e0-6010519b91e5',
      node_type: 'competency',
      external_reference: Object.freeze({ namespace: 'eduflow-development', code: 'DEV-COMP-ADDITION', locale: 'de-CH' }),
      labels: Object.freeze({ 'de-CH': 'Entwicklungskompetenz Addition erklären (nicht autoritativ)' }),
      parent_competency_id: 'cmp_01a035a6-a6c4-719a-940a-e23172eb4dd6',
      prerequisites: Object.freeze([]),
    }),
    Object.freeze({
      competency_id: 'cmp_01a035a6-a6c5-7091-82e0-64fcfe975ef2',
      node_type: 'competency',
      external_reference: Object.freeze({ namespace: 'eduflow-development', code: 'DEV-COMP-STRATEGY', locale: 'de-CH' }),
      labels: Object.freeze({ 'de-CH': 'Entwicklungskompetenz Rechenstrategie beschreiben (nicht autoritativ)' }),
      parent_competency_id: 'cmp_01a035a6-a6c4-719a-940a-e23172eb4dd6',
      prerequisites: Object.freeze([{ competency_id: 'cmp_01a035a6-a6c5-7091-82e0-6010519b91e5', kind: 'recommended', source: 'development_fixture' }]),
    }),
  ]),
})

export function requireDevelopmentCurriculumSeedAllowed(environment = process.env) {
  if (environment.NODE_ENV === 'production' || environment.LEARNING_V2_ALLOW_DEV_CURRICULUM !== '1') {
    throw new Error('Development curriculum seeding is disabled')
  }
}
