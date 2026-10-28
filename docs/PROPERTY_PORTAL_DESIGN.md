# Premium customer property portal · Phase A visual concept

October28,2026 · base ef6d2e73f7175369c7f2b5ac92a24500a9e1a3e7.
**Isolated local design review. Existing portal replacement NOT APPROVED.**
Release1.0 remains NOT READY / NOT AUTHORIZED; PR#1 stays draft/unmerged.

## Review the functioning concept

Open http://127.0.0.1:4173/preview/property-portal-design. If needed, run npm run build
and npm run preview -- --host 127.0.0.1 --port 4173 --strictPort. The original approved
functional preview remains /preview/property-portal with its existing empty starting
state and preparation controls. No connected customer route is added or activated.

The design concept starts with actual synthetic examples prepared through the
existing CRM, inspection publication and issued-estimate workflows: seven published
check-ins, existing attention evidence and two issued review versions, including one
linked repair scope. It uses a separate instance of the existing in-memory repository
so preparing concept examples cannot populate the original preview. This is a
presentation prototype, not a new property/customer/inspection/financial system.

One cohesive direction: a warm, editorial property journal. Wider desktop reading
areas, contractor-first identity, a large welcome/property hero, restrained
architectural line art, polished metric cards, recent inspection activity and a
contextual Attention Center entry replace the narrow developer-first introduction.
A five-item icon/text navigation includes a new overview and all four existing views.
Mobile uses an explicit property selector, touch-sized two-column navigation, compact
summary rows and stacked comparison evidence. The architectural drawing is decorative;
it is not a representation or photograph of an actual property.

History, attention, comparison and estimate review render the ACTUAL existing React
components with CSS scoped exclusively to .portal-concept. Severity, uncertainty,
source versions, findings, recommendations and issued scope relationships retain
the same read models and rules. Neutral comparison highlights describe factual
report differences without implying improvement/deterioration or work completion.
Published checklist IDs remain unavailable; exact-label comparisons retain the
existing limitation and report-local positions. No issue status or condition score.

The exact approved PNG is used once in a compact footer attribution; contractor logos
are not invented. Primary/accent colors remain the existing contractor configuration.
Typography uses installed system fonts without external font requests. The concept
CSS is lazy-loaded for its exact route and every selector is scoped. Strong focus
outlines, a keyboard skip link and reduced-motion treatment are included.

## Review interactions

- The overview's metrics, recent check-in arrows and call-to-action buttons open
  existing reports, attention and issued scopes for the selected synthetic property.
- Attention retains all filters, severity/recurrence/uncertainty and exact report/
  issued-version source links. For a concise screenshot, choose Reported changes
  and expand the East window seal's source evidence.
- Compare inspections preselects the two existing synthetic comparison examples.
  Select Compare selected inspections to view the exact published pair. Other
  reports remain selectable; duplicate/stale/foreign evidence still fails closed.
- Estimates & repairs shows the existing immutable issued versions and scope totals.
  Synthetic acknowledgment remains required for an approve/decline PREVIEW preference;
  no work, agreement, invoice, payment or debt is authorized. Page-local preferences
  remain page-local. The design does not change financial calculations or execution.
- Choose200 Synthetic Garden Lane for genuine empty property evidence, including
  empty history, attention, comparison and issued estimates.
- Development-only preview controls are COLLAPSED at the bottom. They retain the
  contractor selector, existing example preparation and simulated error controls.
  Open them to switch any of the three brands or Simulate loading error. Errors
  remove the property data; Reload preview status returns to existing sample data.
  Real initial async loading has a styled nonanimated state, without a fake delay.
- A visible design/synthetic disclosure remains on every screen. No preview controls
  or sample fallback is mounted on a connected customer route.

## Real browser screenshots

All screenshots use the actual built React/CSS/PNG assets and synthetic records.
No AI mockup, remote photo, new font download or alternate logo is used. Local PNGs
remain ignored under artifacts/property-design/. Regenerate with npm run test:browser
-- tests/browser/property-design.spec.ts. Desktop captures use1440x1000; tablet and
mobile use the existing Playwright project devices. Screenshot scale is CSS pixels.

| Review surface                  | Desktop PNG                   | Mobile PNG                   |
| ------------------------------- | ----------------------------- | ---------------------------- |
| Populated property overview     | desktop-overview.png          | mobile-overview.png          |
| Populated inspection history    | desktop-reports.png           | mobile-reports.png           |
| Populated Attention Center      | desktop-attention.png         | mobile-attention.png         |
| Populated inspection comparison | desktop-comparison.png        | mobile-comparison.png        |
| Comparison detail               | desktop-comparison-detail.png | mobile-comparison-detail.png |
| Issued estimate/repair review   | desktop-estimates.png         | mobile-estimates.png         |
| Empty property                  | desktop-empty.png             | mobile-empty.png             |
| Simulated error                 | desktop-error.png             | mobile-error.png             |

Additional tablet screenshots and attention detail captures are retained in the same
folder. Final desktop overview/attention/estimates/comparison and mobile overview/
comparison, plus empty/error screenshots were visually inspected. Initial review
caught a skip-link artifact in full-page screenshots; standard clipped skip-link
styling corrected it while preserving keyboard focus behavior. All captures were
regenerated using the final scoped CSS.

## Focused verification

- 33 unique desktop/tablet/mobile browser cases PASS:9 new concept cases and24 existing
  portal/attention/comparison/branding regressions. New journeys verify populated
  records, exact PNG hash, all seven requested review surfaces, strict source/issued
  version navigation, synthetic decline/duplicate blocking, three contractor palettes,
  property/error resets, keyboard skip/focus, reduced motion and closed connected
  routes. No outside request occurs in the screenshot journey.

- Axe reports zero violations across the exercised populated reports, attention,
  comparison, estimates, overview, empty/error and three-brand overview states.
  No horizontal overflow. Initial small evidence-note contrast4.04/4.07 was corrected
  by darkening the note text; final nine concept cases pass. No global styles changed.
- 20 existing focused application tests across4files PASS for reused synthetic models
  and closed Auth behavior. No new domain/permission behavior or duplicated tests.
- TypeScript/build,ESLint,generated types,migration/property/customer integrity,
  Prettier and diff checks PASS. Byte comparison confirms166 existing domain/server/
  model/shared property presentation/brand/SQL/P1/recovery/Netlify paths unchanged.
  Offline P1 inspector verifies all four artifacts and unchanged01b96075… operation.
- Previous comparison foundation run40763735497: verify and postgres17 SUCCESS; read,
  not restarted. New-commit CI is reported separately. The local aggregate check
  including unchanged recovery/native SQL suites was not repeated for this visual
  concept; relevant constituent checks and focused application/browser tests ran.
  Screenshots are visual review evidence, not hosted or physical-device acceptance.

## Owner visual approval required before Phase B

Review this ONE direction and specify any adjustments to:

1. Contractor-first header, typography, warm surfaces and decorative line-art hero.
2. Property overview density, metric cards, recent activity and navigation.
3. History/attention/estimate cards, source evidence hierarchy and neutral comparison
   highlights, including stacked mobile treatment.
4. Compact single Propel attribution and collapsed development controls.

The owner's instruction is explicit: “Do not apply the final redesign to the existing
customer portal until the owner reviews the concept.” Phase A is complete for review;
no existing portal replacement is performed or authorized. Approval of a visual
concept cannot authorize hosted customer access, financial execution or release.

## Preserved boundaries

All13 historical SQL files, pending customer migration, frozen P1/four artifacts and
existing owner approval are unchanged. No Auth/session/credential activity, database
write, grant/mapping/lease/feature, provider/media/financial/legal execution, hosted
recovery/Netlify change, deployment, production action, outside access or merge.
Both Mac setups/IPv4/Universal Clipboard retain owner-reported completion; actual
pairing and independent recovery remain incomplete and separate. No device PASS.
