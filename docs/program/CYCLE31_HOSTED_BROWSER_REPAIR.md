# Cycle 31 · exact hosted Ubuntu repair and matching browser diagnosis

Original Cycle30 source353923ce2c6677ae3d5026ac46cf214b2a549aa3 and diagnostic
PR221ebbb93afcfc46015a15a894ce0e8a001eca52f6e failed before APT/browser execution.
The actual read-only probe41882954437, sourcefe570644c0b3597259dd534a6df942802e08f809,
completed and retained standard runner source hash
4508181e0dd5578c33d1247db48ab4847910b25da85e0789c8e7b3140d1fb289.
It shows two leading comment-only paragraphs, followed by two correctly signed
noble stanzas whose URI is the fixed `mirror+file:/etc/apt/apt-mirrors.txt`.
The old parser treated a comment-only paragraph as an unsigned source; after that,
its direct-URL rule would also reject the observed mirror reference.

The correction ignores only empty/comment-only paragraphs and still rejects an
entirely empty source. It permits only that exact installed regular mirror-file
path and validates all three mirror targets and their distinct priorities against
the official GitHub Ubuntu image setup: Azure Ubuntu archive, Ubuntu archive and
Ubuntu security, priorities1/2/3. Missing, extra, duplicate, arbitrary/file/credential-
bearing URLs and trust options deny. Exact Ubuntu24.04, regular non-symlink source,
mirror/key files, fixed signing key, source fields, noble suites and components
remain required. No source/key configuration is rewritten and no signature/TLS
validation is disabled. The unchanged APT commands install only the nine observed
missing fonts; complete pinned Playwright dependency verification remains mandatory.

Local source tests pass31/31:20new hosted-shape/mirror denials plus11unchanged
original signature/URI/command tests. This proves the parser and command plan,
not an actual Linux installation or browser result. The completed probe is only
read-only environment evidence. Hosted run41884760108 at9ec375a8aadf1ef3b634fdf0e4147c781c437e84 installed the
nine signed fonts on candidate353, passed the complete dependency check and launched
Chromium. Both original owner cases then timed out at the unchanged30second budget
(final aria-current assertion542);0PASS/2FAIL with traces retained. Its original C27
member failed strict mirror-priority validation before APT, a separate unresolved
runner-shape observation without per-runner mirror-row evidence from that attempt.
The next diagnostic adds finite mirror classification before installation; no
mirror rule was relaxed. Installation success on one runner is not browser closure.

The new matrix independently checks out original C27 exact5f74b8ff5385560330cb94717c17338ed0c10f44
and Cycle30 exact353923ce2c6677ae3d5026ac46cf214b2a549aa3. Both bind the same original
test/config/lock hashes, Node24.22.2, Ubuntu24.04, Chromium from the pinned lock,
two workers, zero retries and original30second assertions. Failure does not stop
the other matrix member. Unique artifacts retain each actual result and traces.
Trace-on adds observational overhead on both; it does not increase a test budget.
A collection guard rejects missing/extra/skipped/retried/changed-budget cases but
never converts an original failed test step into success. Historical397/2 and
hosted0/2timeouts remain failures. Reporter-process event-loop measurements do not
establish browser/worker causation. Matching hosted artifacts are required before
any current-source navigation closure; no sole-root-cause assumption is made.

Reference: [official runner APT setup](https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/configure-apt-sources.sh),
retrieved blob b3f5b2b180df8eb39fcbba034f616e03a69e775c;
[Ubuntu source format](https://manpages.ubuntu.com/manpages/noble/man5/sources.list.5.html).
The actual probe, not those references alone, proves this observed runner shape.

No application engine, schema, credential, hosted provider, financial, dispatch,
communication or recovery action. Original Foundation remains unchanged. Physical
recovery NOT RUN; Release1.0 NOT READY / NOT AUTHORIZED.

The CI draft also carries the exact five-file compatibility correction authored at
94a5da1f2cf4187acdd412cdefaec627d1dee463 (separate draft PR228), because the unchanged
Cycle30 application legitimately contains the reviewed owner component. This is a
source-validation dependency, not a browser assertion or budget change. The combined
local run passes53cases (20new source-shape,11retained signature/command,22legacy
source-compatibility) and the actual Cycle21 independent validator exits0.

The second matched run41887387379 at8b999336852c46afa1ef3a75c89b00391fd18df4
retains the exact signed source shape and all three reviewed mirror priorities for
both compared runners. Both installed fonts, passed full dependency verification
and launched Chromium. Both original C27 and Cycle30 produced0PASS/2timedOut with
the unchanged30second budget. This closes the original observed comment/mirror
installation gate on these runners and supplies Linux traces; it does not close
owner-navigation latency. The first run's different unrecorded mirror rejection
remains historical UNKNOWN input evidence, not an invented package error. No
manual retry of a successful browser check occurred.

The final follow-up selects only frozen Cycle31 candidate
1a677d67cb1f79246a7912ab7dc4ed3bacc81ccc. The completed two-source comparisons
above are preserved and are not repeated. It retains the same two original cases,
configuration/test/lock hashes,30second budgets,two workers,zero retries andtrace-on.
Its actual hosted outcome must be read separately; the native220read reduction
is not a claimed historical repair or sole cause.
