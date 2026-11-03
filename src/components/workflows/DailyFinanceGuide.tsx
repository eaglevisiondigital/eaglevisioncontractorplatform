import { useEffect, useId, useRef, useState } from 'react';
import { formatMinor } from '../../domain/estimating/calculation';
import { prototypeFields } from '../../lib/program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import type {
  FinancialCaseworkFilter,
  FinancialCaseworkReview,
} from '../../lib/workflows/financial-casework';
import type { OperatingJobSection } from '../../lib/workflows/operating-navigation';
import {
  dailyFinanceGuideEnabled,
  readDailyFinanceGuide,
  filterDailyFinanceGuide,
  assertDailyFinanceGuideCurrent,
  selectDailyFinanceReview,
  assertDailyFinanceReviewCurrent,
  returnDailyFinanceReview,
  navigateDailyFinanceReview,
  type DailyFinanceReviewSelection,
} from '../../lib/workflows/daily-finance-guide';
import { FinanceReviewPath } from './FinanceReviewPath';
import './daily-finance-guide.css';

const costLabels = [
  ['recordedMinor', 'Recorded internal costs'],
  ['unpaidCommitmentMinor', 'Unpaid commitments'],
  ['remainingForecastMinor', 'Saved remaining forecast'],
  ['costToCompleteMinor', 'Cost to complete'],
  ['projectedMinor', 'Projected costs'],
] as const;

export function DailyFinanceGuide({
  sources,
  enabled = false,
  selectedJobId,
  onSelectJob,
}: {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
}) {
  let available = false,
    handles: unknown[] = [];
  if (dailyFinanceGuideEnabled(enabled))
    try {
      const capture = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      });
      if (
        selectedJobId !== undefined &&
        (typeof selectedJobId !== 'string' ||
          !capture.entries.some(
            (entry) => entry.target.job_id === selectedJobId,
          ))
      )
        throw Error('Unadmitted job hint');
      handles = [
        ...Object.values(
          prototypeFields(sources, [
            'company',
            'operations',
            'estimates',
            'property',
            'entries',
            'gate',
          ]),
        ),
        ...capture.entries.flatMap((entry) => [
          entry,
          entry.target,
          entry.release,
        ]),
      ];
      capture.check();
      available = true;
    } catch {
      available = false;
    }
  const [binding, bind] = useState({
    sources,
    enabled,
    selectedJobId,
    handles,
    available,
    generation: 0,
  });
  if (
    binding.sources !== sources ||
    binding.enabled !== enabled ||
    binding.selectedJobId !== selectedJobId ||
    binding.available !== available ||
    binding.handles.length !== handles.length ||
    binding.handles.some((handle, i) => handle !== handles[i])
  ) {
    bind({
      sources,
      enabled,
      selectedJobId,
      handles,
      available,
      generation: binding.generation + 1,
    });
    return null;
  }
  return available ? (
    <Guide
      key={binding.generation}
      sources={sources}
      selectedJobId={selectedJobId}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section className="daily-finance-guide" aria-label="Daily financial guide">
      <h2>Daily financial guide</h2>
      <p>
        {enabled
          ? 'Exact company/job source unavailable. Prior financial evidence is withheld.'
          : 'Daily financial guide is off. Confirm local company sources first.'}
      </p>
    </section>
  );
}
function Guide({
  sources,
  selectedJobId,
  onSelectJob,
}: {
  sources: OperatingSources;
  selectedJobId?: string;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
}) {
  const id = useId(),
    epoch = useRef(0),
    gate = useRef({ enabled: true, confirmed: false }),
    heading = useRef<HTMLHeadingElement>(null);
  const [confirmed, confirm] = useState(false),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState<FinancialCaseworkReview | null>(null),
    [filter, setFilter] = useState<FinancialCaseworkFilter>({
      query: '',
      kind: 'all',
      job_id: selectedJobId ?? null,
    }),
    [selected, setSelected] = useState<DailyFinanceReviewSelection | null>(
      null,
    ),
    [sourceMounted, setSourceMounted] = useState(false),
    [showSource, setShowSource] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    const generation = epoch,
      admission = gate;
    return () => {
      generation.current++;
      admission.current.confirmed = false;
    };
  }, [sources]);
  useEffect(() => {
    if (selected) heading.current?.focus();
  }, [selected, showSource]);
  let current = false,
    selectedCurrent = false;
  if (review && confirmed)
    try {
      assertDailyFinanceGuideCurrent(review);
      current = true;
    } catch {
      current = false;
    }
  if (selected && current)
    try {
      assertDailyFinanceReviewCurrent(selected);
      selectedCurrent = true;
    } catch {
      selectedCurrent = false;
    }
  let view: ReturnType<typeof filterDailyFinanceGuide> | null = null;
  if (review && current)
    try {
      view = filterDailyFinanceGuide(review, {
        ...filter,
        job_id: selectedJobId ?? filter.job_id,
      });
    } catch {
      view = null;
    }
  async function read() {
    if (!confirmed || busy) return;
    const token = ++epoch.current,
      admission = { enabled: true, confirmed: true };
    gate.current.confirmed = false;
    gate.current = admission;
    setBusy(true);
    setError('');
    setStatus('');
    setSelected(null);
    setShowSource(false);
    setSourceMounted(false);
    try {
      const next = await readDailyFinanceGuide(
        sources,
        { as_of: new Date().toISOString(), input_revision: token },
        admission,
      );
      if (token !== epoch.current || !admission.confirmed) return;
      assertDailyFinanceGuideCurrent(next);
      setReview(next);
      setStatus(
        'Current saved financial evidence read. Filter the available jobs, then inspect an original manual review.',
      );
    } catch {
      if (token === epoch.current)
        setError(
          'Financial source read UNKNOWN. No correction or financial command was started; original holds remain.',
        );
    } finally {
      if (token === epoch.current) setBusy(false);
    }
  }
  function select(jobId: string, exceptionId: string) {
    if (!review || !current || busy) return;
    try {
      const next = selectDailyFinanceReview(
        review,
        { job_id: jobId, exception_id: exceptionId },
        selectedJobId,
      );
      setSelected(next);
      setSourceMounted(false);
      setShowSource(false);
      setStatus('Original exact exception selected for manual review.');
      setError('');
    } catch {
      setError(
        'Exact job/exception UNKNOWN. No alternate financial case is selected.',
      );
    }
  }
  function returnToGuide() {
    if (!selected) return;
    const result = returnDailyFinanceReview(selected);
    if (result.status === 'UNKNOWN')
      setError(
        'Current return context UNKNOWN. Original evidence is withheld; no replay or replacement.',
      );
    else {
      setShowSource(false);
      setStatus(
        'Returned to the same guide exception and filters. Original source controls remain mounted with their retained state.',
      );
    }
  }
  return (
    <section className="daily-finance-guide" aria-label="Daily financial guide">
      <p className="daily-finance-eyebrow">Finance · {sources.company.name}</p>
      <h2>Daily financial guide</h2>
      <p>
        Review saved costs, profitability gaps and invoice requirements
        together. Suggested next reviews retain the original evidence order;
        they never authorize an invoice, payment or cost change.
      </p>
      <label className="daily-finance-confirm" htmlFor={`${id}-confirm`}>
        <input
          id={`${id}-confirm`}
          type="checkbox"
          checked={confirmed}
          onChange={(event) => {
            epoch.current++;
            gate.current.confirmed = false;
            confirm(event.target.checked);
            setBusy(false);
          }}
        />
        I confirm the current company and saved financial sources.
      </label>
      <button
        type="button"
        disabled={!confirmed || busy}
        onClick={() => void read()}
      >
        Read daily financial sources
      </button>
      {busy && (
        <p role="status">Reading current canonical financial evidence…</p>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      {review && !current && (
        <p role="alert">
          UNKNOWN — source, input or staff access changed. Previous figures,
          review suggestions and source controls are withheld.
        </p>
      )}
      {review && current && (
        <>
          <p>
            Observation cutoff: {review.as_of}. Available source coverage is
            limited to {review.jobs.length} admitted jobs.
          </p>
          <div hidden={showSource}>
            <div className="daily-finance-filters">
              <label htmlFor={`${id}-query`}>
                Search daily financial evidence
                <input
                  id={`${id}-query`}
                  maxLength={200}
                  value={filter.query}
                  onChange={(event) =>
                    setFilter({ ...filter, query: event.target.value })
                  }
                />
              </label>
              <label htmlFor={`${id}-area`}>
                Financial review area
                <select
                  id={`${id}-area`}
                  value={filter.kind}
                  onChange={(event) =>
                    setFilter({
                      ...filter,
                      kind: event.target
                        .value as FinancialCaseworkFilter['kind'],
                    })
                  }
                >
                  <option value="all">All original review areas</option>
                  <option value="coverage">Cost coverage gaps</option>
                  <option value="margin">Canonical margin warnings</option>
                  <option value="remaining_cost">Remaining costs</option>
                  <option value="invoice_readiness">
                    Invoice requirements
                  </option>
                </select>
              </label>
              <label htmlFor={`${id}-job`}>
                Exact financial job
                <select
                  id={`${id}-job`}
                  disabled={selectedJobId !== undefined}
                  value={selectedJobId ?? filter.job_id ?? ''}
                  onChange={(event) =>
                    setFilter({ ...filter, job_id: event.target.value || null })
                  }
                >
                  {selectedJobId === undefined && (
                    <option value="">All admitted jobs</option>
                  )}
                  {review.jobs.map((job) => (
                    <option key={job.target.job_id} value={job.target.job_id!}>
                      {job.name} · {job.target.job_id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p role="status">
              {view
                ? `${view.matching} matching of ${view.available} admitted jobs`
                : 'Exact filter UNKNOWN; no alternate selected.'}
            </p>
            <p>{view?.order_meaning}</p>
            {view?.matching === 0 && (
              <p>
                No recorded job evidence matches these literal filters. Absence
                from this view does not prove resolution or complete history.
              </p>
            )}
            <ul className="daily-finance-list">
              {view?.jobs.map((item) => (
                <li key={item.job.target.job_id}>
                  <h3>{item.job.name}</h3>
                  <p>
                    {item.job.customer_name} · {item.job.property_label}
                  </p>
                  <dl>
                    <dt>Saved cost coverage</dt>
                    <dd>{item.cost_coverage}</dd>
                    <dt>Profitability evidence</dt>
                    <dd>
                      {item.profitability === 'UNKNOWN'
                        ? 'UNKNOWN — complete cost/labor evidence is unavailable'
                        : 'Recorded forecast only; final profitability unverified'}
                    </dd>
                    <dt>Invoice readiness</dt>
                    <dd>{item.invoice_readiness}</dd>
                    <dt>Canonical financial evidence</dt>
                    <dd>{item.canonical_coverage}</dd>
                  </dl>
                  {item.job.facts.missing_evidence.length > 0 && (
                    <ul>
                      {item.job.facts.missing_evidence.map((gap, i) => (
                        <li key={i}>{gap}</li>
                      ))}
                    </ul>
                  )}
                  <p>
                    Next original manual review:{' '}
                    <strong>
                      {item.next_review?.title ??
                        'UNKNOWN — no applicable original exception in this filter'}
                    </strong>
                  </p>
                  {item.next_review && (
                    <>
                      <p>{item.next_review.observation}</p>
                      <p>{item.next_review.suggested_review}</p>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Inspect next financial review: ${item.next_review.title} for ${item.job.target.job_id}`}
                        onClick={() =>
                          select(item.job.target.job_id!, item.next_review!.id)
                        }
                      >
                        Inspect next financial review
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
          {selected && !selectedCurrent && (
            <p role="alert">
              UNKNOWN — the selected financial review is no longer current. No
              replacement path or source controls are offered.
            </p>
          )}
          {selected && selectedCurrent && (
            <div className="daily-finance-selected">
              <h3 ref={heading} tabIndex={-1}>
                {showSource
                  ? 'Original financial source controls'
                  : 'Selected daily financial review'}
              </h3>
              <p>
                {selected.name} · {selected.exception.title} ·{' '}
                {selected.exception.status}
              </p>
              <p>{selected.exception.suggested_review}</p>
              <dl>
                <dt>Exact original exception</dt>
                <dd>{selected.anchor.exception_id}</dd>
                <dt>Job / saved revision</dt>
                <dd>
                  {selected.anchor.target.job_id} /{' '}
                  {selected.anchor.job_revision}
                </dd>
                <dt>Issued version / scope SHA-256</dt>
                <dd>
                  {selected.anchor.target.version_id} /{' '}
                  {selected.anchor.issued_scope_sha256}
                </dd>
                <dt>Financial source SHA-256 / cutoff</dt>
                <dd>
                  {selected.anchor.source_sha256} / {selected.anchor.as_of}
                </dd>
              </dl>
              {!showSource && (
                <>
                  <h4>Canonical recorded cost and forecast coverage</h4>
                  {selected.coverage.costs === null ? (
                    <p>Costs UNKNOWN. Missing costs are not zero.</p>
                  ) : (
                    <dl>
                      {costLabels.map(([field, label]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>
                            {formatMinor(
                              selected.coverage.costs![field],
                              selected.coverage.costs!.currency,
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <h4>Invoice requirements · {selected.invoice.overall}</h4>
                  <ul>
                    {selected.invoice.requirements.map((requirement) => (
                      <li key={requirement.id}>
                        <strong>
                          {requirement.id} · {requirement.status}
                        </strong>
                        <p>{requirement.detail}</p>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      try {
                        assertDailyFinanceReviewCurrent(selected);
                        setSourceMounted(true);
                        setShowSource(true);
                        setStatus(
                          'Original source controls opened for this exact job. Their explicit confirmation and exception selection remain required.',
                        );
                      } catch {
                        setError(
                          'Current exact source controls UNKNOWN. No alternate job is opened.',
                        );
                      }
                    }}
                  >
                    Open original financial source path
                  </button>
                </>
              )}
              {showSource && (
                <button type="button" onClick={returnToGuide}>
                  Return to daily financial guide
                </button>
              )}
              {sourceMounted && (
                <div hidden={!showSource}>
                  <p>
                    Guide exception: {selected.exception.title} ·{' '}
                    {selected.anchor.exception_id}. Use the unchanged original
                    controls to inspect this job’s exact exception, invoice,
                    event or posting. Local return retains this control
                    instance; separate host navigation may unmount the guide.
                  </p>
                  <FinanceReviewPath
                    key={selected.anchor.exception_id}
                    sources={sources}
                    enabled={true}
                    selectedJobId={selected.anchor.target.job_id!}
                    onSelectJob={
                      onSelectJob
                        ? (jobId, section) => {
                            if (
                              jobId !== selected.anchor.target.job_id ||
                              section !== 'finance'
                            )
                              throw Error('Exact financial navigation only');
                            if (
                              navigateDailyFinanceReview(selected, onSelectJob)
                                .status === 'UNKNOWN'
                            )
                              throw Error('Current guide navigation UNKNOWN');
                          }
                        : undefined
                    }
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
      <p className="daily-finance-muted">
        Staff-only local evidence review. No final profit, genuine contract,
        bank settlement, correction preparation or financial execution
        authority. Release1.0 NOT READY / NOT AUTHORIZED.
      </p>
    </section>
  );
}
