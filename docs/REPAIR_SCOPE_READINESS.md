# Repair scope readiness & contractor review

October29,2026 · base60603df8ae5971923481fb6233c843b8a5fc52c8.
LOCAL SYNTHETIC ONLY. Release1.0 remains **NOT READY / NOT AUTHORIZED**.

## Demonstrate the working review

Open http://127.0.0.1:4173/preview → choose a sample company → **Property
operations** → **Maintenance & follow-up**. If needed, run `npm run build`,
then `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`.

1. Expand **Development-only maintenance examples & states**, then **Prepare
   synthetic maintenance examples**. Choose **Review finding**, **Prepare repair
   estimate**, inspect the exact source and check the explicit confirmation before
   **Confirm & prepare repair draft**. Existing prepared drafts reopen with **Open
   exact repair draft**; do not prepare a second estimate.
2. The existing estimate editor now includes **Repair scope readiness**, initially
   0/6. Expand **Observed condition and exact source** to distinguish the immutable
   published observation/recommendation from editable proposed work. Original report
   and maintenance return buttons retain exact property/report/version/finding.
3. For a disposable example, change **Scope item 1** to “Remove and replace measured
   joint seal within stated boundaries.” Set **Scope description** to “Prepare the
   exterior surface and replace eight feet of joint seal; concealed work excluded.”
   Set quantity8, unit linear feet, internal unit cost10.00 and selling unit price20.00.
   Add synthetic project terms excluding concealed damage pending separate review.
   Choose **Synthetic zero-tax review · 0% · reviewed**. These are invented test
   values, not supplier information, measured property facts or tax advice.
4. Unsaved edits hide confirmation controls. **Save estimate draft** first. Review
   each of the six groups: source/scope, measurements, materials/labor,
   pricing/profitability, tax and terms. Packaged service/material/labor assumptions,
   overrides, allowances and questionable margin remain explicit staff judgments.
5. In quantities, select **Measured by staff** and enter a synthetic supporting
   reference, such as “Synthetic tape record M-008: staff measured eight feet.”
   Every saved line, including options, requires its exact saved quantity/unit and
   a reference. A number alone or the generated one-unit placeholder cannot pass.
   This exercise records a staff statement; it does not verify physical measurement.
6. Enter a supporting note in each section, check its individual attestation and
   choose its **Confirm** action. Alternatively record an outstanding question:
   **Record outstanding scope review**, for example. Outstanding decisions never
   count as confirmations and can supersede an earlier confirmation.
7. At6/6, the status says **Internal review complete · issuance remains blocked**.
   The maintenance queue shows6/6 with the current saved revision. **Review history**
   retains the reviewer, decision/note, exact version/revision, measurements, tax
   version and calculation totals reviewed. No issue, publish, work or customer
   financial command is enabled.
8. Change selling price to21.00, then save. All six prior confirmations become stale
   and count0/6 for the new revision. Historical receipts remain. Reopen the same
   draft from maintenance to confirm the current result. Repeat in each of the three
   company contexts; their records stay separate. Full reload discards session data.

## Model and validation

The existing Phase3Repository holds a private session-only review history per exact
maintenance-generated estimate. PropertyRepository supplies immutable published
source evidence through the existing repair binding; no mutable visit or note parsing
establishes provenance. UNCERTAIN preparation attempts cannot enter readiness until
the existing explicit exact-target reconciliation establishes a prepared draft.

Current same-company reviewer membership, retained source authorization and exact
customer/property/estimate/current draft/version/source-line identity precede reads
and each synchronous review write. Connected mode rejects before an adapter path.
The UI uses the existing synthetic owner identity; it creates no Auth session and
does not certify hosted permissions or genuine operational staff authentication.

Each request binds a UUID, exact saved lock revision, review-history sequence,
section and exact comparison snapshot. The snapshot includes the saved bundle,
structured origin, immutable source, current selected tax policy, only referenced
company catalog items and UTC review day. It is a comparison token, not a signature.
Any change invalidates all six groups conservatively; no cached result is carried
forward. Unrelated catalog items do not invalidate review. Date changes also require
review again so expired drafts cannot retain yesterday's readiness.

The existing integer estimating engine calculates costs, selling totals, markup,
discounts, estimated profit and margin. Missing/zero unit costs or selling prices,
stale saved calculations, absent/unreviewed/inactive tax policy, changed saved tax
snapshot, expired/missing terms and unresolved generated scope block confirmation.
An existing reviewed0% policy still requires explicit property/work applicability
review; zero provisional tax never establishes applicability. Referenced inactive or
missing catalog items block resources; differing catalog values require explicit
override/substitution judgment. Tax policy snapshots are cloned when creating/saving
synthetic estimates, preventing later policy edits from mutating saved evidence.

Section confirmations require a supporting note and consistent explicit attestation.
Measurement confirmation additionally requires one structured measured reference per
saved line, exact line/quantity/unit identity and no duplicates. Stale revisions,
changed current evidence or review sequences reject. An identical request replay
returns the original receipt without append; a reused key with changed evidence
rejects. Already-current confirmations cannot append another confirmation. Historical
evidence is retained and returned as clones; recording never changes the source,
estimate payload, issued history, job baseline or customer projection.

The queue evaluates current readiness when read. Archived/unavailable/uncertain
drafts cannot advertise a cached count. Dirty editor payloads cannot be confirmed.
Loading, unavailable/reload, outstanding, stale and complete states use accessible
labels and live status. Scoped CSS reuses contractor controls without altering the
approved premium customer portal, shared global styles or approved artwork.

## Evidence, restrictions and remaining gates

See REPAIR_SCOPE_READINESS_VALIDATION.json for166 focused application passes and48
unique responsive browser passes; reruns are not additive. New cases cover all three
companies, complete/incomplete reviews, twelve saved-state changes, five policy
changes, catalog overrides, contradictory measurements, duplicates/CAS, membership
revocation, uncertain preparation, issued-baseline preservation and customer exclusion.
Browser checks include explicit keyboard confirmation, question/history navigation,
all three viewports, zero Axe violations/overflow in exercised states, loopback-only
requests and unchanged locked-portal presentation. Screenshots remain ignored under
artifacts/property/readiness-{desktop,tablet,mobile}-{company}.png.

Testing found and corrected a synthetic tax-policy snapshot alias and insufficient
contrast in the new pricing labels; final focused reruns pass. Unchanged native
SQL/recovery/Mac setup/network baselines were not repeated locally. GitHub's existing
workflows run automatically on push; current-commit results are reported separately.

No schema/migration, durable operational review store or estimating engine was added.
Review remains session-only and is not operational persistence, authenticated staff
acceptance, tax/legal verification or independent measurement evidence. Durable review,
publication/issuance and repair authority need separate implementation/security review
and applicable exact authorization. All13 historical SQL, pending customer migration,
frozen P1 operation/four artifacts and owner approvals are preserved. Connected
customer access, Auth/grants/mappings/leases, providers/media/financial execution,
Netlify/production/deployment/merge remain closed. Two-Mac authenticated pairing and
independent recovery remain unfinished, separate acceptance gates.

## Next: review the contractor back office

Use CONTRACTOR_BACK_OFFICE_REVIEW.md for the requested visual/functional walkthrough
before proposing further feature expansion. This review does not reopen the approved
customer portal design or authorize hosted access.
