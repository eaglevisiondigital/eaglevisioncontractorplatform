# Maintenance review fact-reference custody

Parent: `8c0286e0e70133c8e0a0e0e478e89a3a6b8ddf55`.

The existing `planCancellationFacts` reader validated a caller-owned review
wrapper, then reread that wrapper while checking and projecting native maintenance
facts. A Proxy could revoke the actual original owner on its late `purpose` read,
after the native saved-source and consent checks, and still receive retained plan,
identity and recorded-channel facts. The original currentness guard independently
rejects the same review after that revocation.

The correction captures the original five own-data fields before the existing
currentness checks and projects solely those captured references. It retains the
same original view, saved snapshot, readiness desk and gate; the purpose remains
an explicit staff-review context. There is no cloned authority, new handle registry,
writer, export, store, engine, screen or navigation system. Original source,
membership, consent and exact plan/job/property/purpose checks remain mandatory.
No executable caller reread follows those checks in this reader.

## Evidence

- Initial new harness: **0 PASS / 3 FAIL** because the original native engine
  correctly refused to revoke its only active owner. This is a fixture failure,
  not product RED. Raw JSON SHA256:
  `fcb6e0c21d4a067dc6fbbaeb9c277c86a9e73b1ccdbb9e81c2a7d2d493d71e2c`.
- The fixture then retains a separate actual owner through the existing native
  operation. Unchanged-parent execution: **0 PASS / 3 FAIL / 0 skipped**. Each
  failure is the precise private-result assertion after successful revocation of
  the reviewed original owner. Raw JSON SHA256:
  `a7541508e6d60e174ca94b506cad4151f4fecabf705b143d40c662afbf5ed8d0`.
- Corrected original regression scope: **3 PASS / 0 FAIL / 0 skipped**, one case
  for each existing contractor brand. Raw JSON SHA256:
  `966cc717eea3d44e34040bdee02c821991b1840eed33bea91cd2d25e858d3be3`.
- Separate additional scope: **18 PASS / 0 FAIL / 3 filtered**, covering all three
  brands. Cases verify capture-time confirmation withdrawal, ordinary exact
  identities and row references, cross-tenant denial, no writes, stale native plan
  revisions and explicit fresh reads, recorded consent withdrawal, original
  UNKNOWN/no-replay custody and terminal CANCEL/REVOKE staff-review distinctions.
  Raw JSON SHA256:
  `054ceb42babfed43bab8ad6d72f68d03d4e45ece5422d5cbdb36b6558528522a`.

These are **21 distinct new cases across separate 3-case and 18-case executions**,
not a claimed single 21-PASS run. Tests use one worker, retry zero and the unchanged
original test/hook budgets. No old successful cohort, browser or CI check was
manually rerun. Local author-worktree evidence is not clean-commit hosted acceptance.

Scoped ESLint, strict TypeScript typecheck, three-file Prettier and whitespace
checks all exited zero. Independent source review remains separate from execution
evidence. Shared source admission and integration registers remain Main-owned.
No existing source pin, assertion, test budget or protected artifact is changed by
this package. No browser, visual, physical recovery, complete Foundation or genuine
authentication acceptance is claimed.

## Authority boundaries

Native plan and enrollment cancellation remain `UNSUPPORTED`. A terminal local
staff review is neither a cancelled maintenance plan nor revoked customer consent.
Recorded channel preference does not establish purpose-specific consent,
suppression, enrollment, renewal terms or consent-at-send authority. UNKNOWN never
permits retry, replacement, replay or inferred completion.

All incomplete and connected capabilities stay default-OFF. Approved designs,
original migrations, frozen P1/recovery artifacts, customer14/4B, MFA/Auth, NMI and
financial gates remain intact. No hosted mutation, schema, operational restoration,
payment, dispatch, message, deployment or merge is authorized.

**Release 1.0 remains NOT READY / NOT AUTHORIZED.**
