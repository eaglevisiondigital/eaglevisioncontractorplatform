import { useState } from 'react';
import { compareCustomerVersions } from '../../domain/customer/review';
import { formatMinor } from '../../domain/estimating/calculation';
import type { CustomerPortalPreviewModel } from '../../lib/customer-preview';

/** Shared safe review presentation; caller supplies the synthetic-only decision operation. */
export function CustomerEstimateReview({
  data,
  busy,
  onRespond,
  onViewReports,
}: {
  data: ReturnType<CustomerPortalPreviewModel['read']>;
  busy: boolean;
  onRespond(
    version: string,
    choice: 'accepted' | 'declined',
    consent: boolean,
  ): Promise<unknown>;
  onViewReports(reportId: string | null): void;
}) {
  const [consent, setConsent] = useState(false);
  return (
    <section aria-label="Customer estimate review">
      <h2>Proposed work & issued estimates</h2>
      <p>
        Review each immutable version. Synthetic response examples cannot
        authorize work, invoices, agreements or payments.
      </p>
      {!data.reviews.length && (
        <p>No authorized estimate is available for this property.</p>
      )}
      <label>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        Confirm this is a synthetic review only
      </label>
      {data.reviews.map((r) => {
        const response = data.responses.find(
          (x) => x.version_id === r.version_id,
        )?.decision;
        return (
          <article className="finding-card" key={r.version_id}>
            <span className="badge">
              Issued estimate · Version {r.version_number}
            </span>
            <h3>{r.scope.name}</h3>
            <p>
              {r.source_report_id
                ? 'Repair scope linked to a published inspection finding.'
                : 'Original issued project scope.'}
            </p>
            <p>
              Review status:{' '}
              {response === 'accepted'
                ? 'Approved · synthetic preference'
                : response === 'declined'
                  ? 'Declined · synthetic preference'
                  : r.review_state === 'expired'
                    ? 'Expired'
                    : 'Awaiting your review'}
            </p>
            <p>{r.scope.description}</p>
            <p>
              Review by{' '}
              <time dateTime={r.scope.expires_on}>{r.scope.expires_on}</time>.
              Proposed scope only; this is not an amount due.
            </p>
            <dl>
              {r.scope.lines.map((l) => (
                <div className="customer-scope-line" key={l.id}>
                  <dt>
                    {l.description}
                    <small>
                      {l.quantity_milli / 1000} {l.unit.replaceAll('_', ' ')}
                    </small>
                  </dt>
                  <dd>{formatMinor(l.amount_minor, r.scope.currency)}</dd>
                </div>
              ))}
            </dl>
            <p>
              Discount {formatMinor(r.scope.discount_minor, r.scope.currency)} ·
              Tax {formatMinor(r.scope.tax_minor, r.scope.currency)}
            </p>
            <strong>
              Total {formatMinor(r.scope.total_minor, r.scope.currency)}
            </strong>
            <details>
              <summary>Customer notes & terms</summary>
              <p>{r.scope.notes}</p>
              <p>{r.scope.terms}</p>
            </details>
            <div className="p3-actions">
              <button
                disabled={
                  busy || !consent || !!response || r.review_state === 'expired'
                }
                onClick={() =>
                  void onRespond(r.version_id, 'accepted', consent)
                }
              >
                Preview approve version {r.version_number}
              </button>
              <button
                className="secondary"
                disabled={
                  busy || !consent || !!response || r.review_state === 'expired'
                }
                onClick={() =>
                  void onRespond(r.version_id, 'declined', consent)
                }
              >
                Preview decline version {r.version_number}
              </button>
              <button
                className="secondary"
                onClick={() => onViewReports(r.source_report_id)}
              >
                View inspection reports
              </button>
            </div>
          </article>
        );
      })}
      {data.reviews.length === 2 && (
        <section aria-label="Immutable estimate comparison">
          <h3>What changed between versions?</h3>
          {compareCustomerVersions(data.reviews[0], data.reviews[1]).map(
            (x) => (
              <p key={x.id}>
                {x.after?.description ?? x.before?.description}:{' '}
                {x.before
                  ? formatMinor(
                      x.before.amount_minor,
                      data.reviews[0].scope.currency,
                    )
                  : 'Not included'}{' '}
                →{' '}
                {x.after
                  ? formatMinor(
                      x.after.amount_minor,
                      data.reviews[1].scope.currency,
                    )
                  : 'Removed'}
              </p>
            ),
          )}
        </section>
      )}
    </section>
  );
}
