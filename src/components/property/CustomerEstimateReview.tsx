import { useRef, useState } from 'react';
import { compareCustomerVersions } from '../../domain/customer/review';
import { formatMinor } from '../../domain/estimating/calculation';
import type {
  CustomerPortalPreviewModel,
  PreviewReviewChoice,
} from '../../lib/customer-preview';
import { CustomerReviewPreference } from './CustomerReviewPreference';

/** Shared safe review presentation; caller supplies the synthetic-only decision operation. */
export function CustomerEstimateReview({
  data,
  busy,
  onRespond,
  onViewReports,
  changeRequests = false,
  onReconcile,
}: {
  data: ReturnType<CustomerPortalPreviewModel['read']>;
  busy: boolean;
  onRespond(
    version: string,
    choice: PreviewReviewChoice,
    consent: boolean,
    note?: string,
  ): Promise<unknown>;
  onViewReports(reportId: string | null): void;
  changeRequests?: boolean;
  onReconcile?(version: string): Promise<unknown>;
}) {
  const [consent, setConsent] = useState(false);
  const [editor, setEditor] = useState<{
    version: string;
    choice: PreviewReviewChoice;
  } | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const [readError, setReadError] = useState('');
  const [sending, setSending] = useState(false);
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
      {!changeRequests && (
        <label>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          Confirm this is a synthetic review only
        </label>
      )}
      {data.reviews.map((r) => {
        const result = data.responses.find(
          (x) => x.version_id === r.version_id,
        );
        const response = result?.decision;
        const held =
          result?.outcome === 'unknown' || result?.outcome === 'pending';
        const unavailable =
          r.review_state === 'expired' ||
          (changeRequests && result?.offer_status !== 'available');
        const open = (
          choice: PreviewReviewChoice,
          button: HTMLButtonElement,
        ) => {
          opener.current = button;
          setReadError('');
          setEditor({ version: r.version_id, choice });
        };
        return (
          <article
            className="finding-card"
            key={r.version_id}
            data-version-id={r.version_id}
          >
            <span className="badge">
              Issued estimate · Version {r.version_number}
            </span>
            {r.version_number === 3 && changeRequests && (
              <p className="customer-preference">
                Revised synthetic version · Internal preview only. This version
                needs a separate response; earlier preferences do not apply.
              </p>
            )}
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
                  : response === 'changes_requested'
                    ? 'Changes requested · synthetic preference'
                    : held
                      ? 'Outcome unavailable · read exact review status'
                      : result?.offer_status === 'unavailable'
                        ? 'Unavailable'
                        : unavailable
                          ? 'Expired'
                          : 'Awaiting your review'}
            </p>
            {changeRequests && response && (
              <section
                className="customer-preference"
                aria-label={`Recorded preference version ${r.version_number}`}
              >
                <p role="status">
                  Synthetic preference recorded for this exact issued version.
                  No work or financial activity authorized.
                </p>
                {result.note && (
                  <>
                    <h4>Your recorded note</h4>
                    <p className="customer-preference-note">{result.note}</p>
                  </>
                )}
                <p>
                  {data.context.company_name} · {data.customerName} ·{' '}
                  {data.context.property_label}
                </p>
                <p>
                  Receipt {result.receipt_id} ·{' '}
                  <time dateTime={result.recorded_at!}>
                    {result.recorded_at}
                  </time>
                </p>
              </section>
            )}
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
                  busy ||
                  sending ||
                  (!changeRequests && !consent) ||
                  !!response ||
                  held ||
                  unavailable
                }
                onClick={(e) =>
                  changeRequests
                    ? open('accepted', e.currentTarget)
                    : void onRespond(r.version_id, 'accepted', consent)
                }
              >
                Preview approve version {r.version_number}
              </button>
              <button
                className="secondary"
                disabled={
                  busy ||
                  sending ||
                  (!changeRequests && !consent) ||
                  !!response ||
                  held ||
                  unavailable
                }
                onClick={(e) =>
                  changeRequests
                    ? open('declined', e.currentTarget)
                    : void onRespond(r.version_id, 'declined', consent)
                }
              >
                Preview decline version {r.version_number}
              </button>
              {changeRequests && (
                <button
                  className="secondary"
                  disabled={
                    busy || sending || !!response || held || unavailable
                  }
                  onClick={(e) => open('changes_requested', e.currentTarget)}
                >
                  Request changes version {r.version_number}
                </button>
              )}
              <button
                className="secondary"
                onClick={() => onViewReports(r.source_report_id)}
              >
                View inspection reports
              </button>
            </div>
            {changeRequests && held && (
              <div className="customer-preference">
                <p role="status">
                  No resubmission is permitted. A missing response does not
                  prove the preference failed.
                </p>
                <button
                  className="secondary"
                  disabled={result?.outcome === 'pending'}
                  onClick={() => {
                    setReadError('');
                    void onReconcile?.(r.version_id).catch(() =>
                      setReadError(
                        'Exact review status remains unavailable. No response was resubmitted.',
                      ),
                    );
                  }}
                >
                  Read exact review status version {r.version_number}
                </button>
                {readError && <p role="alert">{readError}</p>}
              </div>
            )}
            {changeRequests &&
              editor?.version === r.version_id &&
              !response &&
              !held && (
                <CustomerReviewPreference
                  key={r.version_id + editor.choice}
                  data={data}
                  review={r}
                  choice={editor.choice}
                  onRecord={async (note) => {
                    setSending(true);
                    try {
                      return await onRespond(
                        r.version_id,
                        editor.choice,
                        true,
                        note,
                      );
                    } finally {
                      setSending(false);
                    }
                  }}
                  onCancel={() => {
                    setEditor(null);
                    opener.current?.focus();
                  }}
                />
              )}
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
      {data.reviews.length > 2 && (
        <section aria-label="Immutable estimate comparison">
          <h3>What changed between versions?</h3>
          {data.reviews.slice(1).map((revised, i) => (
            <section
              key={revised.version_id}
              aria-label={`Estimate comparison versions ${data.reviews[i].version_number} and ${revised.version_number}`}
            >
              <h4>
                Version {data.reviews[i].version_number} → Version{' '}
                {revised.version_number}
              </h4>
              {compareCustomerVersions(data.reviews[i], revised).map((x) => (
                <p key={x.id}>
                  <strong>
                    {!x.before ? 'Added' : !x.after ? 'Removed' : 'Changed'}
                  </strong>
                  <br />
                  Original:{' '}
                  {x.before
                    ? `${x.before.description} · ${x.before.quantity_milli / 1000} ${x.before.unit.replaceAll('_', ' ')} · ${formatMinor(x.before.amount_minor, data.reviews[i].scope.currency)}`
                    : 'Not included'}
                  <br />
                  Revised:{' '}
                  {x.after
                    ? `${x.after.description} · ${x.after.quantity_milli / 1000} ${x.after.unit.replaceAll('_', ' ')} · ${formatMinor(x.after.amount_minor, revised.scope.currency)}`
                    : 'Removed'}
                </p>
              ))}
              {!compareCustomerVersions(data.reviews[i], revised).length && (
                <p>
                  Scope line descriptions, quantities and selling amounts are
                  unchanged.
                </p>
              )}
              <p>
                Original total{' '}
                {formatMinor(
                  data.reviews[i].scope.total_minor,
                  data.reviews[i].scope.currency,
                )}{' '}
                → Revised total{' '}
                {formatMinor(revised.scope.total_minor, revised.scope.currency)}
              </p>
              <p>
                Customer notes:{' '}
                {data.reviews[i].scope.notes === revised.scope.notes
                  ? 'Unchanged'
                  : 'Changed — review each version above'}
                . Terms:{' '}
                {data.reviews[i].scope.terms === revised.scope.terms
                  ? 'Unchanged'
                  : 'Changed — review each version above'}
                .
              </p>
            </section>
          ))}
        </section>
      )}
    </section>
  );
}
