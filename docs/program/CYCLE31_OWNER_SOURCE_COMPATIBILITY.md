# Cycle 31 · exact owner source compatibility

Parent: `353923ce2c6677ae3d5026ac46cf214b2a549aa3`.
Branch: `codex/cycle31-owner-source-compatibility`.
Author: `/root/cycle25_finance_intelligence_resume`.

## Demonstrated failure and bounded correction

The unchanged parent fails the actual `check-cycle21.mjs --require-independent`
CLI at `Exact published Cycle21 bytes/blob required:
src/components/workflows/RecordedOwnerActions.tsx`. The Cycle 22 CLI invokes that
same failing checker before its own validation. These local failures reproduce the
reported hosted Cycle 21/22 source-check failures; they are separate from browser
or application test failures.

The component has one already reviewed Cycle 30 correction at
`9f85556e28875a53976b55567f3a14e942ba3995`, sole parent
`b0faaa447e8e18cd78a00e5cfbfd6dc67eff3fd9`. That correction removes a duplicate
leading render guard while preserving the original guarded reader and every
current-source, navigation and UNKNOWN check. This package does not change it.
The original Cycle 21 author is
`161f1c59d864d60aa0f45820eb6417864519baf2`; its component bytes equal the exact
Cycle 30 parent component bytes.

The Cycle 21 checker now validates the original manifest SHA-256 and Git blob
against the original published Git bytes first. Unchanged original current bytes
remain acceptable historical source. Only that exact original author and component
path can use the existing `admitCycle25Source` direct Cycle 30 route. The route
still verifies its fixed sole parent, complete three-file author delta, regular
file modes and exact current endpoint. The checker additionally requires the exact
`9f85556e…` source commit, `owner-render` module, matching path and
`SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE` result.

After that first correction, actual CLI execution exposed a second rejection at
the Cycle 22 retained-author loop. Cycle 23 has the same independent retained-source
comparison; Cycle 24 preservation reaches both through its existing validators.
Those two loops now recheck only the same component from the exact retained Cycle
21 manifest and original author through the shared Cycle 21 source validator.
Their prior validator, exact parent-manifest equality and every unrelated source
hash check remain mandatory. Each loop reads and validates its own current bytes;
a source change after the earlier validator cannot reuse its admission.

Original manifests, author IDs, source hashes, Git blobs, path inventories, source
counts, independent-review pins and legacy error strings remain unchanged. The
shared lineage helper is unchanged. There is no application, engine, component,
stylesheet, schema, storage, business-state or operational restoration change.

## Verification

The initial twelve-case regression on unchanged source records nine passes and
three failures at the missing compatibility admission. The first focused corrected
run passes 68 cases: twelve new, 46 original Cycle 21 validation and ten retained
Cycle 30 independent source-review cases. The follow-on retained-chain regression
records 18 passes and exactly two failures for actual Cycle 22/23 current-source
admission before their narrow corrections.

After the retained-loop corrections, the five focused suites pass 181 cases with
zero skips: 46 original Cycle 21, 58 original Cycle 22, 47 original Cycle 23, ten
retained Cycle 30 independent source-review and twenty new compatibility cases.
Two additional regressions change current component bytes after the prior
validator's admission; both retained loops reject that later read. The final new
suite passes 22/22, zero skips. Across these runs there are 183 distinct passing
cases; the overlapping twenty new cases are not counted twice.

The actual final Cycle 21, 22 and 23 CLIs each pass with
`--require-independent`; the Cycle 24 CLI passes its existing mandatory independent
source and preservation validation. Scoped lint and formatting pass. Private raw
reports are retained under `.staging/program-cycle31/evidence/intelligence/`.
These are local source-check results; they do not relabel historical hosted failures
or establish new exact-head GitHub CI success. Successful prior CI is not restarted
by this package. Main retains combined strict-type and exact-head CI verification.

The finance source audit identifies no new demonstrated defect or distinct
uncovered requirement in exact expense/review/adjustment links, unposted and locked
labor lineage, copied canonical profitability, independent invoice requirements or
one-use navigation. Seven inspected native and retained test files match the parent.
No artificial Finance runtime package or repeated successful baseline test run is
added. Missing durable receipts, genuine authenticated custody and settlement
evidence remain unverified.

All protected migrations, customer14/4B, frozen P1/four artifacts, approved visual
scopes, branding, Netlify, recovery, MFA/Auth, NMI, financial and production gates
remain unchanged. Physical recovery remains NOT RUN. No hosted mutation, payment,
communication, dispatch, operational restore, merge or deployment is authorized.
Release 1.0 remains NOT READY / NOT AUTHORIZED.
