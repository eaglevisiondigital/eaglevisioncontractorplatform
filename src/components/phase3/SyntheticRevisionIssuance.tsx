import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type {
  EstimateBundle,
  EstimateInput,
} from '../../domain/estimating/types';
import { formatMinor } from '../../domain/estimating/calculation';
import { customerRevisedEstimateLoop as loop } from '../../lib/customer-revised-estimate-loop';
import {
  customerChangeWorkspace,
  openSyntheticWorkspace,
} from '../../lib/customer-change-workspace';
import { useResource } from '../forms-state';
import { ResourceStatus } from '../forms';

export function SyntheticRevisionIssuance({
  org,
  estimate,
  version,
  revision,
  packetId,
  readinessId,
  editor,
  dirty,
  onIssued,
}: {
  org: string;
  estimate: string;
  version: string;
  revision: number;
  packetId?: string;
  readinessId?: string;
  editor: EstimateInput;
  dirty: boolean;
  onIssued(bundle: EstimateBundle): void;
}) {
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [offer, setOffer] = useState<{ id: string; expires_at: string } | null>(
    null,
  );
  const pending = useRef(false),
    live = useRef(editor),
    mounted = useRef(true);
  useLayoutEffect(() => {
    live.current = editor;
  }, [editor]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentEditor = () => {
    if (!mounted.current) throw Error('Synthetic review closed');
    return live.current;
  };
  const data = useResource(
    useCallback(async () => {
      const actor = customerChangeWorkspace.reviewer(org),
        status = loop.status(org, actor, estimate);
      const review =
        !status && packetId && readinessId
          ? await loop.open(
              org,
              actor,
              estimate,
              version,
              revision,
              packetId,
              readinessId,
            )
          : null;
      return { actor, status, review };
    }, [org, estimate, version, revision, packetId, readinessId]),
  );
  async function run(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      await work();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Synthetic operation unavailable',
      );
    } finally {
      pending.current = false;
      if (mounted.current) {
        setBusy(false);
        setConfirmed(false);
        data.reload();
      }
    }
  }
  const status = data.data?.status,
    record = status?.record;
  const review = data.data?.review;
  return (
    <section
      aria-label="Local revised estimate customer loop"
      className="p3-notice synthetic-revision-loop"
    >
      <span className="eyebrow">LOCAL SYNTHETIC ONLY · NO REAL DELIVERY</span>
      <h2>Return revised estimate to customer review</h2>
      <p>
        This separate test action can lock version 3 and prepare an
        internal-only offer. The 3D readiness verdict remains BLOCKED for
        genuine issuance and delivery. No contract, work, invoice, payment or
        debt is created.
      </p>
      <ResourceStatus {...data} />
      {dirty && (
        <p role="alert">
          Unsaved changes block synthetic issuance. Save and prepare a current
          packet.
        </p>
      )}
      {review && (
        <>
          <h3>Explicit synthetic issuance confirmation</h3>
          <p>
            {review.source.view.comparison.contractor.name} ·{' '}
            {review.source.view.comparison.customer_name} ·{' '}
            {review.source.view.comparison.property_label}
          </p>
          <p>
            Version 2 → Version 3 · Saved revision {revision} ·{' '}
            {formatMinor(
              review.source.view.comparison.revised_scope.totals.total_minor,
              review.source.view.comparison.revised_scope.currency,
            )}
          </p>
          <details>
            <summary>Exact synthetic issuance binding</summary>
            <dl>
              <dt>Original receipt</dt>
              <dd>{review.source.view.comparison.request.id}</dd>
              <dt>Original issued source</dt>
              <dd>{review.source.view.comparison.original.id}</dd>
              <dt>Saved version 3</dt>
              <dd>{version}</dd>
              <dt>Packet / SHA-256</dt>
              <dd>
                {packetId} / {review.source.view.packet.sha256}
              </dd>
              <dt>Canonical selling scope SHA-256</dt>
              <dd>{review.source.view.scope_sha256}</dd>
            </dl>
          </details>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || dirty}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{' '}
            I separately confirm synthetic issuance of this exact saved version
            3 only, with no genuine legal or delivery authority
          </label>
          <button
            disabled={busy || dirty || !confirmed}
            onClick={() =>
              void run(async () => {
                const result = await loop.issue(
                  review,
                  currentEditor,
                  confirmed,
                );
                onIssued(result.bundle);
              })
            }
          >
            Issue exact version 3 — synthetic only
          </button>
        </>
      )}
      {status && (
        <>
          <h3>
            {status.state === 'issued'
              ? 'Version 3 synthetically issued'
              : status.state === 'offered'
                ? 'Internal-only offer prepared'
                : status.state.includes('unknown')
                  ? 'Outcome UNKNOWN — read only'
                  : 'Synthetic operation pending'}
          </h3>
          {record && (
            <details>
              <summary>Synthetic issuance evidence</summary>
              <dl>
                <dt>Issuance</dt>
                <dd>{record.id}</dd>
                <dt>Version / saved revision</dt>
                <dd>
                  {record.version_id} / {record.saved_revision}
                </dd>
                <dt>Original request</dt>
                <dd>{record.request_id}</dd>
                <dt>Packet / SHA-256</dt>
                <dd>
                  {record.packet_id} / {record.packet_sha256}
                </dd>
                <dt>Issued locally</dt>
                <dd>{record.issued_at}</dd>
              </dl>
            </details>
          )}
          {status.state === 'issued' && (
            <>
              <p>
                The original receipt and issued versions are unchanged. Nothing
                has been offered or sent by this transition.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{' '}
                Prepare this exact synthetic issued version in the internal sink
                only
              </label>
              <button
                disabled={busy || !confirmed}
                onClick={() =>
                  void run(async () => {
                    setOffer(
                      await loop.prepareOffer(
                        org,
                        data.data!.actor,
                        estimate,
                        confirmed,
                      ),
                    );
                    setMessage(
                      'Internal sink recorded. No email, SMS, external link or actual delivery.',
                    );
                  })
                }
              >
                Prepare internal-only offer
              </button>
            </>
          )}
          {status.state === 'offered' && (
            <>
              <p>
                Channel: internal_sink · Actual delivery: none. Version 3 has
                its own review and receipt; version 2 response is never
                inherited.
              </p>
              {offer && (
                <p>
                  Offer {offer.id} · Review expires {offer.expires_at}
                </p>
              )}
              <button
                className="secondary"
                onClick={() => openSyntheticWorkspace('customer', org)}
              >
                Review revised version in local customer portal
              </button>
            </>
          )}
          <button
            className="secondary"
            disabled={
              busy || ['issuing', 'preparing_offer'].includes(status.state)
            }
            onClick={() =>
              void run(async () => {
                const result = await loop.reconcile(
                  org,
                  data.data!.actor,
                  estimate,
                );
                if (result.status === 'undetermined')
                  setMessage(
                    'Exact evidence remains undetermined. No replay, replacement or automatic offer.',
                  );
                else {
                  setOffer(result.offer);
                  if (
                    result.result.bundle.version.id === version &&
                    status.state === 'issuance_unknown'
                  )
                    onIssued(result.result.bundle);
                }
              })
            }
          >
            Read exact issuance / offer status
          </button>
        </>
      )}
      <p role="status" aria-live="polite">
        {busy ? 'Checking exact synthetic evidence…' : message}
      </p>
      <small>
        Same-tab memory only. Browser refresh loses this laboratory state; it is
        not genuine Auth, durable custody, issuance permission or real customer
        delivery.
      </small>
    </section>
  );
}
