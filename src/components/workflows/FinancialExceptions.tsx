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
  readFinancialExceptions,
  filterFinancialExceptions,
  openFinancialException,
  inspectFinancialExceptions,
  type FinancialExceptionsInput,
  type FinancialExceptionsReview,
  type FinancialExceptionsFilter,
} from '../../lib/workflows/financial-exceptions';
import './financial-exceptions.css';

export function FinancialExceptions({
  sources,
  enabled = false,
  onSelectJob,
}: {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}) {
  let signature = 'OFF',
    sourceCheck: (() => void) | null = null;
  if (enabled)
    try {
      const capture = captureOperatingSources(sources, sources.gate);
      signature = JSON.stringify({
        targets: capture.entries.map((entry) => ({
          target: entry.target,
          source: sources.estimates.readSyntheticPrototypeSources(entry.target),
          release: entry.release.read('staff'),
        })),
        members: sources.operations.syntheticMemberships(
          capture.organization_id,
        ),
        property: sources.property.read(capture.organization_id),
      });
      sourceCheck = capture.check;
    } catch {
      signature = 'UNAVAILABLE';
    }
  const [binding, bind] = useState({
    sources,
    enabled,
    signature,
    sourceCheck,
    generation: 0,
  });
  let changed = false;
  try {
    binding.sourceCheck?.();
  } catch {
    changed = true;
  }
  if (
    changed ||
    binding.sources !== sources ||
    binding.enabled !== enabled ||
    binding.signature !== signature
  ) {
    bind({
      sources,
      enabled,
      signature,
      sourceCheck,
      generation: binding.generation + 1,
    });
    return null;
  }
  return enabled && signature !== 'OFF' && signature !== 'UNAVAILABLE' ? (
    <ExceptionForm
      key={binding.generation}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="financial-exceptions"
      aria-label="Financial exception queue"
    >
      <h2>Financial exception queue</h2>
      <p>
        {enabled
          ? 'Current exact sources are unavailable. Previous financial evidence is withheld.'
          : 'Financial exception review is off. Explicit local source confirmation is required.'}
      </p>
    </section>
  );
}
const clear: FinancialExceptionsFilter = {
  kind: 'all',
  job_id: null,
  query: '',
};
function ExceptionForm({
  sources,
  onSelectJob,
}: {
  sources: OperatingSources;
  onSelectJob?: (jobId: string) => void;
}) {
  const id = useId(),
    rows = sources.entries.map((entry) => ({
      entry,
      source: sources.estimates.readSyntheticPrototypeSources(entry.target),
    })),
    currency = rows[0].source.job!.baseline.currency;
  const [basis, setBasis] =
      useState<FinancialExceptionsInput['basis']>('SAVED_FORECASTS'),
    [values, setValues] = useState<Record<string, Record<string, string>>>(() =>
      Object.fromEntries(
        rows.map(({ entry, source }) => [
          entry.target.job_id!,
          Object.fromEntries(
            costCategories.map((c) => [
              c,
              minorText(source.job!.projection.remaining[c], currency),
            ]),
          ),
        ]),
      ),
    ),
    [confirmed, setConfirmed] = useState(false),
    [excludes, setExcludes] = useState(false),
    [revision, setRevision] = useState(1);
  const [review, setReview] = useState<FinancialExceptionsReview | null>(null),
    [filter, setFilter] = useState(clear),
    [detail, setDetail] = useState<ReturnType<
      typeof openFinancialException
    > | null>(null),
    [busy, setBusy] = useState(false),
    [held, setHeld] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState('');
  const generation = useRef(0),
    admission = useRef<{ enabled: boolean; confirmed: boolean } | null>(null),
    detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(
    () => () => {
      generation.current++;
      if (admission.current) admission.current.confirmed = false;
    },
    [sources],
  );
  useEffect(() => {
    if (detail) detailHeading.current?.focus();
  }, [detail]);
  function invalidate() {
    generation.current++;
    if (admission.current) admission.current.confirmed = false;
    if (busy) {
      setHeld(true);
      setBusy(false);
      setError(
        'Outcome UNKNOWN after withdrawal. No automatic replacement review.',
      );
    } else setError('');
    setReview(null);
    setDetail(null);
    setConfirmed(false);
    setStatus('');
    setRevision((r) => r + 1);
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    if (!confirmed || !excludes || held || busy) return;
    let input: FinancialExceptionsInput;
    try {
      input = {
        basis,
        portfolio: {
          as_of: new Date().toISOString(),
          input_revision: revision,
          excludes_unpaid_commitments: true,
          proposals: rows.map(({ entry, source }) => ({
            job_id: entry.target.job_id!,
            remaining:
              basis === 'SAVED_FORECASTS'
                ? { ...source.job!.projection.remaining }
                : (Object.fromEntries(
                    costCategories.map((c) => [
                      c,
                      parseMinor(values[entry.target.job_id!][c], currency),
                    ]),
                  ) as FinancialExceptionsInput['portfolio']['proposals'][number]['remaining']),
          })),
        },
      };
    } catch {
      setError(
        'Enter valid nonnegative category amounts in the displayed currency.',
      );
      return;
    }
    const token = ++generation.current,
      gate = { enabled: true, confirmed: true };
    admission.current = gate;
    setBusy(true);
    setError('');
    setStatus('');
    setReview(null);
    setDetail(null);
    try {
      const result = await readFinancialExceptions(sources, input, gate);
      if (token !== generation.current || !gate.confirmed) return;
      if (
        (await inspectFinancialExceptions(result)).status !==
        'CURRENT_LOCAL_SOURCE'
      )
        throw Error('UNKNOWN');
      if (token !== generation.current || !gate.confirmed) return;
      filterFinancialExceptions(result, clear);
      setReview(result);
      setFilter(clear);
      setStatus(
        'Exact financial review prepared. No forecast, invoice or financial record was changed.',
      );
    } catch {
      if (token === generation.current) {
        setHeld(true);
        setError(
          'Financial review outcome UNKNOWN. Evidence is withheld; no automatic replay or replacement.',
        );
      }
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function open(id: string) {
    if (!review) return;
    try {
      const next = openFinancialException(review, id);
      setDetail(next);
      setStatus('Exact job and issued version opened. Staff review only.');
    } catch {
      setReview(null);
      setDetail(null);
      setHeld(true);
      setError('UNKNOWN — exact source navigation is unavailable.');
    }
  }
  function displayJob() {
    if (!review || !detail) return;
    try {
      const current = openFinancialException(review, detail.exception.id);
      onSelectJob?.(current.target.job_id!);
      openFinancialException(review, detail.exception.id);
    } catch {
      setReview(null);
      setDetail(null);
      setHeld(true);
      setError('UNKNOWN — existing job navigation source changed.');
    }
  }
  async function reconcile() {
    if (!review || busy) return;
    const token = generation.current;
    setBusy(true);
    try {
      if (
        (await inspectFinancialExceptions(review)).status !==
        'CURRENT_LOCAL_SOURCE'
      )
        throw Error('UNKNOWN');
      if (token !== generation.current) return;
      filterFinancialExceptions(review, filter);
      setStatus(
        'Exact retained evidence remains current. No operation was replayed.',
      );
    } catch {
      if (token === generation.current) {
        setReview(null);
        setDetail(null);
        setHeld(true);
        setError('UNKNOWN — original source changed or access was withdrawn.');
      }
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  let matches: ReturnType<typeof filterFinancialExceptions> | null = null;
  try {
    if (review) matches = filterFinancialExceptions(review, filter);
  } catch {
    /* Immediately withhold stale or revoked evidence. */
  }
  const money = (amount: number) => formatMinor(amount, currency);
  const update = (next: FinancialExceptionsFilter) => {
    generation.current++;
    setBusy(false);
    setFilter(next);
    setDetail(null);
    setStatus('');
  };
  return (
    <section
      className="financial-exceptions"
      aria-label="Financial exception queue"
    >
      <header>
        <div>
          <p className="financial-exceptions-eyebrow">
            Financial visibility · review queue
          </p>
          <h2>Financial exceptions &amp; review</h2>
          <p>
            Find missing cost evidence, canonical warnings and invoice
            prerequisites across {rows.length} exact selected jobs. This queue
            never posts or executes a financial action.
          </p>
        </div>
      </header>
      <form aria-label="Financial exception review inputs" onSubmit={prepare}>
        <label htmlFor={`${id}-basis`}>
          Forecast basis
          <select
            id={`${id}-basis`}
            value={basis}
            disabled={held}
            onChange={(e) => {
              invalidate();
              setBasis(e.target.value as FinancialExceptionsInput['basis']);
            }}
          >
            <option value="SAVED_FORECASTS">
              Exact saved remaining forecasts
            </option>
            <option value="UNSAVED_PROPOSALS">
              Explicit unsaved remaining proposals
            </option>
          </select>
        </label>
        <details className="exception-proposals">
          <summary>
            {basis === 'SAVED_FORECASTS'
              ? 'Inspect saved category forecasts'
              : 'Edit unsaved category proposals'}{' '}
            · {currency}
          </summary>
          {rows.map(({ entry, source }, index) => (
            <fieldset key={entry.target.job_id}>
              <legend>
                Job {index + 1} ·{' '}
                {source.bundle.version.customer_snapshot.display_name}
              </legend>
              <p>
                {source.job!.name} ·{' '}
                {source.bundle.version.location_snapshot?.address_line1}
              </p>
              <div className="exception-category-grid">
                {costCategories.map((category) => (
                  <label key={category} htmlFor={`${id}-${index}-${category}`}>
                    {category}
                    <input
                      id={`${id}-${index}-${category}`}
                      inputMode="decimal"
                      readOnly={basis === 'SAVED_FORECASTS'}
                      disabled={held}
                      value={
                        basis === 'SAVED_FORECASTS'
                          ? minorText(
                              source.job!.projection.remaining[category],
                              currency,
                            )
                          : values[entry.target.job_id!][category]
                      }
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
        </details>
        <label className="exception-check">
          <input
            type="checkbox"
            checked={excludes}
            disabled={held}
            onChange={(e) => {
              invalidate();
              setExcludes(e.target.checked);
            }}
          />
          I confirm the remaining forecast excludes the unpaid commitments
          already recorded. This is a review attestation, not verified
          real-world coverage.
        </label>
        <label className="exception-check">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={held}
            onChange={(e) => {
              invalidate();
              setConfirmed(e.target.checked);
            }}
          />
          I confirm these exact jobs and source values for internal financial
          review only.
        </label>
        <button
          type="submit"
          disabled={!confirmed || !excludes || busy || held}
        >
          {busy
            ? 'Reviewing exact financial sources…'
            : 'Review financial exceptions'}
        </button>
      </form>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      {review && !matches && (
        <p role="alert">
          UNKNOWN — prior results are withheld after source or access changes.
        </p>
      )}
      {review && matches && (
        <div className="financial-exceptions-result">
          <div className="exception-metrics">
            <div>
              <span>Cost coverage</span>
              <strong>
                {review.coverage.covered_jobs}/{review.coverage.selected_jobs}
              </strong>
              <small>Missing costs remain UNKNOWN</small>
            </div>
            <div>
              <span>Canonical warnings</span>
              <strong>{review.counts.margin}</strong>
              <small>Not urgency or permission to act</small>
            </div>
            <div>
              <span>Invoice prerequisites</span>
              <strong>{review.counts.invoice_readiness}</strong>
              <small>NO_GO · no invoice execution</small>
            </div>
          </div>
          <p className="exception-note">
            {review.order_meaning} Basis:{' '}
            {review.basis === 'SAVED_FORECASTS'
              ? 'exact saved forecast values'
              : 'explicit unsaved proposals'}
            .
          </p>
          <div
            className="exception-filters"
            aria-label="Financial exception filters"
          >
            <label htmlFor={`${id}-query`}>
              Search allowed review evidence
              <input
                id={`${id}-query`}
                type="search"
                maxLength={200}
                value={filter.query}
                onChange={(e) => update({ ...filter, query: e.target.value })}
              />
            </label>
            <label htmlFor={`${id}-kind`}>
              Review type
              <select
                id={`${id}-kind`}
                value={filter.kind}
                onChange={(e) =>
                  update({
                    ...filter,
                    kind: e.target.value as FinancialExceptionsFilter['kind'],
                  })
                }
              >
                <option value="all">All review types</option>
                <option value="coverage">Missing cost coverage</option>
                <option value="margin">Canonical margin warnings</option>
                <option value="remaining_cost">Cost to complete</option>
                <option value="invoice_readiness">Invoice prerequisites</option>
              </select>
            </label>
            <label htmlFor={`${id}-job`}>
              Exact job
              <select
                id={`${id}-job`}
                value={filter.job_id ?? ''}
                onChange={(e) =>
                  update({ ...filter, job_id: e.target.value || null })
                }
              >
                <option value="">All selected jobs</option>
                {review.portfolio.jobs.map((job, index) => (
                  <option key={job.target.job_id} value={job.target.job_id!}>
                    {index + 1}. {job.customer_name} · {job.property_label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => update(clear)}>
              Clear filters
            </button>
          </div>
          <p role="status">
            {matches.matching} matching review items of {matches.available}{' '}
            available across the selected jobs.
          </p>
          {!matches.matching && (
            <div className="exception-empty">
              <h3>No matching review items</h3>
              <p>
                Try another filter. An empty queue does not prove complete
                costs, physical completion or financial authority.
              </p>
            </div>
          )}
          <ul className="exception-queue">
            {matches.queue.map((row) => {
              const job = review.portfolio.jobs.find(
                (j) => j.target.job_id === row.job_id,
              )!;
              return (
                <li key={row.id}>
                  <article>
                    <div className="exception-tags">
                      <span>{row.status}</span>
                      <span>{row.kind.replaceAll('_', ' ')}</span>
                    </div>
                    <h3>{row.title}</h3>
                    <p className="exception-job">
                      {job.customer_name} · {job.property_label}
                    </p>
                    <p>{job.name}</p>
                    <p>{row.observation}</p>
                    <p>{row.suggested_review}</p>
                    <button type="button" onClick={() => open(row.id)}>
                      Open exact job review
                    </button>
                  </article>
                </li>
              );
            })}
          </ul>
          {detail && (
            <section
              className="exception-detail"
              aria-label="Exact financial exception source"
            >
              <h3 ref={detailHeading} tabIndex={-1}>
                {detail.exception.title}
              </h3>
              <p>
                {detail.job.customer_name} · {detail.job.property_label}
              </p>
              <p>{detail.exception.observation}</p>
              <dl>
                <div>
                  <dt>Exact job / saved revision</dt>
                  <dd>
                    {detail.target.job_id} /{' '}
                    {detail.exception.source.job_revision}
                  </dd>
                </div>
                <div>
                  <dt>Property</dt>
                  <dd>{detail.target.location_id}</dd>
                </div>
                <div>
                  <dt>Issued estimate / version</dt>
                  <dd>
                    {detail.target.estimate_id} / {detail.target.version_id} ·
                    version {detail.exception.source.issued_version_number}
                  </dd>
                </div>
              </dl>
              <div
                className="exception-scroll"
                tabIndex={0}
                role="region"
                aria-label="Exact job saved versus scenario canonical cost evidence"
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Canonical cost evidence</th>
                      <th scope="col">Saved source</th>
                      <th scope="col">Detached scenario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ['Recorded cost', 'recordedMinor'],
                        ['Net unpaid commitments', 'unpaidCommitmentMinor'],
                        ['Remaining forecast', 'remainingForecastMinor'],
                        ['Cost to complete', 'costToCompleteMinor'],
                        ['Projected cost', 'projectedMinor'],
                      ] as const
                    ).map(([label, field]) => (
                      <tr key={field}>
                        <th scope="row">{label}</th>
                        <td>
                          {detail.job.review.recorded.recorded.costReview
                            .completion.totals
                            ? money(
                                detail.job.review.recorded.recorded.costReview
                                  .completion.totals[field],
                              )
                            : 'UNKNOWN'}
                        </td>
                        <td>
                          {detail.job.review.scenario.completion.totals
                            ? money(
                                detail.job.review.scenario.completion.totals[
                                  field
                                ],
                              )
                            : 'UNKNOWN'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Projected contribution margin:{' '}
                {detail.job.review.scenario.margin.totals
                  ?.projectedMarginBps === null ||
                !detail.job.review.scenario.margin.totals
                  ? 'UNKNOWN'
                  : formatMarginBps(
                      detail.job.review.scenario.margin.totals
                        .projectedMarginBps,
                    )}
                . Partial/unknown evidence never guarantees profit.
              </p>
              <h4>
                Original invoice requirements ·{' '}
                {detail.job.review.invoice.overall}
              </h4>
              <p>
                Issued quoted customer total:{' '}
                {money(detail.job.review.invoice.scope.totals.total_minor)}. Not
                earned revenue, an invoice or customer debt.
              </p>
              <ul>
                {detail.job.review.invoice.requirements.map((r) => (
                  <li key={r.id}>
                    <strong>
                      {r.id}: {r.status}
                    </strong>{' '}
                    — {r.detail}
                  </li>
                ))}
              </ul>
              <p>
                Accounting: {detail.job.review.compatibility.accounting.status};
                QuickBooks:{' '}
                {detail.job.review.compatibility.accounting.quickbooks.status};
                procurement:{' '}
                {detail.job.review.compatibility.procurement.status}.
              </p>
              <details>
                <summary>Exact source integrity</summary>
                <p>Scope SHA256: {detail.exception.source.scope_sha256}</p>
                <p>
                  Canonical cost references:{' '}
                  {detail.exception.source.expense_ids.join(', ') ||
                    'None recorded'}
                </p>
              </details>
              <button
                type="button"
                onClick={displayJob}
                disabled={!onSelectJob}
              >
                Display existing job workflow
              </button>
              <button type="button" onClick={() => setDetail(null)}>
                Close exact source
              </button>
            </section>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void reconcile()}
          >
            Check exact retained financial evidence
          </button>
          <p className="exception-note">
            Staff-only session evidence. No forecast save, expense, invoice,
            receivable, ledger, export, payroll, procurement order, payment,
            provider or message action. Integrity: {review.sha256}
          </p>
        </div>
      )}
    </section>
  );
}
