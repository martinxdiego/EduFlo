export const ACTION_LABELS = Object.freeze({ TRY_SIMILAR: 'Andere Aufgabe zum gleichen Lernziel prüfen', REVIEW_CONCEPT: 'Konzept vor weiterer Arbeit besprechen', TEACHER_INTERVENTION: 'Lernstand vor dem nächsten Schritt prüfen' })
export const REASON_TEMPLATES = Object.freeze({
  CONFLICTING_TEACHER_AND_AUTOMATIC_EVIDENCE: 'Aktive Lehrpersonen-Einschätzung und automatische Nachweise widersprechen sich im gleichen Lernziel.',
  TEACHER_REVIEW_BEFORE_NEXT_ACTION: 'Bitte diese Kompetenz gemeinsam prüfen, bevor Sie weitere Arbeit auswählen.',
  SUPPORT_REQUIRED: 'Ein aktueller Level-3-Unterstützungsdurchlauf endete mit Unterstützungsbedarf; ein späterer unabhängiger Nachweis fehlt.',
  REPEATED_INDEPENDENT_ERRORS: 'Mindestens zwei aktuelle unabhängige Fehlernachweise aus zwei verschiedenen Aufgabenversionen liegen vor.',
  DIFFICULTY_SIGNAL_WELL_ENOUGH_SUPPORTED: 'Das aktuelle Schwierigkeitssignal erfüllt die festgelegte Confidence-Grenze von 0,40.',
  CONCEPT_REVIEW_BEFORE_MORE_WORK: 'Eine Besprechung des Konzepts kann vor weiterer Arbeit erwogen werden.',
  ASSISTED_SUCCESS_NEEDS_INDEPENDENT_CHECK: 'Der letzte unterstützende Nachweis entstand nach Hilfe auf Level 2 oder 3. Eine unabhängige Bestätigung steht noch aus.',
  ASSISTANCE_LEVEL_2: 'Unterstützungsstufe: Level 2.', ASSISTANCE_LEVEL_3: 'Unterstützungsstufe: Level 3.',
  LOW_CONFIDENCE_NEEDS_MORE_EVIDENCE: 'Das positive Band ist noch nicht durch Confidence von mindestens 0,70 abgesichert.',
  SINGLE_TASK_ONLY: 'Die beitragenden Nachweise umfassen bisher nur eine exakte Aufgabenversion.',
  ELIGIBLE_SIMILAR_TASK_FOUND: 'Eine andere veröffentlichte Aufgabe mit exakt gleichem Lernziel und gleicher primärer Kompetenz ist verfügbar. Das bedeutet nicht leichter oder schwerer.',
  NO_ACTIVE_EVIDENCE: 'Für dieses Lernziel liegen keine aktiven Nachweise vor.',
  INSUFFICIENT_EVIDENCE_FOR_RULE: 'Die aktuellen Nachweise erfüllen keine der begrenzten Vorschlagsregeln.',
  ACTIVE_TUTOR_SESSION: 'Ein Tutor-Durchlauf für dieses Lernziel ist noch aktiv.',
  AMBIGUOUS_OBJECTIVE_SCOPE: 'Bitte ein eindeutiges veröffentlichtes Lernziel mit exakter Version auswählen.',
  STATE_NOT_CURRENT: 'Ein aktueller, eindeutiger Lernzustand kann derzeit nicht bestätigt werden.',
  CONFLICTING_EVIDENCE_REQUIRES_REVIEW: 'Die Nachweise sind gemischt; keine begrenzte Vorschlagsregel trifft zu.',
  NO_ELIGIBLE_TASK: 'Keine andere Aufgabe erfüllt sämtliche Auswahlbedingungen. Dies betrifft das verfügbare Material, nicht die lernende Person.',
  AMBIGUOUS_TASK_VERSION: 'Aufgaben mit mehreren veröffentlichten Versionen wurden ausgeschlossen.',
  AMBIGUOUS_TASK_BINDING: 'Mehrdeutig gebundene Aufgabenquellen wurden ausgeschlossen.',
  UNSUPPORTED_TASK_TYPE: 'Nicht unterstützte Aufgabenformen wurden ausgeschlossen.',
  SELECTED_RESPONSE_SCOPE_LIMITATION: 'Auswahlnachweise belegen keine Erklärung oder Transferleistung.',
  TRANSFER_TASK_TYPE_UNSUPPORTED: 'Transfer-Vorschläge sind in dieser Entwicklungsphase nicht vorgesehen.',
  CURRENT_SCOPE_SECURE_NO_CALIBRATED_CHALLENGE: 'Der aktuelle Bereich ist abgesichert; kalibrierte schwierigere Aufgaben sind nicht verfügbar.',
  TEACHER_NO_DEMONSTRATION_ONLY: 'Es liegen nur neutrale Lehrpersonen-Einschätzungen ohne Demonstration vor.',
  DEVELOPMENT_RULES_NOT_EDUCATOR_CALIBRATED: 'Entwicklungsregeln: noch nicht pädagogisch kalibriert.',
  selected_response_only: 'Begrenzt auf Auswahlnachweise; kein Transferbeleg.', single_modality_evidence: 'Nur eine Nachweisform.',
  single_task_only: 'Nur eine exakte Aufgabenversion.', no_active_evidence: 'Keine beitragenden Nachweise.',
  support_required_neutral_evidence: 'Unterstützungsbedarf ist neutral für Mastery.', teacher_no_demonstration: 'Keine Demonstration ist ein neutraler Nachweis.',
  teacher_assessment_only: 'Nur Lehrpersonen-Nachweise; Confidence bleibt begrenzt.', confidence_below_secure_threshold: 'Confidence liegt unter der Grenze für abgesicherte Aussagen.',
})
export const explainCodes = (codes) => codes.map((code) => ({ code, text: REASON_TEMPLATES[code] || 'Begrenzter Entwicklungsnachweis.' }))

export function recommendationDto(record) {
  // Explicit allowlist: no Mongo identity, tenant, teacher or decision-key hash.
  return {
    recommendation_id: record.recommendation_id, type: record.type, label: ACTION_LABELS[record.type],
    status: record.status, state_version: record.state_version, competency_ref: record.competency_ref, objective_ref: record.objective_ref,
    candidate_task: record.candidate_task_ref ? { ...record.candidate_task_ref, label: 'Andere veröffentlichte Aufgabe · gleiches Lernziel' } : null,
    reasons: explainCodes(record.reason_codes), limitations: explainCodes(record.limitation_codes),
    evidence_scope: { supporting_evidence_ids: record.input.supporting_evidence_ids, references_bounded: true },
    created_at: record.created_at, expires_at: record.expires_at,
    decision: record.decision ? { action: record.decision.action, decided_at: record.decision.decided_at, recommendation_state_version: record.decision.recommendation_state_version } : null,
    supersession: record.supersession || null,
    technical: { schema_version: record.schema_version, rule: record.rule, input: record.input, generation_key: record.generation_key, freshness: 'DEVELOPMENT OPERATIONAL FRESHNESS CONSTANT: 24h' },
    assignment_created: false, knowledge_state_changed: false,
  }
}
