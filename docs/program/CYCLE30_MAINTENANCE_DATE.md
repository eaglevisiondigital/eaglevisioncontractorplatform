# Cycle 30 · maintenance date pre-admission correction

Bounded parent: exact Cycle29 coordination
`b0faaa447e8e18cd78a00e5cfbfd6dc67eff3fd9`. Only the existing
`MaintenanceCancellationActions` component changes at runtime. The original plan,
consent, review, receipt and one-use custody owners are unchanged.

An ordinary cleared proposed staff-review date was still presented as preparable.
After Verify and Confirm, clicking Prepare set the UI's attempted hold before the
original canonical date validator rejected the empty date. Date/source/purpose
controls then stayed disabled even though exact native reconciliation correctly
returned `READY_FOR_REQUIREMENTS`: no original review had been admitted.

The component now uses the existing canonical `maintenanceDate` validator to mark
invalid dates, withhold Prepare, and check the date again before the original hold.
The date remains editable before admission. Correcting it clears previous
verification/confirmation; staff must explicitly verify and confirm again. Once
an actual attempt is admitted, original source/purpose/date and UNKNOWN holds
remain unchanged. No new date rules, planning engine, receipt or recovery path exist.

## Actual local evidence

- Eight new application cases: before the fix, five failures and three passes;
  after it, eight passes. Empty dates are covered across all three brands, alongside
  two canonical invalid-date cases and three valid original-review cases.
- Focused regression: 62/62 pass, zero failures or skips. This includes the eight
  new cases and 54 unchanged retained native-cancellation/privacy cases; repeated
  runs are not additional coverage.
- Actual browser: the same nine cases failed before the fix and passed after it,
  all three brands × desktop/tablet/mobile. Every red case observed the disabled
  date/source controls and original `READY_FOR_REQUIREMENTS`. Green cases deny
  invalid-date admission, permit explicit date correction/reconfirmation, prepare
  exactly the existing blocked staff review, and retain its original attempted
  hold. Axe and overflow checks pass; no external requests, plan or consent writes.
- Strict TypeScript, focused ESLint and Prettier pass. Loopback browser launch was
  initially blocked by sandbox EPERM before startup; the authorized loopback run
  produced the actual red and green evidence.

Reproduce using the pinned repository dependencies:

```sh
npx vitest run tests/cycle30-maintenance-date.test.ts tests/cycle24-plan-cancellation-review.test.ts tests/cycle27-maintenance-consent.test.ts
node tests/program/cycle30-maintenance-date-browser.mjs green
```

Ignored raw reports and nine green PNGs are under `artifacts/cycle30/growth/` in
this worktree. Source identity is exact parent plus this bounded candidate; local
passes are not GitHub CI, operational consent, plan cancellation or recovery PASS.

No canonical helper, original test, timeout, assertion, migration, design token,
artwork, App route or approved interface is changed. Purpose consent, suppression,
enrollment and renewal requirements remain unverified; no send or financial
execution is enabled. Danny's second Mac remains last unavailable; physical
recovery remains NOT RUN. All P1/customer14/4B, Auth/MFA, NMI, frozen Netlify,
financial, hosted, deployment, merge and production gates remain unchanged.
Release1.0 remains **NOT READY / NOT AUTHORIZED**.
