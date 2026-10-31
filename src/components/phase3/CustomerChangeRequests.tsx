import { useCallback, useRef, useState } from 'react';
import {
  customerChangeWorkspace as workspace,
  openSyntheticWorkspace,
  type ChangeReview,
} from '../../lib/customer-change-workspace';
import type { CompanyProfile } from '../../domain/platform';
import type { EstimateBundle } from '../../domain/estimating/types';
import { useResource } from '../forms-state';
import { ResourceStatus } from '../forms';

export function CustomerChangeRequests({
  company,
  onOpen,
}: {
  company: CompanyProfile;
  onOpen(bundle: EstimateBundle): void;
}) {
  const [review, setReview] = useState<ChangeReview>();
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const data = useResource(
    useCallback(async () => {
      const actor = workspace.reviewer(company.id);
      return { actor, requests: workspace.requests(company.id, actor) };
    }, [company.id]),
  );
  async function run(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      await work();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Review unavailable');
    } finally {
      pending.current = false;
      setBusy(false);
      data.reload();
    }
  }
  return (
    <section
      className="p3-notice customer-change-review"
      aria-label="Customer change requests"
    >
      <div className="section-title">
        <div>
          <span className="eyebrow">CUSTOMER FOLLOW-UP</span>
          <h3>Customer change requests</h3>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setReview(undefined);
            setConfirmed(false);
            data.reload();
          }}
        >
          Refresh requests
        </button>
      </div>
      <p>
        Review the original request before preparing a private revision. No
        estimate is issued, sent or authorized by this review.
      </p>
      <ResourceStatus {...data} />
      {!data.loading && !data.error && data.data?.requests.length === 0 && (
        <p>
          No customer change requests in this tab. Open the local customer
          portal and record a request, then return using its development
          controls.
        </p>
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={() => openSyntheticWorkspace('customer', company.id)}
      >
        Open local customer portal
      </button>
      {data.data?.requests.map((r) => (
        <article key={r.receipt.id} className="customer-change-card">
          <h4>
            {r.version.payload.project.name} · Version{' '}
            {r.version.version_number}
          </h4>
          <p>
            {r.customer_name} · {r.property_label}
          </p>
          <blockquote>{r.receipt.note}</blockquote>
          <p>
            Recorded {new Date(r.receipt.created_at).toLocaleString()} ·{' '}
            {r.outcome === 'prepared'
              ? 'Draft prepared'
              : r.outcome === 'unknown'
                ? 'Outcome UNKNOWN · read only'
                : r.outcome === 'pending'
                  ? 'Preparation pending'
                  : 'Awaiting staff review'}
          </p>
          <details>
            <summary>Exact customer request evidence</summary>
            <dl>
              <dt>Receipt</dt>
              <dd>{r.receipt.id}</dd>
              <dt>Offer</dt>
              <dd>{r.offer_id}</dd>
              <dt>Published estimate version</dt>
              <dd>{r.version.id}</dd>
              <dt>Customer</dt>
              <dd>{r.receipt.customer_id}</dd>
              <dt>Property</dt>
              <dd>{r.location_id}</dd>
            </dl>
          </details>
          <div className="button-row">
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setConfirmed(false);
                  setReview(undefined);
                  setReview(
                    await workspace.review(
                      company.id,
                      data.data!.actor,
                      r.receipt.id,
                    ),
                  );
                })
              }
            >
              Review request version {r.version.version_number}
            </button>
            {['unknown', 'prepared'].includes(r.outcome) && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await workspace.reconcile(
                      company.id,
                      data.data!.actor,
                      r.receipt.id,
                    );
                    if (result.status === 'prepared') onOpen(result.bundle);
                    else
                      setMessage(
                        'Outcome remains undetermined. No retry or replacement is allowed.',
                      );
                  })
                }
              >
                Read exact revision status
              </button>
            )}
          </div>
        </article>
      ))}
      {review && (
        <div
          role="region"
          aria-label="Staff revision confirmation"
          className="customer-change-card"
        >
          <h4>
            Review version {review.request.version.version_number} before
            revision
          </h4>
          <p>
            {review.request.customer_name} · {review.request.property_label}
          </p>
          <blockquote>{review.request.receipt.note}</blockquote>
          <p>
            Estimate: {review.source.estimate.estimate_number} ·{' '}
            {review.source.estimate.id}
            <br />
            Source version: {review.request.version.id}
            <br />
            Receipt: {review.request.receipt.id}
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => onOpen(review.source)}
          >
            Open exact issued version
          </button>
          {review.blocked ? (
            <p role="status">{review.blocked}</p>
          ) : (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{' '}
                I reviewed this exact customer request and confirm preparation
                of a private draft only
              </label>
              <button
                disabled={
                  busy || !confirmed || review.request.outcome !== 'unreviewed'
                }
                onClick={() =>
                  void run(async () => {
                    const bundle = await workspace.prepare(review, confirmed);
                    onOpen(bundle);
                  })
                }
              >
                Prepare revised estimate draft
              </button>
            </>
          )}
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              setReview(undefined);
              setConfirmed(false);
            }}
          >
            Cancel staff review
          </button>
        </div>
      )}
      <p role="status" aria-live="polite">
        {busy ? 'Checking exact request evidence…' : message}
      </p>
      <small>
        Synthetic same-tab state only. Refreshing the browser clears the
        demonstration; a new tab has a separate session.
      </small>
    </section>
  );
}
