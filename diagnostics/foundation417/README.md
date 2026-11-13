# Exact417 property-report diagnostic

Explicitly invoked local profiler for two exact synthetic interfaces on immutable
#417 `394d7fc1bbc6d6a27440e881bc3e9bf3d76befa6`. It archives that source, adds only
one diagnostic fixture in the disposable copy, retains the original30-second
budget and executes one selected worker. It does not join default application
collection or run databases/providers. New default tests check only the bounded
selector and profile accounting; they do not repeat these product scenarios.

Run `node diagnostics/foundation417/run.mjs c25-concurrent` or `c28-sibling`.
The instrumented Vitest subprocess has a separate45-second outer wall limit
with forced termination, containing the unchanged30-second test budget. It adds no
retry. Recorded successful profiles preceded this wrapper-only containment change;
the original case/runtime path is unchanged and was not repeated for that edit.

Output contains timings, counts, normalized function labels and public source
hashes, never repository/customer rows, environment or raw profiles. Temporary
sources/profiles are removed; current source files are checked before and after.
Only the two literal scenarios are accepted. Children receive PATH, C locale and
disabled Git configuration plus explicit local source metadata and output paths.

Measured on local Node24.20.0, under unchanged budgets:

| Scenario   | Phase                       |     Wall time | Exported captures / checks |
| ---------- | --------------------------- | ------------: | -------------------------: |
| C25 brand2 | Initial source preparation  |          35ms |                      0 / 0 |
| C25 brand2 | Read request evidence       |        4089ms |                  150 / 707 |
| C25 brand2 | Two concurrent report reads |        7644ms |                 414 / 1350 |
| C28 brand0 | Original / sibling evidence | 3525 / 3723ms |             150 / 707 each |
| C28 brand0 | Reject sibling report       |        1151ms |                  112 / 196 |
| C28 brand0 | Read original report        |        3342ms |                  207 / 675 |

C25 observed634 exported captures and2191 checks; C28 observed759 and2545.
Each delegates unchanged to the original native capture/check, so these are lower
bounds of2825 and3304 fresh full snapshots. Intra-module calls are not counted.
C25 sampled12.688s: snapshot11.339s inclusive, dataSignature8.413s inclusive,
structuredClone3.225s inclusive. C28 sampled13.346s: snapshot11.773s inclusive,
dataSignature8.250s inclusive. Inclusive times overlap. The profiler uses the
[DevTools sampling protocol](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/);
these are sampled intervals, not exact CPU accounting or additive costs.

The unchanged original C25 case separately passed in12.289s. Hosted #417 app4
still failed C25 brand2 at32.432s and C28 brands0/1 at30.358/30.971s. Local success
and reader fan-out identify dominant local work; they do not establish Ubuntu
contention, a complete hosted root cause, or closure of the failed runs. One prior
instrumented case passed its assertions but its sample summary was rejected and
raw temporary profile discarded. That attempt remains unaccepted, with its exact
bad interval unavailable; later valid profiles do not overwrite that limitation.

No new unprotected runtime correction was established. Existing signature proposal
#387, source author #389 and separate finite admissions #391 remain HELD and are
not applied here. Their descriptor optimization targets the measured serialization
cost. Any reduction in the observed nested guard count needs a new independently
reviewed source contract preserving tenant/source freshness, post-await checks and
UNKNOWN custody; this diagnostic removes none. No budget, assertion, old source
hash or admission constant is changed. Release1.0 remains NOT READY / NOT AUTHORIZED.

Exact417 Foundation run43485601741 completed CANCELLED at19:31:29UTC. Verify
job132093086192 was cancelled inside application Vitest, before a terminal summary
or downstream build/staging/browser.158 completed PASS suite lines are partial
evidence only. Native740PASS/one original skip and supplement14timeouts/three
dependent assertions plus579browser passes remain separate evidence.
