import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { formatMinor } from '../../domain/estimating/calculation';
import { prototypeFields } from '../../lib/program/prototype-source';
import { captureOperatingSources } from '../../lib/workflows/operating-center-runtime';
import type { DailyWorkbenchProps } from '../../lib/workflows/daily-workbench-contract';
import type { FinanceCaseDeskReview } from '../../lib/workflows/finance-case-desk';
import type { FinanceReviewEvidence } from '../../lib/workflows/finance-review-path';
import {
  costInvoiceReviewEnabled,
  readCostInvoiceReview,
  openCostInvoiceReview,
  assertCostInvoiceSourcesCurrent,
  assertCostInvoiceReviewCurrent,
  inspectCostInvoiceSource,
  focusCostInvoiceReview,
  continueCostInvoiceReview,
  returnCostInvoiceReview,
  type CostInvoiceSelection,
  type CostInvoiceContinuationLease,
} from '../../lib/workflows/cost-invoice-review';
import { FinanceCaseDesk } from './FinanceCaseDesk';
import './cost-invoice-review.css';

const costLabels = [
  ['recordedMinor', 'Recorded internal costs'],
  ['unpaidCommitmentMinor', 'Unpaid commitments'],
  ['remainingForecastMinor', 'Saved remaining forecast'],
  ['costToCompleteMinor', 'Cost to complete'],
  ['projectedMinor', 'Projected costs'],
] as const;
export function CostInvoiceReview({
  sources,
  enabled = false,
  selectedJobId,
  onSelectJob,
  onContinue,
  focus,
}: DailyWorkbenchProps) {
  let available = false,
    handles: unknown[] = [];
  if (costInvoiceReviewEnabled(enabled))
    try {
      if (focus !== undefined && focus !== 'review' && focus !== 'invoice')
        throw Error('Exact cost/invoice focus required');
      const capture = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      });
      if (
        selectedJobId !== undefined &&
        !capture.entries.some((e) => e.target.job_id === selectedJobId)
      )
        throw Error('Unadmitted selected job');
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
    <Review
      key={binding.generation}
      sources={sources}
      selectedJobId={selectedJobId}
      onSelectJob={onSelectJob}
      onContinue={onContinue}
      focus={focus}
    />
  ) : (
    <section
      className="cost-invoice-review"
      aria-label="Cost and invoice review"
    >
      <h2>Cost and invoice review</h2>
      <p>
        {enabled
          ? 'Exact company/job source unavailable. Prior financial evidence is withheld.'
          : 'Cost and invoice review is off. Confirm local sources first.'}
      </p>
    </section>
  );
}
function Review({
  sources,
  selectedJobId,
  onSelectJob,
  onContinue,
  focus,
}: DailyWorkbenchProps) {
  const id = useId(),
    epoch = useRef(0),
    pending = useRef(false),
    gate = useRef({ enabled: true, confirmed: false }),
    callback = useRef<CostInvoiceContinuationLease>({
      current: onContinue,
      generation: 0,
    }),
    heading = useRef<HTMLHeadingElement>(null);
  const [confirmed, confirm] = useState(false),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState<FinanceCaseDeskReview | null>(null),
    [selected, setSelected] = useState<CostInvoiceSelection | null>(null),
    [evidence, setEvidence] = useState<FinanceReviewEvidence | null>(null),
    [lease, setLease] = useState<CostInvoiceContinuationLease | null>(null),
    [mode, setMode] = useState({ hint: focus, value: focus ?? 'review' }),
    [filter, setFilter] = useState({ query: '', status: 'all' }),
    [mounted, setMounted] = useState(false),
    [original, setOriginal] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState('');
  if (mode.hint !== focus) {
    setMode({ hint: focus, value: focus ?? 'review' });
    setFilter({ query: '', status: 'all' });
    setEvidence(null);
    setOriginal(false);
  }
  const active = mode.hint === focus ? mode.value : (focus ?? 'review');
  useEffect(() => {
    const generation = epoch,
      admission = gate;
    return () => {
      generation.current++;
      admission.current.confirmed = false;
    };
  }, [sources]);
  useLayoutEffect(() => {
    const ref = callback;
    ref.current = {
      current: onContinue,
      generation: ref.current.generation + 1,
    };
    return () => {
      ref.current = {
        current: undefined,
        generation: ref.current.generation + 1,
      };
    };
  }, [onContinue]);
  useEffect(() => {
    if (selected) heading.current?.focus();
  }, [selected, evidence, original, active]);
  let current = false,
    selectedCurrent = false;
  if (review && confirmed)
    try {
      assertCostInvoiceSourcesCurrent(review);
      current = true;
    } catch {
      current = false;
    }
  if (selected && current)
    try {
      assertCostInvoiceReviewCurrent(selected, selectedJobId);
      selectedCurrent = true;
    } catch {
      selectedCurrent = false;
    }
  let view: ReturnType<typeof focusCostInvoiceReview> | null = null;
  if (selected && selectedCurrent)
    try {
      view = focusCostInvoiceReview(
        selected,
        { focus: active, ...filter },
        selectedJobId,
      );
    } catch {
      view = null;
    }
  async function read() {
    if (!confirmed || pending.current) return;
    const token = ++epoch.current,
      admission = { enabled: true, confirmed: true },
      navLease = { ...callback.current };
    gate.current.confirmed = false;
    gate.current = admission;
    pending.current = true;
    setBusy(true);
    setReview(null);
    setSelected(null);
    setEvidence(null);
    setMounted(false);
    setOriginal(false);
    setError('');
    try {
      const next = await readCostInvoiceReview(
        sources,
        { as_of: new Date().toISOString(), input_revision: token },
        admission,
      );
      if (token !== epoch.current || !admission.confirmed) return;
      assertCostInvoiceSourcesCurrent(next);
      setReview(next);
      if (selectedJobId) {
        setSelected(openCostInvoiceReview(next, selectedJobId, selectedJobId));
        setLease(navLease);
      }
      setStatus(
        'Saved canonical sources read. Cost and invoice focus share this exact job.',
      );
    } catch {
      if (token === epoch.current)
        setError(
          'Cost/invoice source UNKNOWN. No correction, invoice or payment command was started.',
        );
    } finally {
      pending.current = false;
      if (token === epoch.current) setBusy(false);
    }
  }
  function choose(job: string) {
    if (!review || !current || pending.current) return;
    try {
      setSelected(openCostInvoiceReview(review, job, selectedJobId));
      setLease({ ...callback.current });
      setEvidence(null);
      setMounted(false);
      setOriginal(false);
      setError('');
    } catch {
      setError('Exact authorized job UNKNOWN; no alternate selected.');
    }
  }
  function switchFocus(next: 'review' | 'invoice') {
    setMode({ hint: focus, value: next });
    setFilter({ query: '', status: 'all' });
    setEvidence(null);
    setOriginal(false);
  }
  function next() {
    if (!selected || !lease) return;
    const result = continueCostInvoiceReview(
      selected,
      active === 'invoice' ? 'customer' : 'invoice',
      lease,
      callback.current,
      selectedJobId,
    );
    setStatus(result.status === 'NO_DISPATCH' ? result.meaning : result.status);
    if (result.status === 'UNKNOWN')
      setError(
        'Continuation UNKNOWN. Original canonical hold remains; exact read-only reconciliation only.',
      );
  }
  return (
    <section
      className="cost-invoice-review"
      aria-label="Cost and invoice review"
    >
      <p className="cost-invoice-review-eyebrow">
        Finance · {sources.company.name}
      </p>
      <h2>Cost and invoice review</h2>
      <p>
        Review recorded costs and profitability, then inspect exact invoice
        prerequisites. Local review never changes a ledger, resolves an
        exception or issues an invoice.
      </p>
      <label htmlFor={`${id}-confirm`}>
        <input
          id={`${id}-confirm`}
          type="checkbox"
          checked={confirmed}
          onChange={(e) => {
            epoch.current++;
            gate.current.confirmed = false;
            confirm(e.target.checked);
            setBusy(false);
          }}
        />{' '}
        I confirm the current company and saved cost/invoice sources.
      </label>
      <button
        type="button"
        disabled={!confirmed || busy}
        onClick={() => void read()}
      >
        Read cost and invoice sources
      </button>
      {busy && <p role="status">Reading saved cost and invoice evidence…</p>}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      {review && !current && (
        <p role="alert">
          UNKNOWN — staff, context or saved sources changed. Earlier figures are
          withheld.
        </p>
      )}
      {review && current && (
        <>
          {selectedJobId === undefined && (
            <label htmlFor={`${id}-job`}>
              Exact financial job
              <select
                id={`${id}-job`}
                value={selected?.anchor.target.job_id ?? ''}
                onChange={(e) => choose(e.target.value)}
              >
                <option value="">Choose an admitted job</option>
                {review.jobs.map((j) => (
                  <option key={j.target.job_id} value={j.target.job_id!}>
                    {j.name} · {j.target.job_id}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selected && !selectedCurrent && (
            <p role="alert">
              UNKNOWN — retained cost/invoice context is terminal. No fallback,
              renewed source or navigation.
            </p>
          )}
          {selected && selectedCurrent && (
            <>
              <h3 ref={heading} tabIndex={-1}>
                {active === 'invoice'
                  ? 'Invoice requirements'
                  : 'Cost and exception review'}{' '}
                · {selected.job.name}
              </h3>
              <nav aria-label="Cost and invoice breadcrumbs">
                {selected.job.customer_name} / {selected.job.property_label} /{' '}
                {selected.job.name}
              </nav>
              <p>
                Job {selected.anchor.target.job_id} · saved revision{' '}
                {selected.anchor.job_revision} · issued version{' '}
                {selected.anchor.target.version_id}
              </p>
              <div
                className="cost-invoice-review-actions"
                aria-label="Cost and invoice focus"
              >
                <button
                  type="button"
                  aria-pressed={active === 'review'}
                  onClick={() => switchFocus('review')}
                >
                  Review costs and exceptions
                </button>
                <button
                  type="button"
                  aria-pressed={active === 'invoice'}
                  onClick={() => switchFocus('invoice')}
                >
                  Review invoice requirements
                </button>
              </div>
              <div hidden={original}>
                {active === 'review' && (
                  <div className="cost-invoice-review-summary">
                    <section>
                      <h4>
                        Canonical cost coverage ·{' '}
                        {selected.job.facts.cost_coverage}
                      </h4>
                      {selected.job.facts.costs ? (
                        <dl>
                          {costLabels.map(([key, label]) => (
                            <div key={key}>
                              <dt>{label}</dt>
                              <dd>
                                {formatMinor(
                                  selected.job.facts.costs![key],
                                  selected.job.facts.costs!.currency,
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p>
                          Costs UNKNOWN. Missing cost/labor coverage is not
                          zero.
                        </p>
                      )}
                      <ul>
                        {selected.job.facts.missing_evidence.map((gap, i) => (
                          <li key={i}>{gap}</li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <h4>Recorded profitability</h4>
                      {selected.job.facts.margin ? (
                        <dl>
                          <dt>Recorded revised revenue</dt>
                          <dd>
                            {formatMinor(
                              selected.job.facts.margin.revenueMinor,
                              selected.job.currency,
                            )}
                          </dd>
                          <dt>Projected cost</dt>
                          <dd>
                            {formatMinor(
                              selected.job.facts.margin.projectedCostMinor,
                              selected.job.currency,
                            )}
                          </dd>
                          <dt>Projected contribution</dt>
                          <dd>
                            {formatMinor(
                              selected.job.facts.margin
                                .projectedContributionMinor,
                              selected.job.currency,
                            )}
                          </dd>
                        </dl>
                      ) : (
                        <p>
                          Margin UNKNOWN — incomplete evidence. No final
                          profitability claim.
                        </p>
                      )}
                      <p>
                        Forecasts remain separate from actual/committed costs
                        and bank settlement.
                      </p>
                    </section>
                  </div>
                )}
                {active === 'invoice' && (
                  <section
                    className="cost-invoice-review-invoice"
                    aria-label="Original invoice requirements"
                  >
                    <h4>
                      Invoice Preparation — Staff Review Only ·{' '}
                      {selected.job.invoice.overall}
                    </h4>
                    <p>
                      Original issued estimate{' '}
                      {selected.job.invoice.issued.estimate_id} · version{' '}
                      {selected.job.invoice.issued.version_number} · saved
                      revision {selected.job.invoice.issued.saved_revision}
                    </p>
                    <p>{selected.job.invoice.relationship.meaning}</p>
                    <dl>
                      <dt>Canonical scope SHA-256</dt>
                      <dd>{selected.job.invoice.scope_sha256}</dd>
                      {(
                        [
                          ['subtotal_minor', 'Issued subtotal'],
                          ['discount_minor', 'Issued discount'],
                          ['tax_minor', 'Issued tax'],
                          ['total_minor', 'Issued total'],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key}>
                          <dt>{label}</dt>
                          <dd>
                            {formatMinor(
                              selected.job.invoice.scope.totals[key],
                              selected.job.currency,
                            )}
                          </dd>
                        </div>
                      ))}
                      <dt>Existing invoice reference</dt>
                      <dd>
                        {selected.job.invoice.reference.invoice_id ??
                          'UNKNOWN — none selected'}
                      </dd>
                      <dt>Recorded invoice status</dt>
                      <dd>{selected.job.invoice.status}</dd>
                    </dl>
                  </section>
                )}
                <div className="cost-invoice-review-filters">
                  <label htmlFor={`${id}-query`}>
                    Search cost/invoice evidence
                    <input
                      id={`${id}-query`}
                      value={filter.query}
                      maxLength={200}
                      onChange={(e) =>
                        setFilter({ ...filter, query: e.target.value })
                      }
                    />
                  </label>
                  <label htmlFor={`${id}-state`}>
                    Original requirement status
                    <select
                      id={`${id}-state`}
                      value={filter.status}
                      onChange={(e) =>
                        setFilter({ ...filter, status: e.target.value })
                      }
                    >
                      <option value="all">All recorded statuses</option>
                      {view?.statuses.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p role="status">
                  {view
                    ? `${view.requirement_count} matching of ${view.available_requirements} original requirements; ${view.source_count} matching of ${view.available_sources} exact source references`
                    : 'Exact focus or filter UNKNOWN. No alternate evidence.'}
                </p>
                {view?.requirement_count === 0 && (
                  <p>
                    No available original requirement matches. This is not proof
                    of readiness, resolution or complete history.
                  </p>
                )}
                <ul className="cost-invoice-review-list">
                  {view?.requirements.map((row) => (
                    <li key={row.id}>
                      <strong>
                        {row.title} · {row.status}
                      </strong>
                      <p>{row.observation}</p>
                      <p>{row.suggested_review}</p>
                      <small>{row.id}</small>
                    </li>
                  ))}
                </ul>
                <h4>Exact source drill-down</h4>
                <ul className="cost-invoice-review-list">
                  {view?.sources.map((source, i) => (
                    <li key={`${source.kind}:${source.id}:${i}`}>
                      <p>
                        {source.kind} · {source.id} · {source.status}
                      </p>
                      <button
                        type="button"
                        aria-label={`Inspect exact source: ${source.kind} ${source.id}`}
                        onClick={() => {
                          try {
                            setEvidence(
                              inspectCostInvoiceSource(
                                selected,
                                { kind: source.kind, id: source.id },
                                selectedJobId,
                              ),
                            );
                            setError('');
                          } catch {
                            setEvidence(null);
                            setError(
                              'Exact source UNKNOWN; no substituted invoice, event or posting.',
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
                    className="cost-invoice-review-evidence"
                    aria-label="Inspected cost and invoice source"
                  >
                    <h4>Inspected exact financial source</h4>
                    <p>
                      {evidence.selection.identity.kind} ·{' '}
                      {evidence.selection.identity.id} ·{' '}
                      {evidence.selection.status}
                    </p>
                    <p>{evidence.selection.item?.meaning}</p>
                    <dl>
                      <dt>Original invoice snapshot SHA-256</dt>
                      <dd>
                        {evidence.invoice_source?.snapshot_sha256 ??
                          'UNKNOWN — not an admitted invoice snapshot'}
                      </dd>
                      <dt>Original related source IDs</dt>
                      <dd>
                        {evidence.selection.item?.related_ids.join(' · ') ||
                          'None recorded'}
                      </dd>
                    </dl>
                  </section>
                )}
                <h4>Accounting evidence</h4>
                <p>
                  {selected.accounting.canonical_coverage} ·{' '}
                  {selected.accounting.status}
                </p>
                <p>{selected.accounting.meaning}</p>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      assertCostInvoiceReviewCurrent(selected, selectedJobId);
                      setMounted(true);
                      setOriginal(true);
                    } catch {
                      setError('Original retained finance context UNKNOWN.');
                    }
                  }}
                >
                  Open retained finance case desk
                </button>
                {onContinue && (
                  <button type="button" onClick={next}>
                    {active === 'invoice'
                      ? 'Continue to customer service review'
                      : 'Continue to invoice review'}
                  </button>
                )}
              </div>
              {original && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      returnCostInvoiceReview(selected, selectedJobId)
                        .status === 'UNKNOWN'
                    )
                      setError('Exact retained return UNKNOWN; no replay.');
                    else {
                      setOriginal(false);
                      setStatus(
                        'Returned with the same saved source, focus and filters.',
                      );
                    }
                  }}
                >
                  Return to cost and invoice review
                </button>
              )}
              {mounted && (
                <div hidden={!original}>
                  <FinanceCaseDesk
                    sources={sources}
                    enabled={true}
                    selectedJobId={selected.anchor.target.job_id!}
                    onSelectJob={onSelectJob}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
      <p className="cost-invoice-review-muted">
        Staff-only local review. No correction, invoice/receivable creation,
        accounting export, payment, settlement or communication. Same-tab
        context is not durable custody. Release1.0 NOT READY / NOT AUTHORIZED.
      </p>
    </section>
  );
}
