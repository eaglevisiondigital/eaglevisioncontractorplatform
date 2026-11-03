import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { prototypeFields } from '../../lib/program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import type { OperatingJobSection } from '../../lib/workflows/operating-navigation';
import {
  financeCaseDeskEnabled,
  readFinanceCaseDesk,
  assertFinanceCaseDeskReviewCurrent,
  filterFinanceCaseDesk,
  openFinanceCaseDesk,
  assertFinanceCaseDeskCurrent,
  inspectFinanceCaseDeskSource,
  returnFinanceCaseDesk,
  navigateFinanceCaseDesk,
  type FinanceCaseDeskReview,
  type FinanceCaseDeskSelection,
  type FinanceCaseDeskFilter,
} from '../../lib/workflows/finance-case-desk';
import type { FinanceReviewEvidence } from '../../lib/workflows/finance-review-path';
import { formatMinor } from '../../domain/estimating/calculation';
import { FinanceReviewPath } from './FinanceReviewPath';
import './finance-case-desk.css';

type Props = {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
};
export function FinanceCaseDesk({
  sources,
  enabled = false,
  selectedJobId,
  onSelectJob,
}: Props) {
  let available = false,
    handles: unknown[] = [];
  if (financeCaseDeskEnabled(enabled))
    try {
      const capture = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      });
      if (
        selectedJobId !== undefined &&
        !capture.entries.some((e) => e.target.job_id === selectedJobId)
      )
        throw Error('Unadmitted job');
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
        ...capture.entries.flatMap((e) => [e, e.target, e.release]),
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
    available,
    handles,
    generation: 0,
  });
  if (
    binding.sources !== sources ||
    binding.enabled !== enabled ||
    binding.selectedJobId !== selectedJobId ||
    binding.available !== available ||
    binding.handles.length !== handles.length ||
    binding.handles.some((v, i) => v !== handles[i])
  ) {
    bind({
      sources,
      enabled,
      selectedJobId,
      available,
      handles,
      generation: binding.generation + 1,
    });
    return null;
  }
  return available ? (
    <Desk
      key={binding.generation}
      sources={sources}
      selectedJobId={selectedJobId}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section className="finance-case-desk" aria-label="Finance case desk">
      <h2>Finance case desk</h2>
      <p>
        {enabled
          ? 'Exact company/job source unavailable. Prior evidence is withheld.'
          : 'Finance case desk is off. Confirm local sources first.'}
      </p>
    </section>
  );
}
function Desk({ sources, selectedJobId, onSelectJob }: Props) {
  const id = useId(),
    epoch = useRef(0),
    admission = useRef({ enabled: true, confirmed: false }),
    heading = useRef<HTMLHeadingElement>(null),
    callback = useRef({ fn: onSelectJob, generation: 0 });
  const [confirmed, confirm] = useState(false),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState<FinanceCaseDeskReview | null>(null),
    [desk, setDesk] = useState<FinanceCaseDeskSelection | null>(null),
    [evidence, setEvidence] = useState<FinanceReviewEvidence | null>(null),
    [filter, setFilter] = useState<FinanceCaseDeskFilter>({
      query: '',
      kind: 'all',
      job_id: selectedJobId ?? null,
    }),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [sourceMounted, setSourceMounted] = useState(false),
    [showSource, setShowSource] = useState(false),
    [lease, setLease] = useState<{
      fn: Props['onSelectJob'];
      generation: number;
    } | null>(null);
  useEffect(() => {
    const gate = admission,
      generation = epoch;
    return () => {
      generation.current++;
      gate.current.confirmed = false;
    };
  }, [sources]);
  useLayoutEffect(() => {
    callback.current = {
      fn: onSelectJob,
      generation: callback.current.generation + 1,
    };
    return () => {
      callback.current = {
        fn: undefined,
        generation: callback.current.generation + 1,
      };
    };
  }, [onSelectJob]);
  useEffect(() => {
    if (desk) heading.current?.focus();
  }, [desk, evidence, showSource]);
  let current = false,
    deskCurrent = false;
  if (review && confirmed)
    try {
      assertFinanceCaseDeskReviewCurrent(review);
      current = true;
    } catch {
      current = false;
    }
  if (desk && current)
    try {
      assertFinanceCaseDeskCurrent(desk, selectedJobId);
      deskCurrent = true;
    } catch {
      deskCurrent = false;
    }
  let view: ReturnType<typeof filterFinanceCaseDesk> | null = null;
  if (review && current)
    try {
      view = filterFinanceCaseDesk(review, {
        ...filter,
        job_id: selectedJobId ?? filter.job_id,
      });
    } catch {
      view = null;
    }
  async function read() {
    if (!confirmed || busy) return;
    const token = ++epoch.current,
      gate = { enabled: true, confirmed: true };
    admission.current.confirmed = false;
    admission.current = gate;
    setBusy(true);
    setReview(null);
    setDesk(null);
    setEvidence(null);
    setSourceMounted(false);
    setShowSource(false);
    setError('');
    setStatus('');
    try {
      const next = await readFinanceCaseDesk(
        sources,
        { as_of: new Date().toISOString(), input_revision: token },
        gate,
      );
      if (token !== epoch.current || !gate.confirmed) return;
      assertFinanceCaseDeskReviewCurrent(next);
      setReview(next);
      if (selectedJobId) {
        const selected = openFinanceCaseDesk(
          next,
          selectedJobId,
          selectedJobId,
        );
        setDesk(selected);
        setLease({ ...callback.current });
      }
      setStatus(
        'Saved canonical evidence read. The selected job context is retained.',
      );
    } catch {
      if (token === epoch.current)
        setError(
          'Financial evidence UNKNOWN. No financial command was started.',
        );
    } finally {
      if (token === epoch.current) setBusy(false);
    }
  }
  function choose(jobId: string) {
    if (!review || !current || busy) return;
    try {
      setDesk(openFinanceCaseDesk(review, jobId, selectedJobId));
      setLease({ ...callback.current });
      setEvidence(null);
      setSourceMounted(false);
      setShowSource(false);
      setError('');
      setStatus(
        'Exact job retained. Inspect any original requirement or source directly.',
      );
    } catch {
      setError('Exact job context UNKNOWN; no alternate job selected.');
    }
  }
  function navigate() {
    if (!desk || !lease) return;
    const result = navigateFinanceCaseDesk(
      desk,
      (job, section) => {
        if (
          !lease.fn ||
          callback.current.fn !== lease.fn ||
          callback.current.generation !== lease.generation
        )
          throw Error('Host callback changed');
        lease.fn(job, section);
      },
      selectedJobId,
    );
    setStatus(result.status);
    if (result.status === 'UNKNOWN')
      setError('Navigation UNKNOWN; no replay or alternate destination.');
  }
  const costs = desk?.job.facts.costs;
  return (
    <section className="finance-case-desk" aria-label="Finance case desk">
      <p className="finance-case-desk-eyebrow">
        Finance · {sources.company.name}
      </p>
      <h2>Finance case desk</h2>
      <p>
        Review costs, profitability, invoice requirements and accounting
        evidence in one retained job context. Recommendations never resolve an
        exception or change a ledger.
      </p>
      <label htmlFor={`${id}-confirm`}>
        <input
          id={`${id}-confirm`}
          type="checkbox"
          checked={confirmed}
          onChange={(e) => {
            epoch.current++;
            admission.current.confirmed = false;
            confirm(e.target.checked);
            setBusy(false);
          }}
        />{' '}
        I confirm the current company and saved financial sources.
      </label>
      <button
        type="button"
        disabled={!confirmed || busy}
        onClick={() => void read()}
      >
        Read finance case desk
      </button>
      {busy && <p role="status">Reading saved canonical financial evidence…</p>}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      {review && !current && (
        <p role="alert">
          UNKNOWN — source, staff, input or context changed. Previous financial
          evidence is withheld.
        </p>
      )}
      {review && current && (
        <>
          <div hidden={showSource}>
            <div className="finance-case-desk-filters">
              <label htmlFor={`${id}-query`}>
                Search finance cases
                <input
                  id={`${id}-query`}
                  value={filter.query}
                  maxLength={200}
                  onChange={(e) =>
                    setFilter({ ...filter, query: e.target.value })
                  }
                />
              </label>
              <label htmlFor={`${id}-area`}>
                Review requirement
                <select
                  id={`${id}-area`}
                  value={filter.kind}
                  onChange={(e) =>
                    setFilter({
                      ...filter,
                      kind: e.target.value as FinanceCaseDeskFilter['kind'],
                    })
                  }
                >
                  <option value="all">All requirements</option>
                  <option value="coverage">Cost coverage</option>
                  <option value="margin">Profitability warnings</option>
                  <option value="remaining_cost">Cost to complete</option>
                  <option value="invoice_readiness">
                    Invoice requirements
                  </option>
                  <option value="canonical_evidence">
                    Canonical/accounting evidence
                  </option>
                </select>
              </label>
            </div>
            <p role="status">
              {view
                ? `${view.matching} matching of ${view.available} admitted jobs`
                : 'Exact filter UNKNOWN; no alternate selected.'}
            </p>
            {view?.matching === 0 && (
              <p>
                No available case matches. This is not complete financial
                coverage or proof of resolution.
              </p>
            )}
            <ul className="finance-case-desk-jobs">
              {view?.jobs.map((job) => (
                <li key={job.target.job_id}>
                  <h3>{job.name}</h3>
                  <p>
                    {job.customer_name} · {job.property_label}
                  </p>
                  <p>
                    {job.requirements.length} original review requirements ·
                    invoice {job.invoice.overall}
                  </p>
                  <button
                    type="button"
                    aria-label={`Review job case for ${job.target.job_id}`}
                    onClick={() => choose(job.target.job_id!)}
                  >
                    Review job case
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {desk && !deskCurrent && (
            <p role="alert">
              UNKNOWN — retained financial context is no longer current. No
              replacement or replay.
            </p>
          )}
          {desk && deskCurrent && (
            <div className="finance-case-desk-detail">
              <h3 ref={heading} tabIndex={-1}>
                Retained financial case · {desk.job.name}
              </h3>
              <nav aria-label="Retained financial breadcrumbs">
                <span>{desk.job.customer_name}</span>
                <span> / {desk.job.property_label}</span>
                <span> / {desk.job.name}</span>
              </nav>
              <p>
                Exact job {desk.anchor.target.job_id} · saved revision{' '}
                {desk.anchor.job_revision} · issued version{' '}
                {desk.anchor.target.version_id}
              </p>
              <div hidden={showSource}>
                <div className="finance-case-desk-summary">
                  <div>
                    <h4>Recorded cost coverage</h4>
                    <p>{desk.job.facts.cost_coverage}</p>
                    {costs ? (
                      <dl>
                        {(
                          [
                            ['recordedMinor', 'Recorded internal costs'],
                            ['unpaidCommitmentMinor', 'Unpaid commitments'],
                            [
                              'remainingForecastMinor',
                              'Saved remaining forecast',
                            ],
                            ['costToCompleteMinor', 'Cost to complete'],
                            ['projectedMinor', 'Projected costs'],
                          ] as const
                        ).map(([key, label]) => (
                          <div key={key}>
                            <dt>{label}</dt>
                            <dd>{formatMinor(costs[key], costs.currency)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p>Costs UNKNOWN. Missing costs are not zero.</p>
                    )}
                  </div>
                  <div>
                    <h4>Profitability and invoice readiness</h4>
                    <p>
                      {desk.job.facts.margin
                        ? 'Recorded forecast only; final profitability unverified'
                        : 'Margin UNKNOWN — missing cost or labor evidence'}
                    </p>
                    {desk.job.facts.margin && (
                      <dl>
                        <dt>Recorded revised revenue</dt>
                        <dd>
                          {formatMinor(
                            desk.job.facts.margin.revenueMinor,
                            desk.job.currency,
                          )}
                        </dd>
                        <dt>Projected cost</dt>
                        <dd>
                          {formatMinor(
                            desk.job.facts.margin.projectedCostMinor,
                            desk.job.currency,
                          )}
                        </dd>
                        <dt>Projected contribution</dt>
                        <dd>
                          {formatMinor(
                            desk.job.facts.margin.projectedContributionMinor,
                            desk.job.currency,
                          )}
                        </dd>
                        <dt>Projected margin</dt>
                        <dd>
                          {desk.job.facts.margin.projectedMarginBps === null
                            ? 'UNKNOWN'
                            : `${desk.job.facts.margin.projectedMarginBps / 100}%`}
                        </dd>
                      </dl>
                    )}
                    <p>Invoice requirements: {desk.job.invoice.overall}</p>
                    <p>
                      Canonical coverage: {desk.accounting.canonical_coverage}
                    </p>
                  </div>
                </div>
                <h4>Original review requirements</h4>
                <ul>
                  {desk.job.requirements.map((row) => (
                    <li key={row.id}>
                      <strong>
                        {row.title} · {row.status}
                      </strong>
                      <p>{row.observation}</p>
                      <p>{row.suggested_review}</p>
                    </li>
                  ))}
                </ul>
                <h4>Invoice requirements</h4>
                <ul>
                  {desk.job.invoice.requirements.map((row) => (
                    <li key={row.id}>
                      {row.id} · {row.status}
                      <p>{row.detail}</p>
                    </li>
                  ))}
                </ul>
                <h4>Exact financial source drill-down</h4>
                <ul className="finance-case-desk-sources">
                  {desk.sources.map((source, i) => (
                    <li key={`${source.kind}:${source.id}:${i}`}>
                      <strong>
                        {source.label} · {source.status}
                      </strong>
                      <p>
                        {source.kind} · {source.id}
                      </p>
                      <button
                        type="button"
                        aria-label={`Inspect exact source: financial ${source.kind} ${source.id}`}
                        onClick={() => {
                          try {
                            setEvidence(
                              inspectFinanceCaseDeskSource(
                                desk,
                                { kind: source.kind, id: source.id },
                                selectedJobId,
                              ),
                            );
                            setError('');
                          } catch {
                            setEvidence(null);
                            setError(
                              'Exact financial source UNKNOWN; no alternate evidence.',
                            );
                          }
                        }}
                      >
                        Inspect exact source
                      </button>
                    </li>
                  ))}
                </ul>
                {evidence && (
                  <section
                    aria-label="Exact financial evidence"
                    className="finance-case-desk-evidence"
                  >
                    <h4>Exact financial evidence</h4>
                    <p>
                      {evidence.selection.identity.kind} ·{' '}
                      {evidence.selection.identity.id} ·{' '}
                      {evidence.selection.status}
                    </p>
                    <p>{evidence.selection.item?.meaning}</p>
                    <dl>
                      <dt>Invoice snapshot SHA-256</dt>
                      <dd>
                        {evidence.invoice_source?.snapshot_sha256 ??
                          'UNKNOWN — not an admitted invoice snapshot'}
                      </dd>
                      <dt>Related original source IDs</dt>
                      <dd>
                        {evidence.selection.item?.related_ids.join(' · ') ||
                          'None recorded'}
                      </dd>
                    </dl>
                  </section>
                )}
                <h4>Accounting readiness</h4>
                <p>{desk.accounting.status}</p>
                <p>{desk.accounting.meaning}</p>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      assertFinanceCaseDeskCurrent(desk, selectedJobId);
                      setSourceMounted(true);
                      setShowSource(true);
                    } catch {
                      setError('Original source controls UNKNOWN.');
                    }
                  }}
                >
                  Open original finance controls
                </button>
                {onSelectJob && (
                  <button type="button" onClick={navigate}>
                    Open this job in Finance
                  </button>
                )}
              </div>
              {showSource && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      returnFinanceCaseDesk(desk, selectedJobId).status ===
                      'UNKNOWN'
                    )
                      setError('Retained return UNKNOWN.');
                    else {
                      setShowSource(false);
                      setStatus(
                        'Returned to the same job, filters and financial evidence.',
                      );
                    }
                  }}
                >
                  Return to finance case desk
                </button>
              )}
              {sourceMounted && (
                <div hidden={!showSource}>
                  <p>
                    The original source workflow keeps its separate confirmation
                    and financial authority boundaries.
                  </p>
                  <FinanceReviewPath
                    sources={sources}
                    enabled={true}
                    selectedJobId={desk.anchor.target.job_id!}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
      <p className="finance-case-desk-muted">
        Staff-only local review. No correction, invoice issuance, payment,
        settlement or accounting export. Same-tab context is not durable
        custody. Release1.0 NOT READY / NOT AUTHORIZED.
      </p>
    </section>
  );
}
