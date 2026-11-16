# Disposable reader connection custody qualification

Exact parent: #506 `ff41ed204ddc3d19d356c3af6dfc1e56db77a457`.
This adds a test fixture and ten bounded native cases. It changes no original
reader, source guard, SQL, grant, schema, command, route, customer presentation or
connection factory. The original reader stays default OFF. #509's eleven-path
integration patch remains held and unapplied.

The fixture captures one actual pinned `pg` driver and its original observed
DB/PID/backend-start identity. Participating reader facades share a synchronous
one-use reservation. It never clears its process-local driver/backend markers or
returns the driver, cancellation key or raw SQL port. The fixture builds only the
unchanged `operatingCustomerInvoiceRead` function.

For a blocked original read, the pinned driver's cancellation protocol uses that
connection's own backend key. Qualification observes SQLSTATE `57014`, then ends
the socket and independently observes absence of that exact backend while the
blocking transaction remains open. The separate blocker still works. A transport
failure or missing backend observation retains UNKNOWN; an end acknowledgment
alone does not establish backend removal. No `pg_cancel_backend` privilege, stats
grant, operational role, service key or network adapter is introduced.

Cleanup adds awaited boundaries after the original reader's authority checks.
The fixture therefore requires a **trusted fixture release-authority callback**
after cleanup and rechecks the original target, signal, absolute deadline,
original source pins and canonical safe-response expiry before returning data.
The callback used by these tests performs a fresh read through another unchanged
original reader with controlled SDK Auth and the original proposed SQL. That
separate witness connection remains owned by the original fixture until its
existing `afterEach` cleanup. No awaited witness cleanup is placed between its
last authority observation and the synchronous release checks. Missing, revoked
or changed release evidence withholds even a completed safe invoice projection.
This callback and witness custody are explicit unaccepted operational TCB
requirements, not an implementation of genuine authorization.

The ten cases cover safe original receipt/disabled-link content, actual wire
cancellation and discard, shared-facade collision, owner deadline, preaborted
reads, unavailable cancellation, missing backend evidence, customer-session
revocation during held cleanup, target mutation during held cleanup, and missing
post-cleanup authority. The original 23 cases are filtered. All original case and
hook budgets, assertions, and the complete #506 native prefix remain byte exact.
The original #509 alias/output-only cancellation observations remain unchanged;
passing this participating fixture does not repair the original unwrapped reader
or accept those limitations operationally.

Run only with pinned Node24, existing dependencies and local PostgreSQL17:

```sh
node proposals/reader-physical-custody-qualification/run-native.mjs \
  --pg-bin /path/to/postgresql17/bin \
  --evidence-dir /private/tmp/fresh-private-reader-custody-evidence
```

The finite runner authenticates exact source/driver bytes, creates an owned short
real `/tmp` source image and a Unix-socket cluster with TCP disabled, checks strict
types on the actual appended test, runs only the ten new cases, and removes its
owned source/cluster. Evidence must be fresh and outside the source checkout.
The driver cancellation API is qualified from the pinned `pg8.23.1` implementation;
its private API and Node/filesystem loader remain trusted test dependencies.
[Client lifecycle documentation](https://node-postgres.com/apis/client) does not
certify this target or an operational cancellation owner.

Primary final qualification: ten PASS, zero failures, 23 originals filtered.
Earlier deep-path runs and the pre-review seven-case run remain evidence. The
latter lacked a post-cleanup authority check and is not accepted as release
freshness proof. Repeated ancestor/source checks materially slowed the deep source
image; the identical reader completed in the short image without any guard or
original deadline change. The fixture's four-second bound stays below the original
4.5-second reader and five-second bridge bounds; the explicit deadline case uses
300ms. This is not a production latency or physical-device claim.

Process-local markers are neither durable one-use custody nor cross-process pool
fencing. Fixture raw-driver exclusivity, administrative observation, separate
release witness, cancellation/discard responsibility and pinned private API must
all be independently accepted for any real owner. These tests do not close D2/D3,
A01–A12, genuine Auth/MFA, installed writer/grant/bypass completeness, independent
ACK/spent/revocation fencing, recovery, invoice authority or merchant acceptance.
Payment remains UNKNOWN; links remain disabled; no provider was called.

Reuse the existing [D1 return](../../docs/program/CYCLE33_V1_D1_RETURN_FORM.md) and
[Issue #358](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/issues/358).
The delta is concrete physical cancellation/discard evidence and a mandatory
post-cleanup release-authority requirement. It does not create a second owner form
or appoint an operational connection owner. Exact private target/principal/source/
rendered SQL/grant/window/STOP/cleanup acceptance remains separate. Saul 2 Paul
stays first; Cunningham needs independent tenant/customer/Auth/merchant/key and
settlement acceptance. **Release1.0 remains NO-GO.**
