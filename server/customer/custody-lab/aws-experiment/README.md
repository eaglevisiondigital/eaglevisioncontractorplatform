# Disposable AWS mechanics package — offline only

Baseline: PR349 `6d80235110f87a2e24b7f988bdf0d238b36c8f58`.
No cloud transport, credentials, provisioning command or operational adapter is
included. D1–D3 unchanged; A01–A12 NOT RUN. Release1.0 NOT READY / NOT AUTHORIZED.

## Reproduce and review

Use pinned Node/dependencies. Create an owned 0700 directory outside the repository:

```sh
node scripts/prepare-aws-custody-package.mjs --template-output /private/tmp/PRIVATE_OUTPUT
npx vitest run tests/workflows/aws-experiment-package.test.ts
```

The compiler exclusively writes 0600 policy/trust/resource/manifest/bundle/hash
files. Public output contains placeholders and is NOT ATTACHABLE. `prepare()` also
accepts a private 0600 bindings file (account, experiment UUID, exact UTC window,
three existing same-account IAM user principals); never commit that file or output.
Existing output cannot be overwritten. Private binding, bootstrap, credential
handoff, source review and execution need separate exact-scope authorization.
No account identifier has been obtained for this package.

`HASHES.json` binds a selected 13-file source inventory, the complete executable
bundle, policies and synthetic manifest. Verify both inventory and bundle hashes.
`TEMPLATE_HASHES.json` records the proposed unbound package. Recompile and compare
all hashes before review. Bound policies require a new private hash approval.

The administrator configures only the exact new table/bucket; it cannot create
roles, attach policies or pass roles. Role bootstrap/teardown is a separate owner
action. Trust requires exact IAM user, MFA, experiment ExternalId and absolute
window; the distinct reviewer principal is a mechanics boundary, not proof of an
independent person. SSO/federated trust requires separate review.

## Owner findings addressed

1. Runner DynamoDB permissions require non-null `LeadingKeys`, the permitted
   synthetic organization/user patterns and `EnclosingOperation` for transactional
   reads/writes. Fence writes and administrative actions are excluded. The runner
   accepts only byte-equivalent original conditional plans for 24 manifest cases.
   The negative suite rejects missing/changed absent-only expressions. IAM cannot
   force transaction contents, exact finite manifest membership or the conditions;
   pattern admission is deliberately narrower than a generic tenant permission but
   is not an exact-key-list guarantee. Offline policy evaluation is a finite template
   truth table, NOT AWS IAM simulation or real provider acceptance.

2. Evidence uses AES256, SHA256 checksum, `If-None-Match: *`, exact returned version
   and separately verified legal hold/retention/default lock. The bucket policy denies
   missing/altered conditional headers and retention bypass. Verify version body,
   checksum, labels and actual retention separately; Object Lock alone permits new
   versions. S3 never grants claim authority. Failed/ambiguous evidence writes quarantine
   mutation; they never permit replay. Every evidence object labels independence,
   Auth/revocation and operational acceptance unverified/not-run.

3. Cleanup lists every version/delete marker in the exact bucket, aborts foreign
   keys, rechecks each actual retention/legal hold and conditionally proceeds only
   from a freshly reviewed plan hash. Retained versions prevent deletion. The latest
   actual expiry determines readiness, including delayed uploads. No bypass permission
   exists. Expiry beyond the 48-hour S3 cleanup window requires new authorization;
   no automatic extension. Table retirement requires verified archived evidence and
   has a separate 24-hour deadline. Deletion acknowledgments are not cleanup PASS:
   explicit provider absence of table AND bucket is required, with IAM teardown still
   outstanding. Protected versions, markers, resources or failed cleanup remain an
   unresolved result with possible continuing charges.

4. This is an AWS MECHANICS test. Owner-controlled accounts/roles, MFA and one-day
   Governance retention do not prove independent administration, privileged-override
   protection, independent fencing, coherent rollback/account-destruction protection,
   recovery/key custody, genuine production authentication/cross-service revocation
   or independent final acceptance. Administrator bucket-policy authority remains
   trusted. Those gaps require separately controlled custody and independent evidence.

## Limits and future transport gate

Private SQLite counters reserve before RPC: 10,000 DynamoDB requests, 2,000 S3
requests, 10MiB per service, 64KiB object bodies, bounded response envelopes and a
two-hour mutation admission window. Two durable **case-worker** leases protect
`run`; evidence/reviewer/cleanup orchestration must be serialized by the future
transport harness. Lost pending calls quarantine on restart; no reset/replay.
These cooperating-client limits are not AWS-wide spending, concurrency or wall-clock
termination guarantees. A stalled injected RPC can outlive its admission window;
IAM expiry does not cancel an admitted call. No live bounded-runtime claim is made.

Before cloud authorization, a reviewed, pinned SDK shim must enforce one attempt,
no redirects/retries/credential fallback, bounded streaming/checksum decoding,
Date normalization, exact named errors, cancellation/deadlines, global concurrency
and exclusive original journal use. `provider.ts` supplies bounded UTF8 and explicit
absence normalization, without making calls. It must preserve UNKNOWN on timeout;
no later callback may trigger a second mutation. No automatic runtime is bundled.

The provisioned table is 30 RCU/10 WCU, no indexes/TTL/replication/PITR, default
AWS-owned encryption; bucket uses SSE-S3, versioning, Object Lock Governance1day,
all public-access blocks and BucketOwnerEnforced. No KMS/IAM self-administration.
Service pricing, regional availability, policy acceptance, actual conditional
semantics and object-lock deletion denial remain AWS NOT TESTED. Request/byte limits
cannot cap lingering storage/capacity charges; approve a region-specific cost ceiling
and monitored cleanup separately. Do not describe a budget alert as a hard cap.

## Reviewer sequence and owner approval boundary

Offline: compare exact source/hash manifest; inspect all three policies/trusts;
run the focused negative suite; review original protocol reuse and unchanged SQL.
Future read-only reviewer: verify exact account/resource/table identity, MFA trust,
policy and tags, lock/version/encryption/public-access configuration; inspect every
original claim/ACK and evidence version/checksum/retention; reconcile UNKNOWN only
by exact original identity. Run refusal cases with synthetic data only. Never infer
success from mocked responses or local persistence.

Required separate approval must bind private account/region/principals/UUID/window,
exact source and bound-policy hashes, provisioning/role bootstrap, reviewed live
transport, synthetic cases, maximum costs, monitoring/stop owner, actual retention
and cleanup/teardown responsibility. No Supabase, operational writer, protected SQL,
customer data or recovery action is covered by this proposed experiment.
