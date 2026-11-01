# Offline synthetic financial reconciliation/export contract

Date: 2026-11-01. Feature IDs: FIN-001 / FIN-002 / INT-001.
Owner: finance workstream; integrator: Main Codex.
Base: exact PR3 commit `e73afa02f6a20d6f278fa7315c6ae107b404c054`.
Branch: `codex/program-finance-export`; proposed stacked review against
`codex/program-finance-readiness`. Local implementation only.
Release1.0 remains **NOT READY / NOT AUTHORIZED**.

## Executable scope

`src/domain/finance/export.ts` exports `projectSyntheticFinancialExport` over the
existing `Invoice`, `PaymentEvent` and `LedgerEntry` types. It calls the existing
PR3 `verifyLedger`; no estimating, ledger, receipt, posting or provider engine is
replaced. The function defaults OFF. Its explicit enabled option also requires
`syntheticFixture:true`, a known existing sample-company ID, `release-preview`
source kind, an invoice snapshot marked `internal_test:true` and synthetic events.
These are fixture-admission checks, **not genuine authentication or authorization**.
There is no App import, UI route, server writer, storage, credential or network call.

The caller supplies one exact organization/customer/property-or-null/invoice/currency
and canonical UTC as-of timestamp, plus a source reference, observation time, exact
contract ID and expected event/ledger ID manifest. Observation must cover as-of;
rows after as-of are rejected rather than silently filtered. All actual rows must
match the selected tenant/customer/invoice/currency. Customer/property and amount
metadata must agree with the existing saved invoice snapshot. No source version is
invented: the invoice/contract and exact projection evidence are the available IDs.
A future producer must independently prove its transaction snapshot and coverage;
this caller-declared local fixture manifest is not durable source custody.

The complete source path also checks exact event/posting identity, correct account
direction, no duplicate IDs/keys, original-capture/refund authorization identity,
refund capacity, source chronology and saved sales/tax allocation. Saved subtotal,
discount, tax and total must agree using integer arithmetic. No rate, jurisdiction,
price, settlement or tax obligation is inferred from these checks. No provider
authorization or source-authenticity claim is made by knowing an identifier.

## State and absence

| State                     | Meaning                                                                                      | Balance / aggregate export                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| RECONCILED_SYNTHETIC_ONLY | Complete declared fixture manifest and current exact invoice/event/ledger checks agree.      | Existing balance plus exact invoice/sales/tax/capture/refund minor-unit totals. |
| INCOMPLETE                | Caller declares partial accessible source coverage. Full balance verification is withheld.   | null; no summary CSV rows.                                                      |
| UNKNOWN                   | Invoice or expected source records absent, coverage unknown, or unresolved outcome declared. | null; no zero, settled or paid inference.                                       |
| UNRECONCILED              | Complete supplied evidence conflicts, or actual IDs exceed the expected source manifest.     | null; retain source facts for review, no correction or replay.                  |

Malformed, duplicate, foreign, unsupported-provider/kind, invalid precision,
noncanonical dates, accessor-bearing objects, boxed/nonprimitive enum values and over-limit input fail before an
export is returned. Unknown/partial inputs still receive strict field/scope checks;
they never receive a complete balance claim. A missing expected source row stays
UNKNOWN instead of being interpreted as failed or zero execution. Full source
relationship reconciliation is only attempted for complete available manifests.
Equal amounts or equal net balances never substitute for exact identities.

## Deterministic representation and privacy

The packet allowlists only selected scope/source metadata, invoice/contract number
and IDs, saved financial totals, exact event/authorization/key/adjustment IDs and
ledger account/source IDs/timestamps/amounts. It excludes customer name/contact,
address, scope notes/terms, supplier costs, margins, payroll, private notes and all
unrecognized input fields. Input objects are never serialized wholesale. Existing
sources remain unchanged; safe primitives/arrays are copied before the first hash
await. The returned packet is recursively frozen.

All exported money is an explicit base10 **integer minor-unit string**, with
currency separate; aggregate calculation uses BigInt. This avoids CSV/binary-float
or downstream JSON-number precision loss. UUID source arrays and output records
sort lexically; object keys sort canonically. Same scoped source/order-independent
facts produce the same ID/JSON/CSV. A changed source/as-of/manifest produces changed
integrity. No random ID, current-time default or local-number formatting is used.

JSON contains fixed offline/no-authority labeling, coverage/state/reasons and
SHA-256 source/content fields. Returned integrity additionally hashes the exact
canonical JSON and CSV bytes. Source SHA binds the **safe allowlisted projection**
and manifest, not private full records, a digital signature or authenticated custody.
Content hash excludes the derived packet ID and integrity wrapper; ID is
`finance-export-<content hash>`. Tests independently recompute content/file hashes.

CSV uses fixed row types/columns, quoted cells, doubled embedded quotes and CRLF.
Potential formulas beginning with =, +, -, @ after whitespace receive an apostrophe
in CSV only; canonical identity text is unchanged. Unicode control, format,
line/paragraph separators and malformed surrogate text are rejected. Each row binds
scope/as-of/state/coverage/source/content hashes. Metadata, invoice, payment-event,
ledger and optional summary rows are different views of the same evidence; never
sum every row as new financial postings. This is an offline reference export, **not
an accounting-system import contract**, bank statement or receivable ledger.

## Focused verification and limits

`tests/program-finance-export.test.ts` builds actual existing ReleasePreview flows
for all three companies: published issued scope → exact synthetic decision/contract/
signature → invoice → authorization → capture → partial reversing refund → ledger.
It tests no source mutation or added effects, safe canonical tax/discount totals,
exact IDs/manifest/source/as-of, missing/unknown/partial/conflicting evidence,
malformed/duplicate/foreign input, integer precision, detached immutable snapshots,
canonical/hash determinism, formula/Unicode/accessor defenses and privacy exclusions.
Focused commands and final counts are supplied in the workstream handoff.

No UI changed, so no new browser run is required. PR3's six browser and88 focused
application cases remain retained evidence; this package tests its new projection
plus existing verifier/release behavior without rerunning unrelated native/recovery/
Netlify suites. Build/types, owned ESLint/Prettier and diff checks must pass. Normal
CI applies only after the separately reviewed code commit; no CI PASS is inferred.

## Integration and containment

Only the new finance projector, its focused tests and this document are owned here.
Existing verifier/types/SQL/UI and capabilities remain unchanged. There is no new
public API or enabled export button. Integration requires a separately reviewed
producer with current access and independently proven source coverage; synthetic
admission cannot be replaced by a frontend flag. Genuine invoice/mandate/token,
merchant/settlement/report/bank/accounting mapping, legal/tax and accountant approval
remain unresolved in `FINANCE_NMI_ACCEPTANCE.md`. No statement matching, payout,
financial correction, AR, billing enhancement or live connector is added.

Rollback removes an unwired local read projection only. Preserve conflicting and
UNKNOWN source evidence; never rewrite records, clear holds or replay transactions.
All13/customer14/4B, frozen P1/four, approvals, locked UIs,2A–2F, proposed billing,
Netlify, recovery, hosted/communications/financial/deploy/merge restrictions persist.

Independent integration review reproduced a nonprimitive enum bypass before commit.
Coverage/outcome/event/account admission now requires exact primitive strings, with
five regression cases proving no coercion, private serialization or caller freezing.
The prior object-valued coverage could incorrectly skip reconciliation; this defect
is fixed locally before any PR delivery. No existing verifier or writer is changed.
