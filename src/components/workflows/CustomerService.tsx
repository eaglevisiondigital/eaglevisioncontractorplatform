import { useEffect, useRef, useState } from 'react';
import type { CustomerPortalPreviewModel } from '../../lib/customer-preview';
import type { PrototypeTarget } from '../../lib/program/prototype-source';
import {
  emptyHistoryFilters,
  type HistoryFilters,
} from '../../domain/property/history-search';
import {
  assertCustomerServiceCurrentNow,
  readCustomerService,
  type CustomerServiceRead,
} from '../../lib/workflows/customer-service';
import type { CustomerWorkflowSelection } from '../../lib/workflows/customer-workflow';
import './customer-service.css';

export interface CustomerServiceProps {
  model: CustomerPortalPreviewModel;
  target: PrototypeTarget;
  selection: CustomerWorkflowSelection;
  enabled?: boolean;
  onSource?: (source: CustomerWorkflowSelection) => void;
}
/** Separate default-off local panel; approved portal/layout and business workflows stay intact. */
export function CustomerService(props: CustomerServiceProps) {
  const signature = JSON.stringify([props.target, props.selection]);
  const [binding, bind] = useState({
    model: props.model,
    signature,
    enabled: props.enabled,
    generation: 0,
  });
  if (
    binding.model !== props.model ||
    binding.signature !== signature ||
    binding.enabled !== props.enabled
  ) {
    bind({
      model: props.model,
      signature,
      enabled: props.enabled,
      generation: binding.generation + 1,
    });
    return null;
  }
  return props.enabled === true ? (
    <ServiceNavigator key={binding.generation} {...props} />
  ) : null;
}
function ServiceNavigator({
  model,
  target,
  selection,
  onSource,
}: CustomerServiceProps) {
  const [filters, setFilters] = useState<HistoryFilters>({
    ...emptyHistoryFilters,
  });
  const [read, setRead] = useState<CustomerServiceRead>();
  const [detail, setDetail] =
    useState<CustomerServiceRead['reports'][number]>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [opened, setOpened] = useState(false);
  const life = useRef({ active: true, generation: 0 });
  const pending = useRef<{ enabled: boolean; confirmed: boolean } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const l = life.current;
    l.active = true;
    return () => {
      l.active = false;
      l.generation++;
      if (pending.current) pending.current.enabled = false;
    };
  }, []);
  useEffect(() => {
    if (detail) heading.current?.focus();
  }, [detail]);
  function invalidate() {
    life.current.generation++;
    if (pending.current) pending.current.enabled = false;
    setRead(undefined);
    setDetail(undefined);
    setError('');
    setBusy(false);
  }
  function update(key: keyof HistoryFilters, value: string) {
    invalidate();
    setFilters((current) => ({ ...current, [key]: value }));
  }
  async function search(next = filters) {
    invalidate();
    const generation = life.current.generation;
    const gate = { enabled: true, confirmed: true };
    pending.current = gate;
    setBusy(true);
    setOpened(true);
    const result = await readCustomerService(
      model,
      target,
      selection,
      next,
      gate,
    );
    if (!life.current.active || life.current.generation !== generation) return;
    setBusy(false);
    try {
      assertCustomerServiceCurrentNow(model, target, selection, next, result);
      setRead(result);
    } catch {
      setError(
        'UNKNOWN — exact published evidence or filters could not be verified. Check the date range and selected filters. No different source was substituted.',
      );
    }
  }
  async function openSource(report: CustomerServiceRead['reports'][number]) {
    if (busy) return;
    const generation = ++life.current.generation;
    const gate = { enabled: true, confirmed: true };
    pending.current = gate;
    setBusy(true);
    setDetail(undefined);
    setError('');
    // Re-read the clicked exact identity; a result card never becomes authorization.
    const exact = { report_id: report.id, published_version: report.version };
    const result = await readCustomerService(
      model,
      target,
      exact,
      filters,
      gate,
    );
    if (!life.current.active || generation !== life.current.generation) return;
    setBusy(false);
    let current = false;
    try {
      assertCustomerServiceCurrentNow(model, target, exact, filters, result);
      current = true;
    } catch {
      /* UNKNOWN hides evidence. */
    }
    const found = result.reports.find(
      (r) => r.id === exact.report_id && r.version === exact.published_version,
    );
    if (!current || !found) {
      setRead(undefined);
      setError(
        'UNKNOWN — the selected exact report/version is unavailable. No replacement source was opened.',
      );
      return;
    }
    setRead(result);
    setDetail(found);
    onSource?.(exact);
  }
  const active = Object.entries(filters).filter(([, value]) => value !== '');
  return (
    <section
      className="customer-service"
      aria-label="Customer service evidence navigator"
    >
      <header>
        <span className="eyebrow">Customer service · local review</span>
        <h2>Find property service evidence</h2>
        <p>
          Search currently authorized published reports linked to this exact
          property and issued job scope. No customer communication is created.
        </p>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label>
          Search observations and report text
          <input
            type="search"
            value={filters.query}
            maxLength={200}
            onChange={(e) => update('query', e.target.value)}
          />
        </label>
        <div className="customer-service-filters">
          <label>
            From inspection date
            <input
              type="date"
              value={filters.from}
              onChange={(e) => update('from', e.target.value)}
            />
          </label>
          <label>
            Through inspection date
            <input
              type="date"
              value={filters.to}
              onChange={(e) => update('to', e.target.value)}
            />
          </label>
          <label>
            Inspection frequency
            <select
              value={filters.frequency}
              onChange={(e) => update('frequency', e.target.value)}
            >
              <option value="">All recorded frequencies</option>
              {['once', 'weekly', 'monthly', 'custom', 'unknown'].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reported severity
            <select
              value={filters.severity}
              onChange={(e) => update('severity', e.target.value)}
            >
              <option value="">All reported severities</option>
              {['low', 'moderate', 'urgent'].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Exact reported category
            <input
              value={filters.category}
              maxLength={100}
              onChange={(e) => update('category', e.target.value)}
              placeholder="All categories"
            />
          </label>
          <label>
            Exact finding location
            <input
              value={filters.location}
              maxLength={200}
              onChange={(e) => update('location', e.target.value)}
              placeholder="All locations"
            />
          </label>
        </div>
        <label>
          Maintenance recommendation
          <input
            type="search"
            value={filters.recommendation}
            maxLength={200}
            onChange={(e) => update('recommendation', e.target.value)}
          />
        </label>
        <div className="customer-service-actions">
          <button type="submit" disabled={busy}>
            Search service evidence
          </button>
          <button
            type="button"
            onClick={() => {
              invalidate();
              const reset = { ...emptyHistoryFilters };
              setFilters(reset);
              void search(reset);
            }}
          >
            Reset service filters
          </button>
        </div>
        {active.length > 0 && (
          <ul
            className="customer-service-active"
            aria-label="Active service filters"
          >
            {active.map(([key, value]) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => update(key as keyof HistoryFilters, '')}
                >
                  Clear {key}: {value}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
      {busy && <p role="status">Reading exact authorized service evidence…</p>}
      {error && <p role="alert">{error}</p>}
      {!opened && (
        <p>
          Choose Search service evidence to review the available published
          history.
        </p>
      )}
      {read && (
        <>
          <h3>{read.property_label}</h3>
          <p role="status">
            {read.matching} matching report{read.matching === 1 ? '' : 's'} of{' '}
            {read.available} available report{read.available === 1 ? '' : 's'}{' '}
            for this job.
          </p>
          <p>
            History completeness: UNKNOWN. Missing later observations never
            prove repair or completion.
          </p>
          {read.reports.length === 0 ? (
            <p>
              No published reports match these filters. Clear a filter or reset
              the search.
            </p>
          ) : (
            <ol className="customer-service-results">
              {read.reports.map((report) => (
                <li key={`${report.id}:${report.version}`}>
                  <h4>Inspection · {report.snapshot.visited_on}</h4>
                  <p>{report.snapshot.summary}</p>
                  <dl>
                    <dt>Exact report</dt>
                    <dd>{report.id}</dd>
                    <dt>Published version</dt>
                    <dd>{report.version}</dd>
                    <dt>Recorded frequency</dt>
                    <dd>{read.frequencies[report.id]}</dd>
                    <dt>Reported findings</dt>
                    <dd>{report.snapshot.findings.length}</dd>
                  </dl>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Open service report ${report.id} published version ${report.version}`}
                    onClick={() => void openSource(report)}
                  >
                    Open exact service report · v{report.version}
                  </button>
                </li>
              ))}
            </ol>
          )}
          {read.issued_scope && (
            <details>
              <summary>Exact related issued job scope</summary>
              <p>{read.issued_scope.name}</p>
              <p>{read.issued_scope.description}</p>
              <dl>
                <dt>Job</dt>
                <dd>{read.issued_scope.job_id}</dd>
                <dt>Estimate</dt>
                <dd>{read.issued_scope.estimate_id}</dd>
                <dt>Issued version</dt>
                <dd>
                  {read.issued_scope.issued_version_id} · v
                  {read.issued_scope.issued_version_number}
                </dd>
              </dl>
            </details>
          )}
        </>
      )}
      {detail && (
        <section
          className="customer-service-detail"
          aria-label="Exact service report evidence"
        >
          <h3 ref={heading} tabIndex={-1}>
            Exact service report evidence
          </h3>
          <p>
            Report {detail.id} · published version {detail.version}
          </p>
          <p>{detail.snapshot.summary}</p>
          {detail.snapshot.findings.map((finding, index) => (
            <article key={finding.id}>
              <h4>
                {finding.category} · {finding.location}
              </h4>
              <p>
                Finding {finding.id} · source position {index + 1} · reported
                severity {finding.severity}
              </p>
              <p>
                <strong>Observation:</strong> {finding.description}
              </p>
              <p>
                <strong>Recommendation:</strong> {finding.recommendation}
              </p>
            </article>
          ))}
          {detail.snapshot.findings.length === 0 && (
            <p>
              No customer-visible findings were recorded in this published
              version. This does not establish a repaired condition.
            </p>
          )}
          <ul>
            {detail.snapshot.checklist.map((item, index) => (
              <li key={index}>
                {item.label} · recorded checklist state:{' '}
                {item.completed ? 'checked' : 'unchecked'}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="customer-service-boundary">
        Local synthetic evidence navigation only. No login, request, response,
        recipient, sending, approval, contract, invoice or payment. Physical
        completion remains UNVERIFIED.
      </p>
    </section>
  );
}
