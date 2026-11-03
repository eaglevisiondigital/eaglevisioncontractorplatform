import { useEffect, useId, useRef, useState } from 'react';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { prototypeFields } from '../../lib/program/prototype-source';
import {
  openFinancialCaseworkJob,
  assertFinancialCaseworkCurrent,
  type FinancialCaseworkReview,
  type FinancialCaseworkDetail,
} from '../../lib/workflows/financial-casework';
import type { OperatingJobSection } from '../../lib/workflows/operating-navigation';
import {
  financeCaseContinuityEnabled,
  readFinanceCaseContinuity,
  financialCaseSourceItems,
  inspectFinanceCaseSource,
  assertFinanceCaseSelectionCurrent,
  compareFinanceCaseSelection,
  navigateFinanceCaseSelection,
  type FinanceCaseSelection,
  type FinanceCaseSourceKind,
} from '../../lib/workflows/finance-case-continuity';
import './finance-case-continuity.css';

export function FinanceCaseContinuity({
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
  let handles: unknown[] = [],
    available = false;
  if (financeCaseContinuityEnabled(enabled))
    try {
      const capture = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      });
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
    handles,
    available,
    revision: 0,
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
      handles,
      available,
      revision: binding.revision + 1,
    });
    return null;
  }
  return available ? (
    <ContinuityDesk
      key={binding.revision}
      sources={sources}
      selectedJobId={selectedJobId}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="finance-case-continuity"
      aria-label="Financial case source continuity"
    >
      <h2>Financial case source continuity</h2>
      <p>
        {enabled
          ? 'Current financial sources unavailable. Prior evidence is withheld.'
          : 'Financial case source continuity is off. Confirm local company sources first.'}
      </p>
    </section>
  );
}
function ContinuityDesk({
  sources,
  selectedJobId,
  onSelectJob,
}: {
  sources: OperatingSources;
  selectedJobId?: string;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
}) {
  const id = useId(),
    heading = useRef<HTMLHeadingElement>(null),
    epoch = useRef(0),
    gate = useRef({ enabled: true, confirmed: false });
  const [confirmed, confirm] = useState(false),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState<FinancialCaseworkReview | null>(null),
    [jobId, setJobId] = useState(selectedJobId ?? ''),
    [detail, setDetail] = useState<FinancialCaseworkDetail | null>(null),
    [kind, setKind] = useState<FinanceCaseSourceKind>('requirement'),
    [sourceId, setSourceId] = useState(''),
    [selection, setSelection] = useState<FinanceCaseSelection | null>(null),
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
    if (detail || selection) heading.current?.focus();
  }, [detail, selection]);
  let current = false;
  if (review && confirmed)
    try {
      assertFinancialCaseworkCurrent(review);
      if (detail) assertFinancialCaseworkCurrent(detail);
      current = true;
    } catch {
      current = false;
    }
  let items: ReturnType<typeof financialCaseSourceItems> = [];
  if (detail && current)
    items = financialCaseSourceItems(detail).filter(
      (item) => item.kind === kind,
    );
  let selectedCurrent = false;
  if (selection && current)
    try {
      assertFinanceCaseSelectionCurrent(selection);
      selectedCurrent = true;
    } catch {
      selectedCurrent = false;
    }
  async function read() {
    if (!confirmed || busy) return;
    const token = ++epoch.current,
      admission = { enabled: true, confirmed: true };
    gate.current = admission;
    setBusy(true);
    setError('');
    setDetail(null);
    setStatus('');
    setReview(null);
    try {
      const next = await readFinanceCaseContinuity(
        sources,
        { as_of: new Date().toISOString(), input_revision: token },
        admission,
      );
      if (token !== epoch.current || !admission.confirmed) return;
      assertFinancialCaseworkCurrent(next);
      setReview(next);
      if (selection) {
        const comparison = compareFinanceCaseSelection(selection, next);
        setStatus(
          `${comparison.status}: retained ${comparison.selected_identity.kind} ${comparison.selected_identity.id}; reviewed job revision ${comparison.reviewed_revision}, current ${comparison.current_revision}; status ${comparison.reviewed_status} → ${comparison.current_status}. Inspect the current exact source again. No replacement or correction replay.`,
        );
      }
    } catch {
      if (token === epoch.current)
        setError(
          'Source read UNKNOWN. No financial command was started. Explicit read-only source review cannot replay a correction attempt.',
        );
    } finally {
      if (token === epoch.current) setBusy(false);
    }
  }
  function inspectCase() {
    if (!review || !current || busy) return;
    try {
      setDetail(openFinancialCaseworkJob(review, jobId));
      setError('');
    } catch {
      setError(
        'Exact admitted job source UNKNOWN. No alternate job is selected.',
      );
    }
  }
  function inspectItem() {
    if (!review || !detail || !current || busy) return;
    try {
      const next = inspectFinanceCaseSource(review, jobId, {
        kind,
        id: sourceId,
      });
      setSelection(next);
      setStatus(
        next.status === 'UNKNOWN'
          ? 'Selected source UNKNOWN or missing. No nearby event, posting or newer invoice is substituted.'
          : 'Exact source inspected. Canonical verification and invoice readiness remain unchanged.',
      );
    } catch {
      setError('Exact current source UNKNOWN; inspection withheld.');
    }
  }
  function compare() {
    if (!review || !selection || !current) return;
    try {
      const result = compareFinanceCaseSelection(selection, review);
      setStatus(`${result.status} — ${result.meaning}`);
    } catch {
      setError(
        'Retained comparison UNKNOWN. Explicitly read current sources; no replay or substitution.',
      );
    }
  }
  return (
    <section
      className="finance-case-continuity"
      aria-label="Financial case source continuity"
    >
      <p className="continuity-eyebrow">Finance · {sources.company.name}</p>
      <h2>Financial case source continuity</h2>
      <p>
        Follow one exact financial requirement, invoice, event, posting or cost
        reference through its existing canonical evidence. No financial state
        changes.
      </p>
      <label className="continuity-confirm" htmlFor={`${id}-confirm`}>
        <input
          id={`${id}-confirm`}
          type="checkbox"
          checked={confirmed}
          onChange={(e) => {
            epoch.current++;
            gate.current.confirmed = false;
            confirm(e.target.checked);
            setBusy(false);
            setDetail(null);
          }}
        />
        I confirm this company’s current local financial sources.
      </label>
      <button
        type="button"
        disabled={!confirmed || busy}
        onClick={() => void read()}
      >
        Read financial case sources
      </button>
      {busy && <p role="status">Reading canonical case evidence…</p>}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {review && !current && (
        <p role="alert">
          UNKNOWN — saved sources or access changed. Old amounts and navigation
          are withheld. Read current sources explicitly; original correction
          holds remain.
        </p>
      )}
      {current && review && (
        <>
          <label htmlFor={`${id}-job`}>
            Exact financial case
            <select
              id={`${id}-job`}
              value={jobId}
              onChange={(e) => {
                setJobId(e.target.value);
                setDetail(null);
                setSelection(null);
                setSourceId('');
                setStatus('');
              }}
            >
              <option value="">Choose an admitted job</option>
              {review.jobs.map((job) => (
                <option key={job.target.job_id} value={job.target.job_id!}>
                  {job.name} · {job.target.job_id}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={!jobId || busy} onClick={inspectCase}>
            Inspect financial case
          </button>
          {detail && (
            <div className="continuity-card">
              <h3 ref={heading} tabIndex={-1}>
                Exact financial case source
              </h3>
              <p>
                {detail.job.name} · {detail.job.customer_name} ·{' '}
                {detail.job.property_label}
              </p>
              <dl>
                <dt>Job / saved revision</dt>
                <dd>
                  {detail.job.target.job_id} / {detail.job.source.job_revision}
                </dd>
                <dt>Original estimate / issued version</dt>
                <dd>
                  {detail.job.target.estimate_id} /{' '}
                  {detail.job.target.version_id}
                </dd>
                <dt>Original offer / preference receipt</dt>
                <dd>
                  {detail.job.source.original_offer_id} /{' '}
                  {detail.job.source.original_receipt_id}
                </dd>
                <dt>Canonical evidence coverage</dt>
                <dd>
                  {detail.job.financial.coverage}; genuine provider and bank
                  settlement UNKNOWN
                </dd>
              </dl>
              <p>
                Invoice preparation: {detail.job.invoice.overall}. Cost
                coverage: {detail.job.facts.cost_coverage}. Missing coverage
                never becomes zero.
              </p>
              <div className="continuity-controls">
                <label htmlFor={`${id}-kind`}>
                  Financial source kind
                  <select
                    id={`${id}-kind`}
                    value={kind}
                    onChange={(e) => {
                      setKind(e.target.value as FinanceCaseSourceKind);
                      setSourceId('');
                      setSelection(null);
                    }}
                  >
                    {(
                      [
                        'requirement',
                        'invoice',
                        'event',
                        'posting',
                        'expense',
                      ] as const
                    ).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor={`${id}-source`}>
                  Exact financial source
                  <select
                    id={`${id}-source`}
                    value={sourceId}
                    onChange={(e) => {
                      setSourceId(e.target.value);
                      setSelection(null);
                    }}
                  >
                    <option value="">Choose an exact source</option>
                    {sourceId &&
                      !items.some((item) => item.id === sourceId) && (
                        <option value={sourceId}>
                          UNKNOWN retained source {sourceId}
                        </option>
                      )}
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} · {item.id} · {item.status}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {!items.length && (
                <p>
                  No canonical {kind} source is present for this exact job.
                  Coverage and amounts remain UNKNOWN.
                </p>
              )}
              <button
                type="button"
                disabled={!sourceId || busy}
                onClick={inspectItem}
              >
                Inspect exact case source
              </button>
              {selectedCurrent && selection && (
                <div className="continuity-selection">
                  <h4>Selected financial source</h4>
                  <dl>
                    <dt>Retained kind / identity</dt>
                    <dd>
                      {selection.identity.kind} / {selection.identity.id}
                    </dd>
                    <dt>Exact lookup</dt>
                    <dd>{selection.status}</dd>
                    <dt>Canonical source status</dt>
                    <dd>{selection.item?.status ?? 'UNKNOWN'}</dd>
                    <dt>Existing invoice reference</dt>
                    <dd>
                      {selection.item?.invoice_id ??
                        'UNKNOWN / not an invoice association'}
                    </dd>
                    <dt>Exact related source IDs</dt>
                    <dd>
                      {selection.item?.related_ids.join(', ') ||
                        'No exact relationship supplied'}
                    </dd>
                    <dt>Canonical amount in minor units</dt>
                    <dd>
                      {selection.item?.amount_minor ?? 'UNKNOWN'}{' '}
                      {detail.job.currency}{' '}
                      {selection.identity.kind === 'invoice'
                        ? '(invoice balance)'
                        : ''}
                    </dd>
                    <dt>Source hash</dt>
                    <dd>{selection.source_sha256}</dd>
                  </dl>
                  <p>
                    {selection.item?.meaning ??
                      'The selected identity is missing or ambiguous. No alternate source is used.'}
                  </p>
                </div>
              )}
              <div className="continuity-actions">
                <button
                  type="button"
                  disabled={!selection || busy}
                  onClick={compare}
                >
                  Compare retained case source
                </button>
                <button
                  type="button"
                  disabled={
                    !selectedCurrent ||
                    selection?.status !== 'EXACT_RECORDED_SOURCE' ||
                    !onSelectJob ||
                    busy
                  }
                  onClick={() => {
                    if (selection && onSelectJob) {
                      const result = navigateFinanceCaseSelection(
                        selection,
                        onSelectJob,
                      );
                      setStatus(
                        result.status === 'UNKNOWN'
                          ? 'UNKNOWN — exact Finance navigation withheld.'
                          : 'Existing Finance review requested; no business action executed.',
                      );
                    }
                  }}
                >
                  Open existing Finance review
                </button>
              </div>
              <h4>Original invoice-readiness requirements</h4>
              <ul>
                {detail.job.invoice.requirements.map((r) => (
                  <li key={r.id}>
                    <strong>
                      {r.id} · {r.status}
                    </strong>
                    <p>{r.detail}</p>
                  </li>
                ))}
              </ul>
              <p>
                The retained C13 Financial Casework and C12 Financial Evidence
                Review desks own forecast comparison and original correction
                holds. This source inspector adds no preparation or save action.
              </p>
            </div>
          )}
        </>
      )}
      <p className="continuity-muted">
        Staff-only synthetic source review. No cost/ledger/invoice/payment
        mutation, provider, message or hosted action. Release1.0 NOT READY / NOT
        AUTHORIZED.
      </p>
    </section>
  );
}
