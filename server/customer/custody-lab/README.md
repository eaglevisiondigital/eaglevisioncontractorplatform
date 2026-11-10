# Offline external custody protocol laboratory

Unwired source-only prototype for the existing 4B broker. No AWS SDK, transport,
credentials, operational adapter, IAM/schema changes or canonical writer callback.
Every observation returns `writes_allowed:false`. D1–D3 and A01–A12 remain unchanged.

`protocol.ts` reuses the original CustomerRequestReference/status parser, consumer
backend/full-XID type and canonical hashing. It compiles disposable DynamoDB-shaped
transactions: current tenant fence condition plus absent-key claim/source puts;
then the same fence and exact claim/source conditions plus an immutable receipt
fingerprint. The source key follows original org/user/issued-version admission
uniqueness and excludes request ID, publication, epoch and revision, so changing
these cannot renew spent authority. No customer note or business record is stored.
Atomic reads compare the exact fence, claim, source and ACK in one snapshot.

The SQLite interpreter is exclusively in tests/fixtures. It serializes the SAME
plans with native transactions, append-only spent markers and separate mutable
synthetic fences. Worker threads exercise real local contention; reopened independent
connections retain spent markers after simulated consumer rollback/savepoints.
This is neither DynamoDB Local nor evidence of AWS durability or owner-proof custody.

## Future interaction points — not implemented or authorized

1. Preserve current genuine Auth/source checks and original registrar admission
   COMMIT. The registrar returns original principal/body/consumer binding; no client
   creates replacement command IDs. The issuer begins its existing separate claim.
2. After the original issuer claim returns its exact reference, BEFORE issuer
   COMMIT, conditionally spend the external marker bound to original actor/session,
   target, backend start/PID/full-XID, source and independently controlled epoch.
   Missing or ambiguous external ACK stops before issuer COMMIT/consumer mutation.
   An external spend remains consumed if the issuer/consumer subsequently rolls back.
3. Only a future approved composition could proceed through issuer COMMIT and the
   original atomic canonical-request/receipt COMMIT. Original SQL must still perform
   current authorization, source and lock-order checks after waits and at its required
   linearization point. An external read cannot atomically authorize a later database
   commit: this cross-service revocation/fencing integration remains unresolved.
4. After the canonical COMMIT, verify the original exact receipt with current Auth,
   conditionally append its fingerprint to independent custody, observe the exact
   external ACK and recheck current authorization before any success ACK. This
   prototype's ACK_RECORDED is an offline marker, not genuine durable-ACK acceptance.
5. Lost ACK, mismatch, unavailable fence/custody, stale epoch/revision, denied current
   identity or conflicting receipt quarantines this attempt. Reads never reset it,
   even when the exact original receipt matches. Absence never permits replay/new ID.
   All real database/raw/admin/restore writers must independently enforce target-wide
   quarantine; this lab does NOT install or prove that global mechanism.

The pre-commit ambiguity limit is reproduced explicitly: when a write throws BEFORE
any external marker commits, only the original attempt object retains UNKNOWN.
A fresh object can record the otherwise absent marker (still writes_allowed:false).
This is NOT durable pre-dispatch uncertainty custody or permission to retry. Original
registrar custody, restart/restore fencing and target-wide quarantine must prevent
fresh-instance continuation before any future canonical writer can be bound here.

## AWS and administrative acceptance still missing

AWS documents atomic same-account/same-Region transactions, snapshot reads and a
10-minute ClientRequestToken window. The prototype relies on permanent markers,
not token expiry, retries, TTL, streams or backup propagation. No mutation retry is
implemented; a future SDK must disable automatic retries for these one-use calls.
See [AWS API](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactWriteItems.html)
and [transaction semantics](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html).
Actual AWS conditions, conflicts, durable ACKs, throttling, failure/recovery behavior
and SDK configuration remain NOT TESTED. No multi-Region acceptance is claimed.

D1 still needs actual independent fence/acceptance custodians and complete installed
writer/bypass inventory. D2/D3 must accept genuine Auth/MFA, transaction/fence
linearization, custody/receipt semantics, matched recovery and current revocation.
A second account/computer under the same unrestricted administrator is not independent
custody. Evidence must show the DB/restore operator cannot change/delete/restore the
sole spent authority, keys, fence epoch or its protections, with independently reviewed
break-glass and recovery controls. Rolling back this fixture itself defeats its model;
no independent administrative or rollback-resistant AWS protection is established.

Next separately approvable action: review this exact offline protocol and independent
custodian/control-boundary proposal under D1–D3. Any AWS fixture provisioning, IAM,
credentials, SDK transport or Supabase hook/SQL requires its own specific authorization.
No recovery attempt or existing private folder was touched. Release1.0 NOT READY /
NOT AUTHORIZED.
