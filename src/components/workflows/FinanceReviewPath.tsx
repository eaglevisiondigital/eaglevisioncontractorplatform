import { useEffect, useId, useRef, useState } from 'react';
import { prototypeFields } from '../../lib/program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import {
  assertFinancialCaseworkCurrent,
  type FinancialCaseworkReview,
} from '../../lib/workflows/financial-casework';
import type { OperatingJobSection } from '../../lib/workflows/operating-navigation';
import {
  financeReviewPathEnabled,
  readFinanceReviewPath,
  openFinanceReviewPath,
  assertFinanceReviewPathCurrent,
  inspectFinanceReviewEvidence,
  assertFinanceReviewEvidenceCurrent,
  returnFinanceReviewPath,
  navigateFinanceReviewPath,
  type FinanceReviewPathSelection,
  type FinanceReviewEvidence,
} from '../../lib/workflows/finance-review-path';
import './finance-review-path.css';

export function FinanceReviewPath({
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
  if (financeReviewPathEnabled(enabled))
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
    binding.handles.some((value, index) => value !== handles[index])
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
    <ReviewPath
      key={binding.generation}
      sources={sources}
      selectedJobId={selectedJobId}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="finance-review-path"
      aria-label="Financial exception review path"
    >
      <h2>Financial exception review path</h2>
      <p>
        {enabled
          ? 'Exact company/job source is unavailable. Previous detail is withheld.'
          : 'Financial exception review path is off. Confirm local sources first.'}
      </p>
    </section>
  );
}
function ReviewPath({
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
    [path, setPath] = useState<FinanceReviewPathSelection | null>(null),
    [detail, setDetail] = useState<FinanceReviewEvidence | null>(null),
    [source, setSource] = useState(''),
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
    if (path) heading.current?.focus();
  }, [path, detail]);
  let current = false,
    reviewCurrent = false;
  if (review && confirmed)
    try {
      assertFinancialCaseworkCurrent(review);
      reviewCurrent = true;
    } catch {
      reviewCurrent = false;
    }
  if (path && reviewCurrent)
    try {
      assertFinanceReviewPathCurrent(path);
      if (detail) assertFinanceReviewEvidenceCurrent(detail);
      current = true;
    } catch {
      current = false;
    }
  async function read() {
    if (!confirmed || busy) return;
    const token = ++epoch.current,
      admission = { enabled: true, confirmed: true };
    gate.current.confirmed = false;
    gate.current = admission;
    setBusy(true);
    setError('');
    setPath(null);
    setDetail(null);
    setReview(null);
    setStatus('');
    try {
      const next = await readFinanceReviewPath(
        sources,
        { as_of: new Date().toISOString(), input_revision: token },
        admission,
      );
      if (token !== epoch.current || !admission.confirmed) return;
      setReview(next);
    } catch {
      if (token === epoch.current)
        setError(
          'Financial source read UNKNOWN. No command was started; original correction holds remain.',
        );
    } finally {
      if (token === epoch.current) setBusy(false);
    }
  }
  function open(exceptionId: string) {
    if (!review || busy) return;
    try {
      const next = openFinanceReviewPath(review, exceptionId, selectedJobId);
      setPath(next);
      setDetail(null);
      setSource('');
      setError('');
      setStatus('');
    } catch {
      setError(
        'Exact exception/job context UNKNOWN. No alternate case is selected.',
      );
    }
  }
  function inspect() {
    if (!path || !current || !source) return;
    try {
      const item = path.sources.find(
        (item) => `${item.kind}:${item.id}` === source,
      );
      if (!item) throw Error('Missing source');
      setDetail(
        inspectFinanceReviewEvidence(path, { kind: item.kind, id: item.id }),
      );
      setStatus(
        'Exact source evidence inspected. Return keeps this original exception and observation cutoff.',
      );
    } catch {
      setError(
        'Exact financial evidence UNKNOWN. No replacement event or posting is selected.',
      );
    }
  }
  function back() {
    if (!path) return;
    const result = returnFinanceReviewPath(path);
    if (result.status === 'UNKNOWN') {
      setError(
        'Return context UNKNOWN; source/access changed. No alternate case or retry is selected.',
      );
      return;
    }
    setDetail(null);
    setStatus(`Returned to original exception ${result.anchor.exception_id}.`);
  }
  return (
    <section
      className="finance-review-path"
      aria-label="Financial exception review path"
    >
      <p className="path-eyebrow">Finance · {sources.company.name}</p>
      <h2>Financial exception review path</h2>
      <p>
        Follow one original exception through cost coverage, invoice
        requirements and immutable financial evidence, then return to the same
        case.
      </p>
      <label className="path-confirm" htmlFor={`${id}-confirm`}>
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
        I confirm this company’s current local financial sources.
      </label>
      <button
        type="button"
        disabled={!confirmed || busy}
        onClick={() => void read()}
      >
        Read financial exception sources
      </button>
      {busy && <p role="status">Reading exact financial sources…</p>}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {review && reviewCurrent && !path && (
        <ul className="path-list">
          {review.jobs
            .filter(
              (job) =>
                selectedJobId === undefined ||
                job.target.job_id === selectedJobId,
            )
            .flatMap((job) =>
              job.requirements
                .filter((item) => job.original_exception_ids.includes(item.id))
                .map((item) => (
                  <li key={item.id}>
                    <strong>
                      {job.name} · {item.title}
                    </strong>
                    <p>{item.observation}</p>
                    <button
                      type="button"
                      aria-label={`Open financial exception: ${item.title} for ${job.target.job_id}`}
                      onClick={() => open(item.id)}
                    >
                      Open financial exception
                    </button>
                  </li>
                )),
            )}
        </ul>
      )}
      {path && !current && (
        <p role="alert">
          UNKNOWN — source, job revision, observation cutoff or access changed.
          Previous amounts and review controls are withheld.
        </p>
      )}
      {path && current && (
        <div className="path-card">
          <h3 ref={heading} tabIndex={-1}>
            {detail
              ? 'Inspected financial evidence'
              : 'Selected financial exception'}
          </h3>
          <p>
            {path.name} · {path.customer_name} · {path.property_label}
          </p>
          <p>
            <strong>{path.exception.title}</strong> · {path.exception.status}
          </p>
          <p>{path.exception.suggested_review}</p>
          <dl>
            <dt>Original exception / exact job</dt>
            <dd>
              {path.anchor.exception_id} / {path.anchor.target.job_id}
            </dd>
            <dt>Issued version / saved job revision</dt>
            <dd>
              {path.anchor.target.version_id} / {path.anchor.job_revision}
            </dd>
            <dt>Issued source hash</dt>
            <dd>{path.anchor.issued_scope_sha256}</dd>
            <dt>Observation cutoff</dt>
            <dd>{path.anchor.as_of}</dd>
          </dl>
          {!detail ? (
            <>
              <h4>Canonical cost coverage</h4>
              <p>
                {path.coverage.cost_coverage}. Missing costs remain UNKNOWN,
                never zero. Invoice readiness {path.invoice.overall} grants no
                permission to issue.
              </p>
              <dl>
                <dt>
                  Recorded / unpaid commitments / remaining / cost to complete
                  (minor units)
                </dt>
                <dd>
                  {path.coverage.costs
                    ? `${path.coverage.costs.recordedMinor} / ${path.coverage.costs.unpaidCommitmentMinor} / ${path.coverage.costs.remainingForecastMinor} / ${path.coverage.costs.costToCompleteMinor}`
                    : 'UNKNOWN'}{' '}
                  {path.invoice.scope.currency}
                </dd>
              </dl>
              <ul>
                {path.coverage.missing_evidence.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <h4>Original invoice requirements</h4>
              <ul>
                {path.invoice.requirements.map((item) => (
                  <li key={item.id}>
                    <strong>
                      {item.id} · {item.status}
                    </strong>
                    <p>{item.detail}</p>
                  </li>
                ))}
              </ul>
              <label htmlFor={`${id}-source`}>
                Exact linked financial source
                <select
                  id={`${id}-source`}
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                >
                  <option value="">Choose an existing source</option>
                  {path.sources.map((item) => (
                    <option
                      key={`${item.kind}:${item.id}`}
                      value={`${item.kind}:${item.id}`}
                    >
                      {item.kind} · {item.label} · {item.id}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={!source} onClick={inspect}>
                Inspect linked financial source
              </button>
            </>
          ) : (
            <>
              <dl>
                <dt>Immutable source kind / ID</dt>
                <dd>
                  {detail.selection.identity.kind} /{' '}
                  {detail.selection.identity.id}
                </dd>
                <dt>Canonical status</dt>
                <dd>{detail.selection.item?.status ?? 'UNKNOWN'}</dd>
                <dt>Related exact IDs</dt>
                <dd>
                  {detail.selection.item?.related_ids.join(', ') ||
                    'No exact relationship supplied'}
                </dd>
                <dt>Canonical amount (minor units)</dt>
                <dd>
                  {detail.selection.item?.amount_minor ?? 'UNKNOWN'}{' '}
                  {path.invoice.scope.currency}
                </dd>
              </dl>
              <p>{detail.selection.item?.meaning}</p>
              {detail.invoice_source && (
                <dl>
                  <dt>Invoice / contract / original offer</dt>
                  <dd>
                    {detail.invoice_source.id} /{' '}
                    {detail.invoice_source.contract_id} /{' '}
                    {detail.invoice_source.offer_id ?? 'UNKNOWN'}
                  </dd>
                  <dt>Invoice snapshot hash</dt>
                  <dd>{detail.invoice_source.snapshot_sha256 ?? 'UNKNOWN'}</dd>
                  <dt>Canonical financial source hash</dt>
                  <dd>
                    {detail.invoice_source.canonical_source_sha256 ?? 'UNKNOWN'}
                  </dd>
                  <dt>Canonical reconciliation / linkage</dt>
                  <dd>
                    {detail.invoice_source.verification} /{' '}
                    {detail.invoice_source.linkage}
                  </dd>
                  <dt>Captured / refunded / balance (minor units)</dt>
                  <dd>
                    {detail.invoice_source.summary?.captured_minor ?? 'UNKNOWN'}{' '}
                    /{' '}
                    {detail.invoice_source.summary?.refunded_minor ?? 'UNKNOWN'}{' '}
                    /{' '}
                    {detail.invoice_source.summary?.balance_minor ?? 'UNKNOWN'}
                  </dd>
                </dl>
              )}
              {detail.event && (
                <dl>
                  <dt>Event kind / creation time / adjustment</dt>
                  <dd>
                    {detail.event.kind} / {detail.event.created_at} /{' '}
                    {detail.event.adjusts_event_id ?? 'No adjustment'}
                  </dd>
                </dl>
              )}
              {detail.posting && (
                <dl>
                  <dt>Posting accounts / event / creation time</dt>
                  <dd>
                    {detail.posting.debit_account} →{' '}
                    {detail.posting.credit_account} /{' '}
                    {detail.posting.event_id ?? 'Invoice posting'} /{' '}
                    {detail.posting.created_at}
                  </dd>
                </dl>
              )}
              <p>{detail.identity_meaning}</p>
              <button type="button" onClick={back}>
                Return to selected financial case
              </button>
            </>
          )}
          <button
            type="button"
            disabled={!onSelectJob}
            onClick={() => {
              if (onSelectJob) {
                const result = navigateFinanceReviewPath(path, onSelectJob);
                setStatus(
                  result.status === 'UNKNOWN'
                    ? 'UNKNOWN — original Finance navigation withheld.'
                    : 'Original Finance review requested. Host navigation may close this local return path.',
                );
              }
            }}
          >
            Open original Finance review
          </button>
        </div>
      )}
      <p className="path-muted">
        Staff-only synthetic review. No financial writes or customer projection.
        Original correction holds and all execution gates remain. Release1.0 NOT
        READY / NOT AUTHORIZED.
      </p>
    </section>
  );
}
