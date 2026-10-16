# Document worker and provider activation contract

## Current extension — durable control store implemented locally

The later connected-development work adds private.material_processing_jobs and
material_worker_grants, narrow queue_material_source/material_worker_control RPCs,
strict database extraction validation and server/materials/control-store.ts. Native
PG17 tests cover concurrent claims/publication, lease replacement, revocation,
quarantine, schema/provider denials and bounded retries. The original contract-only
statement below is historical: the durable SQL/CAS and Supabase metadata adapter
now exist, but have NOT been applied/validated hosted.

No Storage policy changed. An approved workload identity and scoped byte gateway,
resource-isolated worker deployment, actual scanner/AI, retention/orphan cleanup and
genuine Auth/Storage HTTP acceptance are still required. Source stays quarantined
until a private clean object and validated extraction commit. SQL object fixtures
are synthetic control contracts, never proof of actual malicious/clean file scanning.
The ingestion handler remains503. See CONNECTED_DEVELOPMENT.md for target designation
and action-specific approvals; never promote synthetic development DB to production.

## Implemented locally; live processing remains disabled

Existing parsing, review and pricing are preserved. The Netlify material-import
endpoint still returns 503 unconditionally; no new HTTP ingestion or upload policy
was added. Neither credentials nor a UI flag can activate it.

server/materials/scanner.ts implements an HTTPS-only authenticated binary scanner
contract: maximum 3 MiB, SHA-256 request binding, no redirects, 30-second timeout,
4 KiB bounded JSON evidence, operator-allowlisted engine, matching digest, current
15-minute evidence, signature version and strict verdict fields. Unknown/infected
verdicts never pass the existing pipeline. Errors/outages/malformed evidence fail
closed. This is a contract adapter, **not a purchased/approved malware engine**;
`approved=true` expresses a trusted injected dependency, never a user-provided
attestation or proof of production approval. Only an operator-approved scanner
identity/engine can be instantiated in a future production worker. Test transports
are explicitly synthetic. No real engine or malicious file was contacted.

server/materials/worker.ts adds single-job orchestration over a durable queue
contract. Opaque fenced leases, expiration and maximum three attempts gate reads,
clean release, extraction persistence and completion. Backoff is 30 then 60 seconds;
third failure rejects. Authorization is rechecked after external calls. A stale,
expired or revoked worker cannot publish a result through a conforming store.
Generic errors never retain supplier payloads. At the original Phase 3A baseline the queue persistence/control service
was **not implemented/provisioned** (superseded by the extension above): local mocks prove the orchestration
contract, not atomic database/Storage behavior or real worker isolation.

The existing vendor-neutral AI gateway is HTTPS, redirect-disabled, timeout/bounded
response and schema checked. It requests literal nullable values, treats source text
as inert and enables no tools, URLs, payment or communication actions. No live
vendor/model selected; benchmark candidates remain in MATERIAL_IMPORT.md. CSV can
use the strict literal parser after the same scan/validation gates, not an AI bypass.

## Required durable control store contract

Before wiring a real worker, implement and test these operations in a narrowly
privileged trusted control service/private database capability, never generic
service-role request CRUD:

1. Authenticated tenant ingestion resolves current organization, estimating module,
   active submitter and assigned purchase job; enforces file count, daily byte/jobs
   quotas, supported types and content length while streaming to private quarantine.
   Server assigns source/object key and digest; immutable dedup/idempotency keys.
   No external document URL, client scan evidence, signed public upload or upsert.
2. Durable job unique on tenant/source/digest; claim locks row and creates a random
   opaque fencing token/expiration/attempt. Authorize only that exact tenant/source/
   digest; never accept arbitrary org/object IDs from worker or caller context.
3. Read only immutable quarantine bytes matching the lease. At **each atomic store
   transition**, recheck token/expiry, source/batch review state, organization/module,
   submitting membership/current permission and job binding. A separate precheck
   alone is vulnerable to revocation races; orchestration checkpoints do not replace
   transactionally checked CAS. Approved sources cannot be rewritten/re-extracted.
4. Release only after actual clean scanner evidence and complete parser validation.
   Write a clean private object first with digest verification; finalize metadata via
   CAS only if both succeed. Storage and SQL are not one transaction: failed CAS must
   leave an unreadable orphan, never mark absent/unvalidated bytes clean. Read policies
   must depend on the finalized metadata. Reconcile/clean orphans with retention/legal
   hold policy. Failure/retry cannot overwrite another lease's clean/approved result.
5. Save neutral extraction schema/provider model/evidence hashes atomically with
   current token/state. Replayed complete requests return existing identical result;
   conflicting results reject. Third-failure/dead letter remains non-approved with
   visible generic error; internal audited manual retry must create a new lease.
6. Audit source/transition/actor/hash/model versions without supplier content, tokens,
   card data or payroll. Define operational alerting, queue lag, scan timeout, rejected
   file, stale lease, orphan and dead-letter metrics; approved internal recipients only.

## Sandbox and external configuration required

Approve a separate worker deployment with non-root user, read-only filesystem,
private ephemeral scratch, no shell/exec/tools available to document content,
CPU/memory/process/disk limits and enforced wall-clock deadline. Start with 1 job
per worker, 256 MiB memory and 90-second hard kill; measure PDF/image corpus under
those limits before approving production settings. Node timeouts alone cannot
interrupt a blocked native parser. No host mounts, metadata endpoints or unrestricted
network. Allow egress only to the exact approved storage/control/scanner/AI endpoints;
DNS/TLS/SSRF controls must be enforced outside document data. Strip metadata from
normalized image copies sent to AI; preserve original private source evidence.

Required secret-manager entries are scanner URL/token, engine allowlist and signature
freshness policy; control-store workload identity/lease capability; extraction HTTPS
URL/token/model; isolated Storage identity; approved region/retention/data-use policy.
These are worker-only, never VITE_/browser or request-body values. Do not add provider
credentials to the existing 503 function expecting activation. Validate TLS modern
ciphers, token rotation, redirect refusal, 401/403/429/5xx timeouts and spend limits.
A configurable endpoint is operator-controlled; model output cannot select one.

The scanner must independently attest file digest, trusted engine/signature version
and freshness over authenticated transport. Obtain vendor/engine suitability review,
update/signature health monitoring and legal permission for the test corpus. Test
approved benign/malicious standards only in isolated scanning infrastructure; never
upload actual customer documents or pretend synthetic clean verdicts are real scans.

## Acceptance and activation decision

- [ ] Explicit isolated target, deployment, migrations and provider test-call approval.
- [ ] Implement durable lease/control store and authenticated bounded ingestion.
- [ ] Prove worker isolation/resource/egress limits; adversarial image/PDF/CSV corpus.
- [ ] Prove actual scanner clean/infected/unknown/outage/stale/mismatched evidence.
- [ ] Verify real Storage HTTP, current permission revocation during scan/extraction,
      expiry, concurrent claims/replays, CAS/orphan recovery and source immutability.
- [ ] Benchmark actual extraction exactness/source fidelity/uncertainty and costs;
      independently reconcile totals; require staff review, never automatic issuance.
- [ ] Review retention/purge/legal holds, secrets/log redaction, backup/recovery and
      independent security/advisor evidence. Complete three-company connected tests.
- [ ] Obtain explicit activation approval tied to commit/environment/evidence; replace
      the 503 handler only in a reviewed change. Keep all live financial, messaging,
      payroll execution and production/outside access gates closed.

Until every gate passes, live extraction is **UNVERIFIED AND UNAVAILABLE**. This
phase completes adapters/orchestration/verification contracts, not hosted activation.

## October16 local runtime-client continuation

The byte gateway CLIENT, image normalization and stronger pre-AI checkpoints now
exist and have synthetic adapter-to-worker tests. The independent workload byte
SERVICE, isolated deployment, approved scanner/AI and real Storage acceptance remain
unverified/unprovisioned; do not mark activation checkboxes from these fixtures.
The original nine migrations were previously applied under separate approval; no
new hosted action or worker grant was made here. Historical unapplied-schema wording
above describes earlier checkpoints. See RELEASE_PROVIDER_FOUNDATION.md.
