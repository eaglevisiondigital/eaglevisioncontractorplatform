import { useEffect, useState } from 'react';
import type { Phase3Repository } from '../../lib/phase3';
import type { ReleasePreview } from '../../domain/release/preview';
import { formatMinor } from '../../domain/estimating/calculation';
import {
  readSalesApprovalHandoff,
  captureSalesApprovedScopeReference,
  verifySalesApprovedScopeReference,
  type SalesApprovedScopeReference,
  type SalesScopeReferenceRead,
  type SalesHandoffTarget,
  type SalesApprovalHandoff as Handoff,
} from '../../lib/sales-approval-handoff';
import './sales-approval-handoff.css';

/** Unmounted and default OFF. Only an explicitly composed local test may opt in. */
export function SalesApprovalHandoff({
  repo,
  release,
  target,
  enabled = false,
}: {
  repo: Phase3Repository;
  release: ReleasePreview;
  target: SalesHandoffTarget;
  enabled?: boolean;
}) {
  return enabled === true && repo.operations.sample ? (
    <ReadOnlyHandoff
      key={JSON.stringify(target)}
      repo={repo}
      release={release}
      target={target}
    />
  ) : null;
}
function ReadOnlyHandoff({
  repo,
  release,
  target,
}: {
  repo: Phase3Repository;
  release: ReleasePreview;
  target: SalesHandoffTarget;
}) {
  const [revision, reload] = useState(0);
  const [read, setRead] = useState<{
    repo: Phase3Repository;
    release: ReleasePreview;
    revision: number;
    value: Handoff;
  }>();
  const [confirmed, confirm] = useState<Handoff>();
  const [capture, setCapture] = useState<{
    repo: Phase3Repository;
    release: ReleasePreview;
    reference: SalesApprovedScopeReference;
    verification?: SalesScopeReferenceRead;
  }>();
  const [action, setAction] = useState<{
    repo: Phase3Repository;
    release: ReleasePreview;
    kind: 'capture' | 'verify' | 'error';
  }>();
  useEffect(() => {
    let current = true;
    void readSalesApprovalHandoff(repo, release, target).then((value) => {
      if (current) setRead({ repo, release, revision, value });
    });
    return () => {
      current = false;
    };
  }, [repo, release, target, revision]);
  const value =
    read?.repo === repo &&
    read.release === release &&
    read.revision === revision
      ? read.value
      : undefined;
  const source = value?.source,
    scope = source?.scope;
  const retained =
    capture?.repo === repo && capture.release === release ? capture : undefined;
  const currentAction =
    action?.repo === repo && action.release === release
      ? action.kind
      : undefined;
  const busy = currentAction === 'capture' || currentAction === 'verify';
  async function retain() {
    if (
      !value ||
      confirmed !== value ||
      value.status !== 'scope_matched' ||
      busy
    )
      return;
    setAction({ repo, release, kind: 'capture' });
    try {
      const reference = await captureSalesApprovedScopeReference(
        repo,
        release,
        target,
        true,
        value.source!.scope_hash,
      );
      setCapture({ repo, release, reference });
      confirm(undefined);
      setAction(undefined);
    } catch {
      setAction({ repo, release, kind: 'error' });
      hideUnavailable(
        'UNKNOWN — reference capture was denied, stale or unavailable. No command was executed.',
      );
    }
  }
  async function verify() {
    if (!retained || busy) return;
    setAction({ repo, release, kind: 'verify' });
    const verification = await verifySalesApprovedScopeReference(
      repo,
      release,
      target,
      retained.reference,
    );
    setCapture((previous) =>
      previous?.reference === retained.reference
        ? { ...previous, verification }
        : previous,
    );
    if (verification.status === 'unknown') hideUnavailable(verification.reason);
    if (verification.status === 'stale') {
      setRead((previous) =>
        previous?.repo === repo &&
        previous.release === release &&
        previous.revision === revision
          ? {
              ...previous,
              value: {
                ...previous.value,
                status: 'blocked',
                blockers: [...previous.value.blockers, verification.reason],
              },
            }
          : previous,
      );
    }
    setAction(undefined);
  }
  function hideUnavailable(reason: string) {
    setRead((previous) =>
      previous?.repo === repo &&
      previous.release === release &&
      previous.revision === revision
        ? {
            ...previous,
            value: {
              ...previous.value,
              status: 'unknown',
              source: null,
              offer: null,
              receipt: null,
              blockers: [reason],
            },
          }
        : previous,
    );
  }
  return (
    <section
      className="sales-handoff"
      aria-label="Estimate to contract handoff"
    >
      <header>
        <span className="eyebrow">Scope & customer preference</span>
        <h2>Review the estimate handoff</h2>
        <p>
          Local synthetic evidence · read only. Contract execution remains
          blocked.
        </p>
      </header>
      <button
        type="button"
        disabled={!value}
        onClick={() => reload((r) => r + 1)}
      >
        Reload exact evidence
      </button>
      {!value ? (
        <p role="status">Reading exact source and receipt…</p>
      ) : (
        <>
          <p role="status">
            {value.status === 'scope_matched'
              ? 'Exact scope and accepted test preference match. Contract approval is unverified.'
              : value.status === 'unknown'
                ? 'UNKNOWN — no scope is available for this read.'
                : 'Handoff blocked — review the evidence below.'}
          </p>
          <p>
            Snapshot read: {value.as_of}. Reload exact evidence to check current
            access and source.
          </p>
          {source && scope && (
            <>
              <h3>{scope.project.name}</h3>
              <p>
                {scope.company.name} · {scope.customer.display_name}
              </p>
              <p>
                {scope.location?.address_line1} · {scope.location?.city},{' '}
                {scope.location?.region}
              </p>
              <p>
                {source.estimate_number} · issued version{' '}
                {source.version_number} · expires {scope.expires_on}
              </p>
              <div className="sales-handoff-columns">
                <section aria-label="Exact issued selling scope">
                  <h3>Issued scope</h3>
                  <p>{scope.project.description}</p>
                  <ul>
                    {scope.lines.map((line, index) => (
                      <li key={index}>
                        {line.description} · {line.quantity_milli / 1000}{' '}
                        {line.unit.replaceAll('_', ' ')} ·{' '}
                        {formatMinor(line.amount_minor, scope.currency)}
                      </li>
                    ))}
                  </ul>
                  <dl>
                    <dt>Subtotal</dt>
                    <dd>{formatMinor(scope.subtotal_minor, scope.currency)}</dd>
                    <dt>Discount</dt>
                    <dd>{formatMinor(scope.discount_minor, scope.currency)}</dd>
                    <dt>Tax</dt>
                    <dd>{formatMinor(scope.tax_minor, scope.currency)}</dd>
                    <dt>Total</dt>
                    <dd>{formatMinor(scope.total_minor, scope.currency)}</dd>
                  </dl>
                  <p>
                    Currency: {scope.currency}. Proposed payment schedule is
                    scope only; no collection authority.
                  </p>
                  <ul>
                    {scope.schedule.map((part, index) => (
                      <li key={index}>
                        {part.label}:{' '}
                        {formatMinor(part.amount_minor, scope.currency)}
                        {part.due_on ? ' · ' + part.due_on : ''}
                      </li>
                    ))}
                  </ul>
                </section>
                <section aria-label="Preference and terms evidence">
                  <h3>Customer preference</h3>
                  <p>
                    {value.receipt
                      ? {
                          accepted: 'Accepted test preference',
                          declined: 'Declined',
                          changes_requested: 'Changes requested',
                        }[value.receipt.decision]
                      : 'UNKNOWN — no exact receipt'}
                  </p>
                  <p>
                    A test preference records the response to this offer. It
                    does not approve a contract, terms, work or payment.
                  </p>
                  <h4>Terms on the issued estimate</h4>
                  <p className="sales-handoff-text">
                    {scope.terms || 'No estimate terms recorded.'}
                  </p>
                  <h4>Approved contract terms</h4>
                  <p>
                    UNVERIFIED — no approved contract terms or
                    jurisdiction/template evidence supplied.
                  </p>
                  <h4>Customer notes on the estimate</h4>
                  <p className="sales-handoff-text">
                    {scope.notes || 'None recorded.'}
                  </p>
                </section>
              </div>
              <details>
                <summary>Exact source and receipt references</summary>
                <dl>
                  <dt>Company</dt>
                  <dd>{source.organization_id}</dd>
                  <dt>Customer</dt>
                  <dd>{source.customer_id}</dd>
                  <dt>Property</dt>
                  <dd>{source.location_id}</dd>
                  <dt>Estimate</dt>
                  <dd>{source.estimate_id}</dd>
                  <dt>Issued version</dt>
                  <dd>{source.version_id}</dd>
                  <dt>Offer</dt>
                  <dd>
                    {value.receipt?.offer_id ?? target.offer_id ?? 'Missing'}
                  </dd>
                  <dt>Receipt</dt>
                  <dd>{value.receipt?.id ?? 'Missing'}</dd>
                  <dt>Receipt recorded</dt>
                  <dd>{value.receipt?.recorded_at ?? 'Unknown'}</dd>
                  <dt>Consent</dt>
                  <dd>{value.receipt?.consent_version ?? 'Unknown'}</dd>
                  <dt>Scope integrity hash</dt>
                  <dd>{source.scope_hash}</dd>
                  <dt>Read as of</dt>
                  <dd>{value.as_of}</dd>
                </dl>
                <p>
                  The hash checks this local snapshot only. It proves no
                  signature, delivery, independent custody or completeness.
                </p>
              </details>
            </>
          )}
          {value.status !== 'unknown' && (
            <section
              className="sales-scope-reference"
              aria-label="Immutable scope reference review"
            >
              <h3>Retain the exact reviewed scope</h3>
              <p>
                Preserve this issued scope and its accepted local test
                preference as a read-only reference. No contract, signing, work,
                payment or delivery authority is created. This same-tab evidence
                is lost on refresh.
              </p>
              <label className="sales-scope-confirmation">
                <input
                  type="checkbox"
                  checked={confirmed === value}
                  disabled={value.status !== 'scope_matched' || busy}
                  onChange={(e) =>
                    confirm(e.target.checked ? value : undefined)
                  }
                />
                I reviewed the exact issued scope and accepted test receipt;
                retain a review-only reference.
              </label>
              <button
                type="button"
                disabled={
                  confirmed !== value ||
                  value.status !== 'scope_matched' ||
                  busy
                }
                onClick={() => void retain()}
              >
                {currentAction === 'capture'
                  ? 'Reading original evidence…'
                  : 'Retain review-only scope reference'}
              </button>
              {currentAction === 'error' && (
                <p role="alert">
                  Reference unavailable — current exact evidence is missing,
                  stale or denied. No contract or other action was executed.
                </p>
              )}
              {retained && (
                <section aria-label="Retained scope reference">
                  <h4>Immutable scope reference — staff review only</h4>
                  <p>
                    Accepted local test preference. Genuine customer approval
                    and contract execution remain unverified.
                  </p>
                  {retained.verification?.status !== 'unknown' && (
                    <dl>
                      <dt>Original estimate / version</dt>
                      <dd>
                        {retained.reference.source.estimate_number} · issued
                        version {retained.reference.source.version_number} ·
                        saved revision {retained.reference.source.lock_revision}
                      </dd>
                      <dt>Exact issued version</dt>
                      <dd>{retained.reference.source.version_id}</dd>
                      <dt>Property</dt>
                      <dd>{retained.reference.source.location_id}</dd>
                      <dt>Original offer / receipt</dt>
                      <dd>
                        {retained.reference.offer.id} /{' '}
                        {retained.reference.receipt.id}
                      </dd>
                      <dt>Retained scope hash</dt>
                      <dd>{retained.reference.source.scope_hash}</dd>
                      <dt>Reference integrity hash</dt>
                      <dd>{retained.reference.integrity.sha256}</dd>
                    </dl>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void verify()}
                  >
                    {currentAction === 'verify'
                      ? 'Verifying original sources…'
                      : 'Verify retained exact reference'}
                  </button>
                  <p aria-live="polite" className="sales-scope-verification">
                    {retained.verification?.reason ??
                      'Retained snapshot — not independently checked since capture. Verify the original sources before further review.'}
                  </p>
                  {retained.verification && (
                    <p>
                      Exact verification as of {retained.verification.as_of}.
                      Contract execution: BLOCKED.
                    </p>
                  )}
                  <p>
                    Later draft edits cannot alter this reference. A stale or
                    UNKNOWN result permits exact read-only inspection only;
                    never replace its source or replay an action.
                  </p>
                </section>
              )}
            </section>
          )}
          <section aria-label="Handoff blockers">
            <h3>Before a contractual handoff</h3>
            <ul>
              {value.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </section>
  );
}
