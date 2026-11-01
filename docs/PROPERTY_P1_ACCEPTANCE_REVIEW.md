# P1 connected property acceptance: final preparation

Latest implementation checkpoint: [P1 executor readiness](PROPERTY_P1_EXECUTOR_READINESS.md).
The executor and independent cleanup are now locally implemented/rehearsed; the older
missing-executor/preparation status below is historical. Frozen scope and existing
owner approval are unchanged. No hosted activation or Auth sign-in occurred;
0 PASS/0 FAIL/24 BLOCKED/48 NOT RUN. Fresh genuine MFA and action-time preflight remain
required; P2/media/providers and Netlify stay separate.

Current execution checkpoint: owner authorization for the frozen P1 operation exists,
but mandatory preflight STOPPED before any hosted write or sign-in. See
[PROPERTY_P1_EXECUTION.md](PROPERTY_P1_EXECUTION.md). The connected executor and
independent cleanup channel are not operationally verified. Case totals remain
0 PASS /0 FAIL /24 BLOCKED /48 NOT RUN. Earlier preparation-only statements below
are historical; neither the frozen package nor scope has changed.

**PREPARED / NOT AUTHORIZED.** October 17, 2026, America/Chicago. Based on `b63a9ef`.
No hosted fixture, feature, mapping, lease, membership, session or permission was created.
All 13 installed migrations remain unchanged. Release 1.0 stays closed and PR #1 stays draft.

## Exact operation for owner review

Operation file SHA-256:
`01b96075d2f04acef730114427bc595986a1f0ce2720ed7fd3c9e84e304e141a`.
This is the hash of the exact UTF-8 operation file, including its trailing newline.
It binds the approved development target, run key, four artifact hashes, budgets and
cleanup limits. It confers no execution authority. Exact IDs and payloads remain
under ignored `.staging/property-p1/package/`; public inventory is PROPERTY_P1_REVIEW.json.
The earlier unapproved preliminary package is superseded and must never execute.

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `p1-plan.private.json`             | `bbd463ccb28ddbe6a6f873f364e42094d13c7a83767ea19f0c89ed486358a85a` |
| `activate-features.proposed.sql`   | `368f9553a044b72d3e527beef8d98762da2e500069c4f34d1ec5014d9c2c1148` |
| `deactivate-features.proposed.sql` | `9f218c649801a48d5afc78f654fc0ed56280c5c9c88368eaba64bec4ac67820c` |
| `p2-separate-review.private.json`  | `0d281d124a25c1482654841057e1d4f196d93f9bcd3b2ed6e1d1d21b01c3b195` |

`npm run property:p1-plan` is offline and has no execute option, credential reader
or hosted executor. It validates a fresh private evidence file and fixed run key,
refuses to overwrite an existing package, and freezes per-step hashes and explicit
result references. Fresh execution preflight would be a separate read-only attestation
against these frozen IDs/payloads; changing payloads, dates, prices, scope or hashes
requires a new review. Never silently rebuild or substitute the package.

## Exact proposed additions

Use the existing Straight Edge Property Services, Cunningham Construction and Sample
Roofing Contractor organizations and their existing customers, locations, issued
versions, jobs, workers and memberships. Eighteen aliases match the private Action A
roster; all are confirmed, owners retain required MFA. P1 exercises 15 distinct staff
identities. The three customer identities remain unused until separately approved P2.
The platform operator and its grant remain unused/inactive. No accounts or factors reset.

Three feature rows would be inserted once and left **disabled** after cleanup.
Each company has 25 positive fixture RPC steps and 19 new domain rows:

| Table                                    | Per company |  Total |
| ---------------------------------------- | ----------: | -----: |
| Inspection plans                         |           2 |      6 |
| Inspection visits                        |           4 |     12 |
| Immutable published reports              |           4 |     12 |
| Four-supplier comparison                 |           1 |      3 |
| Append-only material decisions           |           4 |     12 |
| Nonpayable supplemental invoice draft    |           1 |      3 |
| Proposed, unapproved job change          |           1 |      3 |
| New unmatched synthetic material expense |           1 |      3 |
| Approval of that synthetic expense       |           1 |      3 |
| **Domain records**                       |      **19** | **57** |

No duplicate estimate, expense, customer or project is created. The three new
expenses are explicit unmatched test purchases, not copies or relabeling of existing
purchases. Fixed run-specific purchase keys and unique supplier/reference tuples
must be absent in preflight. Existing expense-document uniqueness rejects repeats.
There are **75 fixture RPC calls + 69 assertion probes = 144 planned RPC calls**:
69 probes comprise nine permitted property-workspace reads and 60 expected denials.
Auth identity/MFA calls, read-only operator verification and feature-control SQL are
separate from that RPC count. Expected audit additions are **114**:108 domain/revision
events and six feature activation/deactivation events. Denials/read projections add none.

## Financial and property expectations

| Company        | Job revision | Original revenue | New synthetic cost | Proposed price | Pricing             |
| -------------- | ------------ | ---------------: | -----------------: | -------------: | ------------------- |
| Straight Edge  | 7 → 12       |        $3,062.80 |            $100.01 |        $112.51 | 12.5% markup        |
| Cunningham     | 2 → 7        |        $3,062.80 |            $100.01 |        $112.51 | Fixed $12.50 markup |
| Sample Roofing | 2 → 7        |        $3,062.80 |            $100.01 |        $100.01 | Pass-through        |

Markup is not gross margin. Use integer minor units and half-up percentage rounding.
Every company records absorbed, included, deferred and proposed dispositions for its
one new expense. Only the final proposed decision creates a proposed change/draft;
no change approval or customer debt results. Draft status remains
`awaiting_customer_authorization`. Original issued prices, baseline revenue, approved
scope, forecasts and payroll records remain unchanged. Only the three selected job
revisions advance by five; other job revisions must remain unchanged. No expense is
posted twice. A draft cannot become an invoice/receivable until genuine customer
consent and reviewed conversion exist; no such operation is in P1.

Weekly visits use October16/23; monthly visits use October31/November30 in
America/Chicago. Four manual quotes cover the existing 12-unit material requirement.
Expected comparable baskets are12000,12400,12800 minor units. Vendor4 has unknown
shipping and no total/winning basket; its12900 goods cost is not a complete price.
These are contractor-supplied synthetic quotes, never retailer feeds or provider success.
The genuine authenticated owner workspace must return the stored quote snapshot;
compare it with independent integer expectations and the existing application engine.

## Security review and current read-only evidence

Fresh preparation reads match the P0 baseline:13 history entries,514 catalog objects,
79 table digests,69 column grants,24 defaults,four schema ACLs and unchanged saved
Auth/API settings.22 identities,four verified TOTP factors and zero sessions remain.
All property tables/features/mappings/report leases and provider/release controls
remain empty or inactive. No production, Netlify, gateway or external communication call.

Original-row evidence now uses **actual composite primary keys**, covering all713
existing records. An ID-only approach was insufficient for estimate lines/schedules
whose logical IDs repeat across immutable versions; that preparation defect is fixed.
Store full original row digests, stable job digests and original revisions. After
appends, verify each original composite key remains, all digests match, and only the
three selected job revisions changed as specified. Whole-table counts alone are insufficient.

Real execution must use genuine Supabase password/Auth identity checks and existing
owner-assisted TOTP. Confirm exact roster UID, confirmed email, live AAL2 and current
organization authority. Owner/admin guards share the reviewed high-AAL SQL path;
local administrator tests verify it, but no hosted administrator role is provisioned
or claimed tested. Browser selection, aliases, metadata and proposal hashes confer
no authorization. Use normal caller-bound Supabase clients; never owner/service keys
for application RPCs. Private tables stay outside the API.

Retain each owner's genuine pre-MFA AAL1 token **only in memory** for the AAL1 denial
probe; never forge claims or serialize tokens. Exercise assigned/unassigned field,
estimator, already-revoked staff and six ordered foreign-tenant pair boundaries.
No membership/assignment mutation is proposed. Field projections omit reports,
comparisons and billing decisions; estimators omit management reviews/drafts.
Existing same-JWT session revocation is checked after real sign-out. No password,
TOTP seed/QR or authenticated token belongs in files, logs, GitHub or reports.

## Bounded activation, idempotency and cleanup

Before execution, require separate approval of this exact hash, target and cleanup.
Refresh history/SQL/catalog/ACL/Auth/API/row/role/quotation/run-key evidence. Stop on
any mismatch. Confirm an authorized operator can supervise the entire **30-minute**
window and independently perform cleanup. Feature rows have **no native TTL**.
Do not activate while waiting for owner MFA or while unattended.

1. Obtain fresh genuine owner AAL2 for all three existing owners and verify current
   permissions. Keep staff sessions scoped to their companies and factor identities unchanged.
2. Execute only the reviewed three-row feature activation SQL once. It checks dormant
   controls and exact job revisions. No upsert, broad grant, customer mapping or lease.
3. Run each company's frozen steps and interleaved probes once, resolving resource
   references only from validated server-returned UUID receipts. Check current CAS
   revisions, tenant ownership, original-row hashes, exact amounts and audit provenance.
4. Before any mutating request, durably create its exclusive private attempt record.
   The local journal helper stores only operation/payload hashes and scoped UUID
   receipts. It has no network or authorization capability. Never replay create-plan,
   quote-snapshot or uncertain requests:these APIs do not all have idempotent replay
   semantics. An ATTEMPTED entry without a receipt is UNKNOWN,not retryable. Stop and
   inspect hosted state read-only; a new approval may be required for continuation.
   Use reviewed durable private storage and operator recovery; filesystem records
   are not provider idempotency or protection against loss of the evidence volume.
5. At completion,error,owner interruption or30minutes,execute exact feature deactivation
   and globally sign out every exercised identity. Cleanup disables only the approved
   tenant IDs,including partial activation,and preserves rows/audits. Unexpected other
   features are reported,not modified. It is safe when the exact rows are already off.
6. Independently verify all three controls inactive,zero sessions,no mappings/leases,
   immutable originals preserved,expected57 domain rows/114 audit events,and no
   customer balances/approvals/provider capabilities. Test same-JWT denial after
   field sign-out. Preserve receipts and sanitized results;never DELETE/TRUNCATE fixtures.

Both control SQL files use2second lock/10second statement limits. At most two manual
cleanup attempts are proposed; a second is allowed only after a confirmed rolled-back
lock timeout,fresh read and cleared contention. Unknown outcomes require read-only
investigation,no blind retry. A partial run retains its actual record/audit counts;
never force the full57/114 expectation or modify immutable evidence to make it pass.

## All72 cases: honest readiness tracking

| Stage                   |  Cases |  PASS |  FAIL | BLOCKED | NOT RUN |
| ----------------------- | -----: | ----: | ----: | ------: | ------: |
| P1 staff                |     60 |     0 |     0 |      12 |      48 |
| P2 customer reports     |      9 |     0 |     0 |       9 |       0 |
| P3 media/runtime denial |      3 |     0 |     0 |       3 |       0 |
| **Total**               | **72** | **0** | **0** |  **24** |  **48** |

PROPERTY_P1_REVIEW.json lists every company/case/status and blocker. Local tests do
not change hosted statuses. Twelve staff cases are blocked within the fixed scope:
incomplete-checklist publication needs extra controlled state transitions; quantity/
substitution and nonzero credit/overlap scenarios need additional reviewed fixtures;
natural JWT expiry cannot be assumed in the30-minute window. Native tests validate
these existing protections separately. No forged JWT, altered Auth lifetime, extra
expense/credit or operator maintenance bypass may turn a blocked case into PASS.
Published-v1 immutability is tested; extra v2 publication and live membership/assignment
revocation mutations are excluded. Existing revoked membership and actual session
revocation are included. These limitations prevent a claim of complete acceptance.

## P2 is a separate approval package

The private P2 review artifact binds exactly three existing customer UIDs to their
existing company/customer/property tuple,three mapping-only records and three
nonrenewable15-minute report-only leases. It creates nothing. Before P2,review actual
published P1 report IDs and original snapshots,and separately approve exact mapping/
lease SQL,returned lease IDs,feature reactivation and cleanup. P1 cleanup leaves its
three feature rows disabled; P2 may not silently reuse an active P1 window.

Require genuine customer Auth,exact current mapping and finite report-only lease for
published reports only. Never enable global financial release mode or broad customer
release-test grants. No invoice,signature,payment or media capability is included.
At P2 cleanup,revoke only created lease IDs,deactivate only new mappings and approved
features,and close sessions while preserving all audit evidence. No lease extension.

## Recommendation and next boundary

**GO for owner review of the exact limited P1 operation; NO-GO for execution under
this preparation request,complete72-case acceptance,customer access or launch.**
Smallest next approval:authorize the above operation hash for the designated internal
development target,three feature activations,75 fixture calls,69 probes,explicit new
unmatched expenses,owner-assisted MFA and bounded exact cleanup. Accept the24 blocked
cases as outstanding rather than claim complete acceptance. A credential/session-
bound runner must preserve this frozen manifest and journal protocol;the offline
compiler itself is not a hosted executor. Any broader fixture/expiry/admin/P2 scope
needs separate review/approval. Netlify recovery,media/scanner/Storage services,
gateway activation,external email/signing/payroll and clean-production acceptance
remain independent gates. No merge or outside access is authorized.

## Local verification for this preparation

- `npm run check`: **748 PASS / 50 native-only skips**; lint, strict/generated types,
  migration/proposal integrity and local build pass.
- Focused disposable PostgreSQL17.11: **72 PASS**, including the exact P1 rehearsal,
  all 75 fixture calls/69 probes, 57 rows/114 audit events, administrator MFA,
  original-record preservation, partial cleanup and real lock-timeout/expiry races.
  This count is unrelated to the 72 planned hosted scenarios and does not cover
  every native-only test in the wider suite.
- Desktop/tablet/mobile local browser regressions: **63 PASS** on isolated loopback4177.
- Journal tests cover exclusive attempts, UNKNOWN, altered operation/payload, UUID-only
  results and path boundaries. They perform no network or authentication operation.
- Frozen Netlify integrity checks:26 PASS; all14 original artifacts/archive/manifest,
  approved logo and original README remain unchanged. No migration file changed.
- Formatting, public/private reference checks and diff validation pass. Counts overlap.

No genuine Supabase application sign-in, TOTP challenge or connected property case
was executed in this preparation. Read-only target/database inspection is not hosted
workflow acceptance. Supabase and Netlify settings/blocked deployment were untouched.
