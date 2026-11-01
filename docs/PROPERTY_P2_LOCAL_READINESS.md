# P2 customer property reports: local implementation and acceptance preparation

October18,2026. Base6ea2757,existing codex/phase-1-foundation/draft PR#1.
**LOCAL IMPLEMENTATION; NO HOSTED ACCEPTANCE OR CUSTOMER ACTIVATION.**

## Completed bounded package

- Report-only customer history screen with service-month filtering, published
  version labels, reviewed damage/repair recommendations and checklist evidence.
  Weekly/monthly examples reuse the existing CRM/location/property repository.
- Explicit `/preview/property-portal` synthetic screen retains the exact Propel
  logo and individual contractor identity for all three sample companies. It has
  no real login, approval, signing, payment, media or external-message action.
  The existing broader Client project view is preserved. `/portal/property` stays
  closed and never substitutes samples. The new prepared connected component is
  not registered on any connected route or deployed Function.
- `PropertyReportSession` composes the existing `property_reports` RPC only. It
  verifies the expected genuine caller before/after reads, clears data on Auth
  events/errors, rejects late responses after account changes/close, prevents
  overlapping loads and bounds pagination to500 reports. Each SQL page is50.
  A30-second display-cache limit clears history without background sign-in or RPC;
  it is not an authorization lease. Server revocation/lease checks remain mandatory
  on every request. Previously viewed text cannot be retracted from a human/browser.
- Strict report-page parser rejects foreign company/customer/property responses,
  unexpected private/financial fields, media, invalid dates/timestamps/severities,
  duplicate reports/findings and oversized text before caching/rendering. React
  renders findings as plain text; no HTML/link/media interpretation is introduced.
- Offline `prepareP2Readiness` produces the original nine P2 case groups (three
  groups per existing company),with exact candidate report IDs/snapshot hashes,
  proposed three mappings/three15-minute nonrenewable report-only leases/three
  feature reactivations and narrow cleanup requirements. It has no SQL compiler,
  credential reader, Auth/session creator or executor. It is not permission or
  ownership proof. Its synthetic unit-test bindings are never hosted fixtures.

No new migration, customer/property/job/financial database, broad financial grant
or API exposure is required by this local package. Preserve all13 installed SQL
files and the original713-record baseline. No fresh hosted state is claimed.

## Nine P2 cases and real authorization still required

The local disposable SQL suite executes `customer-report`, `foreign-customer` and
`private-projection` for each of three synthetic companies. Exact mapped customers
receive only published allowlisted reports. All ordered foreign-company boundaries,
wrong customer/property and foreign report cursors deny. Staff/financial commands
remain denied despite report access; mapping revocation denies the next request.
Existing tests cover absent/expired/revoked leases, unverified/expired/revoked Auth
sessions, owner-AAL2 requirements, pagination, immutable leases and native lock waits.
SQL test Auth/GUC fixtures are **not genuine hosted Supabase sessions**.

Hosted nine cases remain **0 PASS/0 FAIL/9 BLOCKED/0 NOT RUN**. Before any actual P2:

1. Complete independent recovery readiness and separately approved real recovery
   verification; complete the unchanged authorized P1 operation with genuine MFA.
2. Read actual P1 published report IDs, versions, ownership and snapshot hashes.
   Validate existing customer UID mappings against the private22-identity roster;
   do not create users, replay fixtures or accept an arbitrary browser/URL boundary.
3. Freeze a separate target-bound P2 package: exact mapping/lease/feature SQL,
   original records and current revisions, real customer session custody, operation
   hash,15-minute maximum with no silent extension, and supervised exact cleanup.
4. Obtain that separate exact P2 approval before mappings, leases, features or
   hosted sign-in. Use genuine caller-bound Auth/PostgREST; no service-key substitute.
5. Revoke only created lease IDs, deactivate only created mappings and approved
   features, close exercised sessions locally and independently verify originals,
   unrelated sessions/controls and all financial/provider/media off gates.

This package does not implement a connected portal discovery/login flow or customer
estimate/approval permission. Those must use a separately reviewed customer binding
and existing financial source architecture,never the broader internal-release grant.
Full Release1.0 still requires secure customer login, estimates/repair scope review,
approval/decline, contracts/invoices/payment schedules and safe media under their
own server gates. They are not removed from scope or made ready by report UI tests.

## Remaining12 P1 staff gaps: separate proposal

See PROPERTY_P1_GAPS_REVIEW.json: four existing case groups per company,12 BLOCKED.
It is a design proposal,not an executable/frozen operation or authorization.

| Group                    | Local protection/evidence                                                                                                             | Additional hosted scope to freeze separately                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required checklist       | Domain/SQL publication fails for incomplete required items; denied writes roll back                                                   | Separate draft inspection plan/visit,save/submit/publication denial and exact fresh revisions;retain immutable evidence                                          |
| Quantities/substitutions | Existing matching flags cumulative excess,unit differences,price increases and substitutes; uncertain supplier equivalence cannot win | New reviewed synthetic payments,precise quantities/units/source keys and expected baseline matching;no historical purchase edits                                 |
| Credits/overlaps         | Approved linked credits reduce net integer cost; normalized overlaps/zero net deny proposals                                          | New linked-credit and distinct overlapping receipt/invoice fixtures,review states,net costs and CAS;never credit a historical expense merely for testing         |
| Expiry                   | Native PostgreSQL tests use real clock/wait to deny stale JWT/session expiry and roll back effects                                    | A separate genuine-token observation window with existing identities/custody/cleanup;no forged token,Auth-lifetime setting change or assumption it fits30minutes |

Exact new row/audit budgets,payload IDs,prices,post-P1 revisions and operation hash
remain deliberately unfrozen until actual P1 evidence exists. This avoids approving
a guessed fixture delta or replaying already-proposed expenses. Review every extra
append/expected job revision and zero customer-debt invariant before authorization.
The original01b96075… package,four artifacts,75 steps/69 probes and57-row limit are
unchanged. No extra case/fixture is inserted into that already-approved operation.

## Recovery findings preserved

Owner reports the original utility downloaded,two SHA256 checks verified,25/25
original offline tests passing,working Python/hotspot and two website loads.
FileVault is currently disabled; newer encrypted custody software has not been
independently rehearsed there. Detailed hardware/runtime facts remain private.
No privileged Monterey credentials or OS/Linux replacement is authorized. Do not
repeat successful original checks by default or mislabel them operational recovery.
See PROPERTY_P1_R0_DEVICE_READINESS.md. Recovery hardware and Netlify support remain
separate dependencies;this increment does not monitor or change the blocked deploy.

## Verification and release status

Final counts are recorded in PROPERTY_P2_LOCAL_VALIDATION.json. Local unit/PGlite,
native PostgreSQL and browser results overlap; do not add them into one total.
Browser screenshots are synthetic report previews only,not hosted/customer acceptance.
No hosted requests,sessions,MFA,fixtures,features,grants,leases,media,provider calls,
communications,deployment or merge occurred. Hosted72-case tracker remains
**0 PASS/0 FAIL/24 BLOCKED/48 NOT RUN**. Existing P1 approval persists;no duplicate
request. **Release1.0 remains NOT READY / NOT AUTHORIZED**;PR#1 draft/unmerged.

Final local evidence: **875 application/PGlite PASS,50 native-only skips;77 Python
recovery PASS;355 native PostgreSQL17 PASS/zero skips;69 desktop/tablet/mobile
browser PASS**. Counts overlap. Formatting,lint,strict/generated types,migration/
property/frozen-package integrity and build PASS. Initial local initdb/loopback
binds were sandbox-blocked;authorized disposable/loopback reruns passed. No rejected
hosted probe was retried. Actual GitHub CI evidence is on the exact pushed PR commit
and is reported separately;no CI count is added to these local test counts.

Synthetic screenshots: [desktop](../artifacts/property/desktop-customer-report-only.png),
[tablet](../artifacts/property/tablet-customer-report-only.png),
[mobile](../artifacts/property/mobile-customer-report-only.png). Desktop/mobile were
visually inspected;all three viewports passed accessibility and overflow checks.
