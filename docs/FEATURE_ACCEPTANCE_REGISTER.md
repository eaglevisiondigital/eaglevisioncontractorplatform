# Propel Contractor Suite — feature acceptance register (initial baseline)
Date: 2026-11-01. This is a seed inventory, NOT an exhaustive code audit or acceptance certificate. Reconcile every line with source/test/CI evidence before upgrading statuses.
Statuses: DESIGN / LOCAL / HOSTED / RELEASE / UNKNOWN. Entries may contain multiple milestones; absence of evidence means UNKNOWN.
| ID | Capability | Present evidence | Current highest supported state | Next acceptance |
|---|---|---|---|---|
| SEC-001 | Multi-tenant security and RLS | PR #1, README, local PG tests | LOCAL | genuine hosted isolation/MFA/privilege acceptance |
| SEC-002 | Independent recovery and revocation | frozen P1 artifacts, synthetic rehearsal | LOCAL | two-device, primary-loss, independently verified recovery |
| CRM-001 | Leads, CRM, customer/property record | README and workstream prototypes | DESIGN/LOCAL partial | source-by-source audit; connected lifecycle |
| EST-001 | Estimate versioning and approved source | 4A/4B evidence and source | LOCAL | genuine Auth customer acceptance |
| EST-002 | Customer decision -> durable admission -> decision -> receipt -> eligible staff | CUSTOMER_BROKER_INTEGRATION.md and validation | LOCAL | physical recovery plus separate hosted authorization |
| SAL-001 | Contracts/e-sign/change orders | README scope | DESIGN | detailed source audit and end-to-end proof |
| FLD-001 | Property visits, maintenance workflows | 2A–2F proposals/tests | LOCAL partial | live authorized technician/staff acceptance |
| FLD-002 | Dispatch/timekeeping/offline field work | product expansion scope | UNKNOWN | contracts, prototypes, user testing |
| FIN-001 | Invoices, schedule, tokenized payments | README and finance proposals | DESIGN/LOCAL partial | provider/merchant/NMI approval and hosted evidence |
| FIN-002 | Profit Guard, purchasing and accounting | product expansion scope | UNKNOWN | financial contracts and accountant review |
| CUS-001 | Branded customer portal/history | customer preview/connected lifecycle | LOCAL partial | authenticated hosted validation |
| CUS-002 | Property Passport and Proof of Work | proposed product differentiation | DESIGN | UX/contracts and privacy review |
| GRO-001 | Maintenance Revenue Engine | recurring-plan scope | DESIGN | generated visits/consent/billing tests |
| GRO-002 | Reviews/referrals/lead automation | proposed product expansion | DESIGN | provider/consent architecture |
| AI-001 | Voice-to-estimate/Copilot | proposed product expansion | DESIGN | human approval, evaluation and privacy |
| INT-001 | Accounting/phone/calendar/supplier integration | scope | UNKNOWN | provider interfaces/contract tests |
| UX-001 | Shared design system and responsive UI | existing preview/browser regressions | LOCAL partial | cross-module component inventory/UX audit |
| OPS-001 | Commercial release and Netlify deploy | PR #1 draft, release restrictions | NOT AUTHORIZED | exact owner-approved release gates |
## Record contract
For every ID add: owner, source paths, Git SHA, tests and CI run, UI route, underlying database objects, hosted evidence, security/risk note, dependency, next action, date and explicit owner approval. Do not infer hosted readiness from green local CI. Existing sealed P1, migration 13, customer14 and 4B artifacts remain protected.
