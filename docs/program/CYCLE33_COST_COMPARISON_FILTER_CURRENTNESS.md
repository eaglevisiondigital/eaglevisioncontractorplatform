# Saved-cost comparison filter currentness

Source parent: `5d695378f6f8573f99628116611c71c755c60c06` (Main draft289).
This bounded package changes the existing saved-cost filter and adds one
regression file and this source note. No component, interface, engine, store,
financial calculation, writer or operational adapter is added.

## Demonstrated disclosure and narrow correction

`filterCostSavedRevisions` originally checked historical read access and current
source freshness before capturing caller-controlled filter descriptors. A valid
own-data filter proxy could revoke the actual synthetic owner during capture,
after both checks, and still receive retained canonical financial rows.
The unchanged parent's new failed-only test reproduces this for all three brands.
The original native access check denies after the same revocation.

Two calls to the existing guards now follow the original filtering work and
precede its private return: `assertSavedRevisionAccess` for the historical read
and `assertSavedRevisionCurrent` for the current read. Both leading checks remain
in their original order, so closed admission still denies before filter capture.
All other native source bytes remain unchanged.

This preserves the original distinction: an authorized historical snapshot may
contain stale mutable facts for explicit comparison, while the current snapshot
must still be fresh. A withdrawn earlier review cannot expose its history through
a separate current read. No comparison row, integer cost, invoice requirement,
selection generation, original attempt or UNKNOWN classification is rewritten.

## Actual local evidence

The new source-based cases use the original repositories and canonical engines
for Straight Edge, Cunningham and Roofing. The native revocation witness uses
`operations.revokeOwner`, not a mocked authorization result. Separate local
confirmation-withdrawal tests do not claim genuine Auth or session acceptance.
The original test/hook budgets remain30seconds, one worker, retry0.

| Execution                                         | Actual result             | Raw private report SHA256                                          |
| ------------------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| Unchanged parent, only three revocation witnesses | 0PASS / 3FAIL /24filtered | `8ae4b48a63bd6959d80ad993cb5f6be2164ddac3f533965f20a0627a62722a52` |
| Corrected complete new scope                      | 27PASS /0FAIL /0filtered  | `23cc74afe05c45d70218e198a9ea0fabe104f8a6c95c51336c0bd12fff6d6ba6` |

The corrected scope also checks withdrawn earlier/current review gates, exact
original row references, literal search, real saved material/review identities,
integer amounts and quantities, and legitimate mutable-stale baseline comparison.
Later canonical forecast changes reject a stale current read before filter
inspection. Copied comparison handles and cross-tenant snapshots remain denied.

Actual submitted/approved but unposted time retains UNKNOWN cost coverage and
absent locked-labor evidence. Filtering does not adopt the retained saved
selection, post labor, issue an invoice, create debt, settle or pay. Original
canonical records remain unchanged during filtering, and monitored native
writers, release commands and network calls are unused. No old successful cohort
was rerun; local author evidence is not current-head hosted or responsive-browser
acceptance. Main's exact build-only successor admission and independent combined
review remain separate requirements; original historical pins are unchanged here.

## Preserved boundaries

No completion, customer acceptance, invoice issuance, financial execution or
restoration is inferred. Original one-use custody, UNKNOWN exact read-only/no
replay, source identities, approved designs, protected migrations, P1/customer14/
4B, MFA/Auth, NMI/settlement, Netlify and production restrictions remain intact.

D1's eleven operational roles remain UNASSIGNED, D2/D3 require owner decisions,
and A01–A12 remain NOT_RUN. The November4 owner-witnessed main synthetic loss
scenario remains scoped to that case; duplicate recovery remains UNKNOWN/
UNVERIFIED. No private recovery folder or consumed attempt is touched.

No merge, deployment, hosted mutation, credential access, restoration, payment,
communication or dispatch is authorized.
**Release1.0 remains NOT READY / NOT AUTHORIZED.**
