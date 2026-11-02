import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import {
  readJobReview,
  inspectJobReview,
  type JobReviewResult,
  type JobReviewSelection,
} from '../../lib/workflows/job-review';
import {
  decimalToScaled,
  formatMinor,
  parseMinor,
} from '../../domain/estimating/calculation';
import { FinanceWorkflow } from './FinanceWorkflow';
import './job-review.css';

/** Main supplies the original exact journey. No connected registration or default activation. */
export function JobReview({
  sources,
  enabled = false,
  showFinanceDetails = true,
}: {
  sources: LocalJourney;
  enabled?: boolean;
  showFinanceDetails?: boolean;
}) {
  const signature = JSON.stringify([
    sources.target,
    sources.gate.enabled,
    sources.gate.confirmed,
  ]);
  const [binding, bind] = useState({
    sources,
    signature,
    enabled,
    showFinanceDetails,
    generation: 0,
  });
  if (
    binding.sources !== sources ||
    binding.signature !== signature ||
    binding.enabled !== enabled ||
    binding.showFinanceDetails !== showFinanceDetails
  ) {
    bind({
      sources,
      signature,
      enabled,
      showFinanceDetails,
      generation: binding.generation + 1,
    });
    return null;
  }
  if (!enabled || !sources.gate.enabled || !sources.gate.confirmed)
    return (
      <section
        className="job-review"
        aria-label="Time materials and invoice review"
      >
        <h2>Time, materials &amp; invoice review</h2>
        <p>
          Staff review is off. Explicit local source confirmation is required.
        </p>
      </section>
    );
  return (
    <JobReviewForm
      key={binding.generation}
      sources={sources}
      showFinanceDetails={showFinanceDetails}
    />
  );
}
function JobReviewForm({
  sources,
  showFinanceDetails,
}: {
  sources: LocalJourney;
  showFinanceDetails: boolean;
}) {
  const id = useId();
  const [materialEnabled, setMaterialEnabled] = useState(false),
    [timeEnabled, setTimeEnabled] = useState(false);
  const [lineId, setLineId] = useState(''),
    [quantity, setQuantity] = useState(''),
    [unitCost, setUnitCost] = useState('');
  const [workerId, setWorkerId] = useState(''),
    [startedAt, setStartedAt] = useState(''),
    [endedAt, setEndedAt] = useState(''),
    [task, setTask] = useState('');
  const [allocation, setAllocation] = useState<'job' | 'overhead'>('job'),
    [overhead, setOverhead] = useState('');
  const [confirmed, setConfirmed] = useState(false),
    [revision, setRevision] = useState(1);
  const [review, setReview] = useState<JobReviewResult | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [unknown, setUnknown] = useState(false);
  const active = useRef<{
      gate: { enabled: boolean; confirmed: boolean };
      generation: number;
    } | null>(null),
    generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      if (active.current) active.current.gate.confirmed = false;
    },
    [sources],
  );
  let original: ReturnType<
    LocalJourney['estimates']['readSyntheticPrototypeSources']
  > | null = null;
  try {
    if (sources.gate.confirmed && sources.gate.enabled)
      original = sources.estimates.readSyntheticPrototypeSources(
        sources.target,
      );
  } catch {
    /* Fail closed: no stale source options or prior amounts. */
  }
  if (!original?.job || original.bundle.version.status !== 'issued')
    return (
      <section
        className="job-review"
        aria-label="Time materials and invoice review"
      >
        <h2>Time, materials &amp; invoice review</h2>
        <p role="alert">
          Exact issued job source unavailable. Previous figures are withheld.
        </p>
      </section>
    );
  const source = original,
    currency = source.bundle.version.calculation.currency;
  const lines = source.bundle.version.payload.lines.filter(
    (l) =>
      ['material', 'product'].includes(l.kind) &&
      source.bundle.version.calculation.lines.some(
        (c) => c.id === l.id && c.included,
      ),
  );
  const assignments = sources.estimates.syntheticJobAssignments(
    sources.company.id,
    sources.target.actor_id,
  );
  const workers = source.workforce.workers.filter(
    (w) =>
      w.active &&
      assignments.some(
        (a) =>
          a.active &&
          a.job_id === sources.target.job_id &&
          a.user_id === w.user_id,
      ),
  );
  function invalidate() {
    generation.current++;
    if (active.current) active.current.gate.confirmed = false;
    if (busy) {
      setUnknown(true);
      setBusy(false);
      setError(
        'Review outcome UNKNOWN after withdrawal. No automatic replay or replacement.',
      );
    }
    setRevision((n) => n + 1);
    setConfirmed(false);
    setReview(null);
    setStatus('');
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    if (!confirmed || busy || unknown || !sources.gate.confirmed) return;
    let input: JobReviewSelection;
    try {
      const line = lines.find((l) => l.id === lineId);
      if (materialEnabled && !line)
        throw Error('Choose an exact included material or product line.');
      input = {
        finance: {
          job_revision: source.job!.lock_revision,
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
          accounting_aliases: null,
          procurement: null,
        },
        material:
          materialEnabled && line
            ? {
                line_id: line.id,
                quantity_milli: decimalToScaled(quantity, 3),
                unit_cost_minor: parseMinor(unitCost, currency),
                catalog_item_id: line.catalog_item_id,
              }
            : null,
        time: timeEnabled
          ? {
              workerId,
              startedAt,
              endedAt,
              task,
              allocation,
              overheadCenter: allocation === 'overhead' ? overhead : null,
            }
          : null,
        input_revision: revision,
      };
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Check explicit proposal values.',
      );
      return;
    }
    const token = ++generation.current,
      gate = { enabled: true, confirmed: true };
    active.current = { gate, generation: token };
    setBusy(true);
    setError('');
    setStatus('');
    setReview(null);
    try {
      const result = await readJobReview(
        sources.estimates,
        sources.target,
        input,
        gate,
      );
      if (
        token === generation.current &&
        gate.confirmed &&
        sources.gate.confirmed &&
        sources.gate.enabled
      )
        setReview(result);
    } catch {
      if (token === generation.current) {
        setUnknown(true);
        setError(
          'Review outcome UNKNOWN. No retry or replacement is available in this session.',
        );
      }
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  async function inspect() {
    if (!review || busy) return;
    const exact = review,
      token = generation.current;
    setBusy(true);
    setStatus('');
    const result = await inspectJobReview(exact);
    if (token === generation.current && sources.gate.confirmed) {
      setStatus(
        `${result.status} · exact read-only inspection; no replacement.`,
      );
      if (result.status !== 'CURRENT_LOCAL_SOURCE') {
        setReview(null);
        setUnknown(true);
      }
      setBusy(false);
    }
  }
  const money = (value: number) => formatMinor(value, currency);
  return (
    <section
      className="job-review"
      aria-label="Time materials and invoice review"
    >
      <header>
        <p className="job-review-eyebrow">
          Internal staff · existing saved job
        </p>
        <h2>Time, materials &amp; invoice review</h2>
        <p>
          Explore explicit unsaved proposals without posting time, costs or
          invoices. Recorded cost coverage and the customer’s issued scope
          remain unchanged.
        </p>
      </header>
      <details className="job-review-card">
        <summary>Exact job, customer &amp; property</summary>
        <dl>
          <dt>Job</dt>
          <dd>
            {sources.target.job_id} · revision {source.job!.lock_revision}
          </dd>
          <dt>Customer</dt>
          <dd>{sources.target.customer_id}</dd>
          <dt>Property</dt>
          <dd>{sources.target.location_id}</dd>
          <dt>Issued estimate / version</dt>
          <dd>
            {sources.target.estimate_id} / {sources.target.version_id}
          </dd>
        </dl>
      </details>
      <form onSubmit={prepare} aria-label="Unsaved staff proposals">
        <div className="job-review-grid">
          <fieldset className="job-review-card" disabled={busy || unknown}>
            <legend>Material cost proposal</legend>
            <label className="job-review-check">
              <input
                type="checkbox"
                checked={materialEnabled}
                onChange={(e) => {
                  invalidate();
                  setMaterialEnabled(e.target.checked);
                }}
              />
              Include an unsaved material proposal
            </label>
            {materialEnabled ? (
              <>
                <label htmlFor={`${id}-line`}>
                  Exact issued material or product line
                </label>
                <select
                  id={`${id}-line`}
                  required
                  value={lineId}
                  onChange={(e) => {
                    invalidate();
                    setLineId(e.target.value);
                    setQuantity('');
                    setUnitCost('');
                  }}
                >
                  <option value="">Choose issued scope</option>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.description} · {l.unit}
                    </option>
                  ))}
                </select>
                <div className="job-review-grid">
                  <div>
                    <label htmlFor={`${id}-quantity`}>Proposed quantity</label>
                    <input
                      id={`${id}-quantity`}
                      value={quantity}
                      onChange={(e) => {
                        invalidate();
                        setQuantity(e.target.value);
                      }}
                      inputMode="decimal"
                      placeholder="e.g. 2.5"
                      required
                      aria-describedby={`${id}-quantity-help`}
                    />
                    <small id={`${id}-quantity-help`}>
                      Up to three decimals, in the issued line’s original unit.
                    </small>
                  </div>
                  <div>
                    <label htmlFor={`${id}-cost`}>
                      Proposed internal unit cost · {currency}
                    </label>
                    <input
                      id={`${id}-cost`}
                      value={unitCost}
                      onChange={(e) => {
                        invalidate();
                        setUnitCost(e.target.value);
                      }}
                      inputMode="decimal"
                      placeholder="e.g. 12.50"
                      required
                    />
                  </div>
                </div>
                <p>
                  Canonical integer calculation only. This does not change the
                  quoted price or create an actual cost, purchase or commitment.
                </p>
              </>
            ) : (
              <p>
                No material proposal selected. Recorded costs remain separate.
              </p>
            )}
            {lines.length === 0 && (
              <p>
                No included material/product scope is available for this
                property.
              </p>
            )}
          </fieldset>
          <fieldset className="job-review-card" disabled={busy || unknown}>
            <legend>Time capture proposal</legend>
            <label className="job-review-check">
              <input
                type="checkbox"
                checked={timeEnabled}
                onChange={(e) => {
                  invalidate();
                  setTimeEnabled(e.target.checked);
                }}
              />
              Include an unsaved time proposal
            </label>
            {timeEnabled ? (
              <>
                <label htmlFor={`${id}-worker`}>
                  Currently assigned worker
                </label>
                <select
                  id={`${id}-worker`}
                  required
                  value={workerId}
                  onChange={(e) => {
                    invalidate();
                    setWorkerId(e.target.value);
                  }}
                >
                  <option value="">Choose assigned worker</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      Assigned worker · {w.id.slice(-8)}
                    </option>
                  ))}
                </select>
                <label htmlFor={`${id}-start`}>
                  Start time with UTC offset
                </label>
                <input
                  id={`${id}-start`}
                  value={startedAt}
                  onChange={(e) => {
                    invalidate();
                    setStartedAt(e.target.value);
                  }}
                  placeholder="2026-12-08T09:00:00-06:00"
                  required
                  aria-describedby={`${id}-offset-help`}
                />
                <label htmlFor={`${id}-end`}>End time with UTC offset</label>
                <input
                  id={`${id}-end`}
                  value={endedAt}
                  onChange={(e) => {
                    invalidate();
                    setEndedAt(e.target.value);
                  }}
                  placeholder="2026-12-08T10:00:00-06:00"
                  required
                  aria-describedby={`${id}-offset-help`}
                />
                <small id={`${id}-offset-help`}>
                  Enter an explicit UTC offset or Z. Date-only evidence cannot
                  establish working hours.
                </small>
                <label htmlFor={`${id}-task`}>Staff task description</label>
                <input
                  id={`${id}-task`}
                  value={task}
                  onChange={(e) => {
                    invalidate();
                    setTask(e.target.value);
                  }}
                  maxLength={250}
                  required
                />
                <label htmlFor={`${id}-allocation`}>Proposed allocation</label>
                <select
                  id={`${id}-allocation`}
                  value={allocation}
                  onChange={(e) => {
                    invalidate();
                    setAllocation(e.target.value as 'job' | 'overhead');
                  }}
                >
                  <option value="job">This exact job</option>
                  <option value="overhead">Unapproved overhead proposal</option>
                </select>
                {allocation === 'overhead' && (
                  <>
                    <label htmlFor={`${id}-overhead`}>
                      Proposed overhead center · approval unverified
                    </label>
                    <input
                      id={`${id}-overhead`}
                      value={overhead}
                      onChange={(e) => {
                        invalidate();
                        setOverhead(e.target.value);
                      }}
                      required
                      maxLength={80}
                    />
                  </>
                )}
                <p>
                  Overlap checks use existing time validation. Current workforce
                  coverage stays UNKNOWN; no wages, rates or payroll are
                  calculated.
                </p>
              </>
            ) : (
              <p>
                No time proposal selected. Missing labor evidence remains
                UNKNOWN.
              </p>
            )}
            {workers.length === 0 && (
              <p>No active assigned worker is available for time review.</p>
            )}
          </fieldset>
        </div>
        <label className="job-review-check">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={unknown}
            onChange={(e) => {
              invalidate();
              setConfirmed(e.target.checked);
            }}
          />
          I confirm this exact saved job and these unsaved staff-only proposals.
          No posting, invoice or payment is authorized.
        </label>
        <button type="submit" disabled={!confirmed || busy || unknown}>
          Review recorded vs proposed
        </button>
      </form>
      {busy && (
        <p role="status">
          Checking exact source, original confirmation and canonical
          calculations…
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {!review && !busy && !error && (
        <p>
          No review prepared. Choose any proposals and explicitly confirm the
          source.
        </p>
      )}
      {review && !busy && (
        <>
          <section
            className="job-review-card"
            aria-label="Recorded versus unsaved proposals"
          >
            <h3>Recorded vs unsaved proposals</h3>
            <p>
              <strong>
                Recorded coverage: {review.recorded.costReview.status}.
              </strong>{' '}
              Unsaved proposals are excluded from actual costs, commitments,
              forecasts, margin and customer totals.
            </p>
            <div className="job-review-grid">
              <div>
                <h4>Recorded job evidence</h4>
                <p>
                  {review.recorded.costReview.completion.totals
                    ? `Canonical recorded cost: ${money(review.recorded.costReview.completion.totals.recordedMinor)}`
                    : 'Cost amounts withheld — missing coverage is not zero.'}
                </p>
                <p>
                  Issued customer total:{' '}
                  {money(review.invoiceRequirements.scope.totals.total_minor)}
                </p>
              </div>
              <div>
                <h4>Unsaved staff proposals</h4>
                {review.proposed.material ? (
                  <>
                    <p>
                      {review.proposed.material.description} ·{' '}
                      {review.proposed.material.unit}
                    </p>
                    <dl>
                      <dt>Issued baseline line quantity / cost</dt>
                      <dd>
                        {review.proposed.material.originalQuantityMilli / 1000}{' '}
                        / {money(review.proposed.material.originalCostMinor)}
                      </dd>
                      <dt>Unsaved quantity / cost</dt>
                      <dd>
                        {review.proposed.material.proposedQuantityMilli / 1000}{' '}
                        / {money(review.proposed.material.proposedCostMinor)}
                      </dd>
                    </dl>
                    <p>
                      Procurement association:{' '}
                      {review.proposed.material.catalogAssociation}. No supplier
                      or order is approved.
                    </p>
                  </>
                ) : (
                  <p>No material proposal.</p>
                )}
                {review.proposed.time ? (
                  <>
                    <p>Time: {review.proposed.time.validation} · not posted.</p>
                    <p>
                      {review.proposed.time.startedAt} →{' '}
                      {review.proposed.time.endedAt}
                    </p>
                    <p>
                      Allocation: {review.proposed.time.allocation}. Monetary
                      allocation UNKNOWN. Workforce coverage UNKNOWN.
                    </p>
                  </>
                ) : (
                  <p>No time proposal.</p>
                )}
              </div>
            </div>
          </section>
          {showFinanceDetails ? (
            <FinanceWorkflow review={review.recorded} enabled />
          ) : (
            <section
              className="job-review-card"
              aria-label="Job review invoice requirements"
            >
              <h3>Invoice requirements for this exact job</h3>
              <p>
                <strong>
                  {review.invoiceRequirements.overall} ·{' '}
                  {review.invoiceRequirements.status}.
                </strong>{' '}
                Issued version{' '}
                {review.invoiceRequirements.issued.version_number} remains
                unchanged. The existing Finance view supplies the full source
                and cost review.
              </p>
              <p>
                No contract, signature, invoice or financial authority is
                created by these proposals.
              </p>
              <details>
                <summary>Inspect invoice requirement statuses</summary>
                <ul>
                  {review.invoiceRequirements.requirements.map((r) => (
                    <li key={r.id}>
                      {r.id.replaceAll('_', ' ')}: {r.status}
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          )}
          <section
            className="job-review-card"
            aria-label="Staff financial reference preview"
          >
            <h3>Staff reference &amp; export requirements</h3>
            <p>
              Accounting export: {review.financialExport.status}.{' '}
              {review.financialExport.reason}
            </p>
            <p>
              Staff-only reference JSON, not a customer packet, accounting
              import, invoice or financial command. Internal proposals never
              enter customer-safe issued scope.
            </p>
            <details>
              <summary>Inspect immutable reference JSON</summary>
              <pre tabIndex={0} aria-label="Staff-only reference JSON">
                {review.report.jsonPreview}
              </pre>
              <p>
                SHA-256: <code>{review.report.sha256}</code>
              </p>
            </details>
            <button type="button" onClick={inspect} disabled={busy}>
              Inspect exact retained review
            </button>
            <p>
              Session only; no refresh or process-crash durability. Inspection
              never prepares a replacement.
            </p>
          </section>
        </>
      )}
    </section>
  );
}
