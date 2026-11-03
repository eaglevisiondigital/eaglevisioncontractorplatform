import { useId, useLayoutEffect, useRef, useState } from 'react';
import { formatMinor } from '../../domain/estimating/calculation';
import { formatMarginBps } from '../../domain/jobs/margin-analysis';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import {
  costCorrectionReviewEnabled,
  readCostCorrectionReview,
  assertCostCorrectionReviewAccess,
  assertCostCorrectionReviewCurrent,
  confirmCostCorrectionReview,
  reconcileCostCorrectionReview,
  type CostCorrectionReviewRead,
} from '../../lib/workflows/cost-correction-review';
import './cost-correction-review.css';
type Props = SavedRevisionPanelProps & {
  onSourcesSaved?: () => void | Promise<void>;
};
export function CostCorrectionReview(props: Props) {
  const enabled = costCorrectionReviewEnabled(props.enabled),
    [binding, setBinding] = useState({
      sources: props.sources,
      job: props.selectedJobId,
      enabled,
      generation: 0,
    });
  if (
    binding.sources !== props.sources ||
    binding.job !== props.selectedJobId ||
    binding.enabled !== enabled
  ) {
    setBinding({
      sources: props.sources,
      job: props.selectedJobId,
      enabled,
      generation: binding.generation + 1,
    });
    return null;
  }
  return (
    <section
      className="cost-correction-review"
      aria-label="Cost correction review"
    >
      <h2>Recorded cost review</h2>
      <p>
        Review a recorded pending expense against its exact source. This does
        not create a payment, invoice or new expense.
      </p>
      {!enabled ? (
        <p>Cost correction review is OFF.</p>
      ) : props.selectedJobId ? (
        <Review
          key={binding.generation}
          {...props}
          selectedJobId={props.selectedJobId}
        />
      ) : (
        <p>Select an authorized job in the existing workspace.</p>
      )}
    </section>
  );
}
function Review({
  sources,
  selectedJobId,
  onSourcesSaved,
}: Props & { selectedJobId: string }) {
  const [view, setView] = useState<CostCorrectionReviewRead>(),
    [expense, setExpense] = useState(''),
    [decision, setDecision] = useState<'approved' | 'rejected'>('rejected'),
    [reason, setReason] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [held, setHeld] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'Read the current saved job costs before reviewing a pending record.',
    ),
    [error, setError] = useState('');
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ alive: true, pending: false, generation: 0 }),
    id = useId();
  useLayoutEffect(() => {
    const g = gate.current,
      l = life.current;
    g.enabled = true;
    g.confirmed = true;
    l.alive = true;
    return () => {
      g.enabled = false;
      g.confirmed = false;
      l.alive = false;
      l.generation++;
    };
  }, []);
  let access = true,
    current = true;
  try {
    if (view) {
      assertCostCorrectionReviewAccess(view);
      try {
        assertCostCorrectionReviewCurrent(view);
      } catch {
        current = false;
      }
    }
  } catch {
    access = false;
    current = false;
  }
  async function run(
    mode: 'read' | 'confirm' | 'reconcile',
    exactExpense?: string,
  ) {
    if (life.current.pending) return;
    life.current.pending = true;
    setBusy(true);
    setError('');
    const generation = ++life.current.generation;
    const live = () =>
      life.current.alive &&
      life.current.generation === generation &&
      gate.current.enabled;
    try {
      if (mode === 'read') {
        const next = await readCostCorrectionReview(
          sources,
          selectedJobId,
          gate.current,
          exactExpense || undefined,
        );
        if (!live()) throw Error('Context changed');
        setView(next);
        setExpense(next.material.expense_id ?? '');
        setConfirmed(false);
        setMessage(
          'Exact current costs and pending review sources loaded. Save/review confirmations remain separate.',
        );
      } else if (view) {
        if (mode === 'confirm') {
          setHeld(true);
          const result = await confirmCostCorrectionReview(
            view,
            { expense_id: expense, decision, reason: reason.trim() },
            confirmed,
          );
          if (!live()) throw Error('Context changed');
          setMessage(JSON.stringify(result));
          setConfirmed(false);
          if (result.status === 'SYNTHETIC_SOURCE_SAVED' && onSourcesSaved) {
            assertCostCorrectionReviewAccess(view);
            await onSourcesSaved();
            if (!live()) throw Error('Saved notification changed');
            assertCostCorrectionReviewAccess(view);
          }
        } else {
          const result = await reconcileCostCorrectionReview(view);
          if (!live()) throw Error('Context changed');
          setMessage(JSON.stringify(result));
        }
      }
    } catch {
      if (live())
        setError(
          'Exact pending source is stale, revoked, already reviewed or UNKNOWN. No retry, replacement, ledger or payment was performed.',
        );
    } finally {
      life.current.pending = false;
      if (live()) setBusy(false);
    }
  }
  const e = view?.costs.evidence;
  return (
    <div className="cost-correction-body">
      <button type="button" onClick={() => void run('read')} disabled={busy}>
        Read current recorded cost review
      </button>
      <p role="status">
        {busy ? 'Checking canonical cost and source revisions…' : message}
      </p>
      {(error || !access || !current) && (
        <p role="alert">
          {error ||
            (!access
              ? 'Current staff access was withdrawn; retained cost details are withheld.'
              : 'Sources changed. Confirmation is blocked; read current costs or reconcile the exact held result.')}
        </p>
      )}
      {view && access && (
        <>
          <p>
            {e!.job_name} · {e!.customer_name} · {e!.property_label}
          </p>
          <p>
            Job {view.costs.identity.job_id} · saved revision {e!.job_revision}{' '}
            · issued source {e!.issued.version_id} / version{' '}
            {e!.issued.version_number}
          </p>
          <div className="cost-correction-metrics">
            <article>
              <h3>Cost coverage</h3>
              <strong>{e!.facts.cost_coverage}</strong>
              {e!.facts.missing_evidence.map((x, i) => (
                <p key={i}>{x}</p>
              ))}
            </article>
            <article>
              <h3>Canonical cost forecast</h3>
              <p>
                Projected cost{' '}
                {formatMinor(view.canonical.projected_cost_minor, e!.currency)}
              </p>
              <p>
                Cost to complete{' '}
                {e!.facts.costs
                  ? formatMinor(e!.facts.costs.costToCompleteMinor, e!.currency)
                  : 'UNKNOWN'}
              </p>
              <p>
                Projected contribution{' '}
                {formatMinor(
                  view.canonical.projected_profit_minor,
                  e!.currency,
                )}
              </p>
              <p>
                Projected margin{' '}
                {formatMarginBps(view.canonical.projected_margin_bps)}
              </p>
              <p>
                Canonical profit erosion warning:{' '}
                {view.canonical.profit_erosion === true
                  ? 'TRIGGERED'
                  : view.canonical.profit_erosion === false
                    ? 'Not triggered by available recorded sources'
                    : 'UNKNOWN'}
              </p>
              <p>
                Forecasts use recorded commitments and current remaining-cost
                assumptions; they do not establish complete costs or final
                profit.
              </p>
            </article>
            <article>
              <h3>Invoice readiness</h3>
              <strong>{e!.invoice.overall}</strong>
              <p>
                Review status never authorizes invoice issuance or customer
                debt.
              </p>
            </article>
          </div>
          <details>
            <summary>Canonical category costs and exceptions</summary>
            <ul>
              {view.canonical.categories.map((row) => (
                <li key={row.category}>
                  <strong>{row.category}</strong>
                  <p>
                    Recorded internal cost{' '}
                    {formatMinor(row.paid_minor, e!.currency)} · unpaid
                    commitment{' '}
                    {formatMinor(row.committed_remaining_minor, e!.currency)} ·
                    remaining forecast{' '}
                    {formatMinor(row.remaining_minor, e!.currency)} · projected{' '}
                    {formatMinor(row.projected_minor, e!.currency)}
                  </p>
                  <p>
                    Budget warning:{' '}
                    {row.overrun
                      ? 'TRIGGERED'
                      : 'Not triggered by available recorded costs'}
                  </p>
                </li>
              ))}
            </ul>
            {view.canonical.anomalies.map((reason, index) => (
              <p key={index}>{reason}</p>
            ))}
            <p>
              Native complete flag:{' '}
              {view.canonical.complete
                ? 'declared by original engine'
                : 'false'}
              . The independent cost-coverage and invoice requirements above
              remain binding.
            </p>
          </details>
          <section aria-label="Pending material review">
            <h3>Review an exact pending record</h3>
            <p>
              Incorrect pending records can be rejected. Approved records enter
              original internal cost calculations; the source row is preserved.
              Enter replacements only through the existing expense workflow.
            </p>
            <p>
              Only pending material commitments without adjustment links are
              eligible here. Payments and credits are excluded.
            </p>
            <label htmlFor={`${id}-expense`}>
              Recorded pending expense
              <select
                id={`${id}-expense`}
                value={expense}
                disabled={busy || held || !current}
                onChange={(event) => {
                  setExpense(event.target.value);
                  setConfirmed(false);
                  if (event.target.value) void run('read', event.target.value);
                }}
              >
                <option value="">Select exact source</option>
                {view.material.eligible_expenses.map((row) => (
                  <option key={row.expense_id} value={row.expense_id}>
                    {row.reference} · {row.kind} ·{' '}
                    {formatMinor(row.amount_minor, e!.currency)}
                  </option>
                ))}
              </select>
            </label>
            {view.material.eligible_expenses.length === 0 && (
              <p>
                No eligible pending expense is available. Existing
                approved/rejected records remain evidence; no placeholder
                expense is created.
              </p>
            )}
            <p>
              Source {view.material.expense_id ?? 'none'} ·{' '}
              {view.material.supplier} · {view.material.reference} ·{' '}
              {view.material.purchase_key}
            </p>
            <p>{view.material.description}</p>
            <p>
              {view.material.category} · {view.material.kind} ·{' '}
              {view.material.amount_minor === null
                ? 'UNKNOWN'
                : formatMinor(view.material.amount_minor, e!.currency)}{' '}
              · adjusts {view.material.adjusts_expense_id ?? 'none'}
            </p>
            <label htmlFor={`${id}-decision`}>
              Internal review decision
              <select
                id={`${id}-decision`}
                value={decision}
                disabled={busy || held}
                onChange={(event) => {
                  setDecision(event.target.value as 'approved' | 'rejected');
                  setConfirmed(false);
                }}
              >
                <option value="rejected">Reject recorded expense</option>
                <option value="approved">Approve internal cost review</option>
              </select>
            </label>
            <label htmlFor={`${id}-reason`}>
              Staff review reason
              <textarea
                id={`${id}-reason`}
                value={reason}
                maxLength={2000}
                disabled={busy || held}
                onChange={(event) => {
                  setReason(event.target.value);
                  setConfirmed(false);
                }}
              />
            </label>
            <label className="cost-correction-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy || held || !current || !view.material.can_review}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              I reviewed this exact pending expense and current job revision
            </label>
            <button
              type="button"
              disabled={
                busy ||
                held ||
                !current ||
                !view.material.can_review ||
                !confirmed ||
                !expense ||
                !reason.trim()
              }
              onClick={() => void run('confirm')}
            >
              Confirm exact internal cost review
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run('reconcile')}
            >
              Reconcile exact cost review
            </button>
            <p>
              One original material-review attempt per job. UNKNOWN remains
              held; read-only reconciliation never retries or creates a
              replacement.
            </p>
          </section>
          <details>
            <summary>Recorded expense and decision sources</summary>
            <ul>
              {e!.expenses.map((row) => (
                <li key={row.id}>
                  {row.id} · {row.kind} · {row.category} ·{' '}
                  {formatMinor(row.amount_minor, e!.currency)} · adjusts{' '}
                  {row.adjusts_expense_id ?? 'none'}
                  <ul>
                    {e!.reviews
                      .filter((r) => r.submission_id === row.id)
                      .map((r) => (
                        <li key={r.id}>
                          {r.decision} · event {r.id} · {r.created_at}
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          </details>
          <details>
            <summary>Time correction and locked-period references</summary>
            <p>
              Missing, unposted, corrected and superseded time is not zero-cost
              or complete-cost proof. No payroll preparation is started here.
            </p>
            <ul>
              {e!.time.map((row) => (
                <li key={row.id}>
                  {row.id} · {row.submitted ? 'submitted' : 'unsubmitted'} ·{' '}
                  {row.review ?? 'unreviewed'} · corrects{' '}
                  {row.corrects_id ?? 'none'} · {row.started_at} →{' '}
                  {row.ended_at ?? 'OPEN'}
                </li>
              ))}
            </ul>
            <p>
              Locked periods:{' '}
              {e!.locked_periods.map((x) => x.id).join(', ') || 'none recorded'}
            </p>
            <p>
              Included labor sources:{' '}
              {e!.labor_entry_ids.join(', ') || 'none recorded'}
            </p>
          </details>
          <details>
            <summary>Invoice and accounting requirements</summary>
            <ul>
              {e!.invoice.requirements.map((row) => (
                <li key={row.id}>
                  {row.status} · {row.detail} · {row.id}
                </li>
              ))}
            </ul>
            <p>Accounting coverage: {e!.accounting.coverage}</p>
            {e!.accounting.missing_evidence.map((x, i) => (
              <p key={i}>{x}</p>
            ))}
          </details>
        </>
      )}
    </div>
  );
}
