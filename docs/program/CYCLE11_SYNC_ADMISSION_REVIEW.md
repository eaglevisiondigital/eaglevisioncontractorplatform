# Cycle 11 · controlled external-reference admission review

`SyncAdmissionReview({sources, enabled = false, onSelectJob?})` is a working local,
read-only source comparison. It extends the seven existing C10 advanced review modes
(offline, voice, receptionist, Storm/Network, accounting, procurement and trade) without
adding another parser, ledger, adapter, integration store or network transport.
Main owns isolated mounting and combined browser/accessibility acceptance.

## Current source → explicit proposal → difference review

`readSyncAdmissionSource(sources, handoffInput, gate)` delegates to the existing
`readAdvancedHandoffRequirements`. `syncSourceReference(requirements)` projects only
eight exact fields: company, customer, property, job, estimate, issued version, canonical
source SHA-256 and saved lock revision. Original current sources are checked; an old
hash supplied by a person is never accepted as proof that source evidence is current.

The operator explicitly enters an external-reference label and proposed fields, or
chooses **Use current source references as proposal**. This is a controlled synthetic
human proposal, not a parsed external document, supplier identity, recipient or provider
reference. Labels accept bounded letters, digits and `._:-`; email addresses, URLs,
spaces and executable/coercive structures are rejected.

`reviewSyncAdmission(requirements, {external_reference, source})` returns immutable
per-field MATCH, MISSING or CONFLICT rows. Missing fields stay explicitly missing.
Conflicts and missing references are quarantined, never repaired through text similarity,
latest-version selection or overwriting canonical records. Concurrent exact proposals
cannot bind the same mode/label to different jobs in one repository; a second target is
`QUARANTINED_MULTI_TARGET_REFERENCE`. The ephemeral claim prevents ambiguous review
identity only. It is not durable external custody, a synchronization record, an atomic
network lease or evidence of an actual provider ID.

Even `EXACT_REFERENCE_REVIEW_ONLY` grants no import, sync, save, dispatch, send, call,
order, export, contract, payment or hosted authority. Atomic network admission and
persistence are explicitly NOT IMPLEMENTED. `selectSyncAdmissionJob(review)` separately
rechecks the original canonical source before local navigation; external claims do not
choose a different job.

## Existing-engine preparation, separate confirmation

Optional **Prepare existing review handoff** requires the exact retained matching
comparison, its SHA-256 and a separate current staff confirmation. It delegates to the
existing `prepareAdvancedHandoff`; original C10/canonical one-use holds remain intact.
The adapter records its same-repository/job/mode hold before awaiting. Concurrent
preparation, lost acknowledgments, fresh labels and replacement source containers cannot
reopen a prior or UNKNOWN preparation. There is no automatic preparation after a match.

The immutable wrapper binds the comparison and existing safe handoff, preserving their
original hashes and exact source identity. `inspectSyncReviewHandoff(packet)` reconciles
only the retained original canonical handoff. Ambiguous results stay terminal UNKNOWN;
no replay, replacement or new ID is supplied. Existing gaps remain visible: catalog
relationships cannot be invented, supplier bids are not recorded purchase evidence,
invoice/contract mappings remain absent, current consent/recipient is not inferred,
and availability, physical completion, licensing and incident dates stay unverified.

Original inputs, current eligible synthetic staff, full source/model/root identity,
canonical issued version/lock revision and explicit confirmation are rechecked after
awaits and at render. The strict projections exclude internal costs, supplier costs,
workforce rates, private notes, payroll and margins. No full EstimateInput/Version is
serialized. Hashes and session memory do not establish authentication or durable custody.

## Local usability and focused evidence

The scoped premium component preserves approved tokens and branding. It provides named
job/mode controls, source requirements/gaps, editable proposed references, explicit
source copying, per-field comparison labels, quarantine status, optional separate
confirmation, exact-job navigation and exact read-only inspection. Desktop comparison
cards stack on mobile; inputs/actions have 44px touch targets, keyboard focus and
status/alert semantics. DEV/HTTP-loopback admission remains default OFF before source
getters. There is no live URL, customer response, network request or background task.

41 focused cases PASS across all three brands and seven modes: original source and
safe existing-engine handoffs; each identity/hash/revision conflict; explicit missing
values; concurrent multi-target references; duplicate staff confirmation; original C10
hold preservation; lost acknowledgment and replacement-label/container no-replay;
foreign tenant/customer/property/job/version; staff revocation; stale source; copied
objects; final-await source/input/gate/confirmation drift; immutable UNKNOWN evidence;
strict accessor/coercion/label rejection; privacy and no business-writer effects.
Strict types, owned lint/Prettier, build, generated types, features and retained C6–C10
integrity pass. Main supplies combined real browser, responsive and accessibility proof.

All protected migrations, pending customer14/4B, frozen P1/four artifacts, original
Netlify archive/executor, owner approvals, approved design/artwork, independent recovery,
MFA/Auth/NMI/provider/financial/communication and production/deployment/merge gates remain.
Release 1.0 is NOT READY / NOT AUTHORIZED.
