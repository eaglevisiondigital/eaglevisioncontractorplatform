# Cycle17 owner visual review · two pending scopes only

This review covers Operating Center panels and advanced add-on panels. Their visual
approval remains PENDING. The approved customer portal, Property Operations/back-office
layout and original branding/artwork are unchanged. Passing browser/accessibility tests
is not owner visual approval.

## Actual reference versus current captures

The local offline gallery pairs 36 real browser screenshots into 18 comparisons:
two scopes × three existing contractor palettes × desktop/tablet/mobile. Each pair
shows the retained Cycle16 presentation and Cycle17 presentation rendered from the
same clean combined candidate. The reference is existing implementation, not a newly
located original owner mockup and not a claim of pixel equivalence. Exact per-capture
source commits, dimensions and SHA256 are recorded in the visual manifest.

Original owner mockup attachments for these two scopes remain MISSING. Do not infer
approval or regenerate missing originals. The gallery labels the missing references.
Synthetic recorded values and random identifiers may differ between separate disposable
preparations; the comparison is presentation evidence, not a claim of identical data.

## Owner checklist

- Operating Center: hierarchy, exact job/customer/property breadcrumbs, original
  controls, source drill-down, local return and mobile readability.
- Advanced add-ons: retained job/mode/edition, source-versus-original-review tabs,
  visible missing requirements and unchanged explicit original confirmations.
- Check each existing contractor palette on desktop, tablet and mobile.
- Record any requested visual correction separately; no redesign or visual promotion
  is included in this package. Existing approved scopes/artwork remain locked.

## Reproduce locally

From the Cycle17 coordination worktree, install the pinned lockfile dependencies
if absent, then run:

```sh
VITE_CONTRACTOR_JOURNEY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4341 --strictPort
```

Open `http://127.0.0.1:4341/preview/operating-center`. Check **Use retained daily
workspaces**, choose a contractor and explicitly prepare the disposable multi-job
example. Expand **Cycle 14 source continuity**. Review the six original destinations;
**Schedule and work orders** and **Source-bound advanced workflows** provide the
visual comparison scopes. The independent **Use daily workflow guides** option retains
the Cycle16 reference when the Cycle17 option is unchecked. Both start OFF.

The offline gallery is generated from actual focused browser captures:

```sh
npx playwright test -c tests/program/playwright.cycle17.config.ts --workers=2
node scripts/cycle17-build-visual-review.mjs
npx playwright test -c tests/program/playwright.cycle17-gallery.config.ts --workers=1
```

Open `artifacts/cycle17/owner-visual-review.html` locally. It contains no scripts,
forms, remote assets or customer responses. No preview server is left running by the
verification package. No hosted/customer access, sending, dispatch, financial or
release authority is granted. Release1.0 NOT READY / NOT AUTHORIZED.
