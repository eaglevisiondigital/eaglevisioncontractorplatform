# Unapplied invoice-number decoder compatibility

The approved customer display is `INV-YYYY-NNNNNN`, separately scoped per
contractor. This candidate tests compatibility with #475's existing numbering SQL;
it does not change allocation, install SQL, authenticate a customer or issue an
invoice. All 2,455 #475 parent files remain unchanged.

## Two separate source-author checkpoints

| Patch    | Exact parent                                      | Target                                                  | Patch SHA256                                                       |
| -------- | ------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| Server   | `e9782d5f9e2422609a993dfe8f836053793620cf` (#475) | `proposals/commercial-invoice-issuance/presentation.ts` | `41327ce1d4f8fed550a9ecc7f2a9cbd211be89f482b8d61c0f2a2b64ff133b8a` |
| Customer | `56b10d2d9c8b86815054d4d5f931f33990ed88eb` (#468) | `src/components/invoices/commercial-customer-read.ts`   | `b2a78a766d58e8991a6dce4b8a44149f975ae63f6ca0622c10bb7fe4cd6a136a` |

Both are one-file modifications, mode `100644`, **unapplied**. `source.json` binds
their original/proposed hashes. They require separate exact approvals on their
respective parents; neither approval would admit or integrate the other patch.

The server presenter accepts a yearly display only when its expected context has
both own, primitive `issuedNumber` and `issuanceReceiptId` anchors matching the
packet and original issuance command. These must come from trusted, current
original-header/receipt resolution, never request fields or a display lookup.
Every existing tenant/customer/location/source/hash/revision/privacy check remains.
Without anchors, the original exact UUID-derived contract remains unchanged.

The customer patch only validates safe display content, accepting the retained UUID
format or the bounded yearly format. Its public target gains no number, receipt
anchor or private source hash. It preserves default-OFF reads, context drift,
expiry, UNKNOWN handling and disabled payment links/delivery. Content validation
does not confer commercial access or prove a balance, payment or settlement.

## Qualification and remaining boundaries

`qualify.mjs` seals both patches, both proposed code payloads and the manifest before
compilation. It verifies the complete current #475 physical frame, the separate
#468 immutable object frame and each returned original SQL/source blob. Unknown,
mixed, coordinated-rebinding, symlink/mode and final-withdrawal cases deny.

Independent QA passed **73 unit/source controls and 8 new native PostgreSQL cases**
with zero failures/skips. Primary native testing passed **28 cases**: the new eight
plus the twenty unchanged #475 numbering cases, including concurrent issuance,
year transition/regression, exhaustion, rollback and original-command reopening.
Tests use disposable identity fixtures and socket-only PostgreSQL; they do not
establish genuine Auth, hosted persistence or independent external custody.

The original #469 connection source guard still **denies** the proposed presenter.
The existing customer bridge still lacks trusted yearly-number anchors. Their
source admission, compatibility and launch integration remain separately held;
neither guard is bypassed or rebound here. No route, credential loader, SQL/grant
installation, provider action, real tenant or operational adapter is enabled.

Phase decision: preserve the approved format and historical receipts; qualify
these two finite source proposals without authoring protected targets. Exact source
authoring, admission/integration, SQL/grants, genuine Auth/MFA and operational
acceptance remain separate approvals. **Release 1.0 remains NO-GO.**
