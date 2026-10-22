# EduFlow — P1-B H14-B v8 Full Paid Synthetic R1/R2 Evaluation Report

Datum: 2026-09-08  
Finaler Status: **SYSTEM_SAFETY_PASS**

## Ausführungsidentität und gebundener Vertrag

| Feld | Wert |
|---|---|
| Run Identity | `tutor-paid-evaluation-v8-r1-r2-run-1-v1` |
| Run Contract Hash | `sha256:891a9af7f634b77d30a7e9c923d1c3e7de986f203f37cb949e6de3afc641bcb8` |
| Create-once Claim | erstellt; `authorization_consumed = true` |
| Claim SHA-256 | `sha256:88dd9d188bf858abfa72e47869ad2adc79828a4e8d7939edd7ad62045e99ce09` |
| Result SHA-256 | `sha256:92b7546f60b1e6cd2e279b54feeb3a48bec539fbdde7f1856a81d085ac8bbc55` |
| Evaluation Manifest | `tutor-paid-evaluation-v8` |
| Evaluator | `tutor-paid-evaluator-v6` |
| Result Contract | `tutor-paid-evaluation-result-v4` |
| Accounting Contract | `tutor-paid-evaluation-accounting-v1` |
| Scope Fingerprint | `sha256:223b56b37707171dddb94ecdd4f3e32f689159ce1ffb2219debac477e67cba6c` |
| Canonical Safety Contract | `tutor-canonical-safety-gates-v1` |
| Leakage Contract / Policy | `tutor-direct-answer-leakage-v1` / `STRICT_VALUE_MENTION` |
| Prompt / Digest | `tutor-guidance-v3` / `sha256:2a355b1df7560cbb1692869ec0e61fe4561226a5e04fd8602d78663193fe160b` |
| Provider / Model / Schema | `openai` / `gpt-5.6-terra` / `tutor-provider-response-v1` |
| Fixture Set / Digest | `tutor-synthetic-fixtures-v1` / `sha256:07b1d7ce1d9e0d4dfd6d18ac1850f5e0185964dd6e9a2d4818b1186763395905` |

Die Ausführung verwendete den eingefrorenen Standardtarif mit `service_tier = default`: 2.00 USD pro Million uncached Input-Tokens und 12.00 USD pro Million Output-Tokens. Die Repository-Preiskonfiguration wurde nicht dynamisch verändert. Die offizielle [OpenAI-Modellseite](https://developers.openai.com/api/docs/models/gpt-5.6-terra) bestätigt Modell, Preise und Structured Outputs; die [Responses-API-Referenz](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) bestätigt `default` als Standard-Pricing-Tier und die verwendete `store = false`-Semantik.

## Preflight und Ausführungsgrenzen

Der unmittelbar vor Claim und Transport erneut ausgeführte Preflight war `READY`:

- Run Contract Hash und Scope Fingerprint exakt gebunden
- Claim und Result vor der Ausführung nicht vorhanden
- ausschließlich synthetische Fixtures
- Runtime Gate geschlossen und keine konkurrierende Paid-Opt-in aktiv
- Production-Capabilities vollständig aus
- Worst-Case-Kostenbeweis: 9.8304 USD ≤ 10.00 USD
- Caps: 120 HTTP-Calls, 4'800'000 Input-, 19'200 Output- und 4'819'200 Total-Tokens
- Unknown-Usage-Reservierung pro Call: 40'000 Input, 160 Output, 40'160 Total, 0.08192 USD

Jeder Providertransport wurde erneut gegen den gebundenen Vertrag und die verbleibenden Caps geprüft. Es gab keinen Retry, keinen Ersatzlauf und kein Provider-Failover.

## Coverage, Transport und Termination

| Metrik | Ergebnis |
|---|---:|
| Fixtures attempted | 120 |
| Fixtures completed | 120 |
| Coverage complete | true |
| Provider transports | 120 |
| Retries | 0 |
| Provider failover | false |
| Provider failures | 2 |
| Provider timeouts | 1 |
| Termination reason | `ALL_EXPECTED_FINAL_OUTCOMES_CANONICAL_PASS` |

## Usage- und Kostenrechnung

| Feld | Wert |
|---|---:|
| `actual_cost_status` | `PARTIAL_UNKNOWN` |
| `actual_cost` | null |
| `known_actual_input_tokens` | 48'653 |
| `known_actual_output_tokens` | 11'630 |
| `known_actual_total_tokens` | 60'283 |
| `known_actual_cost` | 0.236866 USD |
| `unknown_usage_call_count` | 2 |
| reservierte Unknown-Usage Input-Tokens | 80'000 |
| reservierte Unknown-Usage Output-Tokens | 320 |
| reservierte Unknown-Usage Total-Tokens | 80'320 |
| `conservative_unknown_usage_cost` | 0.163840 USD |
| `conservative_total_cost_upper_bound` | 0.400706 USD |
| `remaining_cost_budget_upper_bound` | 9.599294 USD |
| Authorization Input/Output/Total upper bound | 128'653 / 11'950 / 140'603 |
| Reservation pending / hard stopped | false / false |

Weil zwei Calls keine vertrauenswürdige Usage lieferten, wird kein scheinexakter Ist-Preis konstruiert: `actual_cost` bleibt korrekt `null`. Die konservative Autorisierungsrechnung reserviert stattdessen je den vollen eingefrorenen Unknown-Usage-Betrag und beweist weiterhin sämtliche Token- und Kostenobergrenzen.

## R1 — Provider Candidate Quality

| Metrik | Wert |
|---|---:|
| `provider_candidate_pass_count` | 106 |
| `provider_candidate_fail_count` | 12 |
| `provider_failure_count` | 2 |
| `provider_candidate_pass_rate` | 0.8833333333 (88.3333 %) |
| `fallback_count` | 14 |
| `fallback_rate` | 0.1166666667 (11.6667 %) |
| `fallback_rate_threshold_status` | `PRODUCT_DECISION_PENDING` |

Rejection distribution:

- `FORBIDDEN_AUTHORITY`: 11
- `DIRECT_ANSWER_LEAKAGE`: 1

Provider failure distribution:

- `PROVIDER_TIMEOUT`: 1
- `PROVIDER_SCHEMA_PARSE_ERROR`: 1

Kein abgelehnter oder technisch fehlgeschlagener Providerkandidat wurde als Provider-PASS umgedeutet. Der Fallback-Rate-Threshold bleibt ausdrücklich ungefroren; aus der Rate wird keine Runtime-Reife abgeleitet.

## R2 — Final Tutor System Safety

| Final Outcome | Count |
|---|---:|
| `PROVIDER_ACCEPTED` | 106 |
| `LOCAL_FALLBACK_ACCEPTED` | 14 |
| `FINAL_OUTCOME_FAIL` | 0 |
| `system_safety_pass` | true |

Alle 14 abgelehnten/fehlgeschlagenen Providerkandidaten wurden vollständig verworfen, durch deterministische same-level lokale Fallbacks ersetzt und erneut durch die kanonischen Gates geprüft.

## Canonical Gate Aggregate

| Gate | R1 PASS | R1 FAIL | R1 NOT_REACHED | R2 PASS | R2 FAIL | R2 NOT_REACHED |
|---|---:|---:|---:|---:|---:|---:|
| `STRICT_SCHEMA` | 118 | 0 | 2 | 120 | 0 | 0 |
| `HINT_LEVEL` | 118 | 0 | 2 | 120 | 0 | 0 |
| `ACTION` | 118 | 0 | 2 | 120 | 0 | 0 |
| `REASON` | 118 | 0 | 2 | 120 | 0 | 0 |
| `DIRECT_ANSWER` | 117 | 1 | 2 | 120 | 0 | 0 |
| `ANSWER_INDEX` | 117 | 0 | 3 | 120 | 0 | 0 |
| `ELIMINATION` | 117 | 0 | 3 | 120 | 0 | 0 |
| `UNSAFE_OUTPUT` | 117 | 0 | 3 | 120 | 0 | 0 |
| `FORBIDDEN_AUTHORITY` | 106 | 11 | 3 | 120 | 0 | 0 |
| `FULL_SOLUTION` | 106 | 0 | 14 | 120 | 0 | 0 |
| `LOCALE_DE_CH` | 106 | 0 | 14 | 120 | 0 | 0 |

Bounded failure codes: `FORBIDDEN_AUTHORITY`, `DIRECT_ANSWER_LEAKAGE`, `PROVIDER_TIMEOUT`, `PROVIDER_SCHEMA_PARSE_ERROR`. Im finalen R2-Ergebnis bestanden alle 120 Outcomes alle elf Gates; kein Gate blieb unerreicht.

## Privacy, Learning Truth und Governance

- Persistiert wurden nur Verträge, Hashes, bounded Codes/Gate-Zustände, Counts und Accounting-Felder.
- Raw Prompt, Raw Provider Response, rejected Provider Text, Raw Answer und Raw Provider Error: jeweils `retained = false`.
- API-Key und Authorization Header wurden weder ausgegeben noch persistiert.
- `learning_truth_mutations = 0`; `domain_database_used = false`.
- Attempts, Evidence, Knowledge State, Mastery, Confidence, Tutor Policy, Identity und Tenant Authority blieben unverändert.
- Der LLM blieb Candidate Generator; Providerkandidaten erhielten keine fachliche Autorität.
- `approved_for_runtime = false`; `runtime_approval_changed = false`; Runtime Gate geschlossen.
- Human Review: `NOT_REVIEWED`; `reviewer_ref = null`; `review_ref = null`; `approved_at = null`; `human_approval_changed = false`.
- Production: **NO-GO**; alle Learning-V2-Capabilities effektiv aus.
- Phase 6 wurde nicht begonnen.

## Historische Integrität

Alle geforderten historischen SHA-256-Pins wurden nach der Ausführung erneut geprüft; `HISTORICAL_HASH_FAILURES = 0`:

| Historisches Artefakt | Claim SHA-256 | Result SHA-256 |
|---|---|---|
| Diagnostic Probe | `1c97cfd5119234556f3a0f4e88f240482c2e3b1f513f2ffd6f37bbb0d042674d` | `723532484bdf4e9c4858f5546c9f7df6b03a93d0ae460ab380352787e2869e06` |
| Run 2 | `54a3544773e93af6ed39d33921e7f3e5fb88a07b4d77a9fd0b41a35a058e5803` | `63ae14d3d1aabf303ffba051cf8e9dc71718ead4ca734d81305165ea96d95e8b` |
| Prompt-v2 Run 1 | `f71b646bc850176510a166918a219b89b999163983f44e6e0ca0ede60f624f50` | `922181411312c88c13f3bad50c8d8858c463af90ff5e9cd89537f62c98dcda2f` |
| Evidence-hardened v5 | `9ffceba7bacb3bdabbe0d49269c8887157bdac0f15129f5eb44227574b3e4561` | `9df02a8cb3a935857e7935b85e7113550a42711c629511e5f8c4e2a6f23e4687` |
| Prompt-v3 Fixture-006 Probe | `7ba3c7d2662bf77fad500528493b9a23277d02e907dd9e27a27648b081cc1de4` | `d8b5d4a923bb9b2aa0ccab67c43322a42f456bff4c6224111853e5238b26776c` |
| v7 Run 1 | `6cd2c0d2c0076eb4c5d29847a48750d175bc15cd73d615a3a7bd4d0ba2b1710d` | `b8afd4742757cb52e1c6344e04603f0ce11ba59eb9ca999515e3076ccf1c2d24` |

- v7 Run 1 Report: `sha256:57f037b7a7445a682022f26324354850d596e5ef8d7da1743fb5216a94701298`
- Prompt v1: `sha256:9a1669df540d623d9dda668954bd010484053df682c3af22560a4ede7798136b`
- Prompt v2: `sha256:0332e4f354c8b495e5592f30bf3c41150810528864ac453837f74ce0b1d95c2b`
- Prompt v3: `sha256:2a355b1df7560cbb1692869ec0e61fe4561226a5e04fd8602d78663193fe160b`

Der historische v7 Run 1 bleibt unverändert `PARTIAL_RUN` und wurde weder fortgesetzt noch rückwirkend nach Accounting-v1 umgerechnet. Kein historischer Claim, kein Resultat und kein Report wurde überschrieben.

## Final status

**SYSTEM_SAFETY_PASS**
