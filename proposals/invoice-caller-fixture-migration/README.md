# Trusted invoice caller fixture migration

Parent is exact approved source author `8f498f2c657608c64d40a3527be13b47a189b7b7`
(PR393), applying only #392's two-file patch. No further client, caller, SQL, Auth,
route, grant or dependency change occurs here.

The original three unit suites retain all28 cases and assertions. Their controlled
SQL port now separately supplies labeled unit connection inspections and hash
responses, while every original business query, argument, ACK, failure and call
count remains on its original mock. Actor IDs are stable fixture identities.
Two explicit waitFor controls wait for business dispatch before releasing ACKs;
the original input-mutation timing and safety assertions stay intact.

The two existing native-client callsites reuse the existing writer through a
restricted disposable LOGIN, its actual backend/database/role, and a separate
current Auth-row observer exercising the existing SDK. Lost-ACK faults and dispatch
counts apply only to business mutation queries. PGlite's backend inspection and
Auth response are explicitly simulated; actual claim/hash/business SQL still runs.
No case or assertion is removed and no new skip or budget is introduced.

The historical #392 qualifier now uses an exact source-author baseline adapter.
It preserves the original immutable proposal record/patch and original source
bytes. Alongside an active author, it first verifies exact8f parent, sole two-file
delta, regular modes and committed/current hashes. Unknown or mixed sources deny.
It returns the active author explicitly; this is test loading, never launch source
admission. The existing launch source test and historical manifests are unchanged.

Validation: original28 client cases plus historical36 proposal cases pass;
13 migration/negative-source guards pass. Independent28+13 pass. All five affected
native suites60PASS/0SKIP/0ERROR, independently60PASS. The existing PGlite client
Save/reopen/lost-ACK case also passes. Native LOGINs and test clusters are cleaned up.
Source hashes are recorded in `docs/INVOICE_CALLER_FIXTURE_SUCCESSOR.json`.

The original launch-source positive check still rejects the protected client hash,
as required before separate admission. A following **unapplied** finite admission
package must bind exact source author and this fixture author while retaining
historical pins and unknown-edit rejection. Passing native tests is not that approval.

Next approvals remain finite protected-source/test admission, genuine Auth/MFA,
D1–D3 custody/recovery and original A01–A12; both merchant VAR/NMI sandbox scopes
remain separate. No SQL installation, route, real tenant, credential, payment,
communication, deployment or merge. Saul 2 Paul first; Cunningham second.
Release1.0 NOT READY / NOT AUTHORIZED.
