import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import {
  readFinanceDesk,
  inspectFinanceDesk,
  type FinanceDeskReview,
  type FinanceDeskSelection,
} from '../../lib/workflows/finance-desk';
import { costCategories } from '../../domain/jobs/financials';
import {
  formatMinor,
  minorText,
  parseMinor,
} from '../../domain/estimating/calculation';
import { formatMarginBps } from '../../domain/jobs/margin-analysis';
import './finance-desk.css';

export function FinanceDesk({
  sources,
  enabled = false,
}: {
  sources: LocalJourney;
  enabled?: boolean;
}) {
  let sourceSignature = 'OFF';
  if (enabled && sources.gate.enabled && sources.gate.confirmed) {
    try {
      sourceSignature = JSON.stringify(
        sources.estimates.readSyntheticPrototypeSources(sources.target),
      );
    } catch {
      sourceSignature = 'UNAVAILABLE';
    }
  }
  const signature = JSON.stringify([
    sources.target,
    sources.gate.enabled,
    sources.gate.confirmed,
    sourceSignature,
  ]);
  const [binding, bind] = useState({
    sources,
    signature,
    enabled,
    generation: 0,
  });
  if (
    binding.sources !== sources ||
    binding.signature !== signature ||
    binding.enabled !== enabled
  ) {
    bind({ sources, signature, enabled, generation: binding.generation + 1 });
    return null;
  }
  return enabled && sources.gate.enabled && sources.gate.confirmed ? (
    <FinanceDeskForm key={binding.generation} sources={sources} />
  ) : (
    <section className="finance-desk" aria-label="Finance operating review">
      <h2>Finance operating review</h2>
      <p>
        Finance desk is off. Explicit local synthetic source confirmation is
        required.
      </p>
    </section>
  );
}
function FinanceDeskForm({ sources }: { sources: LocalJourney }) {
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>({
    materials: '',
    labor: '',
    subcontractors: '',
    equipment: '',
    other: '',
  });
  const [aliases, setAliases] = useState({
    receivable: '',
    sales: '',
    tax_payable: '',
    sandbox_clearing: '',
  });
  const [accounting, setAccounting] = useState(false),
    [excludes, setExcludes] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [revision, setRevision] = useState(1);
  const [review, setReview] = useState<FinanceDeskReview | null>(null),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false),
    [held, setHeld] = useState(false);
  const generation = useRef(0),
    admission = useRef<{ enabled: boolean; confirmed: boolean } | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      if (admission.current) admission.current.confirmed = false;
    },
    [sources],
  );
  let source: ReturnType<
    LocalJourney['estimates']['readSyntheticPrototypeSources']
  > | null = null;
  try {
    if (sources.gate.enabled && sources.gate.confirmed)
      source = sources.estimates.readSyntheticPrototypeSources(sources.target);
  } catch {
    /* Closed source: withhold prior evidence. */
  }
  if (!source?.job || source.bundle.version.status !== 'issued')
    return (
      <section className="finance-desk" aria-label="Finance operating review">
        <h2>Finance operating review</h2>
        <p role="alert">
          Exact current issued job source is unavailable. Prior figures are
          withheld.
        </p>
      </section>
    );
  const original = source,
    currency = source.job.baseline.currency;
  const money = (amount: number) => formatMinor(amount, currency);
  function invalidate() {
    generation.current++;
    if (admission.current) admission.current.confirmed = false;
    if (busy) {
      setHeld(true);
      setBusy(false);
      setError(
        'Outcome UNKNOWN after withdrawal. No automatic retry or replacement.',
      );
    } else setError('');
    setReview(null);
    setStatus('');
    setConfirmed(false);
    setRevision((n) => n + 1);
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    if (!confirmed || !excludes || busy || held || !sources.gate.confirmed)
      return;
    let input: FinanceDeskSelection;
    try {
      const remaining = Object.fromEntries(
        costCategories.map((category) => [
          category,
          parseMinor(values[category], currency),
        ]),
      ) as FinanceDeskSelection['remaining'];
      input = {
        remaining,
        excludes_unpaid_commitments: true,
        input_revision: revision,
        job_review: {
          finance: {
            job_revision: original.job!.lock_revision,
            currency,
            release: {
              preview: sources.release,
              offer_id: sources.offer_id,
              decision_id: sources.receipt_id,
              contract_id: null,
              signature_id: null,
              invoice_id: null,
              as_of: new Date().toISOString(),
            },
            accounting_aliases: accounting ? { ...aliases } : null,
            procurement: null,
          },
          time: null,
          material: null,
          input_revision: revision,
        },
      };
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Enter explicit nonnegative remaining costs.',
      );
      return;
    }
    const token = ++generation.current,
      gate = { enabled: true, confirmed: true };
    admission.current = gate;
    setBusy(true);
    setReview(null);
    setError('');
    setStatus('');
    try {
      const result = await readFinanceDesk(
        sources.estimates,
        sources.target,
        input,
        gate,
      );
      if (
        generation.current === token &&
        gate.confirmed &&
        sources.gate.confirmed &&
        sources.gate.enabled
      )
        setReview(result);
    } catch {
      if (generation.current === token) {
        setHeld(true);
        setError(
          'Finance review outcome UNKNOWN. Exact retained evidence may be inspected; no replacement is prepared.',
        );
      }
    } finally {
      if (generation.current === token) setBusy(false);
    }
  }
  async function inspect() {
    if (!review || busy) return;
    const token = generation.current;
    setBusy(true);
    const result = await inspectFinanceDesk(review);
    if (generation.current === token && sources.gate.confirmed) {
      setStatus(`${result.status} · exact read-only review, no replacement.`);
      if (result.status !== 'CURRENT_LOCAL_SOURCE') {
        setReview(null);
        setHeld(true);
      }
      setBusy(false);
    }
  }
  const current = review?.recorded.recorded.costReview;
  const proposed = review?.scenario;
  return (
    <section className="finance-desk" aria-label="Finance operating review">
      <div className="finance-desk-heading">
        <p className="finance-desk-eyebrow">
          Internal staff · canonical cost sources
        </p>
        <h2>Finance operating review</h2>
        <p>
          Review additional remaining costs against this exact job. Saved costs,
          commitments, issued customer amounts and financial records stay
          unchanged.
        </p>
      </div>
      <details className="finance-desk-card">
        <summary>Exact source context</summary>
        <dl>
          <dt>Job / saved revision</dt>
          <dd>
            {sources.target.job_id} / {source.job.lock_revision}
          </dd>
          <dt>Customer / property</dt>
          <dd>
            {sources.target.customer_id} / {sources.target.location_id}
          </dd>
          <dt>Issued version</dt>
          <dd>{sources.target.version_id}</dd>
        </dl>
      </details>
      <form onSubmit={prepare} aria-label="Remaining cost proposal">
        <fieldset className="finance-desk-card" disabled={busy || held}>
          <legend>Unsaved remaining-cost proposal · {currency}</legend>
          <p>
            Enter the additional cost still expected in each category, excluding
            recorded costs and unpaid commitments. Zero must be an explicit
            choice. This replaces the saved remaining forecast in a detached
            scenario.
          </p>
          <button
            type="button"
            onClick={() => {
              invalidate();
              setValues(
                Object.fromEntries(
                  costCategories.map((c) => [
                    c,
                    minorText(original.job!.projection.remaining[c], currency),
                  ]),
                ),
              );
            }}
          >
            Use saved forecast as starting values
          </button>
          <div className="finance-desk-inputs">
            {costCategories.map((category) => (
              <div key={category}>
                <label htmlFor={`${id}-${category}`}>
                  {category[0].toUpperCase() + category.slice(1)} · {currency}
                </label>
                <input
                  id={`${id}-${category}`}
                  value={values[category]}
                  inputMode="decimal"
                  required
                  placeholder="Enter explicit amount"
                  onChange={(e) => {
                    invalidate();
                    setValues((old) => ({
                      ...old,
                      [category]: e.target.value,
                    }));
                  }}
                />
              </div>
            ))}
          </div>
          <label className="finance-desk-check">
            <input
              type="checkbox"
              checked={excludes}
              onChange={(e) => {
                invalidate();
                setExcludes(e.target.checked);
              }}
            />
            These additional forecasts exclude recorded actual costs and
            existing unpaid commitments.
          </label>
        </fieldset>
        <details className="finance-desk-card">
          <summary>Optional accounting compatibility review</summary>
          <fieldset disabled={busy || held}>
            <legend>Human-controlled local account aliases</legend>
            <label className="finance-desk-check">
              <input
                type="checkbox"
                checked={accounting}
                onChange={(e) => {
                  invalidate();
                  setAccounting(e.target.checked);
                }}
              />
              Review local accounting mapping requirements
            </label>
            <p>
              Aliases are review labels, never QuickBooks account IDs or a
              connection. No invoice means no accounting export or import.
            </p>
            {accounting && (
              <div className="finance-desk-inputs">
                {(Object.keys(aliases) as (keyof typeof aliases)[]).map(
                  (key) => (
                    <div key={key}>
                      <label htmlFor={`${id}-alias-${key}`}>
                        {key.replaceAll('_', ' ')} alias
                      </label>
                      <input
                        id={`${id}-alias-${key}`}
                        required
                        maxLength={80}
                        value={aliases[key]}
                        onChange={(e) => {
                          invalidate();
                          setAliases((old) => ({
                            ...old,
                            [key]: e.target.value,
                          }));
                        }}
                      />
                    </div>
                  ),
                )}
              </div>
            )}
          </fieldset>
        </details>
        <label className="finance-desk-check">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={held}
            onChange={(e) => {
              invalidate();
              setConfirmed(e.target.checked);
            }}
          />
          I confirm the exact saved source and these unsaved additional
          forecasts. No posting, invoice, supplier order or payment is
          authorized.
        </label>
        <button
          type="submit"
          disabled={!confirmed || !excludes || busy || held}
        >
          Review cost to complete
        </button>
      </form>
      {busy && (
        <p role="status">
          Checking current source and canonical cost-to-complete evidence…
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {!review && !busy && !error && (
        <p>
          No Finance desk review prepared. Enter or explicitly copy a starting
          forecast, then confirm the proposal.
        </p>
      )}
      {review && !busy && (
        <>
          <div className="finance-desk-grid">
            <section
              className="finance-desk-card"
              aria-label="Saved cost evidence"
            >
              <h3>Saved cost &amp; margin evidence</h3>
              <p>
                <strong>Coverage: {current!.status}</strong>
              </p>
              {current!.completion.totals ? (
                <dl>
                  <dt>Recorded expenses &amp; locked labor</dt>
                  <dd>{money(current!.completion.totals.recordedMinor)}</dd>
                  <dt>Net unpaid commitments</dt>
                  <dd>
                    {money(current!.completion.totals.unpaidCommitmentMinor)}
                  </dd>
                  <dt>Saved remaining forecast</dt>
                  <dd>
                    {money(current!.completion.totals.remainingForecastMinor)}
                  </dd>
                  <dt>Saved projected cost</dt>
                  <dd>{money(current!.completion.totals.projectedMinor)}</dd>
                  <dt>Projected contribution before unallocated overhead</dt>
                  <dd>
                    {current!.profitability
                      ? money(current!.profitability.projectedContributionMinor)
                      : 'UNKNOWN'}
                  </dd>
                </dl>
              ) : (
                <p>
                  UNKNOWN — missing exact labor/cost evidence. Aggregate amounts
                  and margin remain withheld; missing evidence is not zero.
                </p>
              )}
            </section>
            <section
              className="finance-desk-card"
              aria-label="Unsaved cost to complete"
            >
              <h3>Unsaved cost-to-complete scenario</h3>
              <p>
                <strong>
                  {proposed!.completion.status} · staff proposal only
                </strong>
              </p>
              {proposed!.completion.totals ? (
                <dl>
                  <dt>
                    Net unpaid commitments + additional remaining forecast
                  </dt>
                  <dd>
                    {money(proposed!.completion.totals.costToCompleteMinor)}
                  </dd>
                  <dt>Proposed projected cost</dt>
                  <dd>{money(proposed!.completion.totals.projectedMinor)}</dd>
                  <dt>Proposed contribution before unallocated overhead</dt>
                  <dd>
                    {money(proposed!.margin.totals!.projectedContributionMinor)}
                  </dd>
                  <dt>Proposed margin</dt>
                  <dd>
                    {proposed!.margin.totals!.projectedMarginBps === null
                      ? 'UNKNOWN'
                      : formatMarginBps(
                          proposed!.margin.totals!.projectedMarginBps,
                        )}
                  </dd>
                </dl>
              ) : (
                <p>
                  UNKNOWN — aggregate cost-to-complete and margin cannot be
                  determined. Your additional forecasts remain visible below
                  without assuming recorded labor.
                </p>
              )}
              <p>
                This is not final profit, physical completion, management cost
                completion or permission to incur costs.
              </p>
            </section>
          </div>
          <section
            className="finance-desk-card"
            aria-label="Category forecast comparison"
          >
            <h3>Saved vs proposed remaining forecast</h3>
            <div className="finance-desk-inputs">
              {costCategories.map((c) => (
                <div key={c}>
                  <h4>{c[0].toUpperCase() + c.slice(1)}</h4>
                  <dl>
                    <dt>Saved remaining</dt>
                    <dd>{money(proposed!.original_remaining[c])}</dd>
                    <dt>Unsaved additional remaining</dt>
                    <dd>{money(proposed!.proposed_remaining[c])}</dd>
                  </dl>
                </div>
              ))}
            </div>
            <p>
              Existing commitments are retained once by the canonical engine.
              This review does not verify that a human forecast avoids every
              real-world overlap.
            </p>
          </section>
          <details className="finance-desk-card">
            <summary>Margin and coverage warnings</summary>
            <p>
              Warning availability:{' '}
              {proposed!.margin.warningReview.availability}. Missing warnings do
              not prove complete costs.
            </p>
            {proposed!.margin.warningReview.aboveBudgetCategories.map((row) => (
              <p key={row.category}>
                {row.category}: above recorded budget; source overrun threshold{' '}
                {row.thresholdExceeded ? 'exceeded' : 'not exceeded'}.
              </p>
            ))}
            <p>
              Negative contribution:{' '}
              {proposed!.margin.warningReview.negativeContribution === null
                ? 'UNKNOWN'
                : String(proposed!.margin.warningReview.negativeContribution)}
              . Margin erosion:{' '}
              {proposed!.margin.warningReview.erosionThresholdExceeded === null
                ? 'UNKNOWN'
                : String(
                    proposed!.margin.warningReview.erosionThresholdExceeded,
                  )}
              .
            </p>
            <ul>
              {proposed!.margin.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </details>
          <section
            className="finance-desk-card"
            aria-label="Finance desk invoice requirements"
          >
            <h3>Read-only invoice requirements</h3>
            <p>
              <strong>
                {review.invoice.overall} · {review.invoice.status}
              </strong>
            </p>
            <p>
              Issued customer total:{' '}
              {money(review.invoice.scope.totals.total_minor)}. Version{' '}
              {review.invoice.issued.version_number} / saved revision{' '}
              {review.invoice.issued.saved_revision}. Proposals never change
              that total.
            </p>
            <details>
              <summary>Inspect missing invoice authority</summary>
              <ul>
                {review.invoice.requirements.map((r) => (
                  <li key={r.id}>
                    {r.id.replaceAll('_', ' ')}: {r.status}
                  </li>
                ))}
              </ul>
            </details>
          </section>
          <section
            className="finance-desk-card"
            aria-label="Accounting procurement compatibility"
          >
            <h3>Accounting &amp; procurement compatibility</h3>
            <p>
              Accounting: {review.compatibility.accounting.status}.{' '}
              {review.compatibility.accounting.reason}
            </p>
            <p>
              QuickBooks: {review.compatibility.accounting.quickbooks.status}.{' '}
              {review.compatibility.accounting.quickbooks.meaning}
            </p>
            <p>
              External realm, account/customer mapping, tax schema and
              accountant approval remain UNVERIFIED. Refund and settlement
              evidence remain UNKNOWN.
            </p>
            <p>
              Procurement: {review.compatibility.procurement.status}.{' '}
              {review.compatibility.procurement.meaning}
            </p>
            <details>
              <summary>Inspect exact reference and integrity</summary>
              <p>
                Source SHA-256: <code>{review.source_sha256}</code>
              </p>
              <p>
                Review SHA-256: <code>{review.sha256}</code>
              </p>
              <p>
                Current workforce coverage remains UNKNOWN; session-only
                evidence has no refresh or crash durability.
              </p>
            </details>
            <button type="button" onClick={inspect} disabled={busy}>
              Inspect exact Finance desk review
            </button>
          </section>
        </>
      )}
    </section>
  );
}
