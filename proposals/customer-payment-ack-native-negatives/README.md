# Original ACK: additional native capture-state coverage

**UNAPPLIED test-qualification proposal, outside the launch candidate.**

This fixture-only successor adds the three missing composed capture cases to exact
#505 `5c2f63b1b2082220c03413b953662780903ad4cb`: `pending`, `unknown` and
`declined`. No existing source, SQL, fixture, manifest, guard or patch is changed.
The original eight native case bodies remain exact and were filtered out of this
new run, preserving their separately accepted evidence.

The inherited #505 source suite invokes its closed-inventory `capture()` against
the current checkout at module load. It correctly rejects this additional fixture
namespace on the successor checkout. Its qualifier remains unchanged; therefore
this successor has **inherited source-suite/default Foundation gate DENY**,
not whole-checkout acceptance. A separate narrowly reviewed fixture-compatibility checkpoint remains
necessary before any complete-checkout acceptance. The native result below uses
the exact #505 source snapshot and the explicitly recorded test-only tail.

The existing eight cases already cover successful capture, succeeded/declined/
unknown refunds, lost read acknowledgment, foreign capture linkage and customer/
workload revocation. The existing 25 unit cases and #502's native lifecycle tests
do not substitute for these three new native **composed original ACK** cases.
`failed` is not an invented database state: a failed/ambiguous read remains UNKNOWN,
and original unknown/declined outcomes grant no replay or publication authority.

The tail calls existing fixture `reserve()` once for a fresh pending attempt or
`finish(status)` once for a fresh unknown/declined attempt. It never rewrites a
succeeded row. Each case invokes the unchanged composition twice, requires the same
original invoice/issuance receipt/capture key/status/amount and checks the exact
allowlisted receipt fields, private-hash/merchant/authorization minimization,
unchanged attempt/authorization/audit state, four identical original read-only
receipt SELECTs and denial of raw attempt-table access. Payment remains UNKNOWN,
balance null, settlement UNVERIFIED, publication BLOCKED, link/delivery DISABLED,
financial effect/hold release false and invoice quarantine NOT_CLEARED.

## Bounded execution and evidence

Use the existing #505 materializer against a byte-exact #505 source snapshot,
then call its `verifyMaterialized()` **before** any test extension. Verify the
native payload SHA256 `07485ab06a23d7c0c79a55c5d710169125b890cb86b6cd3775144c91658dac02`.
Append only `native-negative-tail.proposed.txt` to its materialized
`tests/database/customer-payment-ack-composition.test.ts`; the complete old payload
must remain the exact prefix. Record the tail and extended-file hashes in
`source.json`. This is a declared test-only extension: the original strict #505
verifier does not accept the extended image and is not weakened here.

Run only the new case identities in a fresh owned, TCP-disabled PostgreSQL 17
fixture using the unchanged bootstrap, CI core-role seed, hooks, configuration and
budgets:

```sh
node node_modules/vitest/vitest.mjs run \
  tests/database/customer-payment-ack-composition.test.ts \
  -t 'additional capture' --reporter=json --outputFile=OWNER_PRIVATE_REPORT
```

Primary and independent new native results: **3 PASS, 0 FAIL each; 8 original
cases filtered in each run**. The independent review verified all 2,482 extended
image files/modes before and after execution, with the test file as the sole
declared change from the qualified original image.
The owned cluster was stopped and removed. The materialized image passed
TypeScript, scoped ESLint and Prettier. Raw reports and private fixture identities
remain outside Git; public report hashes are in `source.json`. The previous 37
source/unit cases and eight native cases were not rerun. No new browser behavior
was introduced. This is disposable native validation, not hosted/Auth/provider or
customer acceptance.

## Unchanged next source checkpoint

The #505 three-addition composition patch remains UNAPPLIED:
`07f345abc31b248d5ff23ada8efb82349dc23d44f2cc61b49e63cd8a1cffccbe`, on exact
#502 `14521c14ceb27056d96b265d55ce69266733f7c3`, all mode `100644`:

- `proposals/invoice-payment-receipt/reader.ts` (existing original reader).
- `server/invoices/commercial-payment-receipt.proposed.sql` (existing uninstalled SQL source).
- `proposals/customer-payment-ack-composition/reader.ts` (private read-only wrapper).

Only a separate exact source-composition approval can admit those additions on an
isolated development successor. This fixture increment does not approve the A2
source guard, canonical launch integration, SQL/grant installation, operating
financial reader, genuine current Auth/MFA, tenant/merchant configuration, customer
routes/publication/links, provider calls, financial actions, merges, deployment or
recovery. The existing first-contractor acceptance plan remains authoritative;
NMI tokenization, authorization-only, capture-later, void, provider reports, fees,
net deposits and bank matching still require separately bounded genuine acceptance.
Saul 2 Paul is first; Cunningham requires separate accepted bindings.
**Release 1.0 remains NO-GO.**
