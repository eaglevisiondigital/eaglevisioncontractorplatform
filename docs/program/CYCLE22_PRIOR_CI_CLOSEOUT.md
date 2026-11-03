# Cycle 21 exact-head CI closeout

At `27cb44bb68521ee21a8e5c6e0b2f3116d33f367b`, both dedicated Cycle21 runs `41722159591` and `41722151341` passed. Reported Cycle11/13 failures and retrieved Cycle10/12/14/15/16/18 artifacts identify nine immediate stale `await prepareOperatingSources` assertions across eight retained suites. They did not prove a timeout or product runtime defect. Exact report hashes and failed cases are retained in the JSON companion.

Forward commits `2fecb89213647b567746c0413a9ba3e41ce748ae` and `36d805b5d8ca16f09697395c8a305b3e7d4318ef` require exactly one real awaited `prepareSources` call **and** its original `prepareOperatingSources` default. No original assertion was removed; no product source, timeout, workflow or protected artifact changed. Focused first validation passed52source+10native tests; remaining validation passed71source tests after reproducing allfive additional failures. New automatic checks remain distinct from original failures.

Original Main Foundation jobs were cancelled inside `npm run check`; the available Main annotations only say cancelled, so their cause remains undetermined. Feature#144's inspected cancellation explicitly exceeded45minutes in the same broad step; its separate PostgreSQL17 job succeeded. #145/#146 cancelled broad verification remains incomplete, with successful individual checks retained. No full Foundation pass or equivalent full coverage is inferred.

Historical Cycle18 browser15second click-timeout failures retain their original status and undetermined cause. The present Cycle18 static host-assertion artifact is a separate failure. No successful check was manually rerun; no validation budget or protected check was weakened. See the exact current-head CI snapshot for live pending/failure/success states.

Release1.0 remains NOT READY / NOT AUTHORIZED.

## Child draft CI-only forwarding

Eight retrieved child-draft artifacts reproduced the same proven inherited Cycle10/12
host assertion mismatch (immediate5–8ms failures). Each leaf branch received only
the five exact published shared test corrections from36d805b5, under a forward
commit whose parent is its original feature head. All25 feature blobs remain exact,
and1,611 shared comparison inputs match. The representative corrected suites passed
71/71; no assertion, timeout, workflow or product source changed.

The source manifest intentionally keeps the original author/source commit pins.
Current CI-only PR heads, exact five test paths/blobs, remote draft/base verification
and preserved failed-artifact hashes are in
[CYCLE22_CI_FORWARD_PATCH.json](CYCLE22_CI_FORWARD_PATCH.json). New automatic CI is
separate and pending. No original commit was rewritten; no manual check was rerun.

## Subsequent exact-head evidence

Foundation seed run41725369426 actually reported7,848PASS/36FAIL/321declared skips.
Five failures were the corrected preparer assertions;31 exact-source validator
cases lacked their required historical Git objects in the shallow checkout. The
frozen Foundation workflow remains byte-identical. Test-only global setup now
permits one anonymous fixed-public-repository history fetch only in the exact
GitHub Actions/repository/shallow context, with25second monotonic bounds, private
empty subprocess home/config/netrc isolation, no credential loader, no source
checkout or fallback and no retry.45 offline cases include actual local shallow, detached PR-merge, malformed
include and unsupported-layout fixtures. A name-only explicit-file config audit
from the isolated empty child directory precedes every checkout Git command. These
plus unchanged46 C21 and58 C22 validator cases passed149/149. Anonymous execution on GitHub remains pending new-head CI.

At36d805b5, Cycle13run41726480513 passed525 application cases, then failed nine
original browser cases because its page-wide checkbox locator matched eight later
explicit controls. Only the locator changed to the original exact confirmation
label; allnine original brand/layout cases now pass with unchanged assertions and
budgets. No confirmation or default-off control was removed.

Cycle18run41726480584 passed446 application cases, then reported21browserPASS/9FAIL;
Finance child run41731420081 passed the same446 and29browserPASS/1FAIL. The failure
was a15second original navigation click timeout. An unchanged local case passed,
but its CPU profile demonstrated repeated complete source admission in mounted
hidden panes:61.35of76.49sampled seconds had canonical snapshot ancestry. This
demonstrates redundant render cost, not an infinite callback loop or a proven
runner-only fault. The bounded render/visible-expiry correction and independent
delta review are recorded separately; all original failures remain retained.

The final render correction retains every original admission, source/member,
current-context, generation, callback and UNKNOWN control-flow byte. Stable memo
wrappers avoid hidden-pane rework; a presentation-only active flag is removed
before forwarding native props and rerenders visible expiry labels on return.
The pre-active memo fails the same clock test on a stale visible task; actions
were already denied. Final same-instance expiry cases pass3/3 brands and the
original affected navigation matrix passes9/9 across allbrands/layouts. No keys,
source snapshots, action deadlines, custody, assertions or15second limits changed.
Shared correction `1eff2018d43da47d06c0fcd8370562d404c52f95` and the separate13-case
independent CI delta review bind the final exact files. Current-head automatic CI
remains separate from local PASS; no historical failure is erased.

Final shared CI/render corrections are in
[CYCLE22_CI_RECONCILIATION_FORWARD.json](CYCLE22_CI_RECONCILIATION_FORWARD.json):
C21 currenthead9223fa14 and final featureCIheads are separate from immutable
author/source pins. Every draft remains unmerged; automatic current-head outcomes
are reported separately, never inferred from local tests or historical success.
