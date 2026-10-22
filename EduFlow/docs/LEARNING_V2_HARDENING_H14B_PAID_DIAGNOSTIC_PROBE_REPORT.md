# EduFlow — P1-B H14-B Paid Diagnostic Probe Report

Datum: 2026-09-05. Ergebnis: `FAILURE_NOT_REPRODUCED`.

## A. Probe identity

- Diagnostic manifest: `tutor-paid-diagnostic-probe-v1`
- Runner: `tutor-paid-diagnostic-probe-runner-v1`
- Diagnostic taxonomy: `tutor-paid-evaluation-provider-diagnostic-v1`
- Synthetic case: `tutor-synthetic-003`; genau eine Wiederholung
- Provider / model: `openai` / `gpt-5.6-terra`
- Prompt / schema: `tutor-guidance-v1` / `tutor-provider-response-v1`
- Source: `tutor-synthetic-fixtures-v1`, 120 unveränderte Fixtures aus `tutor-paid-evaluation-v3`; keine Fortsetzung dieses Evaluationslaufs
- Source digest: `sha256:07b1d7ce1d9e0d4dfd6d18ac1850f5e0185964dd6e9a2d4818b1186763395905`
- Einzelcase-Digest, über das JSON-Array mit genau Fall 003: `sha256:865816da8309f6f9b34bb9eab6915ef696405ce7483b476c5300c26591f75c27`
- Pricing contract: `openai-gpt-5.6-terra-standard-pricing-v1`
- Pricing ref: `openai:gpt-5.6-terra:standard-api:2026-07-30:v1`
- Standard API, `service_tier: default`, Input USD 2 / Million uncached Tokens, Output USD 12 / Million Tokens; kein Cache-Rabatt für Budgetierung
- Diagnostic cap: `0.10 USD`; getrennt vom USD-10-Evaluationsbudget

Preflight: `READY`. Exakte Tuple-, Source-/Case-Hash-, Pricing-, Synthetic-only-, Governance- und Environment-Prüfungen erfolgen vor Providerkonstruktion und erneut vor Transport. Nur für diesen Prozess wurde `RUN_TUTOR_PROVIDER_DIAGNOSTIC_PROBE=1` gesetzt; Default bleibt off. Full-evaluation-Opt-in und Runtime-Gate blieben off. Der Schlüssel kam ausschließlich aus `OPENAI_API_KEY` im Environment.

## B. Execution

| Beobachtung | Ergebnis |
|---|---|
| Transport attempted / transport_started | yes / true |
| Externe HTTP-Calls / Call ordinal | 1 / 1 |
| Retries / Failover | 0 / none |
| response_known / HTTP status | true / 200 |
| parse_reached | true |
| usage_available | true |
| gates_reached | true |
| raw_error_retained | false |

Gezählt wurde am tatsächlichen Fetch-Dispatch, nicht nur am Adapter-Hook. Der empfangene HTTP-Status bestätigt hier zusätzlich eine Antwort. Endpoint und POST-Request sind exakt gebunden; Redirects und SDK-Retries sind gesperrt. Timeout: bestehender Adapter-Default von 6,000 ms. Der produktive Adapter wurde nicht verändert.

Ein exklusiv angelegter und fsyncter Claim wird vor Providerkonstruktion verbraucht und dauerhaft behalten. Parallelstart oder Neustart derselben Probe im selben Checkout kann keinen weiteren Transport auslösen. Auch fehlendes Ergebnis nach einem Crash berechtigt nicht zum Retry. Diese Einmal-Autorisierung darf nicht in einen anderen Checkout kopiert und erneut genutzt werden; es gibt bewusst keine neue verteilte Collection.

## C. Diagnostic result

- `reason_code: null`
- `category: null`

## D. Automated gates

- Result: `PROBE_PASS`
- Automatisierte Gates für Fall 003: `PASS`
- Bounded gate code: `null`
- Unabhängiger lokaler Fallback: `PASS`

Verwendet wurden die unveränderten Gates für Strict Schema, Hidden-answer-/Index-/Elimination-Leakage, Action/Hint Level/Reason, verbotene Autorität, Full Solution, de-CH und begrenzte Ausgabe. Keine Ausgabe wurde als menschlich geprüft bewertet oder gespeichert.

Dies ist ausdrücklich kein `PASS_TECHNICAL` für die 120-Fixture-Evaluation.

## E. Usage

- Input: `277` Tokens
- Output: `104` Tokens
- Total: `381` Tokens
- Kosten nach eingefrorenem Preistupel: `0.001802 USD`
- Rechnerisch verbleibendes Diagnosebudget: `0.098198 USD`
- Weitere autorisierte HTTP-Calls: `0`

Maximum-cost proof vor Transport:

`40,000 / 1,000,000 × 2.00 + 160 / 1,000,000 × 12.00 = 0.08192 USD <= 0.10 USD`.

Erfasste Kosten:

`277 / 1,000,000 × 2.00 + 104 / 1,000,000 × 12.00 = 0.000554 + 0.001248 = 0.001802 USD`.

Usage wurde als validierte numerische Werte aus der HTTP-Antwort vor dem Structured-output-Parser übernommen. Ohne verlässliche Usage wären tatsächliche Kosten und Restbudget ausdrücklich unbekannt geblieben; die konservative Reservierung wäre nicht als Refund behandelt worden. Rechnerisches Restbudget ist keine weitere Ausführungsberechtigung.

## F. Comparison with historical Call 3

`FAILURE_NOT_REPRODUCED`

Das unveränderte Fixture 003 war bei diesem einzelnen Aufruf erfolgreich. Die historische Ursache bleibt ungeklärt; ein einmaliger Erfolg widerlegt keinen intermittierenden Fehler. Die realen Response-/Parse-/Usage-/Gate-Marker sind damit verifiziert. Die Fehlerzweige der Taxonomie wurden offline getestet, aber in dieser erfolgreichen Paid-Probe nicht durch einen realen Fehler ausgelöst.

## G. Recommendation

`SAFE_TO_PLAN_NEW_FULL_EVALUATION`

Nur Planung. Kein neuer Full Run wurde gestartet oder autorisiert. Eine neue vollständige Evaluation benötigt eine separate explizite Entscheidung; der historische Lauf bleibt `PARTIAL_RUN`.

## H. Confirmations and verification

- Total externe Provider-Calls dieses Auftrags: `1 <= 1`; keine Retries, kein Failover, kein weiterer Run
- `approved_for_runtime: false`; effektives Runtime-Gate geschlossen
- `human_review.status: NOT_REVIEWED`
- `reviewer_ref`, `review_ref`, `approved_at`: jeweils `null`
- Production: `NO-GO`; alle sechs Capabilities auch bei all-requested-on effektiv false
- Learning Truth unverändert: Probe importiert keinen Datenbank-/Repository-Schreibpfad und öffnet keine Mongo-Verbindung
- Keine Attempts, Evidence oder Knowledge-State-Mutationen; Mastery, Confidence und Tutor Policy unverändert
- Keine neue Collection, keine zweite Learning Truth, keine Phase-6-Arbeit
- Keine Raw Prompts, Providerantworten/-fehler, Learner/Hidden Answers, HTTP-Header oder Credentials in Result/Report; Artifact-Prüfung bestätigt keine Secret-/Raw-Content-Leaks

Verifikation vor dem einen Paid-Call:

- Probe-Tests: `15/15 PASS`; ausschließlich simulierte Transporte
- Fokussierte H14-A/H14-B/Probe/H10-Runner-Tests: `65/65 PASS`, 0 Skips
- H10 bewusst versioniert: `learning-v2-release-profiles-v10`
- Unit/default: `278/278` = Security `37/37` + Learning V2 `241/241` (vorher 226, plus 15 Probe-Tests)
- Mongo invariants: `151/151 PASS`, echtes disposable Replica Set
- Alle übrigen Required-HTTP-/Capability-Profile: `25/25 PASS`
- Vollständiger H10 Required Runner: `454/454 PASS`, `14/14` Profile, 0 unerwartete Skips, 0 externe Paid-Calls
- Route-Discovery: 35 öffentliche V2-Methodenverträge unverändert und manifestkonform
- Production Build: PASS im Required Runner
- Guarded DB-Drops/Abwesenheitsprüfung, Validator-Restore und Prozess-Cleanup: PASS laut Runner
- Ein verwaistes, gestopptes Mongo-Dateiverzeichnis blieb unter `D:/Projekte/Visual Studio/EduFlow/eduflow-main/tmp/h14b-diagnostic-verification/mongo-mem-co1OuT` zurück. Die separate Löschung wurde von der Ausführungsumgebung blockiert und nicht umgangen. Kein mongod-Prozess war danach aktiv; dies ist ein lokales Temp-Artefakt, keine erreichbare Testdatenbank.
- `git diff --check`: PASS mit Repository-Einstellungen; zusätzliche Whitespace-Prüfung der neuen Probe-Dateien: PASS

Die OpenAI-Docs-Skill und der lokal installierte SDK-Code (6.16.0) dienten zum Abgleich der Response-/Parse-Grenze. Die Instrumentierung beobachtet die bestehende SDK-Parsefunktion, ohne den ausgehenden Prompt oder das Schema zu ändern; Referenz: [OpenAI Modelldokumentation](https://developers.openai.com/api/docs/models/gpt-5.6-terra).

Implementierungsumfang: neue Dateien `diagnostic-probe-manifest.js`, `diagnostic-probe.js`, `learning-v2-diagnostic-probe.mjs` und `learning-v2-h14b-diagnostic-probe.test.mjs`; dünnes Package-Script `diagnostic:tutor-provider`; H10 Manifest/Environment-Isolation samt Assertion; H12 Inventory `learning-v2-data-inventory-v8` für bounded Probe-Artefakte samt Versionsassertions. Full-Evaluation-Manifest, Pricing-Vertrag, Provideradapter, Prompt, Schema, Fixture-Daten und Runtime-Approval-Vertrag blieben unverändert.

Persistierte Ausführungsbelege: `tutor-paid-diagnostic-probe-v1.claim.json` und `tutor-paid-diagnostic-probe-v1.result.json` unter `EduFlow/docs/evaluation-results/`. Der Claim darf für diesen Auftrag nicht gelöscht oder zurückgesetzt werden.

STOP. Kein Full Run, keine Human Review, keine Runtime-Freigabe, keine Phase 6.
