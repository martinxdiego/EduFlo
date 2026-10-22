export const LEARNING_V2_DATA_INVENTORY_VERSION = 'learning-v2-data-inventory-v23'

const UNRESOLVED_RETENTION = Object.freeze({
  status: 'unresolved',
  current_behavior: 'No product retention deadline is enforced by Learning V2.',
})
const UNRESOLVED_BACKUP = Object.freeze({
  status: 'unresolved',
  current_behavior: 'No repository-level backup deletion or restore lifecycle is defined.',
})
const UNRESOLVED_HOLD = Object.freeze({
  status: 'unresolved_no_runtime_implementation',
  current_behavior: 'No Legal Hold behavior is implemented by Learning V2.',
})

function entry(id, storageKind, values) {
  return Object.freeze({
    id,
    storage_kind: storageKind,
    implementation_status: values.implementationStatus || 'existing_implementation',
    purpose: values.purpose,
    authority: values.authority,
    learning_authority: values.learningAuthority,
    tenant_key: values.tenantKey ?? null,
    subject_keys: Object.freeze(values.subjectKeys || []),
    field_groups: Object.freeze(values.fieldGroups || []),
    data_classes: Object.freeze(values.dataClasses || []),
    export: Object.freeze(values.export),
    mutability: values.mutability,
    rebuildable: values.rebuildable,
    current_deletion: values.currentDeletion,
    retention: Object.freeze(values.retention || UNRESOLVED_RETENTION),
    erasure: Object.freeze(values.erasure),
    backup: Object.freeze(values.backup || UNRESOLVED_BACKUP),
    legal_hold: Object.freeze(values.legalHold || UNRESOLVED_HOLD),
    known_gap: values.knownGap,
    production_blocker: values.productionBlocker === true,
  })
}

const tenantDelete = 'Deleted by the existing personal-tenant cascade using an exact tenant_id scope.'
const subjectDecision = 'Individual subject erasure is decision-required; no canonical record may be mutated or deleted by H12-B.'
const noSubject = Object.freeze([])

export const LEARNING_V2_DATA_INVENTORY = Object.freeze({
  version: LEARNING_V2_DATA_INVENTORY_VERSION,
  status: 'technical_contract_not_legal_policy',
  synthetic_data_only: true,
  entries: Object.freeze([
    entry('learning_v2_tenants', 'mongodb_collection', {
      purpose: 'Authoritative tenant lifecycle and write-fence root.', authority: 'identity_and_authorization_control', learningAuthority: 'none',
      tenantKey: 'tenant_id', subjectKeys: ['owner_teacher_id'], fieldGroups: ['tenant identity', 'owner identity', 'status', 'write/evidence revisions'], dataClasses: ['direct identifiers', 'authorization metadata'],
      export: { status: 'excluded_internal_control', section: null }, mutability: 'mutable_control_record', rebuildable: 'no',
      currentDeletion: 'Personal tenant is first marked deleting, then removed after all scoped children.', erasure: { tenant: 'delete_last', subject: 'teacher account cascade only' },
      knownGap: 'School/shared tenant lifecycle and individual learner erasure are not defined.', productionBlocker: true,
    }),
    entry('learning_v2_tenant_memberships', 'mongodb_collection', {
      purpose: 'Server-owned actor-to-tenant role binding.', authority: 'identity_and_authorization_control', learningAuthority: 'none',
      tenantKey: 'tenant_id', subjectKeys: ['actor_id'], fieldGroups: ['actor type/id', 'tenant id', 'role', 'status', 'timestamps'], dataClasses: ['direct identifiers', 'authorization metadata'],
      export: { status: 'unresolved', section: null }, mutability: 'mutable_control_record', rebuildable: 'no', currentDeletion: tenantDelete,
      erasure: { tenant: 'delete', subject: 'unresolved pending individual account/identity lifecycle' }, knownGap: 'No learner account-erasure workflow exists.', productionBlocker: true,
    }),
    entry('curriculum_frameworks', 'mongodb_collection', {
      purpose: 'Versioned curriculum framework definitions.', authority: 'domain_definition', learningAuthority: 'definition_not_learner_truth', tenantKey: 'tenant_id', subjectKeys: noSubject,
      fieldGroups: ['framework/version', 'scope', 'definition metadata'], dataClasses: ['curriculum content'], export: { status: 'not_subject_export', section: null },
      mutability: 'versioned_definition', rebuildable: 'no', currentDeletion: 'Tenant-scoped rows are deleted by tenant cascade; global rows survive.', erasure: { tenant: 'delete_tenant_scope_only', subject: 'not_applicable' },
      knownGap: 'Repository does not define product retention for retired versions.', productionBlocker: false,
    }),
    entry('curriculum_nodes', 'mongodb_collection', {
      purpose: 'Versioned competency graph nodes.', authority: 'domain_definition', learningAuthority: 'definition_not_learner_truth', tenantKey: 'tenant_id', subjectKeys: noSubject,
      fieldGroups: ['competency id', 'framework ref', 'graph relations', 'labels'], dataClasses: ['curriculum content'], export: { status: 'not_subject_export', section: null },
      mutability: 'versioned_definition', rebuildable: 'no', currentDeletion: 'Tenant-scoped rows are deleted by tenant cascade; global rows survive.', erasure: { tenant: 'delete_tenant_scope_only', subject: 'not_applicable' },
      knownGap: 'Repository does not define product retention for retired nodes.', productionBlocker: false,
    }),
    entry('learning_objectives', 'mongodb_collection', {
      purpose: 'Tenant-owned versioned learning objectives.', authority: 'domain_definition', learningAuthority: 'definition_not_learner_truth', tenantKey: 'tenant_id', subjectKeys: noSubject,
      fieldGroups: ['objective/version', 'competency targets', 'labels', 'status'], dataClasses: ['curriculum content', 'teacher-authored content'], export: { status: 'not_subject_export', section: null },
      mutability: 'versioned_definition', rebuildable: 'no', currentDeletion: tenantDelete, erasure: { tenant: 'delete', subject: 'not_applicable' },
      knownGap: 'No product retention deadline for old versions.', productionBlocker: false,
    }),
    entry('learning_tasks', 'mongodb_collection', {
      purpose: 'Tenant-owned versioned task definitions and source pins.', authority: 'domain_definition', learningAuthority: 'definition_not_learner_truth', tenantKey: 'tenant_id', subjectKeys: noSubject,
      fieldGroups: ['task/version', 'objective/competency refs', 'worksheet/question source pins', 'status'], dataClasses: ['curriculum content', 'internal source references'], export: { status: 'not_subject_export', section: null },
      mutability: 'versioned_definition', rebuildable: 'no', currentDeletion: tenantDelete, erasure: { tenant: 'delete', subject: 'not_applicable' },
      knownGap: 'Hidden source content is intentionally not part of subject export.', productionBlocker: false,
    }),
    entry('learning_attempts', 'mongodb_collection', {
      purpose: 'Immutable learner-attempt facts.', authority: 'canonical_fact', learningAuthority: 'canonical_learning_truth', tenantKey: 'tenant_id', subjectKeys: ['student_id'],
      fieldGroups: ['attempt/task/objective/competency refs', 'source provenance', 'learner answer', 'deterministic outcome', 'assistance', 'timestamps', 'idempotency'], dataClasses: ['direct identifiers', 'learner response', 'learning fact', 'provenance'],
      export: { status: 'include_minimized', section: 'canonical_facts', unresolved_fields: ['answer', 'source internal identifiers', 'idempotency_key'] }, mutability: 'immutable_append_only', rebuildable: 'source fact', currentDeletion: tenantDelete,
      erasure: { tenant: 'delete', subject: subjectDecision }, knownGap: 'D12-05 follow-up must decide preservation versus versioned de-identification for individual erasure.', productionBlocker: true,
    }),
    entry('evidence_events', 'mongodb_collection', {
      purpose: 'Explicit pedagogical interpretation of canonical facts and assessments.', authority: 'pedagogical_interpretation', learningAuthority: 'canonical_evidence_truth', tenantKey: 'tenant_id', subjectKeys: ['student_id'],
      fieldGroups: ['evidence/type/target', 'claim and independence', 'source/provenance', 'teacher note', 'explicit invalidation', 'timestamps', 'idempotency'], dataClasses: ['direct identifiers', 'pedagogical interpretation', 'teacher-authored sensitive content', 'provenance'],
      export: { status: 'include_minimized', section: 'pedagogical_interpretations', unresolved_fields: ['teacher_note', 'invalidation.note', 'provenance.created_by', 'idempotency_key'] }, mutability: 'append_with_explicit_versioned_invalidation', rebuildable: 'no; projection source', currentDeletion: tenantDelete,
      erasure: { tenant: 'delete', subject: subjectDecision }, knownGap: 'Individual mutation/deletion would change deterministic rebuild inputs and is not authorized.', productionBlocker: true,
    }),
    entry('learning_events', 'mongodb_collection', {
      purpose: 'Append-only process and audit events for Learning V2.', authority: 'process_audit', learningAuthority: 'audit_not_mastery_authority', tenantKey: 'tenant_id', subjectKeys: ['actor.id', 'aggregate.id and payload (indirect)'],
      fieldGroups: ['event/type/aggregate/sequence', 'actor', 'correlation/causation', 'payload', 'timestamps', 'idempotency'], dataClasses: ['direct identifiers', 'audit metadata', 'possible learner/teacher content'],
      export: { status: 'include_minimized', section: 'process_audit', unresolved_fields: ['payload', 'actor.id', 'correlation_id', 'causation_id', 'idempotency_key'] }, mutability: 'immutable_append_only', rebuildable: 'no', currentDeletion: tenantDelete,
      erasure: { tenant: 'delete', subject: subjectDecision }, knownGap: 'Subject linkage is partly indirect and payload-specific.', productionBlocker: true,
    }),
    entry('student_knowledge_states', 'mongodb_collection', {
      purpose: 'Deterministic materialized projection from valid Evidence.', authority: 'derived_state', learningAuthority: 'derived_not_source_truth', tenantKey: 'tenant_id', subjectKeys: ['student_id'],
      fieldGroups: ['student/competency refs', 'mastery', 'confidence', 'band', 'counts', 'projection versions/hash', 'contribution summary'], dataClasses: ['direct identifiers', 'derived learning state'],
      export: { status: 'include_minimized', section: 'derived_state', unresolved_fields: ['input_set_hash', 'evidence/task identifiers'] }, mutability: 'replaceable_projection', rebuildable: 'yes_from_active_evidence', currentDeletion: tenantDelete,
      erasure: { tenant: 'delete', subject: 'safe cache deletion; canonical Evidence remains unchanged' }, knownGap: 'Rebuild remains possible only while canonical Evidence is retained.', productionBlocker: false,
    }),
    entry('tutor_policies', 'mongodb_collection', {
      purpose: 'Immutable tutor-policy snapshots.', authority: 'policy_configuration', learningAuthority: 'policy_not_learning_truth', tenantKey: 'tenant_id', subjectKeys: noSubject,
      fieldGroups: ['policy/version', 'assignment ref', 'preset/restrictions', 'content hash', 'creator'], dataClasses: ['internal policy metadata', 'teacher identifier'],
      export: { status: 'excluded_internal_policy', section: null }, mutability: 'immutable_append_only', rebuildable: 'no', currentDeletion: tenantDelete, erasure: { tenant: 'delete', subject: 'not_subject_scoped' },
      knownGap: 'No product retention deadline for snapshots.', productionBlocker: false,
    }),
    entry('tutor_sessions', 'mongodb_collection', {
      purpose: 'Mutable tutoring process state with bounded receipts and Reflection summary.', authority: 'process_state', learningAuthority: 'not_mastery_authority_but_links_canonical_facts', tenantKey: 'tenant_id', subjectKeys: ['student_id'],
      fieldGroups: ['session/student/task/attempt refs', 'policy/model/prompt/schema/immutable approval-ref metadata', 'state counters', 'bounded provider slots with opaque call ID, separate reservation/transport counters, irreversible transport fence, lease and bounded outcome only', 'hint receipts with final accepted learner-visible output, canonical safety-contract version, provider-candidate accepted/rejected/failure state, bounded failure code and final source; rejected provider text is absent', 'retry receipts', 'Reflection status', 'timestamps'], dataClasses: ['direct identifiers', 'learner interaction', 'internal policy/provider metadata', 'idempotency/audit metadata'],
      export: { status: 'include_minimized', section: 'process_audit', unresolved_fields: ['provider_slots', 'receipts', 'Reflection text event linkage', 'policy/model/provider metadata'] }, mutability: 'cas_mutable_process_state', rebuildable: 'partially_from_attempts_and_events_not_guaranteed', currentDeletion: tenantDelete,
      erasure: { tenant: 'delete', subject: subjectDecision }, knownGap: 'Individual deletion could break event/audit and tutor-attempt linkage.', productionBlocker: true,
    }),
    entry('learning_recommendations', 'mongodb_collection', {
      purpose: 'Derived teacher recommendation plus explicit teacher decision state.', authority: 'derived_teacher_workflow', learningAuthority: 'no_mastery_or_evidence_authority', tenantKey: 'tenant_id', subjectKeys: ['student_id'],
      fieldGroups: ['student/competency/objective refs', 'input hashes/watermarks', 'candidate', 'status', 'teacher decision', 'timestamps'], dataClasses: ['direct identifiers', 'derived recommendation', 'teacher decision metadata'],
      export: { status: 'unresolved', section: null }, mutability: 'cas_mutable_decision_state', rebuildable: 'candidate yes; teacher decision no', currentDeletion: tenantDelete,
      erasure: { tenant: 'delete', subject: 'unresolved; do not delete because teacher decision history is not rebuildable' }, knownGap: 'Subject export and individual erasure of teacher decisions require a product decision.', productionBlocker: true,
    }),
    entry('submissions', 'mongodb_collection', {
      purpose: 'Legacy durable assignment submission and canonical source for Learning V2 ingestion.', authority: 'legacy_canonical_fact', learningAuthority: 'canonical_source_for_attempts', tenantKey: 'learning_v2_tenant_id (V2 rows); otherwise indirect via assignment_id', subjectKeys: ['student_id'],
      fieldGroups: ['submission/assignment/student refs', 'answers', 'question results including hidden answers', 'score/grade', 'Learning V2 intent/slot pins', 'timestamps'], dataClasses: ['direct identifiers', 'learner response', 'hidden answer', 'grade', 'submission authority token metadata'],
      export: { status: 'include_minimized', section: 'canonical_facts', unresolved_fields: ['answers', 'studentAnswer', 'correctAnswer', 'question text/feedback', 'submission intent fields'] }, mutability: 'durable_legacy_record_with_explicit_override_fields', rebuildable: 'source fact', currentDeletion: 'Deleted by teacher account cascade through exact assignment_ids.',
      erasure: { tenant: 'delete_indirect_assignment_scope', subject: subjectDecision }, knownGap: 'Individual learner erasure cannot delete this source while linked Attempts/Evidence remain.', productionBlocker: true,
    }),
    entry('ai_generations', 'mongodb_collection', {
      purpose: 'Minimized Tutor provider telemetry; raw payloads are not stored.', authority: 'operational_telemetry', learningAuthority: 'none', tenantKey: 'tenant_id', subjectKeys: ['user_id'],
      fieldGroups: ['opaque call/generation id', 'actor/tenant refs', 'provider/model/prompt/policy/canonical-safety-contract versions', 'bounded provider-candidate gate result, validation code and final source without raw payload', 'token usage', 'timestamps'], dataClasses: ['direct identifiers', 'provider operational metadata', 'usage metadata'],
      export: { status: 'include_minimized', section: 'operational_metadata', unresolved_fields: ['provider/model/prompt/policy metadata'] }, mutability: 'append_only_operational', rebuildable: 'no', currentDeletion: 'Deleted by tenant cascade; H12-B permits exact self-subject operational cleanup.',
      erasure: { tenant: 'delete', subject: 'safe exact tenant_id + user_id deletion' }, knownGap: 'No approved retention deadline; H14 audit completeness remains out of scope.', productionBlocker: true,
    }),
    entry('rate_limits', 'mongodb_collection', {
      purpose: 'Operational abuse/call counters with pseudonymous composite keys.', authority: 'operational_control', learningAuthority: 'none', tenantKey: 'tenant_id when Learning V2-scoped', subjectKeys: ['hashed composite key; no reversible subject field'],
      fieldGroups: ['pseudonymous key', 'bucket/count', 'tenant id', 'created/expires timestamps'], dataClasses: ['pseudonymous operational identifier', 'usage counter'],
      export: { status: 'excluded_operational_unresolvable_subject', section: null }, mutability: 'mutable_counter', rebuildable: 'no', currentDeletion: 'Per-record runtime expiry exists; tenant-scoped rows are deleted by tenant cascade.',
      retention: { status: 'runtime_expiry_only', current_behavior: 'expires_at is derived from the configured rate-limit window plus 60 seconds; this is operational expiry, not a product retention policy.' },
      erasure: { tenant: 'delete', subject: 'not selectively addressable without changing the data model' }, knownGap: 'Cannot reliably select one subject from the stored one-way composite key.', productionBlocker: false,
    }),
    entry('users', 'mongodb_collection', {
      purpose: 'Teacher identity/account and owner of personal tenants/legacy content.', authority: 'identity_root', learningAuthority: 'none', tenantKey: 'indirect through owned learning_v2_tenants', subjectKeys: ['id'],
      fieldGroups: ['identity/contact/authentication', 'subscription', 'account deletion/write fence'], dataClasses: ['direct identifiers', 'credentials', 'account metadata'],
      export: { status: 'outside_bounded_learning_export', section: null }, mutability: 'mutable_identity', rebuildable: 'no', currentDeletion: 'Teacher self-account deletion is implemented with resumable scoped cascade.', erasure: { tenant: 'teacher cascade owns personal tenant deletion', subject: 'teacher account route only' },
      knownGap: 'Identity export/retention is outside the bounded Learning V2 export.', productionBlocker: true,
    }),
    entry('students', 'mongodb_collection', {
      purpose: 'Learner identity, authentication, class memberships and gamification.', authority: 'identity_root', learningAuthority: 'none', tenantKey: 'indirect through membership/classes', subjectKeys: ['id'],
      fieldGroups: ['identity/display name/authentication', 'class membership', 'gamification/activity'], dataClasses: ['direct identifiers', 'credentials', 'profile/activity metadata'],
      export: { status: 'unresolved_outside_bounded_learning_export', section: null }, mutability: 'mutable_identity', rebuildable: 'no', currentDeletion: 'Teacher deletion removes owned class references but deliberately preserves the learner account.',
      erasure: { tenant: 'not tenant-owned identity', subject: 'no learner account-erasure workflow exists' }, knownGap: 'Individual learner identity lifecycle and its relationship to canonical Learning facts require decisions.', productionBlocker: true,
    }),
    entry('classes', 'mongodb_collection', {
      purpose: 'Teacher-owned class and learner enrollment relationships used for authorization.', authority: 'authorization_relationship', learningAuthority: 'none', tenantKey: 'indirect via teacher_id/personal tenant', subjectKeys: ['enrolled_students.student_id'],
      fieldGroups: ['class/teacher refs', 'enrolled learner refs', 'levels/roles'], dataClasses: ['direct identifiers', 'authorization metadata'], export: { status: 'unresolved', section: null },
      mutability: 'mutable_relationship', rebuildable: 'no', currentDeletion: 'Deleted with owning teacher; learner-side enrolled_classes references are pulled.', erasure: { tenant: 'delete_owned_class', subject: 'unresolved learner enrollment cleanup' },
      knownGap: 'No individual learner erasure workflow.', productionBlocker: true,
    }),
    entry('assignments', 'mongodb_collection', {
      purpose: 'Teacher-owned assignment and Learning V2 binding/configuration.', authority: 'domain_configuration', learningAuthority: 'configuration_not_learner_truth', tenantKey: 'learning_v2.tenant_id', subjectKeys: noSubject,
      fieldGroups: ['assignment/class/worksheet refs', 'activity settings', 'Learning V2 task pins/policy refs/revision'], dataClasses: ['teacher configuration', 'internal policy/source metadata'],
      export: { status: 'not_subject_export', section: null }, mutability: 'mutable_version_fenced_configuration', rebuildable: 'no', currentDeletion: 'Deleted with owning teacher.', erasure: { tenant: 'delete_owned_assignment', subject: 'not_subject_scoped' },
      knownGap: 'No product retention for inactive assignments.', productionBlocker: false,
    }),
    entry('worksheets', 'mongodb_collection', {
      purpose: 'Teacher-owned source content for tasks and grading.', authority: 'content_source', learningAuthority: 'source_definition_not_learner_truth', tenantKey: 'indirect via user_id/personal tenant', subjectKeys: noSubject,
      fieldGroups: ['worksheet owner/content/revision', 'questions/options/hidden answers'], dataClasses: ['teacher content', 'hidden answers'], export: { status: 'excluded_hidden_content', section: null },
      mutability: 'mutable_revisioned_content', rebuildable: 'no', currentDeletion: 'Deleted with owning teacher.', erasure: { tenant: 'delete_owned_content', subject: 'not_subject_scoped' },
      knownGap: 'Hidden answers must never enter subject export.', productionBlocker: false,
    }),
    entry('shares', 'mongodb_collection', {
      purpose: 'Legacy worksheet sharing relationship.', authority: 'authorization_relationship', learningAuthority: 'none', tenantKey: 'indirect via worksheet owner', subjectKeys: ['owner_id', 'shared_with_id'],
      fieldGroups: ['owner/recipient/worksheet refs'], dataClasses: ['direct identifiers', 'authorization metadata'], export: { status: 'outside_bounded_learning_export', section: null },
      mutability: 'mutable_relationship', rebuildable: 'no', currentDeletion: 'Deleted when owner, recipient, or owned worksheet is removed.', erasure: { tenant: 'delete_owned_references', subject: 'outside current learner workflow' },
      knownGap: 'No Learning V2-specific export decision.', productionBlocker: false,
    }),
    entry('comments', 'mongodb_collection', {
      purpose: 'Legacy worksheet comments potentially attached to V2 source content.', authority: 'legacy_content', learningAuthority: 'none', tenantKey: 'indirect via worksheet/user', subjectKeys: ['user_id'], fieldGroups: ['author/worksheet refs', 'comment content'], dataClasses: ['direct identifiers', 'user content'],
      export: { status: 'outside_bounded_learning_export', section: null }, mutability: 'mutable_content', rebuildable: 'no', currentDeletion: 'Deleted with owning teacher/worksheet.', erasure: { tenant: 'delete_owned_references', subject: 'outside current learner workflow' }, knownGap: 'No Learning V2-specific lifecycle.', productionBlocker: false,
    }),
    entry('versions', 'mongodb_collection', {
      purpose: 'Legacy worksheet version content potentially backing V2 source pins.', authority: 'legacy_content_version', learningAuthority: 'source_definition_not_learner_truth', tenantKey: 'indirect via worksheet/user', subjectKeys: ['user_id'], fieldGroups: ['owner/worksheet refs', 'versioned content'], dataClasses: ['direct identifiers', 'teacher content', 'hidden answers'],
      export: { status: 'excluded_hidden_content', section: null }, mutability: 'versioned_content', rebuildable: 'no', currentDeletion: 'Deleted with owning teacher/worksheet.', erasure: { tenant: 'delete_owned_references', subject: 'not learner-scoped' }, knownGap: 'No repository retention deadline.', productionBlocker: false,
    }),
    entry('password_reset_tokens', 'mongodb_collection', {
      purpose: 'Teacher authentication recovery token.', authority: 'identity_security', learningAuthority: 'none', tenantKey: null, subjectKeys: ['user_id'], fieldGroups: ['user ref', 'token hash/value', 'expiry'], dataClasses: ['credential secret', 'direct identifier'],
      export: { status: 'excluded_secret', section: null }, mutability: 'ephemeral_security_record', rebuildable: 'no', currentDeletion: 'Deleted after use and with teacher account.', erasure: { tenant: 'delete_with_teacher', subject: 'teacher only' }, knownGap: 'Not part of learner export.', productionBlocker: false,
    }),
    entry('generated_assets', 'mongodb_collection', {
      purpose: 'Legacy teacher-generated asset metadata.', authority: 'legacy_operational_content', learningAuthority: 'none', tenantKey: 'indirect via user_id', subjectKeys: ['user_id'], fieldGroups: ['owner ref', 'asset metadata/content link'], dataClasses: ['direct identifier', 'generated content metadata'],
      export: { status: 'outside_bounded_learning_export', section: null }, mutability: 'mutable_content', rebuildable: 'unknown', currentDeletion: 'Deleted with teacher account.', erasure: { tenant: 'delete_with_teacher', subject: 'teacher only' }, knownGap: 'No Learning V2-specific lifecycle.', productionBlocker: false,
    }),
    entry('studio_packages', 'mongodb_collection', {
      purpose: 'Legacy teacher Studio package metadata.', authority: 'legacy_operational_content', learningAuthority: 'none', tenantKey: 'indirect via user_id', subjectKeys: ['user_id'], fieldGroups: ['owner ref', 'package metadata'], dataClasses: ['direct identifier', 'generated content metadata'],
      export: { status: 'outside_bounded_learning_export', section: null }, mutability: 'mutable_content', rebuildable: 'unknown', currentDeletion: 'Deleted with teacher account.', erasure: { tenant: 'delete_with_teacher', subject: 'teacher only' }, knownGap: 'No Learning V2-specific lifecycle.', productionBlocker: false,
    }),
    entry('dossiers', 'mongodb_collection', {
      purpose: 'Legacy teacher dossier content that may reference learning material.', authority: 'legacy_content', learningAuthority: 'none', tenantKey: 'indirect via user_id', subjectKeys: ['user_id'], fieldGroups: ['owner ref', 'dossier content/status'], dataClasses: ['direct identifier', 'teacher content'],
      export: { status: 'outside_bounded_learning_export', section: null }, mutability: 'mutable_content', rebuildable: 'unknown', currentDeletion: 'Deleted with teacher account.', erasure: { tenant: 'delete_with_teacher', subject: 'teacher only' }, knownGap: 'No Learning V2-specific lifecycle.', productionBlocker: false,
    }),
    entry('learning_v2_logs', 'application_logs', {
      purpose: 'Redacted operational diagnostics.', authority: 'operational_observability', learningAuthority: 'none', tenantKey: 'omitted', subjectKeys: noSubject,
      fieldGroups: ['static route id', 'error code', 'technical request id (redacted when identifier-like)', 'bounded operational status'], dataClasses: ['redacted operational metadata'],
      export: { status: 'excluded_operational', section: null }, mutability: 'external_append_stream', rebuildable: 'no', currentDeletion: 'No repository-controlled log deletion API.',
      erasure: { tenant: 'not selectively addressable because direct IDs are omitted', subject: 'not selectively addressable because direct IDs are omitted' }, knownGap: 'Sink, retention, backup and access policy are deployment decisions and unresolved.', productionBlocker: true,
    }),
    entry('browser_assignment_drafts', 'browser_storage', {
      purpose: 'Client-only bounded quiz progress draft.', authority: 'client_convenience_cache', learningAuthority: 'none', tenantKey: 'not stored', subjectKeys: ['actor_id binding for authenticated draft'],
      fieldGroups: ['actor/assignment/source binding', 'answers/current question', 'created/expires'], dataClasses: ['direct identifier', 'learner response'], export: { status: 'excluded_client_cache', section: null },
      mutability: 'client_mutable_cache', rebuildable: 'no', currentDeletion: 'Logout, actor/source/schema mismatch, corruption and expiry cleanup; guest uses sessionStorage only.',
      retention: { status: 'implemented_technical_ttl', current_behavior: 'Two-hour client cache TTL from last save; this is an H12-A cache bound, not a general production retention policy.' },
      erasure: { tenant: 'not server-addressable', subject: 'best-effort browser cleanup only' }, backup: { status: 'not_server_backed_up', current_behavior: 'No server copy is created.' },
      knownGap: 'An inactive browser cannot execute cleanup until it is opened again.', productionBlocker: false,
    }),
    entry('browser_auth_cookie', 'browser_cookie', {
      purpose: 'HttpOnly signed authentication session presented to server-owned authorization.', authority: 'authentication_transport', learningAuthority: 'none', tenantKey: 'resolved server-side, not trusted from cookie', subjectKeys: ['signed actor identity'],
      fieldGroups: ['signed identity/session timestamps'], dataClasses: ['authentication credential', 'direct identifier'], export: { status: 'excluded_secret', section: null }, mutability: 'replaceable_session_credential', rebuildable: 'no',
      currentDeletion: 'Cleared by logout/account deletion response; server authorization rechecks authoritative identity/membership.', erasure: { tenant: 'invalid after authoritative tenant/account removal', subject: 'clear cookie plus authoritative identity decision' },
      backup: { status: 'not_server_backed_up', current_behavior: 'Cookie exists in the browser only.' }, knownGap: 'Individual learner account deletion is not implemented.', productionBlocker: true,
    }),
    entry('learning_v2_http_transient_payloads', 'process_memory', {
      purpose: 'Bounded request/response handling including submission intents and Tutor provider context before persistence decisions.', authority: 'transient_transport', learningAuthority: 'none_until_validated_canonical_write', tenantKey: 'server-owned actor context', subjectKeys: ['server-owned actor context'],
      fieldGroups: ['request DTO', 'submission intent', 'provider-safe context', 'response DTO'], dataClasses: ['learner response', 'authorization token', 'transient learning content'], export: { status: 'not_persistent_export_source', section: null },
      mutability: 'ephemeral_process_memory', rebuildable: 'no', currentDeletion: 'Released after request/process lifetime; no dedicated persistent store.', retention: { status: 'request_lifetime_only', current_behavior: 'No repository persistence beyond explicitly validated target records.' },
      erasure: { tenant: 'not_persistent', subject: 'not_persistent' }, backup: { status: 'not_applicable_process_memory', current_behavior: 'Not intentionally included in repository backups.' }, knownGap: 'Runtime/platform memory handling is operational, not repository-controlled.', productionBlocker: false,
    }),
    entry('provider_temporary_processing', 'external_provider_processing', {
      purpose: 'Temporary processing of minimized Tutor context by the configured provider.', authority: 'external_processor_no_learning_authority', learningAuthority: 'none', tenantKey: 'omitted_from_provider_context', subjectKeys: noSubject,
      fieldGroups: ['minimized task/question/options', 'predetermined action/level'], dataClasses: ['minimized learning content without direct identifiers or hidden-answer label'], export: { status: 'excluded_external_processing', section: null },
      mutability: 'external_transient_processing', rebuildable: 'no', currentDeletion: 'Application requests store:false and does not persist raw provider payloads locally.', retention: { status: 'unresolved_external_provider_behavior', current_behavior: 'No provider-side retention guarantee is encoded by the repository.' },
      erasure: { tenant: 'unresolved_external_contract', subject: 'unresolved_external_contract' }, backup: { status: 'unresolved_external_provider_behavior', current_behavior: 'Provider backup behavior is not technically controlled by this repository.' },
      knownGap: 'Provider contract, residency, subprocessors and deletion behavior require external approval.', productionBlocker: true,
    }),
    entry('tutor_runtime_approval_config', 'repository_static_contract', {
      purpose: 'Versioned exact provider/model/prompt/schema approval tuple and immutable approval reference used by the server runtime gate.', authority: 'runtime_provider_governance', learningAuthority: 'none', tenantKey: null, subjectKeys: noSubject,
      fieldGroups: ['contract/evaluator versions', 'provider/model/prompt/schema identifiers and immutable prompt digest', 'approval reference/status', 'human review status/reference/timestamp'], dataClasses: ['provider governance metadata', 'possible reviewer reference only after explicit review'],
      export: { status: 'excluded_repository_configuration', section: null }, mutability: 'versioned_static_contract_no_dynamic_promotion', rebuildable: 'repository_source', currentDeletion: 'Changed only by an explicitly reviewed repository revision; evaluation cannot mutate it.',
      retention: { status: 'repository_version_history', current_behavior: 'Retained with repository history; no runtime data record is created.' }, erasure: { tenant: 'not_tenant_data', subject: 'not_learner_subject_data' },
      backup: { status: 'repository_source_control', current_behavior: 'Follows repository backup/version-control handling.' }, knownGap: 'The v3 approval tuple is explicitly pending. Historical v2 remains reconstructable. No runtime approval or actual human review exists; Production remains blocked.', productionBlocker: true,
    }),
    entry('tutor_paid_evaluation_manifest', 'repository_static_contract', {
      purpose: 'Frozen synthetic fixture identity, repetition and provider evaluation budgets/gates.', authority: 'evaluation_governance', learningAuthority: 'none', tenantKey: null, subjectKeys: noSubject,
      fieldGroups: ['manifest/fixture/evaluator/result/leakage/accounting contract versions', 'historical v1/v2 and current v3 prompt identifiers/digests', 'historical v4/v5/v6/v7 and accepted v8 evaluation scope fingerprints', 'canonical tutor-safety-gates-v1 contract shared by runtime and evaluation', 'frozen STRICT_VALUE_MENTION leakage policy and static answer-option-text avoidance prompt contract', 'R1 provider-candidate quality and R2 final-system-safety semantics with separate cause-specific quality policy', 'unknown-usage MAX_PER_CALL_RESERVATION continuation policy with COMPLETE/PARTIAL_UNKNOWN actual-cost states', 'separate single-case diagnostic manifest with fixed source/case hashes and independent default-off opt-in', 'separate historical Run-2 manifest/contract hash and one-run default-off opt-in', 'separate historical Prompt-v2 Run-1 manifest/contract hash and consumed one-run opt-in', 'separate consumed evidence-hardened Run-1 manifest/contract hash and create-once claim', 'separate Prompt-v3 Fixture-006 targeted probe manifest/contract hash with exact one-call default-off opt-in', 'separate consumed v7 R1/R2 Run-1 contract and create-once claim', 'separate consumed v8 R1/R2 Run-1 contract and create-once claim', 'evaluation-only authorization with no runtime effect', 'provider/model/prompt/schema identifiers', 'call/token/cost caps', 'immutable Standard API uncached-input pricing contract/version/reference/currency with runtime fetch disabled', 'automated criteria', 'human-review rubric/workflow/required-role status'], dataClasses: ['provider governance metadata', 'synthetic evaluation configuration'],
      export: { status: 'excluded_repository_configuration', section: null }, mutability: 'versioned_static_contract', rebuildable: 'repository_source', currentDeletion: 'Changed only by an explicitly reviewed repository revision.',
      retention: { status: 'repository_version_history', current_behavior: 'Retained with repository history; contains no learner records.' }, erasure: { tenant: 'not_tenant_data', subject: 'not_learner_subject_data' },
      backup: { status: 'repository_source_control', current_behavior: 'Follows repository backup/version-control handling.' }, knownGap: 'Historical paid evidence through the accepted v8/v6/v4/accounting-v1 Run remains immutable. Cause-specific numeric thresholds still need Product policy judgement; runtime approval remains false.', productionBlocker: true,
    }),
    entry('tutor_paid_evaluation_results', 'repository_bounded_artifacts', {
      purpose: 'Bounded run-specific execution claim/result/report with case codes, canonical gate execution states, separate provider-candidate/final-outcome metrics and aggregate call/token/cost usage; no raw prompt, response, answer, match, error, header or secret.', authority: 'evaluation_observation_not_runtime_approval', learningAuthority: 'none', tenantKey: null, subjectKeys: noSubject,
      fieldGroups: ['run/probe manifest/contract hash and authorization-consumed marker', 'historical evaluator v4/result v2 and evaluator v5/result v3 plus current evaluator v6/result v4/accounting v1/canonical-safety versions and STRICT_VALUE_MENTION policy', 'technical status/reason and bounded comparison/recommendation', 'synthetic case id/repetition and separate R1 provider candidate PASS/FAIL/provider-failure code', 'R2 final outcome PROVIDER_ACCEPTED/LOCAL_FALLBACK_ACCEPTED/FINAL_OUTCOME_FAIL', 'ordered per-gate PASS/FAIL/NOT_REACHED states', 'bounded rejection-reason distribution, fallback count/rate and read-only derived cause-specific quality classification', 'bounded leakage subcode/response-field/answer-class/length-bucket/cue/boundary/match-count with raw-answer-retained=false and raw-response-retained=false', 'aggregate calls/tokens/cost/currency with actual_cost_status and trustworthy known actual values separated from unknown-usage reservations', 'unknown-usage reserved token/cost upper bounds, conservative total-cost upper bound and remaining budget upper bound', 'bounded provider diagnostic version/category/status/stage/call ordinal with raw-error-retained=false', 'runtime/human/production governance assertions'], dataClasses: ['synthetic evaluation metadata', 'provider usage metadata', 'bounded answer-shape classification without answer content'],
      export: { status: 'excluded_repository_artifact', section: null }, mutability: 'exclusive_create_once_no_automatic_retry', rebuildable: 'no_same_authorization_rerun', currentDeletion: 'No automatic deletion. Each run-specific claim, including Prompt-v2 Run-1, Evidence-hardened Run-1 and the Prompt-v3 Fixture-006 probe, survives success, failure, partial execution and missing result; deletion must never be used to authorize another run.',
      retention: { status: 'repository_audit_history_not_production_policy', current_behavior: 'Historical artifacts remain immutable. Result v4 permits only bounded synthetic R1/R2 gate, fallback, leakage and usage-accounting metadata under docs/evaluation-results plus a report; derived quality policy does not rewrite those artifacts.' }, erasure: { tenant: 'not_tenant_data', subject: 'not_learner_subject_data' },
      backup: { status: 'repository_source_control_when_committed', current_behavior: 'Current tracked/untracked state is reported per execution; no runtime database backup is involved.' }, knownGap: 'Filesystem claims coordinate one checkout, not independent repository copies. No Production retention policy is asserted and no further run is implied.', productionBlocker: false,
    }),
    entry('tutor_diagnostic_probe_artifacts', 'repository_bounded_artifacts', {
      purpose: 'Single-use synthetic diagnostic authorization tombstone, safe numeric/stage result and reviewed report; no raw prompt, response, error, header or secret.', authority: 'diagnostic_observation_not_approval', learningAuthority: 'none', tenantKey: null, subjectKeys: noSubject,
      fieldGroups: ['probe manifest/case identity and authorization-consumed marker', 'diagnostic version/reason/category', 'response/status/parse/transport/usage/gates/ordinal flags', 'numeric usage/cost or explicit unknown', 'bounded gate code and governance assertions', 'raw_error_retained=false'], dataClasses: ['synthetic diagnostic metadata', 'provider usage metadata'],
      export: { status: 'excluded_repository_artifact', section: null }, mutability: 'exclusive_create_once_no_retry', rebuildable: 'no_same_authorization_rerun', currentDeletion: 'No automatic deletion. Keep claim even if execution or result persistence fails; absence of result is not permission to retry.',
      retention: { status: 'repository_audit_history', current_behavior: 'Only bounded synthetic artifacts persist under docs/evaluation-results and the diagnostic report. No learner records or database collection.' },
      erasure: { tenant: 'not_tenant_data', subject: 'not_learner_subject_data' }, backup: { status: 'repository_source_control', current_behavior: 'Keep the authorization tombstone with the execution checkout/audit history; do not reuse this authorization in another checkout.' },
      knownGap: 'Filesystem tombstone prevents same-checkout concurrent/restarted runs, not coordinated execution across independently copied repositories. No further run is authorized.', productionBlocker: false,
    }),
    entry('tutor_quality_policy_config', 'repository_static_contract', {
      purpose: 'Versioned cause-specific Tutor quality classification policy and distinct fail-closed Production policy stub.', authority: 'product_quality_governance', learningAuthority: 'none', tenantKey: null, subjectKeys: noSubject,
      fieldGroups: ['FINAL_SYSTEM_FAILURE absolute blocker', 'SAFETY_CANDIDATE_REJECTION bounded canonical categories', 'PROVIDER_TECHNICAL_FAILURE bounded diagnostic categories', 'TOTAL_FALLBACK_GUARDRAIL supplementary role', 'explicit numerator and denominator definitions', 'DEVELOPMENT_EVALUATION policy scope', 'separate PRODUCTION NOT_DEFINED scope', 'DECISION_NEEDS_POLICY_JUDGEMENT threshold status', 'all approval effects NONE', 'read-only derived classification without historical result mutation'], dataClasses: ['provider quality governance metadata', 'bounded synthetic evaluation aggregates'],
      export: { status: 'excluded_repository_configuration', section: null }, mutability: 'versioned_static_contract_no_automated_promotion', rebuildable: 'repository_source', currentDeletion: 'Changed only by an explicitly reviewed repository revision; no runtime or database record is created.',
      retention: { status: 'repository_version_history', current_behavior: 'Static policy versions are retained with repository history; no raw provider or learner content is stored.' }, erasure: { tenant: 'not_tenant_data', subject: 'not_learner_subject_data' },
      backup: { status: 'repository_source_control', current_behavior: 'Follows repository backup/version-control handling.' }, knownGap: 'Numeric Development/Evaluation thresholds require Product judgement. Production thresholds are NOT_DEFINED and fail closed.', productionBlocker: true,
    }),
    entry('tutor_paid_execution_protection', 'repository_infrastructure_and_governance', {
      purpose: 'Protected paid execution namespace guards, root/profile and OS security/identity qualification metadata under D14B-V9-19–25.',
      authority: 'release_governance_only', learningAuthority: 'none', tenantKey: null, subjectKeys: noSubject,
      fieldGroups: ['exact .namespace-guard infrastructure, excluded from checkpoint count/hash chain',
        'protected root/volume/device/directory object identity bindings', 'owner/DACL/effective-rights and restricted token profile evidence',
        'code/configuration/revision binding and independent namespace/durability qualification metadata',
        'TECHNICALLY_PROVABLE / TRUSTED_OPERATOR_ATTESTATION / EXECUTION_TIME_CHECK distinction',
        'synthetic/release governance only; no learner PII/answer/learner_message/hidden answer/raw Provider content',
        'no Learning Evidence or KS authority; no Runtime/Production approval; no Mongo collection'],
      dataClasses: ['bounded infrastructure security metadata', 'synthetic release qualification metadata'],
      export: { status: 'excluded_development_evaluation_artifact', section: null },
      mutability: 'provisioner_owned_guards_and_versioned_profiles', rebuildable: 'separately_authorized_provisioning_only',
      currentDeletion: 'Runner cannot remove/repair guards. Guards remain while namespace exists; material retention cannot recycle Claim consumption.',
      retention: { status: 'engineering_governance_only', current_behavior: 'No legal retention claim. Qualification evidence must remain applicable; changed conditions block execution.' },
      erasure: { tenant: 'not_tenant_data', subject: 'not_learner_subject_data' },
      backup: { status: 'protected_authoritative_history', current_behavior: 'Evidence copies never grant execution authority; no global erasure promise.' },
      knownGap: 'Actual Windows qualification NOT_PERFORMED and real trusted collector/operator authority unprovisioned. Synthetic capabilities cannot qualify actual execution.', productionBlocker: true,
    }),
    entry('tutor_paid_execution_artifacts', 'repository_bounded_artifacts', {
      purpose: 'Synthetic Development/Evaluation-only paid execution, accounting and termination audit under tutor-paid-execution-record-v1.',
      authority: 'product_release_governance_metadata_only', learningAuthority: 'none', tenantKey: null, subjectKeys: noSubject,
      fieldGroups: ['strict AUTHORIZATION/OPERATIONS_ATTESTATION/CLAIM family', 'CASE_PREPARED/CASE_SETTLED and RESULT_PREPARED/RESULT_VERIFIED checkpoints',
        'REVIEW_MATERIAL_PREPARED/REVIEW_MATERIAL_SETTLED and create-once TERMINAL_RECORD', 'run/authorization/claim/owner refs and complete-file hashes',
        'exact integer token counts and USD micro-unit known/unknown accounting', 'KNOWN/PARTIAL_UNKNOWN and PROVEN/UNPROVABLE bounds',
        'bounded provider diagnostic and terminal causes; no free-form errors', 'trusted server timestamps and trusted operator proof references',
        'one outstanding pretransport intent; no retry/failover; NO_RESUME_AFTER_PROCESS_FAILURE',
        'read-only nontransport reconciliation and stopped-owner-bound terminalization', 'full Result v5 and separate Sample/Packet file bindings',
        'no learner PII/answer/hidden-answer copy/learner_message', 'no raw Provider request/response/error, prompt text or secrets',
        'no Learning Evidence or Knowledge State authority; all Runtime/Production approval effects NONE; no Mongo collection'],
      dataClasses: ['synthetic execution governance metadata', 'bounded paid accounting metadata'],
      export: { status: 'excluded_development_evaluation_artifact', section: null }, mutability: 'exclusive_create_once_append_only',
      rebuildable: 'verified_durable_chain_only_no_transport_resume',
      currentDeletion: 'No automatic expiry or cleanup of the paid Authorization/Claim/checkpoint/terminal audit chain. Consumed authorization tombstones remain authoritative; Human Review retention is separate.',
      retention: { status: 'no_automatic_expiry', current_behavior: 'Engineering audit policy only; no legal retention requirement is asserted. Never recycle consumed authorization after failure, clone/restore or review-material cleanup.' },
      erasure: { tenant: 'not_tenant_data', subject: 'not_learner_subject_data' },
      backup: { status: 'repository_source_control', current_behavior: 'Private protected authoritative repository history; no global Git/clone/backup erasure claim.' },
      knownGap: 'Real paid v9 remains NOT_AUTHORIZED. Real operator proof, final run hash and verified execution prerequisites are not provisioned by provider-free test capabilities.', productionBlocker: true,
    }),
    entry('tutor_human_review_packet', 'repository_bounded_artifact', {
      purpose: 'Minimal create-once synthetic Review Packet for blinded Development/Evaluation-only pedagogical review.', authority: 'product_governance_material_only', learningAuthority: 'none', tenantKey: null, subjectKeys: noSubject,
      fieldGroups: ['source run/result/fixture/sample hashes and contract versions', 'opaque review item and synthetic case references', 'subject category, hint level and expected Tutor action', 'selected exact canonical final learner_message only', 'all eleven canonical final gates PASS proof', 'synthetic_data_only=true', 'packet created/expires timestamps and packet digest', 'correct answer excluded and derived from bound synthetic fixture only in reviewer projection', 'learner answer and learner PII absent', 'raw Provider response/rejected candidate/prompt/error/secrets absent'], dataClasses: ['synthetic review material', 'synthetic final Tutor message', 'evaluation integrity metadata'],
      export: { status: 'excluded_development_evaluation_artifact', section: null }, mutability: 'exclusive_create_once_no_overwrite', rebuildable: 'no_same_evaluation_authorization_rerun', currentDeletion: 'After delete_at, remove only from the active protected default branch through a separately reviewed retention commit; deletion never authorizes replay or replacement.',
      retention: { status: 'bounded_development_evaluation_engineering_policy', current_behavior: 'The active loader uses trusted server time. delete_at is the earlier of packet_created_at plus 180 days and the exact bound verified terminal_at plus 30 days; without an exact terminal artifact it is packet_created_at plus 180 days. Callers cannot supply current or terminal time. This is not a legal retention conclusion.' }, erasure: { tenant: 'not_tenant_data', subject: 'not_learner_subject_data' },
      backup: { status: 'repository_copies_not_globally_erased', current_behavior: 'No application copy is allowed. Active-branch deletion does not claim erasure from Git history, private clones or repository-provider backups.' }, knownGap: 'A private protected repository, trusted single coordinator and reviewer blinding remain operational prerequisites. Production use/import is forbidden.', productionBlocker: true,
    }),
    entry('tutor_human_review_record', 'repository_bounded_artifact', {
      purpose: 'Create-once synthetic Product Governance review claim, submissions, adjudications and final bounded record.', authority: 'product_governance_metadata_only', learningAuthority: 'none', tenantKey: null, subjectKeys: noSubject,
      fieldGroups: ['workflow/rubric/input/sampling/packet/record versions and source digests', 'create-once Review Claim and operator-attested external precondition references', 'opaque coordinator-issued reviewer_ref, review_ref, assignment-token digest, submission refs and review item refs; raw assignment token is not persisted', 'strict assignment/submission digests and complete Claim-to-Final-Record source bindings', 'bounded nine-dimension ratings, N/A reason and Critical Finding codes', 'artifact-derived lifecycle/outcome/open/completed counts', 'trusted Coordinator/server-generated submitted_at and final terminal_at; caller-provided time or completion assertions are forbidden', 'optional synthetic note up to 500 characters', 'all approval effects NONE', 'no learner message in final record', 'no Learning Evidence effect'], dataClasses: ['synthetic product-governance metadata', 'opaque reviewer governance identifiers'],
      export: { status: 'excluded_development_evaluation_artifact', section: null }, mutability: 'append_only_create_once_artifact_set', rebuildable: 'deterministic_from_verified_create_once_review_artifacts', currentDeletion: 'Remove the record set from the active protected default branch after expiry through a separately reviewed commit; never rewrite submitted ratings in place.',
      retention: { status: 'bounded_development_evaluation_engineering_policy', current_behavior: 'Review claim, sample, submissions, adjudications and final record remain active for 365 days from review_ref_created_at. This is not a legal retention conclusion.' }, erasure: { tenant: 'not_tenant_data', subject: 'not_learner_subject_data' },
      backup: { status: 'repository_copies_not_globally_erased', current_behavior: 'Active-branch removal does not claim physical erasure from Git history, private clones or repository-provider backups.' }, knownGap: 'No real reviewer is assigned and no Human Review execution is authorized. Record outcomes cannot approve Runtime or Production.', productionBlocker: true,
    }),
    entry('tutor_human_review_metadata', 'repository_static_contract', {
      purpose: 'Versioned Human pedagogical review framework with intentionally empty reviewer/review/approval fields.', authority: 'human_review_boundary_not_approval', learningAuthority: 'none', tenantKey: null, subjectKeys: noSubject,
      fieldGroups: ['workflow v2, input v2, rubric v2, sampling v1, packet v1, record v1 and First-Pass projection v1', 'review-capable prospective evaluation v9/evaluator v7/result v5 with execution NOT_AUTHORIZED', 'provider-free injectable v7 capture reducer; Result v5 retains bounded metadata only: case/gate/cause metadata but no learner_message', 'deterministic provider/local sampling and bounded fallback cause metadata', 'rejected candidates discarded completely; only selected final messages enter Packet', 'required EDUFLOW_PEDAGOGICAL_REVIEWER role resolved from create-once repository Assignment by opaque token', 'operator-attested private/protected/single-coordinator/no-direct-access preconditions remain external rather than technically proven', 'nine bounded rubric dimensions and no numeric thresholds', 'First-Pass blinding and persisted-digest-bound Second-Pass governance disclosure', 'single trusted Coordinator/server clock for Assignment expiry, submissions, Final Record and Packet activity; temporal client fields reject', 'Packet terminal retention is derived for the exact bound review_ref and cannot be caller-omitted', 'raw Provider/rejected candidate/prompt/error retained=false', 'empty reviewer/review refs, review_execution_authorized=false and NOT_REVIEWED status'], dataClasses: ['review governance metadata', 'bounded synthetic contract metadata'],
      export: { status: 'excluded_repository_configuration', section: null }, mutability: 'versioned_static_contract_no_automated_write', rebuildable: 'repository_source', currentDeletion: 'Static contracts change only through an explicitly reviewed repository revision.',
      retention: { status: 'repository_version_history', current_behavior: 'Static framework contracts remain in version history; bounded Packet/Record lifecycles are inventoried separately.' }, erasure: { tenant: 'not_tenant_data', subject: 'not_learner_subject_data' },
      backup: { status: 'repository_source_control', current_behavior: 'Follows private repository backup/version-control handling.' }, knownGap: 'No paid v9 run, reviewer identity, Human Review execution or result exists; Runtime and Production remain closed.', productionBlocker: true,
    }),
    entry('windows_qualification_governance', 'qualification_infrastructure', {
      purpose: 'Bounded release/security qualification infrastructure under D14B-V9-26–34; synthetic development protocol storage is separate from the undeployed protected controller.',
      authority: 'qualification_release_security_governance_only', learningAuthority: 'none', tenantKey: null, subjectKeys: noSubject,
      fieldGroups: ['collector object/volume/file identity and attributes', 'operational SID/token/group/restriction/privilege/integrity/impersonation metadata',
        'owner/security descriptor/inheritance/effective-right observations', 'observer operation sequences and process/object correlation without write buffers',
        'drop/allocation/overflow/ETW-loss/attach/disconnect/unload/drain records', 'external controller registration/consumption/epoch/ticket/evidence journal',
        'separate permissive positive-control and protected matrix evidence across all three write leaves', 'storage profile and durability/fault/sentinel evidence',
        'cleanup object-identity evidence and investigation-hold/retention metadata', 'no learner data/answers/hidden answer/learner_message/prompt/Provider payload/error/credential/secret',
        'no Learning Truth/Evidence/Knowledge State/Mastery/Confidence/grade/Identity/Tenant/paid/Runtime/Production authority'],
      dataClasses: ['restricted operational security metadata', 'synthetic qualification observations'],
      export: { status: 'excluded_qualification_governance_no_application_api', section: null }, mutability: 'append_only_governance_with_versioned_contracts',
      rebuildable: 'index_only_from_verified_journal_no_fixture_reuse', currentDeletion: 'Identity-bound cleanup protocol only; no automatic deployment or deletion. Minimal consumption history cannot be reset.',
      retention: { status: 'engineering_qualification_policy', current_behavior: 'Keep complete active evidence while applicable. Detailed failed/closed or superseded/revoked evidence has a 90-calendar-day policy; an investigation hold prevents deletion. Independent verifier approval is required. Minimal consumption/reservation/epoch/outcome history remains for system lifetime; retirement revokes old eligibility.' },
      erasure: { tenant: 'not_tenant_data', subject: 'not_learner_data' },
      backup: { status: 'controller_outside_subject_rollback_domain_required', current_behavior: 'Synthetic development journal is not protected storage. Real controller history must survive subject root/VM destruction; uncertain controller rollback revokes epochs.' },
      legalHold: { status: 'engineering_investigation_hold_contract_not_legal_advice', current_behavior: 'Hold blocks evidence cleanup; no legal-compliance conclusion.' },
      knownGap: 'Real component laboratory and actual target qualification remain NOT_PERFORMED; privileged driver/service deployment and protected controller registration remain closed.', productionBlocker: true,
    }),
    ...['provider_executions', 'provider_execution_events', 'provider_budgets'].map((id) => entry(id, 'approved_mongodb_collection', {
      implementationStatus: 'approved_but_not_yet_implemented',
      purpose: id === 'provider_executions' ? 'HD-14 bounded intent, two call slots, spent/ambiguous state and accounting/output references.'
        : id === 'provider_execution_events' ? 'HD-14 insert-only sequenced reservation/claim/settlement/ambiguity/reconciliation receipts.'
          : 'HD-14 conservative owner/tenant/environment daily and epoch counters and holds.',
      authority: 'future_operational_execution_authority_only', learningAuthority: 'none', tenantKey: 'environment_id + staging_epoch + tenant_id',
      subjectKeys: ['opaque owner_actor_id', 'opaque tenant_id'],
      fieldGroups: ['reviewed environment/configuration/deployment/revision/epoch', 'operation/execution/transition identity and idempotency digests',
        'bounded feature/model/pricing/prompt/schema versions', 'input/output immutable references and digests, never raw content',
        'bounded normalized usage/cost facts, conservative holds, spent tombstones and state versions',
        'execution/event/budget uniqueness excludes deployment/revision/price versions that could reset authority',
        'DB-scoped runtime grants: execution/budget read-insert-update; events read-insert only; no delete/drop/index administration',
        'no raw prompts, answers, Provider request/response/error, credential or secret; hashing is not anonymization'],
      dataClasses: ['sensitive pseudonymous operational metadata', 'synthetic execution provenance', 'cost/accounting metadata'],
      export: { status: 'not_implemented_no_application_export', section: null },
      mutability: id === 'provider_execution_events' ? 'future_insert_only_digest_linked_receipts' : 'future_exact_state_version_CAS',
      rebuildable: 'no_transport_or_budget_permission_from_readback_or_restore', currentDeletion: 'No collection or deletion implementation is created in Hosting A.',
      retention: { status: 'approved_but_not_yet_implemented', current_behavior: 'Keep minimal spent and accounting records throughout the staging epoch and restore quarantine. No TTL. Real-data long-term retention remains unresolved.' },
      erasure: { tenant: 'future_access_revocation_preserves_opaque_spent_tombstones', subject: 'future_output_or_account_deletion_never_reopens_dispatch' },
      backup: { status: 'approved_but_not_yet_implemented', current_behavior: 'Restore is inspect-only; revoke old credentials and remove dispatch. Epoch/configuration authority stays outside restored DB. No old operation resumes; historical exposure must survive any new epoch.' },
      knownGap: 'HD-03–07/10–11/14 execution, budgets, indexes, grants, restore and activation are subsequent work. Not active storage, legal approval, learning authority or Production readiness.', productionBlocker: true,
    })),
    entry('hosted_environment_binding', 'server_controlled_configuration', {
      implementationStatus: 'implemented_contract_not_provisioned',
      purpose: 'HD-01 reviewed Preview binding and request-local authenticated Mongo observations.', authority: 'synthetic_environment_capability_only', learningAuthority: 'none',
      subjectKeys: ['DB principal identity; no learner identity'], fieldGroups: ['repository/project/branch/revision/deployment/configuration/review reference', 'DB topology/principal/grant digest', 'epoch/synthetic mode/feature allowlist', 'Runtime Approval=false, paid authority=false', 'request-local observations never exported to clients'],
      dataClasses: ['restricted deployment and DB operational metadata'], export: { status: 'excluded_server_configuration', section: null },
      mutability: 'reviewed_versioned_configuration_and_ephemeral_observations', rebuildable: 'fresh_authenticated_observations_required', currentDeletion: 'Observation authority ends with request; configuration changes invalidate the binding.',
      retention: { status: 'configuration_governance_not_legal_policy', current_behavior: 'Keep reviewed deployment provenance under controlled configuration history; no legal retention deadline is asserted.' },
      erasure: { tenant: 'not_learner_content', subject: 'not_learner_content' }, backup: { status: 'external_configuration_epoch', current_behavior: 'Current epoch/configuration is outside DB restoration; provisioning and recovery verification remain pending.' },
      knownGap: 'Cloud IDs, grants, deployment protection and actual provisioning/deployed checks are not supplied or verified.', productionBlocker: true,
    }),
    entry('hosted_provider_payloads_secrets_logs', 'approved_external_operational_category', {
      implementationStatus: 'approved_but_not_yet_implemented',
      purpose: 'HD-15 destinations and minimization for future hosted Provider operations.', authority: 'operational_only', learningAuthority: 'none',
      subjectKeys: ['minimized synthetic actor/tenant references where required'],
      fieldGroups: ['minimized validated synthetic Provider payload in transient server/Provider transport only', 'product input/output content in existing authorized storage, immutable reference/digest in ledger', 'staging auth secrets in controlled branch-scoped secret configuration; Provider credentials absent', 'bounded error/status codes in controlled operational log sinks, no raw payload/secret logging', 'output ownership and separate output versus tombstone lifecycles', 'DB grants, log/secret sink access and restore/epoch governance'],
      dataClasses: ['synthetic content', 'sensitive operational metadata', 'credential secrets in separate controlled store only'],
      export: { status: 'no_provider_export_or_secret_exposure', section: null }, mutability: 'future_bounded_transient_payloads_and_controlled_destinations', rebuildable: 'no_replay_authority',
      currentDeletion: 'No new hosted payload/log/secret store is provisioned. Existing product storage is inventoried separately.',
      retention: { status: 'approved_minimization_unresolved_real_data_lifecycle', current_behavior: 'No raw payload in ledger/logs. Product output retention is separate from spent records. Real-student retention, deletion and legal hold remain Production decisions.' },
      erasure: { tenant: 'future_output_deletion_and_access_revocation_preserve_spent_records', subject: 'real_data_policy_unresolved' },
      backup: { status: 'approved_restore_quarantine_not_implemented', current_behavior: 'Restore never imports dispatch rights. Log, secret and Provider destinations/access/retention must be verified before activation.' },
      knownGap: 'No Provider credentials, dispatch, external sink configuration, live payload, deployment or real-data policy approval in Hosting A.', productionBlocker: true,
    }),
    entry('database_backups', 'external_backup_category', {
      purpose: 'Technical category for database backup/restore copies.', authority: 'operational_recovery_copy', learningAuthority: 'copy_only', tenantKey: 'inherits source records', subjectKeys: ['inherits source records'],
      fieldGroups: ['copies of persisted collection fields'], dataClasses: ['all persisted source data classes'], export: { status: 'not_direct_export_source', section: null }, mutability: 'external_snapshot_or_backup', rebuildable: 'restore copy', currentDeletion: 'No repository-level backup deletion automation.',
      retention: { status: 'unresolved', current_behavior: 'No backup retention period is asserted by H12-B.' }, erasure: { tenant: 'unresolved_restore_and_deletion_policy', subject: 'unresolved_restore_and_deletion_policy' },
      backup: { status: 'self_category_unresolved', current_behavior: 'Backup platform and schedule are not defined in this repository.' }, knownGap: 'Backup retention, restore re-deletion, access and Legal Hold require operational/legal decisions.', productionBlocker: true,
    }),
  ]),
})

export const INVENTORIED_MONGODB_COLLECTIONS = Object.freeze(LEARNING_V2_DATA_INVENTORY.entries
  .filter((item) => item.storage_kind === 'mongodb_collection').map((item) => item.id).sort())

export function inventoryEntry(id) {
  return LEARNING_V2_DATA_INVENTORY.entries.find((item) => item.id === id) || null
}

export function assertInventoryCoversCollections(collections, inventory = LEARNING_V2_DATA_INVENTORY) {
  const covered = new Set(inventory.entries.filter((item) => item.storage_kind === 'mongodb_collection').map((item) => item.id))
  const missing = [...new Set(collections)].filter((name) => !covered.has(name)).sort()
  if (missing.length) throw new TypeError(`Learning V2 data inventory misses collections: ${missing.join(', ')}`)
  return true
}

export function validateLearningV2DataInventory(inventory = LEARNING_V2_DATA_INVENTORY) {
  if (inventory?.version !== LEARNING_V2_DATA_INVENTORY_VERSION || inventory.status !== 'technical_contract_not_legal_policy'
    || inventory.synthetic_data_only !== true || !Array.isArray(inventory.entries) || !inventory.entries.length) throw new TypeError('Invalid Learning V2 data inventory header')
  const required = ['id', 'storage_kind', 'purpose', 'authority', 'learning_authority', 'tenant_key', 'subject_keys', 'field_groups', 'data_classes', 'export', 'mutability', 'rebuildable', 'current_deletion', 'retention', 'erasure', 'backup', 'legal_hold', 'known_gap', 'production_blocker']
  const ids = new Set()
  for (const item of inventory.entries) {
    for (const field of required) if (!Object.hasOwn(item, field)) throw new TypeError(`Inventory entry ${item?.id || '<unknown>'} misses ${field}`)
    if (typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new TypeError('Inventory IDs must be non-empty and unique')
    ids.add(item.id)
    for (const field of ['subject_keys', 'field_groups', 'data_classes']) if (!Array.isArray(item[field])) throw new TypeError(`Inventory entry ${item.id} has invalid ${field}`)
    if (typeof item.export?.status !== 'string' || typeof item.retention?.status !== 'string'
      || typeof item.erasure?.tenant !== 'string' || typeof item.erasure?.subject !== 'string'
      || typeof item.backup?.status !== 'string' || typeof item.legal_hold?.status !== 'string') throw new TypeError(`Inventory entry ${item.id} has incomplete lifecycle contracts`)
  }
  return inventory
}
