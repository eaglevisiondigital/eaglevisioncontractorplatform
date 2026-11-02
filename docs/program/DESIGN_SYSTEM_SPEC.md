# Shared design-system specification · cycle two

Date: 2026-11-01. Baseline: `e44d668fe8bfd262be126020a0c1be9fa110046b`.
Owner: main integrator. This specifies reuse and extension of approved source;
it authorizes no redesign, hosted route or change to existing visual approvals.
The original customer and contractor premium interfaces remain locked.

## One system, existing presentation variants

| Layer                | Actual source                                                                        | Extension rule                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform shell       | `src/styles.css`; `WorkspaceNavigation`                                              | Reuse global Inter/system font, base inputs/buttons, layout and existing module registry. Preserve ordinary financial/preview-only gates. Do not add a second sidebar or hardcode another navigation inventory.                   |
| Contractor premium   | `ContractorBackOfficeLayout`, scoped `contractor-back-office-design.css`             | Reuse contractor-first header/rail, current area, warm surfaces, existing spacing and cards. Functional form additions use existing composition; no replacement or token rewrite.                                                 |
| Customer premium     | `PropertyPortalDesign`, scoped `property-portal-design.css`                          | Preserve Avenir Next/Inter fallback, property overview/history/attention/comparison/review navigation and mobile composition. New internal operations do not alter customer layout.                                               |
| Isolated experiments | Separate local DEV + exact flag + literal loopback mount; field PR #4 is a reference | Scope/lazy-load styles and state, preserve original route when a new flag is off, show truthful synthetic/authority labels. A prototype is not a new approved global type or spacing system. Its promotion needs separate review. |

Approved variants remain distinct and compatible; do not flatten their typography,
breakpoints or rounded corners into one new global style. New work selects the
existing context and component first. Do not copy an isolated experiment into a
locked module or silently turn prototype styles into shared tokens.

## Identity and source-bound tokens

| Semantic role                    | Current value / authority                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Platform identity                | `productBrand`: Propel Contractor Suite by Eagle Vision; emerald `#00543e`, mint `#48f5ad`                                                                                           |
| Contractor identity              | `CompanyProfile.primary_color` / `accent_color`, exposed through existing `--company-color` and contractor context; no invented logos                                                |
| Three synthetic primary palettes | Property services `#247364`; construction `#a85a32`; roofing `#355ea0`; shared sample accent `#dfb461`                                                                               |
| Global text/background           | `src/styles.css`: `#1c2d36` / white, Inter/system fallback, line-height `1.5`                                                                                                        |
| Contractor surfaces              | Existing `.backoffice-concept`: background `#f5f5ef`, ink `#20352f`, muted `#566960`, border `#d9e1da`                                                                               |
| Customer surfaces                | Existing `.portal-concept`: background `#f5f6f2`, ink `#203530`, muted `#586b64`, line `#dde4dd`                                                                                     |
| Focus                            | Existing visible 3px focus outline and 4px offset; preserve context color and focus visibility                                                                                       |
| Interaction                      | Existing base button radius 6px/padding12px18px; premium portal radius9px/min-height46px. New touch controls use the current premium pattern; do not resize locked screens globally. |

Use the original approved PNG or the existing explicitly selected transparent
derivative, retaining original dimensions/proportions and `PlatformBrand` alt/home
label. `CompanyLogo` remains a separate private company identity; a synthetic company
without an approved asset uses its existing text name. Preserve `docs/BRANDING.md`
and both exact asset hashes. Do not regenerate, recolor, crop or add a white matte
around the transparent variant. Inspect warm surfaces and mobile for halos.

`DESIGN_SYSTEM_CONTRACT.json` binds five exact approved CSS/artwork files and thirteen
source anchors for tokens, components, responsive behavior, navigation and closed
financial capability. `npm run features:check` verifies it through the existing
public-path/no-symlink evidence reader. Drift is a review failure; updating a hash
alone is not design approval. No HTML/CSS/application source is changed by this
specification. A passing hash/source check is not runtime accessibility acceptance.

## Component contracts and interaction states

| Pattern             | Existing component / contract                                 | Acceptance for additions                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Navigation          | `WorkspaceNavigation`; existing App repository ownership      | Native navigation semantics, `aria-current`, stable enum/value identity. Paths/selections never confer access. No module becomes visible through a visual flag alone.                                                                      |
| Lists/filtering     | Existing forms, `Pagination`, property history/field filters  | One labeled search, grouped controls, accurate available-result count; literal search and validated date range. Reset page when query/context changes. Preserve selected exact identity beyond the current page without broadening access. |
| Loading/error       | `useResource`, `ResourceStatus`                               | Loading/status and error/alert messages; useful empty and retry/reload states. New async controls immediately hide old context and discard late responses. `useResource` alone does not guarantee immediate context invalidation.          |
| Forms/actions       | Existing inputs/buttons/selects, `useTask`                    | Explicit labels, disabled/busy state, keyboard operation and useful error messages. `useTask` busy is presentation, not a duplicate/custody guard. Reserve exact attempts before await where required.                                     |
| Source evidence     | Existing exact report/version/finding and issued scope review | Labeled IDs/versions/dates/property and observation versus recommendation. Focus source detail on navigation; use text labels as well as color. No latest/nearest/fuzzy fallback.                                                          |
| Review/confirmation | Existing manual staff review, saved draft/CAS/readiness       | Show exact current target and source before explicit confirmation. Stale/UNKNOWN blocks writes and exposes exact read-only reconciliation. Review, scheduling and 6/6 readiness do not prove repair or financial authority.                |
| Money/export        | Canonical integer/currency and existing ledger verifier       | Explicit currency, exact minor-unit math and truthful completeness. Customer-safe allowlists; finance export is not settlement, funding, invoice issuance or accountant approval.                                                          |
| Empty/unknown       | Context-specific existing status patterns                     | Distinguish no matching accessible records, no observations, missing evidence, denied source and UNKNOWN outcome. Never display missing facts as zero, resolved, paid or complete.                                                         |

Public product labels explain the user's task and decision. Keep internal tool,
transport and security implementation details in collapsed development controls or
engineering evidence. Retain concise visible synthetic/authority labels on previews
so they cannot be mistaken for operational services. Never render notes as HTML.

## Responsive and accessibility acceptance

Preserve existing context breakpoints: customer1050px/720px; contractor1150px/760px.
These are current source facts, not new universal breakpoints. Extend the nearest
context instead of stacking another global breakpoint system. Use min-width0 and
wrapping for long source IDs; never truncate away identity needed for confirmation.
Desktop comparisons can use columns; mobile stacks preserve explicit earlier/later
or original/revised labels and logical reading order. Filters wrap and actions remain
usable without horizontal page scrolling. Do not inherit the fixed global header
height into a taller isolated mobile header.

Use the pinned Playwright Desktop Chrome/iPad Mini/iPhone13 projects or equivalent
explicit local viewports. Exercise all three contractor palettes, long labels and
source IDs, loading, errors, empty results, context switches, confirmation, stale and
UNKNOWN states. Check keyboard/focus and accessible names plus actual axe scans.
Avoid color-only distinctions; source links and action names identify the target.
Retain reduced-motion support. Axe/no-overflow on exercised states is bounded
evidence, not a complete accessibility certification or genuine hosted acceptance.

## Review ownership and change protocol

Main integrator owns this specification, machine contract and shared token/component
decisions. CRM owns only its paginated selector/lookup additions; field owns only the
isolated gated handoff; finance owns only an unwired allowlisted export contract;
Passport owns only existing-source evidence foundations. No concurrent editing of
global styles, navigation, Auth, schemas or ledger writers. Request coordinated
review before a shared interface change; reuse domain types instead of copying them.

Every draft PR names its exact parent, scope/flag, actual source objects, tenant and
privacy tests, responsive/keyboard evidence if UI changed, rollback and unresolved
dependencies. Independent integration review checks combined types, ownership,
source identity, accessibility and protected hashes. Leave all branches unmerged.
No source/hash test or visual approval authorizes P1 recovery, hosted Auth/SQL,
NMI/provider/financial execution, customer communication, deployment or release.

## Cycle-three extension contracts

The five Cycle3 candidates extend their existing context on separate exact-parent
branches. Sales, Finance and Field add scoped components; Passport and Growth add
unwired readers only. They do not replace the approved customer or contractor UI.

| Candidate               | Required presentation and evidence                                                                                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sales scope review      | Separate exact issued version, actual test preference/receipt and contract-authority status. Prefer labeled scope/totals and explicit blocked/unknown states. No signing or approval button. Isolated mobile headers remain in document flow; muted labels must pass contrast in all three palettes.  |
| Field work orders       | Existing job identity and issued baseline, crew relationship and own recorded time are separate facts. Office controls never survive a role/context change. An assignment is not dispatch; a day/visit is not an invented future shift. Source navigation moves keyboard focus to the exact evidence. |
| Finance margin coverage | Show source category, committed/paid/forecast distinctions and missing coverage before totals. Retain canonical currency/minor units. A horizontally scrollable labeled table may preserve readable columns on mobile; the page itself must fit the viewport. No earned-margin or settlement claim.   |
| Passport documentation  | Preserve customer/property/report/version/plan/job reference identity and readable UNKNOWN links. A checklist, after-phase report or staff record is evidence with stated limits, never a completion, warranty or customer-approval badge. No new customer route in this package.                     |
| Growth reminder review  | Separate an anchored plan occurrence or manual follow-up date from channel consent, purpose consent, suppression and enrollment. Communication remains BLOCKED; no recipient, send control, outbox or background scheduler. No new screen in this package.                                            |

Main owns the shared evidence-tool routing: new scoped styles remain A8, while
Sales/Field/Finance/Passport/Growth source readers belong to A2/A3/A4/A5/A6. These
are review owners, never access grants. The optional Finance demo HTML is included
when present in the public inventory; no prototype is mounted by the checker.

Each interactive candidate is exercised in actual desktop/tablet/mobile browsers
with all three existing contractor palettes, keyboard/accessible names, axe checks,
empty/error/default-OFF and late-context behavior. Retained screenshots are local
synthetic evidence. Successful tests do not approve promotion or certify every
possible state. See the exact combined [review record](CYCLE3_INTEGRATION_REVIEW.md)
and [delivery register](../PROGRAM_DELIVERY_STATUS.md) before integration.

## Cycle-four interaction and evidence extensions

Keep existing visual variants and five exact locks/thirteen bindings. Field proposal
forms, Sales retained-reference controls, Finance warning/floor panels and the
isolated Passport timeline reuse current palettes, typography, warm surfaces, touch
controls and focus semantics. No global shell/navigation/approved portal redesign.

- Model/company/customer/property/source changes must immediately hide old evidence,
  even when an exported component is rerendered without a parent React key. Own the
  identity boundary and discard late async results; a correctly guarded reader alone
  cannot clear stale UI state. Test actual model replacement and same-model context.
- Label source facts separately from explicitly confirmed human proposals/local
  review inputs. Confirmation withdrawal or edited fields invalidates pending review.
  Never render a proposed timed slot as dispatch or a local floor as company policy.
- Capacity conflicts use text kind/source labels, not only warning color. Expose
  unioned proposal hours, out-of-hours coverage, timestamp-recorded evidence and
  date-only UNKNOWNs distinctly. Do not present payroll/break totals as availability.
- A retained Sales reference labels original issued version, exact scope hash and
  reference integrity separately. Current/stale/UNKNOWN never implies contract rights.
- Margin variance warnings stay separate from incomplete coverage and denominator
  uncertainty. A missing warning is not complete cost capture or final profitability.
- Passport timeline source buttons focus exact detail, preserve report/version/job
  identity and explain different date meanings. Completion-documentation facts remain
  explicitly unverified as physical completion, approval or warranty.

Exercise real desktop/tablet/mobile/all-brand cases, keyboard/axe, source focus,
empty/loading/error/OFF and no-parent-key context races. Screenshots and source hashes
are bounded local evidence, not operational or universal accessibility acceptance.
See [Cycle4 review](CYCLE4_INTEGRATION_REVIEW.md) and the master delivery register.

## Cycle-five source-bound presentation

Preserve the same five exact locks/thirteen bindings. Technician lanes, contract
preparation, cost-to-complete review and the isolated Proof of Work pack use existing
contractor palettes, typography, surfaces, field labels and transparent attribution.
No new global token, brand, artwork or portal redesign. New sections are default-OFF;
the remainder of the back office and customer experience remain intact.

- Distinguish proposed capacity, legal preparation, recorded cost coverage and
  documentation availability with explicit text. CURRENT means only matching source
  evidence at the check; it grants no signing, dispatch, completion or delivery rights.
- Side-by-side source facts and manual proposals must remain readable when stacked.
  Use accessible labels and source focus targets, touch controls and no color-only
  status. Keep development controls collapsed on small screens.
- Components own context/liveness boundaries, including model replacement without a
  parent key and React StrictMode effect remount. Withdrawing confirmation or changing
  company/property must hide pending old evidence and discard late results.
- Customer packs never inherit staff financial/workforce projections. Unavailable
  media must remain explicitly unavailable; no empty photo frame implies inspection
  coverage or warranty.
- Unmounted expansion domain prototypes make no UI/accessibility claim. Any future
  mount must use these same tokens and receive actual responsive/keyboard/axe/source
  navigation evidence before separate integration review.

## Cycle-six cohesive workflow presentation

The isolated contractor journey reuses the current palettes, warm surfaces, typography,
transparent approved attribution and existing components. It adds no global style or
artwork changes. New scoped source labels use sufficient contrast on white/warm cards;
all company/customer/property/source handoffs retain exact identity. Legal preparation,
recorded visit dates, internal cost coverage, customer documentation and reminder review
are separately labeled; no color-only authority status. Context/confirmation changes
hide old results immediately. Main owns the route and shared journey confirmation;
each panel retains its own explicit source review and currentness checks.

Contract snapshots remain staff-only. Customer panels receive allowlisted published
report/issued scope evidence, never the staff cost/assignment/source snapshot. Mobile
stacks comparisons and source cards without page overflow; desktop/tablet preserve
readable hierarchy. Actual browser, keyboard/axe and context-reset evidence is required
for the combined candidate; passing domain tests is not visual acceptance.

## Cycle-seven editable review controls

Keep the approved portals and five locked CSS/artwork files byte-identical. New
booking and job-review styles are scoped beneath their own panel root and reuse
the journey contractor tokens. Label recorded date/time/cost facts separately from
unsaved human proposals. Show units, timezone, original visit date and exact source
identity beside the inputs. Never style a review result as a booked slot, posted
time, purchase, issued invoice or final profit.

Input changes immediately clear confirmation and previous results. Controls have
visible labels, at least44px touch targets, persistent keyboard focus, descriptive
errors/status and mobile stacking. Long IDs and JSON previews wrap within the card;
no page overflow. Reset clears presentation only and cannot erase UNKNOWN custody
or imply a new business attempt. Returning to a contractor restores its retained
attempt presentation, then requires explicit confirmation before showing sources.
Main verifies the actual combined forms at desktop/tablet/mobile across all three
brands, plus production-default-OFF and keyboard/axe/source-context regressions.

## Cycle-eight operating review panels

Add to the isolated contractor journey using existing contractor primary/accent
tokens. The approved premium portals, global styles and original artwork remain
unchanged. Each panel has a unique named region, clear source/coverage summary,
visible labels, explicit review action, text statuses and retained-source check.
Use narrowly scoped CSS. Raw headers must reset inherited fixed/flex global rules;
long UUIDs and structured evidence must wrap. Controls are at least44px high and
comparisons/week cards stack on mobile without overflow. Never encode status in
color alone or present a proposal as an operational action.

Weekly views distinguish recorded visits from unsaved windows and UNKNOWN availability.
Finance distinguishes recorded costs, proposed remaining inputs and coverage gaps.
Sales uses exact original scope/receipt labels. Customer views exclude staff costs,
notes and assignments entirely. Growth shows planning/consent limits beside each
opportunity; Copilot priorities cite source identities and missing evidence.

Changing input or context withholds prior output and clears confirmation. Repository/
model instance replacement must also reset presentation, even with identical IDs.
Loading, empty, invalid/stale and UNKNOWN states need keyboard/screen-reader evidence.
Main captures actual desktop/tablet/mobile screenshots across all three brands and
checks source navigation, focus, axe, palette, no network execution and production OFF.

## Cycle-nine multi-job operating surface

The isolated operating center uses the same approved contractor palette variables,
warm neutral canvas, restrained borders/cards, typography, transparent original
Propel attribution and existing workflow components. No global token, original
customer portal, contractor Property Operations style or artwork lock changes.
New CSS is scoped/lazy through the separate preview. Company-first identity and a
compact local-only badge precede admitted-source counts and one wrapping navigation.
Active section and exact selected-job context remain explicit on desktop and mobile.

Portfolio cards distinguish original published evidence, staff proposals, unknown
coverage and blocked execution in text. Identity strings wrap; desktop grids stack
at the existing760px context boundary. Controls remain at least44px high, labels
are explicit, source navigation focuses its destination, and empty/filter states
announce available coverage. Repeated property regions include the exact property
identity in their accessible names. Scrollable advanced evidence has a named region
and keyboard focus. No color-only status, inferred completion or fake customer action.
Real browser evidence covers all three brands and desktop/tablet/mobile; automated
axe, overflow and touch/focus checks apply only to exercised states.
