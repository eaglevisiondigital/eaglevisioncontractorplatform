# Cycle32 · read-only runner mirror diagnosis

PR237 exact `c900041cf999e6eda81a10d6361a6acad0d5ca88`, Passport run41911416205,
job126859652726 failed before APT or browser execution with `Reviewed Ubuntu mirror
and priority required`. The unchanged reviewed helper SHA256 is
`531b1f3b43e38975a456a8421fc7135991b89313e22e0f87daa5ecc673bf659f`.
The exact rejected mirror-file content was not logged and cannot be reconstructed
from a different runner. Its browser assertions remain NOT EXECUTED; the run remains
FAIL. This differs from the eight prior source-parser failures and does not show
an application defect or authorize relaxing source trust.

## Bounded observation

The separate diagnostic workflow samples three independent Ubuntu24.04 runners,
Node24.22.2, with five-minute job bounds. It runs only checkout, Node setup and the
read-only probe, then always uploads its redacted JSON. No APT, npm installation,
browser or application assertion runs in these three jobs. Their observations can
describe only those sampled runners, never the historical failed job's sole cause.

The probe reuses the hash-bound original Cycle31 source probe and its known safe
package vocabulary. Unknown source field names are also hashed; source values are
reprojected through that finite vocabulary. Raw child output/errors are not forwarded.
It imports the exact existing validator without changing its
allowlist, mirror priorities or commands. Mirror observations expose six finite
public official-target IDs, token counts and numeric priorities only for exact
`priority:[0-9]{1,3}` tokens. Priority0 or10 is observable and remains rejected by
the original validator. Unknown URLs, malformed priority tokens and every extra
token are SHA256-only; credential-bearing URLs are never emitted. Comment contents
are omitted. The projection is bounded to64KiB,64meaningful rows and16tokens per
row; excess yields only a file hash and finite bounds status. Probe errors yield a
finite unavailable status and hashed error, not raw subprocess output.
The two mirror-read hashes are compared so a changed file is not presented as one
consistent source-probe snapshot.

The existing Passport workflow adds only a read-only probe immediately before the
original font helper and one JSON path to its existing always-uploaded artifact.
This captures a future failure's own runner instead of inferring its configuration
from independent samples. Original Node configuration, ten-minute job limit,
installation steps, workers, browser budgets and assertions are unchanged. No
successful historical workflow is manually restarted.

## Acceptance and limits

Ten focused parser/source-compatibility cases cover six-target classification,
credential redaction, priority0/10 rejection, malformed/missing priorities, extra
token redaction, comments, bounds, retained helper acceptance/unknown-URI denial and
byte-exact original Passport workflow after removing only the two additive pieces.
All10 local parser/source-compatibility cases PASS, zero failures/skips. Strict
TypeScript, focused ESLint, Node syntax and five-file formatting checks PASS. No
application or browser assertions were rerun; no APT or source installation ran.
New hosted observations are NOT RUN until actual artifacts are inspected; a
successful probe job establishes observation only, never package-source acceptance.

No helper, allowlist, old test, configuration, assertion or timeout is weakened.
No operational, credential, schema, hosted business, financial, communication,
dispatch, recovery or release authority is added. All original protections remain.
Release1.0 remains NOT READY / NOT AUTHORIZED.
