# EduFlow — P1-B H14-B Prompt v3 Alignment Report

Stand: 2026-09-07

## Ergebnis

`tutor-guidance-v3` ist als neuer, unveränderlicher Prompt-Pin angelegt und auf die eingefrorene `STRICT_VALUE_MENTION`-Policy ausgerichtet. v1 und v2 bleiben unverändert und adressierbar. Es wurde weder eine bezahlte Evaluation noch ein externer Providertransport ausgeführt. Runtime- und Human-Approval bleiben geschlossen; Production bleibt NO-GO.

## Geänderte Dateien

- Prompt-/Vertrags-Pins:
  - `lib/server/learning-v2/contracts/phase3.js`
  - `lib/server/learning-v2/tutor/prompt-registry.js`
  - `lib/server/learning-v2/tutor/evaluation/evaluation-manifest.js`
  - `lib/server/learning-v2/tutor/evaluation/evidence-hardened-run-1-manifest.js`
  - `lib/server/learning-v2/tutor/governance/runtime-approval.js`
- H12/H10:
  - `lib/server/learning-v2/privacy/data-inventory-v1.js`
  - `scripts/learning-v2-release/manifest-v1.mjs`
  - `package.json`
- Offline-Verifikation:
  - `tests/learning-v2-h14b-prompt-v3.test.mjs` (neu, A–N)
  - bestehende H14-A/H14-B-Vertragstests wurden auf die bewusst versionierten aktuellen und historischen Pins angepasst.

Keine Collection, Route oder persistente Learning-Truth-Struktur wurde ergänzt.

## v1-/v2-Erhaltungsnachweis

| Prompt | Status | Digest |
|---|---|---|
| `tutor-guidance-v1` | byte-identisch, weiterhin adressierbar | `sha256:9a1669df540d623d9dda668954bd010484053df682c3af22560a4ede7798136b` |
| `tutor-guidance-v2` | byte-identisch, weiterhin adressierbar | `sha256:0332e4f354c8b495e5592f30bf3c41150810528864ac453837f74ce0b1d95c2b` |
| `tutor-guidance-v3` | neu, eigenständig und frozen | `sha256:2a355b1df7560cbb1692869ec0e61fe4561226a5e04fd8602d78663193fe160b` |

Die Tests vergleichen v1 und v2 mit ihren vollständigen erwarteten UTF-8-Inhalten und den bisherigen Digests. Die Registry enthält alle drei Versionen als eingefrorene Einträge.

## Exakter v3-Vertrag

v3 erbt den vollständigen v2-de-CH-Vertrag unverändert und ergänzt ausschliesslich:

- angebotene Antwortoptionen dürfen in `learner_message` nicht vollständig wortgetreu wiedergegeben werden;
- Optionen dürfen nicht als vorgeschlagene Antwort genannt, zitiert oder wiederholt werden;
- Optionsindex und Optionsbuchstabe dürfen nicht verraten werden;
- Optionen dürfen nicht so eliminiert werden, dass die verbleibende Antwort offengelegt wird;
- die Denkarbeit der lernenden Person muss erhalten bleiben;
- Optionskonzepte und Paraphrasen bleiben zulässig.

Der Provider-Kontext enthält weiterhin nur unlabeled Optionswerte. Er enthält keine korrekte Antwortidentität, keinen korrekten Index, keinen Answer Key, kein Grading-Ergebnis sowie keine Evidence-, Mastery-, Confidence-, Student-, Identity- oder Tenant-Autorität.

## Versionen und Digests

| Vertrag | Historisch | Aktuell/prospektiv |
|---|---|---|
| Prompt | v1/v2 | `tutor-guidance-v3` |
| Evaluation manifest | `tutor-paid-evaluation-v5` + ältere Versionen | `tutor-paid-evaluation-v6` |
| Evaluator | `tutor-paid-evaluator-v4` | unverändert `tutor-paid-evaluator-v4` |
| Leakage contract/policy | `tutor-direct-answer-leakage-v1` / `STRICT_VALUE_MENTION` | unverändert |
| Runtime approval | `tutor-runtime-approval-v3` für Prompt v2 | `tutor-runtime-approval-v4` für Prompt v3, pending |

- Historischer v5-Scope-Fingerprint: `sha256:2774461222995a1c6433e426a2e8d12bd9d0cfa4cf7ecf615b57cb3bf79f21ce`
- Prospektiver v6-Scope-Fingerprint: `sha256:d5d0058476e11f8ecee743e505ed87832a3a1fa40699ee11e8b57206c728cf65`
- v6-Supersedes: `tutor-paid-evaluation-v5`
- v6-Revision reason: `ANSWER_OPTION_TEXT_AVOIDANCE_ALIGNMENT`

Der Evaluator wurde absichtlich nicht neu versioniert: Matcher, Gate-Reihenfolge, Evidence-Contract und Gate-Semantik wurden nicht geändert. Die neue Abgrenzung ist eine Prompt-Anweisung, kein semantischer Ähnlichkeitsklassifikator.

## Runtime Governance

Der aktuelle exakte Runtime-Pin ist `openai` / `gpt-5.6-terra` / `tutor-guidance-v3` / `tutor-provider-response-v1` mit Approval-Ref `approval:openai-tutor-guidance-v3:pending`.

- `approved_for_runtime: false`
- Human Review: `NOT_REVIEWED`
- `reviewer_ref: null`
- `review_ref: null`
- `approved_at: null`
- Prompt-v2- oder sonstiger Tuple-Mismatch: fail-closed mit `PROVIDER_PROMPT_NOT_APPROVED`
- exakter v3-Tuple: weiterhin fail-closed mit `PROVIDER_APPROVAL_NOT_APPROVED`

Evaluation kann weder Runtime-Approval noch Human-Approval setzen.

## Evaluation-Manifest und historische Evidenz

`tutor-paid-evaluation-v6` bindet den neuen v3-Digest und einen eigenen Scope-Fingerprint. Seine Autorisierung bleibt `SYNTHETIC_EVALUATION_CONFIGURATION_ONLY` / `NOT_AUTHORIZED` mit `runtime_approval_effect: NONE`. Damit existiert in diesem Schritt keine Paid-Execution-Autorisierung.

Der konsumierte Evidence-Hardened Run bleibt explizit an das historische `tutor-paid-evaluation-v5` gebunden. Hashprüfungen sichern die bisherigen Diagnostic-, Run-2-, Prompt-v2- und v5-Claim-/Result-Artefakte sowie den v5-Ausführungsreport. Nichts wurde gelöscht, zurückgesetzt oder überschrieben.

## Leakage- und Locale-Kompatibilität

- Reproduktion einer langen korrekten Option: `DIRECT_ANSWER_LEAKAGE`
- korrekter Optionsindex: `ANSWER_INDEX_LEAKAGE`
- vollständige Elimination falscher Optionen: `ELIMINATION_LEAKAGE`
- konzeptuelle Paraphrase ohne kanonischen Wert: PASS beim unveränderten Direct-Answer-Matcher
- vollständige Lösung: unverändert `FULL_SOLUTION`
- U+00DF in `learner_message`: `LOCALE_DE_CH_VIOLATION`
- konformes `ss`: PASS
- U+1E9E bleibt entsprechend der eingefrorenen Grenze ausserhalb des Locale-Gates

Es gibt keine semantische Ähnlichkeitsprüfung und keine Abschwächung des vorhandenen Validators.

## H12-Inventar

Das statische Inventar ist bewusst auf `learning-v2-data-inventory-v14` versioniert. Erfasst sind v1/v2/v3-Prompt-Pins, historische v4/v5- und prospektive v6-Fingerprints sowie die statische Optionstext-Vermeidungsregel. Es gibt keine neue Collection und keine Speicherung roher Prompts, Providerantworten, Antwortwerte oder Match-Substrings in Telemetrie oder Export.

## Tests und H10

- Neue fokussierte Prompt-v3-Tests: **14/14 PASS**, 0 Skips
- Gesamte H14-B-Offline-Regression: **131/131 PASS**, 0 Skips
- H10-Manifest: `learning-v2-release-profiles-v16`
- H10 Required Runner: **14/14 Profile PASS**, **538/538 Tests PASS**, 0 Failures, 0 unexpected Skips
  - Security Unit: 37/37
  - Learning V2 Unit: 325/325
  - Mongo invariants: 151/151
  - HTTP-/Gate-/Failure-Profile: 25/25
- alle Disposable-DBs: Drop erfolgreich und Abwesenheit verifiziert
- Production `all-off`: PASS, alle Capabilities off
- Production `all-requested-on`: PASS, alle Capabilities weiterhin off
- Produktions-Build im H10-Lauf: PASS
- externe bezahlte Provideraufrufe: **0**

## Unveränderte Grenzen

Attempts, Evidence, Mastery, Confidence, Knowledge State, Tutor Policy, Identity und Tenant Authority wurden nicht verändert. H14-A-Transport-/Concurrency-Invarianten bleiben unverändert. Es gab keine Human Review, keine Runtime-Freigabe, keine Phase-6-Arbeit und keine neue Paid-Evaluation.

## Finaler Status

**READY FOR TARGETED PAID PROBE**

Dieser Status ist keine Ausführungsautorisierung. Ein späterer Paid Probe benötigt einen neuen exakten Run-Vertrag und eine separate explizite Freigabe.
