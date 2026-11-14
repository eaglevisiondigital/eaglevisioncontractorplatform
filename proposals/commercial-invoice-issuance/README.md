# Commercial issuance · unapplied development candidate

Parent: exact launch #450, `7f464e6c7be280c4134eee4a031a737ed79d2b5a`.
This implements issuance in a disposable database over the original commercial
draft records. It is not installed, admitted, wired or operationally accepted.

The additive SQL locks the exact customer/property/source/revision, requires a
separate invoice-specific issuance authority in addition to current original
AAL2/session/membership/draft checks, and freezes that revision on the existing
header. `INV-<full invoice UUID>` numbering is deterministic and tenant-unique;
commercial numbering policy still requires owner acceptance. No chronological or
gapless numbering, legal compliance or financial posting is claimed.

An exact actor/command/request-hash issuance receipt survives connection closure.
Duplicates return the original result only with current issuance authority.
Ambiguous acknowledgment permits original receipt read, never replacement intent.
Both command-rebinding directions are denied. Post-issue edits roll back, retaining
the original draft revisions/receipts. UTC timestamp encoding makes reopening stable
across session time zones. Original money/source/tax calculations are reused.

The first hosted PR native job exposed a fixture-only collision with the original
draft suite's cluster-wide role names (42710 before initialization; original746
passed/original1 skip, new34 not run). The new fixture now uses three distinct
disposable role aliases and removes its roles. Both suites then pass together in
one native cluster with four workers: new34 + unchanged original31 = **65 PASS**,
zero failures/skips. The proposed SQL, original tests and time budgets are unchanged.
Fresh hosted verification of this fixture correction remains separate.

`presentation.ts` projects only exact issued evidence into immutable customer-safe
content. Staff memo, costs, actor and request hash are excluded. Draft/paid claims,
wrong identities, extra fields and malformed evidence deny. Titles are untrusted
text, not HTML. This pure function creates no customer access, payment URL or sender.

## Held compatibility patch

The original protected draft projector always labels its result `draft`. The
one-line `draft-projection-guard.patch` prevents that legacy reader and old command
replays from relabeling an issued header. Tests apply the proposed bytes only in
their disposable SQL input. The canonical file remains byte-exact:

- Before: `da35d098727eff68ae7905c3709d6982cf89560cae538923f5d7e570dab0306e`.
- Proposed after: `e1c504f9a7077caa92c375c378fb370155478be9cf077e66bf58932ae0895a3c`.
- Patch: `45d2eeafaca661d586e707aa6974b3f3216a44988de8a4b3e8d39f55bd3b6f45`.

`source.json` records the exact source/schema/grant proposal hashes; hashes alone
grant no authority. First checkpoint: authorize only this protected guard patch
on a separate source-author branch, after independent review. This excludes SQL
installation, admission, launch integration and every operational action.

## Verification and remaining acceptance

Run the two new test files with the existing Vitest configuration. Native cases
require the existing disposable PostgreSQL17 Unix-socket harness; the four peer
connection cases are explicitly skipped under PGlite. Tests cover Save/reopen →
exact revision issuance, CAS/source denial, concurrent duplicate workers, observed
advisory-lock waits, expiry/revocation, rollback, role/RLS/grant denial, original
actor reconciliation, immutable records, privacy and UTC reopening. The timestamp
case reproduced rejection under America/Chicago before the UTC correction.

No existing test, timeout, source checker, migration, engine, dependency, UI, grant
installation or application route is modified. The SQL is not under migrations.
Its two new private EXECUTE grants target only a new NOLOGIN issue runtime role;
client/service roles receive none. CREATE is revoked from the trusted owner at end.
No operational provisioner, LOGIN, authority seed or role assumption is supplied.

Genuine acceptance remains blocked by the held Auth/session RPC and original
recovery → P1-on13 → customer14/broker prerequisites where used; a separately
reviewed caller role/connection contract (issuance-role/workload acceptance has
not been qualified); exact target/history, SQL/owner/runtime/LOGIN/grant and authority provisioning
approval; fresh installed-writer/bypass inventory; D1–D3; and original A01–A12.
Receipt durability here is local PostgreSQL, not independent custody or hosted Auth.
Customer publication, consent/delivery/resend/audit, a real payment-link lifecycle,
ledger posting, verified payment receipts and settlement remain unimplemented or
unaccepted. No draft receipt becomes a financial receipt.

Saul 2 Paul is first. Cunningham reuses source only, with independent tenant,
customer, actor, merchant/key and settlement acceptance. VAR/NMI sandbox bindings
remain private external prerequisites. Release1.0 remains **NO-GO**.
