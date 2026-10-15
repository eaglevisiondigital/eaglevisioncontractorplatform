# Eagle Vision Contractor Platform

Multi-tenant estimating, contracting, contractor operations, invoicing, and payments software built for Eagle Vision client companies.

## Initial participating business types

- Straight Edge Property Services: repairs, fencing, maintenance, landscaping, property care
- Cunningham Construction: construction and remodeling
- Roofing companies: residential and commercial roof work
- Future construction, maintenance, and field service organizations

**Architecture rule:** One isolated tenant per company; separate staff, customers, documents, estimates, contracts, payment configurations, bank settlement relationships, and reporting. Eagle Vision operates a Super Admin control plane.

## Customer lifecycle

1. Company-specific branded website intake and estimate request, supporting photos and attachments.
2. CRM lead assignment, review, job visit, and customer records.
3. Estimate drafts and versioning: products, materials, labor, quantity, cost, markup, discounts, selected options, notes, taxes and attached documents.
4. Deliver branded estimate by consent-appropriate email and/or SMS using secure expiring links.
5. Customer review, request changes, accept or decline. Preserve accepted version.
6. Generate contract from approved scope with correct jurisdiction- and business-specific terms, e-sign consent, evidence and audit.
7. Customer-authorized deposit, full payment, milestone/progress payments or dated installments.
8. Project tracking, change orders, invoices, receipts, refunds, reminders, accounting exports, reconciliation and closure.

## Payments

Eagle Vision Payments is an integration and orchestration layer; it does not store raw PAN/CVV and is not itself an acquiring bank. Use approved processor/gateway tokens and separate merchant account configurations by organization. Support card and eligible ACH rails, payment authorizations, recurring/scheduled charges, webhook signatures, idempotent transaction handling, reconciliation, failed-payment recovery, disputes, refunds and audit trails. Merchant settlement must go to the correctly authorized merchant/bank configuration.

A user-specified 3.85% processing cost is **not** automatically a permissible customer surcharge. Implement an explicitly configurable, policy-reviewed pricing/fee engine. In particular, prohibit debit/prepaid surcharges where card rules disallow them, enforce credit surcharge network and jurisdiction limits, required disclosures, and cost ceilings. Tax determination must be jurisdiction- and contract-type-aware, especially for construction projects. Do not deploy fee functionality as live until legal and processor review.

## Core domains

- Platform organizations, branding, subscriptions, enabled modules
- Auth, memberships, roles, invitations, staff, organization boundaries
- Customers, contacts, service locations, leads and intake requests
- Projects, site visits, tasks and milestones
- Catalog items, materials, supplier price, labor rate, internal costing
- Estimates, estimate line items, options, revisions, attachments, delivery events, approvals
- Contract templates, documents, signature sessions and execution audit
- Invoices, payment schedules, payment authorizations, payment methods (tokens only)
- Transactions, ledger, refunds, disputes and accounting reconciliation
- Messages, preferences, SMS/email consent and provider events
- Change orders, recurring maintenance agreements and reporting
- Immutable audit records and configurable retention

## Engineering guardrails

- Enforce tenant isolation via database RLS and authorization-safe server APIs; negative cross-tenant tests are release blockers.
- Privileged accounts use MFA; employee access is scoped to company, role and resources.
- Private file storage, signed short-lived downloads, antivirus/content validation, and customer/internal attachment distinctions.
- Sensitive provider secrets in approved secret managers only, never in code, browser bundles, docs, sample records or public logs.
- Keep money as integer minor units, currencies explicit, and financial state machine transitions auditable.
- Financial operations require idempotency keys, signature-verified webhooks, retry protection and reconciliation.
- External communications require preference/consent enforcement and delivery logs.
- Contract and estimate versions become immutable once accepted or executed; adjustments use change orders.
- Tests: unit, integration, tenant-isolation, role boundary, financial arithmetic, concurrency, e-sign, accessibility and mobile customer flow.
- No production writes, live charges, SMS blasts, deployments or irreversible migrations without specific approval.

## Suggested implementation sequence

1. Repository scaffolding, environment model, CI and architecture/security decisions.
2. Organizations, staff roles, super admin, RLS, secure storage and audit.
3. Intake and CRM with embeddable per-company forms.
4. Estimate editor, files, versions, tax/fee policy interface and branded PDFs.
5. Notifications, client estimate portal and acceptance.
6. Contracts, electronic signatures and legal template workflow.
7. Merchant onboarding, payments, schedules, ledger and reconciliation.
8. Projects, change orders, subscriptions, analytics and additional vertical templates.

## Development ownership

- Strategy and final decisions: Eagle Vision product-owner chat.
- Implementation, database, CI and deployment: Codex.
- Documentation research, browser QA and competitor/process validation: Work.

## Initial approval boundaries

This document captures product intent and does not certify that legal, tax, card-network, payment or regulatory requirements are satisfied. Validate each company jurisdiction, merchant processing agreement and contract type before enabling live workflows.
