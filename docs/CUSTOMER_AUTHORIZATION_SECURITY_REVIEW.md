# Customer authorization security review and workflow preparation

Latest successor: [CUSTOMER_AUTHORIZATION_RELEASE_REVIEW.md](CUSTOMER_AUTHORIZATION_RELEASE_REVIEW.md).
The proposal-only state below is historical; the successor records the formal
local migration, additional corrections and default-disabled SDK preparation.

October 18, 2026 · base commit f18da4e · existing feature branch/draft PR #1.
**Local proposals and disposable evidence only. Hosted execution NO-GO.**

## Independent adversarial findings

The reviewed base proposal SHA-256 was
`da8d8bd887c071dd27186e425edd877da9e980db2c772f4925d3f538dd1e34f5`.
Before correcting it, two new negative tests were run against that exact SQL on
native PostgreSQL 17. Both failed because the protected operation succeeded:

| Finding                                                | Reproduction                                                                                                                                                                            | Correction                                                                                                                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CUST-1: blocked Auth identities retained read access   | A confirmed identity with a current session, valid estimate lease and future `banned_until` still received issued scope.                                                                | Current Auth user checks reject bans, soft deletion and anonymous identities as well as missing confirmation; repeated after waits. The local Auth fixture now models these existing Supabase fields. |
| CUST-2: role separation changed while discovery waited | Report-only discovery passed its initial customer guard, waited on the report lease, then returned company/property context after another transaction added an active staff membership. | Every returned discovery context now repeats the full customer guard at the final checkpoint. Native tests also cover concurrent platform-admin activation.                                           |

These were flaws in an **uninstalled proposal**, not evidence of a hosted exploit.
Private red/green logs retain the original failed assertions and rejected SQL.
No hosted request, account ban, role grant, customer session or cleanup probe occurred.

The canonical issued-scope projection is now shared by access reads and publishing
preparation. It rechecks exact customer/property/version and optional report/finding/
included-line provenance against immutable sources. Discovery rejects more than100
versions per context, matching the existing client limit; contexts remain capped20.
Production pagination, timeouts, request budgets and abuse controls remain review gates.

## Reviewed boundaries

- Both proposed authorization/evidence tables are private, RLS enabled, with zero
  client policies or table privileges. All proposed entry points have client
  execution revoked, including `service_role`; no identity or grant is provisioned.
- Privileged implementation functions have empty fixed search paths and qualified
  names. Public wrappers are SECURITY INVOKER. No dynamic SQL, client-provided UID
  as customer authority, generic CRUD, user_metadata or privileged HTTP client exists.
- Current caller `session_id`, UID, JWT expiry and Auth session row are checked with
  wall-clock time after waits. Customer mappings, organization/module/feature and
  property bindings remain current; staff/platform authority never becomes customer
  authority. Row locks serialize revocation against in-flight authorized operations;
  a revocation committed first is denied, while a read holding the authority lock
  can linearize before a waiting revocation. This is not retroactive data erasure.
- Report leases do not authorize estimates or financial operations. Estimate
  publication does not authorize report history. Published repair references may
  identify one reviewed report/finding/issued line; private findings cannot publish.
- Allowlisted scope contains customer-facing descriptions, quantities, units and
  selling amounts, notes and terms. It never copies raw estimate cost/calculation,
  supplier, payroll, margin, deductions or internal findings into customer evidence.
  Staff must still review free-text customer notes for content before publication.
- Composite tenant FKs, indexed access paths, append-only audits and immutable
  snapshots preserve the existing CRM/property/job/estimate sources. No duplicate
  business, expense, ledger or customer identity database is introduced.
- Database owners can alter triggers and impersonate claims; disposable owner-mode
  tests are defense against accidental malformed writes, not tamper-proof storage.
  Client SQL claims in these tests are not genuine Supabase authentication evidence.

## Checked staff publication proposal

`server/customer/workflow.proposed.sql` follows the corrected base proposal only
in disposable databases. It adds explicit publication evidence to the existing
proposed access table and one private review-decision table. Neither file is a
formal migration or a pending approved hosted bundle.

Five new revoked public wrappers prepare these narrow operations:

1. `customer_publication_preview(org,p)`: current confirmed owner/admin AAL2 only;
   exact existing active customer mapping, property and issued version. Optional
   repair selections must resolve to a customer-visible immutable report finding
   and included issued line. Returns the allowlisted scope, canonical SHA-256 and
   selected safe repair recommendation for explicit staff review. No lease is made.
2. `customer_publish_estimate(org,p)`: same checked actor, exact preview digest,
   explicit review acknowledgment, request UUID and absolute expiry no more than15
   minutes away. Selects **one version**; never publishes all issued versions. Source
   locks, source digest and current authorization are rechecked. Stores publisher,
   request, canonical safe snapshot and repair-link acknowledgment on the revoke-only
   access evidence. A matching replay returns the same publication; changed payload,
   expired/revoked publication or changed sources fail. Unique constraints stop races.
3. `customer_revoke_publication(org,publication)`: current company owner/admin AAL2,
   exact tenant row, one-way revocation. Repeating an already completed revocation
   appends no second change event. It cannot extend, edit or delete evidence.
4. `customer_decision_context(org,customer,property,version)`: current customer only,
   returns the exact publication/digest, safe issued review and that caller's existing
   review receipt. Session identifiers, internal costs and other customers are absent.
5. `customer_record_decision(org,publication,digest,choice,ack,request)`: described below.

Staff may review and explicitly link a published recommendation to an issued line;
that acknowledgment is evidence of staff selection, not machine proof that two
natural-language descriptions are economically or legally equivalent. A reviewed
contractor UI composition is still needed before actual connected use. Target
customer account/mapping provisioning is deliberately absent from these commands.
The entire proposal installs empty: no mappings, leases, features or permissions.

## Customer review decision persistence proposal

Choices `approve_review` and `decline_review` are **nonfinancial review preferences**.
They cannot be consumed as legal signature, accepted contract scope, approved job
change, invoice authorization, customer debt, receivable or payment consent. Existing
financial modules and genuine customer financial authorization remain disabled.

The caller must have a current exact publication and mapping, a still-valid issued
estimate, its presented canonical digest and acknowledgment `review-only-v1`.
There is no caller-controlled customer UID, timestamp, amount or scope snapshot in
the command. The database records those from current authority/immutable sources,
including the Auth session identifier (never tokens) in private evidence.

A row lock serializes one publication; a tenant/customer/property/user/version
unique key prevents a second choice across renewed publications. A separate
caller/request unique key prevents cross-version idempotency reuse. Exact duplicate
requests return the original receipt without another audit event; changed choices,
requests or publications conflict. Evidence cannot be updated or deleted, even by
ordinary maintenance DML. Later withdrawal/correction semantics need a separate
reviewed append-only design; this package does not erase or silently supersede a
recorded preference. Revocation/expiry prevents subsequent reads and writes, including
replays; it preserves already-recorded evidence. A renewed lease may view the same
receipt but cannot make another decision for that issued version.

The unwired `PreparedCustomerDecision` client contract first reuses the existing
caller-bound discovery/read boundary. It rejects stale/extra/unsafe context fields,
requires explicit acknowledgment and permits one in-flight request. Lost, malformed
or Auth-switched responses become UNKNOWN; no automatic write retry occurs. A later
read may reconcile the exact request/choice/digest receipt. Missing evidence remains
UNKNOWN and cannot be treated as failure or successful approval. The in-memory guard
is not durable browser custody; server uniqueness survives reloads. Production
transport timeouts, interrupted-browser recovery, secure SDK/session custody, CSRF
and abuse controls still need independent review. No SDK or connected route is wired.

## Tests, integrity and execution limits

See CUSTOMER_AUTHORIZATION_LOCAL_VALIDATION.json for final exact counts and hashes.
Tests cover all three synthetic companies, cross-tenant/foreign selectors, owner MFA,
field/estimator/customer denial, staff publication acknowledgment/digest conflicts,
private findings, lease revocation, expiry, duplicate requests, immutable evidence,
privileged malformed INSERT/UPDATE/DELETE, no unauthorized financial changes and
UNKNOWN/late-response recovery. Native tests use actual PostgreSQL lock waits for
role promotion, expired JWT/session/publication authority and opposing decisions.
PGlite skips actual concurrency; native PostgreSQL must cover those cases.

All13 historical SQL files, README, approved logo, frozen P1 operation/four artifacts,
recovery implementation and Netlify package remain unchanged. No fresh hosted713-row,
22-identity/four-factor or advisor check is claimed. Existing hosted property tracker:
**0 PASS /0 FAIL /24 BLOCKED /48 NOT RUN**; nine P2 cases remain BLOCKED. No hosted
write, sign-in, MFA, grant, mapping/lease/feature, cleanup probe, provider/Netlify action,
financial execution, customer message, payroll, deployment or merge occurred.

## Recommendation and next boundary

**GO for further local review/preparation; NO-GO for hosted application or activation.**
Have a further independent reviewer assess the exact corrected two-proposal unit,
publication authority, customer decision semantics and intended future grants. Only
then prepare a formal forward migration and target-specific read-only preflight;
any hosted migration, permissions, customer session or acceptance-fixture operation
requires its own exact authorization. No hosted approval is requested by this report.
Existing unchanged P1 approval persists; do not request duplicate fixture approval.
Independent recovery/P1 evidence and a separately approved P2 package remain gates.
A separate clean production database and full release validation remain mandatory.

Official guidance checked: [current sessions and post-sign-out session validation](https://supabase.com/docs/guides/auth/sessions),
[function security and execution privileges](https://supabase.com/docs/guides/database/functions),
[sign-out scope and JWT limits](https://supabase.com/docs/guides/auth/signout),
[Supabase changelog](https://supabase.com/changelog). The Markdown changelog endpoint
was unsupported; the official HTML index was read. No Supabase project was accessed.

**Release1.0 remains NOT READY / NOT AUTHORIZED. PR#1 stays draft/unmerged.**

## Exact local proposal unit and final verification

- Corrected read proposal: `60c2336c7a21919f6dece4c7ec52a6640136f805e62d7b0adb2b81f5690a24b1`.
- Separate publication/decision proposal: `3511804845e5d08d97e7de1da49318f047f7e4cf51b3dc240df3b6815ab7ae4c`.
- Combined proposal unit: `6f2e641f59ab61fa5e14fb0f58a0d4e60bc0e55d7c1a5bdebdf4b8f2f7466f1c`.

Combined hash is SHA256 of the corrected schema bytes immediately followed by the
workflow bytes,in that order. This is not a migration bundle or execution approval.

Final local evidence: **940 application/PGlite PASS,59 native-only skips;386 native
PostgreSQL17 PASS/zero skips;77 Python recovery PASS;75 responsive browser PASS**.
Counts overlap. Lint,strict/generated types,build,format and historical/frozen/proposal
integrity pass. GitHub CI is verified separately against the exact pushed commit.
The default Python lacked the required crypto library;the final check used the
existing isolated recovery runtime. Recovery source and second-device status did
not change. No hosted/security-advisor acceptance is inferred.
