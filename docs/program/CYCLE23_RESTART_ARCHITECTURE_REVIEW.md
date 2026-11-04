# Cycle 23 · independent canonical restart architecture review

Reviewer: `/root/cycle23_finance_intelligence`, independently of the proposal author.
Reviewed proposal commit: `52848cdc5cbfb16bdf6b553293362d129a1b23b9` (draft PR #156).
Authoritative source baseline: `3e35fb29dd4488bf655446712e5a013e06f8ed1e`.
Verdict: **CLEAR_FOR_SEPARATE_DESIGN_DECISION_ONLY**. There is no implementation,
installation, restoration or writer-admission authorization. Operational restoration
remains **NO-GO**. No blocking contradiction was found in the proposal's stated
limits; the unresolved implementation requirements below remain release blockers.

This is a source and architecture review, not an executed recovery test. Sixteen
inspected source/runbook files exactly match the baseline; their byte hashes are in
the companion review JSON. The reviewed commit changes only the two proposal files.
No application code, SQL, migration, credentials or existing approval was changed.

## Source-based findings

1. **Canonical ownership is retained.** `Operations`, `Phase3Repository` and
   `PropertyRepository` remain the CRM, estimating/job/time and inspection owners.
   The proposal does not promote a projection or a serialized repository object
   graph into another owner. Its admitted ports do not supply an operational durable
   work-order or maintenance writer: that missing ownership is explicitly unresolved.
   A future design must name every participating writer, including raw/admin paths;
   local composed-path tests cannot establish universal participation. The original
   `MAINTENANCE_COMMAND_AUTHORITY.md` D009 least-privilege block remains relevant.
2. **Current session custody is not restart custody.**
   `saved-revision-exercise.ts:81` stores attempts in a WeakMap keyed by original
   Operations plus company/job. Its exact reconciliation at line1135 explicitly
   never clears UNKNOWN. Reconstructing the environment or importing a file cannot
   reconstruct this authority. The proposal correctly requires a reviewed original
   durable admission owner before any future write-capable restart adapter.
3. **Historical evidence is explicitly non-authoritative.**
   `saved-evidence-files.ts:138,178,211` returns `canonical_restore:false` even when
   exact bytes or durable file acknowledgment exist. It trusts the local owner and
   disk. The proposal does not treat a digest/fsync/download as authenticated receipt
   custody or business restoration. No new evidence-file replay route is proposed.
4. **Cross-transaction failure windows remain real.**
   `broker.ts:176` commits broker admission before the original gateway claim;
   `request-gateway.ts:76` commits the issuer before the consumer commit at line86.
   The proposal correctly avoids distributed-atomicity claims. Loss between these
   commits consumes/ambiguates the original attempt; missing outcome evidence cannot
   authorize a replacement ID or repeat. Future success ACK proof must separately
   establish canonical commit, exact receipt and required admission durability.
5. **Rollback protection is not old-backup protection.** The original broker review
   explicitly reports the absence of an independent external restore anchor
   (`CUSTOMER_BROKER_INTEGRATION.md:106`). The maintenance authority record also
   describes sequence uncertainty on some cluster crashes (line105). The proposal
   accurately leaves rollback-resistant external fencing unimplemented. A database,
   local custody file, sequence or same-machine hash alone cannot satisfy its writer
   restart gate. The epoch/watermark owner, quorum/failure behavior and full writer
   fencing must be separately designed and demonstrated.
6. **Receipt authenticity is still unresolved.** Original strict receipt parsing and
   hashes demonstrate exact content within the tested trust boundary. They do not
   authenticate replacement by the same privileged owner. The proposed canonical
   encoding, append-only receipt/result linkage and high-water marks are appropriate
   requirements, but signer/witness ownership, key lifecycle/revocation, format
   compatibility and rollback protection remain undecided. None exists by virtue of
   this review, and no signing or credential implementation is authorized.
7. **Tenant and current-authority checks remain separate from restore integrity.**
   The broker verifies the exact bearer/current session before admitting claims
   (`broker-auth.ts:45`); sample repository checks are not genuine hosted acceptance.
   The proposal preserves organization/customer/location/job/source identity,
   composite tenant FKs, RLS, explicit grants and current revocation/MFA checks.
   Target catalog, function ownership, genuine sessions and the full installer/helper
   TCB still need action-specific review. An old restored membership or token may not
   revive authority. [Official session guidance](https://supabase.com/docs/guides/auth/sessions)
   confirms that sensitive revocation checks can validate the session row and that
   configured session limits are not all enforced immediately.
8. **A matched backup set is an unverified requirement.** The proposal explicitly
   joins database recovery point, original custody epoch, immutable receipt watermark,
   object versions and protected key references. It does not claim that any current
   target backup implements this set. [Official backup documentation](https://supabase.com/docs/guides/platform/backups)
   confirms that database backups omit Storage object bytes and downloadable daily
   backups omit custom-role passwords. RPO/RTO, encryption/key custody, retention,
   deletion, tenant-safe restoration and missing-member rejection remain unmeasured.
9. **Policy defaults do not prove existing grants safe.** The reviewed
   [official API privilege change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
   leaves existing table grants unchanged. [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
   treats object privileges and row filtering as distinct controls. The proposal
   correctly requires a target-specific catalog/negative-test review rather than
   assuming a default or successful local source check establishes protection.
10. **Physical and operational acceptance remain distinct.** The unchanged November4
    Air checklist requires observed maintained OS, FileVault, independent power/
    network, authenticated pairing, durable ACKs, supervision, independent recovery
    and cleanup. All remain UNVERIFIED/NOT RUN here. Even a successful synthetic
    rehearsal would not accept a future business database restoration adapter.
    Original P1 approval remains valid in its exact separate sequence; it is not
    duplicated or broadened by this document.

## Decision boundary

The proposal is sufficiently explicit for a separate owner design decision. It is
not a complete implementation specification or an operational acceptance package.
Before a write-capable prototype, separately review the exact original durable owner,
writer participation, anti-rollback fence, canonical transaction/receipt protocol,
current-auth revalidation and matched recovery set. Keep all writers fenced until
unknowns are reconciled read-only and a separately approved exact admission permits
otherwise. Proposed acceptance rows are **NOT RUN**, not successful test evidence.

Review methods: source reads/diffs/hashes, original authoritative security/recovery
records, and official documentation read November3,2026. Supabase documentation
search was read-only. The changelog Markdown/index fetch was unavailable through the
web reader; the exact linked breaking-change page and current relevant guides were
successfully inspected. No target backup, credential, live catalog, hosted Auth,
provider or physical device was accessed. The ordinary protected source checker was
not rerun for these two prose review files; proposal/source byte equality was checked.

No schema, adapter, installer, server writer, historical-file restoration, hosted
mutation, financial/NMI execution, dispatch, communication, merge or deployment is
authorized. All frozen P1/customer14/4B/MFA/Auth/Netlify/NMI, original design approvals,
protected migrations/artifacts and recovery boundaries remain. **Release1.0 remains
NOT READY / NOT AUTHORIZED.**
