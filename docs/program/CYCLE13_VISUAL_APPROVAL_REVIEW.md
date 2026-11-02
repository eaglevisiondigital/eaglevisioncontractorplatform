# Cycle 13 · visual approval inventory and comparison

Baseline: `c41a2424a0bd098905fd60965ef7f78447f1c753`. This package inventories
public source evidence and supplies a working, isolated HTML comparison tool. It
changes no application component, artwork, palette, token, approved layout or route.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## Existing approval scopes

| Scope                                                      | Exact public authority                                                                                                     | Finding                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original Propel artwork and portal transparency derivative | [Branding](../BRANDING.md), “The owner explicitly approved removal of the opaque logo matte”                               | Approved original 2172×724 source copy and same-size derivative are present, with their original locked hashes. This permits neither a redraw nor different company artwork.                                                     |
| Premium local customer portal                              | [Property portal Phase B](../PROPERTY_PORTAL_PHASE_B.md), “The owner approved Phase A and explicitly authorized replacing” | Existing local premium presentation is approved. The retained Phase A reference intentionally retains the original white-matted artwork; Phase B's transparent artwork/container correction is the explicit approved difference. |
| Contractor Property Operations presentation                | [Contractor Phase B](../CONTRACTOR_BACK_OFFICE_PHASE_B.md), “OWNER APPROVED · LOCAL PRESENTATION INTEGRATION ONLY”         | Exact approved base `07f3e6b172335a494029d340f0040e97710456f6` and local Property Operations integration are approved. A second approval for this exact scope is unnecessary.                                                    |

The five unchanged locked CSS/artwork files and thirteen source bindings are copied
from the existing design contract and verified against actual public files. The
tool also pins the five original hashes and the three approval-document hashes;
changing the inventory and contract together cannot self-approve a redesign.
Earlier Phase A validation JSON and historical pending text remain untouched.
The later, explicit Phase B decisions supersede those holds only for their exact
local presentation scope; neither decision authorizes hosted or release activity.

## Original material and current screenshot inventory

[Machine-readable inventory](CYCLE13_VISUAL_APPROVAL_INVENTORY.json) records both
tracked artwork files, source-document hashes, exact approval anchors, five locks,
thirteen bindings and all **777** discovered local PNG identities: 16 branding,
635 property/contractor, 27 customer Phase A and 99 Cycle 12 captures. These counts
are a finite snapshot of the declared public synthetic artifact directories.
PNG paths, SHA-256 and dimensions identify retained bytes. The PNGs stay ignored;
their absence on another machine or CI is not silently converted to a pass.

No original external logo attachment or separately supplied original mockup image
is tracked in the public repository. Their availability is **MISSING**, while the
documented exact source-artwork copy and approved React/CSS reference implementations
are present. Missing originals have not been reconstructed. Private staging,
correspondence, credentials and external attachment directories were not scanned.

Historical ignored PNG files do not independently prove their exact capture commit.
Their capture-commit binding remains **UNKNOWN**. Presence, a hash or a browser test
is not owner visual approval, genuine authentication, physical device acceptance,
current responsive/accessibility acceptance or operational readiness.

Two exact visual-approval gaps remain in the reviewed public records:

1. The isolated Operating Center and additive Cycle 6–13 review panels.
2. The unwired advanced add-on prototype panels and modes.

These are missing approvals for promotion of those exact new visual scopes. They do
not revoke existing portal or Property Operations approval and do not block permitted
local prototype development. No new design is promoted by this inventory.

## Working standalone comparison

`scripts/cycle13-visual-comparison.mjs` exports `readVisualInventory`,
`validateVisualInventory`, `sha256VisualBytes` and `generateVisualComparison` with
matching strict TypeScript declarations. It embeds the **unaltered supplied PNG
bytes** in labeled reference/current columns that stack on mobile. Captions, paths,
hashes, capture provenance and missing counterparts remain visible. It performs no
pixel-equality calculation or image transformation.

Main's focused browser capture supplies the actual reference/current customer and
contractor views for all three brands and desktop/tablet/mobile. Those fresh captures
are separately recorded by Main; this author package does not claim they were made
by the inventory. The same tool may include isolated Operating Center captures;
missing reference counterparts and visual approvals remain explicit.

Provide `artifacts/cycle13/visual-comparison-manifest.json`, then run:

```sh
node scripts/cycle13-visual-comparison.mjs artifacts/cycle13/visual-comparison-manifest.json
```

The only writable output is `artifacts/cycle13/visual-comparison.html`. Open this
standalone local file for review. No App route, network service, customer URL or
operational capability is created. The generated HTML contains no JavaScript and
uses a restrictive CSP with embedded PNG images and local styles only.

The manifest contract is:

```json
{
  "schema": "propel-cycle13-visual-comparison-v1",
  "sourceCommit": null,
  "sourceState": "WORKING_TREE_UNCOMMITTED",
  "screenshots": [
    {
      "id": "portal-current-desktop-straight-edge",
      "pair": "portal-desktop-straight-edge",
      "side": "current",
      "surface": "customer-portal",
      "brand": "straight-edge",
      "viewport": "desktop",
      "path": "artifacts/cycle13/portal-current-desktop-straight-edge.png",
      "sha256": "REPLACE_WITH_ACTUAL_SHA256",
      "caption": "Actual local synthetic customer portal capture.",
      "sourceCommit": null
    }
  ]
}
```

A committed build instead requires its actual forty-character source SHA and an
optional `sourceState: "COMMITTED"`. A null manifest commit requires the explicit
`WORKING_TREE_UNCOMMITTED` label; contradictory claims reject. Per-image unknown
capture commits remain unknown. Supplying a SHA is a provenance assertion by the
capture producer, not independent Git-tree attestation by this image tool.

Allowed surface values are `customer-portal`, `contractor-back-office` and
`operating-center`; brands are `straight-edge`, `cunningham`, `roofing-example`;
viewports are `desktop`, `tablet`, `mobile`. Comparison pairs cannot cross any of
these identities. Each pair accepts at most one reference and one current image.
Result counts and coverage include all 27 surface/brand/viewport combinations;
missing images never count as equivalent or approved.

The reader admits only finite, non-hidden PNG paths directly under the explicit
public `artifacts/cycle13`, `cycle12`, `property`, `property-design` and `branding`
directories. Every file's expected SHA and PNG header/dimensions must agree. It
rejects traversal, private paths, symlinks, unavailable files, duplicate IDs/paths/
sides, crossed contexts, extra fields, active getters, sparse input arrays, changed
approval evidence and oversized files. Limits are 144 screenshots, 32 MiB per file,
128 MiB combined, and bounded dimensions. Captions are HTML escaped. The local
filesystem remains trusted; these read checks are not adversarial filesystem custody,
a scanner, a full PNG decoder or a source of release authority.

## Focused verification and limitations

Application tests exercise original hashes/anchors, inventory completeness and
unknown custody, missing originals and approvals, hash-change self-approval denial,
exact embedded bytes, all 27 coverage combinations, empty/missing states, contextual
pairing, uncommitted provenance, escaping, duplicate prevention, private-field and
active-getter exclusion, path traversal/symlinks, output confinement and image limits.
Exact final results and CI are reported on this draft and in Main's delivery index;
successful unrelated historical tests are not rerun by this visual-only package.

Author verification: **56 focused application cases PASS**, with scoped ESLint,
strict TypeScript, generated types, production build, Prettier, `features:check`
and retained Cycle 12 integrity all passing. Main separately captures the actual
current comparison views and runs the all-brand responsive/accessibility integration
suite. This author result does not substitute image fixtures for browser evidence.

No pixels are edited; original approved source and transparent derivative remain
byte-identical. No schema, migration, estimate, ledger, customer/property store,
feature gate, Auth session, provider, message, financial operation, dispatch, hosted
write, Netlify action, deployment, publication or merge is introduced. P1 recovery,
Auth/MFA, NMI, customer14/4B and all existing release restrictions remain separate.

## Owner review checklist

- Existing portal and Property Operations remain within their already approved
  source/artwork scope, including the authorized portal transparency difference.
- Inspect actual supplied desktop/tablet/mobile pairs for each existing contractor
  palette; missing pairs and different synthetic source data are visible.
- Review new isolated Operating Center/add-on visuals before any proposed promotion;
  a green test or this gallery is not approval.
- Resolve unavailable external originals only if they are needed for a later exact
  comparison; do not regenerate or reinterpret approved artwork.
- Keep visual review distinct from the still-blocked Phase One/full-platform release
  and operational acceptance gates.
