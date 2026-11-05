# Cycle 32 · exact confirmed native task correction input

Parent: `43e622b16aa952f5dc2fe7ae9f96260b47682c2e`. This bounded correction
changes only the existing `parseTaskCorrectionInput` facade. The original task,
workforce/time, review, receipt, job-cost and one-use custody owners are unchanged.
No new screen, engine, store, writer, dispatch or synchronization path is created.

## Demonstrated native defect

The existing save facade parsed the confirmed input twice around its source await,
then passed that same caller object into the original engine's separate descriptor
capture. A stateful Proxy could report confirmed task text or billable status for
the first two captures, then substitute another valid value consistently at the
native capture and subsequent live checks.

Actual native red evidence covers all three brands × task/billable substitution.
All six cases failed: the original writer was invoked once and exact original
reconciliation reported `KNOWN_SAVED`. Canonical rows contained either
`Unconfirmed substituted correction` instead of `Explicit confirmed correction`,
or `billable=true` instead of the explicitly confirmed `false`. This was a real
local original-engine correction, not an issued invoice or financial execution.
The original source entry remained immutable, but the appended correction did not
bind the user's confirmed form values.

The facade now requires cloneability and consistency with its captured primitive
own fields before returning a parsed correction. The transient clone is discarded;
it never becomes authority or a replacement live input. The original ordinary
input still reaches the original engine unchanged. Its existing current-source,
post-await input, native time/locked-period, original one-use, acknowledgment and
UNKNOWN/no-replay checks remain intact.

## Source-based verification

- Original red run: **0 PASS / 6 FAIL / 0 SKIP**. Failure messages retain actual
  canonical text/billable values, writer count and exact native receipt state.
- Corrected focused run: **66/66 PASS, zero skips/failures** across three suites:
  11 new input-binding cases, 35 unchanged original correction cases and 20
  unchanged task-continuity cases. These counts overlap no new claimed browser or
  Foundation result; local evidence is not GitHub success.
- Six new cases deny the descriptor substitution across all three brands. One
  rejects a currently transparent Proxy before any writer or claim. Three prove
  rejected Proxy input leaves the original attempt unused, one ordinary confirmed
  correction saves exactly once, original rows/identities remain unchanged and
  duplicate saving is denied. One preserves ordinary reverse-key-order and
  null-prototype input without changing exact source/receipt identity.
- Retained original cases preserve explicit confirmation, stale/revoked access,
  native overlap/locked-period validation, concurrency, lost ACK, live-input
  change and exact read-only UNKNOWN reconciliation. No old assertion or budget
  is changed.
- Strict TypeScript, focused ESLint and Prettier pass. The fix is nonvisual; no
  completed browser baseline, physical rehearsal, setup or 25 offline checks were
  repeated for this facade correction.

```sh
npx vitest run tests/cycle32-task-input-binding.test.ts tests/cycle21-task-correction-review.test.ts tests/cycle25-field-task-continuity.test.ts --maxWorkers=1
```

Raw pre-fix and corrected reports remain outside Git under
`artifacts/cycle32/field/` in the isolated worktree. The red report SHA256 is
`4b635cbc8cd9cfbc064fefd88cb84896258d7198f1f426eeff130f77e256fa56`;
the corrected report SHA256 is
`cf1af95dee49efe2a5da7ac7a6e2243f6b043c34380f43eb9fd84cb30b680b98`.

## Growth audit and safety boundaries

Growth's existing date validation, exact occurrence/purpose selection, current
consent observations, revocation/privacy withholding, blocked renewal requirements
and terminal/UNKNOWN holds were reviewed against their original native owners and
existing acceptance cases. The completed C31 Proxy fix was not recreated. No newly
demonstrated Growth defect warranted an artificial package: **NO_CHANGE**.

The November 4 owner-witnessed main synthetic network-loss evidence is recorded
separately; this application package runs no physical test and does not accept the
full R0 suite, actual power loss, operational recovery or hosted P1. No customer
acceptance, physical work completion, posted labor, invoice issuance, sending or
payment is inferred from a task correction.

All approved designs/artwork, protected source, thirteen historical migrations,
customer14/4B, frozen P1/four artifacts, Netlify/executor, Auth/MFA, NMI, independent
rollback-resistant custody, financial/provider, hosted and production restrictions
remain unchanged. No schema, operational adapter, credential retrieval, hosted
mutation, communication, dispatch, payment, merge or deployment is authorized.
Release1.0 remains **NOT READY / NOT AUTHORIZED**.
