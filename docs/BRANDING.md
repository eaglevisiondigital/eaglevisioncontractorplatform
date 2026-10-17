# Propel Contractor Suite by Eagle Vision

The owner-approved product name is **Propel Contractor Suite by Eagle Vision**.
The owner supplied the exact emerald-and-mint-on-white logo as
`Emerald Propel Contractor Suite Logo.png` after the original asset request.
`public/brand/propel-contractor-suite.png` is a byte-for-byte copy, not a redraw,
crop, recolor, generated substitute or alternative logo.

- Original dimensions: 2172 × 724 pixels.
- SHA-256: `b77d8e9e9db486c32ea24031033e4bec758342a4a3418fb438cfad23e0629bb0`.
- Product identity: `src/domain/brand.ts`; reusable full-image component:
  `src/components/PlatformBrand.tsx`.
- Emerald and mint accents on white; preserve responsive application structure.
- Covers login, MFA text/future factor labels, staff access, platform/company
  shells, navigation, internal release previews, public intake attribution and
  browser title/application metadata/favicon. Existing MFA factors are not renamed,
  recreated or reset; previously verified authenticators remain valid.
- Contractor names, private logos, configured primary/accent colors, customer-facing
  estimate/invoice branding and per-company sender identity remain independent.
- Original README, migration history, repository/package identifier, Supabase/Netlify
  resource identities, Keychain service and historical evidence remain unchanged.
  Eagle Vision attribution and the separate Eagle Vision Payments design are
  intentional; they are not old platform wordmarks.

Automated browser checks verify the exact served image hash, all platform entry
points, absence of old EV/platform wordmarks, responsive overflow and unchanged
three-company color contexts. Existing tests continue to cover the full synthetic
CRM/estimate/import/job/workforce/release workflows. These are local UI/SQL tests,
not connected Action B acceptance. No hosted identities, permissions or settings
are changed to produce screenshots. Do not capture genuine QR or authenticated
sessions as branding evidence.

Screenshots: ignored `artifacts/branding/`, desktop/tablet/mobile, actual rendered
application. Additional configured-login screenshots use a local browser-safe
configuration with no sign-in or hosted mutation. No deployment is authorized.

## Validation result

- `npm run check`: PASS (lint, strict types, generated types, nine-file migration
  checksum, 354 local unit/SQL tests; nine native-only concurrency skips; build).
- `npm run test:browser`: PASS, 51 desktop/tablet/mobile cases. All 48 existing
  workflow/accessibility cases pass; three added branding cases cover the exact
  asset hash, ten platform entrypoints, tenant colors and MFA identity text.
- Initial added-test selector used exact label text including select contents;
  corrected it to the actual accessible combobox role. Final run has no failures.
- `npm run format:check` and `git diff --check`: PASS.
- Source audit: no old platform name, EV monogram or Eagle Vision control-plane
  copy remains in runtime source/HTML. Only the approved “by Eagle Vision” product
  attribution remains. Negative test expressions, historical docs/README and
  unchanged technical resource/Keychain identifiers are deliberate exceptions.
- Asset hash equality and natural 2172-pixel width are verified in each browser
  project. No hosted settings, accounts, factors, grants or domain rows were changed.

Actual screenshots for owner review:

- Desktop dashboard: `artifacts/branding/desktop-dashboard-viewport.png`.
- Mobile dashboard: `artifacts/branding/mobile-dashboard-viewport.png`.
- Desktop configured login/MFA: `artifacts/branding/desktop-configured-login-mfa.png`.
- Mobile configured login/MFA: `artifacts/branding/mobile-configured-login-mfa.png`.
- Full-page desktop/tablet/mobile previews (dashboard, release laboratory, staff
  access and unconfigured login) are also in that ignored directory.

Configured login captures use a browser-safe local configuration in fresh contexts
with every external request blocked. No password entry, Auth login or MFA operation
was performed. These are real rendered UI screenshots, not generated mockups or
connected tenant acceptance. Nine native-only cases were not executed locally in
this visual follow-up; CI's native PostgreSQL job remains the independent check.
