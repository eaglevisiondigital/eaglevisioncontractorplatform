# Workstream 4B · durable customer requests, receipts and staff queue

October 31, 2026 · base `41af9901e43135788b6bf971fc7bdf9624c2dec4`.
**Implemented and tested locally. Hosted installation/access NO-GO.
Release 1.0 NOT READY / NOT AUTHORIZED.**

## Implemented boundary

`server/customer/requests.proposed.sql` is a separate forward-only **local proposal**
after unchanged customer fourteen. It extends the existing private
`customer_review_decisions` business ledger; it does not add another decision,
customer, property, estimate or financial ledger. Approve/decline retain v1 wire
compatibility and original records. The third `request_changes_review` choice needs
`review-only-v2` and a trimmed, nonempty explanation of at most 2,000 Unicode code
points. UTF-8 is required; there is no Unicode rewriting. Notes render as text and
confer no authority. The SQL parser and application parser strictly allowlist fields.
Server-canonical UUIDs, source/scope and accepted note participate in body identity.

Three private metadata tables hold registered principals, immutable command intents
and append-only outcome references to the existing decision. Compound tenant FKs,
indexed access, forced/default-deny RLS and runtime revokes apply. Outcomes reference
that exact command's decision. No roles, principals, runtime grants or capability
activation are installed. The forward hash and all fourteen dependency hashes are in
`CUSTOMER_REQUESTS_FORWARD_REVIEW.json`; `npm run customer:requests:check` detects drift.
Original migration compiler, thirteen historical migrations and pending fourteen are
unchanged. Historical comments/documents describe their checkpoint, not new approval.

## Committed admission and one-shot mutation

The injected disposable gateway opens a consumer transaction, obtains its actual
backend PID/start/full transaction ID, then commits an exact claim through a separate
restricted issuer connection **before** calling the protected writer. SQL verifies
the registered issuer/executor LOGINs, live backend/database/transaction, exact
customer/session/mapping, property, issued source, publication and canonical body.
The logical target is unique across replacement request IDs, principals and new
publications. Nonwaiting admission locks, a tenant metadata bound, short expiry,
1.5-second resource lock timeout and gateway statement deadlines bound work.

Before body comparison or protected mutation, the consumer irreversibly spends the
private per-command sequence. PostgreSQL sequence consumption survives transaction
and savepoint rollback. The claim itself already survived in the issuer transaction;
a new backend/transaction cannot resume it. Runtime roles cannot reset the sequence,
change metadata or use raw decision CRUD. The decision and outcome reference commit
atomically. Exact source/current authorization/expiry are rechecked after lock waits
and before completion. No automatic continuation, replacement ID or retry exists.

Missing admission/result evidence is **UNKNOWN**, including interruption before the
claim was committed. A retained body can locate the server reference after lost claim
acknowledgment; a retained exact reference can read the receipt after restart. Neither
read resumes mutation. A confirmed receipt requires the exact committed row, not a
browser hash/flag or inferred failure. The prepared adapter and gateway also retain
pre-await holds for their lifetime; browser memory is not durable custody. Native
committed SQL state was tested across client process loss, not physical host/DB/disk
power loss. A genuinely connected custody owner has not been provisioned.

## Customer and staff readers

Three new RPC contracts are **read-only**: exact receipt, exact body/status and bounded
staff change-request queue. The existing pinned customer SDK, verified identity/session
ports and prepared reconciliation contracts are reused. Default-off command submission
accepts only an explicitly injected disposable-local port with customer confirmation;
no private claim/writer enters the SDK network allowlist. No App route is mounted.

A current exact customer mapping, genuine session checks and CRM ownership are needed
for receipt reads. Publication expiry can leave an own historical receipt visible;
it does not reopen the expired estimate. Revoked mapping/session/user or foreign
source denies access. Pre-extension v1 rows remain byte-for-byte business evidence;
exact own historical reads label them `legacy-v1`. A derived read fingerprint is not a
retrospective committed claim. New receipts are `claimed-v2`; absent results remain
`unconfirmed`/UNKNOWN. No old row is backfilled into custody metadata.

The staff reader independently checks current active tenant membership, estimating
permission, required MFA and session. It returns at most 50 exact persisted requests,
safe customer/property/project names, original version identity, safe note and receipt.
`limited:true` prevents a completeness claim. Costs, margins, supplier/payroll data,
private staff/repair notes and other customers' records are excluded by projection.
The read-only `PersistedCustomerRequests` panel uses existing Estimates styles, stays
default off/unmounted, and has no draft/revision/issue action. The approved explanation
form has an optional local-database evidence mode; its existing default is preserved.

## Actual database and browser evidence

`npm run test:customer-requests-native` creates a disposable native PostgreSQL 17 UTF-8
cluster with TCP disabled, loads unchanged fourteen dependencies plus the proposal,
and cleans it up. CI uses its separately disposable PostgreSQL 17 service. Synthetic
Auth/session rows and narrowly granted fixture LOGINs are explicitly test-only.
The native browser harness compiles the actual React form and staff reader, obtains
an actual safe issued projection, submits through the actual two-connection gateway,
commits the existing ledger row and reads that row through the eligible staff SQL
reader. It does not inject a 3A/3E request or mount a connected portal.

52 native cases cover all three sample companies, original issued/v1 immutability,
wrong customer/property/version/hash, approve/decline compatibility, blank/over-limit/
2,000-emoji/HTML notes, simultaneous competing admission, alternate IDs/publications,
savepoint rollback, direct SQL/privileges, membership/session/mapping/user revocation
including observed lock waits, expired-publication historical receipts, staff roles/
MFA, and no financial/job/communication effects. Four actual child-process SIGKILL
phases cover before claim, after committed claim, after uncommitted mutation and after
commit before acknowledgment. Fresh-process exact reads are UNKNOWN unless a result
committed; no replay is performed.

The actual database/browser flow runs three approved brands × desktop 1440, tablet
820 and mobile 390. Both the form and staff result pass axe and overflow checks.
Eighteen real screenshots are retained locally under ignored
`artifacts/property/customer-requests-native-*.png` and uploaded by native CI. These
are isolated test compositions, not a newly activated product URL. Run the command
above to reproduce; existing `/preview` and `/preview/property-portal` remain intact.
Focused application/default-route regression outcomes are recorded in validation.

## Operational trust and remaining gates

SECURITY DEFINER functions currently inherit the trusted installing owner. Disposable
fixture ownership, synthetic sessions and role separation prove the tested mechanism;
they do **not** prove genuine hosted Auth, a deprivileged operational TCB or trusted
principal provisioning. The principal broker must independently verify the genuine
customer JWT/session and expiry, register a bounded exact target and restricted issuer/
executor, protect its connections, and retain exact request identity. No operational
broker, credential loader, principal registrar, HTTP mutator or hosted installer is
included. No runtime grants or activation is authorized by this proposal.

The next smallest acceptance step, after the existing gates, is one internally operated
authenticated issued-version request → exact receipt → eligible staff read, with a
separately reviewed broker/ownership/grant/target/mapping package. Sequence remains:
independent recovery prerequisites → original approved frozen P1 on thirteen history →
separate customer14 review/approval → separate 4B hash/ownership approval → exact later
grants, mappings, bounded publication and internal authenticated acceptance approval.
Do not request original P1 approval again or advance a revision/packet/issuance slice.

No hosted state was refreshed, credentials retrieved, schema installed, customer
access opened or messages sent. No contracts, jobs, invoices, charges, debt, repair
completion, publication, Netlify operation, deployment or merge occurred. Frozen P1/
four artifacts, Netlify archive/executor/recovery evidence, approved UIs/artwork,
2A–2F, six proposed billing enhancements and all existing restrictions remain.
