# Cycle 6 exact-head Foundation investigation

Observed November 2, 2026. All PRs 38–45 remain draft and unmerged; their
implementation heads match CYCLE6_DELIVERY_INDEX.json and coordinator 7b83aff.

PR38 Foundation runs 41452241324 (PR) and 41452228940 (push), exact
7b83aff9810c4055bcdcd73fd2d20f6f53c3c893, were cancelled. GitHub's verify-job
annotation explicitly says the job exceeded 15m0s. Application checks passed
(3074 cases, 321 native-only skips); the independent PostgreSQL17 job passed.
The full browser suite had 297 cases and was still running when the job expired.
Dedicated Cycle6 integration 41452241527 and compatibility 41452241332 succeeded.
These results are preserved; cancellation is not a passing full browser result.

PR42's cancelled PR run 41448061158, exact
c0f5276431cba959d4814497a6ae948b40eedd7d, has the same explicit 15m0s annotation.
Its log records all 279 browser cases passed in 10.8 minutes; cleanup crossed the
whole-job deadline. Exact-head push run 41448053694 completed successfully, including
verify and PostgreSQL17. No rerun is needed for PR42, and none was requested.

The smallest corrective change increases only Foundation verify's finite whole-job
budget to 25 minutes. No test, assertion, permission, job, browser viewport or native
database validation is removed or relaxed. PostgreSQL17 keeps its existing timeout.
Normal automatic CI will validate the new commit; restarting the old cancelled job
would reuse its inadequate 15-minute configuration. No successful check was rerun
manually. PR39–41 and PR43–45 have exact-head Foundation success.

CI proof does not authorize deployment, protected migrations, genuine Auth, messages,
financial execution or release. Release 1.0 remains NOT READY / NOT AUTHORIZED.
