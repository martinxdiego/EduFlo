# EduFlow — P1-B H14-B Paid Synthetic Evaluation Report

## A. Evaluation identity

- manifest version: `tutor-paid-evaluation-v3`
- evaluator version: `tutor-paid-evaluator-v1`
- provider: `openai`
- model: `gpt-5.6-terra`
- prompt: `tutor-guidance-v1`
- schema: `tutor-provider-response-v1`
- fixture digest: `sha256:07b1d7ce1d9e0d4dfd6d18ac1850f5e0185964dd6e9a2d4818b1186763395905`
- pricing ref: `openai:gpt-5.6-terra:standard-api:2026-07-30:v1`
- max cost: `10.00 USD`

## B. Execution

- started state: `true`
- completed state: `true` — der Evaluator beendete den einmaligen Lauf fail-closed; die Fixture-Abdeckung blieb partiell
- fixtures attempted: `3`
- fixtures completed: `2`
- real HTTP calls: `3`
- retries: `0`
- provider errors: `1`
- timeouts: `0`
- hard-stop status: `EVALUATION_TERMINATED` nach `EVALUATION_PROVIDER_ERROR`; kein Budget-Cap-Hard-Stop

Der Paid Run wurde nach dem Providerfehler nicht wiederholt. Es gab keinen automatischen Retry und keinen Provider-Failover.

## C. Usage

- actual input tokens: `572`
- actual output tokens: `171`
- total tokens: `743`
- actual calculated cost: `0.003196 USD`
- remaining HTTP-call budget: `117`
- remaining input-token budget: `4,799,428`
- remaining output-token budget: `19,029`
- remaining total-token budget: `4,818,457`
- remaining cost budget: `9.996804 USD`

Die Kostenberechnung verwendet unverändert die eingefrorenen uncached Standardpreise von `2.00 USD` pro 1 Mio. Input-Tokens und `12.00 USD` pro 1 Mio. Output-Tokens.

## D. Automated gate results

- total PASS: `2`
- total FAIL: `0`
- failure counts by bounded reason code: `{}`
- leakage failures: `0`
- schema failures: `0`
- full-solution failures: `0`
- authority violations: `0`
- locale failures: `0`

Für den dritten HTTP-Call lag wegen des Providerfehlers kein vollständig prüfbares Candidate-Ergebnis vor. Er wurde deshalb nicht als Gate-PASS oder Gate-FAIL gezählt. Der Gesamtstatus kann wegen der partiellen Abdeckung nicht `PASS_TECHNICAL` sein.

Der Report enthält keine Raw Prompts, Raw Provider Responses, Hidden Answers, Learner Answers, Credentials oder Secrets.

## E. Learning invariants

- Attempts unchanged: **bestätigt**
- Evidence unchanged: **bestätigt**
- Knowledge State unchanged: **bestätigt**
- Mastery unchanged: **bestätigt**
- Confidence unchanged: **bestätigt**
- no new pedagogical authority: **bestätigt**

Der Evaluationsprozess verwendete ausschließlich synthetische Fixtures, den externen Provideradapter und eine flüchtige In-Memory-Auswertung. Er öffnete keine MongoDB-Verbindung und führte keine Domain- oder Collection-Schreiboperation aus.

## F. Governance invariants

- runtime approval still false: **bestätigt**
- human review still `NOT_REVIEWED`: **bestätigt**
- no automatic promotion: **bestätigt**
- Production still all-off: **bestätigt**

Es wurde kein Reviewer erzeugt, keine Review-Referenz gesetzt, kein `approved_at` gesetzt, kein Runtime-Providerbetrieb aktiviert und keine Human Review durchgeführt.

## G. Final technical evaluation status

**PARTIAL_RUN**

`PARTIAL_RUN` ist kein technischer PASS, keine Human-Approval und keine Runtime-Approval. Production bleibt **NO-GO**.
