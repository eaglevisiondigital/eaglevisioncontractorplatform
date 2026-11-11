# Disposable AWS mechanics package — offline only

Baseline: PR349 `6d80235110f87a2e24b7f988bdf0d238b36c8f58`.
An isolated AWS SDK v3 transport is included but unwired. No credentials,
provisioning command, operational adapter or automatic execution is included. D1–D3 unchanged; A01–A12 NOT RUN. Release1.0 NOT READY / NOT AUTHORIZED.

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

`HASHES.json` binds a selected 15-file source inventory, the complete executable
bundle, policies and synthetic manifest. Verify both inventory and bundle hashes.
`TEMPLATE_HASHES.json` preserves PR350 historical hashes unchanged.
`SDK_TEMPLATE_HASHES.json` preserves PR351 hashes unchanged.
`OHIO_TEMPLATE_HASHES.json` records this Ohio-only unbound package. Recompile and compare
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
requests, 10MiB per service, 64KiB evidence bodies and bounded response envelopes.
The payload/envelope charge is canonical input bytes + maximum response body +512;
it is not complete HTTP/TLS wire-byte accounting or a hard AWS spending cap.
All orchestration entrypoints share two durable operation leases. SDK attempts
also share two SQLite wire slots across instances/processes, bound to the original
request hash, service, phase, mutation flag and exact charge. Tickets dispatch once. A permanent unique marker on the same calls table also
forbids an identical mutation plan under any replacement ticket, response budget
or reopened SDK instance. This survives acknowledged success as well as UNKNOWN;
AWS idempotent acknowledgments can never authorize resuming the held protocol.
Current ticket/quarantine/authority is rechecked immediately before wire and after
response; a late journal acknowledgment is UNKNOWN. Lost pending calls quarantine
on restart; unknown in-flight slots stay occupied until their actual transport
settles. No reset, implicit migration, automatic retry or replacement identity.

The active runner and DynamoDB data authority expire within the original two-hour
window. The original read/retention cleanup permissions retain their distinct
24-hour table /48-hour S3 deadlines: cleanup cannot renew active claim authority.
Requests, bytes and slots stay cumulative across those phases. Each SDK call has
a 30-second deadline capped by its phase and explicit credential expiry, plus abort
and HTTPS handler destruction. Timeout/cancellation is never evidence of noncommit;
late success cannot clear quarantine or record a known acknowledgment.

`SdkExperimentTransport` requires explicit temporary credential values for each
role, current-authority callbacks and an explicit reviewed wire factory. It never
loads credentials, reads profiles or invokes STS. Supplied test wiring cannot fall
back to real HTTPS. `createAwsHttpsHandler` constructs the fixed-host HTTPS handler
but does not call it; it must not be wired for cloud execution before approval.
Credentials and options are snapshotted; fresh mutable SDK-only credential copies
avoid SDK internal annotation changing the retained snapshot. All tests use clearly
fictional keys and in-memory HTTP handlers, with HTTP/HTTPS/fetch tripwires.

Pinned SDK v3 clients serialize/sign the original finite plans. TransactWrite uses
a deterministic token from the exact plan hash, preventing SDK-generated replacement
identity; permanent local mutation markers forbid using idempotent success as replay
authority (AWS documents a ten-minute transaction-token window); the exact transaction body is rechecked before wire. Automatic attempts
are1; a second wire attempt and every redirect are independently rejected. Endpoints
are fixed us-east-2 HTTPS with certificate validation/TLS1.2 minimum, no S3 region
redirects, ARN/accelerate/FIPS/dualstack or default credential fallback. No account,
role, provisioning, upload-copy or retention-bypass commands exist in the shim.
S3 normalization checks raw/decoded bounds, SHA256, exact version, encryption,
Date values and explicit named provider absence. SDK package/lock and complete
bundle hashes are part of the new offline package; verify both source and bundle.

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

AWS token semantics reference: https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactWriteItems.html . No provider behavior was exercised here.

## Ohio-only revision — November 11, 2026

Owner preflight reports the existing Free-plan project restricted to Ohio and zero
DynamoDB tables. This is retained Owner evidence, not an account/API inspection.
`EXPERIMENT_REGION` fixes us-east-2 for DynamoDB ARNs, SDK endpoints and SigV4.
Every identity Allow also requires `aws:RequestedRegion=us-east-2`; existing leading
keys, enclosing-operation, expiry, original conditions and one-use markers stay.
S3 bucket creation separately requires `s3:LocationConstraint=us-east-2` and an
explicit CreateBucketConfiguration. That condition is not applied to unrelated
bucket-configuration operations. Preflight requires exact Ohio location; empty/null
Virginia and foreign locations deny. This does not enable cross-region operation.

[DynamoDB endpoints](https://docs.aws.amazon.com/general/latest/gr/ddb.html) and
[S3 endpoints/SigV4](https://docs.aws.amazon.com/general/latest/gr/s3.html) include
Ohio. Regional availability does not prove this account's Free-plan eligibility,
IAM authority or service acceptance. [Transaction IAM](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html)
still uses underlying item permissions plus LeadingKeys/EnclosingOperation.
[S3 creation](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CreateBucket.html)
requires the Ohio location and Object-Lock/versioning permissions. Object Lock is
[available across AWS regions](https://aws.amazon.com/about-aws/whats-new/2018/11/s3-object-lock/)
and [requires versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html).
Keep Governance1day, per-version retention, conditional/checksum uploads and no
bypass. Free-plan compatibility with these exact settings remains unverified;
no plan upgrade, paid activation or feature relaxation is authorized.

Public Ohio price-list documents checked without credentials or resource APIs:
[DynamoDB](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonDynamoDB/current/us-east-2/index.json)
(published2026-11-05T16:40:16Z), [S3](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/us-east-2/index.json)
(published2026-11-09T15:43:10Z). Their public host is not an experiment endpoint.
USD paid-tier rates before credits/tax: RCU-hour0.00013, WCU-hour0.00065;
DynamoDB Standard storage0.25/GB-month; S3 Standard first50TiB0.023/GB-month,
Tier1requests0.005/1000 and Tier2requests0.0004/1000. No account credit/free allowance
is presumed. Existing30RCU/10WCU costs0.0104/hour:0.0208 for2h,0.2496 if retained24h.
Charging all2000S3 calls atTier1 adds0.01. Conservative1GB in each store through its
24h/48h cleanup bound adds about0.0099 using30-day months: about0.27 total before
transfer, tax and separately approved bootstrap activity. Actual payloads are capped
far below1GB. This is a bounded-use estimate, NOT a maximum bill or execution permit;
missed cleanup continues capacity/storage charges. Reconfirm pricing, Free-plan
constraints, private account/principals/window, exact Ohio package hashes, cost
ceiling and cleanup owner before separate provisioning/credential/test approval.
Two-hour active window,24bindings,two workers,cumulative request/payload limits,
independent custody gaps,D1–D3/A01–A12 and every original STOP remain unchanged.
