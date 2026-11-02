import { useEffect, useId, useRef, useState } from 'react';
import { formatMinor } from '../../domain/estimating/calculation';
import { costCategories } from '../../domain/jobs/financials';
import { prototypeFields } from '../../lib/program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import {
  financialCaseworkEnabled,
  readFinancialCasework,
  filterFinancialCasework,
  openFinancialCaseworkJob,
  assertFinancialCaseworkCurrent,
  compareFinancialCaseworkReview,
  type FinancialCaseworkReview,
  type FinancialCaseworkDetail,
  type FinancialCaseworkFilter,
} from '../../lib/workflows/financial-casework';
import { FinancialEvidenceReview } from './FinancialEvidenceReview';
import './financial-casework.css';

/** Root/model replacement resets presentation even without a parent key. Admission
 * precedes every source read, including descriptor inspection and serializers. */
export function FinancialCasework({
  sources,
  enabled = false,
  onSelectJob,
}: {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}) {
  let handles: unknown[] = [],
    available = false;
  if (financialCaseworkEnabled(enabled)) {
    try {
      const capture = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      });
      const root = prototypeFields(sources, [
        'company',
        'operations',
        'estimates',
        'property',
        'entries',
        'gate',
      ]);
      handles = [
        ...Object.values(root),
        ...capture.entries.flatMap((e) => [
          e,
          e.target,
          e.release,
          e.customerModel,
        ]),
      ];
      capture.check();
      available = true;
    } catch {
      available = false;
    }
  }
  const [binding, setBinding] = useState({
    sources,
    enabled,
    handles,
    available,
    generation: 0,
  });
  if (
    binding.sources !== sources ||
    binding.enabled !== enabled ||
    binding.available !== available ||
    binding.handles.length !== handles.length ||
    binding.handles.some((h, i) => h !== handles[i])
  ) {
    setBinding({
      sources,
      enabled,
      handles,
      available,
      generation: binding.generation + 1,
    });
    return null;
  }
  if (!available)
    return (
      <section
        className="financial-casework"
        aria-label="Financial casework desk"
      >
        <h2>Financial casework desk</h2>
        <p>
          {enabled
            ? 'Current financial sources are unavailable. Prior evidence is withheld.'
            : 'Financial casework is off. Confirm the local company source first.'}
        </p>
      </section>
    );
  return (
    <CaseworkDesk
      key={binding.generation}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  );
}

function CaseworkDesk({
  sources,
  onSelectJob,
}: {
  sources: OperatingSources;
  onSelectJob?: (jobId: string) => void;
}) {
  const id = useId(),
    heading = useRef<HTMLHeadingElement>(null),
    generation = useRef(0),
    gate = useRef({ enabled: true, confirmed: false });
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState<FinancialCaseworkReview | null>(null),
    [detail, setDetail] = useState<FinancialCaseworkDetail | null>(null),
    [filter, setFilter] = useState<FinancialCaseworkFilter>({
      query: '',
      kind: 'all',
      job_id: null,
    }),
    [comparison, setComparison] = useState(''),
    [error, setError] = useState(''),
    [workflow, setWorkflow] = useState(false);
  useEffect(() => {
    const admissionRef = gate;
    const epoch = generation;
    return () => {
      epoch.current++;
      admissionRef.current.confirmed = false;
    };
  }, [sources]);
  useEffect(() => {
    if (detail) heading.current?.focus();
  }, [detail]);

  let current = false;
  if (review && confirmed) {
    try {
      assertFinancialCaseworkCurrent(review);
      if (detail) assertFinancialCaseworkCurrent(detail);
      current = true;
    } catch {
      current = false;
    }
  }
  let filtered: ReturnType<typeof filterFinancialCasework> | null = null;
  if (review && current) {
    try {
      filtered = filterFinancialCasework(review, filter);
    } catch {
      current = false;
    }
  }
  const visibleDetail = current ? detail : null;
  async function load() {
    if (!confirmed || busy) return;
    const token = ++generation.current;
    const admission = { enabled: true, confirmed: true };
    gate.current.confirmed = false;
    gate.current = admission;
    setBusy(true);
    setError('');
    setWorkflow(false);
    setComparison('');
    const prior = detail;
    setReview(null);
    try {
      const next = await readFinancialCasework(
        sources,
        { as_of: new Date().toISOString(), input_revision: token },
        admission,
      );
      if (token !== generation.current || !admission.confirmed) return;
      assertFinancialCaseworkCurrent(next);
      if (prior) {
        const compared = compareFinancialCaseworkReview(prior, next);
        setComparison(
          compared.status === 'SOURCE_CHANGED'
            ? `SOURCE_CHANGED — current saved ${compared.changes.join(', ')} differ from the retained review. Inspect and confirm the current source again in the original workflow. Prior correction holds remain.`
            : compared.status === 'CURRENT_REVIEWED_SOURCE'
              ? 'The retained review matches this current saved source read.'
              : 'UNKNOWN — the prior review cannot be restored. Inspect this new current read; prior correction holds remain.',
        );
      }
      setReview(next);
      setDetail(null);
      setFilter((f) => ({ ...f, job_id: null }));
    } catch {
      if (token === generation.current) {
        setError(
          'Financial casework outcome UNKNOWN. Prior evidence is withheld. Read current saved sources explicitly; correction attempts cannot be replayed.',
        );
        setDetail(null);
      }
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function inspect(jobId: string) {
    if (!review || !current || busy) return;
    try {
      setDetail(openFinancialCaseworkJob(review, jobId));
      setWorkflow(false);
      setError('');
    } catch {
      setError(
        'Exact source UNKNOWN. Read current saved sources before further review.',
      );
    }
  }
  function navigate() {
    if (!visibleDetail || busy) return;
    try {
      assertFinancialCaseworkCurrent(visibleDetail);
      onSelectJob?.(visibleDetail.job.target.job_id!);
    } catch {
      setError('Current exact source unavailable. Job navigation withheld.');
    }
  }
  function checkRetained() {
    if (!detail) return;
    const result = compareFinancialCaseworkReview(detail);
    setComparison(
      result.status === 'CURRENT_REVIEWED_SOURCE'
        ? 'CURRENT_REVIEWED_SOURCE — this exact saved source still matches the retained review. Review only.'
        : 'UNKNOWN — saved source or current access changed. Read current saved sources explicitly. No replay or replacement of a correction attempt.',
    );
  }
  function confirmation(value: boolean) {
    generation.current++;
    gate.current.confirmed = false;
    setConfirmed(value);
    setReview(null);
    setDetail(null);
    setWorkflow(false);
    setBusy(false);
    setComparison('');
    if (busy)
      setError(
        'Read outcome UNKNOWN after confirmation withdrawal. No correction action was started.',
      );
  }
  const money = (n: number | null | undefined, currency: string) =>
    n === null || n === undefined ? 'UNKNOWN' : formatMinor(n, currency);
  return (
    <section
      className="financial-casework"
      aria-label="Financial casework desk"
    >
      <div className="casework-intro">
        <p className="casework-eyebrow">Finance · {sources.company.name}</p>
        <h2>Financial casework desk</h2>
        <p>
          Review unresolved job costs, invoice prerequisites and exact canonical
          financial evidence together. Local staff review only; no financial
          records change.
        </p>
      </div>
      <label className="casework-confirm" htmlFor={`${id}-confirm`}>
        <input
          id={`${id}-confirm`}
          type="checkbox"
          checked={confirmed}
          onChange={(e) => confirmation(e.target.checked)}
        />
        I confirm this company’s current local saved financial sources.
      </label>
      <div className="casework-actions">
        <button
          type="button"
          disabled={!confirmed || busy}
          onClick={() => void load()}
        >
          {review || detail
            ? 'Read current saved sources'
            : 'Load financial casework'}
        </button>
        {detail && (
          <button type="button" disabled={busy} onClick={checkRetained}>
            Check retained source review
          </button>
        )}
      </div>
      {busy && (
        <p role="status">Reading exact saved costs and canonical evidence…</p>
      )}
      {error && <p role="alert">{error}</p>}
      {review && !current && !busy && (
        <p role="alert">
          UNKNOWN — the retained saved-source review is no longer current.
          Amounts and navigation are withheld. Read current saved sources
          explicitly; original correction holds remain.
        </p>
      )}
      {comparison && <p role="status">{comparison}</p>}
      {current && review && filtered && (
        <>
          <div className="casework-filters">
            <label htmlFor={`${id}-search`}>
              Search financial casework
              <input
                id={`${id}-search`}
                value={filter.query}
                maxLength={200}
                onChange={(e) =>
                  setFilter({ ...filter, query: e.target.value })
                }
              />
            </label>
            <label htmlFor={`${id}-kind`}>
              Requirement kind
              <select
                id={`${id}-kind`}
                value={filter.kind}
                onChange={(e) =>
                  setFilter({
                    ...filter,
                    kind: e.target.value as FinancialCaseworkFilter['kind'],
                  })
                }
              >
                <option value="all">All unresolved requirements</option>
                <option value="coverage">Missing cost coverage</option>
                <option value="margin">Canonical margin warnings</option>
                <option value="remaining_cost">Remaining-cost review</option>
                <option value="canonical_evidence">
                  Canonical evidence gaps
                </option>
                <option value="invoice_readiness">Invoice prerequisites</option>
              </select>
            </label>
            <label htmlFor={`${id}-job`}>
              Exact source job
              <select
                id={`${id}-job`}
                value={filter.job_id ?? ''}
                onChange={(e) =>
                  setFilter({ ...filter, job_id: e.target.value || null })
                }
              >
                <option value="">All admitted jobs</option>
                {review.jobs.map((j) => (
                  <option key={j.target.job_id} value={j.target.job_id!}>
                    {j.name} · {j.target.job_id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p role="status">
            {filtered.matching} matching of {filtered.available} admitted jobs.
            This selected set is not complete company accounting.
          </p>
          <p className="casework-muted">{review.order_meaning}</p>
          <div className="casework-layout">
            <div className="casework-card">
              <h3>Unresolved job requirements</h3>
              {!filtered.jobs.length && (
                <p>No admitted jobs match these filters.</p>
              )}
              <ul className="casework-queue">
                {filtered.jobs.map((j) => (
                  <li key={j.target.job_id}>
                    <h4>{j.name}</h4>
                    <p>
                      {j.customer_name} · {j.property_label}
                    </p>
                    <p className="casework-status">
                      {j.requirements[0].status} · {j.requirements[0].title}
                    </p>
                    <p>
                      {j.requirements.length} unresolved review contexts ·
                      Invoice {j.invoice.overall}
                    </p>
                    <p className="casework-identity">
                      Job {j.target.job_id} · saved revision{' '}
                      {j.source.job_revision}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Inspect job casework: ${j.name} ${j.target.job_id}`}
                      onClick={() => inspect(j.target.job_id!)}
                    >
                      Inspect job casework
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="casework-card">
              {!visibleDetail ? (
                <p>
                  Inspect a job’s exact source before opening its editor or
                  original readiness workflow.
                </p>
              ) : (
                <>
                  <h3 ref={heading} tabIndex={-1}>
                    Exact financial casework source
                  </h3>
                  <p>
                    {visibleDetail.job.name} · {visibleDetail.job.customer_name}{' '}
                    · {visibleDetail.job.property_label}
                  </p>
                  <dl>
                    <dt>Exact job / saved revision</dt>
                    <dd>
                      {visibleDetail.job.target.job_id} /{' '}
                      {visibleDetail.job.source.job_revision}
                    </dd>
                    <dt>Original estimate / issued version</dt>
                    <dd>
                      {visibleDetail.job.target.estimate_id} /{' '}
                      {visibleDetail.job.source.issued_version_id} (v
                      {visibleDetail.job.source.issued_version_number})
                    </dd>
                    <dt>Issued scope hash</dt>
                    <dd>{visibleDetail.job.source.scope_sha256}</dd>
                    <dt>Retained canonical read</dt>
                    <dd>
                      {visibleDetail.source_sha256} · {review.as_of}
                    </dd>
                    <dt>Original offer / test preference receipt</dt>
                    <dd>
                      {visibleDetail.job.source.original_offer_id} /{' '}
                      {visibleDetail.job.source.original_receipt_id}
                    </dd>
                  </dl>
                  <div className="casework-actions">
                    <button
                      type="button"
                      disabled={!onSelectJob || busy}
                      onClick={navigate}
                    >
                      Open exact source job
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        try {
                          assertFinancialCaseworkCurrent(visibleDetail);
                          setWorkflow(true);
                        } catch {
                          setError(
                            'Current exact source unavailable. Original workflow withheld.',
                          );
                        }
                      }}
                    >
                      Open original financial review workflow
                    </button>
                  </div>
                  <h4>Why invoice preparation is blocked</h4>
                  <p>
                    {visibleDetail.job.invoice.overall} — genuine contractual,
                    tax and financial authority remain separate.
                  </p>
                  <ul>
                    {visibleDetail.job.invoice.requirements.map((r) => (
                      <li key={r.id}>
                        <strong>
                          {r.id}: {r.status}
                        </strong>
                        <p>{r.detail}</p>
                      </li>
                    ))}
                  </ul>
                  <h4>Prioritized manual review</h4>
                  <ol>
                    {visibleDetail.job.requirements.map((r) => (
                      <li key={r.id}>
                        <strong>
                          {r.title} · {r.status}
                        </strong>
                        <p>{r.observation}</p>
                        <p>Next manual review: {r.suggested_review}</p>
                      </li>
                    ))}
                  </ol>
                  <h4>
                    Saved costs and coverage · {visibleDetail.job.currency}
                  </h4>
                  <p>
                    Cost coverage: {visibleDetail.job.facts.cost_coverage}.
                    Missing coverage never becomes zero. Contribution is before
                    unallocated overhead.
                  </p>
                  <dl>
                    <dt>Recorded costs</dt>
                    <dd>
                      {money(
                        visibleDetail.job.facts.costs?.recordedMinor,
                        visibleDetail.job.currency,
                      )}
                    </dd>
                    <dt>Net unpaid commitments</dt>
                    <dd>
                      {money(
                        visibleDetail.job.facts.costs?.unpaidCommitmentMinor,
                        visibleDetail.job.currency,
                      )}
                    </dd>
                    <dt>Saved remaining forecast</dt>
                    <dd>
                      {money(
                        visibleDetail.job.facts.costs?.remainingForecastMinor,
                        visibleDetail.job.currency,
                      )}
                    </dd>
                    <dt>Cost to complete</dt>
                    <dd>
                      {money(
                        visibleDetail.job.facts.costs?.costToCompleteMinor,
                        visibleDetail.job.currency,
                      )}
                    </dd>
                    <dt>Projected contribution</dt>
                    <dd>
                      {money(
                        visibleDetail.job.facts.margin
                          ?.projectedContributionMinor,
                        visibleDetail.job.currency,
                      )}
                    </dd>
                  </dl>
                  <ul>
                    {visibleDetail.job.facts.missing_evidence.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <h4>Saved category forecast inputs</h4>
                  <p>
                    These explicit recorded inputs exclude unpaid commitments.
                    They do not establish missing actual-cost coverage.
                  </p>
                  <dl>
                    {costCategories.map((category) => (
                      <div key={category}>
                        <dt>{category}</dt>
                        <dd>
                          {money(
                            visibleDetail.job.facts.remaining[category],
                            visibleDetail.job.currency,
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <h4>Exact cost source identities</h4>
                  <dl>
                    <dt>Expense IDs</dt>
                    <dd>
                      {visibleDetail.job.source.expense_ids.join(', ') ||
                        'None recorded'}
                    </dd>
                    <dt>Cost review event IDs</dt>
                    <dd>
                      {visibleDetail.job.source.cost_review_event_ids.join(
                        ', ',
                      ) || 'None recorded'}
                    </dd>
                    <dt>Covered locked labor entry / period IDs</dt>
                    <dd>
                      {visibleDetail.job.source.labor_entry_ids.join(', ') ||
                        'UNKNOWN'}{' '}
                      /{' '}
                      {visibleDetail.job.source.locked_period_ids.join(', ') ||
                        'UNKNOWN'}
                    </dd>
                  </dl>
                  <h4>Canonical invoice, event and ledger evidence</h4>
                  <p>
                    {visibleDetail.job.financial.coverage}. These are actual
                    local source references; genuine provider authentication,
                    void and bank settlement remain UNKNOWN.
                  </p>
                  {!visibleDetail.job.financial.invoices.length && (
                    <p>
                      No canonical invoice, payment event or ledger evidence
                      establishes a job balance. Amounts remain UNKNOWN.
                    </p>
                  )}
                  {visibleDetail.job.financial.invoices.map((invoice) => (
                    <div className="casework-invoice" key={invoice.invoice_id}>
                      <p>
                        <strong>
                          {invoice.linkage} · {invoice.verification}
                        </strong>
                      </p>
                      <dl>
                        <dt>Invoice → contract → offer → issued version</dt>
                        <dd>
                          {invoice.invoice_id} → {invoice.contract_id} →{' '}
                          {invoice.offer_id ?? 'UNKNOWN'} →{' '}
                          {invoice.issued_version_id ?? 'UNKNOWN'}
                        </dd>
                        <dt>Canonical source hash</dt>
                        <dd>{invoice.source_sha256 ?? 'UNKNOWN'}</dd>
                        <dt>Captured / refunded / balance (minor units)</dt>
                        <dd>
                          {invoice.summary?.captured_minor ?? 'UNKNOWN'} /{' '}
                          {invoice.summary?.refunded_minor ?? 'UNKNOWN'} /{' '}
                          {invoice.summary?.balance_minor ?? 'UNKNOWN'}{' '}
                          {visibleDetail.job.currency}
                        </dd>
                      </dl>
                      <div
                        className="casework-scroll"
                        role="region"
                        tabIndex={0}
                        aria-label={`Canonical event and ledger identities for invoice ${invoice.invoice_id}`}
                      >
                        <table>
                          <caption>Exact canonical events and postings</caption>
                          <thead>
                            <tr>
                              <th>Kind</th>
                              <th>Source ID</th>
                              <th>Event / adjustment reference</th>
                              <th>Amount (minor units)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invoice.events.map((e) => (
                              <tr key={e.id}>
                                <td>{e.kind}</td>
                                <td>{e.id}</td>
                                <td>
                                  {e.adjusts_event_id ?? 'No adjusting event'}
                                </td>
                                <td>
                                  {e.amount_minor} {visibleDetail.job.currency}
                                </td>
                              </tr>
                            ))}
                            {invoice.ledger.map((l) => (
                              <tr key={l.id}>
                                <td>Ledger posting</td>
                                <td>{l.id}</td>
                                <td>{l.event_id ?? 'Invoice posting'}</td>
                                <td>
                                  {l.amount_minor} {visibleDetail.job.currency}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <ul>
                        {invoice.missing_evidence.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {(visibleDetail.job.financial.unlinked_events.length > 0 ||
                    visibleDetail.job.financial.unlinked_ledger.length > 0) && (
                    <p>
                      UNLINKED — event IDs:{' '}
                      {visibleDetail.job.financial.unlinked_events
                        .map((e) => e.id)
                        .join(', ') || 'None'}
                      ; posting IDs:{' '}
                      {visibleDetail.job.financial.unlinked_ledger
                        .map((e) => e.id)
                        .join(', ') || 'None'}
                      . These do not establish job amounts.
                    </p>
                  )}
                  <ul>
                    {visibleDetail.job.financial.missing_evidence.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
          {workflow && visibleDetail && (
            <div className="casework-original">
              <h3>Original source-bound financial review workflow</h3>
              <p>
                Review job {visibleDetail.job.target.job_id} in the existing
                workflow below. Its explicit source inspection, confirmation and
                permanent correction hold still apply. The saved job editor
                remains separate; no values auto save.
              </p>
              <FinancialEvidenceReview
                sources={sources}
                enabled={true}
                onSelectJob={onSelectJob}
              />
            </div>
          )}
        </>
      )}
      <p className="casework-muted">
        Staff-only synthetic evidence. No forecast save, ledger correction,
        invoice, capture, refund, settlement, provider, message or hosted
        action. Release 1.0 NOT READY / NOT AUTHORIZED.
      </p>
    </section>
  );
}
