# Cycle 11 — Durable operating workflow development brief

Date: 2026-11-02. Parent: Cycle 10 PR #67 exact SHA b5721836d248f360312a6c0815ea896ef965ef8e.
Status: APPROVED FOR NON-PRODUCTION DEVELOPMENT, NOT IMPLEMENTED BY THIS DOCUMENT.
Source authority: existing AGENTS.md, master product program, feature/acceptance and delivery registers; exact source and PR head must be checked before coding.

## Goals and parallel assignments

1. FIELD / durable work orders and scheduling: design and implement a disposable, isolated transaction-safe mutation model using existing canonical job/crew/work order identities. Include revision/CAS or equivalent, idempotency, conflict detection across concurrent crew/day proposals and loss-of-acknowledgment outcomes. Prevent duplicated assignment, tenant bleed, stale source, silent rescheduling, and unauthorized dispatch. No hosted writer or live dispatch.
2. FINANCE / exception resolution: canonical read-only exact-source exception drill-down plus staff-reviewed proposed corrections with before/after reconciliation evidence. Prohibit fabricated capture/settlement/refund states and ledger mutations. NMI acceptance remains separate.
3. CUSTOMER / service continuity: guarded service request -> job -> documented completion -> Property Passport navigation with exact IDs and safe projections; no warranty/completion/customer approval inferred from field photos.
4. GROWTH / consent at send: testable atomic authority contract and race/fail-closed acceptance proposal; verify purpose, recipient, enrollment, suppression, sender, timestamp, source revocation immediately before dispatch in a hypothetical transactional boundary. Absolutely no send/outbox/provider call.
5. INTELLIGENCE / operator clarity: improve source-linked daily action center, rank urgency using deterministic explainable criteria, show UNKNOWN/stale and one-click exact local navigation, without autonomous action or cross-tenant leakage.
6. MAIN INTEGRATION / pilot scorecard: prepare source-evidenced Release 1.0 vs complete platform capability matrix with status DESIGN/LOCAL/CI/HOSTED/RELEASE, explicit gates; real workflow click-count usability and mobile accessibility review for the three sample companies.
7. ADVANCED LANES: preserve momentum through scoped non-network contracts and prototypes for offline sync, supplier procurement, QuickBooks/accounting, voice estimating, AI receptionist, storm response, contractor network, trade templates; do not duplicate existing components.

## Execution rules

Start 3–4 independent scoped subagents/worktrees and a separate read-only integration reviewer; report real agent IDs rather than planned roles. Each delivers a draft PR against an exact reviewed parent and demonstrates actual local behavior with source-based tests. Do not rewrite protected shared source, rebase parents silently, or merge the existing stacked PRs. Explicitly flag unknown atomicity and consent until tested.

## Acceptance

Combined disposable proof covering 3 companies, cross-tenant denial, multiple jobs and workers, concurrent conflicts, stale revision/source drift, duplicate requests, lost acknowledgments, privacy, keyboard and accessibility, desktop/tablet/mobile, and default-OFF production route checks. Maintain locked design files and approved interfaces. Record exact SHAs, CI job IDs/results, hashes, defects and resolution, deployment blockers, and independent reviewer verdict.

## Non-negotiable release boundary

No merge, production/Netlify deployment, hosted mutation/migrations, secret handling, real Auth/provider access, payment execution, staff/customer messages, dispatch, contract execution, or capability activation. P1 independent recovery, MFA, historical privileged helpers, connection custody, external restore anchor, customer14/4B approvals and NMI settlement acceptance remain open. Release 1.0 NOT READY / NOT AUTHORIZED.
