# Workstream 2E · D009 ownership and next operational decision

October 29, 2026 · **NON-EXECUTABLE PLAN. Operational NO-GO.**
No approved operational SQL, migration, credentials, public endpoint or UI adapter.
The new seven-schema role checks extend the existing2D inventory; they are not
complete production least privilege. Original2D catalog evidence remains preserved.

## Required ownership model and evaluated disposable paths

| Component                      | Required future authority                                                                                                                                                    | Current laboratory fact / remaining work                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticated request verifier | Verify genuine signed identity/issuer/audience/expiry, current account/session/member/resource and required MFA; derive organization/server command from verified permission | Not implemented as operational Auth. Local fixture claims/session rows are synthetic, never signed JWT proof                                                                  |
| Capability/claim issuer LOGIN  | Only reviewed exact issuance; no business mutation, generic table CRUD, role membership or reset/cancel/delete; independent of request mutation credential                   | New issuer can call only issue across public/private/auth/fixture scopes; immutable approval mapping provisioned by trusted owner. Its separate broker/definer remain trusted |
| Mutation LOGIN                 | Only exact protected gateway; no issue, oldgateway/rawhelpers, direct table/column access, sequence/reset or role changes                                                    | New runtime tested against all7 schemas; one function. Claim/full transaction/backend/source/actor/phase equality and one-shot gate required before commit                    |
| Gateway NOLOGIN owner          | No LOGIN/SUPERUSER/BYPASSRLS/CREATE/role management or application DML; only fixed reviewed core calls                                                                       | New owner can execute its wrapper/core only, no table/column access. Core still trusted superuser fixture owner                                                               |
| Helper/command core owners     | Independently scoped nonlogin owners with only required table/function privileges, reviewed search_path and grants; no unrestricted bootstrap role in request path           | BLOCKED. New issue/core and existing2A/2B/2C/historical definers still transitively execute as trusted fixture owner. Do not reassign historical ownership ad hoc             |
| Private tables/functions       | Composite tenant FKs/UNIQUE/CAS/indexes, RLS/default-deny and explicit ACLs, checked append-only commands; no generic API                                                    | New disposable approvals/claims/outcomes have RLS/FORCE, immutable update/delete and composite parent references. No operational schema package exists                        |
| Revocation/admin containment   | Separate exact current capability/session/role revoker, required MFA/supervision, one-way disable, no outcome deletion/reset or identity replacement                         | Existing capability revocation checked at issuer/runtime final boundaries. Arbitrary mixed-resource administration and actual supervised containment remain unverified        |
| Audit reader/monitor           | Restricted metadata-only append-only evidence; no raw notes/costs/employee/session/command payload in general logs                                                           | Existing private metadata audit reused; operations monitoring/alerts, audit access model, retention and failure response need implementation                                  |
| Provisioner/supervisor         | Reviewed operator-only bootstrap, key/role custody and independent oversight, separated from request caller; no hidden permanent production superuser path                   | Trusted fixture seeding/broker are not a production IAM or fully isolated process boundary. No real credentials used                                                          |
| Command custody/recovery       | Encrypted persistent intents/receipts, reviewed keys/backup/retention, bounded capacity, exact read-only UNKNOWN reconciliation                                              | Existing private plaintext synthetic SQLite retained; no operational encryption, disk/database recovery or independent-device acceptance                                      |

Native effective privileges cover public, private, auth and2A/2B/2C/2E schemas for new
runtime, issuer and NOLOGIN owner, including table **and column** access. Runtime sees
one application function; issuer one issue function; gateway owner its wrapper/core.
Neither LOGIN can access/reset/alter private claim sequences, issue protected work
through another role, manufacture claims/outcomes/approvals or change role membership.
These are the available new disposable paths, not removal of all old trusted paths.

Sequence consumption is a rollback-resistant test primitive, not authenticated durable
operational custody. Cluster crash/reset, owner privilege, ordinary writer integration
and genuine remote principal verification still need independent design/implementation.
Preserve UNKNOWN even if a sequence or physical database is uncertain; never infer that
an absent target authorizes replay. Owner-approved frozen P1 remains against13 history.

## Next decision gate: four distinct outcomes

**A · Local architecture demonstrated.** Independent durable issuer commitment can be
required before an exact restricted SQL mutation; claims are one-shot through process,
transaction, savepoint and nested-exception interruptions; existing engine workflows,
per-phase outcomes, custody, conservative reconciliation and participating ordering
are executable. D001 is FIXED only for this new boundary; D002 is PARTIAL.

**B · Operational implementation still required.** A real private coordination schema
and forward-only migration, fully reviewed definer owners, genuine identity/capability
issuer, authenticated service boundary, encrypted custody, all ordinary/admin writer
adapters, application persistence binding and monitoring/retention/restore mechanisms.
No part is activated by local PASS. A new approved migration must not silently expand
P1's13-history scope or consume customer-fourteen's separate gate.

**C · Owner/security decisions still required.** Separately scope an operational
integration design/review: exact data/role/ownership model, complete writer/lock matrix,
Auth/MFA issuer trust and credential/key custody, containment/recovery/retention plan,
acceptance criteria and proposed target/history sequencing. Later executable SQL,
migration application, credentials, service/UI activation or hosted acceptance each
need their applicable explicit action authorization. Existing unchanged P1 approval
persists; no duplicate original approval request. Physical recovery and separately
exact hosted verification remain unfinished, with no physical-device PASS claimed.

**D · Release1.0 work can proceed independently.** Recovery/Netlify waits do not block
separately scoped local work on existing inspection scheduling/missed-visit review,
property procurement/change review, scanner/worker validation preparation or other
unfinished business acceptance. Reuse existing models/engines and locked visual
approvals; do not activate providers, introduce duplicate systems or drop unfinished
required release modules. AR remains held for product planning.

**Recommendation:** choose one focused **operational integration design/review** next,
so the actual ownership/writer/storage/Auth decisions are settled before any adapter or
migration. Do not automatically start a2F simulation/security series. If the owner
prefers parallel product progress, a bounded inspection scheduling and missed-visit
workflow package using existing plans/visits can proceed under separate direction.
Neither recommendation grants operational/hosted authority.

Release1.0 remains **NOT READY / NOT AUTHORIZED**. Thirteen historical migrations,
unapplied customer-fourteen, frozen P1/four artifacts, existing owner approvals,
approved customer/contractor UIs and financial/recovery/Netlify/deployment/merge
restrictions remain intact.
