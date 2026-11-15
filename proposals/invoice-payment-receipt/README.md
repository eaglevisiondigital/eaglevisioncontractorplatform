# Original invoice/payment receipt linkage · UNAPPLIED

This private read proposal links one exact original gateway attempt to its original issued commercial invoice. It reads existing attempts, immutable authorizations and issued headers; it adds no ledger, receipt store, financial engine, writer, connected factory or public/customer route. Parent #474 `18803134e504d52315f495e40766c74bb7e7df5a` and every historical record remain unchanged.

The complete retained identity includes tenant, merchant, provider, invoice, customer, source version/hash/revision, original issuance command, attempt key, authorization, request digest, kind and original capture key. Refunds join the original succeeded capture and its typed invoice source; contradictory typed refund evidence is denied. All-null legacy refund source is permitted only through that exact capture. Legacy captures without typed invoice-source evidence remain UNKNOWN. No latest lookup, replacement identity or text-derived relationship exists.

Current restricted payment-workload authority and the approved sandbox merchant are required before and after reads. The current database principal is authoritative; customer-looking JWT/GUC claims never appoint a reader. No runtime LOGIN principal is created or granted execution by the proposal. The new definer owner is NOLOGIN/NOBYPASSRLS, has finite column reads plus merchant lock-only access, and cannot create records. Proposed SQL is outside migrations, unapplied except inside disposable native qualification.

- **Issuance receipt:** the retained issuance command identifies the original issued header, not a payment.
- **Payment outcome evidence:** one stored succeeded/declined gateway result, or unresolved pending/UNKNOWN. A successful read never releases any hold, replays a command or updates an attempt. Historical payment authorization expiry/revocation never renews write authority.
- **Commercial balance:** NOT_ESTABLISHED. Partial captures/refunds are separate original amounts; this reader does not aggregate or net them, release gross capture capacity or infer payable debt.
- **Settlement / cancellation / dispute:** UNVERIFIED. No cancellation/dispute lifecycle is invented from absent rows or successful gateway/callback results.
- **Customer delivery:** BLOCKED. This is a private merchant-workload reader, not current customer Auth/consent, invoice publication, payment link or actual customer receipt delivery. No notes, name/contact, provider transaction IDs, tokens or credentials are projected.

The existing #474 merchant reconciliation summary remains distinct: its aggregate digests/counts contain no per-transaction invoice mapping. It cannot prove this original attempt was individually present in a genuine provider report. NMI provider report provenance, fees, gross/net/deposit identity and bank matching remain missing. No statement balance is settlement acceptance.

## Qualification

New reader/source controls exercise exact schemas, every scope field, primitive enum validation, nested coercion/Proxy denial, expiry, cancellation and deadline. Native cases use canonical draft/issuance/payment writers with fictional identities and no provider port: actual SQL finish acknowledgment is withheld after commit, then the exact original receipt is read with a separately granted reader-only principal. Partial captures, succeeded/declined/UNKNOWN refunds, tenant/merchant/customer/source separation, original-key recovery, immutable terminal history and observed post-lock workload expiry are covered. Historical accepted #474/capacity/callback suites are not rerun. PGlite explicitly skips the native observed-wait case.

Initial fixture failures are retained privately: attempting to reset an immutable workload lease, PGlite transport metadata beyond the required rows-only port, and a refund fixture using capture authorization kind. They were corrected through fresh per-test leases, the existing rows-only adapter contract and exact refund kind. Independent early review found nested object enum coercion; strict primitive checks and negative hook/Proxy tests now reject it without evaluating hooks or leaking private fields. No assertion, time budget or protected source was weakened.

Five-second JavaScript deadline/cancellation suppresses late output; it does not cancel SQL or prove a connection reusable. Operational connection/pool cancellation/discard, genuine current customer Auth/MFA/publication, installed grants/bypass inventory, independently durable custody/spent fencing, D1–D3, original A01–A12 and recovery remain separate acceptance gates. Calendar numbering proposals are not composed here. Customer intake SQL remains HELD.

Saul 2 Paul first; Cunningham requires separately accepted tenant/customer/Auth/merchant/settlement bindings. No hosted/provider requests, credentials, real invoices/tenants/payments/messages, merge, deployment or operational recovery occurred. **Release 1.0 NO-GO.**
