import { IssuanceReadiness } from './IssuanceReadiness';
import { useCallback, useRef, useState } from 'react';
import {
  customerRevisionPackets,
  type PacketPreview,
} from '../../lib/customer-revision-packets';
import { customerChangeWorkspace } from '../../lib/customer-change-workspace';
import type {
  EstimateBundle,
  EstimateInput,
} from '../../domain/estimating/types';
import type {
  RevisionComparison,
  RevisionScope,
} from '../../domain/estimating/revision-packet';
import { formatMinor } from '../../domain/estimating/calculation';
import { useResource } from '../forms-state';
import { ResourceStatus } from '../forms';

const fieldNames = {
  project: 'Project scope & dates',
  expires_on: 'Expiration date',
  notes: 'Customer notes',
  terms: 'Terms',
  schedule: 'Proposed schedule',
  attachments: 'Customer-visible attachment metadata',
};
const detailNames: Record<string, string> = {
  id: 'Reference',
  name: 'Project',
  type: 'Type',
  description: 'Scope',
  start_on: 'Start date',
  end_on: 'End date',
  label: 'Schedule item',
  kind: 'Type',
  due_on: 'Due date',
  amount_minor: 'Amount',
  display_name: 'Attachment',
  content_type: 'File type',
};
const totalNames = {
  subtotal_minor: 'Subtotal',
  discount_minor: 'Discount',
  tax_minor: 'Tax',
  total_minor: 'Total',
};
function display(value: unknown, currency: string, key?: string): string {
  if (key === 'amount_minor' && typeof value === 'number')
    return formatMinor(value, currency);
  if (value === null || value === '') return 'Not recorded';
  if (typeof value === 'string' || typeof value === 'number')
    return String(value);
  if (Array.isArray(value))
    return value.length
      ? value.map((v) => display(v, currency)).join('\n\n')
      : 'None recorded';
  if (typeof value === 'object' && value)
    return Object.entries(value)
      .map(
        ([k, v]) =>
          `${detailNames[k] ?? k.replaceAll('_', ' ')}: ${display(v, currency, k)}`,
      )
      .join('\n');
  return 'Unavailable';
}
function ScopeLine({
  line,
  currency,
}: {
  line: RevisionScope['lines'][number] | null;
  currency: string;
}) {
  return (
    <div>
      {line ? (
        <>
          <strong>{line.description}</strong>
          <p>
            {(line.quantity_milli / 1000).toLocaleString()}{' '}
            {line.unit.replaceAll('_', ' ')} ·{' '}
            {formatMinor(line.amount_minor, currency)}
          </p>
        </>
      ) : (
        <p>Not included in this version</p>
      )}
    </div>
  );
}
export function RevisionComparisonView({
  value,
}: {
  value: RevisionComparison;
}) {
  return (
    <section
      aria-label="Original versus revised scope"
      className="revision-review-comparison"
    >
      <h3>
        {value.contractor.name} · {value.estimate_number}
      </h3>
      <p>
        {value.customer_name} · {value.property_label}
      </p>
      <blockquote>{value.request.note}</blockquote>
      <details>
        <summary>Exact request and source evidence</summary>
        <dl>
          <dt>Receipt</dt>
          <dd>{value.request.id}</dd>
          <dt>Decision</dt>
          <dd>Changes requested · synthetic preference</dd>
          <dt>Offer</dt>
          <dd>{value.request.offer_id}</dd>
          <dt>Customer</dt>
          <dd>{value.binding.customer_id}</dd>
          <dt>Property</dt>
          <dd>{value.binding.location_id}</dd>
          <dt>Original issued version</dt>
          <dd>{value.original.id}</dd>
          <dt>Saved draft version</dt>
          <dd>{value.revised.id}</dd>
          <dt>Inspection association</dt>
          <dd>
            {value.source_association ? (
              <>
                Report {value.source_association.report_id} · Published version{' '}
                {value.source_association.published_version} · Finding{' '}
                {value.source_association.finding_id} · Source line{' '}
                {value.source_association.source_line_id}
              </>
            ) : (
              'No exact inspection association recorded'
            )}
          </dd>
        </dl>
      </details>
      <div className="revision-review-columns revision-review-heading">
        <div>
          <span className="eyebrow">ORIGINAL · ISSUED</span>
          <h4>Version {value.original.version}</h4>
          <p>{value.original.id}</p>
        </div>
        <div>
          <span className="eyebrow">REVISED · PRIVATE DRAFT</span>
          <h4>
            Version {value.revised.version} · Saved revision{' '}
            {value.revised.saved_revision}
          </h4>
          <p>{value.revised.id}</p>
        </div>
      </div>
      <p>
        Line matching uses exact identities. Customer note text never
        automatically changes scope. Amounts are proposed selling amounts, not
        an invoice or payment mandate.
      </p>
      <h4>Scope line comparison</h4>
      {value.differences.lines.map((line) => (
        <article
          className="revision-review-line"
          key={line.id}
          aria-label={`${line.status} scope line`}
        >
          <strong className="revision-review-status">{line.status}</strong>
          <small>Line {line.id}</small>
          <div className="revision-review-columns">
            <div aria-label="Original line">
              <span className="revision-review-mobile-label">Original</span>
              <ScopeLine
                line={line.before}
                currency={value.original_scope.currency}
              />
            </div>
            <div aria-label="Revised line">
              <span className="revision-review-mobile-label">Revised</span>
              <ScopeLine
                line={line.after}
                currency={value.revised_scope.currency}
              />
            </div>
          </div>
        </article>
      ))}
      <p>
        Line order:{' '}
        {value.differences.line_order_changed ? 'Changed' : 'Unchanged'}
      </p>
      <h4>Customer-facing totals</h4>
      <div className="revision-review-totals">
        {value.differences.totals.map((t) => (
          <article key={t.field}>
            <strong>{totalNames[t.field]}</strong>
            <span>{t.changed ? 'Changed' : 'Unchanged'}</span>
            <p>
              Original {formatMinor(t.before, value.original_scope.currency)}
            </p>
            <p>Revised {formatMinor(t.after, value.revised_scope.currency)}</p>
            <p>
              Difference{' '}
              {formatMinor(t.difference, value.revised_scope.currency)}
            </p>
          </article>
        ))}
      </div>
      <h4>Scope details, terms & scheduling</h4>
      {value.differences.fields.map((f) => (
        <details key={f.field} open={f.changed}>
          <summary>
            {fieldNames[f.field]} · {f.changed ? 'Changed' : 'Unchanged'}
          </summary>
          <div className="revision-review-columns">
            <div>
              <strong>Original</strong>
              <p className="revision-review-text">
                {display(f.before, value.original_scope.currency)}
              </p>
            </div>
            <div>
              <strong>Revised</strong>
              <p className="revision-review-text">
                {display(f.after, value.revised_scope.currency)}
              </p>
            </div>
          </div>
        </details>
      ))}
    </section>
  );
}
export function RevisionReviewPacket({
  org,
  estimate,
  version,
  revision,
  editor,
  dirty,
  onIssued,
}: {
  org: string;
  estimate: string;
  version: string;
  revision: number;
  editor: EstimateInput;
  dirty: boolean;
  onIssued(bundle: EstimateBundle): void;
}) {
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''),
    [packet, setPacket] = useState<PacketPreview>();
  const [view, setView] = useState<'comparison' | 'packet' | 'readiness'>(
    'comparison',
  );
  const pending = useRef(false);
  const data = useResource(
    useCallback(async () => {
      const actor = customerChangeWorkspace.reviewer(org);
      const review = await customerRevisionPackets.review(
        org,
        actor,
        estimate,
        version,
        revision,
      );
      return {
        actor,
        review,
        history: customerRevisionPackets.history(org, actor, estimate),
      };
    }, [org, estimate, version, revision]),
  );
  async function run(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      await work();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Packet review unavailable');
    } finally {
      pending.current = false;
      setBusy(false);
      setConfirmed(false);
      data.reload();
    }
  }
  const held = data.data?.history.some(
    (h) => h.revision === revision || h.state !== 'prepared',
  );
  return (
    <section
      className="revision-review customer-change-review"
      aria-label="Estimate revision review"
    >
      <div className="section-title">
        <div>
          <span className="eyebrow">REVISION REVIEW</span>
          <h2>Compare saved scope & prepare review packet</h2>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setConfirmed(false);
            data.reload();
          }}
        >
          Reload saved comparison
        </button>
      </div>
      <p>
        Staff preview only. No issuance, customer URL, delivery, acceptance,
        contract, work authorization or financial execution.
      </p>
      {dirty && (
        <p role="alert">
          Unsaved editor changes are excluded. Save the draft and reopen its
          current comparison before preparation.
        </p>
      )}
      {packet && (
        <div className="button-row" aria-label="Revision review views">
          <button
            className="secondary"
            aria-pressed={view === 'comparison'}
            onClick={() => setView('comparison')}
          >
            Saved revision comparison
          </button>
          <button
            className="secondary"
            aria-pressed={view === 'packet'}
            onClick={() => setView('packet')}
          >
            Prepared packet preview
          </button>
          <button
            className="secondary"
            aria-pressed={view === 'readiness'}
            onClick={() => setView('readiness')}
          >
            Issuance readiness & delivery dry run
          </button>
        </div>
      )}
      <ResourceStatus {...data} />
      {!data.loading && !data.error && data.data && (
        <>
          {view === 'comparison' && (
            <>
              <RevisionComparisonView value={data.data.review.comparison} />
              <div className="p3-notice">
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={busy || dirty || held}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />{' '}
                  I inspected the exact request and comparison and confirm this
                  current saved draft for a staff-only review packet
                </label>
                <button
                  disabled={busy || dirty || !confirmed || held}
                  onClick={() =>
                    void run(async () => {
                      const result = await customerRevisionPackets.prepare(
                        data.data!.review,
                        editor,
                        confirmed,
                      );
                      setPacket(result);
                      setView('packet');
                      setMessage(
                        'Immutable customer-safe packet prepared. Nothing issued or sent.',
                      );
                    })
                  }
                >
                  Prepare Customer Review Packet
                </button>
                {held && (
                  <p>
                    Preparation for this saved revision is already held or
                    recorded. Read the exact packet evidence; no retry or
                    replacement.
                  </p>
                )}
              </div>
            </>
          )}
          <section aria-label="Review packet history">
            <h3>Retained packet evidence</h3>
            {!data.data.history.length && (
              <p>
                No review packet prepared. Saving a draft never prepares one
                automatically.
              </p>
            )}
            {data.data.history.map((h) => (
              <article key={h.id} className="revision-review-line">
                <strong>
                  Saved revision {h.revision} ·{' '}
                  {h.state === 'prepared'
                    ? h.current && !dirty
                      ? 'Current saved packet'
                      : 'Stale for further use'
                    : h.state === 'unknown'
                      ? 'Outcome UNKNOWN'
                      : 'Preparation pending'}
                </strong>
                <p>{h.id}</p>
                <button
                  className="secondary"
                  disabled={busy || h.state === 'pending'}
                  onClick={() =>
                    void run(async () => {
                      if (h.state === 'unknown') {
                        const result = await customerRevisionPackets.reconcile(
                          org,
                          data.data!.actor,
                          estimate,
                          h.id,
                        );
                        if (result.status === 'prepared') {
                          setPacket(result.packet);
                          setView('packet');
                        } else
                          setMessage(
                            'Packet outcome remains undetermined. No retry, new revision bypass or replacement.',
                          );
                      } else {
                        setPacket(
                          await customerRevisionPackets.read(
                            org,
                            data.data!.actor,
                            estimate,
                            h.id,
                          ),
                        );
                        setView('packet');
                      }
                    })
                  }
                >
                  {h.state === 'unknown'
                    ? 'Read exact packet status'
                    : 'Open packet'}{' '}
                  revision {h.revision}
                </button>
              </article>
            ))}
          </section>
        </>
      )}
      <p role="status" aria-live="polite">
        {busy ? 'Checking exact saved packet evidence…' : message}
      </p>
      {packet && view === 'packet' && (
        <section
          aria-label="Customer review packet staff preview"
          className="p3-notice revision-review-packet"
          data-packet-id={packet.snapshot.id}
        >
          <h2>{packet.snapshot.title}</h2>
          <strong>{packet.snapshot.authority}</strong>
          <p role="status">
            {packet.current &&
            !dirty &&
            !data.error &&
            !data.loading &&
            data.data?.review.revision ===
              packet.snapshot.comparison.revised.saved_revision
              ? 'Current saved snapshot · Staff preview only'
              : 'Stale for further use · Historical snapshot retained unchanged'}
          </p>
          <p>
            Packet {packet.snapshot.id} · Created {packet.snapshot.created_at} ·
            Synthetic reviewer {packet.snapshot.prepared_by}
          </p>
          <details>
            <summary>Snapshot integrity evidence</summary>
            <p>SHA-256: {packet.integrity.sha256}</p>
            <p>
              Integrity of this local snapshot, not a signature, approval or
              delivery receipt.
            </p>
          </details>
          <RevisionComparisonView value={packet.snapshot.comparison} />
        </section>
      )}
      {packet && view === 'readiness' && (
        <IssuanceReadiness
          key={`${packet.snapshot.id}:${revision}`}
          org={org}
          estimate={estimate}
          version={version}
          revision={revision}
          packetId={packet.snapshot.id}
          editor={editor}
          dirty={dirty}
          onIssued={onIssued}
        >
          <RevisionComparisonView value={packet.snapshot.comparison} />
        </IssuanceReadiness>
      )}
      <small>
        In-memory synthetic evidence only. Reload/new tab loses this state. No
        customer access or durability claim.
      </small>
    </section>
  );
}
