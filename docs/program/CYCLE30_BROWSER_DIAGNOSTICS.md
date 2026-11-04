# Cycle 30 · bounded browser reliability diagnosis

Original C27 source is `5f74b8ff5385560330cb94717c17338ed0c10f44`.
The four original shards collected399 cases:397 passed and two desktop/tablet
roofing C21 cases timed out. The exact-two C29 follow-up also timed out at the
final owner-navigation click. The original30-second budgets, assertions,
configuration and failures are preserved. A local same-source two-case pass
never closes the hosted failures.

The new observer uses Playwright's test-process step reporter. It records step
start/duration, test-process event-loop delay, exact source/config/test/lock
hashes, Node, OS and CPU/memory metadata. It installs no browser hooks, changes
no application state and adds no retries, timeout overrides or assertions. The
bounded diagnostic workflow checks out the original source separately from the
observer and runs only the two failed original cases with2workers/retries0.
Failure traces add diagnostic overhead; this is diagnostic evidence, not an
unobserved reproduction or a claim to have repaired historical CI.

The original follow-up artifact records Node24.22.2 and Playwright1.64.1 on
Linux; the diagnostic pins that Node patch and Ubuntu24.04. Original and local
versions must be compared using artifacts, not assumed equivalent. Step timing
alone cannot determine whether a click spent time on browser scheduling, React
rendering or source checks. Attribution remains explicitly UNRESOLVED until the
source and traces support a narrower conclusion.

Separately, Passport run41870216530 failed before tests: refreshing the unrelated
Microsoft Ubuntu APT feed returned403, then APT exited100. Its browser tests were
SKIPPED. The bounded Passport correction verifies all pinned Chromium system
packages using `playwright install-deps --dry-run chromium`, which exits nonzero
when packages are missing, then downloads the pinned browser without refreshing
APT repositories. Ubuntu24.04 is a supported Playwright Linux target. There is
no sudo, repository deletion, signature/TLS bypass, missing-package fallback or
change to the original Foundation workflow. A missing dependency remains a
visible infrastructure failure, not a test pass.

Three source-based observer tests pass locally. The original two-case diagnostic
and corrected Passport GitHub outcomes remain pending until actual current-head
artifacts are read. No successful check is manually restarted.

Sources: [Playwright dependency verification](https://playwright.dev/docs/test-cli),
[reporter step events](https://playwright.dev/docs/api/class-reporter),
[browser/OS requirements](https://playwright.dev/docs/browsers).

All application authorization, tenant, UNKNOWN/no-replay, protected artifacts and
release gates remain unchanged. Physical recovery NOT RUN. No operational
adapter/schema/credential/hosted action. Release1.0 NOT READY / NOT AUTHORIZED.
