# Cycle 22 source and result verification

`scripts/check-cycle22.mjs` extends the unchanged Cycle21 manifest verifier and
its protected-file chain. It retains all 473 earlier author paths, 128 protected
files and five approved design locks/thirteen bindings. It checks the exact five
Cycle22 author branches, direct parent, published heads, draft PRs, finite paths,
Git blob identities and SHA-256 values. Recomputing a hash over changed working
bytes cannot substitute for the published author bytes.

Exported manifest validation can describe PENDING source preparation. The CLI
always requires the exact separately published independent two-file review;
PENDING never passes acceptance. Independent commit and case-count pins are set
only from the actual reviewer delivery, not from arbitrary manifest claims.

The application collector requires all five author suites (183 cases), the
source-navigation suite (nine cases), the actual validation suite and the pinned
independent suite. It checks every reported assertion, file, unique full test
name, duration and failure status. Reduced positive counts, missing/extra files,
duplicate names, skipped/todo/failed cases and inconsistent rollups are rejected.
Generic synthetic report fixtures test the validator; they are never application
or independent integration PASS evidence.

`scripts/collect-cycle22-results.mjs` hashes original JSON report bytes and keeps
Playwright collection separate from execution. The separately owned browser
collector validates exact DEV27/OFF3 selections and actual single-attempt passes
across three brands and three layouts, plus source-bound screenshot evidence.
Complete acceptance requires both actual browser reports, collection reports and
the exact capture inventory. Collection cannot count as a browser PASS.

The dedicated workflow uses Node24, full Git history for published source checks,
pinned npm dependencies, strict types, features, application tests, build and
isolated local Chromium browsers. It triggers through ordinary push/PR events;
it does not restart successful historical workflows or repeat PostgreSQL/recovery
baselines. Reports and screenshots upload even on failure. No hosted mutation,
credential retrieval, dispatch, messaging, payment, deployment or merge exists.

All output remains local/CI evidence only. Visual approval and physical-device
acceptance remain separate. Release 1.0 remains NOT READY / NOT AUTHORIZED.

Local tooling validation: 58/58 uniquely named cases passed. Actual Playwright
collection confirmed DEV27/OFF3 with the owned configs; collection is not browser
execution. The separately published independent review is pinned to commit
`b8e0cade3ae7de9773ce11cc0ab2cbae5274cd69`, with 50 actual independent cases.
Complete application acceptance requires all 300 source-fixed assertions across
the eight current suites. Strict types, scoped lint and owned-file formatting are
checked separately; no GitHub CI PASS is inferred from local results.

The final complete collector also requires the actual nine-journey keyboard report
through its finite source-bound validator. Six malformed-report mutations were
rejected after the actual9/9 run. This supplements the unchanged300 application
cases and27DEV/3OFF browser inventory; it does not relabel collection as execution.
