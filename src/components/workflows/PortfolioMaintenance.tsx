import { useEffect, useRef, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import type { OperatingSources } from '../../lib/workflows/operating-center-runtime';
import {
  readPortfolioMaintenance,
  reconcilePortfolioMaintenance,
  openPortfolioMaintenanceItem,
  reviewPortfolioMaintenanceConsent,
  reconcilePortfolioMaintenanceConsent,
  type PortfolioMaintenanceInput,
  type PortfolioMaintenanceView,
  type PortfolioConsentReview,
} from '../../lib/workflows/portfolio-maintenance';
import type { MaintenanceConsentInput } from '../../lib/workflows/maintenance-desk';
import './portfolio-maintenance.css';
export interface PortfolioMaintenanceProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
export function PortfolioMaintenance(props: PortfolioMaintenanceProps) {
  const [context, setContext] = useState({ sources: props.sources, epoch: 0 });
  if (context.sources !== props.sources) {
    setContext({ sources: props.sources, epoch: context.epoch + 1 });
    return null;
  }
  const enabled =
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: props.enabled === true ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  return enabled ? (
    <MaintenanceReview key={context.epoch} {...props} />
  ) : (
    <section
      role="region"
      aria-label="Multi-job maintenance and renewal"
      className="portfolio-maintenance"
    >
      <h2>Company maintenance review is off</h2>
      <p>No customer follow-up or renewal is executed.</p>
    </section>
  );
}
function MaintenanceReview({
  sources,
  onSelectJob,
}: PortfolioMaintenanceProps) {
  const day = sources.entries[0].day;
  const [from, setFrom] = useState(day),
    [through, setThrough] = useState(
      Temporal.PlainDate.from(day).add({ days: 28 }).toString(),
    ),
    [asOf, setAsOf] = useState(day + 'T12:00:00.000Z'),
    [channel, setChannel] = useState<'email' | 'sms'>('email'),
    [lead, setLead] = useState(14),
    [overdue, setOverdue] = useState(7),
    [query, setQuery] = useState(''),
    [job, setJob] = useState(''),
    [customer, setCustomer] = useState(''),
    [property, setProperty] = useState(''),
    [kind, setKind] = useState<PortfolioMaintenanceInput['kind']>('all'),
    [readiness, setReadiness] =
      useState<PortfolioMaintenanceInput['readiness']>('all'),
    [confirmed, setConfirmed] = useState(false),
    [view, setView] = useState<PortfolioMaintenanceView | null>(null),
    [choices, setChoices] = useState<PortfolioMaintenanceView['jobs']>([]),
    [detail, setDetail] = useState<Awaited<
      ReturnType<typeof openPortfolioMaintenanceItem>
    > | null>(null),
    [selected, setSelected] = useState(''),
    [purpose, setPurpose] = useState<MaintenanceConsentInput['purpose']>(
      'recurring_maintenance',
    ),
    [consentConfirmed, setConsentConfirmed] = useState(false),
    [consent, setConsent] = useState<PortfolioConsentReview | null>(null),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [hasRetained, setHasRetained] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const live = useRef(true),
    pending = useRef(false),
    epoch = useRef(0),
    gates = useRef<{ enabled: boolean; confirmed: boolean }[]>([]),
    activeGate = useRef<{ enabled: boolean; confirmed: boolean } | null>(null),
    retained = useRef<PortfolioMaintenanceView | null>(null),
    consentRef = useRef<PortfolioConsentReview | null>(null),
    heading = useRef<HTMLHeadingElement>(null),
    sourceHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    live.current = true;
    const registered = gates.current;
    return () => {
      live.current = false;
      for (const g of registered) g.confirmed = false;
    };
  }, []);
  useEffect(() => {
    if (view) heading.current?.focus();
  }, [view]);
  useEffect(() => {
    if (detail) sourceHeading.current?.focus();
  }, [detail]);
  function invalidate() {
    epoch.current++;
    if (activeGate.current) activeGate.current.confirmed = false;
    setConfirmed(false);
    setConsentConfirmed(false);
    setView(null);
    setDetail(null);
    setConsent(null);
    setSelected('');
    setError('');
    setMessage('');
  }
  async function load() {
    if (!confirmed || pending.current || unknown) return;
    const token = ++epoch.current,
      gate = { enabled: true, confirmed: true };
    gates.current.push(gate);
    activeGate.current = gate;
    pending.current = true;
    setBusy(true);
    setView(null);
    setDetail(null);
    setConsent(null);
    setError('');
    try {
      const result = await readPortfolioMaintenance(
        sources,
        {
          window: { from, through, as_of: asOf, channel },
          lead_days: lead,
          overdue_days: overdue,
          query,
          kind,
          readiness,
          job_id: job,
          customer_id: customer,
          location_id: property,
        },
        gate,
      );
      if (live.current && token === epoch.current) {
        setView(result);
        setChoices(result.jobs);
        retained.current = result;
        setHasRetained(true);
        setMessage(
          'Available maintenance evidence loaded. Every customer message remains blocked.',
        );
      }
    } catch {
      if (live.current && token === epoch.current) {
        setUnknown(true);
        setChoices([]);
        setError(
          'Maintenance evidence is UNKNOWN or changed. No enrollment, visit or message was created. Only exact retained read checks remain.',
        );
      }
    } finally {
      pending.current = false;
      activeGate.current = null;
      if (live.current) setBusy(false);
    }
  }
  async function open(key: string) {
    if (!view || pending.current) return;
    const token = epoch.current;
    pending.current = true;
    setBusy(true);
    try {
      const result = await openPortfolioMaintenanceItem(view, key);
      if (live.current && token === epoch.current) {
        setDetail(result);
        onSelectJob?.(result.job_id);
      }
    } catch {
      if (live.current && token === epoch.current) {
        setView(null);
        setDetail(null);
        setUnknown(true);
        setError('Exact maintenance source is UNKNOWN; navigation withheld.');
      }
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (!retained.current || pending.current) return;
    const token = epoch.current;
    pending.current = true;
    setBusy(true);
    try {
      const result = await reconcilePortfolioMaintenance(retained.current);
      if (live.current && token === epoch.current)
        setMessage(
          result.status === 'CAPTURED_NOT_ATOMIC'
            ? 'Historical captured sources match. Current atomic consent and all sending remain blocked.'
            : 'Exact retained evidence is UNKNOWN; no replacement or replay.',
        );
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  function choose(key: string) {
    epoch.current++;
    if (activeGate.current) activeGate.current.confirmed = false;
    setSelected(key);
    setConsent(null);
    setConsentConfirmed(false);
    setMessage('');
  }
  async function inspectConsent() {
    if (!view || !selected || !consentConfirmed || pending.current || unknown)
      return;
    const token = ++epoch.current,
      gate = { enabled: true, confirmed: true };
    gates.current.push(gate);
    activeGate.current = gate;
    pending.current = true;
    setBusy(true);
    try {
      const result = await reviewPortfolioMaintenanceConsent(
        view,
        selected,
        { purpose },
        gate,
      );
      if (live.current && token === epoch.current) {
        setConsent(result);
        consentRef.current = result;
        setMessage(
          'Send decision BLOCKED. Current purpose consent, suppression and recipient authority remain unverified.',
        );
      }
    } finally {
      pending.current = false;
      activeGate.current = null;
      if (live.current) setBusy(false);
    }
  }
  async function checkConsent() {
    if (!consentRef.current || pending.current) return;
    const token = epoch.current;
    pending.current = true;
    setBusy(true);
    try {
      const result = await reconcilePortfolioMaintenanceConsent(
        consentRef.current,
      );
      if (live.current && token === epoch.current) {
        if (!('historical_binding' in result)) setConsent(null);
        setMessage(
          'historical_binding' in result
            ? 'Exact historical capture matches. Current consent UNKNOWN; send BLOCKED.'
            : 'Consent capture is UNKNOWN; prior evidence withheld. Send BLOCKED.',
        );
      }
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  const customers = [
      ...new Map(choices.map((c) => [c.customer_id, c])).values(),
    ],
    properties = [
      ...new Map(
        choices
          .filter((c) => !customer || c.customer_id === customer)
          .map((c) => [c.location_id, c]),
      ).values(),
    ],
    selectedCandidate = view?.candidates.find((c) => c.key === selected);
  return (
    <section
      className="portfolio-maintenance"
      role="region"
      aria-label="Multi-job maintenance and renewal"
    >
      <div className="pm-header">
        <div>
          <p className="pm-eyebrow">GROWTH · VERIFIED SOURCE REVIEW</p>
          <h2>Maintenance and renewal desk</h2>
          <p>
            Upcoming service opportunities across the same company’s admitted
            jobs and properties.
          </p>
        </div>
        <span className="pm-badge">Sending BLOCKED</span>
      </div>
      <p className="pm-boundary">
        Available published findings and recorded recurrence plans only. A
        planning candidate is not enrollment, a contract, repair completion or
        permission to contact a customer. Renewal terms and complete history
        remain UNKNOWN.
      </p>
      <div className="pm-card">
        <div className="pm-fields">
          <label>
            Maintenance from
            <input
              type="date"
              value={from}
              onChange={(e) => {
                invalidate();
                setFrom(e.target.value);
              }}
            />
          </label>
          <label>
            Maintenance through
            <input
              type="date"
              value={through}
              onChange={(e) => {
                invalidate();
                setThrough(e.target.value);
              }}
            />
          </label>
          <label>
            Search maintenance evidence
            <input
              type="search"
              value={query}
              onChange={(e) => {
                invalidate();
                setQuery(e.target.value);
              }}
            />
          </label>
          <label>
            Customer filter
            <select
              value={customer}
              onChange={(e) => {
                invalidate();
                setCustomer(e.target.value);
                setProperty('');
                setJob('');
              }}
            >
              <option value="">All admitted customers</option>
              {customers.map((c) => (
                <option key={c.customer_id} value={c.customer_id}>
                  {c.customer_label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Property filter
            <select
              value={property}
              onChange={(e) => {
                invalidate();
                setProperty(e.target.value);
                setJob('');
              }}
            >
              <option value="">All admitted properties</option>
              {properties.map((p) => (
                <option key={p.location_id} value={p.location_id}>
                  {p.property_label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Maintenance job filter
            <select
              value={job}
              onChange={(e) => {
                invalidate();
                setJob(e.target.value);
              }}
            >
              <option value="">All admitted jobs</option>
              {choices
                .filter(
                  (c) =>
                    (!customer || c.customer_id === customer) &&
                    (!property || c.location_id === property),
                )
                .map((j) => (
                  <option key={j.job_id} value={j.job_id}>
                    {j.customer_label} · {j.job_title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Candidate type
            <select
              value={kind}
              onChange={(e) => {
                invalidate();
                setKind(e.target.value as typeof kind);
              }}
            >
              <option value="all">All recorded types</option>
              <option value="inspection_occurrence">
                Recurring inspection
              </option>
              <option value="staff_follow_up">Staff follow-up</option>
            </select>
          </label>
          <label>
            Staff planning filter
            <select
              value={readiness}
              onChange={(e) => {
                invalidate();
                setReadiness(e.target.value as typeof readiness);
              }}
            >
              <option value="all">All planning states</option>
              <option value="preparable">Eligible for staff review only</option>
              <option value="blocked">Blocked for staff planning</option>
            </select>
          </label>
        </div>
        <details>
          <summary>Review horizon and historical channel settings</summary>
          <div className="pm-fields">
            <label>
              Review as-of instant
              <input
                value={asOf}
                onChange={(e) => {
                  invalidate();
                  setAsOf(e.target.value);
                }}
              />
            </label>
            <label>
              Historical channel
              <select
                value={channel}
                onChange={(e) => {
                  invalidate();
                  setChannel(e.target.value as typeof channel);
                }}
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
            </label>
            <label>
              Lead days
              <input
                type="number"
                min={0}
                max={30}
                value={lead}
                onChange={(e) => {
                  invalidate();
                  setLead(Number(e.target.value));
                }}
              />
            </label>
            <label>
              Overdue review days
              <input
                type="number"
                min={0}
                max={93}
                value={overdue}
                onChange={(e) => {
                  invalidate();
                  setOverdue(Number(e.target.value));
                }}
              />
            </label>
          </div>
        </details>
        <label className="pm-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => {
              setConfirmed(e.target.checked);
              if (!e.target.checked) invalidate();
            }}
          />
          I confirm this is a staff planning review only.
        </label>
        <button
          disabled={!confirmed || busy || unknown}
          onClick={() => void load()}
        >
          {busy ? 'Reviewing sources…' : 'Review upcoming maintenance'}
        </button>
        {hasRetained && (
          <button disabled={busy} onClick={() => void reconcile()}>
            Check retained maintenance sources
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {view && (
        <>
          <h3 ref={heading} tabIndex={-1}>
            Upcoming evidence · {view.matching_jobs} of {view.available_jobs}{' '}
            admitted jobs
          </h3>
          <p>
            {view.matching_occurrences} matching of {view.available_occurrences}{' '}
            available occurrences · {view.matching_findings} matching of{' '}
            {view.available_findings} available published findings. Counts are
            not complete history.
          </p>
          <div className="pm-columns">
            <div>
              <h4>Recurring service and follow-up</h4>
              {!view.candidates.length && (
                <p className="pm-empty">
                  No matching available maintenance occurrences. No renewal or
                  repair status can be inferred.
                </p>
              )}
              {view.candidates.map((row) => (
                <article className="pm-card" key={row.key}>
                  <p className="pm-eyebrow">
                    {row.selection.kind.replaceAll('_', ' ')} ·{' '}
                    {row.selection.due_on}
                  </p>
                  <h5>{row.context.customer_label}</h5>
                  <p>
                    {row.context.property_label} · {row.context.job_title}
                  </p>
                  <p>{row.plan_name}</p>
                  <p>
                    Staff planning: {row.planning_status.replaceAll('_', ' ')}.{' '}
                    {row.staff_planning_eligible
                      ? 'Eligible for staff review only.'
                      : 'Not eligible for visit-proposal preparation.'}
                  </p>
                  <p>
                    {row.exact_visits.length} exact recorded visit(s). Physical
                    completion unverified.
                  </p>
                  <button disabled={busy} onClick={() => void open(row.key)}>
                    Open exact occurrence source
                  </button>
                  <button disabled={busy} onClick={() => choose(row.key)}>
                    Inspect consent gates
                  </button>
                </article>
              ))}
            </div>
            <div>
              <h4>Published property concerns</h4>
              {!view.findings.length && (
                <p className="pm-empty">
                  No matching available published findings. Absence does not
                  prove repair.
                </p>
              )}
              {view.findings.map((row) => (
                <article className="pm-card" key={row.key}>
                  <p className="pm-eyebrow">
                    REPORTED {row.reported_severity} · {row.category}
                  </p>
                  <h5>{row.context.customer_label}</h5>
                  <p>
                    {row.context.property_label} · {row.location}
                  </p>
                  <p>
                    <strong>Observation:</strong> {row.observation}
                  </p>
                  <p>
                    <strong>Recommendation:</strong> {row.recommendation}
                  </p>
                  <p>
                    Report {row.source.report_id} · published version{' '}
                    {row.source.report_version}. Physical completion UNVERIFIED.
                  </p>
                  <button disabled={busy} onClick={() => void open(row.key)}>
                    Open exact published finding
                  </button>
                </article>
              ))}
            </div>
          </div>
          {selectedCandidate && (
            <div className="pm-card">
              <h4>Consent-at-send requirements · staff inspection only</h4>
              <p>
                {selectedCandidate.context.customer_label} ·{' '}
                {selectedCandidate.context.property_label} ·{' '}
                {selectedCandidate.selection.due_on}
              </p>
              <label>
                Requested follow-up purpose
                <select
                  value={purpose}
                  onChange={(e) => {
                    choose(selected);
                    setPurpose(e.target.value as typeof purpose);
                  }}
                >
                  <option value="recurring_maintenance">
                    Recurring maintenance
                  </option>
                  <option value="service_follow_up">Service follow-up</option>
                  <option value="marketing">Marketing</option>
                </select>
              </label>
              <label className="pm-check">
                <input
                  type="checkbox"
                  checked={consentConfirmed}
                  onChange={(e) => {
                    setConsentConfirmed(e.target.checked);
                    if (!e.target.checked && activeGate.current)
                      activeGate.current.confirmed = false;
                  }}
                />
                Inspect blocked requirements only; do not contact this customer.
              </label>
              <button
                disabled={busy || !consentConfirmed}
                onClick={() => void inspectConsent()}
              >
                Review send requirements
              </button>
              {consent && (
                <>
                  <p>
                    Current consent UNKNOWN · send BLOCKED. No recipient
                    endpoint is resolved.
                  </p>
                  {'missing_gates' in consent && (
                    <ul>
                      {consent.missing_gates.map((g) => (
                        <li key={g}>{g.replaceAll('_', ' ')}</li>
                      ))}
                    </ul>
                  )}
                  <button disabled={busy} onClick={() => void checkConsent()}>
                    Check exact consent capture
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
      {detail && (
        <div className="pm-card">
          <h3 ref={sourceHeading} tabIndex={-1}>
            Exact maintenance source evidence
          </h3>
          <p>
            {detail.customer_label} · {detail.property_label} ·{' '}
            {detail.job_title}
          </p>
          <dl>
            <dt>Job</dt>
            <dd>{detail.job_id}</dd>
            <dt>Issued source version</dt>
            <dd>{detail.issued_version_id}</dd>
            {Object.entries(detail.source).map(([key, value]) => (
              <div key={key}>
                <dt>{key.replaceAll('_', ' ')}</dt>
                <dd>
                  {value === null
                    ? 'Not recorded'
                    : typeof value === 'object'
                      ? JSON.stringify(value)
                      : String(value)}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            Navigation only. No new visit, agreement or customer communication.
          </p>
        </div>
      )}
      {!view && !busy && !error && (
        <p className="pm-empty">
          Confirm a bounded review window to inspect available recurring plans
          and published sources across the company.
        </p>
      )}
    </section>
  );
}
