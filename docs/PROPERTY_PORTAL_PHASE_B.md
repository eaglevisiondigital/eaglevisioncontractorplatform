# Premium property portal · owner-approved Phase B

October28,2026 · base dffaa7b21027e5c299550d6308253631ebc9ff4c.
The owner approved Phase A and explicitly authorized replacing the LOCAL SYNTHETIC
portal presentation, with one correction: remove the white logo background. This
supersedes the earlier visual-review hold, not any operational/release restriction.

## Result and exact routes

- /preview/property-portal now renders the approved premium presentation, using the
  SAME React component as the retained /preview/property-portal-design. Header,
  typography, contractor palette, property overview/activity/metrics, navigation,
  report/attention/comparison/review views, mobile layout and collapsed development
  controls retain their approved styling and behavior. No new design direction.
- Both routes use isolated instances of existing synthetic Operations/property/model
  workflows; no duplicate domain store or connected customer route. Actual examples
  load automatically, as approved in Phase A. Existing preparations remain idempotent.
- The retained Phase A view keeps its original logo/container for direct comparison.
  The approved portal uses the transparent derivative with no container background,
  padding or radius. Shared branding defaults/global styles remain unchanged, so
  staff/login/other platform pages continue to serve the original approved source.
- Only the synthetic disclosure label and reciprocal preview link reflect Phase B
  status. The overview body screenshots compare byte-for-byte equal with Phase A
  at desktop, tablet and mobile sizes. No other visual replacement was introduced.

Open http://127.0.0.1:4173/preview/property-portal while the local server is running.
To start it: npm run build, then npm run preview -- --host 127.0.0.1 --port 4173
--strictPort. The existing Phase A URL remains separately accessible.

## Transparent artwork, without regeneration

Inspection confirmed that public/brand/propel-contractor-suite.png is RGB,2172x724,
with an opaque near-white matte. Its original SHA-256 remains
b77d8e9e9db486c32ea24031033e4bec758342a4a3418fb438cfad23e0629bb0.

The portal-only derivative is public/brand/propel-contractor-suite-transparent.png,
RGBA with the SAME2172x724 dimensions. SHA-256:
dd6e8161dc4be20b97ca10cdb58a191b2bb5d4b92c2e58a2c4dcceed500a9a27.
It is derived directly from the approved pixels using the pinned existing Sharp
library, with no generative image operation, redraw, resize, crop, color replacement
or typography/layout change. The original file is never overwritten.

The reproducible scripts/derive-portal-logo.mjs verifies the original hash, clears
near-white background/negative space, preserves474732 solid artwork pixels exactly,
and unmattes8044 softened edge pixels using nearby solid ink. All1089752 near-white
background pixels are transparent. The final extraction rejects unmatched light
artwork rather than silently discarding it. Re-running produces the same derivative.

Pixel tests verify solid artwork RGB/alpha equality, unchanged dimensions/source
hash, true alpha and removal of white halo pixels. Every retained antialiased pixel
reconstructs the original white-matted pixel within1channel level when composited
back onto white. Cleared source matte/noise differs from white by at most15levels;
this is not alteration to solid artwork. The derivative was inspected at enlarged
size and in actual desktop/mobile warm-background portal footers. No white rectangle
or visible white edge halo remains in the reviewed screenshots.

PlatformBrand has one explicit optional transparent flag, default false. Only the
approved synthetic portal opts in. The only CSS change is an approved-portal-scoped
transparent background/zero padding/zero radius override. Existing shared
.platform-brand styling and original productBrand.logo are preserved.

## Focused verification

- 56 application tests in6files PASS: new derivative identity/pixel integrity plus
  comparison/attention, safe projection, synthetic customer and closed Auth tests.
- 66 focused browser cases PASS across desktop/tablet/mobile. They cover Phase A and
  Phase B, all three contractor palettes, all approved views, exact report/version/
  issued-source navigation, filters, malformed/duplicate comparison selections,
  empty/error clearing, synthetic approve/decline/duplicate semantics, keyboard,
  reduced motion, closed connected routes, unchanged other-page branding and the
  existing property operations regressions. No outside request in the screenshot
  journeys; exercised accessibility states have zero Axe violations/no overflow.
- Native browser canvas verifies the served derivative corners have alpha0. Computed
  approved logo-container background is transparent, padding0 and radius0. Original
  source bytes and platform-page branding are separately verified.
- The approved overview body matches retained Phase A screenshot bytes at all three
  viewports. Browser assertions were updated for the APPROVED populated initial
  state and collapsed controls; no evidence/business checks were disabled.
- TypeScript/build,ESLint,generated types,migration/property/customer integrity,
  Prettier and diff checks pass. All four frozen P1 artifacts verify under unchanged
  operation01b96075…; no activation/Auth/hosted write. Historical SQL, pending customer
  migration, business/server/model, recovery/Netlify and global CSS remain unchanged.
- Prior Phase A foundation40771547258: verify/postgres17 SUCCESS, read without restart.
  New-commit CI is reported separately. Full local aggregate/native SQL/recovery
  baselines were not rerun for this presentation-only change; relevant constituent
  checks and focused application/browser suites ran. No physical-device/hosted PASS.

## Real browser evidence

Ignored artifacts/property/ contains phase-b-{desktop,tablet,mobile}-overview.png,
reports/attention/comparison/estimates/empty/error views and close-up logo screenshots:
phase-b-desktop-logo.png, phase-b-tablet-logo.png and phase-b-mobile-logo.png.
The Phase A captures remain under ignored artifacts/property-design/.
These are actual built React/CSS/assets and synthetic data, not generated mockups.

## Preserved gates

No hosted customer activation, credential retrieval, real Auth/session, migration,
database write, feature/mapping/lease/grant, provider/media/financial/legal execution,
Netlify/recovery operation, deployment, production action, outside access or merge.
All13 historical SQL files, pending customer migration and frozen P1/four artifacts/
existing approval remain intact. Both Mac setup/connectivity facts remain completed
owner evidence; authenticated pairing and independent recovery are unfinished,
separate acceptance gates. Release1.0 stays NOT READY / NOT AUTHORIZED; PR#1 draft.
