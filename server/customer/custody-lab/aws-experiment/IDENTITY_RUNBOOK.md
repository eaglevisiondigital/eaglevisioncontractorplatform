# Ohio identity bootstrap — conditional owner runbook

Status: OFFLINE PREPARATION ONLY. No credentials, AWS calls or identity changes
were made. Release 1.0 remains NOT READY / NOT AUTHORIZED.

## Confirmed account boundary

The owner confirmed **Projects / AWS Settings / Builder ID**. AWS documents that
IAM users in this new account experience support programmatic access, not console
sign-in. Consequently, `aws login` cannot be treated as the three exact IAM users
pinned by this package. There is no verified no-long-lived-key bootstrap under
this account model and the unchanged trusts. A programmatic IAM key has no expiry,
even if it is used for minutes. Do not create one under preparation authority.

A classic console IAM user can use `aws login` without a permanent access key,
but that is a different account/sign-in prerequisite. Federation, project sessions,
Roles Anywhere and replacing IAM users with roles require separately reviewed
identity/trust changes. Do not extract browser credentials or substitute root,
Builder ID, CloudShell or another principal for an approved user.

## Owner decision before any execution

Either approve a bounded bootstrap-key exception, or authorize an offline review
of an alternative source identity. The exception must privately bind the account,
experiment UUID, three existing/new programmatic IAM user ARNs, exact three role
ARNs, per-user MFA devices, time windows, maximum STS issuances, credential custody,
revocation and teardown owner. This does not authorize experiment resources,
DynamoDB/S3 calls, operational integration or acceptance.

## Conditional bootstrap (manual; not executed)

1. An authorized external administrator creates/reuses exactly the three bound
   programmatic-only users and enrolls each user's TOTP MFA device. STS needs the
   caller's device serial and current six-digit code; a passkey alone does not
   supply `TokenCode`. Source users receive no experiment data or IAM-admin access.
2. The administrator installs only the separately approved, privately bound three
   role permission/trust policies from this package. Retain MFA=true, exact
   ExternalId, caller ARN and existing phase deadlines. Do not use Switch Role:
   it cannot supply ExternalId. Preserve role maximum session duration 3600s;
   request **900s** per STS session. No invented duration IAM condition is implied.
3. Direct same-account IAM-user Principal trust can itself grant AssumeRole;
   an additional identity-based Allow is not inherently required. If the approved
   account requires an explicit user policy, its only Allow is `sts:AssumeRole`
   on that user's exact experiment role. SCPs, boundaries and explicit denies
   still apply. A narrow Allow does not prohibit unrelated resource-based grants;
   inspect/remove unrelated grants or separately approve an exact explicit deny
   boundary. No wildcard roles, PassRole or self-administration.
4. Only with the key exception, create at most one bootstrap access key per bound
   user (three total). Keep keys inactive between approved issuance windows and
   delete them after final cleanup. Reactivation/cleanup windows require their own
   approved scope. Neither key inactivation nor deletion revokes issued STS sessions.

## Temporary credential issuance and handoff

Use an owned directory outside Git, sync and backups on an encrypted local volume:
0700 directory, 0600 files, `umask 077`, exclusive fresh output files, no terminal
recording, shell tracing, debug logs or secrets in chat/argv. Use a trusted private
editor or approved secret manager. Do not use environment/profile credential
fallback in the SDK. Do not commit private bindings or credential files.

An approved local AWS CLI installation may run the following **only after exact
execution approval**. Variables are local paths/labels; source-credentials contains
only the selected user's static bootstrap key. Config contains no credential_process,
SSO, role chaining or alternate source. Create request.json privately:

```json
{
  "RoleArn": "<exact approved role ARN>",
  "RoleSessionName": "<approved experiment role session label>",
  "DurationSeconds": 900,
  "ExternalId": "<exact experiment UUID>",
  "SerialNumber": "<that caller user's TOTP MFA device serial>",
  "TokenCode": "<current code, never in command arguments>"
}
```

```sh
# Proposed only. Fresh filenames required; noclobber prevents overwriting evidence.
umask 077
set -C
env -i PATH="$PATH" \
  AWS_CONFIG_FILE="$TASK_PRIVATE/config" \
  AWS_SHARED_CREDENTIALS_FILE="$TASK_PRIVATE/source-credentials" \
  AWS_EC2_METADATA_DISABLED=true AWS_MAX_ATTEMPTS=1 AWS_RETRY_MODE=standard AWS_PAGER="" \
  "$AWS_CLI_BIN" sts assume-role \
  --profile "$SOURCE_PROFILE" --region us-east-2 \
  --endpoint-url https://sts.us-east-2.amazonaws.com \
  --cli-input-json "file://$TASK_PRIVATE/request.json" \
  --output json --no-cli-pager \
  > "$TASK_PRIVATE/fresh-role-sts.json" 2> "$TASK_PRIVATE/fresh-error.private"
```

No automatic retry/renewal. Failure or ambiguous issuance stops that issuance;
no alternate identity or broadened trust fallback. STS success alone proves neither
resource permissions nor independent custody. Validate response locally without
printing secrets: exact assumed role ARN/session, expected request provenance,
expiry within requested 900s (bounded clock allowance), and SDK credential shape.
Do not add a GetCallerIdentity probe under preparation authority.

Map response values in memory to `TemporaryCredentials`: AccessKeyId,
SecretAccessKey, SessionToken, and `new Date(Expiration)`. Supply only the roles
needed for the current phase. Every supplied credential must be live and at most
one hour from expiry; a missing requested role fails closed before network dispatch.
No credential loader or STS client has been added to Propel.

The runner expires at two hours. Table cleanup remains bounded by its original
24-hour deadline, and S3 cleanup by its original 48-hour deadline and every actual
version retention timestamp. Later cleanup uses fresh admin/reviewer credentials,
never a renewed runner. Session expiry does not reset counters, journals, UNKNOWN
holds, original claims, phase deadlines or consumed attempts. IAM trust expiry can
block new sessions without revoking existing ones; original resource-policy/SDK
deadlines remain required. The 900s request is not a new IAM-enforced maximum.

## Revocation and cleanup

Stop issuance and inactivate bootstrap keys immediately after approved handoff.
Wait for each STS session's actual expiry, or separately approve revoking sessions
on the exact experiment roles. AWS role revocation adds a deny policy and has
propagation delay; it affects other sessions of that role too. Key deletion,
logout and local file deletion alone do not revoke STS credentials.

After retention-aware resource cleanup and resolution of outstanding evidence,
remove only the experiment's keys, policies, MFA registrations, users and roles
under separate cleanup authority. Remove attached groups/policies before deleting
users; do not delete shared identities. Report any remaining resources, retained
versions or UNKNOWN records. Preserve original custody/evidence journals; securely
handle disposable secret files without claiming guaranteed SSD erasure.

## Acceptance limits and next authorization

Three users/roles controlled by one owner do not establish independent administration,
one-use fencing, rollback resistance, recovery/key custody or final acceptance.
D1–D3 remain separate; A01–A12 remain NOT RUN. Real AWS behavior and Free-plan
eligibility are untested. This runbook grants no operational authority.

Suggested owner decision: “I authorize only the privately identified Ohio identity
bootstrap: three exact programmatic users, MFA devices and reviewed role trusts;
at most three temporary-use IAM access keys, inactive outside separately bounded
issuance windows; explicitly enumerated 900-second STS sessions; private local
handoff and exact revocation/teardown. No experiment resource provisioning or
DynamoDB/S3 execution is authorized by this decision.” Fill in the private identities,
windows and issuance counts before approval. Alternatively, decline keys and approve
only offline alternative-trust review.

Sources: [AWS new account model](https://docs.aws.amazon.com/accounts/latest/reference/sign-up-for-aws.html),
[IAM user restrictions](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html),
[CLI sign-in](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html),
[AssumeRole](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html),
[MFA API access](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_configure-api-require.html),
[role session revocation](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_revoke-sessions.html).
