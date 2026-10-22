# EduFlow — P1-B H14-B Full Paid Synthetic Evaluation Run 2 Report

Datum: 2026-09-05. Der neue, eigenständige Lauf wurde nach dem ersten vollständig ausgewerteten Fixture wegen eines verpflichtenden Locale-Gates fail-closed beendet. Es wurde kein weiterer Call und kein Ersatzlauf gestartet.

## A. Run identity

- Run manifest: `tutor-paid-evaluation-run-2-v1`
- Run contract hash: `sha256:e811c0c98b1b1962e85298349a4d2342f2002ce78150d2ee79bf3313a42d865d`
- Evaluator: `tutor-paid-evaluator-v2`
- Source manifest / evaluator: `tutor-paid-evaluation-v3` / `tutor-paid-evaluator-v1`
- Authorization: `PAID_SYNTHETIC_EVALUATION_RUN_2_ONLY`; keine Runtime-Wirkung
- Provider / model: `openai` / `gpt-5.6-terra`
- Prompt / schema: `tutor-guidance-v1` / `tutor-provider-response-v1`
- Fixture set: `tutor-synthetic-fixtures-v1`, `120` Fixtures, `1` Wiederholung
- Fixture digest: `sha256:07b1d7ce1d9e0d4dfd6d18ac1850f5e0185964dd6e9a2d4818b1186763395905`
- Pricing contract: `openai-gpt-5.6-terra-standard-pricing-v1`
- Pricing ref: `openai:gpt-5.6-terra:standard-api:2026-07-30:v1`
- Pricing: Standard API, `service_tier: default`, USD 2.00 / Million uncached Input-Tokens, USD 12.00 / Million Output-Tokens
- Run-2-Maximum: `10.00 USD`; `C_max = 9.8304 USD <= 10.00 USD`

Der exklusive Claim bindet denselben Run-Contract-Hash und Fixture-Digest. Historischer `PARTIAL_RUN` und Diagnoseprobe wurden weder fortgesetzt noch in Run 2 übernommen. Die offizielle [OpenAI-Dokumentation für GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra) bestätigt Responses, Structured Outputs sowie die genannten Input-/Output-Preise; Runtime-seitig wurde ausschließlich der immutable Repository-Preisvertrag verwendet.

## B. Execution

| Feld | Run 2 |
|---|---:|
| started | yes |
| executor terminated conclusively | yes, fail-closed |
| completed / 120-Fixture coverage complete | no / no |
| fixtures attempted | 1 |
| fixtures completed | 1 |
| real external HTTP calls | 1 |
| SDK/application retries | 0 |
| provider failover | 0 |
| provider failures | 0 |
| timeouts | 0 |
| automated gate failures | 1 |
| termination reason | `LOCALE_DE_CH_VIOLATION` |

Die HTTP-Zählung erfolgte direkt am tatsächlichen Fetch-Dispatch. Der eine Provider-Call lieferte eine parsebare strukturierte Antwort und verlässliche Usage. Anschließend scheiterte das de-CH-Gate. Der Evaluator beendete Run 2 sofort; die restlichen 119 Transport-Slots sind rechnerischer Rest, keine Ausführungsberechtigung.

## C. Usage

- Actual input tokens: `293`
- Actual output tokens: `84`
- Actual total tokens: `377`
- Actual Run-2 cost: `0.001594 USD`
- Unpriced calls: `0`
- Remaining HTTP-call budget: `119`
- Remaining input-token budget: `4,799,707`
- Remaining output-token budget: `19,116`
- Remaining total-token budget: `4,818,823`
- Remaining cost budget: `9.998406 USD`

Kostenrechnung: `293 / 1,000,000 × 2.00 + 84 / 1,000,000 × 12.00 = 0.000586 + 0.001008 = 0.001594 USD`. Kein Cached-input-Rabatt wurde verwendet. Die verbleibenden Budgetwerte autorisieren ausdrücklich keinen weiteren Aufruf.

## D. Results

- Automated PASS count: `0`
- Automated FAIL count: `1`
- Failures by bounded reason code: `{ "LOCALE_DE_CH_VIOLATION": 1 }`
- Leakage failures: `0`
- Schema failures: `0`
- Full-solution failures: `0`
- Authority violations: `0`
- Locale failures: `1`

Das Fixture wurde als abgeschlossen gezählt, weil Providerantwort, Structured-output-Parsing, Usage-Prüfung und automatisierte Gates erreicht wurden. Wegen des Gate-Fails und fehlender 120/120-Abdeckung ist `PASS_TECHNICAL` ausgeschlossen. Rohoutput wurde weder gespeichert noch für eine manuelle Interpretation herangezogen.

## E. Provider diagnostics

- Bounded provider diagnostic summary: `[]`
- Provider/transport/parse failures: `0`
- Raw provider error messages/bodies: nicht gespeichert

Der Fehler entstand nach erfolgreichem Providertransport und Parsing im automatisierten Locale-Gate. Deshalb wurde kein Providerfehler erfunden und die Providerdiagnostik blieb leer.

## F. Learning invariants

- Attempts unchanged: bestätigt
- Evidence unchanged: bestätigt
- Knowledge State unchanged und rebuildability unberührt: bestätigt
- Mastery unchanged: bestätigt
- Confidence unchanged: bestätigt
- Tutor Policy unchanged: bestätigt
- Student identity und Tenant authority unchanged: bestätigt
- Neue pädagogische Autorität: keine

Der Run-2-Evaluator importiert keinen Mongo-/Repository-Schreibpfad, öffnete keine Mongo-Verbindung und meldet `domain_database_used: false` sowie `learning_truth_mutations: 0`. Persistiert wurden ausschließlich bounded Ausführungsbelege außerhalb der Domain.

## G. Governance invariants

- `approved_for_runtime: false`
- `human_review.status: NOT_REVIEWED`
- `reviewer_ref: null`
- `review_ref: null`
- `approved_at: null`
- Runtime provider gate effektiv geschlossen
- Automatische Promotion: keine
- Production capabilities: alle sechs all-off, auch bei all-requested-on
- Production: `NO-GO`
- Human Review: nicht durchgeführt
- Phase 6: nicht gestartet

## H. Cost separation

Die folgenden Beträge bleiben getrennte Ausführungsbelege und wurden nicht zu einem Run-2-PASS-Kriterium zusammengeführt:

- Historischer `PARTIAL_RUN`: `0.003196 USD`
- Diagnostic probe: `0.001802 USD`
- Full evaluation Run 2: `0.001594 USD`

Run 2 besitzt ausschließlich sein eigenes USD-10.00-Limit. Es entsteht kein allgemeines Provider-/Runtime-Budget und kein Anspruch auf einen weiteren Lauf.

## Execution artifacts and verification

- Claim: `docs/evaluation-results/tutor-paid-evaluation-run-2-v1.claim.json`
- Result: `docs/evaluation-results/tutor-paid-evaluation-run-2-v1.result.json`
- Beide Dateien sind im aktuellen Worktree **untracked**.
- Sie enthalten ausschließlich Run-/Fixture-Hashes, bounded Case-/Gate-Metadaten, Aggregate Usage/Cost und Governance-Aussagen.
- Artifact-Prüfung: keine Raw Prompts, Providerantworten, Providerfehler, Hidden/Learner Answers, HTTP-Header, Authorization-Werte, API-Keys oder Secrets; Credential-Leak-Prüfung negativ.
- Lifecycle: Claim und Result bleiben als Run-2-Auditbelege erhalten. Der Claim darf bei Erfolg, Fehler, Partial Run oder fehlendem Result nicht gelöscht/zurückgesetzt werden, um einen weiteren Call zu autorisieren. Das ist keine Production-Retention-Policy und kein allgemeines Idempotency-System.
- Der historische Diagnose-Claim wurde nicht gelöscht oder verändert.
- Filesystem-Claims koordinieren nur diesen Checkout; unabhängig kopierte Repositories bleiben eine dokumentierte Grenze. Es ist kein weiterer Run autorisiert.
- Neue Collection: keine.

Verifikation vor Run 2:

- Run-2-Tests: `16/16 PASS`, vollständig offline/simuliert
- Fokussierte H10/H14-Testmenge: `81/81 PASS`, 0 Skips
- H12 Inventory: `learning-v2-data-inventory-v9`
- H10 Manifest: `learning-v2-release-profiles-v11`
- Vollständiger H10 Required Runner: `470/470 PASS`, `14/14` Profile, 0 unerwartete Skips
- Unit/default: Security `37/37` + Learning V2 `257/257`
- Mongo invariants: `151/151 PASS` mit eigenem disposable Replica Set
- Route-/Capability-/Failure-Profile: `25/25 PASS`
- Production Build, Route-Discovery, Validator-Restore und guarded DB-Drop/Abwesenheitsprüfung: PASS
- Externe Paid-Calls in H10/Offline-Verifikation: `0`
- `git diff --check` vor Ausführung: PASS

## I. Final status

**FAIL_TECHNICAL**

Grund: `LOCALE_DE_CH_VIOLATION` im ersten vollständig ausgewerteten Run-2-Fixture. Run 2 wurde fail-closed beendet. Kein Retry, kein zweiter Call, kein Replacement Run, keine Human Review, keine Runtime-Freigabe und keine Phase 6.

STOP.
