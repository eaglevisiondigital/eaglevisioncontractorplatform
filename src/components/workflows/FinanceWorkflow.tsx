import type { FinanceWorkflowReview } from '../../lib/workflows/finance-workflow';
import { formatMinor } from '../../domain/estimating/calculation';
import './finance-workflow.css';

/** Pure default-OFF staff presentation. Parent owns exact context and explicit review controls. */
export function FinanceWorkflow({
  review,
  enabled = false,
  loading = false,
  error = null,
}: {
  review: FinanceWorkflowReview | null;
  enabled?: boolean;
  loading?: boolean;
  error?: string | null;
}) {
  if (!enabled)
    return (
      <section className="finance-workflow" aria-label="Finance workflow">
        <h2>Finance workflow</h2>
        <p>
          Finance source review is off. Explicit local staff confirmation is
          required.
        </p>
      </section>
    );
  if (loading)
    return (
      <section className="finance-workflow" aria-label="Finance workflow">
        <h2>Finance workflow</h2>
        <p role="status">Reading exact saved job and issued scope…</p>
      </section>
    );
  if (error)
    return (
      <section className="finance-workflow" aria-label="Finance workflow">
        <h2>Finance workflow</h2>
        <p role="alert">{error}</p>
        <p>
          Previous figures are withheld. Refresh the exact source before another
          local review.
        </p>
      </section>
    );
  if (!review)
    return (
      <section className="finance-workflow" aria-label="Finance workflow">
        <h2>Finance workflow</h2>
        <p>
          No source review prepared. Select a saved job and explicitly confirm
          this local review.
        </p>
      </section>
    );
  const { invoicePreparation: invoice, costReview: cost, currency } = review;
  const money = (amount: number) => formatMinor(amount, currency);
  return (
    <section className="finance-workflow" aria-label="Finance workflow">
      <header>
        <p className="finance-workflow-eyebrow">Existing-source staff review</p>
        <h2>Costs, margin &amp; invoice preparation</h2>
        <p>
          Local synthetic review only. No invoice, contract, payment, work
          authorization or customer obligation is created.
        </p>
      </header>
      <div className="finance-workflow-grid">
        <section
          aria-label="Canonical job cost review"
          className="finance-workflow-card"
        >
          <h3>Job costs &amp; coverage</h3>
          <p className="finance-workflow-status">
            Recorded cost coverage: {cost.status}
          </p>
          {cost.completion.totals ? (
            <dl className="finance-workflow-totals">
              <dt>Recorded expense &amp; locked labor</dt>
              <dd>{money(cost.completion.totals.recordedMinor)}</dd>
              <dt>Unpaid commitments</dt>
              <dd>{money(cost.completion.totals.unpaidCommitmentMinor)}</dd>
              <dt>Remaining forecast</dt>
              <dd>{money(cost.completion.totals.remainingForecastMinor)}</dd>
              <dt>Projected cost</dt>
              <dd>{money(cost.completion.totals.projectedMinor)}</dd>
              <dt>Projected contribution</dt>
              <dd>
                {cost.profitability
                  ? money(cost.profitability.projectedContributionMinor)
                  : 'UNKNOWN'}
              </dd>
            </dl>
          ) : (
            <p>
              UNKNOWN — exact labor or cost coverage is unavailable. Amounts
              remain withheld; missing evidence is not zero cost.
            </p>
          )}
          <p>
            Forecasts are additive to unpaid commitments. Contribution excludes
            unallocated overhead and is not final business profit.
          </p>
          <details>
            <summary>Review cost and margin signals</summary>
            <ul className="finance-workflow-signals">
              {cost.cards.map((card, index) => (
                <li key={`${card.code}:${card.category}:${index}`}>
                  <strong>
                    {card.level}
                    {card.category ? ` · ${card.category}` : ''}
                  </strong>
                  <span>{card.label}</span>
                </li>
              ))}
            </ul>
          </details>
        </section>
        <section
          aria-label="Canonical issued scope"
          className="finance-workflow-card"
        >
          <h3>Issued scope for invoice requirements review</h3>
          <p>{invoice.scope.project.name}</p>
          <p>
            Version {invoice.issued.version_number} · saved revision{' '}
            {invoice.issued.saved_revision} · {currency}
          </p>
          <dl className="finance-workflow-totals">
            <dt>Subtotal</dt>
            <dd>{money(invoice.scope.totals.subtotal_minor)}</dd>
            <dt>Discount</dt>
            <dd>{money(invoice.scope.totals.discount_minor)}</dd>
            <dt>Saved tax</dt>
            <dd>{money(invoice.scope.totals.tax_minor)}</dd>
            <dt>Customer-facing total</dt>
            <dd>{money(invoice.scope.totals.total_minor)}</dd>
          </dl>
          <details>
            <summary>Inspect exact issued scope lines</summary>
            <ul className="finance-workflow-signals">
              {invoice.scope.lines.map((line) => (
                <li key={line.id}>
                  <strong>{line.description}</strong>
                  <span>
                    {line.quantity_milli / 1000} {line.unit} ·{' '}
                    {money(line.amount_minor)}
                  </span>
                  <code>{line.id}</code>
                </li>
              ))}
            </ul>
          </details>
        </section>
      </div>
      <section
        className="finance-workflow-card"
        aria-label="Invoice preparation requirements"
      >
        <h3>{invoice.label}</h3>
        <p className="finance-workflow-status">
          {invoice.overall} · {invoice.status}
        </p>
        <p>
          Contract absence is expected in this local flow. An issued estimate or
          reported work does not authorize invoice creation.
        </p>
        <ul className="finance-workflow-requirements">
          {invoice.requirements.map((requirement) => (
            <li key={requirement.id}>
              <strong>{requirement.id.replaceAll('_', ' ')}</strong>
              <span>{requirement.status}</span>
              <p>{requirement.detail}</p>
            </li>
          ))}
        </ul>
        <details>
          <summary>Exact original source references</summary>
          <dl className="finance-workflow-source">
            <dt>Job / revision</dt>
            <dd>
              {review.target.job_id} / {review.job_revision}
            </dd>
            <dt>Customer</dt>
            <dd>{review.target.customer_id}</dd>
            <dt>Property</dt>
            <dd>{review.target.location_id}</dd>
            <dt>Issued estimate</dt>
            <dd>{invoice.issued.estimate_id}</dd>
            <dt>Issued version</dt>
            <dd>{invoice.issued.version_id}</dd>
            <dt>Existing invoice</dt>
            <dd>
              {invoice.reference.invoice_number ?? 'UNKNOWN — none selected'}
            </dd>
            <dt>Job–invoice relationship</dt>
            <dd>{invoice.relationship.meaning}</dd>
            <dt>Review integrity</dt>
            <dd>
              <code>{review.sha256}</code>
            </dd>
          </dl>
        </details>
      </section>
      <section
        className="finance-workflow-card"
        aria-label="Accounting and procurement handoff"
      >
        <h3>Controlled handoff review</h3>
        <p>
          Accounting: {review.accountingHandoff.status}.{' '}
          {review.accountingHandoff.reason}
        </p>
        <p>
          Procurement: {review.procurementHandoff.status}. Order approval
          remains {review.procurementHandoff.approval}; current procurement
          admission is UNKNOWN.
        </p>
        <p>
          All NMI, settlement, sender, genuine authentication and financial
          execution gates remain unverified or closed.
        </p>
      </section>
    </section>
  );
}
