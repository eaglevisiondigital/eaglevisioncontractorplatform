import './job-margin-analysis.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JobCostCompletionReview } from '../../lib/job-cost-completion';
import {
  type MarginScope,
  type MarginReviewInput,
  parseLocalMarginPercent,
  formatMarginBps,
} from '../../domain/jobs/margin-analysis';
import type { LocalJobMarginReader } from '../../lib/job-margin-analysis';
import { formatMinor } from '../../domain/estimating/calculation';
import { useResource } from '../forms-state';
import { ResourceStatus } from '../forms';

/** Isolated internal read component; no App route or financial action is registered. */
export function JobMarginAnalysis({
  reader,
  scope,
  actor,
  completionEnabled = false,
}: {
  completionEnabled?: boolean;
  reader: LocalJobMarginReader;
  scope: MarginScope;
  actor: string;
}) {
  const identity = useMemo(
    () => ({ reader, key: crypto.randomUUID() }),
    [reader],
  );
  return (
    <MarginSnapshot
      key={JSON.stringify([identity.key, scope, actor])}
      reader={reader}
      scope={scope}
      actor={actor}
      completionEnabled={completionEnabled}
    />
  );
}
function MarginSnapshot({
  reader,
  scope,
  actor,
  completionEnabled,
}: {
  completionEnabled: boolean;
  reader: LocalJobMarginReader;
  scope: MarginScope;
  actor: string;
}) {
  const [draft, setDraft] = useState(''),
    [confirmed, confirm] = useState(false),
    [review, setReview] = useState<MarginReviewInput | null>(null),
    [error, setError] = useState('');
  const edit = (value: string) => {
    setDraft(value);
    confirm(false);
    setReview(null);
    setError('');
  };
  return (
    <section
      className="job-margin-analysis"
      aria-label="Local job margin analysis"
    >
      <h2>Job cost variance</h2>
      <p>
        Local synthetic read only · current owner/admin. Source coverage is
        limited to this exact job snapshot.
      </p>
      <form
        className="job-margin-review"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            if (!confirmed)
              throw Error('Confirm this local review input first');
            const minimumMarginBps = parseLocalMarginPercent(draft);
            setReview({ minimumMarginBps, confirmed: true });
            setError('');
          } catch (cause) {
            setReview(null);
            setError(
              cause instanceof Error ? cause.message : 'Invalid review input',
            );
          }
        }}
      >
        <h3>Optional margin review</h3>
        <p id="margin-review-help">
          Compare the current projected margin with your local review input.
          This does not change the saved job thresholds or establish company
          policy.
        </p>
        <label>
          Minimum projected margin (%)
          <input
            type="text"
            inputMode="decimal"
            maxLength={6}
            value={draft}
            onChange={(event) => edit(event.target.value)}
            aria-describedby="margin-review-help"
          />
        </label>
        <label className="job-margin-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => {
              confirm(event.target.checked);
              setReview(null);
              setError('');
            }}
          />
          I confirm this percentage is a local review input, not an approved
          company policy.
        </label>
        <div className="job-margin-review-actions">
          <button type="submit" disabled={!confirmed || !draft.trim()}>
            Review margin threshold
          </button>
          <button type="button" className="secondary" onClick={() => edit('')}>
            Clear review input
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
      {completionEnabled && (
        <CompletionReview reader={reader} scope={scope} actor={actor} />
      )}
      <MarginEvidence
        key={JSON.stringify(review)}
        reader={reader}
        scope={scope}
        actor={actor}
        review={review}
      />
    </section>
  );
}
function MarginEvidence({
  reader,
  scope,
  actor,
  review,
}: {
  reader: LocalJobMarginReader;
  scope: MarginScope;
  actor: string;
  review: MarginReviewInput | null;
}) {
  const data = useResource(
    useCallback(
      () => reader.read(scope, actor, review),
      [reader, scope, actor, review],
    ),
  );
  const result = data.loading || data.error ? undefined : data.data;
  const money = (n: number) => formatMinor(n, scope.currency);
  return (
    <>
      <button className="secondary" onClick={data.reload}>
        Refresh exact cost evidence
      </button>
      <ResourceStatus {...data} />
      {result && (
        <>
          <p role="status">
            {result.status === 'PARTIAL'
              ? 'Partial cost coverage'
              : result.status === 'UNKNOWN'
                ? 'UNKNOWN — totals withheld'
                : 'Management-declared costs complete'}
          </p>
          <p>{result.authority}</p>
          <dl>
            <dt>Issued source version</dt>
            <dd>{result.scope.issuedVersionId}</dd>
            <dt>Job revision</dt>
            <dd>{result.scope.jobRevision}</dd>
            <dt>Currency</dt>
            <dd>{result.scope.currency}</dd>
          </dl>
          {result.reasons.length > 0 && (
            <ul>
              {result.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <section
            className="job-margin-warnings"
            aria-label="Source-bound cost and margin warnings"
          >
            <h3>Cost and margin review</h3>
            {result.warningReview.availability === 'UNAVAILABLE' ? (
              <p>
                Warning assessment unavailable — exact figures are withheld.
                Missing evidence is not a zero cost or an all-clear.
              </p>
            ) : (
              <>
                <p>
                  Saved job thresholds: cost overrun{' '}
                  {formatMarginBps(
                    result.warningReview.sourceThresholds!.categoryOverrunBps,
                  )}{' '}
                  above each category budget; margin erosion{' '}
                  {formatMarginBps(
                    result.warningReview.sourceThresholds!.marginErosionBps,
                  ).slice(0, -1)}{' '}
                  percentage points from the original baseline.
                </p>
                {result.warningReview.aboveBudgetCategories.length ? (
                  <ul aria-label="Categories above budget">
                    {result.warningReview.aboveBudgetCategories.map((entry) => (
                      <li key={entry.category}>
                        <strong>{entry.category}</strong> — projected cost
                        exceeds budget
                        {entry.thresholdExceeded
                          ? ' and the saved overrun threshold.'
                          : '; the saved overrun threshold has not been exceeded.'}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    No category exceeds its budget in the available figures.
                  </p>
                )}
                <ul className="job-margin-signals">
                  <li>
                    {result.warningReview.negativeContribution
                      ? 'Warning: projected contribution is negative.'
                      : 'Projected contribution is nonnegative in the available figures.'}
                  </li>
                  <li>
                    {result.warningReview.erosionThresholdExceeded === null
                      ? 'Margin erosion cannot be assessed reliably from the available ratios.'
                      : result.warningReview.erosionThresholdExceeded
                        ? 'Warning: projected margin erosion exceeds the saved threshold.'
                        : 'Projected margin erosion does not exceed the saved threshold in the available figures.'}
                  </li>
                </ul>
              </>
            )}
            <p>
              {result.warningReview.minimumMargin ? (
                <>
                  Confirmed local review input:{' '}
                  <strong>
                    {formatMarginBps(
                      result.warningReview.minimumMargin.basisPoints,
                    )}
                  </strong>{' '}
                  ·{' '}
                  {result.warningReview.minimumMargin.assessment ===
                  'UNAVAILABLE'
                    ? 'comparison unavailable.'
                    : result.warningReview.minimumMargin.assessment ===
                        'BELOW_INPUT'
                      ? 'Warning: projected margin is below this input.'
                      : 'Projected margin meets or exceeds this input in the available figures.'}
                </>
              ) : (
                'No local minimum-margin review input has been applied.'
              )}
            </p>
            <p>
              Warnings describe this snapshot, not final profitability. Coverage
              remains{' '}
              {result.status === 'PARTIAL'
                ? 'PARTIAL'
                : result.status === 'UNKNOWN'
                  ? 'UNKNOWN'
                  : 'management-declared only'}
              ; an absent warning never proves complete costs, physical
              completion or financial authority.
            </p>
          </section>
          {result.totals && (
            <>
              <dl>
                <dt>Projected contribution</dt>
                <dd>{money(result.totals.projectedContributionMinor)}</dd>
                <dt>Projected margin</dt>
                <dd>
                  {result.totals.projectedMarginBps === null
                    ? 'Unavailable — no supported revenue denominator'
                    : formatMarginBps(result.totals.projectedMarginBps)}
                </dd>
              </dl>
              <div
                className="p3-table-wrap"
                tabIndex={0}
                role="region"
                aria-label="Scrollable job cost variance"
              >
                <table className="p3-table">
                  <caption>
                    Exact baseline versus approved costs and forecast ·{' '}
                    {scope.currency}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Category</th>
                      <th scope="col">Budget with approved changes</th>
                      <th scope="col">Recorded expense / locked labor</th>
                      <th scope="col">Unpaid commitments</th>
                      <th scope="col">Remaining forecast</th>
                      <th scope="col">Projected cost</th>
                      <th scope="col">Variance above / below budget</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.categories.map((row) => (
                      <tr key={row.category}>
                        <th scope="row">
                          {row.category}
                          {row.overrun && ' · saved threshold exceeded'}
                        </th>
                        <td>{money(row.budgetMinor)}</td>
                        <td>{money(row.recordedMinor)}</td>
                        <td>{money(row.unpaidCommitmentMinor)}</td>
                        <td>{money(row.forecastMinor)}</td>
                        <td>{money(row.projectedMinor)}</td>
                        <td>{money(row.varianceMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p>
            Expense sources: {result.source.expenseIds.length} · review events:{' '}
            {result.source.reviewEventIds.length} · labor entries:{' '}
            {result.source.laborEntryIds.length} · locked periods:{' '}
            {result.source.lockedPeriodIds.length}
          </p>
          <p>
            Available records do not prove all purchases, work or overhead were
            captured. No amounts are sent, posted or corrected.
          </p>
        </>
      )}
    </>
  );
}

/** Exact-context session view. A separate explicit confirmation precedes every read. */
function CompletionReview({
  reader,
  scope,
  actor,
}: {
  reader: LocalJobMarginReader;
  scope: MarginScope;
  actor: string;
}) {
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState<JobCostCompletionReview | null>(null);
  const lifetime = useRef({
      admission: { enabled: true, confirmed: false },
      generation: 0,
    }),
    evidence = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const control = lifetime.current;
    control.admission.enabled = true;
    return () => {
      control.admission.enabled = false;
      control.admission.confirmed = false;
      control.generation++;
    };
  }, []);
  const clear = () => {
    lifetime.current.admission.confirmed = false;
    lifetime.current.generation++;
    setConfirmed(false);
    setBusy(false);
    setResult(null);
    setError('');
  };
  return (
    <section
      className="job-cost-completion"
      aria-label="Cost-to-complete review"
    >
      <h3>Cost-to-complete review</h3>
      <p>
        Inspect the exact saved job, issued baseline, expense decisions and
        locked labor. No changes are posted. A forecast may overlap an unpaid
        commitment; the existing engine treats them as separate, additive
        inputs.
      </p>
      <label className="job-margin-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => {
            clear();
            lifetime.current.admission.confirmed = event.target.checked;
            setConfirmed(event.target.checked);
          }}
        />
        I confirm this is a local read-only review of the selected job revision.
      </label>
      <div className="job-margin-review-actions">
        <button
          disabled={!confirmed || busy}
          onClick={() => {
            const epoch = ++lifetime.current.generation;
            setBusy(true);
            setResult(null);
            setError('');
            void reader
              .readCompletion(scope, actor, lifetime.current.admission)
              .then((value) => {
                if (epoch !== lifetime.current.generation) return;
                setResult(value);
                requestAnimationFrame(() => {
                  if (epoch === lifetime.current.generation)
                    evidence.current?.focus();
                });
              })
              .catch((cause: unknown) => {
                if (epoch !== lifetime.current.generation) return;
                setError(
                  cause instanceof Error
                    ? cause.message
                    : 'Exact cost review unavailable',
                );
              })
              .finally(() => {
                if (epoch === lifetime.current.generation) setBusy(false);
              });
          }}
        >
          Review exact cost to complete
        </button>
        <button type="button" className="secondary" onClick={clear}>
          Clear cost review
        </button>
      </div>
      {busy && <p role="status">Reading exact job cost evidence…</p>}
      {error && <p role="alert">{error}</p>}
      {result && (
        <section
          ref={evidence}
          tabIndex={-1}
          aria-label="Exact cost completion evidence"
        >
          <h4>Saved job cost evidence</h4>
          <p role="status">
            {result.status === 'UNKNOWN'
              ? 'UNKNOWN — cost-to-complete totals withheld'
              : result.status === 'PARTIAL'
                ? 'PARTIAL — remaining costs and coverage need review'
                : 'Management-declared costs complete — not verified physical completion'}
          </p>
          <p>{result.authority}</p>
          <dl>
            <dt>Job</dt>
            <dd>{result.scope.jobId}</dd>
            <dt>Job revision</dt>
            <dd>{result.scope.jobRevision}</dd>
            <dt>Issued baseline</dt>
            <dd>{result.scope.issuedVersionId}</dd>
            <dt>Customer</dt>
            <dd>{result.scope.customerId}</dd>
            <dt>Property</dt>
            <dd>
              {result.scope.propertyId ?? 'Not recorded — no inferred property'}
            </dd>
          </dl>
          {result.totals && (
            <dl className="job-cost-completion-totals">
              <dt>Recorded expense and locked labor</dt>
              <dd>
                {formatMinor(
                  result.totals.recordedMinor,
                  result.scope.currency,
                )}
              </dd>
              <dt>Unpaid purchase commitments</dt>
              <dd>
                {formatMinor(
                  result.totals.unpaidCommitmentMinor,
                  result.scope.currency,
                )}
              </dd>
              <dt>Remaining saved forecast</dt>
              <dd>
                {formatMinor(
                  result.totals.remainingForecastMinor,
                  result.scope.currency,
                )}
              </dd>
              <dt>Cost to complete: commitments + forecast</dt>
              <dd>
                {formatMinor(
                  result.totals.costToCompleteMinor,
                  result.scope.currency,
                )}
              </dd>
              <dt>Projected total: recorded + cost to complete</dt>
              <dd>
                {formatMinor(
                  result.totals.projectedMinor,
                  result.scope.currency,
                )}
              </dd>
            </dl>
          )}
          <p>
            Commitments are already net of recorded purchase costs and credits
            in the canonical engine. Recorded costs are not added again to cost
            to complete. Remaining forecasts are not automatically reconciled
            with commitments.
          </p>
          {result.reasons.length > 0 && (
            <ul>
              {result.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <h4>Exact expense and review sources</h4>
          {result.expenses.length ? (
            <ul className="job-cost-sources">
              {result.expenses.map((row) => (
                <li key={row.id}>
                  <details>
                    <summary>
                      {row.category} · {row.kind} ·{' '}
                      {formatMinor(row.amountMinor, result.scope.currency)} ·{' '}
                      {row.review?.decision ?? 'pending review'}
                    </summary>
                    <dl>
                      <dt>Expense</dt>
                      <dd>{row.id}</dd>
                      <dt>Review event</dt>
                      <dd>
                        {row.review?.id ??
                          'Missing — excluded from canonical cost'}
                      </dd>
                      <dt>Cost inclusion</dt>
                      <dd>
                        {row.inclusion === 'CANONICAL_SOURCE'
                          ? 'Approved canonical source; commitments may already be offset'
                          : 'Excluded — not approved'}
                      </dd>
                      <dt>Exact original expense adjustment</dt>
                      <dd>
                        {row.adjustsExpenseId ?? 'Not a credit adjustment'}
                      </dd>
                      <dt>Estimate line</dt>
                      <dd>
                        {row.sourceLineId ?? 'Unmapped — no inferred line'}
                      </dd>
                      <dt>Recorded quantity (thousandths) / unit</dt>
                      <dd>
                        {row.quantityMilli ?? 'Not recorded'} /{' '}
                        {row.unit ?? 'Not recorded'}
                      </dd>
                    </dl>
                    <p>{row.meaning}</p>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              No accessible expense-source rows in this exact review. Missing
              evidence is not zero cost.
            </p>
          )}
          <h4>Provider provenance remains UNKNOWN</h4>
          <p>{result.providerEvidence.reason}</p>
          <p>
            Void: UNKNOWN · Refund: UNKNOWN · Settlement: UNKNOWN. No payment
            event has been substituted from another source.
          </p>
          <p>
            Labor source entries: {result.laborSource.entryIds.length} · locked
            periods: {result.laborSource.lockedPeriodIds.length}.{' '}
            {result.laborSource.meaning}
          </p>
        </section>
      )}
    </section>
  );
}
