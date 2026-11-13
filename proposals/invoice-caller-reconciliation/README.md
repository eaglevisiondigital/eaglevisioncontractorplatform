# Issue388 · unapplied caller-bound invoice correction

This two-file proposal fixes the demonstrated client reconciliation defect:
actor B's rejected reuse of actor A's command must not be reconciled using A's
receipt. The original SQL already rejects the reused command with40001. The
previous native failure remains evidence; no SQL isolation bypass or duplicate
original commit is asserted.

`correction.patch` changes only the commercial draft client and adds an unwired
server caller-connection contract. The canonical client, SQL, Auth and historical
source inventories stay unchanged. The qualifier pins exact parent/source/patch
bytes and applies only into a fresh disposable directory. Its test load reuses the
pinned TypeScript compiler and existing Auth code; it adds no transaction engine.

The connection contract reuses the actual CustomerBrokerAuth verifier and opaque
proof. It requires current AAL2, the same captured bearer/actor/session/expiry and
exact database/PID/backend-start/login/role on one exclusively owned connection.
Auth is reverified after inspection; every SQL await is checked and results leave
only after final verification. The original attempt binds tenant, invoice,
customer, property, source version, command, expected revision, title/memo, actor,
session and the unchanged native SQL request-hash expression. Only exact caller
and receipt evidence can release a hold. Holds/one-use command keys cannot be
bypassed by UUID case aliases; the UUID parser itself remains unchanged. This
neither applies nor supersedes #377's separate parser proposal.

Minted caller objects use JavaScript private state, including bearer custody;
JSON serialization reveals no bearer. A private mint registry and captured
reviewed dispatch/verifier methods reject forged shapes and method overrides.
Participating clients cannot overlap on the same connection. This client returns
only its current actor's receipts; direct SQL staff-read permissions are unchanged.
A trusted server controlling raw connections, Auth configuration or transports
remains a TCB. No operational connection factory, credential loader or route exists.

## Verification

- `node node_modules/vitest/vitest.mjs run tests/invoice-caller-proposal.test.ts`:
  36 cases, including strict candidate compilation, fabricated/copy/override denial,
  expiry, final-inspection revocation, lost ACK, identity/hash substitutions,
  concurrency and UUID aliases. Independently passed.
- `node proposals/invoice-caller-reconciliation/run-native.mjs`: reuses the exact
  existing disposable PG17 harness, changing only its test selection. Ten native
  cases passed independently and through this wrapper, with TCP disabled. Real
  LOGIN/backends and a separate Auth-row fixture observer are used; controlled
  provider responses exercise the actual SDK, not genuine hosted Auth.
- Original canonical client unit suites:28 cases passed against unchanged source.
  They are not full regressions of the proposed new caller API. Existing unbound
  fixture consumers must be explicitly migrated before source admission; their
  original assertions and budgets must be preserved. There is no legacy bypass:
  missing caller context deliberately fails closed. Full proposed-source legacy
  consumer acceptance remains OPEN.
- The ten backend-dependent cases explicitly skip under default PGlite. Native
  PostgreSQL results are reported separately; skips are not native passes.

No independent durable custody is proven. Holds remain instance-local and do not
survive process loss. No genuine Auth/MFA, hosted persistence, first-pilot,
external recovery, merchant/NMI or production acceptance is claimed. Source
preparation does not close the installed launch blocker.

## Exact next owner decision

Approve ONLY isolated development-source authoring of patch SHA256
`bcf2dbf4e967007cab60d81b0c7599372ca55cf69b1c52ecaed320b0062aa034`,
provided original client SHA256
`12c1eb303f10f8cb9e6c5f765839419f55e4b6cfd16c6c6ef9f8812ccbb76194`,
SQL and Auth hashes match `evidence.json`. Proposed client SHA256 is
`94aa164e60c780cb53f8658b16c57bc9c17da5d9469c73f9d73cab627dcea694`;
new caller source SHA256 is
`3d892a8ae7757a6f480fde4638f17f4b642436ba728446dfd84811590be0aeed`.

That decision excludes protected checker/test changes and fixture migration,
SQL/grants/installation, operational routes, hosted Auth or AWS, merchants,
credentials, financial execution, deployments and merges. Review the resulting
source author independently, then require separate exact finite admission and
caller-fixture approval before combined current-head acceptance. D1–D3,
A01–A12, both VAR sheets, separate merchant bindings and recovery remain open.
Saul 2 Paul stays first; Cunningham second. Release1.0 NO-GO.
