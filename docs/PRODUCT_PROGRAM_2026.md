# Propel Contractor Suite — integrated product program
Status: owner-directed full parallel buildout, planning and development authorization only.
Date: 2026-11-01. Branch: codex/phase-1-foundation (draft PR #1).
This document is subordinate to existing locked security/recovery/release instructions in AGENTS.md. No merge, production deployment, hosted mutation, payment activation, migration, or release approval is inferred. Preserve original protected files and approvals.

## Product promise
One cohesive, easy-to-learn, multi-tenant contractor system from first lead through estimate, contract, work, payment, retention, reporting and growth. Shared organization/customer/property/job/financial identifiers; strict tenant isolation; accessible mobile-first user experience; minimal duplicate entry. Support small-to-growing contractors and modular vertical templates.

## Workstreams (owner direction; proposed work, not completed delivery)
- A0 safety/release: independent encrypted recovery, genuine MFA/session, historical privileged helpers, core CREATE/stats, dedicated operational connection custody, external restore anchor, original P1-on-13 approvals, separately authorized customer14/4B broker acceptance, NMI merchant/settlement readiness. Frozen release gate.
- A1 platform: organization settings, Super Admin, roles, tenant RLS, secure documents, audit, subscriptions, import/export, observability.
- A2 sales: CRM, leads, website intake, appointment capture, estimate/version/options/PDF, review/approval, e-sign contracts and change orders.
- A3 field: visual scheduling, dispatch, work orders, recurring jobs, crew timekeeping, checklists, materials, offline capture, proof of work, service history.
- A4 finance: invoice/payment schedules, provider tokenization, NMI and approved alternative configurations, reconciliation, payouts, refunds, tax/fee policy, cost-to-complete, purchasing/accounting integrations.
- A5 experience: branded customer portal, Property Passport, maintenance programs, consented messages, approvals, warranties, service completion evidence.
- A6 growth/intelligence: followups, reviews, referrals, online booking, business health, voice-to-estimate, guardrailed Copilot, optional AI answering and storm mode.
- A7 platform integrations: accounting, calendar, telephony, suppliers, trade-specific templates and vetted subcontractor data sharing.
- A8 design/QA: shared tokens/components, responsive accessible interactions, contract compatibility, regression, privacy, security, negative cross-tenant tests.

## Status labels (never collapse)
SCOPE=idea/approved scope; DESIGN=proposal/mock; LOCAL=executable isolated test; CI=passed against exact SHA; HOSTED=connected acceptance; RELEASE=authorized and deployed. Unknown must be marked UNKNOWN. No percentages without traceable acceptance denominator.

## Integration rules
Each workstream owns bounded directories/contracts and a separate branch/worktree/PR. Feature flags default OFF. No concurrent edits to shared migrations/auth/ledger/design tokens without named integrator and coordinated approval. Each PR contains feature ID, acceptance criteria, API/schema/data-contract delta, test and security results, backwards compatibility, migration/rollback plan, UX acceptance and dependency notes. No runtime capability by mock-only or synthetic evidence. All financial actions require separate exact-scope approval. Unified design system and a single integration owner. Main Codex may delegate; it must not claim background persistent autonomy outside active authorized sessions.

## Sequencing
Wave 0: protect current Phase One critical path and close failures/recovery acceptance. Parallel: read-only inventory and interface specifications for remaining modules.
Wave 1: end-to-end operational lead->estimate->contract->schedule->perform->invoice->reconcile with proper release gates.
Wave 2: recurring maintenance, Property Passport, proof-of-work, job costing, customer communication, accounting.
Wave 3: AI, advanced procurement/commercial/verticals, external networks. Implementation tasks can run concurrently when contracts are isolated; releases remain dependency-gated.

## Work allocation
Use initially 3–4 bounded coding worktrees plus separate QA/review. First tasks: (1) audit features into evidence-backed acceptance register, (2) draft shared domain contracts and navigation/design inventory, (3) implement isolated scheduling/field prototype behind OFF flags, (4) draft finance/NMI acceptance and reconciliation plan without credentials or provider calls. Safety team continues recovery prerequisites. Escalate cross-cutting decisions to main integrator.
