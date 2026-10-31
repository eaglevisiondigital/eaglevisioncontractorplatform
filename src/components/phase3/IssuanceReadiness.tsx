import { SyntheticRevisionIssuance } from './SyntheticRevisionIssuance';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  EstimateBundle,
  EstimateInput,
} from '../../domain/estimating/types';
import type { IssuanceReviewView } from '../../domain/estimating/issuance-readiness';
import { formatMinor } from '../../domain/estimating/calculation';
import {
  customerIssuanceReadiness,
  type IssuanceResultPreview,
} from '../../lib/customer-issuance-readiness';
import { customerChangeWorkspace } from '../../lib/customer-change-workspace';
import { useResource } from '../forms-state';
import { ResourceStatus } from '../forms';
import { Field } from './fields';

function Requirements({ view }: { view: IssuanceReviewView }) {
  return (
    <section aria-label="Issuance readiness requirements">
      <h3>Evidence and outstanding prerequisites</h3>
      <p>
        PASS describes a checked local fact. BLOCKED prevents the operation.
        UNVERIFIED means evidence is absent. This review cannot authorize
        issuance or delivery.
      </p>
      <div className="issuance-requirements">
        {view.conditions.map((c) => (
          <article key={c.id} aria-label={`${c.status} ${c.label}`}>
            <strong className="revision-review-status">{c.status}</strong>
            <h4>{c.label}</h4>
            <p>{c.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
function DeliveryContent({ view }: { view: IssuanceReviewView }) {
  return (
    <section
      aria-label="Branded delivery-content dry run"
      className="issuance-delivery"
    >
      <h3>Delivery-content preview — Staff Only</h3>
      <p>
        <strong>Draft Estimate — Not Issued or Sent</strong>
      </p>
      <dl>
        <dt>Sender</dt>
        <dd>UNVERIFIED · not resolved</dd>
        <dt>Recipient</dt>
        <dd>UNVERIFIED · no address resolved</dd>
        <dt>Consent / suppression</dt>
        <dd>UNVERIFIED · no delivery permission inferred</dd>
        <dt>Secure access link</dt>
        <dd>BLOCKED · none created</dd>
      </dl>
      <Field label="Suggested subject line">
        <textarea
          aria-label="Suggested subject line"
          value={view.delivery.subject}
          readOnly
          rows={2}
        />
      </Field>
      <iframe
        title="Branded revised estimate content"
        sandbox=""
        srcDoc={view.delivery.html}
      />
      <details>
        <summary>Suggested message body and escaped HTML</summary>
        <Field label="Suggested message body">
          <textarea
            aria-label="Suggested message body"
            readOnly
            value={view.delivery.text}
            rows={14}
          />
        </Field>
        <pre aria-label="Escaped HTML content">{view.delivery.html}</pre>
      </details>
      <p>
        No recipient lookup, active sender, outbox, provider request, email/SMS,
        customer URL or delivery receipt is created.
      </p>
    </section>
  );
}
export function IssuanceReadiness({
  org,
  estimate,
  version,
  revision,
  packetId,
  editor,
  dirty,
  children,
  onIssued,
}: {
  org: string;
  estimate: string;
  version: string;
  revision: number;
  packetId: string;
  editor: EstimateInput;
  dirty: boolean;
  children: ReactNode;
  onIssued(bundle: EstimateBundle): void;
}) {
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [result, setResult] = useState<IssuanceResultPreview>();
  const [view, setView] = useState<'review' | 'delivery'>('review');
  const pending = useRef(false),
    editorRef = useRef(editor);
  useLayoutEffect(() => {
    editorRef.current = editor;
  }, [editor]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentEditor = () => {
    if (!mounted.current)
      throw Error('Review context closed; read exact outcome without replay');
    return editorRef.current;
  };
  const data = useResource(
    useCallback(async () => {
      const actor = customerChangeWorkspace.reviewer(org);
      const history = customerIssuanceReadiness.history(org, actor, estimate);
      try {
        return {
          actor,
          history,
          review: await customerIssuanceReadiness.open(
            org,
            actor,
            estimate,
            version,
            revision,
            packetId,
          ),
          blocked: '',
        };
      } catch (e) {
        return {
          actor,
          history,
          review: null,
          blocked:
            e instanceof Error ? e.message : 'Current packet unavailable',
        };
      }
    }, [org, estimate, version, revision, packetId]),
  );
  async function run(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      await work();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Readiness unavailable');
    } finally {
      pending.current = false;
      setBusy(false);
      setConfirmed(false);
      data.reload();
    }
  }
  const held = data.data?.history.some(
    (h) => h.packet_id === packetId || h.state !== 'reviewed',
  );
  const currentResult =
    result?.current &&
    !dirty &&
    !data.loading &&
    !data.error &&
    data.data?.review &&
    data.data.review.view.packet.id === result.snapshot.review.packet.id &&
    JSON.stringify(data.data.review.view) ===
      JSON.stringify(result.snapshot.review);
  const review = data.data?.review;
  return (
    <section
      aria-label="Revised estimate issuance readiness"
      className="issuance-readiness"
    >
      <div className="section-title">
        <div>
          <span className="eyebrow">LOCAL REVIEW · NO EXECUTION</span>
          <h2>Revised Estimate — Ready for Issuance Review</h2>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setConfirmed(false);
            data.reload();
          }}
        >
          Reload issuance requirements
        </button>
      </div>
      <p>
        Readiness for staff review is separate from authority to issue. Overall
        issuance and delivery remain BLOCKED.
      </p>
      <ResourceStatus {...data} />
      {dirty && (
        <p role="alert">
          Unsaved editor changes block this review. Save and prepare a matching
          current packet before continuing.
        </p>
      )}
      {data.data?.blocked && <p role="alert">BLOCKED · {data.data.blocked}</p>}
      {result && (
        <div className="button-row" aria-label="Issuance review views">
          <button
            className="secondary"
            aria-pressed={view === 'review'}
            onClick={() => setView('review')}
          >
            Readiness review
          </button>
          <button
            className="secondary"
            aria-pressed={view === 'delivery'}
            onClick={() => setView('delivery')}
          >
            Delivery-content preview
          </button>
        </div>
      )}
      {!data.loading && !data.error && review && view === 'review' && (
        <>
          <h3>
            {review.view.comparison.contractor.name} ·{' '}
            {review.view.comparison.estimate_number}
          </h3>
          <p>
            {review.view.comparison.customer_name} ·{' '}
            {review.view.comparison.property_label}
          </p>
          <blockquote>{review.view.comparison.request.note}</blockquote>
          <div className="revision-review-columns">
            <div>
              <strong>
                Original issued version{' '}
                {review.view.comparison.original.version}
              </strong>
              <p>
                {formatMinor(
                  review.view.comparison.original_scope.totals.total_minor,
                  review.view.comparison.original_scope.currency,
                )}
              </p>
            </div>
            <div>
              <strong>
                Revised draft version {review.view.comparison.revised.version} ·
                Saved revision {revision}
              </strong>
              <p>
                {formatMinor(
                  review.view.comparison.revised_scope.totals.total_minor,
                  review.view.comparison.revised_scope.currency,
                )}
              </p>
            </div>
          </div>
          <details>
            <summary>Exact readiness source and integrity</summary>
            <dl>
              <dt>Original issued version</dt>
              <dd>{review.view.comparison.original.id}</dd>
              <dt>Revised draft</dt>
              <dd>{version}</dd>
              <dt>Request receipt / offer</dt>
              <dd>
                {review.view.comparison.request.id} /{' '}
                {review.view.comparison.request.offer_id}
              </dd>
              <dt>Current packet UUID</dt>
              <dd>{review.view.packet.id}</dd>
              <dt>Packet SHA-256</dt>
              <dd>{review.view.packet.sha256}</dd>
              <dt>Canonical customer scope SHA-256</dt>
              <dd>{review.view.scope_sha256}</dd>
              <dt>Customer / property</dt>
              <dd>
                {review.view.comparison.binding.customer_id} /{' '}
                {review.view.comparison.binding.location_id}
              </dd>
            </dl>
          </details>
          <details>
            <summary>Scope, dates, terms & change details</summary>
            {children}
          </details>
          <Requirements view={review.view} />
          <div className="p3-notice">
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy || dirty || held}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{' '}
              I inspected these exact requirements and confirm a local
              review-only result, with no approval, issuance or delivery
              authority
            </label>
            <button
              disabled={busy || dirty || held || !confirmed}
              onClick={() =>
                void run(async () => {
                  setResult(
                    await customerIssuanceReadiness.record(
                      review,
                      currentEditor,
                      confirmed,
                    ),
                  );
                  setMessage(
                    'Review-only result recorded. Issuance and delivery remain BLOCKED.',
                  );
                })
              }
            >
              Review Issuance Requirements
            </button>
            {held && (
              <p>
                This review is already held or recorded. Read its exact result;
                no replay or replacement.
              </p>
            )}
          </div>
        </>
      )}
      {result && (
        <section
          aria-label="Recorded issuance readiness result"
          data-review-id={result.snapshot.id}
          className="p3-notice"
        >
          <h3>Review result — {result.snapshot.verdict}</h3>
          <strong>{result.snapshot.authority}</strong>
          <p role="status">
            {currentResult
              ? 'Current local review — issuance and delivery remain BLOCKED'
              : 'Stale for further use — historical review retained unchanged'}
          </p>
          <details>
            <summary>Exact recorded review evidence</summary>
            <p>
              Review {result.snapshot.id} · {result.snapshot.reviewed_at} ·
              Synthetic reviewer {result.snapshot.reviewer}
            </p>
            <p>Review SHA-256: {result.sha256}</p>
            <p>
              Packet {result.snapshot.review.packet.id} · SHA-256:{' '}
              {result.snapshot.review.packet.sha256}
            </p>
          </details>
          {view === 'delivery' ? (
            <DeliveryContent view={result.snapshot.review} />
          ) : (
            <p>
              Review-only evidence is recorded. Use Delivery-content preview to
              inspect the branded proposed content; no sending is enabled.
            </p>
          )}
        </section>
      )}
      {result && currentResult && (
        <SyntheticRevisionIssuance
          org={org}
          estimate={estimate}
          version={version}
          revision={revision}
          packetId={packetId}
          readinessId={result.snapshot.id}
          editor={editor}
          dirty={dirty}
          onIssued={onIssued}
        />
      )}
      {!data.error && data.data && (
        <section aria-label="Issuance review history">
          <h3>Retained local review evidence</h3>
          {!data.data.history.length && (
            <p>
              No issuance-readiness dry run recorded. Packet preparation alone
              never records one.
            </p>
          )}
          {data.data.history.map((h) => (
            <article className="revision-review-line" key={h.id}>
              <strong>
                Saved revision {h.revision} ·{' '}
                {h.state === 'unknown'
                  ? 'Outcome UNKNOWN'
                  : h.state === 'pending'
                    ? 'Pending'
                    : 'Review only · BLOCKED'}
              </strong>
              <p>{h.id}</p>
              <button
                className="secondary"
                disabled={busy || h.state === 'pending'}
                onClick={() =>
                  void run(async () => {
                    if (h.state === 'unknown') {
                      const r = await customerIssuanceReadiness.reconcile(
                        org,
                        data.data!.actor,
                        estimate,
                        h.id,
                      );
                      if (r.status === 'reviewed') setResult(r.result);
                      else
                        setMessage(
                          'Readiness remains undetermined. No retry, replacement or new-revision bypass.',
                        );
                    } else
                      setResult(
                        await customerIssuanceReadiness.read(
                          org,
                          data.data!.actor,
                          estimate,
                          h.id,
                        ),
                      );
                  })
                }
              >
                {h.state === 'unknown'
                  ? 'Read exact readiness status'
                  : 'Open readiness result'}{' '}
                revision {h.revision}
              </button>
            </article>
          ))}
        </section>
      )}
      <p role="status" aria-live="polite">
        {busy ? 'Checking exact local readiness evidence…' : message}
      </p>
      <small>
        Session memory only. Reload/new tab loses this dry run; it is not
        durable approval, genuine Auth or delivery evidence.
      </small>
    </section>
  );
}
