import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { costCategories } from '../../domain/jobs/financials';
import {
  formatMinor,
  minorText,
  parseMinor,
} from '../../domain/estimating/calculation';
import { formatMarginBps } from '../../domain/jobs/margin-analysis';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import {
  readPortfolioFinance,
  inspectPortfolioFinance,
  openPortfolioFinanceJob,
  type PortfolioFinanceReview,
  type PortfolioFinanceInput,
} from '../../lib/workflows/portfolio-finance';
import './portfolio-finance.css';

export function PortfolioFinance({
  sources,
  enabled = false,
  onSelectJob,
}: {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}) {
  let signature = 'OFF';
  if (enabled)
    try {
      const selected = captureOperatingSources(sources, sources.gate);
      signature = JSON.stringify({
        targets: selected.entries.map((e) => ({
          target: e.target,
          source: sources.estimates.readSyntheticPrototypeSources(e.target),
          release: e.release.read('staff'),
        })),
        members: sources.operations.syntheticMemberships(
          selected.organization_id,
        ),
        property: sources.property.read(selected.organization_id),
      });
    } catch {
      signature = 'UNAVAILABLE';
    }
  const [binding, bind] = useState({
    sources,
    enabled,
    signature,
    generation: 0,
  });
  if (
    binding.sources !== sources ||
    binding.enabled !== enabled ||
    binding.signature !== signature
  ) {
    bind({ sources, enabled, signature, generation: binding.generation + 1 });
    return null;
  }
  return enabled && signature !== 'UNAVAILABLE' && signature !== 'OFF' ? (
    <PortfolioForm
      key={binding.generation}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="portfolio-finance"
      aria-label="Portfolio finance review"
    >
      <h2>Portfolio finance review</h2>
      <p>
        {enabled
          ? 'Exact current synthetic sources are unavailable. Prior figures are withheld.'
          : 'Portfolio finance is off. Explicit local source confirmation is required.'}
      </p>
    </section>
  );
}
function PortfolioForm({
  sources,
  onSelectJob,
}: {
  sources: OperatingSources;
  onSelectJob?: (jobId: string) => void;
}) {
  const id = useId();
  const rows = sources.entries.map((entry) => ({
    entry,
    source: sources.estimates.readSyntheticPrototypeSources(entry.target),
  }));
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    () =>
      Object.fromEntries(
        rows.map(({ entry, source }) => [
          entry.target.job_id!,
          Object.fromEntries(
            costCategories.map((category) => [
              category,
              minorText(
                source.job!.projection.remaining[category],
                source.job!.baseline.currency,
              ),
            ]),
          ),
        ]),
      ),
  );
  const [confirmed, setConfirmed] = useState(false),
    [excludes, setExcludes] = useState(false),
    [revision, setRevision] = useState(1);
  const [review, setReview] = useState<PortfolioFinanceReview | null>(null),
    [busy, setBusy] = useState(false),
    [held, setHeld] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState('');
  const generation = useRef(0),
    admission = useRef<{ enabled: boolean; confirmed: boolean } | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      if (admission.current) admission.current.confirmed = false;
    },
    [sources],
  );
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
    setRevision((r) => r + 1);
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    if (busy || held || !confirmed || !excludes) return;
    let input: PortfolioFinanceInput;
    try {
      input = {
        as_of: new Date().toISOString(),
        input_revision: revision,
        excludes_unpaid_commitments: true,
        proposals: rows.map(({ entry }) => ({
          job_id: entry.target.job_id!,
          remaining: Object.fromEntries(
            costCategories.map((category) => [
              category,
              parseMinor(
                values[entry.target.job_id!][category],
                rows[0].source.job!.baseline.currency,
              ),
            ]),
          ) as PortfolioFinanceInput['proposals'][number]['remaining'],
        })),
      };
    } catch {
      setError(
        'Enter a nonnegative amount with at most two decimal places for every category.',
      );
      return;
    }
    const attempt = ++generation.current,
      gate = { enabled: true, confirmed: true };
    admission.current = gate;
    setBusy(true);
    setError('');
    setReview(null);
    try {
      const result = await readPortfolioFinance(sources, input, gate);
      if (attempt !== generation.current || !gate.confirmed) return;
      if (
        (await inspectPortfolioFinance(result)).status !==
        'CURRENT_LOCAL_SOURCE'
      )
        throw Error('Portfolio evidence is UNKNOWN.');
      if (attempt !== generation.current || !gate.confirmed) return;
      // Synchronous exact live source check after the final await before rendering.
      openPortfolioFinanceJob(result, result.jobs[0].target.job_id!);
      setReview(result);
      setStatus(
        'Current local source review prepared. Nothing saved or executed.',
      );
    } catch {
      if (attempt === generation.current) {
        setHeld(true);
        setError(
          'Outcome UNKNOWN. Prior figures are withheld; exact read-only reconciliation only.',
        );
      }
    } finally {
      if (attempt === generation.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (!review) return;
    const current = await inspectPortfolioFinance(review);
    if (current.status !== 'CURRENT_LOCAL_SOURCE') {
      setReview(null);
      setHeld(true);
      setError(
        'UNKNOWN — exact source changed or access was withdrawn. No replacement review.',
      );
    } else {
      try {
        openPortfolioFinanceJob(review, review.jobs[0].target.job_id!);
        setStatus('Exact retained review is current. No action was replayed.');
      } catch {
        setReview(null);
        setHeld(true);
        setError('UNKNOWN — source changed.');
      }
    }
  }
  function navigate(jobId: string) {
    if (!review) return;
    try {
      openPortfolioFinanceJob(review, jobId);
      onSelectJob?.(jobId);
      openPortfolioFinanceJob(review, jobId);
      setStatus('Exact recorded job selected. Navigation only.');
    } catch {
      setReview(null);
      setHeld(true);
      setError('UNKNOWN — navigation source is unavailable.');
    }
  }
  const money = (n: number) =>
    formatMinor(n, rows[0].source.job!.baseline.currency);
  return (
    <section
      className="portfolio-finance"
      aria-label="Portfolio finance review"
    >
      <div className="portfolio-finance-heading">
        <p className="portfolio-finance-eyebrow">
          Financial visibility · selected jobs
        </p>
        <h2>Portfolio finance</h2>
        <p>
          Review {rows.length} exact issued jobs. Costs, commitments and
          remaining work stay distinct. Missing coverage never becomes zero or
          final profit.
        </p>
      </div>
      <form onSubmit={prepare} aria-label="Portfolio remaining-cost proposals">
        <div className="portfolio-proposal-list">
          {rows.map(({ entry, source }, index) => (
            <fieldset key={entry.target.job_id}>
              <legend>
                Job {index + 1} · {source.job!.name}
              </legend>
              <p>
                {source.bundle.version.customer_snapshot.display_name} ·{' '}
                {source.bundle.version.location_snapshot?.address_line1}
              </p>
              <div className="portfolio-proposal-grid">
                {costCategories.map((category) => (
                  <label key={category} htmlFor={`${id}-${index}-${category}`}>
                    {category}
                    <input
                      id={`${id}-${index}-${category}`}
                      inputMode="decimal"
                      value={values[entry.target.job_id!][category]}
                      disabled={held}
                      onChange={(e) => {
                        invalidate();
                        setValues((old) => ({
                          ...old,
                          [entry.target.job_id!]: {
                            ...old[entry.target.job_id!],
                            [category]: e.target.value,
                          },
                        }));
                      }}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <p className="portfolio-finance-note">
          Unsaved scenarios replace each saved remaining forecast. They never
          replace recorded costs. Currency:{' '}
          {rows[0].source.job!.baseline.currency}.
        </p>
        <label className="portfolio-check">
          <input
            type="checkbox"
            checked={excludes}
            disabled={held}
            onChange={(e) => {
              invalidate();
              setExcludes(e.target.checked);
            }}
          />
          These remaining proposals exclude the unpaid commitments already
          recorded. This is my review input, not verified real-world coverage.
        </label>
        <label className="portfolio-check">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={held}
            onChange={(e) => {
              invalidate();
              setConfirmed(e.target.checked);
            }}
          />
          I explicitly confirm these exact jobs and unsaved proposals for staff
          review only.
        </label>
        <button
          disabled={!confirmed || !excludes || busy || held}
          type="submit"
        >
          {busy ? 'Reviewing exact sources…' : 'Review portfolio finances'}
        </button>
      </form>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      {review && (
        <div className="portfolio-finance-result">
          <div className="portfolio-metrics">
            <div>
              <span>Selected job coverage</span>
              <strong>
                {review.coverage.covered_jobs}/{review.coverage.selected_jobs}
              </strong>
              <small>{review.coverage.status}</small>
            </div>
            <div>
              <span>Issued quoted customer totals</span>
              <strong>{money(review.totals.issued_quoted_total_minor)}</strong>
              <small>Not earned revenue or an invoice</small>
            </div>
            <div>
              <span>Proposed cost to complete</span>
              <strong>
                {review.totals.proposed
                  ? money(review.totals.proposed.costToCompleteMinor)
                  : 'UNKNOWN'}
              </strong>
              <small>
                {review.coverage.missing_job_ids.length
                  ? 'Incomplete job coverage — aggregate withheld'
                  : 'Canonical unpaid commitments plus remaining forecasts'}
              </small>
            </div>
          </div>
          <p>{review.totals.meaning}</p>
          <div className="portfolio-cost-table">
            <table aria-label="Canonical portfolio cost comparison">
              <thead>
                <tr>
                  <th scope="col">Cost evidence</th>
                  <th scope="col">Saved source</th>
                  <th scope="col">Unsaved scenario</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Recorded internal cost', 'recordedMinor'],
                    ['Net unpaid commitments', 'unpaidCommitmentMinor'],
                    ['Remaining forecast', 'remainingForecastMinor'],
                    ['Cost to complete', 'costToCompleteMinor'],
                    ['Projected cost', 'projectedMinor'],
                  ] as const
                ).map(([label, field]) => (
                  <tr key={field}>
                    <th scope="row">{label}</th>
                    <td>
                      {review.totals.recorded
                        ? money(review.totals.recorded[field])
                        : 'UNKNOWN'}
                    </td>
                    <td>
                      {review.totals.proposed
                        ? money(review.totals.proposed[field])
                        : 'UNKNOWN'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {review.jobs.map((job, index) => (
            <article key={job.target.job_id} className="portfolio-job">
              <div>
                <p className="portfolio-finance-eyebrow">
                  Job {index + 1} · version{' '}
                  {job.review.invoice.issued.version_number}
                </p>
                <h3>{job.name}</h3>
                <p>
                  {job.customer_name} · {job.property_label}
                </p>
                <button
                  type="button"
                  onClick={() => navigate(job.target.job_id!)}
                >
                  Open exact job {index + 1}
                </button>
              </div>
              <dl>
                <div>
                  <dt>Recorded cost</dt>
                  <dd>
                    {job.review.recorded.recorded.costReview.completion.totals
                      ? money(
                          job.review.recorded.recorded.costReview.completion
                            .totals.recordedMinor,
                        )
                      : 'UNKNOWN'}
                  </dd>
                </div>
                <div>
                  <dt>Net unpaid commitments</dt>
                  <dd>
                    {job.review.scenario.completion.totals
                      ? money(
                          job.review.scenario.completion.totals
                            .unpaidCommitmentMinor,
                        )
                      : 'UNKNOWN'}
                  </dd>
                </div>
                <div>
                  <dt>Proposed cost to complete</dt>
                  <dd>
                    {job.review.scenario.completion.totals
                      ? money(
                          job.review.scenario.completion.totals
                            .costToCompleteMinor,
                        )
                      : 'UNKNOWN'}
                  </dd>
                </div>
                <div>
                  <dt>Proposed contribution margin</dt>
                  <dd>
                    {job.review.scenario.margin.totals?.projectedMarginBps ===
                      null || !job.review.scenario.margin.totals
                      ? 'UNKNOWN'
                      : formatMarginBps(
                          job.review.scenario.margin.totals.projectedMarginBps,
                        )}
                  </dd>
                </div>
              </dl>
              <details>
                <summary>Source, coverage and invoice requirements</summary>
                <p>
                  Job {job.target.job_id}; property {job.target.location_id};
                  issued version {job.target.version_id}; saved job revision{' '}
                  {job.review.scenario.source_job_revision}.
                </p>
                <p>
                  {job.review.scenario.margin.reasons.join(' ') ||
                    'Partial recorded evidence; no final profit claim.'}
                </p>
                <p>
                  Canonical warning availability:{' '}
                  {job.review.scenario.margin.warningReview.availability}.
                  Negative contribution:{' '}
                  {job.review.scenario.margin.warningReview
                    .negativeContribution === null
                    ? 'UNKNOWN'
                    : String(
                        job.review.scenario.margin.warningReview
                          .negativeContribution,
                      )}
                  . Margin erosion threshold:{' '}
                  {job.review.scenario.margin.warningReview
                    .erosionThresholdExceeded === null
                    ? 'UNKNOWN'
                    : job.review.scenario.margin.warningReview
                          .erosionThresholdExceeded
                      ? 'exceeded'
                      : 'not exceeded'}
                  .
                </p>
                <ul>
                  {job.review.scenario.margin.warningReview.aboveBudgetCategories.map(
                    (row) => (
                      <li key={row.category}>
                        {row.category}: above recorded budget; source overrun
                        threshold{' '}
                        {row.thresholdExceeded ? 'exceeded' : 'not exceeded'}.
                      </li>
                    ),
                  )}
                </ul>
                <p>
                  Exact cost references: {job.expense_ids.length}. Invoice
                  preparation: {job.review.invoice.overall}. Accounting:{' '}
                  {job.review.compatibility.accounting.status}; QuickBooks:{' '}
                  {job.review.compatibility.accounting.quickbooks.status};
                  procurement: {job.review.compatibility.procurement.status}.
                </p>
                <ul>
                  {job.review.invoice.requirements.map((r) => (
                    <li key={r.id}>
                      <strong>
                        {r.id}: {r.status}
                      </strong>{' '}
                      — {r.detail}
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          ))}
          <button type="button" onClick={() => void reconcile()}>
            Check exact retained evidence
          </button>
          <p className="portfolio-finance-note">
            Staff-only session snapshot. No saved forecast, invoice, ledger,
            purchase order, payroll, export, payment or provider action.
          </p>
          <details>
            <summary>Integrity evidence</summary>
            <p>{review.sha256}</p>
          </details>
        </div>
      )}
    </section>
  );
}
